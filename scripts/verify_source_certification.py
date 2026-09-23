"""Offline checks for auditable Registry V2 certification evidence."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from source_cleaners import get_profile
from source_registry_v2 import certification, registry_snapshot


profile = get_profile("himalayas")
result = certification(profile)
evidence = result["evidence"].get("live_validation") or {}

assert result["certified"] is True
assert result["missing"] == []
assert result["auto_enabled"] is False
assert profile.auto_enabled is False
assert evidence.get("status") == "passed"
assert evidence.get("validated_at") == "2026-09-14"
assert evidence.get("adapter_version") == profile.adapter_version
assert evidence.get("semantic_version") == profile.semantic_version
stable = evidence.get("stable_evidence") or {}
assert stable.get("production_hidden_canary") == "8/8"
assert stable.get("factory_automation_canary") == "8/8"
assert stable.get("accidental_publication") is False
assert stable.get("distribution_policy_validated") is True
assert profile.web_catalog_allowed is True
assert profile.source_attribution_required is True
assert profile.third_party_job_distribution_allowed is False
assert profile.google_jobs_distribution_allowed is False

snapshot = registry_snapshot()
himalayas = next(item for item in snapshot["sources"] if item["canonical_source"] == "himalayas")
assert himalayas["certified"] is True
assert himalayas["auto_enabled"] is False
assert himalayas["blocking_requirements"] == []
assert himalayas["certification_evidence"]["live_validation"]["status"] == "passed"

print("verify_source_certification: PASS")
