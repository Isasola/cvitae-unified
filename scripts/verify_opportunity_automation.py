"""Offline contract checks for Opportunity Automation Core V1."""
from __future__ import annotations

import sys
from dataclasses import replace
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from opportunity_automation import AUTO_PROMOTE, BLOCK, HOLD, HUMAN_REVIEW, cluster_automation_exceptions, evaluate_opportunity_automation_policy
from opportunity_factory import seal
from run_opportunity_automation import evaluate_rows
from source_cleaners.profiles import get_profile

BASE = {
    "id": "fixture", "source": "himalayas", "title": "Senior Backend Engineer",
    "organization": "Acme", "description": "Reliable role description with enough concrete responsibilities and requirements. " * 3,
    "application_url": "https://himalayas.app/companies/acme/jobs/backend",
    "location": "Remote", "remote": True, "remote_scope": "COUNTRY_SPECIFIC",
    "eligible_countries": ["PY"], "eligible_regions": [], "deadline": "2026-12-31",
    "opportunity_type": "job",
    "source_authority": "aggregator", "original_source_verified": False,
    "factory_status": "pending", "embedding": None,
    "freshness_state": "FRESH",
}
NOW = datetime(2026, 9, 14)
status, stamps, evidence = seal(BASE, NOW)
assert status == "ready", "aggregator provenance is evidence, not a structural factory review"
assert stamps["provenance"] == "review"

certified_auto = replace(get_profile("himalayas"), auto_enabled=True, certification=("live_validation",))
snapshot = {"status": status, "stamps": stamps, "evidence": evidence}
HEALTHY_POLICY = {"certified": True, "operational_health": "HEALTHY", "health_fresh": True, "catalog_enabled": True, "matching_enabled": True, "alerts_enabled": True, "seo_enabled": True}
decision = evaluate_opportunity_automation_policy(BASE, certified_auto, snapshot, source_policy=HEALTHY_POLICY, as_of=NOW.date())
assert decision.decision == AUTO_PROMOTE
assert decision.human_intervention_required is False
assert decision.downstream_gates["web_catalog"] is True
assert decision.downstream_gates["google_jobs"] is False
assert decision.downstream_gates["third_party_distribution"] is False
assert decision.downstream_gates["embedding"] is True
original = evaluate_opportunity_automation_policy({**BASE, "source_authority": "original", "original_source_verified": True}, certified_auto, snapshot, source_policy=HEALTHY_POLICY, as_of=NOW.date())
assert original.decision == AUTO_PROMOTE

hold_profile = replace(certified_auto, auto_enabled=False)
hold = evaluate_opportunity_automation_policy(BASE, hold_profile, snapshot, source_policy=HEALTHY_POLICY, as_of=NOW.date())
assert hold.decision == HOLD and "SOURCE_NOT_AUTO_ENABLED" in hold.reason_codes and not hold.human_intervention_required
assert not any(hold.downstream_gates.values())

unresolved = evaluate_opportunity_automation_policy({**BASE, "eligibility_resolved": False}, certified_auto, snapshot, source_policy=HEALTHY_POLICY, as_of=NOW.date())
assert unresolved.decision == HUMAN_REVIEW and unresolved.reason_codes == ("ELIGIBILITY_UNRESOLVED",)
invalid = evaluate_opportunity_automation_policy(BASE, certified_auto, {"status": "blocked", "stamps": {**stamps, "identity": "block"}}, source_policy=HEALTHY_POLICY, as_of=NOW.date())
assert invalid.decision == BLOCK and invalid.reason_codes == ("IDENTITY_INVALID",)
expired = evaluate_opportunity_automation_policy({**BASE, "deadline": "2020-01-01"}, certified_auto, snapshot, source_policy=HEALTHY_POLICY, as_of=NOW.date())
assert expired.decision == BLOCK and expired.reason_codes == ("EXPIRED",)
transient = evaluate_opportunity_automation_policy(BASE, certified_auto, snapshot, observations={"identity_status": "NETWORK_TRANSIENT", "http_status": 0}, source_policy=HEALTHY_POLICY, as_of=NOW.date())
assert transient.decision == HOLD and transient.reason_codes == ("TRANSIENT_SOURCE_FAILURE",)
failed = evaluate_opportunity_automation_policy({**BASE, "factory_status": "failed"}, certified_auto, {"status": "failed", "stamps": stamps}, source_policy=HEALTHY_POLICY, as_of=NOW.date())
assert failed.decision == HOLD and failed.reason_codes == ("TRANSIENT_FACTORY_FAILURE",)

clusters = cluster_automation_exceptions([hold, hold, unresolved, transient])
source_hold = next(item for item in clusters if item["reason_code"] == "SOURCE_NOT_AUTO_ENABLED")
assert source_hold["count"] == 2 and source_hold["category"] == "SOURCE_POLICY_HOLD"
assert any(item["reason_code"] == "ELIGIBILITY_UNRESOLVED" and item["category"] == "ROW_EXCEPTION" for item in clusters)

# The production canary shape is evaluated without using the embedding path or
# requiring match_eligible. Until Himalayas is certified/auto-enabled, all
# structurally-good rows are systemic HOLDs, never fake human reviews.
eight = [{**BASE, "id": f"canary-{index}", "factory_status": "pending", "content_fingerprint": "old-content", "semantic_fingerprint": "old-semantic", "match_eligible": False, "catalog_eligible": False, "seo_eligible": False, "alerts_eligible": False, "verification_status": "in_review", "is_active": False} for index in range(8)]
canary_output = evaluate_rows(eight, as_of=NOW.date())
assert len(canary_output) == 8
assert {item["decision"] for item in canary_output} == {HOLD}
assert all("SOURCE_NOT_AUTO_ENABLED" in item["reason_codes"] for item in canary_output)
assert all("SOURCE_NOT_CERTIFIED" not in item["reason_codes"] for item in canary_output)
assert all(item["human_intervention_required"] is False and item["embedding_needed"] is False and item["commit"] is False for item in canary_output)

print("PASS opportunity automation: pure decisions, provenance separation, holds, gates and exception clustering")
