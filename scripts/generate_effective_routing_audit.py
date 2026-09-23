"""Deterministic local policy-evidence audit; never reads or mutates the DB."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from source_cleaners import PROFILES
from source_registry_v2 import validate_registry


def configured(value: bool) -> str:
    return "CONFIG_ENABLED" if value else "CONFIG_DISABLED_NO_RESTRICTION_EVIDENCE"


def source_entry(profile: object) -> dict:
    # Only Himalayas has repository evidence of an external search-engine
    # restriction. A false/default field for another source is configuration,
    # not proof of a contractual prohibition.
    explicit = []
    if profile.source == "himalayas":
        explicit = ["SEARCH_ENGINE_INDEXING_DENIED", "GOOGLE_JOBS_DENIED", "THIRD_PARTY_DISTRIBUTION_DENIED"]
    web = configured(bool(profile.web_catalog_allowed))
    search = "EXPLICIT_RESTRICTION" if profile.source == "himalayas" else configured(bool(profile.search_engine_indexing_allowed))
    google = "EXPLICIT_RESTRICTION" if profile.source == "himalayas" else configured(bool(profile.google_jobs_distribution_allowed))
    return {
        "canonical_source": profile.source,
        "policy_evidence_state": "EXPLICIT_RESTRICTION" if explicit else ("CONFIG_ENABLED" if any((profile.web_catalog_allowed, profile.search_engine_indexing_allowed, profile.google_jobs_distribution_allowed)) else "CONFIG_DISABLED_NO_RESTRICTION_EVIDENCE"),
        "catalog_source_state": web,
        # Operational DB switches are intentionally unavailable to this local
        # registry artifact. Do not turn missing evidence into a false flag.
        "matching_source_state": "UNKNOWN",
        "alerts_source_state": "UNKNOWN",
        "seo_source_state": search,
        "google_jobs_source_state": google,
        "explicit_restrictions": explicit,
        "unknowns": ["matching_admin_switch", "alerts_admin_switch", "current_db_operational_switches"],
        "source_attribution_required": bool(profile.source_attribution_required),
    }


def main() -> int:
    validation = validate_registry()
    if not validation["valid"]:
        raise SystemExit("registry invalid; refusing routing audit")
    entries = [source_entry(PROFILES[key]) for key in sorted(PROFILES)]
    artifact = {
        "schema_version": "effective-routing-audit:v1",
        "evidence_level": "LOCAL_REGISTRY_ONLY",
        "registry_profiles": len(entries),
        "registry_validation": {
            "alias_collisions": len(validation["alias_collisions"]),
            "ambiguous_patterns": len(validation["ambiguous_patterns"]),
            "alias_pattern_conflicts": len(validation["alias_pattern_conflicts"]),
        },
        "sources": entries,
    }
    output = ROOT / "generated" / "effective-routing-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"effective_routing_audit: PASS sources={len(entries)} output={output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
