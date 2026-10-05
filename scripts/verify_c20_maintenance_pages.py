"""Offline production-maintenance page/cursor tests. All IO is mocked locally."""
import copy
import os
from contextlib import ExitStack
from unittest.mock import patch
from types import SimpleNamespace
from dataclasses import replace

from verify_source_maintenance import row, result_for, offline_scout
import run_source_maintenance as maintenance
import run_opportunity_enrichment_batch as batch


class Fixture:
    def __init__(self, count=7):
        self.rows = [dict(row(i), id=f"id-{i:03}") for i in range(count)]
        self.records = []
        self.effects = []
        self.read_sizes = []
        self.cursors = []
        self.clock = 0
        self.stop_after_checkpoint = False

    def get(self, url, **kwargs):
        params = kwargs["params"]
        if url.endswith("/scraper_runs"):
            assert params["limit"] == "1"
            data = [{"extraction_metrics": self.records[-1]}] if self.records else []
        else:
            assert url.endswith("/opportunities") and "offset" not in params
            assert params["order"] == "id.asc" and int(params["limit"]) <= 5
            after = params.get("id", "gt.")[3:]
            self.cursors.append(after)
            data = [r for r in self.rows if r["id"] > after][:int(params["limit"])]
            self.read_sizes.append(len(data))
        return SimpleNamespace(json=lambda: copy.deepcopy(data), raise_for_status=lambda: None)

    def persist(self, summary):
        assert len(summary["maintenance_progress"]["completed_ids"]) <= summary["batch_budget"]
        self.records.append(copy.deepcopy(summary))
        if self.stop_after_checkpoint:
            self.clock = maintenance.MAX_RUNTIME_SECONDS + 1
            self.stop_after_checkpoint = False
        return {"telemetry_status": "PERSISTED", "telemetry_error": None}

    def observe(self, plans, **_kwargs):
        assert len(plans) <= 2
        for r, *_ in plans:
            assert r["id"] not in self.effects, "completed observation effects must not be replayed"
            self.effects.append(r["id"])
        return len(plans)

    def mocks(self):
        stack = ExitStack()
        for target, name, replacement in [
            (maintenance.requests, "get", self.get),
            (maintenance, "scout_source", lambda source, strategy: offline_scout(source)),
            (maintenance, "retry_detail", lambda source, item, *args: result_for(item)),
            (maintenance, "recent_enrichments", lambda source, now, opportunity_ids: {}),
            (maintenance, "recent_observations", lambda source, now, opportunity_ids: ({}, True)),
            (maintenance, "persist_maintenance_run", self.persist),
            (maintenance, "persist_observations", self.observe),
        ]:
            stack.enter_context(patch.object(target, name, replacement))
        stack.enter_context(patch.dict(os.environ, {"SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_SERVICE_ROLE_KEY": "offline"}))
        return stack

    def run(self, budget=2, apply=True, continuation=None, source="unjobs"):
        return maintenance.process_source(source, apply, 2, budget, None, False, False,
            observations_only=True, continuation=continuation)


f = Fixture()
with f.mocks():
    first = f.run()
    assert first["processed"] == 2 and first["maintenance_progress"]["resumable"]
    assert first["inventory_scope"] == "CURRENT_PAGE" and first["inventory_count_is_total"] is False
    second = f.run()
    assert f.cursors[:2] == ["", "id-001"] and second["processed"] == 2
    while not f.records[-1]["maintenance_progress"]["complete"]:
        assert f.run()["processed"] <= 2
assert len(f.effects) == 7 and len(set(f.effects)) == 7
assert max(f.read_sizes) <= 3, "only batch plus one lookahead held in memory"
assert f.cursors == ["", "id-001", "id-003", "id-005"]

# Runtime stops in the middle of a page: retain completed IDs and visit only the rest.
partial = Fixture(); partial.stop_after_checkpoint = True
with partial.mocks(), patch.object(maintenance.time, "monotonic", side_effect=lambda: partial.clock):
    first = partial.run(budget=4)
    assert first["processed"] == 2 and first["circuit_breaker"] == "runtime_ceiling"
    assert first["maintenance_progress"]["after_id"] is None
    assert set(first["maintenance_progress"]["completed_ids"]) == {"id-000", "id-001"}
    partial.clock = 0
    second = partial.run(budget=4)
    assert second["processed"] == 2 and second["maintenance_progress"]["after_id"] == "id-003"
    while not partial.records[-1]["maintenance_progress"]["complete"]:
        partial.run(budget=4)
assert len(partial.effects) == 7

# A queued detail fetch must not start after the deadline within the same chunk.
within = Fixture(count=4)
def slow_detail(source, item):
    within.clock = maintenance.MAX_RUNTIME_SECONDS + 1
    return result_for(item)
with within.mocks(), patch.object(maintenance.time, "monotonic", side_effect=lambda: within.clock), patch.object(maintenance, "retry_detail", side_effect=slow_detail), patch.object(maintenance, "get_profile", return_value=replace(maintenance.get_profile("unjobs"), min_workers=1, max_workers=1)):
    result = within.run(budget=4)
    assert result["processed"] == 1 and result["maintenance_progress"]["resumable"]
    assert result["maintenance_progress"]["completed_ids"] == ["id-000"]
within.clock = 0
with within.mocks():
    result = within.run(budget=4)
    assert result["maintenance_progress"]["complete"] and len(within.effects) == 4

# Dry runs do not write, and their returned cursor can be supplied explicitly.
dry = Fixture()
with dry.mocks():
    state = None; seen = 0
    for _ in range(4):
        result = dry.run(apply=False, continuation=state)
        seen += result["processed"]; state = result["maintenance_progress"]
    assert seen == 7 and state["complete"] and not dry.records

# Healthy/recent evidence exclusions visit the page without executing unchanged work.
fresh = Fixture()
with fresh.mocks(), patch.object(maintenance, "recent_enrichments", side_effect=lambda source, now, opportunity_ids: {i: now for i in opportunity_ids}):
    for _ in range(4):
        result = fresh.run()
        assert result["processed"] == 0
    assert result["maintenance_progress"]["complete"] and not fresh.effects

# Checkpoint outage stops before starting another chunk; preserve retry-only payload.
failed = Fixture()
with failed.mocks(), patch.object(maintenance, "persist_maintenance_run", return_value={"telemetry_status": "FAILED", "telemetry_error": "fixture", "telemetry_payload": {"retry": True}}):
    try:
        failed.run(budget=4)
    except RuntimeError as exc:
        assert "retry_telemetry_only" in str(exc)
    else:
        raise AssertionError("failed checkpoint must apply backpressure")
    assert len(failed.effects) == 2

# Himalayas maintenance never calls the helper's full DB inventory or multi-page API snapshot.
hima = Fixture(count=2)
api_calls = []
def api_page(limit, opportunity_id, *, start_cursor, max_pages, db_rows):
    assert len(db_rows) <= 2 and max_pages == 1
    api_calls.append(start_cursor)
    page_index = int(start_cursor or 0)
    pairs = [(r, {"fixture": True}) for r in db_rows if r["id"] == f"id-{page_index:03}"]
    complete = page_index >= 2
    return pairs, {"api_inventory_complete": complete, "api_error": None if complete else "page_budget_reached",
        "next_cursor_saved_expected": None if complete else str(page_index + 1)}
with hima.mocks(), patch.object(maintenance, "himalayas_current_rows", side_effect=api_page), patch.object(maintenance, "get_profile", return_value=replace(maintenance.get_profile("himalayas"), auto_enabled=True)):
    while not hima.records or not hima.records[-1]["maintenance_progress"]["complete"]:
        hima.run(source="himalayas")
assert api_calls == [None, "1"] and len(hima.effects) == 2

# Execute the direct helper as well: passing db_rows suppresses its legacy full-inventory query.
url = "https://himalayas.app/companies/fixture/jobs/fixture"
inventory = SimpleNamespace(jobs=[{"guid": url}], complete=True, error=None, records_seen=1,
    pages_seen=1, reported_total_count=1, duplicate_records=0, last_cursor_present=False,
    resume_cursor_used=False, next_cursor=None)
with patch.object(batch, "himalayas_db_inventory", side_effect=AssertionError("full DB snapshot forbidden")), patch.object(batch, "fetch_api_inventory", return_value=inventory) as fetch:
    pairs, metrics = batch.himalayas_current_rows(2, max_pages=1, db_rows=[{"id": "hima-row", "source_url": url}])
    assert len(pairs) == 1 and metrics["db_inventory"] == 1
    assert fetch.call_args.kwargs["max_pages"] == 1 and fetch.call_args.kwargs["page_size"] == 100

# Direct evidence helpers use only the current IDs, retaining default behavior for other callers.
responses = SimpleNamespace(status_code=200, raise_for_status=lambda: None, json=lambda: [])
with patch.dict(os.environ, {"SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_SERVICE_ROLE_KEY": "offline"}), patch.object(batch.requests, "post", return_value=responses) as post:
    batch.recent_enrichments("unjobs", opportunity_ids=["one", "two"])
    assert post.call_args.kwargs["json"] == {"p_opportunity_ids": ["one", "two"]}
    assert post.call_args.args[0].endswith("/rpc/latest_maintenance_enrichments")
    batch.recent_observations("unjobs", opportunity_ids=["one"])
    assert post.call_args.kwargs["json"] == {"p_opportunity_ids": ["one"]}
    assert post.call_args.args[0].endswith("/rpc/latest_opportunity_universe_observations")
print("PASS C20 maintenance: keyset 4 pages; durable automatic resume; runtime partial page; dedup; dry continuation; fresh skip; checkpoint backpressure; bounded Himalayas API/evidence")
