"""Focused offline checks for the autonomous source-maintenance loop."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers")); sys.path.insert(0, str(ROOT / "scripts"))

from source_adapters import AdapterResult
from source_cleaners import get_profile
from opportunity_quality import quality_signals_for
import source_scouts
import run_source_maintenance as maintenance
from source_reconciliation import diff_before_apply
from source_registry_v2 import emitted_ids_for, resolve_emitted_source


def row(index: int, *, match: bool = True) -> dict:
    native = str(100000 + index)
    return {"id": f"id-{index}", "source": "unjobs", "updated_at": f"2026-09-13T00:{index % 60:02d}:00+00:00", "title": "Role", "organization": None,
            "description": "", "location": None, "country_code": "WW", "onsite_country": None, "remote": None, "remote_scope": None,
            "eligible_countries": [], "eligible_regions": [], "value": None, "currency": None, "published_at": None, "deadline": None,
            "source_url": f"https://unjobs.org/vacancies/{native}", "application_url": f"https://unjobs.org/vacancies/{native}",
            "verification_status": "verified", "catalog_eligible": match, "match_eligible": match, "embedding": None, "deleted_at": None, "archived_at": None}


def result_for(item: dict, status: int = 200) -> AdapterResult:
    return AdapterResult(source="unjobs", adapter_version="unjobs:v2.0.0", source_url=item["source_url"], source_native_id=item["source_url"].rsplit("/", 1)[-1], canonical_url=item["source_url"], apply_url=item["source_url"], title="Role", organization="UN Agency", description="x" * 120, location="Asunción, Paraguay", country_code="PY", onsite_country="PY", source_status=status, confidence=.99, evidence={"detail_match": True})


def offline_scout(source: str = "unjobs") -> source_scouts.ScoutSnapshot:
    return source_scouts.ScoutSnapshot(source, "fixture", frozenset(), frozenset(), {"absence_is_not_death": True})


def test_loop_and_breakers() -> None:
    rows = [row(index) for index in range(120)]
    with patch.object(maintenance, "fetch_inventory", return_value=rows), patch.object(maintenance, "recent_enrichments", return_value={}), patch.object(maintenance, "recent_observations", return_value=({}, True)), patch.object(maintenance, "scout_source", side_effect=lambda source, strategy: offline_scout(source)), patch.object(maintenance, "retry_detail", side_effect=lambda source, item: result_for(item)):
        summary = maintenance.process_source("unjobs", False, 50, None, None, False, False)
    assert summary["processed"] == 120 and summary["queue_remaining"] == 0
    assert summary["selection"]["p0"] == 120
    profile = get_profile("unjobs")
    dead_plans = [(row(i), result_for(row(i), 410), {}, type("I", (), {"status": "REMOVED"})()) for i in range(25)]
    assert maintenance.circuit_breaker(profile, dead_plans) is None, "hard-dead rate must not trip parser breaker"
    failed_plans = [(row(i), result_for(row(i), 200), {}, type("I", (), {"status": "IDENTITY_CONFIRMED"})()) for i in range(6)]
    for _, item, _, _ in failed_plans:
        item.title = None
    assert maintenance.circuit_breaker(profile, failed_plans) == "parser_failure_rate"
    with patch.object(maintenance, "fetch_inventory", return_value=rows), patch.object(maintenance, "recent_enrichments", return_value={}), patch.object(maintenance, "recent_observations", return_value=({}, True)), patch.object(maintenance, "scout_source", side_effect=lambda source, strategy: offline_scout(source)), patch.object(maintenance, "retry_detail", side_effect=lambda source, item: result_for(item)):
        partial = maintenance.process_source("unjobs", False, 50, 75, None, False, False)
    assert partial["processed"] == 75 and partial["queue_remaining"] == 45


def test_profiles_and_embedding_plan() -> None:
    assert get_profile("unjobs").auto_enabled is True
    assert all(not get_profile(source).auto_enabled for source in ("himalayas", "talentcom", "weworkremotely"))
    assert get_profile("empleapy_mtess").adapter is None, "small registry sources must remain visible"
    assert resolve_emitted_source("cc_atento").source == "callcenters"
    assert "cc_atento" in emitted_ids_for("callcenters")
    assert not get_profile("himalayas").auto_enabled
    assert get_profile("unjobs").source_family == "international_opportunity_portal"
    assert maintenance.reconcile_embeddings(["x"], apply=False) == {"invalidated": 1, "regenerated": 0, "failed": 0}
    previous = os.environ.get("SUPABASE_URL")
    os.environ["SUPABASE_URL"] = "http://127.0.0.1:54321"
    try:
        try:
            maintenance.assert_remote_apply()
        except RuntimeError as exc:
            assert "requires_remote" in str(exc)
        else:
            raise AssertionError("local apply was not refused")
    finally:
        if previous is None: os.environ.pop("SUPABASE_URL", None)
        else: os.environ["SUPABASE_URL"] = previous

    # Certification and AUTO are deliberately separate: Himalayas is now
    # certified from live evidence, but maintenance remains fail-closed while
    # its profile is explicitly AUTO-disabled.
    himalayas = get_profile("himalayas")
    assert maintenance.certification(himalayas)["certified"] is True
    assert himalayas.auto_enabled is False
    try:
        maintenance.assert_apply_authorized(himalayas)
    except RuntimeError as exc:
        assert str(exc) == "source_auto_not_enabled:himalayas"
    else:
        raise AssertionError("certification alone authorized Himalayas APPLY")
    try:
        maintenance.assert_apply_authorized(replace(himalayas, auto_enabled=True, certification=()))
    except RuntimeError as exc:
        assert str(exc) == "source_not_certified:himalayas"
    else:
        raise AssertionError("uncertified source authorized APPLY")


def test_recent_hard_dead_still_reaches_policy_lane() -> None:
    item = row(1)
    observation = {"identity_status": "REMOVED", "http_status": 410, "observed_at": datetime.now(timezone.utc).isoformat()}
    with patch.object(maintenance, "fetch_inventory", return_value=[item]), patch.object(maintenance, "recent_enrichments", return_value={}), patch.object(maintenance, "recent_observations", return_value=({item["id"]: observation}, True)), patch.object(maintenance, "scout_source", side_effect=lambda source, strategy: offline_scout(source)):
        summary = maintenance.process_source("unjobs", False, 50, None, None, False, False)
    assert summary["hard_dead_pending"] == 1
    assert summary["processed"] == 0, "TTL must avoid a duplicate detail fetch"


def test_concurrent_path_preserves_reference_decisions() -> None:
    rows = [row(index) for index in range(4)]
    sequential = []
    for item in rows:
        detail = result_for(item)
        identity = maintenance.confirm_identity("unjobs", item, detail)
        sequential.append((identity.status, maintenance.changed_patch(detail, item, identity), detail.recommendation))
    with patch.object(maintenance, "retry_detail", side_effect=lambda source, item: result_for(item)):
        with maintenance.ThreadPoolExecutor(max_workers=4) as pool:
            details = list(pool.map(lambda item: maintenance.retry_detail("unjobs", item), rows))
    concurrent = []
    for item, detail in zip(rows, details):
        identity = maintenance.confirm_identity("unjobs", item, detail)
        concurrent.append((identity.status, maintenance.changed_patch(detail, item, identity), detail.recommendation))
    assert concurrent == sequential, "concurrency may change timing, never decision result"


def test_kind_quality_and_scout_contract() -> None:
    scholarship = {"opportunity_type": "scholarship", "title": "Beca", "organization": "Provider", "description": "x" * 120, "application_url": "https://example.test/apply", "source_url": "https://example.test/detail", "country_code": None, "location": None}
    assert "bad_country" not in quality_signals_for(scholarship)
    job = {**scholarship, "opportunity_type": "job"}
    assert {"bad_country", "missing_or_weak_location"}.issubset(quality_signals_for(job))
    for source, strategy in (("unjobs", "unjobs_listing"), ("himalayas", "himalayas_api"), ("weworkremotely", "wwr_rss"), ("talentcom", "talent_listing")):
        with patch.object(source_scouts, {"unjobs": "scout_unjobs", "himalayas": "scout_himalayas", "weworkremotely": "scout_wwr", "talentcom": "scout_talentcom"}[source], return_value=source_scouts.ScoutSnapshot(source, strategy, frozenset({"id"}), frozenset({"https://example.test/detail"}), {"absence_is_not_death": True})):
            snapshot = source_scouts.scout_source(source, strategy)
        assert snapshot.native_ids == {"id"} and snapshot.metadata["absence_is_not_death"] is True


def test_diff_before_apply() -> None:
    item = row(1)
    detail = result_for(item)
    identity = maintenance.confirm_identity("unjobs", item, detail)
    patch = maintenance.changed_patch(detail, item, identity)
    diff = diff_before_apply([(item, detail, patch, identity)])
    assert diff["rows_changed"] == 1 and diff["location_changes"] == 1 and diff["semantic_fingerprints_invalidated"] == 1


def test_maintenance_trigger_contract() -> None:
    class Response:
        ok = True
        status_code = 201
        text = ""
        def raise_for_status(self): pass
    summary = {"source": "unjobs", "health": {"status": "HEALTHY"}, "started_at": "2026-01-01T00:00:00+00:00", "finished_at": "2026-01-01T00:00:01+00:00", "duration_seconds": 11.69, "processed": 1, "live": 1, "adapter_version": "v2"}
    for event, expected in (("schedule", "schedule"), ("workflow_dispatch", "manual"), ("push", "local")):
        with patch.dict(os.environ, {"GITHUB_EVENT_NAME": event, "SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_SERVICE_ROLE_KEY": "test"}), patch.object(maintenance.requests, "post", return_value=Response()) as post:
            maintenance.persist_maintenance_run(summary)
        assert post.call_args.kwargs["json"]["trigger_type"] == expected
        assert post.call_args.kwargs["json"]["duration_seconds"] == 12


def test_telemetry_failure_is_not_execution_failure() -> None:
    class FailedResponse:
        ok = False
        status_code = 400
        text = 'invalid input syntax for type integer: "14.05"'
    summary = {"source": "unjobs", "health": {"status": "HEALTHY"}, "started_at": "2026-01-01T00:00:00+00:00", "finished_at": "2026-01-01T00:00:14+00:00", "duration_seconds": 14.05, "processed": 1, "live": 1, "adapter_version": "v2", "execution_status": "SUCCESS", "changes_applied": True}
    with patch.dict(os.environ, {"SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_SERVICE_ROLE_KEY": "test"}), patch.object(maintenance.requests, "post", return_value=FailedResponse()) as post:
        result = maintenance.persist_maintenance_run(summary)
    assert result["telemetry_status"] == "FAILED"
    assert summary["execution_status"] == "SUCCESS" and summary["changes_applied"] is True
    assert post.call_args_list[0].kwargs["json"]["duration_seconds"] == 14
    assert post.call_args_list[1].kwargs["json"]["action"] == "maintenance_telemetry"


def test_retry_telemetry_does_not_reprocess() -> None:
    class Response:
        ok = True
        status_code = 201
        text = ""
    summary = {"source": "unjobs", "health": {"status": "HEALTHY"}, "started_at": "2026-01-01T00:00:00+00:00", "finished_at": "2026-01-01T00:00:14+00:00", "duration_seconds": 14.05, "processed": 1, "live": 1, "adapter_version": "v2", "telemetry_run_id": "retryable-run"}
    with patch.dict(os.environ, {"SUPABASE_URL": "http://127.0.0.1:54321", "SUPABASE_SERVICE_ROLE_KEY": "test"}), patch.object(maintenance.requests, "post", return_value=Response()) as post:
        result = maintenance.retry_maintenance_telemetry(summary)
    assert result["telemetry_status"] == "PERSISTED"
    assert post.call_args.kwargs["json"]["run_id"] == "retryable-run"


def main() -> int:
    test_loop_and_breakers(); test_profiles_and_embedding_plan(); test_recent_hard_dead_still_reaches_policy_lane(); test_concurrent_path_preserves_reference_decisions(); test_diff_before_apply(); test_maintenance_trigger_contract(); test_telemetry_failure_is_not_execution_failure(); test_retry_telemetry_does_not_reprocess()
    print("verify_source_maintenance: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
