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
import time
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


def fetch_page(table: str, params: dict[str, str], *, page_size: int, after_id: str | None) -> list[dict[str, Any]]:
    """Read one stable keyset page; never enumerate a whole source in memory."""
    query = {**params, "limit": str(page_size), "order": "id.asc"}
    if after_id:
        query["id"] = f"gt.{after_id}"
    response = requests.get(f"{api_base()}/{table}", headers=api_headers(), params=query, timeout=45)
    response.raise_for_status()
    return response.json()


def capability(profile: Any) -> str:
    cert = certification(profile)
    if profile.discovery_strategy in {"public_api", "api", "api_enumeration"} and profile.detail_strategy in {"api_bulk", "api_detail"}:
        return "API_ENUMERATION"
    if profile.adapter and profile.detail_strategy not in {"none", "unknown"}:
        return "CERTIFIED_MAINTENANCE" if profile.auto_enabled and cert["certified"] else "DETAIL_REFRESH"
    return "NO_REFRESH_CAPABILITY"


def build_plan(*, cursor: dict[str, Any], max_sources: int, page_size: int) -> list[dict[str, Any]]:
    """Plan bounded opportunity pages and exact observation lookups for their IDs."""
    plan: list[dict[str, Any]] = []
    completed = set(cursor.get("completed_sources") or [])
    sources = [source for source in sorted(PROFILES) if source not in completed]
    if not sources:
        return plan
    last_source = cursor.get("last_source")
    if last_source in sources:
        start = (sources.index(last_source) + 1) % len(sources)
        sources = sources[start:] + sources[:start]
    source_cursors = cursor.get("source_cursors") or {}
    for source in sources[:max_sources]:
        profile = PROFILES[source]
        aliases = emitted_ids_for(source)
        values = ",".join(quote(alias, safe="") for alias in aliases)
        after_id = source_cursors.get(source)
        inventory = fetch_page("opportunities", {
            "select": "id,match_eligible,seo_eligible", "source": f"in.({values})",
            "deleted_at": "is.null", "archived_at": "is.null",
        }, page_size=page_size, after_id=after_id)
        ids = [str(row["id"]) for row in inventory if row.get("id")]
        if ids:
            observation_response = requests.post(
                f"{api_base()}/rpc/latest_opportunity_universe_observations", headers={**api_headers(), "Content-Type": "application/json"},
                json={"p_opportunity_ids": ids}, timeout=45,
            )
            observation_response.raise_for_status()
            seen = {str(row["opportunity_id"]) for row in observation_response.json() if row.get("opportunity_id")}
        else:
            seen = set()
        missing = [row for row in inventory if str(row.get("id")) not in seen]
        next_after_id = ids[-1] if len(inventory) == page_size and ids else None
        cap = capability(profile)
        cert = certification(profile)
        plan.append({
            "source": source,
            "after_id": after_id,
            "next_after_id": next_after_id,
            "page_rows_examined": len(inventory),
            "page_complete": len(inventory) < page_size,
            "unresolved": len(missing),
            "missing_ids": [str(row["id"]) for row in missing],
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
    parser.add_argument("--max-sources", type=int, default=10)
    parser.add_argument("--cursor-file", default=str(ROOT / ".cvitae-state" / "observation-coverage-recovery.json"))
    parser.add_argument("--max-items-per-source", type=int, default=250)
    parser.add_argument("--page-size", type=int, default=100)
    parser.add_argument("--max-runtime-seconds", type=int, default=1800)
    args = parser.parse_args()
    if args.max_items_per_source < 1 or args.max_items_per_source > 250:
        parser.error("--max-items-per-source debe estar entre 1 y 250")
    if args.max_sources < 1 or args.max_sources > 10:
        parser.error("--max-sources debe estar entre 1 y 10")
    if args.page_size < 1 or args.page_size > 100:
        parser.error("--page-size debe estar entre 1 y 100")
    if args.max_runtime_seconds < 1 or args.max_runtime_seconds > 3600:
        parser.error("--max-runtime-seconds debe estar entre 1 and 3600")
    cursor_path = Path(args.cursor_file)
    checkpoint = json.loads(cursor_path.read_text(encoding="utf-8")) if cursor_path.exists() else {"last_source": None, "source_cursors": {}}
    if "source_cursors" not in checkpoint:
        checkpoint = {"last_source": checkpoint.get("last_completed_source"), "source_cursors": {}}
    plan = build_plan(cursor=checkpoint, max_sources=args.max_sources, page_size=args.page_size)
    print("CVITAE_OBSERVATION_RECOVERY_PLAN=" + json.dumps({"mode": "APPLY" if args.apply else "DRY_RUN", "cursor": checkpoint, "max_sources": args.max_sources, "page_size": args.page_size, "max_items_per_source": args.max_items_per_source, "max_runtime_seconds": args.max_runtime_seconds, "rows_examined": sum(i["page_rows_examined"] for i in plan), "total_targets": sum(i["unresolved"] for i in plan), "content_ready_targets": sum(i["content_or_consumer_ready_potential"] for i in plan), "estimated_external_requests": sum(i["expected_external_requests_approx"] for i in plan), "sources": plan}, ensure_ascii=True, sort_keys=True))
    if not args.apply:
        return 0
    runner = ROOT / "scripts" / "run_source_maintenance.py"
    started = time.monotonic()
    for item in plan:
        source = item["source"]
        profile = PROFILES[source]
        cert = certification(profile)
        if time.monotonic() - started >= args.max_runtime_seconds:
            print("STOP_ON_BUDGET runtime_budget_reached", file=sys.stderr)
            return 1
        missing_processed = not item["unresolved"]
        if item["unresolved"] and profile.auto_enabled and cert["certified"] and profile.adapter:
            selected_ids = item["missing_ids"][:args.max_items_per_source]
            missing_processed = len(selected_ids) == len(item["missing_ids"])
            for opportunity_id in selected_ids:
                remaining = args.max_runtime_seconds - int(time.monotonic() - started)
                if remaining <= 0:
                    print(f"STOP_ON_BUDGET source={source} runtime_budget_reached", file=sys.stderr)
                    return 1
                try:
                    result = subprocess.run([
                        sys.executable, str(runner), "--source", source, "--opportunity-id", opportunity_id,
                        "--apply", "--observations-only", "--max-items", "1",
                    ], cwd=ROOT, check=False, timeout=remaining)
                except subprocess.TimeoutExpired:
                    print(f"STOP_ON_ERROR source={source} opportunity_id={opportunity_id} reason=runtime_timeout", file=sys.stderr)
                    return 1
                if result.returncode != 0:
                    print(f"STOP_ON_ERROR source={source} opportunity_id={opportunity_id} returncode={result.returncode}", file=sys.stderr)
                    return result.returncode or 1
        if item["unresolved"] and not (profile.auto_enabled and cert["certified"] and profile.adapter):
            print(f"RECOVERY_PENDING source={source} reason=AUTHORIZED_CERTIFIED_ADAPTER_REQUIRED", file=sys.stderr)
        source_cursors = dict(checkpoint.get("source_cursors") or {})
        completed_sources = set(checkpoint.get("completed_sources") or [])
        if not missing_processed:
            source_cursors[source] = item["after_id"]
        elif item["page_complete"]:
            source_cursors.pop(source, None)
            completed_sources.add(source)
        elif item["next_after_id"]:
            source_cursors[source] = item["next_after_id"]
        checkpoint = {"last_source": source, "source_cursors": source_cursors, "completed_sources": sorted(completed_sources)}
        cursor_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = cursor_path.with_suffix(cursor_path.suffix + ".tmp")
        temporary.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")
        temporary.replace(cursor_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
