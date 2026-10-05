"""Bounded, resumable scheduled-ingestion worker over the existing Automation Core."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import requests

ROOT = __import__("pathlib").Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from run_source_scan_automation_bridge import run as run_existing_automation
from run_opportunity_enrichment_batch import api_base, api_headers, load_local_env
from source_registry_v2 import certification, resolve_emitted_source, runtime_projection


def scheduled_runs(session: requests.Session, max_runs: int) -> list[dict[str, Any]]:
    response = session.get(
        f"{api_base()}/scraper_runs", headers=api_headers(),
        params={
            "select": "run_id,scraper_id,status,started_at",
            "trigger_type": "eq.schedule",
            "status": "in.(healthy,warning)",
            "finished_at": "not.is.null",
            "order": "started_at.asc",
            "limit": str(max_runs),
        }, timeout=30,
    )
    response.raise_for_status()
    return response.json()


def source_is_automation_authorized(session: requests.Session, source: str) -> tuple[bool, str]:
    for suffix in ("_scraper", "_scrapper"):
        if source.endswith(suffix):
            source = source[: -len(suffix)]
            break
    profile = resolve_emitted_source(source)
    certificate = certification(profile)
    if not certificate["certified"]:
        return False, "REGISTRY_NOT_CERTIFIED"
    if not profile.active or not profile.auto_enabled:
        return False, "REGISTRY_AUTOMATION_NOT_ENABLED"
    expected = runtime_projection(profile)
    response = session.get(
        f"{api_base()}/opportunity_sources", headers=api_headers(),
        params={
            "select": "source,is_enabled,registry_certified,registry_auto_enabled,registry_automation_enabled,registry_policy_hash",
            "source": f"eq.{profile.source}", "limit": "1",
        }, timeout=30,
    )
    if response.status_code in {400, 404}:
        return False, "DURABLE_AUTOMATION_POLICY_UNAVAILABLE"
    response.raise_for_status()
    rows = response.json()
    if not rows:
        return False, "DURABLE_AUTOMATION_POLICY_MISSING"
    policy = rows[0]
    if policy.get("is_enabled") is not True:
        return False, "SOURCE_OPERATIONALLY_DISABLED"
    if policy.get("registry_certified") is not True or policy.get("registry_auto_enabled") is not True or policy.get("registry_automation_enabled") is not True:
        return False, "DURABLE_AUTOMATION_NOT_AUTHORIZED"
    if policy.get("registry_policy_hash") != expected["registry_policy_hash"]:
        return False, "REGISTRY_POLICY_PROJECTION_STALE"
    return True, "CERTIFIED_AND_EXPLICITLY_AUTOMATION_ENABLED"


def run_worker(*, max_runs: int = 20, batch_size: int = 50, max_batches_per_run: int = 4, session: requests.Session | None = None) -> dict[str, Any]:
    if not 1 <= max_runs <= 50 or not 1 <= batch_size <= 50 or not 1 <= max_batches_per_run <= 10:
        raise ValueError("scheduled_automation_bounds_invalid")
    session = session or requests.Session()
    results: list[dict[str, Any]] = []
    runs = scheduled_runs(session, max_runs)
    for run_row in runs:
        run_id = str(run_row.get("run_id") or "")
        scraper_id = str(run_row.get("scraper_id") or "")
        if not run_id or not scraper_id:
            results.append({"status": "SKIPPED", "reason": "RUN_IDENTITY_INCOMPLETE"})
            continue
        try:
            authorized, reason = source_is_automation_authorized(session, scraper_id)
        except (ValueError, requests.RequestException):
            authorized, reason = False, "SOURCE_POLICY_UNAVAILABLE_OR_UNRESOLVED"
        if not authorized:
            results.append({"run_id": run_id, "scraper_id": scraper_id, "status": "SKIPPED", "reason": reason})
            continue

        batches = 0
        evaluated = 0
        state = "RESUMABLE"
        pending = 0
        failure: dict[str, Any] | None = None
        while batches < max_batches_per_run:
            result = run_existing_automation(
                run_id, dry_run=False, scraper_id=scraper_id,
                max_opportunities=batch_size, session=session,
            )
            batches += 1
            evaluated += int(result.get("evaluated") or 0)
            state = str(result.get("status") or "UNKNOWN")
            if state in {"NO_PENDING_IDS", "NO_PERSISTED_IDS"}:
                break
            if state in {"AUTOMATION_BRIDGE_FAILED", "SCAN_LINEAGE_UNAVAILABLE"}:
                failure = {"run_id": run_id, "scraper_id": scraper_id, "status": state, "reason": result.get("reason"), "batches": batches}
                break
            pending = int(result.get("pending_after_batch") or 0)
            if not pending:
                break
        if failure:
            results.append(failure)
            continue
        results.append({
            "run_id": run_id, "scraper_id": scraper_id,
            "status": "RESUMABLE" if pending else state,
            "evaluated": evaluated, "batches": batches, "pending_after_batch": pending,
        })

    return {
        "owner": "existing-source-automation-core",
        "scheduled_runs_seen": len(runs),
        "bounds": {"max_runs": max_runs, "batch_size": batch_size, "max_batches_per_run": max_batches_per_run},
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-runs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--max-batches-per-run", type=int, default=4)
    args = parser.parse_args()
    load_local_env()
    result = run_worker(max_runs=args.max_runs, batch_size=args.batch_size, max_batches_per_run=args.max_batches_per_run)
    print("CVITAE_SCHEDULED_AUTOMATION=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 1 if any(row.get("status") in {"AUTOMATION_BRIDGE_FAILED", "SCAN_LINEAGE_UNAVAILABLE"} for row in result["results"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
