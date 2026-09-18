"""Recurring, source-aware opportunity maintenance (dry-run by default).

Adapters extract; profiles define source expectations; this orchestrator owns
bounded retries, durable observations, atomic enrichment/policy calls and
incremental embedding reconciliation.  It never directly updates lifecycle or
distribution fields.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import subprocess
import sys
import time
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from source_adapters import AtomicEnricher, coverage, health
from source_cleaners import PROFILES, get_profile
from source_identity import confirm_identity
from source_policy import classify_source_policy
from source_reconciliation import diff_before_apply, impact_report
from source_registry_v2 import certification, emitted_ids_for, resolve_emitted_source
from source_scouts import scout_source
from run_opportunity_enrichment_batch import (
    ADAPTERS, SELECT_FIELDS, adapt, api_base, api_headers, canonical_source,
    changed_patch, load_local_env, metrics_for, observation_payload,
    observation_exclusion, persist_observations, quality_signals,
    recent_enrichments, recent_observations, select_candidates, himalayas_current_rows,
    latest_himalayas_deep_cursor,
)
from run_source_policy_reconciliation import SourcePolicyApplier

MAX_CHUNK = 50
DEFAULT_CHUNK = 50
MAX_EMPTY_PAGES = 2
MAX_RUNTIME_SECONDS = 50 * 60
_SESSIONS = threading.local()


def assert_remote_apply() -> None:
    """Scheduled or manual maintenance must never mutate a local test target."""
    host = (urlparse(os.environ["SUPABASE_URL"]).hostname or "").casefold()
    if host in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("source_maintenance_apply_requires_remote_supabase")


def fetch_inventory(source: str, chunk_size: int, opportunity_id: str | None = None) -> list[dict[str, Any]]:
    """Paginate a source inventory.  At most one source is held in memory."""
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        params: dict[str, str] = {
            "select": SELECT_FIELDS, "deleted_at": "is.null", "archived_at": "is.null",
            "order": "updated_at.asc,id.asc", "limit": str(1 if opportunity_id else chunk_size),
        }
        if opportunity_id:
            params["id"] = f"eq.{opportunity_id}"
        else:
            params["source"] = f"in.({','.join(emitted_ids_for(source))})"
            params["offset"] = str(offset)
        response = requests.get(f"{api_base()}/opportunities", headers=api_headers(), params=params, timeout=45)
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if opportunity_id or len(page) < chunk_size:
            break
        offset += len(page)
    return rows


def diagnosis(rows: list[dict[str, Any]], source: str) -> dict[str, Any]:
    quality = Counter(signal for row in rows for signal in quality_signals(row))
    active = [row for row in rows if row.get("catalog_eligible") or row.get("match_eligible")]
    return {
        "source": source, "inventory": len(rows), "degraded": sum(bool(quality_signals(row)) for row in rows),
        "catalog_active": sum(bool(row.get("catalog_eligible")) for row in rows),
        "matching_active": sum(bool(row.get("match_eligible")) for row in rows),
        "embedding_ready": sum(row.get("embedding") is not None for row in active),
        "embedding_missing": sum(row.get("embedding") is None for row in active),
        "quality_signals": dict(sorted(quality.items())),
        "samples": {signal: [str(row["id"]) for row in rows if signal in quality_signals(row)][:3] for signal in sorted(quality)},
    }


def worker_session(profile: Any) -> requests.Session:
    """One pooled session per worker; source adapters receive it explicitly."""
    key = f"{profile.source}:{profile.max_workers}"
    sessions = getattr(_SESSIONS, "items", {})
    if key not in sessions:
        session = requests.Session()
        session.mount("https://", HTTPAdapter(pool_connections=profile.max_workers, pool_maxsize=profile.max_workers, max_retries=0))
        sessions[key] = session
        _SESSIONS.items = sessions
    return sessions[key]


def retry_detail(source: str, row: dict[str, Any], source_payload: dict[str, Any] | None = None) -> Any:
    profile = resolve_emitted_source(source)
    session = worker_session(profile)
    result = adapt(source, row, source_payload=source_payload, session=session)
    for attempt in range(profile.retry_attempts):
        if result.source_status not in {0, 429, 500, 502, 503, 504}:
            break
        time.sleep(min(8.0, profile.retry_base_seconds * (2 ** attempt) + random.random() * .25))
        result = adapt(source, row, source_payload=source_payload, session=session)
    return result


def circuit_breaker(profile: Any, plans: list[tuple[dict[str, Any], Any, dict[str, Any], Any]]) -> str | None:
    if not plans:
        return None
    live = [result for _, result, _, identity in plans if identity.status not in {"DEAD", "REMOVED"} and result.source_status not in {404, 410}]
    if sum(result.source_status == 429 for _, result, _, _ in plans) >= 2:
        return "rate_limited"
    transient = sum(result.source_status in {0, 500, 502, 503, 504} for _, result, _, _ in plans)
    if transient >= 2:
        return "network_transient"
    if len(live) < 5:
        return None
    parsed = sum(result.source_status == 200 and bool(result.title) and result.evidence.get("detail_match", True) for result in live)
    mismatches = sum(result.evidence.get("detail_match") is False for result in live)
    if parsed / len(live) < profile.expected_live_parse_rate:
        return "parser_failure_rate"
    if mismatches / len(live) > profile.max_detail_mismatch_rate:
        return "detail_mismatch_rate"
    return None


def reconcile_embeddings(ids: list[str], apply: bool) -> dict[str, int]:
    """Use the existing factory/RPC; only match-active, invalidated IDs enter."""
    if not ids:
        return {"invalidated": 0, "regenerated": 0, "failed": 0}
    if not apply:
        return {"invalidated": len(ids), "regenerated": 0, "failed": 0}
    command = [sys.executable, str(ROOT / "scripts" / "opportunity_factory.py"), "--ids", ",".join(ids[:MAX_CHUNK])]
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=15 * 60)
    if completed.returncode:
        return {"invalidated": len(ids), "regenerated": 0, "failed": len(ids)}
    summary = next((line.split("=", 1)[1] for line in completed.stdout.splitlines() if line.startswith("CVITAE_FACTORY_SUMMARY=")), "{}")
    try:
        parsed = json.loads(summary)
    except json.JSONDecodeError:
        parsed = {}
    return {"invalidated": len(ids), "regenerated": int(parsed.get("embedded", 0)), "failed": int(parsed.get("failed", 0))}


def persist_maintenance_run(summary: dict[str, Any]) -> None:
    """Use the established scraper_runs telemetry contract; no new log table."""
    payload = {
        "run_id": f"source-maintenance-{summary['source']}-{int(datetime.now(timezone.utc).timestamp())}",
        "scraper_id": f"maintenance_{summary['source']}",
        "scraper_name": f"Source maintenance {summary['source']}",
        "script_path": "scripts/run_source_maintenance.py", "trigger_type": "maintenance",
        "status": "healthy" if summary.get("health", {}).get("status") == "HEALTHY" else "warning",
        "started_at": summary["started_at"], "finished_at": summary["finished_at"],
        "duration_seconds": summary["duration_seconds"], "found_count": summary["processed"],
        "valid_count": summary["live"], "adapter_version": summary["adapter_version"],
        "extraction_metrics": summary,
    }
    response = requests.post(f"{api_base()}/scraper_runs", headers={**api_headers(), "Prefer": "return=minimal"}, json=payload, timeout=30)
    response.raise_for_status()


def assert_apply_authorized(profile: Any) -> dict[str, Any]:
    """Fail closed before any source work when autonomous maintenance is off."""
    certificate = certification(profile)
    if not certificate["certified"]:
        raise RuntimeError(f"source_not_certified:{profile.source}")
    if not profile.auto_enabled:
        raise RuntimeError(f"source_auto_not_enabled:{profile.source}")
    return certificate


def process_source(source: str, apply: bool, chunk_size: int, max_items: int | None, opportunity_id: str | None, explain: bool, diagnose_only: bool, verbose_items: bool = False) -> dict[str, Any]:
    started = datetime.now(timezone.utc)
    profile = get_profile(source)
    certificate = certification(profile)
    if apply:
        assert_apply_authorized(profile)
    rows = fetch_inventory(source, chunk_size, opportunity_id)
    source_payloads: dict[str, dict[str, Any]] = {}
    himalayas_inventory: dict[str, Any] | None = None
    # Himalayas reconciles against one shared structured API inventory.  It
    # never falls back to per-row HTML detail fetches or treats feed absence as
    # death; unmatched historical rows remain visible in inventory diagnostics.
    if source == "himalayas" and not diagnose_only:
        resume_cursor = None if opportunity_id else latest_himalayas_deep_cursor()
        pairs, himalayas_inventory = himalayas_current_rows(profile.max_detail_fetches_per_run, opportunity_id, start_cursor=resume_cursor)
        rows = [row for row, _ in pairs]
        source_payloads = {str(row["id"]): raw for row, raw in pairs}
    summary: dict[str, Any] = {"source": source, "mode": "APPLY" if apply else "DRY_RUN", "adapter_version": profile.adapter_version, "inventory": len(rows), "considered": 0, "fresh_skipped": 0, "processed": 0, "live": 0, "removed": 0, "hard_dead_suppressed": 0, "rescued": 0, "failed": 0, "transient": 0, "mismatch": 0, "descriptions_restored": 0, "geo_corrected": 0, "eligibility_corrected": 0, "remote_scope_corrected": 0, "semantic_rows_changed": 0, "embeddings_invalidated": 0, "embeddings_regenerated": 0, "embeddings_failed": 0, "exceptions": [], "circuit_breaker": None}
    # A scout is deliberately bounded and never declares a missing item dead.
    # It gives the run cheap current-source context before any detail fetch.
    snapshot = scout_source(source, profile.scout)
    summary["scout"] = {"strategy": snapshot.strategy, "native_ids": len(snapshot.native_ids), "urls": len(snapshot.urls), "metadata": snapshot.metadata}
    summary["diagnosis"] = diagnosis(rows, source)
    if himalayas_inventory is not None:
        summary["himalayas_inventory"] = himalayas_inventory
    if diagnose_only:
        return summary
    if profile.adapter is None:
        summary["skipped"] = "adapter_not_validated"
        return summary
    summary["certification"] = certificate
    now = datetime.now(timezone.utc)
    # Dry diagnosis remains useful against a local schema that has not received
    # the append-only audit migrations.  APPLY still fails closed below.
    try:
        enrichments = recent_enrichments(source, now)
    except requests.HTTPError as exc:
        if apply or exc.response is None or exc.response.status_code != 404:
            raise
        enrichments = {}
        summary["exceptions"].append("enrichment_events_schema_unavailable")
    observations, observations_available = recent_observations(source, now)
    selected, selection, details = select_candidates(rows, len(rows), opportunity_id, enrichments, observations, now)
    summary["selection"] = selection
    summary["considered"] = selection["considered"]
    summary["fresh_skipped"] = selection["excluded"]["recent_enrichment"] + sum(value for key, value in selection["excluded"].items() if key.startswith("recent_"))
    eligible_queue_count = len(selected)
    work_budget = min(profile.max_detail_fetches_per_run, max_items if max_items is not None else profile.max_detail_fetches_per_run)
    selected = selected[:work_budget]
    if not observations_available and apply:
        raise RuntimeError("source_observations_schema_required_for_apply")
    # Recent hard-dead observations are intentionally excluded from detail
    # fetches by TTL, but they still need policy reconciliation exactly once.
    # The RPC re-reads the latest observation under lock, so this is safe if a
    # subsequent live observation arrived after our read.
    policy_candidates = [
        (row, classify_source_policy(row, observations.get(str(row["id"]))))
        for row in rows
    ]
    summary["hard_dead_pending"] = sum(decision.action == "SUPPRESS" for _, decision in policy_candidates)
    all_plans: list[tuple[dict[str, Any], Any, dict[str, Any], Any]] = []
    enricher = AtomicEnricher(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]) if apply else None
    policy = SourcePolicyApplier() if apply else None
    if apply:
        for row, decision in policy_candidates:
            if decision.action != "SUPPRESS":
                continue
            try:
                response = policy.apply(row, decision)
                if response.get("changed"):
                    summary["hard_dead_suppressed"] += 1
            except requests.RequestException:
                summary["failed"] += 1
    deadline = time.monotonic() + MAX_RUNTIME_SECONDS
    workers = profile.min_workers
    max_workers_used = workers
    for index in range(0, len(selected), chunk_size):
        if time.monotonic() >= deadline:
            summary["circuit_breaker"] = "runtime_ceiling"
            break
        chunk = selected[index:index + chunk_size]
        plans: list[tuple[dict[str, Any], Any, dict[str, Any], Any]] = []
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix=f"cvitae-{source}") as pool:
            def fetch_row(row: dict[str, Any]) -> Any:
                payload = source_payloads.get(str(row["id"]))
                return retry_detail(source, row, payload) if payload is not None else retry_detail(source, row)
            results = list(pool.map(fetch_row, chunk))
        for row, result in zip(chunk, results):
            identity = confirm_identity(source, row, result)
            patch = changed_patch(result, row, identity)
            plans.append((row, result, patch, identity))
            if patch:
                summary["semantic_rows_changed"] += 1
                if "description" in patch: summary["descriptions_restored"] += 1
                if {"location", "country_code", "onsite_country"}.intersection(patch): summary["geo_corrected"] += 1
                if {"eligible_countries", "eligible_regions"}.intersection(patch): summary["eligibility_corrected"] += 1
                if {"remote", "remote_scope"}.intersection(patch): summary["remote_scope_corrected"] += 1
            if identity.status in {"DEAD", "REMOVED"}: summary["removed"] += 1
            elif result.source_status == 0: summary["transient"] += 1
            elif identity.status == "IDENTITY_MISMATCH": summary["mismatch"] += 1
            elif result.source_status == 200: summary["live"] += 1
        all_plans.extend(plans)
        breaker = circuit_breaker(profile, plans)
        if breaker:
            summary["circuit_breaker"] = breaker
            if apply:
                break
        if verbose_items:
            for row, result, patch, identity in plans:
                print(json.dumps({"id": row["id"], "priority": details[str(row["id"])], "identity": identity.status, "http_status": result.source_status, "patch": {key: (len(value) if key == "description" else value) for key, value in patch.items()}, "recommendation": result.recommendation}, ensure_ascii=True))
        elif explain:
            print(f"[{source}] {index + len(chunk)}/{len(selected)} processed | live {summary['live']} | removed {summary['removed']} | transient {summary['transient']} | remaining ~{max(0, len(selected) - index - len(chunk))}")
        if not apply:
            continue
        persist_observations(plans)
        embedding_ids: list[str] = []
        for row, result, patch, identity in plans:
            decision = classify_source_policy(row, {"id": None, "identity_status": identity.status, "http_status": result.source_status})
            if decision.action == "SUPPRESS":
                try:
                    response = policy.apply(row, decision)
                    if response.get("changed"):
                        summary["hard_dead_suppressed"] += 1
                except requests.RequestException:
                    summary["failed"] += 1
                continue
            if not patch:
                continue
            outcome = enricher.enrich_existing(result, row)
            if outcome.status == "changed":
                summary["rescued"] += 1
                if row.get("match_eligible"):
                    embedding_ids.append(str(row["id"]))
            elif outcome.status in {"failed", "stale"}:
                summary["failed"] += 1
        embedding = reconcile_embeddings(embedding_ids, apply=True)
        for key, value in embedding.items():
            summary[f"embeddings_{key}"] = summary.get(f"embeddings_{key}", 0) + value
        if summary["circuit_breaker"]:
            break
        successes = sum(result.source_status == 200 for _, result, _, _ in plans)
        if successes == len(plans) and workers < profile.max_workers:
            workers += 1
        elif any(result.source_status in {429, 500, 502, 503, 504} for _, result, _, _ in plans):
            workers = max(profile.min_workers, workers - 1)
        max_workers_used = max(max_workers_used, workers)
    metrics = metrics_for(all_plans, len(all_plans)) if all_plans else {"health": {"status": "UNKNOWN", "reasons": ["queue_empty"]}, "coverage_live": coverage([])}
    summary["processed"] = len(all_plans)
    summary["health"] = metrics["health"]
    if summary["circuit_breaker"] in {"network_transient", "rate_limited"}:
        summary["health"] = {"status": "WARNING", "reasons": [summary["circuit_breaker"]]}
    summary["coverage_after"] = metrics.get("coverage_live", {})
    summary["diff_before_apply"] = diff_before_apply(all_plans, suppressions=sum(1 for _, decision in policy_candidates if decision.action == "SUPPRESS"))
    summary["reconciliation_impact"] = impact_report(summary["diff_before_apply"])
    summary["queue_remaining"] = max(0, eligible_queue_count - len(all_plans))
    summary["detail_fetches"] = len(all_plans)
    summary["detail_success"] = sum(result.source_status == 200 for _, result, _, _ in all_plans)
    summary["detail_transient"] = summary["transient"]
    summary["max_concurrency_used"] = max_workers_used
    summary["started_at"] = started.isoformat()
    summary["finished_at"] = datetime.now(timezone.utc).isoformat()
    summary["duration_seconds"] = round((datetime.now(timezone.utc) - started).total_seconds(), 2)
    if apply:
        persist_maintenance_run(summary)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--apply", action="store_true"); parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--diagnose", action="store_true"); parser.add_argument("--explain", action="store_true"); parser.add_argument("--verbose-items", action="store_true")
    parser.add_argument("--chunk-size", type=int, default=DEFAULT_CHUNK); parser.add_argument("--max-items", type=int)
    parser.add_argument("--id", dest="opportunity_id")
    args = parser.parse_args(); load_local_env()
    if args.chunk_size < 1 or args.chunk_size > MAX_CHUNK: parser.error("--chunk-size debe estar entre 1 y 50")
    if args.max_items is not None and args.max_items < 1: parser.error("--max-items debe ser positivo")
    if args.apply: assert_remote_apply()
    if args.source == "all":
        requested = sorted(PROFILES)
    else:
        try:
            source = resolve_emitted_source(args.source).source
        except ValueError:
            parser.error("--source no esta registrado")
        if source not in PROFILES:
            parser.error("--source no está registrado")
        requested = [source]
    outputs = []
    auto_skipped = 0
    for source in requested:
        if args.apply and args.source == "all" and (not get_profile(source).auto_enabled or not certification(get_profile(source))["certified"]):
            auto_skipped += 1
            continue
        outputs.append(process_source(source, args.apply, args.chunk_size, args.max_items, args.opportunity_id, args.explain, args.diagnose, args.verbose_items))
    if args.source == "all" and args.diagnose:
        nonempty = [
            {"source": item["source"], "inventory": item["inventory"], "degraded": item["diagnosis"]["degraded"], "adapter": item["adapter_version"], "auto_enabled": get_profile(item["source"]).auto_enabled,
             "failure_classes": item["diagnosis"]["quality_signals"]}
            for item in outputs if item["inventory"]
        ]
        print("CVITAE_SOURCE_MAINTENANCE_DIAGNOSIS=" + json.dumps({"nonempty_sources": nonempty, "sources_with_inventory": len(nonempty)}, ensure_ascii=True, sort_keys=True))
    else:
        for item in outputs:
            print("CVITAE_SOURCE_MAINTENANCE=" + json.dumps(item, ensure_ascii=True, sort_keys=True))
    if args.source == "all":
        registry = {
            "sources_registered": len(PROFILES),
            "sources_active": sum(profile.active for profile in PROFILES.values()),
            "sources_auto_enabled": sum(profile.auto_enabled for profile in PROFILES.values()),
            "sources_paused": sum(not profile.active for profile in PROFILES.values()),
            "sources_needing_validation": sum(profile.adapter is None or not profile.auto_enabled for profile in PROFILES.values()),
            "sources_skipped_auto_disabled": auto_skipped,
        }
        print("CVITAE_SOURCE_MAINTENANCE_REGISTRY=" + json.dumps(registry, ensure_ascii=True, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
