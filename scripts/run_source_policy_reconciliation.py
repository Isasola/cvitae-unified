"""Bounded, source-agnostic hard-dead suppression reconciliation (dry-run by default)."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers")); sys.path.insert(0, str(ROOT / "scripts"))
from source_policy import SourcePolicyDecision, classify_source_policy
from run_opportunity_enrichment_batch import load_local_env
from source_registry_v2 import emitted_ids_for, resolve_emitted_source

MAX_LIMIT = 50
SELECT_FIELDS = "id,source,updated_at,catalog_eligible,match_eligible,deleted_at,archived_at"


def api_headers() -> dict[str, str]:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def api_base() -> str:
    return os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"


def assert_apply_target() -> None:
    hostname = (urlparse(os.environ["SUPABASE_URL"]).hostname or "").casefold()
    if hostname in {"localhost", "127.0.0.1", "::1"} and os.getenv("CVITAE_ALLOW_LOCAL_SOURCE_POLICY") != "1":
        raise RuntimeError("apply_requires_nonlocal_supabase_target")


def fetch_candidates(source: str, limit: int, opportunity_id: str | None = None) -> list[dict[str, Any]]:
    params: dict[str, str] = {"select": SELECT_FIELDS, "deleted_at": "is.null", "archived_at": "is.null", "order": "updated_at.asc,id.asc", "limit": str(1 if opportunity_id else MAX_LIMIT)}
    if opportunity_id:
        params["id"] = f"eq.{opportunity_id}"
    else:
        # Include already-suppressed rows too: they are the only rows that can
        # become RESTORE candidates.  The policy classifier/RPC remains the
        # hard gate, so expanding this read does not weaken mutation safety.
        params["source"] = f"in.({','.join(emitted_ids_for(source))})"
    response = requests.get(f"{api_base()}/opportunities", headers=api_headers(), params=params, timeout=30)
    response.raise_for_status()
    return response.json()[:limit]


def _chunks(values: list[str], size: int = 100) -> list[list[str]]:
    return [values[index:index + size] for index in range(0, len(values), size)]


def latest_observations(source: str, opportunity_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Resolve newest evidence per opportunity with bounded batched reads, never N+1."""
    latest: dict[str, dict[str, Any]] = {}
    for chunk in _chunks(opportunity_ids):
        values = ",".join(f'"{value.replace(chr(34), "")}"' for value in chunk)
        params = {"select": "id,opportunity_id,source,adapter_version,identity_status,identity_method,identity_reason,http_status,detail_url,canonical_url,observed_at", "source": f"in.({','.join(emitted_ids_for(source))})", "opportunity_id": f"in.({values})", "order": "observed_at.desc,id.desc", "limit": "1000"}
        response = requests.get(f"{api_base()}/opportunity_source_observations", headers=api_headers(), params=params, timeout=30)
        response.raise_for_status()
        for item in response.json():
            latest.setdefault(str(item["opportunity_id"]), item)
    return latest


def latest_policy_actions(source: str, opportunity_ids: list[str]) -> dict[str, str]:
    """Return the latest policy action per row, with source aliases included.

    A RESTORE is eligible only after a durable SUPPRESS event.  This is a
    read-side hint; the restore RPC independently revalidates it under lock.
    """
    latest: dict[str, str] = {}
    for chunk in _chunks(opportunity_ids):
        values = ",".join(f'"{value.replace(chr(34), "")}"' for value in chunk)
        params = {
            "select": "opportunity_id,action,created_at,id",
            "source": f"in.({','.join(emitted_ids_for(source))})",
            "opportunity_id": f"in.({values})",
            "order": "created_at.desc,id.desc",
            "limit": "1000",
        }
        response = requests.get(f"{api_base()}/opportunity_source_policy_events", headers=api_headers(), params=params, timeout=30)
        response.raise_for_status()
        for item in response.json():
            latest.setdefault(str(item["opportunity_id"]), str(item.get("action") or ""))
    return latest


def metrics_for(decisions: list[SourcePolicyDecision]) -> dict[str, int]:
    metrics = {"considered": len(decisions), "hard_dead": 0, "eligible_for_suppression": 0, "restorations_expected": 0, "already_suppressed": 0, "suppressed": 0, "restored": 0, "noop": 0, "failed": 0, "latest_live": 0, "ambiguous": 0, "network_or_transient": 0}
    for decision in decisions:
        hard_dead = any(reason.startswith("latest_observation_removed") or reason.startswith("latest_observation_dead") for reason in decision.reasons)
        if hard_dead:
            metrics["hard_dead"] += 1
        if decision.action == "SUPPRESS":
            metrics["eligible_for_suppression"] += 1
        elif decision.action == "RESTORE":
            metrics["restorations_expected"] += 1
        else:
            metrics["noop"] += 1
        if "already_suppressed" in decision.reasons:
            metrics["already_suppressed"] += 1
        if "latest_live" in decision.reasons:
            metrics["latest_live"] += 1
        if "network_or_transient" in decision.reasons:
            metrics["network_or_transient"] += 1
        if "ambiguous_latest_observation" in decision.reasons or "missing_observation" in decision.reasons:
            metrics["ambiguous"] += 1
    return metrics


class SourcePolicyApplier:
    """Only calls the database-owned atomic policy RPC; never PATCHes opportunities."""
    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()

    def apply(self, row: dict[str, Any], decision: SourcePolicyDecision) -> dict[str, Any]:
        endpoint = {
            "SUPPRESS": "apply_source_policy_suppression_atomic",
            "RESTORE": "apply_source_policy_restore_atomic",
        }.get(decision.action)
        if not endpoint:
            return {"changed": False, "reason": "policy_noop"}
        response = self.session.post(
            f"{api_base()}/rpc/{endpoint}", headers=api_headers(),
            json={"p_opportunity_id": row["id"], "p_source": row["source"], "p_expected_updated_at": row["updated_at"]}, timeout=30,
        )
        response.raise_for_status()
        return response.json()


def display(row: dict[str, Any], decision: SourcePolicyDecision) -> dict[str, Any]:
    return {"id": row["id"], "source": row["source"], "policy": decision.policy, "decision": decision.action, "reasons": decision.reasons, "observation_id": decision.observation_id, "would_change": decision.would_change}


def run(source: str, limit: int, apply: bool, opportunity_id: str | None = None, explain: bool = False) -> tuple[list[dict[str, Any]], dict[str, int]]:
    rows = fetch_candidates(source, limit, opportunity_id)
    observations = latest_observations(source, [str(row["id"]) for row in rows])
    policy_actions = latest_policy_actions(source, [str(row["id"]) for row in rows])
    pairs = [
        (row, classify_source_policy(
            row,
            observations.get(str(row["id"])),
            previously_suppressed=policy_actions.get(str(row["id"])) == "SUPPRESS",
        ))
        for row in rows
    ]
    output = [display(row, decision) for row, decision in pairs]
    metrics = metrics_for([decision for _, decision in pairs])
    if explain:
        for item in output:
            print(json.dumps(item, ensure_ascii=True))
    print("CVITAE_SOURCE_POLICY=" + json.dumps({"mode": "APPLY" if apply else "DRY_RUN", "source": source, "metrics": metrics}, ensure_ascii=True))
    if not apply:
        return output, metrics
    assert_apply_target()
    applier = SourcePolicyApplier()
    for row, decision in pairs:
        if decision.action not in {"SUPPRESS", "RESTORE"}:
            continue
        try:
            result = applier.apply(row, decision)
            if result.get("changed"):
                if decision.action == "SUPPRESS": metrics["suppressed"] += 1
                else: metrics["restored"] = metrics.get("restored", 0) + 1
                metrics["noop"] -= 0
            else:
                metrics["noop"] += 1
        except requests.RequestException:
            metrics["failed"] += 1
    print("CVITAE_SOURCE_POLICY_APPLY=" + json.dumps({"source": source, "metrics": metrics}, ensure_ascii=True))
    return output, metrics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True); parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--id", dest="opportunity_id"); parser.add_argument("--apply", action="store_true"); parser.add_argument("--explain", action="store_true")
    args = parser.parse_args(); load_local_env()
    if args.limit < 1 or args.limit > MAX_LIMIT:
        parser.error(f"--limit debe estar entre 1 y {MAX_LIMIT}")
    try:
        source = resolve_emitted_source(args.source).source
    except ValueError:
        parser.error("--source no soportado")
    print(f"{'APPLY' if args.apply else 'DRY RUN'} MODE source={source} limit={args.limit}")
    run(source, args.limit, args.apply, args.opportunity_id, args.explain)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
