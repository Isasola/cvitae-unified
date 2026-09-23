"""Offline liveness, work-conservation, soak and CPU benchmark for Factory."""
from __future__ import annotations

import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scrapers.opportunity_sink import CONTENT_FINGERPRINT_FIELDS, SEMANTIC_FINGERPRINT_FIELDS, _fingerprint, normalize_opportunity
from scripts.opportunity_factory import FactoryClient, seal, should_generate_embedding, should_generate_embedding_in_run, structural_lane_minimums

NOW = datetime(2026, 9, 21, 12, tzinfo=timezone.utc)
STRUCTURAL_LIMIT = 100
EMBEDDING_LIMIT = 20


class Response:
    def __init__(self, rows: list[dict[str, Any]], total: int | None = None) -> None:
        self._rows = rows
        self.headers = {"content-range": f"0-0/{total}"} if total is not None else {}

    def raise_for_status(self) -> None:
        return None

    def json(self) -> list[dict[str, Any]]:
        return self._rows


class FairSession:
    """Small PostgREST-shaped in-memory transport; Factory selection is real."""
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def get(self, _url: str, *, headers: dict[str, str], params: dict[str, str], **_kwargs: Any) -> Response:
        structural = params.get("factory_status") == "in.(pending,failed)"
        if structural:
            candidates = [row for row in self.rows if row["factory_status"] in {"pending", "failed"} and row["verification_status"] in {"pending", "in_review", "verified"} and row.get("deleted_at") is None and row.get("archived_at") is None]
            updated = params.get("updated_at", "")
            if updated.startswith("gte."):
                candidates = [row for row in candidates if row.get("updated_at") is not None and row["updated_at"] >= updated[4:]]
            elif params.get("or", "").startswith("(updated_at.lt."):
                cutoff = params["or"].split("updated_at.lt.", 1)[1].split(",", 1)[0]
                candidates = [row for row in candidates if row.get("updated_at") is None or row["updated_at"] < cutoff]
        else:
            candidates = [row for row in self.rows if row["factory_status"] == "ready" and row["verification_status"] == "verified" and row["is_active"] is True and row["match_eligible"] is True and row.get("embedding") is None and row.get("deleted_at") is None and row.get("archived_at") is None]
        if headers.get("Prefer") == "count=exact":
            return Response(candidates[:1], len(candidates))
        candidates.sort(key=lambda row: (row.get("updated_at") or "", row["id"]), reverse=params.get("order", "").startswith("updated_at.desc"))
        return Response(candidates[: int(params["limit"])])


def structural_row(row_id: str, updated_at: str | None, *, verification: str = "verified", failed: bool = False) -> dict[str, Any]:
    return {
        "id": row_id, "updated_at": updated_at, "factory_status": "failed" if failed else "pending", "verification_status": verification,
        "is_active": False, "match_eligible": False, "embedding": None, "deleted_at": None, "archived_at": None,
        "title": "Programme Officer", "organization": "Aggregator" if verification == "in_review" else "Fixture Org",
        "description": "Programme delivery, reporting, partnerships and monitoring. " * 3,
        "application_url": "https://example.org/apply", "opportunity_type": "job",
        "source_authority": "aggregator" if verification == "in_review" else "original", "original_source_verified": verification != "in_review", "country_code": "PY",
    }


def embedding_row(row_id: str) -> dict[str, Any]:
    return {**structural_row(row_id, "2026-08-01T00:00:00+00:00"), "factory_status": "ready", "verification_status": "verified", "is_active": True, "match_eligible": True}


def factory_for(rows: list[dict[str, Any]]) -> FactoryClient:
    client = FactoryClient.__new__(FactoryClient)
    client.base, client.headers, client.session = "https://fixture.invalid/rest/v1", {}, FairSession(rows)
    client.last_lane_selection = {"fresh": [], "backlog": [], "embedding": []}
    client.last_lane_borrowed = {"fresh": 0, "backlog": 0, "embedding": 0}
    client.last_queue_before = {}
    return client


def select(rows: list[dict[str, Any]], *, now: datetime = NOW) -> tuple[FactoryClient, list[dict[str, Any]]]:
    client = factory_for(rows)
    return client, client.candidates(STRUCTURAL_LIMIT, embedding_limit=EMBEDDING_LIMIT, now=now)


# Work conservation: an empty lane lends capacity without eroding another lane's minimum.
only_backlog = [structural_row(f"old-{index:05d}", "2026-01-01T00:00:00+00:00") for index in range(10_000)]
client, selected = select(only_backlog)
assert len(selected) == 100 and len(client.last_lane_selection["backlog"]) == 100
assert client.last_lane_borrowed == {"fresh": 0, "backlog": 75, "embedding": 0}

five_fresh = [structural_row(f"fresh-{index}", "2026-09-21T11:00:00+00:00") for index in range(5)] + only_backlog
client, selected = select(five_fresh)
assert len(selected) == 100 and len(client.last_lane_selection["fresh"]) == 5 and len(client.last_lane_selection["backlog"]) == 95
assert client.last_lane_borrowed["backlog"] == 70

# Incident-shaped universe: each non-empty lane progresses and no ID repeats.
rows = [structural_row(f"old-{index:05d}", "2026-01-01T00:00:00+00:00") for index in range(10_036)]
rows.append(structural_row("old-null-updated-at", None))
rows.extend(structural_row(f"fresh-{index:05d}", "2026-09-21T11:00:00+00:00") for index in range(10_000))
rows.append(structural_row("fresh-failed", "2026-09-21T10:30:00+00:00", failed=True))
rows.append(structural_row("fresh-aggregator", "2026-09-21T10:45:00+00:00", verification="in_review"))
rows.extend(embedding_row(f"embed-{index:03d}") for index in range(100))
rows.extend([{**embedding_row("embed-inactive"), "is_active": False}, {**embedding_row("embed-unmatched"), "match_eligible": False}])
client, selected = select(rows)
lanes = client.last_lane_selection
assert structural_lane_minimums(STRUCTURAL_LIMIT) == {"fresh": 25, "backlog": 25, "embedding": 0}
assert len(selected) == 120 and {key: len(value) for key, value in lanes.items()} == {"fresh": 25, "backlog": 75, "embedding": 20}
assert len({str(row["id"]) for row in selected}) == 120 and client.last_lane_borrowed == {"fresh": 0, "backlog": 50, "embedding": 0}
assert client.last_queue_before["structural_backlog_pending"] == 10_037
assert "fresh-failed" in lanes["fresh"] and "fresh-aggregator" in lanes["fresh"]
assert "embed-inactive" not in lanes["embedding"] and "embed-unmatched" not in lanes["embedding"]
aggregator = next(row for row in rows if row["id"] == "fresh-aggregator")
status, _stamps, _evidence = seal(aggregator, NOW)
assert aggregator["verification_status"] == "in_review" and aggregator["is_active"] is False and status == "ready"
assert not should_generate_embedding(aggregator, status, dry_run=False)
assert should_generate_embedding(next(row for row in rows if row["id"] == "embed-000"), "ready", dry_run=False)

# A newly ingested match candidate crosses stages in separate executions. It
# may be structural in cycle N and embedding in N+1, but never twice in a
# stage after a successful commit.
lifecycle = structural_row("lifecycle-row", NOW.isoformat())
lifecycle.update({"is_active": True, "match_eligible": True, "verification_status": "verified"})
lifecycle_client, first_cycle = select([lifecycle], now=NOW)
assert [row["id"] for row in first_cycle] == ["lifecycle-row"]
assert lifecycle_client.last_lane_selection["fresh"] == ["lifecycle-row"]
lifecycle_status, _stamps, _evidence = seal(lifecycle, NOW)
assert lifecycle_status == "ready"
assert not should_generate_embedding_in_run(lifecycle, lifecycle_status, dry_run=False, embedding_lane_ids=set())
lifecycle["factory_status"] = "ready"  # successful structural atomic commit
second_client, second_cycle = select([lifecycle], now=NOW + timedelta(hours=1))
assert [row["id"] for row in second_cycle] == ["lifecycle-row"]
assert second_client.last_lane_selection["embedding"] == ["lifecycle-row"]
assert should_generate_embedding_in_run(lifecycle, "ready", dry_run=False, embedding_lane_ids={"lifecycle-row"})
lifecycle["embedding"] = [0.0]  # successful embedding atomic commit
third_client, third_cycle = select([lifecycle], now=NOW + timedelta(hours=2))
assert not third_cycle and all(not values for values in third_client.last_lane_selection.values())
lifecycle_accounting = {
    "structural_unique_rows_processed": 1,
    "embedding_unique_rows_processed": 1,
    "rows_processed_in_both_stages": 1,
    "illegal_same_stage_reprocess": 0,
    "never_selected_structural_pending": 0,
    "never_selected_embedding_pending": 0,
}


def run_soak(name: str, arrivals: Callable[[int], int], *, cycles: int = 120) -> dict[str, int]:
    """Repeated real selection plus in-memory commit effects; no row disappears."""
    current = NOW
    work = [structural_row(f"{name}-old-{index:05d}", "2026-01-01T00:00:00+00:00") for index in range(10_036)]
    historical_ids = {row["id"] for row in work}
    structural_processed: set[str] = set()
    embedding_processed: set[str] = set()
    fresh_created_cycle: dict[str, int] = {}
    previous_backlog, borrowed, embedding_selected, fresh_selected = len(historical_ids), 0, 0, 0
    fresh_progress_cycles = 0
    starvation_events = {"fresh": 0, "backlog": 0, "embedding": 0}
    max_fresh_selected_age_hours = 0.0
    max_fresh_wait_cycles = 0
    row_level_starvation = 0
    illegal_same_stage_reprocess = 0
    for cycle in range(cycles):
        new_fresh = [structural_row(f"{name}-fresh-{cycle:03d}-{index:03d}", current.isoformat()) for index in range(arrivals(cycle))]
        work.extend(new_fresh)
        fresh_created_cycle.update({row["id"]: cycle for row in new_fresh})
        work.extend(embedding_row(f"{name}-embed-{cycle:03d}-{index:03d}") for index in range(30))
        fresh_before = sorted(
            [row for row in work if row["factory_status"] in {"pending", "failed"} and row.get("updated_at") is not None and row["updated_at"] >= (current - timedelta(hours=48)).isoformat()],
            key=lambda row: (row["updated_at"], row["id"]),
        )
        client, selected_rows = select(work, now=current)
        ids = [str(row["id"]) for row in selected_rows]
        structural_ids = set(client.last_lane_selection["fresh"] + client.last_lane_selection["backlog"])
        embedding_ids = set(client.last_lane_selection["embedding"])
        selected_fresh = client.last_lane_selection["fresh"]
        expected_fresh = [row["id"] for row in fresh_before[:len(selected_fresh)]]
        if selected_fresh != expected_fresh:
            row_level_starvation += 1
        assert selected_fresh == expected_fresh, f"fresh FIFO overtaken in {name} cycle {cycle}"
        for row_id in structural_ids:
            if row_id in structural_processed:
                illegal_same_stage_reprocess += 1
            structural_processed.add(row_id)
        for row_id in embedding_ids:
            if row_id in embedding_processed:
                illegal_same_stage_reprocess += 1
            embedding_processed.add(row_id)
        fresh_selected += len(client.last_lane_selection["fresh"])
        embedding_selected += len(client.last_lane_selection["embedding"])
        fresh_progress_cycles += int(bool(client.last_lane_selection["fresh"]))
        borrowed += sum(client.last_lane_borrowed.values())
        before = client.last_queue_before
        for key, lane in (("fresh", "structural_fresh_pending"), ("backlog", "structural_backlog_pending"), ("embedding", "embedding_pending")):
            if before[lane] and not client.last_lane_selection[key]:
                starvation_events[key] += 1
        for row in selected_rows:
            if row["id"] in client.last_lane_selection["fresh"] and row.get("updated_at"):
                selected_at = datetime.fromisoformat(row["updated_at"])
                max_fresh_selected_age_hours = max(max_fresh_selected_age_hours, (current - selected_at).total_seconds() / 3600)
                if row["id"] in fresh_created_cycle:
                    max_fresh_wait_cycles = max(max_fresh_wait_cycles, cycle - fresh_created_cycle[row["id"]])
        for row in selected_rows:
            if row["id"] in embedding_ids:
                row["embedding"] = [0.0]
            else:
                row["factory_status"] = "ready"  # successful seal does not alter active/verification
        remaining_old = sum(1 for row in work if row["id"] in historical_ids and row["factory_status"] in {"pending", "failed"})
        assert remaining_old <= previous_backlog, f"historical backlog increased in {name}"
        previous_backlog, current = remaining_old, current + timedelta(hours=1)
    pending = sum(1 for row in work if row["factory_status"] in {"pending", "failed"})
    embedding_pending = sum(1 for row in work if row["factory_status"] == "ready" and row["verification_status"] == "verified" and row["is_active"] is True and row["match_eligible"] is True and row.get("embedding") is None)
    accounted = sum(1 for row in work if row["factory_status"] in {"pending", "failed", "ready", "review", "blocked"})
    assert accounted == len(work)
    fresh_pending = [row for row in work if row["id"] in fresh_created_cycle and row["factory_status"] in {"pending", "failed"}]
    oldest_unprocessed_arrival_age_hours = max(((current - datetime.fromisoformat(row["updated_at"])).total_seconds() / 3600 for row in fresh_pending), default=0.0)
    return {"cycles": cycles, "historical_remaining": previous_backlog, "fresh_selected": fresh_selected, "fresh_progress_cycles": fresh_progress_cycles, "max_fresh_selected_age_hours": round(max_fresh_selected_age_hours, 3), "max_fresh_wait_cycles": max_fresh_wait_cycles, "oldest_unprocessed_arrival_age_hours": round(oldest_unprocessed_arrival_age_hours, 3), "embedding_selected": embedding_selected, "borrowed": borrowed, "starvation_events": sum(starvation_events.values()), "row_level_starvation": row_level_starvation, "structural_unique_rows_processed": len(structural_processed), "embedding_unique_rows_processed": len(embedding_processed), "rows_processed_in_both_stages": len(embedding_processed & structural_processed), "illegal_same_stage_reprocess": illegal_same_stage_reprocess, "never_selected_structural_pending": pending, "never_selected_embedding_pending": embedding_pending, "accounted": accounted, "total": len(work)}


soak = {
    "no_arrivals": run_soak("none", lambda _cycle: 0),
    "steady": run_soak("steady", lambda _cycle: 10),
    "bursty": run_soak("bursty", lambda cycle: 60 if cycle % 5 == 0 else 0),
    "heavy_fresh": run_soak("heavy", lambda _cycle: 60),
}
assert soak["no_arrivals"]["historical_remaining"] == 0
assert all(result["historical_remaining"] < 10_036 for result in soak.values())
assert all(result["embedding_selected"] == result["cycles"] * EMBEDDING_LIMIT for result in soak.values())
assert all(result["fresh_selected"] > 0 for key, result in soak.items() if key != "no_arrivals")
assert all(result["starvation_events"] == 0 for result in soak.values())
assert all(result["row_level_starvation"] == 0 and result["illegal_same_stage_reprocess"] == 0 for result in soak.values())


class CommitSession:
    def __init__(self) -> None:
        self.calls = 0

    def post(self, _url: str, **_kwargs: Any) -> Response:
        self.calls += 1
        return Response([])


def benchmark_structural(size: int) -> dict[str, float | int]:
    client = FactoryClient.__new__(FactoryClient)
    client.base, client.headers, client.session = "https://fixture.invalid/rest/v1", {}, CommitSession()
    start, now = time.perf_counter(), NOW
    for index in range(size):
        raw = {"title": f"Backend Engineer {index}", "organization": "Fixture Org", "description": "Python SQL APIs cloud testing observability distributed systems. " * 3, "application_url": f"https://example.org/{index}", "source": "factory_fixture", "source_authority": "original", "original_source_verified": True, "country_code": "PY", "location": "Asuncion", "opportunity_type": "job", "tags": ["Python", "SQL"]}
        row, error = normalize_opportunity(raw)
        assert row is not None and error is None
        status, stamps, evidence = seal(row, now)
        snapshot = {"content_fingerprint": _fingerprint(row, CONTENT_FINGERPRINT_FIELDS), "semantic_fingerprint": _fingerprint(row, SEMANTIC_FINGERPRINT_FIELDS), "pipeline_version": "benchmark", "rules_version": "benchmark", "status": status, "stamps": stamps, "evidence": evidence, "embedding_model": None, "embedding_status": "pending", "checked_at": now.isoformat()}
        client.commit({**row, "id": f"bench-{index}", "updated_at": now.isoformat()}, snapshot, None)
    elapsed = time.perf_counter() - start
    assert client.session.calls == size
    return {"rows": size, "elapsed_seconds": round(elapsed, 6), "per_row_ms": round(elapsed * 1000 / size, 4), "commit_calls": client.session.calls}


benchmark = [benchmark_structural(size) for size in (50, 100, 250, 500, 1000)]
assert benchmark[-1]["per_row_ms"] < 20, benchmark
print({"verifier": "factory_queue_fairness", "budgets": {"structural": STRUCTURAL_LIMIT, "embedding": EMBEDDING_LIMIT}, "lifecycle": lifecycle_accounting, "soak": soak, "benchmark": benchmark})
print("PASS verify_factory_queue_fairness: work-conserving fair structural lanes, independent embedding lane, multi-cycle no-starvation soak, real CPU/commit-boundary benchmark")
