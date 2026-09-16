"""Read-only, bounded source-wide Opportunity Automation Runtime V1."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from opportunity_sink import CONTENT_FINGERPRINT_FIELDS, SEMANTIC_FINGERPRINT_FIELDS
from source_automation_runtime import AUTOMATION_FACTORY_STATUSES, evaluate_runtime_row, operational_health_from_runs, summarize_runtime_rows
from source_registry_v2 import certification, emitted_ids_for, resolve_emitted_source
from run_opportunity_enrichment_batch import api_base, api_headers, load_local_env


DEFAULT_LIMIT = 100
DEFAULT_BATCH_SIZE = 100
MAX_BATCH_SIZE = 250
MAX_RUNTIME_SECONDS = 10 * 60

ROW_FIELDS = tuple(sorted(set(CONTENT_FINGERPRINT_FIELDS + SEMANTIC_FINGERPRINT_FIELDS + (
    "id", "source", "updated_at", "factory_status", "embedding", "verification_status", "is_active",
    "catalog_eligible", "match_eligible", "alerts_eligible", "seo_eligible", "seo_status", "deleted_at",
    "archived_at", "source_authority", "original_source_verified", "remote_scope", "eligible_countries",
    "eligible_regions", "application_url", "deadline",
))))


def _source_filter(source: str) -> str:
    return ",".join(emitted_ids_for(source))


def _count_source_rows(session: requests.Session, source: str) -> int | None:
    response = session.get(
        f"{api_base()}/opportunities", headers={**api_headers(), "Prefer": "count=exact"},
        params={"select": "id", "source": f"in.({_source_filter(source)})", "deleted_at": "is.null", "archived_at": "is.null", "limit": "1"}, timeout=30,
    )
    response.raise_for_status()
    content_range = response.headers.get("content-range", "")
    try:
        return int(content_range.rsplit("/", 1)[1])
    except (IndexError, ValueError):
        return None


def _fetch_page(session: requests.Session, source: str, offset: int, batch_size: int) -> list[dict[str, Any]]:
    response = session.get(
        f"{api_base()}/opportunities", headers=api_headers(),
        params={"select": ",".join(ROW_FIELDS), "source": f"in.({_source_filter(source)})", "deleted_at": "is.null", "archived_at": "is.null", "order": "updated_at.asc,id.asc", "limit": str(batch_size), "offset": str(offset)}, timeout=45,
    )
    response.raise_for_status()
    return response.json()


def _latest_observations(session: requests.Session, source: str, ids: list[str]) -> dict[str, dict[str, Any]]:
    if not ids:
        return {}
    quoted = ",".join(f'"{value.replace(chr(34), "")}"' for value in ids)
    response = session.get(
        f"{api_base()}/opportunity_source_observations", headers=api_headers(),
        params={"select": "opportunity_id,identity_status,http_status,observed_at", "source": f"in.({_source_filter(source)})", "opportunity_id": f"in.({quoted})", "order": "observed_at.desc", "limit": str(max(1000, len(ids) * 3))}, timeout=30,
    )
    if response.status_code == 404:
        return {}
    response.raise_for_status()
    latest: dict[str, dict[str, Any]] = {}
    for item in response.json():
        latest.setdefault(str(item["opportunity_id"]), item)
    return latest


_SOURCE_POLICY_FIELDS = (
    "source,is_enabled,trust_level,"
    "catalog_enabled,matching_enabled,alerts_enabled,seo_enabled,"
    "registry_certified,registry_auto_enabled,registry_automation_enabled,"
    "registry_semantic_version,registry_adapter_version,registry_automation_policy_version,"
    "registry_policy_hash,registry_synced_at,"
    "registry_projection_ttl_hours,registry_health_ttl_hours,registry_freshness_ttl_hours,"
    "web_catalog_allowed,source_attribution_required,"
    "google_jobs_distribution_allowed,third_party_job_distribution_allowed"
)


def _source_policy(session: requests.Session, source: str) -> dict[str, Any]:
    response = session.get(
        f"{api_base()}/opportunity_sources", headers=api_headers(),
        params={"select": _SOURCE_POLICY_FIELDS, "source": f"eq.{source}", "limit": "1"}, timeout=30,
    )
    if response.status_code in {400, 404}:
        return {"source_policy_available": False}
    response.raise_for_status()
    rows = response.json()
    if not rows:
        return {"source_policy_available": False}
    row = rows[0]
    return {
        "source_policy_available": True,
        "source_enabled": row.get("is_enabled") is True,
        "source_trust_level": row.get("trust_level"),
        "catalog_enabled": bool(row.get("catalog_enabled")),
        "matching_enabled": bool(row.get("matching_enabled")),
        "alerts_enabled": bool(row.get("alerts_enabled")),
        "seo_enabled": bool(row.get("seo_enabled")),
        "registry_certified": bool(row.get("registry_certified")),
        "registry_auto_enabled": bool(row.get("registry_auto_enabled")),
        "registry_automation_enabled": bool(row.get("registry_automation_enabled")),
        "registry_semantic_version": row.get("registry_semantic_version"),
        "registry_adapter_version": row.get("registry_adapter_version"),
        "registry_automation_policy_version": row.get("registry_automation_policy_version"),
        "registry_policy_hash": row.get("registry_policy_hash"),
        "registry_synced_at": row.get("registry_synced_at"),
        "registry_projection_ttl_hours": row.get("registry_projection_ttl_hours") or 168,
        "registry_health_ttl_hours": row.get("registry_health_ttl_hours") or 24,
        "registry_freshness_ttl_hours": row.get("registry_freshness_ttl_hours") or 24,
        "web_catalog_allowed": bool(row.get("web_catalog_allowed")),
        "source_attribution_required": bool(row.get("source_attribution_required")),
        "google_jobs_distribution_allowed": bool(row.get("google_jobs_distribution_allowed")),
        "third_party_job_distribution_allowed": bool(row.get("third_party_job_distribution_allowed")),
    }


def _recent_runs(session: requests.Session, source: str) -> list[dict[str, Any]]:
    ids = set(emitted_ids_for(source))
    ids.update({f"maintenance_{source}", f"{source}_scraper", f"{source}_scrapper"})
    response = session.get(
        f"{api_base()}/scraper_runs", headers=api_headers(),
        params={"select": "scraper_id,status,started_at,finished_at,error_summary,extraction_metrics", "scraper_id": f"in.({','.join(sorted(ids))})", "order": "started_at.desc", "limit": "100"}, timeout=30,
    )
    if response.status_code in {400, 404}:
        return [{"_telemetry_error": f"SCRAPER_RUNS_HTTP_{response.status_code}"}]
    response.raise_for_status()
    return response.json()


def run(source: str, *, limit: int | None, batch_size: int, max_runtime_seconds: int, explain: bool, session: requests.Session | None = None) -> dict[str, Any]:
    profile = resolve_emitted_source(source)
    session = session or requests.Session()
    started = time.monotonic()
    now = datetime.now(timezone.utc)
    policy = _source_policy(session, profile.source)
    health = operational_health_from_runs(_recent_runs(session, profile.source), profile, now=now)
    runtime_policy = {
        **policy,
        "certified": certification(profile)["certified"],
        "auto_enabled": profile.auto_enabled,
        "operational_health": health["status"],
        "health_fresh": health["fresh"],
        "health_observed_at": health["observed_at"],
        "health_source": health["evidence_source"],
    }
    total_rows = _count_source_rows(session, profile.source)
    values: list[dict[str, Any]] = []
    excluded: Counter[str] = Counter()
    rows_seen = offset = batches = 0
    scan_complete, stop_reason = True, None
    while True:
        if time.monotonic() - started >= max_runtime_seconds:
            scan_complete, stop_reason = False, "runtime_budget_reached"
            break
        if limit is not None and len(values) >= limit:
            scan_complete, stop_reason = False, "row_limit_reached"
            break
        page = _fetch_page(session, profile.source, offset, batch_size)
        if not page:
            break
        batches += 1
        rows_seen += len(page)
        offset += len(page)
        selected = []
        for row in page:
            if str(row.get("factory_status") or "").lower() not in AUTOMATION_FACTORY_STATUSES:
                excluded["factory_status_not_automation_state"] += 1
                continue
            if limit is not None and len(values) + len(selected) >= limit:
                excluded["row_limit"] += 1
                continue
            selected.append(row)
        observations = _latest_observations(session, profile.source, [str(row["id"]) for row in selected])
        for row in selected:
            values.append(evaluate_runtime_row(row, profile, observations.get(str(row["id"])), runtime_policy, now=now))
        if len(page) < batch_size:
            break
    summary = summarize_runtime_rows(values)
    result = {
        "source": profile.source, "mode": "DRY_RUN", "commit": False,
        "certified": certification(profile)["certified"], "auto_enabled": profile.auto_enabled,
        "total_source_rows": total_rows, "rows_seen": rows_seen, "rows_evaluated": len(values),
        "rows_skipped": int(sum(excluded.values())), "excluded": dict(sorted(excluded.items())),
        "batches": batches, "scan_complete": scan_complete, "incomplete": not scan_complete,
        "stop_reason": stop_reason, "runtime_seconds": round(time.monotonic() - started, 2), "runtime_budget_seconds": max_runtime_seconds,
        "health": health, **summary, "embeddings_generated": 0,
        # Bounded, read-only handoff for a one-row server-side canary.  It is
        # deliberately not an execution request and carries no secret.
        "canary_candidates": [
            {
                "opportunity_id": value["id"], "source": value["source"], "title": value["title"],
                "decision": value["actual"]["decision"], "reason_codes": value["actual"]["reason_codes"],
                "factory_status_current": value["factory_status_current"],
                "factory_status_proposed": value["factory_status_proposed"],
                "freshness": value["freshness"],
                "requested_actions": {"verification": True, "activation": True, "catalog": False, "matching": False, "alerts": False, "organic_seo": False, "google_jobs": False, "third_party_distribution": False},
            }
            for value in values if value["actual"]["decision"] == "AUTO_PROMOTE"
        ][:3],
    }
    if explain:
        for cluster in result["exception_clusters"]:
            print("AUTOMATION_RUNTIME_CLUSTER=" + json.dumps(cluster, ensure_ascii=False, sort_keys=True))
    print("CVITAE_SOURCE_AUTOMATION_RUNTIME=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="bounded evaluated-row limit")
    parser.add_argument("--full", action="store_true", help="scan all rows within the runtime budget")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--max-runtime-seconds", type=int, default=MAX_RUNTIME_SECONDS)
    parser.add_argument("--explain", action="store_true")
    args = parser.parse_args()
    if not args.dry_run:
        parser.error("This runtime is DRY-RUN only; pass --dry-run explicitly")
    if args.limit < 1:
        parser.error("--limit must be positive")
    if not 1 <= args.batch_size <= MAX_BATCH_SIZE:
        parser.error(f"--batch-size must be between 1 and {MAX_BATCH_SIZE}")
    if not 1 <= args.max_runtime_seconds <= 3600:
        parser.error("--max-runtime-seconds must be between 1 and 3600")
    load_local_env()
    try:
        profile = resolve_emitted_source(args.source)
    except ValueError:
        parser.error("--source is not registered")
    run(profile.source, limit=None if args.full else args.limit, batch_size=args.batch_size, max_runtime_seconds=args.max_runtime_seconds, explain=args.explain)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
