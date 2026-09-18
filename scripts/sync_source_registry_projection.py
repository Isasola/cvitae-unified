"""Synchronize the durable, fail-closed Source Registry V2 projection.

The Python registry is authoritative.  This command only mirrors the minimal
mutation-time fields onto ``opportunity_sources``; it never changes trust,
catalog, matching, SEO or opportunity rows.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_TARGET_FILE = ROOT / "config" / "production-target.json"
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from run_opportunity_enrichment_batch import api_base, api_headers, load_local_env
from source_cleaners import PROFILES
from source_registry_v2 import runtime_projection

PROJECTION_FIELDS = tuple(runtime_projection(next(iter(PROFILES.values()))).keys())
PROJECTION_FIELDS = tuple(field for field in PROJECTION_FIELDS if field != "source") + ("registry_synced_at",)
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def target_identity(requested: str) -> dict[str, Any]:
    """Fail closed: production must match an explicitly configured public host."""
    url = str(os.environ.get("SUPABASE_URL") or "").rstrip("/")
    host = (urlparse(url).hostname or "").casefold()
    mode = "LOCAL" if host in LOCAL_HOSTS else "UNKNOWN"
    # This identity is intentionally not taken from SUPABASE_URL or an
    # execution-time environment variable: those would merely compare a value
    # to itself. It is a checked-in, public project identifier.
    try:
        configured = json.loads(PRODUCTION_TARGET_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        configured = {}
    expected = str(configured.get("supabase_host") or "").casefold().strip()
    project_ref = str(configured.get("project_ref") or "").casefold().strip()
    # A public project ref is part of the independent identity contract.  It
    # prevents a config entry from accidentally treating an arbitrary host as
    # the production project.
    configured_is_consistent = bool(
        expected and project_ref and expected == f"{project_ref}.supabase.co"
    )
    if configured_is_consistent and host == expected:
        mode = "PRODUCTION"
    if requested == "local" and mode != "LOCAL":
        raise RuntimeError(f"target_mismatch:requested_local:actual_{mode.lower()}")
    if requested == "production":
        if not configured_is_consistent:
            raise RuntimeError("production_identity_not_configured_or_inconsistent:config/production-target.json")
        if mode != "PRODUCTION":
            raise RuntimeError(f"target_mismatch:requested_production:actual_{mode.lower()}")
    return {
        "url": url,
        "host": host,
        "expected_host": expected or None,
        "project_ref": project_ref or None,
        "mode": mode,
        "requested": requested,
        "independent_identity_configured": configured_is_consistent,
        "identity_check": "PASS",
    }


def desired_projection(source: str, *, synced_at: str | None = None) -> dict[str, Any]:
    profile = PROFILES.get(source)
    if profile is None:
        raise ValueError(f"registry_profile_missing:{source}")
    payload = runtime_projection(profile)
    payload["registry_synced_at"] = synced_at or datetime.now(timezone.utc).isoformat()
    return payload


def diff_projection(current: dict[str, Any] | None, desired: dict[str, Any]) -> dict[str, dict[str, Any]]:
    current = current or {}
    changes = {
        key: {"current": current.get(key), "desired": value}
        for key, value in desired.items()
        if key != "registry_synced_at" and current.get(key) != value
    }
    try:
        observed = datetime.fromisoformat(str(current.get("registry_synced_at") or "").replace("Z", "+00:00"))
    except ValueError:
        observed = None
    ttl = int(desired.get("registry_projection_ttl_hours") or 168)
    if observed is None or observed < datetime.now(timezone.utc) - timedelta(hours=ttl):
        changes["registry_synced_at"] = {"current": current.get("registry_synced_at"), "desired": desired["registry_synced_at"]}
    return changes


def plan(*, source: str | None, session: requests.Session | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    session = session or requests.Session()
    profiles = [source] if source else sorted(PROFILES)
    if source and source not in PROFILES:
        raise ValueError(f"registry_profile_missing:{source}")
    response = session.get(
        f"{api_base()}/opportunity_sources", headers=api_headers(),
        params={"select": "source," + ",".join(PROJECTION_FIELDS)}, timeout=30,
    )
    response.raise_for_status()
    current_rows = response.json()
    current = {str(row["source"]): row for row in current_rows}
    if len(current) != len(current_rows):
        raise RuntimeError("projection_current_duplicate_source_keys")
    rows: list[dict[str, Any]] = []
    for item in profiles:
        desired = desired_projection(item)
        existing = current.get(item)
        changes = diff_projection(existing, desired)
        rows.append({
            "source": item, "current": existing, "desired": desired,
            "registry_hash": desired["registry_policy_hash"], "differences": changes,
            "action": "INSERT" if existing is None else ("UPDATE" if changes else "NOOP"),
        })
    return rows, current_rows


def projection_inventory(rows: list[dict[str, Any]], current_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Read-only reconciliation of projected canonical and legacy source rows."""
    current_sources = sorted(str(row.get("source") or "") for row in current_rows)
    profile_sources = set(PROFILES)
    matched = sorted(source for source in current_sources if source in profile_sources)
    legacy = sorted(source for source in current_sources if source not in profile_sources)
    return {
        "total_opportunity_sources": len(current_sources),
        "matching_canonical_profiles": len(matched),
        "matching_canonical_sources": matched,
        "legacy_or_noncanonical": len(legacy),
        "legacy_or_noncanonical_sources": legacy,
        "missing_profiles": sum(row["action"] == "INSERT" for row in rows),
        "missing_profile_sources": [row["source"] for row in rows if row["action"] == "INSERT"],
    }


def apply(rows: list[dict[str, Any]], *, session: requests.Session | None = None) -> list[dict[str, Any]]:
    """Projection-only persistence.  Caller must explicitly choose --apply."""
    session = session or requests.Session()
    allowed = {"INSERT", "UPDATE", "NOOP"}
    sources = [str(row.get("source") or "") for row in rows]
    if not rows or len(sources) != len(set(sources)) or any(not source for source in sources):
        raise RuntimeError("projection_plan_invalid_source_keys")
    if any(row.get("action") not in allowed or not row.get("desired", {}).get("registry_policy_hash") for row in rows):
        raise RuntimeError("projection_plan_invalid_action_or_hash")
    outcomes = []
    for row in rows:
        if row["action"] == "NOOP":
            outcomes.append({"source": row["source"], "action": "NOOP"})
            continue
        if row["action"] == "INSERT":
            # Only DB-contract defaults plus registry-owned projection fields.
            # New rows start disabled/review: presence never implies health or
            # publication eligibility.
            payload = {
                **row["desired"], "display_name": row["source"].replace("_", " ").title(),
                "trust_level": "review", "auto_verify": False, "is_enabled": False,
            }
            response = session.post(
                f"{api_base()}/opportunity_sources", headers={**api_headers(), "Prefer": "return=representation"},
                json=payload, timeout=30,
            )
            response.raise_for_status()
            outcomes.append({"source": row["source"], "action": "INSERT", "result": response.json()})
            continue
        response = session.patch(
            f"{api_base()}/opportunity_sources", headers={**api_headers(), "Prefer": "return=representation"},
            params={"source": f"eq.{row['source']}"}, json=row["desired"], timeout=30,
        )
        response.raise_for_status()
        outcomes.append({"source": row["source"], "action": "UPDATE", "result": response.json()})
    return outcomes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source")
    parser.add_argument("--target", choices=("local", "production"), required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-production-write", action="store_true")
    args = parser.parse_args()
    if args.dry_run == args.apply:
        parser.error("choose exactly one of --dry-run or --apply")
    load_local_env()
    target = target_identity(args.target)
    if args.apply and args.target == "production" and not args.confirm_production_write:
        parser.error("production APPLY requires --confirm-production-write")
    rows, current_rows = plan(source=args.source)
    result: dict[str, Any] = {
        "target": target,
        "mode": "APPLY" if args.apply else "DRY_RUN",
        "commit": args.apply,
        "inventory": projection_inventory(rows, current_rows),
        "rows": rows,
    }
    if args.apply:
        result["outcomes"] = apply(rows)
    print("CVITAE_SOURCE_REGISTRY_PROJECTION=" + json.dumps(result, ensure_ascii=False, sort_keys=True, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
