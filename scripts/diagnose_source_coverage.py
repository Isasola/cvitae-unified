"""diagnose_source_coverage.py — read-only source coverage diagnostic.

Reads from:
  - scrapers/source_cleaners/profiles.py (PROFILES, V2_PROFILES)
  - scrapers/source_registry.json (legacy registry)
  - .github/workflows/scrapers.yml (workflow steps)
  - supabase opportunity_sources table (via env vars SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)

Produces a structured report showing:
  - Total profiles (V2 + legacy + workflow-only)
  - Certification state breakdown
  - search_engine_indexing_allowed policy map
  - Profiles with no DB row in opportunity_sources
  - Sources with seo_enabled=true but search_engine_indexing_allowed=false (policy conflict)

NO WRITES. NO MUTATIONS. Read-only diagnostic only.

Usage:
    python scripts/diagnose_source_coverage.py
    python scripts/diagnose_source_coverage.py --json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _load_profiles():
    from scrapers.source_cleaners.profiles import PROFILES, V2_PROFILES
    return PROFILES, V2_PROFILES


def _load_db_rows():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None, "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping DB checks"
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{url}/rest/v1/opportunity_sources?select=source,catalog_enabled,seo_enabled,matching_enabled,search_engine_indexing_allowed&limit=500",
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read()), None
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Output JSON instead of human-readable text")
    args = parser.parse_args()

    profiles, v2_profiles = _load_profiles()
    db_rows, db_err = _load_db_rows()

    db_map: dict[str, dict] = {}
    if db_rows:
        for row in db_rows:
            db_map[str(row.get("source", "")).lower()] = row

    total = len(profiles)
    v2_count = len(v2_profiles)
    certified_count = sum(1 for p in v2_profiles.values() if p.certification)
    auto_enabled_count = sum(1 for p in profiles.values() if p.auto_enabled)

    # Policy map for search_engine_indexing_allowed
    sei_false = [s for s, p in profiles.items() if p.search_engine_indexing_allowed is False]
    sei_true = [s for s, p in profiles.items() if p.search_engine_indexing_allowed is True]
    sei_none = [s for s, p in profiles.items() if p.search_engine_indexing_allowed is None]

    # Profiles with no DB row
    no_db_row = [s for s in profiles if s not in db_map]

    # Policy conflicts: seo_enabled=true but search_engine_indexing_allowed=false
    conflicts = []
    if db_rows:
        for source, row in db_map.items():
            profile = profiles.get(source)
            sei = profile.search_engine_indexing_allowed if profile else None
            seo_enabled = row.get("seo_enabled")
            if seo_enabled and sei is False:
                conflicts.append({"source": source, "seo_enabled": seo_enabled, "search_engine_indexing_allowed": sei})

    report = {
        "summary": {
            "total_profiles": total,
            "v2_profiles": v2_count,
            "certified": certified_count,
            "auto_enabled": auto_enabled_count,
            "db_rows_loaded": len(db_map) if db_rows else None,
            "db_error": db_err,
        },
        "search_engine_indexing_allowed": {
            "false_count": len(sei_false),
            "false_sources": sei_false,
            "true_count": len(sei_true),
            "true_sources": sei_true,
            "null_count": len(sei_none),
        },
        "no_db_row": {"count": len(no_db_row), "sources": no_db_row},
        "policy_conflicts": {"count": len(conflicts), "items": conflicts},
    }

    if args.json:
        print(json.dumps(report, indent=2))
        return

    s = report["summary"]
    print("=== Source Coverage Diagnostic ===")
    print(f"  Total profiles     : {s['total_profiles']}")
    print(f"  V2 profiles        : {s['v2_profiles']}")
    print(f"  V2 certified       : {s['certified']}")
    print(f"  Auto-enabled       : {s['auto_enabled']}")
    if db_err:
        print(f"  DB                 : ERROR — {db_err}")
    else:
        print(f"  DB rows loaded     : {s['db_rows_loaded']}")

    print("\n--- search_engine_indexing_allowed ---")
    print(f"  FALSE (denied)  : {report['search_engine_indexing_allowed']['false_count']} → {', '.join(report['search_engine_indexing_allowed']['false_sources']) or '(none)'}")
    print(f"  TRUE (allowed)  : {report['search_engine_indexing_allowed']['true_count']} → {', '.join(report['search_engine_indexing_allowed']['true_sources']) or '(none)'}")
    print(f"  NULL (legacy)   : {report['search_engine_indexing_allowed']['null_count']}")

    if report["no_db_row"]["count"]:
        print(f"\n--- {report['no_db_row']['count']} profiles with no DB row in opportunity_sources ---")
        for src in report["no_db_row"]["sources"][:20]:
            print(f"  {src}")
        if report["no_db_row"]["count"] > 20:
            print(f"  … and {report['no_db_row']['count'] - 20} more")

    if report["policy_conflicts"]["count"]:
        print(f"\n--- POLICY CONFLICTS ({report['policy_conflicts']['count']}) seo_enabled=true but POLICY_DENIED ---")
        for item in report["policy_conflicts"]["items"]:
            print(f"  {item['source']}: seo_enabled={item['seo_enabled']}, search_engine_indexing_allowed={item['search_engine_indexing_allowed']}")
    else:
        print("\n--- Policy conflicts: none ---")


if __name__ == "__main__":
    main()
