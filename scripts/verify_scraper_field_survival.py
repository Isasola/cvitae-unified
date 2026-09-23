"""Offline verifier for the generated all-emitter field survival matrix."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from opportunity_sink import ALLOWED_FIELDS
from source_registry_v2 import PROFILES, resolve_emitted_source
from generate_scraper_field_survival import emitted_sources


def main() -> int:
    subprocess.run([sys.executable, str(ROOT / "scripts" / "generate_scraper_field_survival.py")], check=True)
    payload = json.loads((ROOT / "generated" / "scraper-field-survival.json").read_text(encoding="utf-8"))
    sources = payload["sources"]
    counts = payload["category_counts"]
    assert len(sources) == len(PROFILES), "every canonical registry source must be classified"
    assert sum(counts[key] for key in ("ACTIVE_EMITTER", "HISTORICAL_ONLY", "REGISTERED_NO_ROWS")) == len(sources)
    assert counts["UNKNOWN_SOURCE"] == len(payload["unknown_emitted_sources"]) == 0, payload["unknown_emitted_sources"]
    valid = {"PERSISTED", "NOT_PROVIDED_BY_SOURCE", "LOST_BEFORE_PERSISTENCE", "FAILED_EXTRACTION", "UNKNOWN"}
    total_fields = 0
    for source in sources:
        assert source["classification"] in {"ACTIVE_EMITTER", "HISTORICAL_ONLY", "REGISTERED_NO_ROWS"}
        for field, state in source["fields"].items():
            assert state in valid, (source["canonical_source"], field, state)
            total_fields += 1
        for source_field, sink_field in source.get("persistence_transforms", {}).items():
            assert source["fields"][source_field] == "PERSISTED"
            assert sink_field in ALLOWED_FIELDS
    totals = payload["field_totals"]
    assert sum(totals.values()) == total_fields
    assert totals["LOST_BEFORE_PERSISTENCE"] == 0, "a real emitted-field loss must remain visible until fixed"
    by_source = {item["canonical_source"]: item for item in sources}
    expected_active = {
        "eu_delegation_paraguay", "fiuna_job_board", "oas_scholarships",
        "mef_inapp_becas", "ucom_job_board", "ipa_convocatorias",
        "coimbra_group", "erasmus_mundus", "impactpool",
        "one_young_world_scholarships", "santander_open_academy", "snj_paraguay",
        "callcenters", "ongs", "seguros",
    }
    for source in expected_active:
        assert by_source[source]["classification"] == "ACTIVE_EMITTER", source
    dynamic_cases = {
        "callcenters_scraper.py": {"cc_atento": "callcenters"},
        "ongs_scraper.py": {"ong_oas_py": "ongs", "ong_bid_py": "ongs", "ong_giz_py": "ongs"},
        "seguros_scraper.py": {"seguros_unimedica": "seguros"},
    }
    for filename, cases in dynamic_cases.items():
        emitted = emitted_sources(ROOT / "scrapers" / filename)
        for raw, canonical in cases.items():
            assert raw in emitted, (filename, raw)
            assert resolve_emitted_source(raw).source == canonical
    print("verify_scraper_field_survival: PASS " + json.dumps({
        "categories": counts,
        "persisted": totals["PERSISTED"],
        "loss": totals["LOST_BEFORE_PERSISTENCE"],
        "unknown": totals["UNKNOWN"],
        "unresolved_dynamic_sources": len(payload["unknown_emitted_sources"]),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
