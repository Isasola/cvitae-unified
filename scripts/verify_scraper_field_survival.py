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
from generate_scraper_field_survival import KNOWN_STRUCTURAL_LOSSES, emitted_sources


def _loss_baseline(payload: dict) -> dict[tuple[str, str], tuple[str, str, str]]:
    return {
        (item["canonical_source"], item["source_field"]): (
            item["expected_destination"], item["reason"], item["runtime_relevance"],
        )
        for item in payload.get("structural_losses", [])
    }


def _validate_loss_baseline(actual: dict, expected: dict) -> None:
    if actual != expected:
        raise AssertionError({"expected": expected, "actual": actual})


def main() -> int:
    subprocess.run([sys.executable, str(ROOT / "scripts" / "generate_scraper_field_survival.py")], check=True)
    payload = json.loads((ROOT / "generated" / "scraper-field-survival.json").read_text(encoding="utf-8"))
    sources = payload["sources"]
    counts = payload["category_counts"]
    assert len(sources) == len(PROFILES), "every canonical registry source must be classified"
    assert sum(counts[key] for key in ("ACTIVE_EMITTER", "HISTORICAL_ONLY", "REGISTERED_NO_ROWS")) == len(sources)
    assert counts["UNKNOWN_SOURCE"] == len(payload["unknown_emitted_sources"]) == 0, payload["unknown_emitted_sources"]
    valid = {"STRUCTURALLY_PERSISTED", "NOT_PROVIDED_BY_SOURCE", "LOST_BEFORE_PERSISTENCE", "FAILED_EXTRACTION", "UNKNOWN"}
    total_fields = 0
    for source in sources:
        assert source["classification"] in {"ACTIVE_EMITTER", "HISTORICAL_ONLY", "REGISTERED_NO_ROWS"}
        for field, state in source["fields"].items():
            assert state in valid, (source["canonical_source"], field, state)
            total_fields += 1
        for source_field, sink_field in source.get("persistence_transforms", {}).items():
            assert source["fields"][source_field] == "STRUCTURALLY_PERSISTED"
            assert sink_field in ALLOWED_FIELDS
    totals = payload["field_totals"]
    assert sum(totals.values()) == total_fields
    expected_losses = {
        key: (value["expected_destination"], value["reason"], value["runtime_relevance"])
        for key, value in KNOWN_STRUCTURAL_LOSSES.items()
    }
    actual_losses = _loss_baseline(payload)
    _validate_loss_baseline(actual_losses, expected_losses)
    assert totals["LOST_BEFORE_PERSISTENCE"] == len(expected_losses), totals
    # Discriminating self-audit: a new loss must fail, not merely increment a count.
    adversarial = {**actual_losses, ("adversarial", "new_field"): ("new_field", "unapproved", "UNASSESSED")}
    try:
        _validate_loss_baseline(adversarial, expected_losses)
    except AssertionError:
        pass
    else:
        raise AssertionError("new unapproved structural loss was accepted")
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
        "structurally_persisted": totals["STRUCTURALLY_PERSISTED"],
        "loss": totals["LOST_BEFORE_PERSISTENCE"],
        "unknown": totals["UNKNOWN"],
        "unresolved_dynamic_sources": len(payload["unknown_emitted_sources"]),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
