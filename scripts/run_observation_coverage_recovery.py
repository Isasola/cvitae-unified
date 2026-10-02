"""Bounded, resumable observation recovery using the existing source adapters.

Dry-run is the default. APPLY only writes factual adapter observations through
run_source_maintenance.py --observations-only; it never synthesizes presence,
HTTP, identity, LIVE/DEAD, lifecycle, eligibility, or routing evidence.
Successful observations are the durable resume cursor; a source failure stops
the run before the per-source checkpoint advances.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_cleaners import PROFILES
from source_registry_v2 import certification, emitted_ids_for


def api_headers() -> dict[str, str]:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def api_base() -> str:
    return os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"


def pages(table: str, params: dict[str, str], page_size: int = 1000) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        response = requests.get(
            f"{api_base()}/{table}", headers=api_headers(),
            params={**params, "limit": str(page_size), "offset": str(offset)}, timeout=45,
        )
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += len(page)


def capability(profile: Any) -> str:
    cert = certification(profile)
    if profile.discovery_strategy in {"public_api", "api", "api_enumeration"} and profile.detail_strategy in {"api_bulk", "api_detail"}:
        return "API_ENUMERATION"
    if profile.adapter and profile.detail_strategy not in {"none", "unknown"}:
        return "CERTIFIED_MAINTENANCE" if profile.auto_enabled and cert["certified"] else "DETAIL_REFRESH"
    return "NO_REFRESH_CAPABILITY"


def build_plan() -> list[dict[str, Any]]:
    plan: list[dict[str, Any]] = []
    for source, profile in PROFILES.items():
        aliases = emitted_ids_for(source)
        values = ",".join(quote(alias, safe="") for alias in aliases)
        inventory = pages("opportunities", {"select": "id,match_eligible,seo_eligible", "source": f"in.({values})", "deleted_at": "is.null", "archived_at": "is.null", "order": "id.asc"})
        seen: set[str] = set()
        for offset in range(0, len(aliases), 50):
            source_values = ",".join(quote(alias, safe="") for alias in aliases[offset:offset + 50])
            observations = pages("opportunity_source_observations", {"select": "opportunity_id", "source": f"in.({source_values})"})
            seen.update(str(row["opportunity_id"]) for row in observations if row.get("opportunity_id"))
        missing = [row for row in inventory if str(row.get("id")) not in seen]
        cap = capability(profile)
        cert = certification(profile)
        plan.append({
            "source": source,
            "unresolved": len(missing),
            "content_or_consumer_ready_potential": sum(bool(row.get("match_eligible") or row.get("seo_eligible")) for row in missing),
            "refresh_mechanism": cap,
            "can_enumerate_current_feed": bool(cap == "API_ENUMERATION"),
            "enumeration_completeness_proven": False,
            "detail_fetch_required": cap in {"DETAIL_REFRESH", "CERTIFIED_MAINTENANCE"},
            "expected_external_requests_approx": min(len(missing), int(profile.max_detail_fetches_per_run)) if cap in {"DETAIL_REFRESH", "CERTIFIED_MAINTENANCE"} else (1 if cap == "API_ENUMERATION" and missing else 0),
            "existing_pipeline_to_reuse": "scripts/run_source_maintenance.py --observations-only",
            "missing_cable": None if profile.adapter else "NO_VALIDATED_ADAPTER",
            "certified": bool(cert["certified"]),
            "auto_enabled": bool(profile.auto_enabled),
            "adapter": profile.adapter,
            "scout": profile.scout,
            "detail_strategy": profile.detail_strategy,
        })
    return sorted(plan, key=lambda item: (item["unresolved"] > 0 and item["refresh_mechanism"] != "NO_REFRESH_CAPABILITY", item["unresolved"], item["content_or_consumer_ready_potential"]), reverse=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="persiste sólo observaciones factuales; requiere fuente AUTO certificada")
    parser.add_argument("--max-sources", type=int)
    parser.add_argument("--cursor-file", default=str(ROOT / ".cvitae-state" / "observation-coverage-recovery.json"))
    parser.add_argument("--max-items-per-source", type=int, default=250)
    args = parser.parse_args()
    if args.max_items_per_source < 1 or args.max_items_per_source > 250:
        parser.error("--max-items-per-source debe estar entre 1 y 250")
    plan = build_plan()
    if args.max_sources:
        plan = plan[:max(1, args.max_sources)]
    cursor_path = Path(args.cursor_file)
    checkpoint = json.loads(cursor_path.read_text(encoding="utf-8")) if cursor_path.exists() else {"last_completed_source": None, "completed_sources": []}
    completed = set(checkpoint.get("completed_sources") or [])
    if checkpoint.get("last_completed_source") in {item["source"] for item in plan}:
        start = next(i + 1 for i, item in enumerate(plan) if item["source"] == checkpoint["last_completed_source"])
        plan = plan[start:] + plan[:start]
    print("CVITAE_OBSERVATION_RECOVERY_PLAN=" + json.dumps({"mode": "APPLY" if args.apply else "DRY_RUN", "cursor": checkpoint, "total_targets": sum(i["unresolved"] for i in plan), "content_ready_targets": sum(i["content_or_consumer_ready_potential"] for i in plan), "estimated_external_requests": sum(i["expected_external_requests_approx"] for i in plan), "sources": plan}, ensure_ascii=True, sort_keys=True))
    if not args.apply:
        return 0
    runner = ROOT / "scripts" / "run_source_maintenance.py"
    for item in plan:
        source = item["source"]
        if item["unresolved"] == 0 or source in completed:
            continue
        profile = PROFILES[source]
        cert = certification(profile)
        if not profile.auto_enabled or not cert["certified"] or not profile.adapter:
            continue
        result = subprocess.run([
            sys.executable, str(runner), "--source", source, "--apply", "--observations-only",
            "--max-items", str(min(args.max_items_per_source, profile.max_detail_fetches_per_run)),
        ], cwd=ROOT, check=False)
        if result.returncode != 0:
            print(f"STOP_ON_ERROR source={source} returncode={result.returncode}", file=sys.stderr)
            return result.returncode or 1
        completed.add(source)
        cursor_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = cursor_path.with_suffix(cursor_path.suffix + ".tmp")
        temporary.write_text(json.dumps({"last_completed_source": source, "completed_sources": sorted(completed)}, indent=2), encoding="utf-8")
        temporary.replace(cursor_path)
    if plan and all(item["source"] in completed or item["unresolved"] == 0 for item in plan):
        # A completed pass begins a fresh idempotent cycle next time; recent
        # durable observations prevent duplicate fetches while newly missing
        # rows remain eligible for the next cycle.
        cursor_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = cursor_path.with_suffix(cursor_path.suffix + ".tmp")
        temporary.write_text(json.dumps({"last_completed_source": None, "completed_sources": []}, indent=2), encoding="utf-8")
        temporary.replace(cursor_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
