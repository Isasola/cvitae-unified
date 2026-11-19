"""Read-only planner for exact Himalayas live-observation evidence.

It joins canonical URLs from the structured provider inventory with CVitae rows.
It never persists observations: candidates are an auditable proposal for the
existing append-only observation path.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from himalayas_scraper import ADAPTER_VERSION, canonical_himalayas_url, fetch_api_inventory, job_identity_urls
from run_opportunity_enrichment_batch import api_base, api_headers, himalayas_db_inventory, load_local_env
from source_evidence import exact_live_observation_candidate
from observation_writer import dedupe, write


def apply_summary(result: dict[str, Any], persisted: dict[str, Any], ttl_deduped: int) -> dict[str, Any]:
    """Merge writer output without retaining the planner's dry-run count."""
    return {**result, "mode": "APPLY", "commit": True, "writes": int(persisted.get("persisted", 0)), "ttl_deduped_at_write": ttl_deduped, "write_result": persisted}


def _latest_observations(session: requests.Session, ids: list[str]) -> dict[str, dict[str, Any]]:
    """Read only current evidence in bounded batches; no absence is interpreted."""
    latest: dict[str, dict[str, Any]] = {}
    for start in range(0, len(ids), 100):
        values = ",".join(f'"{value}"' for value in ids[start:start + 100])
        response = session.get(
            f"{api_base()}/opportunity_source_observations", headers=api_headers(),
            params={"select": "opportunity_id,identity_status,http_status,observed_at", "source": "eq.himalayas",
                    "opportunity_id": f"in.({values})", "order": "observed_at.desc", "limit": "1000"}, timeout=30,
        )
        if response.status_code == 404:
            return {}
        response.raise_for_status()
        for row in response.json():
            latest.setdefault(str(row["opportunity_id"]), row)
    return latest


def plan(*, max_pages: int, max_candidates: int | None, run_id: str, session: requests.Session | None = None, return_candidates: bool = False) -> dict[str, Any] | tuple[dict[str, Any], list[Any]]:
    session = session or requests.Session()
    observed_at = datetime.now(timezone.utc)
    db_rows = himalayas_db_inventory()
    inventory = fetch_api_inventory(page_size=100, max_pages=max_pages, session=session)
    provider_by_url: dict[str, dict[str, Any]] = {}
    duplicates = inventory.duplicate_records
    for job in inventory.jobs:
        for url in job_identity_urls(job):
            if url in provider_by_url:
                duplicates += 1
            provider_by_url.setdefault(url, job)
    matches: list[tuple[dict[str, Any], str]] = []
    ambiguous = 0
    for row in db_rows:
        urls = {url for url in (canonical_himalayas_url(row.get("source_url")), canonical_himalayas_url(row.get("application_url"))) if url}
        found = sorted(url for url in urls if url in provider_by_url)
        if len(found) > 1:
            ambiguous += 1
            continue
        if found:
            matches.append((row, found[0]))
    matches.sort(key=lambda item: (item[1], str(item[0].get("id") or "")))
    observations = _latest_observations(session, [str(row["id"]) for row, _ in matches])
    ttl = timedelta(hours=24)
    already_fresh = 0
    candidates: list[Any] = []
    for row, canonical_url in matches:
        old = observations.get(str(row["id"]))
        old_at = None
        try:
            old_at = datetime.fromisoformat(str((old or {}).get("observed_at") or "").replace("Z", "+00:00"))
        except ValueError:
            pass
        if old and old.get("identity_status") == "IDENTITY_CONFIRMED" and old.get("http_status") == 200 and old_at and old_at >= observed_at - ttl:
            already_fresh += 1
            continue
        candidate = exact_live_observation_candidate(
            source="himalayas", opportunity_id=str(row["id"]), adapter_version=ADAPTER_VERSION,
            canonical_url=canonical_url, run_id=run_id, observed_at=observed_at.isoformat(),
            evidence={"inventory_pages_seen": inventory.pages_seen, "inventory_complete": inventory.complete},
        )
        candidates.append(candidate)
    if max_candidates is not None:
        candidates = candidates[:max_candidates]
    matched_ids = {str(row["id"]) for row, _ in matches}
    result = {
        "source": "himalayas", "mode": "DRY_RUN", "writes": 0, "commit": False,
        "requested": max_candidates,
        "db_source_rows": len(db_rows), "live_provider_records": inventory.records_seen,
        "provider_unique_records": len(provider_by_url), "exact_matches": len(matches),
        "selected": len(candidates), "would_insert": len(candidates), "observation_candidates": len(candidates), "already_fresh": already_fresh,
        "ambiguous": ambiguous, "provider_only": max(0, len(provider_by_url) - len(matches)),
        "db_only": len(db_rows) - len(matched_ids) if inventory.complete else None,
        "duplicates": duplicates, "scan_complete": inventory.complete,
        "coverage_stop_reason": "complete" if inventory.complete else inventory.error,
        "api_pages_seen": inventory.pages_seen, "api_error": inventory.error,
        "sample_candidates": [{key: value for key, value in item.to_payload().items() if key != "evidence"} for item in candidates[:5]],
    }
    print("HIMALAYAS_OBSERVATION_RECONCILIATION=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    return (result, candidates) if return_candidates else result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true", help="persist only normalized observation rows; never changes opportunities")
    parser.add_argument("--max-pages", type=int, default=5, help="provider browse-page budget; never implies full coverage")
    parser.add_argument("--max-candidates", type=int, default=100, help="bounded proposed observation sample after discovery")
    parser.add_argument("--run-id", default=None, help="explicit execution identity; generated locally for dry-run")
    args = parser.parse_args()
    if args.dry_run == args.apply:
        parser.error("choose exactly one of --dry-run or --apply")
    if args.apply and not args.run_id:
        parser.error("--apply requires an explicit --run-id")
    if args.max_pages < 1 or args.max_candidates < 1:
        parser.error("budgets must be positive")
    load_local_env()
    run_id=args.run_id or f"himalayas-observation-plan-{int(datetime.now(timezone.utc).timestamp())}"
    result, candidates = plan(max_pages=args.max_pages, max_candidates=args.max_candidates, run_id=run_id, return_candidates=True)
    if args.apply:
        latest = _latest_observations(requests.Session(), [item.opportunity_id for item in candidates])
        candidates, ttl_deduped = dedupe(candidates, latest, now=datetime.now(timezone.utc))
        persisted = write(candidates, base_url=api_base(), headers=api_headers(), apply=True)
        # ``writes`` is the public summary counter.  It must agree with the
        # writer's durable result, rather than retain the planner's zero.
        result = apply_summary(result, persisted, ttl_deduped)
        print("HIMALAYAS_OBSERVATION_WRITE=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
