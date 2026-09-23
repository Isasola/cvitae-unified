"""Offline system contract for shared scraper ingestion and source accounting."""
from __future__ import annotations

import re
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from opportunity_sink import normalize_opportunity
from source_registry_v2 import PROFILES, emitted_ids_for, resolve_emitted_source


def main() -> int:
    profiles = list(PROFILES.values())
    aliases: dict[str, str] = {}
    for profile in profiles:
        for alias in emitted_ids_for(profile.source):
            key = alias.casefold()
            assert aliases.setdefault(key, profile.source) == profile.source, f"ambiguous alias {alias}"
    assert resolve_emitted_source("oyaop").source == "oya"

    direct_sink_emitters = []
    legacy_bridged_emitters = []
    for path in (ROOT / "scrapers").glob("*_scraper.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "OpportunitySink().upsert(" in text:
            direct_sink_emitters.append(path.name)
        if re.search(r"rest/v1/opportunities|from\(['\"]opportunities", text) and "opportunity_sink" not in path.name:
            legacy_bridged_emitters.append(path.name)
    runtime_bridge = (ROOT / "scrapers" / "runtime_policy" / "sitecustomize.py").read_text(encoding="utf-8")
    monitored_runner = (ROOT / "scripts" / "run_scraper_monitored.py").read_text(encoding="utf-8")
    assert "OpportunitySink().upsert(rows)" in runtime_bridge and '"X-CVitae-Sink"' in runtime_bridge
    assert 'child_env["PYTHONPATH"]' in monitored_runner and 'CVITAE_BATCH_LEGACY_WRITES' in monitored_runner
    assert direct_sink_emitters, "no active sink emitters discovered"

    survival = json.loads((ROOT / "generated" / "scraper-field-survival.json").read_text(encoding="utf-8"))
    universe = survival["category_counts"]
    assert sum(universe[key] for key in ("ACTIVE_EMITTER", "HISTORICAL_ONLY", "REGISTERED_NO_ROWS")) == len(profiles)
    assert universe["UNKNOWN_SOURCE"] == len(survival["unknown_emitted_sources"]) == 0

    row, error = normalize_opportunity({
        "title": "Programme Officer", "organization": "Fixture UN", "description": "Programme delivery requirements and stakeholder coordination. " * 4,
        "application_url": "https://fixture.example/apply", "source": "unjobs", "source_authority": "original",
        "original_source_verified": True, "location": "Asunción, Paraguay", "country_code": "PY", "opportunity_type": "job",
        "tags": ["programme", "coordination"],
    })
    assert error is None and row is not None
    assert row["factory_status"] == "pending" and row["content_fingerprint"] and row["semantic_fingerprint"]
    assert row["opportunity_type"] == "job" and row["source"] == "unjobs"
    print(f"verify_scraper_system_integration: PASS canonical_sources={len(profiles)} emitted_aliases={len(aliases)} direct_sink_emitters={len(direct_sink_emitters)} legacy_bridge_emitters={len(legacy_bridged_emitters)} universe={universe} future_row=factory_pending")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
