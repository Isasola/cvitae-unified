"""Offline coverage for bounded, source-wide Automation Runtime V1."""
from __future__ import annotations

import sys
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from source_automation_runtime import (
    evaluate_runtime_row,
    freshness_from_evidence,
    operational_health_from_runs,
    summarize_runtime_rows,
)
from source_evidence import exact_live_observation_candidate, runtime_telemetry
from source_cleaners import get_profile
from opportunity_automation import evaluate_source_runtime_gate
import run_source_automation as runtime_runner


NOW = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)
PROFILE = get_profile("himalayas")
HEALTHY_RUN = {"run_id": "hima-live", "scraper_id": "himalayas_scraper", "status": "warning", "finished_at": NOW.isoformat(), "extraction_metrics": runtime_telemetry(provider_health="HEALTHY", coverage_complete=False, coverage_stop_reason="operational_limit", found=400, valid=398, processed=250, rejected=2, rejection_reasons={"generic_title": 2})}

health = operational_health_from_runs([HEALTHY_RUN], PROFILE, now=NOW)
assert health["status"] == "HEALTHY" and health["fresh"] is True
stale = operational_health_from_runs([{**HEALTHY_RUN, "finished_at": (NOW - timedelta(hours=PROFILE.freshness_ttl_hours + 1)).isoformat()}], PROFILE, now=NOW)
assert stale["status"] == "UNKNOWN" and stale["fresh"] is False
intentional_limit = operational_health_from_runs([HEALTHY_RUN], PROFILE, now=NOW)
assert intentional_limit["status"] == "HEALTHY", "coverage caps/minor rejects are not provider degradation"
for source, stop in (("weworkremotely", "rss_limit"), ("talentcom", "search_budget"), ("unjobs", "listing_page_budget")):
    profile = get_profile(source)
    shaped = {**HEALTHY_RUN, "scraper_id": f"{source}_scraper", "extraction_metrics": runtime_telemetry(provider_health="HEALTHY", coverage_complete=False, coverage_stop_reason=stop, found=12, valid=11, processed=10, rejected=1, rejection_reasons={"generic_title": 1})}
    assert operational_health_from_runs([shaped], profile, now=NOW)["status"] == "HEALTHY", f"{source} shared evidence shape"
PROFILE = get_profile("himalayas")
legacy_warning = operational_health_from_runs([{**HEALTHY_RUN, "extraction_metrics": {"health": {"status": "WARNING"}}}], PROFILE, now=NOW)
assert legacy_warning["status"] == "UNKNOWN" and legacy_warning["reason_codes"] == ["LEGACY_WARNING_UNCLASSIFIED"]
degraded = operational_health_from_runs([{**HEALTHY_RUN, "extraction_metrics": runtime_telemetry(provider_health="DEGRADED", coverage_complete=False, coverage_stop_reason="rate_limited", found=10, valid=10, provider_error="http_429")}], PROFILE, now=NOW)
assert degraded["status"] == "DEGRADED"
unhealthy = operational_health_from_runs([{**HEALTHY_RUN, "status": "failed"}], PROFILE, now=NOW)
assert unhealthy["status"] == "UNHEALTHY"
assert operational_health_from_runs([], PROFILE, now=NOW)["status"] == "UNKNOWN"

candidate = exact_live_observation_candidate(source="himalayas", opportunity_id="row-1", adapter_version="himalayas:v2.0.0", canonical_url="https://himalayas.app/companies/acme/jobs/backend", run_id="run-1", observed_at=NOW.isoformat())
assert candidate.identity_status == "IDENTITY_CONFIRMED" and candidate.http_status == 200

BASE = {
    "id": "row-1", "source": "himalayas", "title": "Backend Engineer", "organization": "Acme",
    "description": "A complete role description with concrete responsibilities and requirements. " * 3,
    "application_url": "https://himalayas.app/companies/acme/jobs/backend", "source_url": "https://himalayas.app/companies/acme/jobs/backend",
    "source_authority": "aggregator", "original_source_verified": False, "factory_status": "pending",
    "remote": True, "remote_scope": "COUNTRY_SPECIFIC", "eligible_countries": ["PY"], "eligible_regions": [],
    "embedding": None, "deadline": None, "opportunity_type": "job",
}
LIVE = {"identity_status": "IDENTITY_CONFIRMED", "http_status": 200, "observed_at": NOW.isoformat()}
assert freshness_from_evidence(BASE, LIVE, PROFILE, now=NOW)["state"] == "FRESH"
assert freshness_from_evidence(BASE, {**LIVE, "observed_at": (NOW - timedelta(hours=PROFILE.freshness_ttl_hours + 1)).isoformat()}, PROFILE, now=NOW)["state"] == "STALE"
assert freshness_from_evidence(BASE, None, PROFILE, now=NOW)["state"] == "UNKNOWN"
assert freshness_from_evidence({**BASE, "deadline": "2020-01-01"}, LIVE, PROFILE, now=NOW)["state"] == "EXPIRED"
assert freshness_from_evidence(BASE, {"identity_status": "REMOVED", "http_status": 404, "observed_at": NOW.isoformat()}, PROFILE, now=NOW)["state"] == "HARD_DEAD"
assert freshness_from_evidence(BASE, {"identity_status": "NETWORK_TRANSIENT", "http_status": 0, "observed_at": NOW.isoformat()}, PROFILE, now=NOW)["state"] == "UNKNOWN"
assert freshness_from_evidence(BASE, {"identity_status": "RATE_LIMITED", "http_status": 429, "observed_at": NOW.isoformat()}, PROFILE, now=NOW)["state"] == "UNKNOWN"
assert freshness_from_evidence(BASE, {"identity_status": "UPSTREAM_5XX", "http_status": 503, "observed_at": NOW.isoformat()}, PROFILE, now=NOW)["state"] == "UNKNOWN"

policy = {"source_policy_available": True, "source_enabled": True, "certified": True, "auto_enabled": False, "operational_health": "HEALTHY", "health_fresh": True, "health_observed_at": NOW.isoformat(), "health_source": "scraper_runs", "matching_enabled": True, "catalog_enabled": True, "alerts_enabled": True, "seo_enabled": True}
output = evaluate_runtime_row(BASE, PROFILE, LIVE, policy, now=NOW)
assert output["actual"]["decision"] == "HOLD"
assert output["actual"]["reason_codes"] == ("SOURCE_NOT_AUTO_ENABLED",)
assert output["would_auto_promote_if_enabled"] is True
assert output["embedding_allowed_now"] is False
assert output["embedding_candidate"] is True

unresolved = evaluate_runtime_row({**BASE, "id": "row-2", "eligible_countries": []}, PROFILE, LIVE, policy, now=NOW)
assert unresolved["would_auto_promote_if_enabled"] is False
expired = evaluate_runtime_row({**BASE, "id": "row-3", "deadline": "2020-01-01"}, PROFILE, LIVE, policy, now=NOW)
assert expired["would_auto_promote_if_enabled"] is False
health_bad = evaluate_runtime_row(BASE, PROFILE, LIVE, {**policy, "auto_enabled": True, "operational_health": "UNHEALTHY"}, now=NOW)
assert health_bad["would_auto_promote_if_enabled"] is False
disabled = evaluate_source_runtime_gate(PROFILE, health, {**policy, "auto_enabled": True, "source_enabled": False})
assert disabled.action == "BLOCK" and disabled.reason_codes == ("SOURCE_DISABLED",)
unknown_policy = evaluate_source_runtime_gate(PROFILE, health, {**policy, "auto_enabled": True, "source_policy_available": False})
assert unknown_policy.action == "HOLD" and unknown_policy.reason_codes == ("SOURCE_POLICY_UNAVAILABLE",)

summary = summarize_runtime_rows([output, {**output, "id": "row-4"}, {**output, "id": "row-5"}])
cluster = next(item for item in summary["exception_clusters"] if item["reason_code"] == "SOURCE_NOT_AUTO_ENABLED")
assert cluster["count"] == 3 and len(cluster["samples"]) == 3
assert summary["embedding_candidates"] == 0
assert summary["embedding_candidates_if_auto_enabled"] == 3

# The CLI runtime consumes source pages in bounded batches, excludes unrelated
# factory states, and never needs a manual ID list to form a systemic cluster.
pages = {
    0: [{**BASE, "id": "scan-1"}, {**BASE, "id": "skip-1", "factory_status": "complete"}],
    2: [{**BASE, "id": "scan-2"}, {**BASE, "id": "skip-2", "factory_status": "complete"}],
    4: [],
}
with patch.object(runtime_runner, "_source_policy", return_value={"source_policy_available": True, "source_enabled": True}), \
     patch.object(runtime_runner, "_recent_runs", return_value=[HEALTHY_RUN]), \
     patch.object(runtime_runner, "_count_source_rows", return_value=4), \
     patch.object(runtime_runner, "_latest_observations", side_effect=lambda _session, _source, ids: {item: LIVE for item in ids}), \
     patch.object(runtime_runner, "_fetch_page", side_effect=lambda _session, _source, offset, _size: pages[offset]):
    runtime = runtime_runner.run("himalayas", limit=2, batch_size=2, max_runtime_seconds=60, explain=False, session=object())
assert runtime["total_source_rows"] == 4
assert runtime["rows_evaluated"] == 2
assert runtime["excluded"]["factory_status_not_automation_state"] == 2
assert runtime["scan_complete"] is False and runtime["stop_reason"] == "row_limit_reached"
assert runtime["decisions"]["HOLD"] == 2
assert runtime["would_auto_promote_if_enabled"] == 2

print("verify_source_automation_runtime: PASS")
