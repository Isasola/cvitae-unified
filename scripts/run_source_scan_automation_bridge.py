"""Source Intelligence automation bridge — exact scan_lineage scope.

Accepts a scraper_runs.run_id and processes ONLY the opportunities
that were PERSISTED in that exact run's scan_lineage. Never uses
timestamps, never amplifies to the whole source.

Usage:
    python scripts/run_source_scan_automation_bridge.py --run-id <run_id> [--dry-run]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from opportunity_automation import (
    AUTO_PROMOTE, BLOCK, HOLD, HUMAN_REVIEW, POLICY_VERSION,
    evaluate_opportunity_automation_policy,
)
from opportunity_factory import (
    EMBEDDING_INPUT_VERSION, PIPELINE_VERSION, RULES_VERSION,
    FactoryClient, seal,
)
from opportunity_promotion_executor import AtomicPromotionExecutor, PromotionRequest
from opportunity_sink import CONTENT_FINGERPRINT_FIELDS, SEMANTIC_FINGERPRINT_FIELDS, _fingerprint
from source_automation_runtime import evaluate_runtime_row, operational_health_from_runs
from source_registry_v2 import certification, runtime_projection, resolve_emitted_source
from run_opportunity_enrichment_batch import api_base, api_headers, load_local_env
from run_source_automation import _recent_runs


BRIDGE_VERSION = "source-scan-automation-bridge:v1"
MAX_BATCH_SIZE = 50

_REFETCH_FIELDS = tuple(sorted(set(
    CONTENT_FINGERPRINT_FIELDS + SEMANTIC_FINGERPRINT_FIELDS + (
        "id", "source", "updated_at", "factory_status", "embedding", "embedding_model",
        "verification_status", "is_active", "match_eligible", "catalog_eligible",
        "alerts_eligible", "seo_eligible", "source_authority", "original_source_verified",
        "remote_scope", "eligible_countries", "eligible_regions", "deadline",
        "application_url", "title", "organization", "description", "tags", "location",
        "country_code", "opportunity_type", "rubro", "type", "opportunity_kind",
        "eligibility_structure_mismatch", "geo_contradiction",
    )
)))

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


def _fetch_run(session: requests.Session, run_id: str) -> dict[str, Any]:
    response = session.get(
        f"{api_base()}/scraper_runs", headers=api_headers(),
        params={
            "select": "run_id,scraper_id,status,started_at,finished_at,extraction_metrics,error_summary",
            "run_id": f"eq.{run_id}",
            "limit": "1",
        },
        timeout=30,
    )
    response.raise_for_status()
    rows = response.json()
    if not rows:
        raise ValueError(f"run_not_found:{run_id}")
    return rows[0]


def _extract_persisted_ids(run: dict[str, Any]) -> list[str] | None:
    """Return deduplicated PERSISTED opportunity IDs from scan_lineage, or None if lineage missing."""
    metrics = run.get("extraction_metrics") or {}
    lineage = metrics.get("scan_lineage")
    if lineage is None:
        return None
    items = lineage.get("items") or []
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        oid = item.get("opportunity_id")
        if not oid or item.get("persistence") != "PERSISTED":
            continue
        s = str(oid)
        if s not in seen:
            seen.add(s)
            result.append(s)
    return result


def _source_from_run(run: dict[str, Any]) -> str:
    scraper_id = str(run.get("scraper_id") or "")
    for suffix in ("_scraper", "_scrapper"):
        if scraper_id.endswith(suffix):
            return scraper_id[: -len(suffix)]
    return scraper_id


def _extended_source_policy(session: requests.Session, source: str) -> dict[str, Any]:
    response = session.get(
        f"{api_base()}/opportunity_sources", headers=api_headers(),
        params={"select": _SOURCE_POLICY_FIELDS, "source": f"eq.{source}", "limit": "1"},
        timeout=30,
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


def _refetch_rows(session: requests.Session, ids: list[str]) -> list[dict[str, Any]]:
    if not ids:
        return []
    quoted = ",".join(f'"{str(v).replace(chr(34), "")}"' for v in ids[:MAX_BATCH_SIZE])
    response = session.get(
        f"{api_base()}/opportunities", headers=api_headers(),
        params={
            "select": ",".join(_REFETCH_FIELDS),
            "id": f"in.({quoted})",
            "deleted_at": "is.null",
            "archived_at": "is.null",
        },
        timeout=45,
    )
    response.raise_for_status()
    return response.json()


def _latest_observations(session: requests.Session, ids: list[str]) -> dict[str, dict[str, Any]]:
    if not ids:
        return {}
    quoted = ",".join(f'"{str(v).replace(chr(34), "")}"' for v in ids[:MAX_BATCH_SIZE])
    response = session.get(
        f"{api_base()}/opportunity_source_observations", headers=api_headers(),
        params={
            "select": "opportunity_id,identity_status,http_status,observed_at",
            "opportunity_id": f"in.({quoted})",
            "order": "observed_at.desc",
            "limit": str(max(1000, len(ids) * 3)),
        },
        timeout=30,
    )
    if response.status_code == 404:
        return {}
    response.raise_for_status()
    latest: dict[str, dict[str, Any]] = {}
    for item in response.json():
        latest.setdefault(str(item["opportunity_id"]), item)
    return latest


def _idempotency_key(run_id: str, opportunity_id: str, policy_version: str, registry_policy_hash: str) -> str:
    text = f"{run_id}:{opportunity_id}:{policy_version}:{registry_policy_hash}"
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _build_promotion_request(
    row: dict[str, Any],
    evaluation: dict[str, Any],
    profile: Any,
    runtime_policy: dict[str, Any],
    run: dict[str, Any],
    execution_id: str,
    registry_proj: dict[str, Any],
) -> PromotionRequest:
    actual = evaluation["actual"]
    gates = actual.get("downstream_gates", {})
    # Build allowed_actions from real downstream capabilities, not hardcoded
    allowed_actions: dict[str, bool] = {
        "verification": True,
        "activation": True,
        "catalog": bool(gates.get("web_catalog")),
        "matching": bool(gates.get("matching")),
        "alerts": bool(gates.get("alerts")),
        "organic_seo": bool(gates.get("organic_seo")),
        "google_jobs": bool(gates.get("google_jobs")),
        "third_party_distribution": bool(gates.get("third_party_distribution")),
    }

    policy_hash = runtime_policy.get("registry_policy_hash") or registry_proj["registry_policy_hash"]
    semantic_version = (
        runtime_policy.get("registry_semantic_version")
        or registry_proj["registry_semantic_version"]
        or profile.semantic_version
    )
    policy_version = runtime_policy.get("registry_automation_policy_version") or POLICY_VERSION

    # Extract gate evidence from evaluation (source_runtime_gate has health_fresh etc.)
    gate_evidence = actual.get("evidence", {}).get("source_runtime_gate") or actual.get("evidence", {})
    runtime_gate_evidence: dict[str, Any] = {
        "source": profile.source,
        "source_enabled": bool(gate_evidence.get("source_enabled", runtime_policy.get("source_enabled", True))),
        "certified": bool(gate_evidence.get("certified", False)),
        "auto_enabled": bool(gate_evidence.get("auto_enabled", False)),
        "operational_health": str(gate_evidence.get("operational_health") or "UNKNOWN").upper(),
        "health_fresh": bool(gate_evidence.get("health_fresh") or runtime_policy.get("health_fresh") or False),
        "health_observed_at": gate_evidence.get("health_observed_at") or runtime_policy.get("health_observed_at"),
        "distribution_allowed": bool(
            profile.web_catalog_allowed
            or runtime_policy.get("matching_enabled")
            or runtime_policy.get("alerts_enabled")
        ),
    }

    idem_key = _idempotency_key(
        run["run_id"], str(row["id"]), policy_version, policy_hash or ""
    )
    return PromotionRequest(
        opportunity_id=str(row["id"]),
        expected_updated_at=str(row["updated_at"]),
        policy_version=policy_version,
        source_certification_version=semantic_version,
        decision=AUTO_PROMOTE,
        reason_codes=tuple(actual.get("reason_codes", [])),
        allowed_actions=allowed_actions,
        runtime_gate_evidence=runtime_gate_evidence,
        registry_policy_hash=policy_hash or "",
        idempotency_key=idem_key,
        execution_id=execution_id,
        runtime_run_id=run["run_id"],
    )


def _update_run_metrics(
    session: requests.Session,
    run: dict[str, Any],
    enriched_items: dict[str, dict[str, Any]],
    bridge_summary: dict[str, Any],
) -> None:
    existing_metrics = dict(run.get("extraction_metrics") or {})
    existing_lineage = dict(existing_metrics.get("scan_lineage") or {})
    existing_items_list = existing_lineage.get("items") or []
    items_by_id = {item.get("opportunity_id"): dict(item) for item in existing_items_list if item.get("opportunity_id")}
    for oid, enrichment in enriched_items.items():
        if oid in items_by_id:
            items_by_id[oid].update(enrichment)
    existing_lineage["items"] = list(items_by_id.values())
    existing_metrics["scan_lineage"] = existing_lineage
    existing_metrics["automation_bridge"] = bridge_summary
    response = session.patch(
        f"{api_base()}/scraper_runs",
        headers={**api_headers(), "Prefer": "return=minimal"},
        params={"run_id": f"eq.{run['run_id']}"},
        json={"extraction_metrics": existing_metrics},
        timeout=30,
    )
    response.raise_for_status()


def run(
    run_id: str,
    *,
    dry_run: bool,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    session = session or requests.Session()
    started = time.monotonic()
    now = datetime.now(timezone.utc)
    execution_id = f"bridge:{run_id}:{int(now.timestamp())}"

    # 1. Fetch the scraper run
    try:
        scraper_run = _fetch_run(session, run_id)
    except (requests.HTTPError, ValueError) as exc:
        return {
            "status": "AUTOMATION_BRIDGE_FAILED",
            "reason": "RUN_FETCH_ERROR",
            "run_id": run_id,
            "error": str(exc)[:300],
        }

    # 2. Extract persisted IDs from exact scan_lineage — FAIL CLOSED if missing
    persisted_ids = _extract_persisted_ids(scraper_run)
    if persisted_ids is None:
        return {
            "status": "SCAN_LINEAGE_UNAVAILABLE",
            "run_id": run_id,
            "evaluated": 0,
            "auto_promote": 0,
        }
    if not persisted_ids:
        return {
            "status": "NO_PERSISTED_IDS",
            "run_id": run_id,
            "evaluated": 0,
            "auto_promote": 0,
        }

    # 3. Resolve source profile
    raw_source = _source_from_run(scraper_run)
    try:
        profile = resolve_emitted_source(raw_source)
    except ValueError as exc:
        return {
            "status": "AUTOMATION_BRIDGE_FAILED",
            "reason": "SOURCE_UNRESOLVABLE",
            "run_id": run_id,
            "source": raw_source,
            "error": str(exc),
        }

    # 4. Fetch durable source policy
    source_policy = _extended_source_policy(session, profile.source)

    # 5. Check registry coherence (fail closed; do not modify flags to pass)
    registry_proj = runtime_projection(profile)

    # 6. Derive health from recent runs
    recent = _recent_runs(session, profile.source)
    health = operational_health_from_runs(recent, profile, now=now)

    runtime_policy: dict[str, Any] = {
        **source_policy,
        "certified": certification(profile)["certified"],
        "auto_enabled": profile.auto_enabled,
        "operational_health": health["status"],
        "health_fresh": health["fresh"],
        "health_observed_at": health["observed_at"],
        "health_source": health["evidence_source"],
    }

    # 7. Factory sealing — only pending/failed rows, max 50 per batch, no embeddings
    factory = FactoryClient()
    seal_summary: dict[str, int] = {"sealed_ready": 0, "sealed_review": 0, "sealed_blocked": 0, "seal_conflict": 0, "seal_skipped": 0}

    if not dry_run:
        for batch_start in range(0, len(persisted_ids), MAX_BATCH_SIZE):
            batch = persisted_ids[batch_start: batch_start + MAX_BATCH_SIZE]
            rows_to_seal = factory.seal_candidates_by_ids(batch)
            for factory_row in rows_to_seal:
                content_fp = _fingerprint(factory_row, CONTENT_FINGERPRINT_FIELDS)
                semantic_fp = _fingerprint(factory_row, SEMANTIC_FINGERPRINT_FIELDS)
                status, stamps, evidence = seal(factory_row, now)
                snapshot = {
                    "content_fingerprint": content_fp,
                    "semantic_fingerprint": semantic_fp,
                    "pipeline_version": f"{PIPELINE_VERSION}:{EMBEDDING_INPUT_VERSION}",
                    "rules_version": RULES_VERSION,
                    "status": status,
                    "stamps": stamps,
                    "evidence": evidence,
                    "embedding_model": None,
                    "embedding_status": "pending",
                    "checked_at": now.isoformat(),
                }
                try:
                    factory.commit(factory_row, snapshot, None)
                    seal_summary[f"sealed_{status}"] = seal_summary.get(f"sealed_{status}", 0) + 1
                except requests.HTTPError as exc:
                    if exc.response is not None and exc.response.status_code == 409:
                        seal_summary["seal_conflict"] += 1
                        continue
                    raise

    # 8. REFETCH all persisted rows after factory commit (get fresh updated_at)
    all_rows: list[dict[str, Any]] = []
    for batch_start in range(0, len(persisted_ids), MAX_BATCH_SIZE):
        batch = persisted_ids[batch_start: batch_start + MAX_BATCH_SIZE]
        all_rows.extend(_refetch_rows(session, batch))
    rows_by_id = {str(row["id"]): row for row in all_rows}

    # 9. Latest observations for evaluator
    observations = _latest_observations(session, list(rows_by_id.keys()))

    # 10. Evaluate each row with existing evaluator
    evaluations: dict[str, dict[str, Any]] = {}
    for oid, row in rows_by_id.items():
        evaluations[oid] = evaluate_runtime_row(row, profile, observations.get(oid), runtime_policy, now=now)

    # 11. Promotion — only AUTO_PROMOTE with factory_status=ready
    executor = AtomicPromotionExecutor(api_base(), api_headers(), session)
    promotion_results: dict[str, dict[str, Any]] = {}
    issue_groups: dict[str, int] = {}

    for oid, evaluation in evaluations.items():
        row = rows_by_id[oid]
        actual = evaluation["actual"]
        decision = actual["decision"]

        if decision != AUTO_PROMOTE:
            for code in actual.get("reason_codes") or []:
                issue_groups[code] = issue_groups.get(code, 0) + 1
            promotion_results[oid] = {
                "promotion_status": "NOT_ELIGIBLE",
                "decision": decision,
                "reason_codes": actual.get("reason_codes"),
            }
            continue

        if evaluation["factory_status_current"] != "ready":
            issue_groups["FACTORY_NOT_READY"] = issue_groups.get("FACTORY_NOT_READY", 0) + 1
            promotion_results[oid] = {
                "promotion_status": "NOT_ELIGIBLE",
                "decision": decision,
                "reason": "factory_not_ready",
                "factory_status": evaluation["factory_status_current"],
            }
            continue

        if dry_run:
            promotion_results[oid] = {"promotion_status": "DRY_RUN", "decision": decision}
            continue

        try:
            req = _build_promotion_request(row, evaluation, profile, runtime_policy, scraper_run, execution_id, registry_proj)
            result = executor.apply(req)
            if result.get("idempotent_replay"):
                promotion_results[oid] = {"promotion_status": "IDEMPOTENT_REPLAY"}
            else:
                promotion_results[oid] = {"promotion_status": "APPLIED"}
        except requests.HTTPError as exc:
            code = exc.response.status_code if exc.response is not None else 0
            issue_groups["RPC_REJECTED"] = issue_groups.get("RPC_REJECTED", 0) + 1
            promotion_results[oid] = {
                "promotion_status": "RPC_REJECTED",
                "reason": f"http_{code}:{str(exc)[:200]}",
            }
        except ValueError as exc:
            issue_groups["RPC_VALIDATION_FAILED"] = issue_groups.get("RPC_VALIDATION_FAILED", 0) + 1
            promotion_results[oid] = {
                "promotion_status": "RPC_REJECTED",
                "reason": str(exc)[:200],
            }

    # 12. Compute summary counts
    decision_counts: dict[str, int] = {AUTO_PROMOTE: 0, HUMAN_REVIEW: 0, HOLD: 0, BLOCK: 0}
    promo_counts: dict[str, int] = {"applied": 0, "idempotent": 0, "rpc_rejected": 0, "not_eligible": 0, "dry_run": 0}
    for oid, result in promotion_results.items():
        decision = evaluations[oid]["actual"]["decision"]
        decision_counts[decision] = decision_counts.get(decision, 0) + 1
        status = result["promotion_status"]
        if status == "APPLIED":
            promo_counts["applied"] += 1
        elif status == "IDEMPOTENT_REPLAY":
            promo_counts["idempotent"] += 1
        elif status == "RPC_REJECTED":
            promo_counts["rpc_rejected"] += 1
        elif status == "NOT_ELIGIBLE":
            promo_counts["not_eligible"] += 1
        elif status == "DRY_RUN":
            promo_counts["dry_run"] += 1

    # 13. Enrich scan_lineage items with automation results
    enriched_items: dict[str, dict[str, Any]] = {}
    for oid, evaluation in evaluations.items():
        row = rows_by_id[oid]
        result = promotion_results.get(oid, {})
        enriched_items[oid] = {
            "factory_status": evaluation["factory_status_current"],
            "automation_decision": evaluation["actual"]["decision"],
            "automation_reason_codes": evaluation["actual"].get("reason_codes"),
            "requested_actions": evaluation["actual"].get("downstream_gates"),
            "promotion_status": result.get("promotion_status", "NOT_EVALUATED"),
            "promotion_reason": result.get("reason"),
            "embedding_status": "pending" if row.get("embedding") is None and row.get("match_eligible") else "n/a",
        }

    bridge_summary: dict[str, Any] = {
        "version": BRIDGE_VERSION,
        "status": "DRY_RUN" if dry_run else "COMPLETED",
        "run_id": run_id,
        "execution_id": execution_id,
        "evaluated": len(evaluations),
        "auto_promote": decision_counts.get(AUTO_PROMOTE, 0),
        "human_review": decision_counts.get(HUMAN_REVIEW, 0),
        "hold": decision_counts.get(HOLD, 0),
        "block": decision_counts.get(BLOCK, 0),
        "promoted": promo_counts["applied"],
        "idempotent_replay": promo_counts["idempotent"],
        "promotion_failed": promo_counts["rpc_rejected"],
        "not_eligible": promo_counts["not_eligible"],
        "matching_enabled": bool(runtime_policy.get("matching_enabled")),
        "embedding_pending": sum(1 for row in rows_by_id.values() if row.get("embedding") is None and row.get("match_eligible")),
        "seal_summary": seal_summary,
        "issue_groups": issue_groups,
        "runtime_seconds": round(time.monotonic() - started, 2),
    }

    # 14. Persist results back to scraper_runs (dry_run skips write)
    if not dry_run:
        try:
            _update_run_metrics(session, scraper_run, enriched_items, bridge_summary)
        except requests.HTTPError as exc:
            bridge_summary["metrics_write_error"] = str(exc)[:200]

    return bridge_summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True, help="scraper_runs.run_id")
    parser.add_argument("--dry-run", action="store_true", help="No writes to DB")
    args = parser.parse_args()
    load_local_env()
    result = run(args.run_id, dry_run=args.dry_run)
    print("CVITAE_BRIDGE_RESULT=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    status = result.get("status", "")
    if status in {"SCAN_LINEAGE_UNAVAILABLE", "AUTOMATION_BRIDGE_FAILED"}:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
