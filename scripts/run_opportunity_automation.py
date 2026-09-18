"""Read-only evaluator for source-aware opportunity automation decisions.

This command is intentionally dry-run only. It does not call the factory
commit RPC, embedding model, promotion executor or any opportunity writer.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from opportunity_automation import cluster_automation_exceptions, evaluate_opportunity_automation_policy
from opportunity_factory import seal
from opportunity_sink import CONTENT_FINGERPRINT_FIELDS, SEMANTIC_FINGERPRINT_FIELDS, _fingerprint
from source_registry_v2 import certification, resolve_emitted_source


def load_local_env() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if line and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def api() -> tuple[str, dict[str, str]]:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/opportunities", {
        "apikey": key, "Authorization": f"Bearer {key}",
    }


def fetch_exact_rows(ids: list[str]) -> list[dict[str, Any]]:
    fields = sorted(set(CONTENT_FINGERPRINT_FIELDS + SEMANTIC_FINGERPRINT_FIELDS + (
        "id", "source", "updated_at", "factory_status", "content_fingerprint", "semantic_fingerprint",
        "embedding", "embedding_model", "verification_status", "is_active", "catalog_eligible",
        "match_eligible", "alerts_eligible", "seo_eligible", "seo_status", "deleted_at", "archived_at",
        "source_authority", "original_source_verified", "remote_scope", "eligible_countries", "eligible_regions",
    )))
    quoted = ",".join(f'"{value.replace(chr(34), "")}"' for value in ids)
    endpoint, headers = api()
    response = requests.get(endpoint, headers=headers, params={
        "select": ",".join(fields), "id": f"in.({quoted})",
    }, timeout=45)
    response.raise_for_status()
    return response.json()


def row_automation_input(row: dict[str, Any]) -> dict[str, Any]:
    scope = str(row.get("remote_scope") or "").upper()
    countries = row.get("eligible_countries") or []
    return {
        **row,
        "identity_valid": bool(row.get("title") and str(row.get("application_url") or "").startswith("https://")),
        "eligibility_resolved": not (scope in {"COUNTRY_SPECIFIC", "REGIONAL"} and not countries) and scope != "UNKNOWN",
        "eligibility_structure_mismatch": False,
        "geo_contradiction": False,
    }


def evaluate_rows(rows: list[dict[str, Any]], *, as_of: date) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in sorted(rows, key=lambda item: str(item["id"])):
        profile = resolve_emitted_source(str(row.get("source") or ""))
        proposed_status, stamps, seal_evidence = seal(row, datetime.combine(as_of, datetime.min.time(), tzinfo=timezone.utc))
        proposed_content = _fingerprint(row, CONTENT_FINGERPRINT_FIELDS)
        proposed_semantic = _fingerprint(row, SEMANTIC_FINGERPRINT_FIELDS)
        snapshot = {"status": proposed_status, "stamps": stamps, "evidence": seal_evidence}
        decision = evaluate_opportunity_automation_policy(row_automation_input(row), profile, snapshot, as_of=as_of)
        gates = decision.downstream_gates
        output.append({
            "id": row["id"], "source": row.get("source"), "title": row.get("title"),
            "factory_status_current": row.get("factory_status"), "factory_status_proposed": proposed_status,
            "content_fingerprint_current": row.get("content_fingerprint"), "content_fingerprint_proposed": proposed_content,
            "semantic_fingerprint_current": row.get("semantic_fingerprint"), "semantic_fingerprint_proposed": proposed_semantic,
            "fingerprint_changed": row.get("semantic_fingerprint") != proposed_semantic or row.get("content_fingerprint") != proposed_content,
            "factory_stamps": stamps, "factory_evidence": seal_evidence,
            "source_certification": certification(profile), "auto_enabled": profile.auto_enabled,
            "decision": decision.decision, "reason_codes": list(decision.reason_codes),
            "confidence": decision.confidence, "human_intervention_required": decision.human_intervention_required,
            "catalog_allowed": gates["web_catalog"], "matching_allowed": gates["matching"],
            "embedding_needed": bool(gates["embedding"] and row.get("embedding") is None),
            "organic_seo_allowed": gates["organic_seo"], "google_jobs_allowed": gates["google_jobs"],
            "third_party_distribution_allowed": gates["third_party_distribution"],
            "policy_version": decision.policy_version, "commit": False,
            "_decision": decision.to_dict(),
        })
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ids", required=True, help="Comma-separated exact opportunity IDs (max 50)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--explain", action="store_true")
    args = parser.parse_args()
    if not args.dry_run:
        parser.error("This evaluator is DRY-RUN only; pass --dry-run explicitly")
    ids = list(dict.fromkeys(value.strip() for value in args.ids.split(",") if value.strip()))
    if not ids or len(ids) > 50:
        parser.error("--ids requires 1..50 exact IDs")
    load_local_env()
    rows = fetch_exact_rows(ids)
    values = evaluate_rows(rows, as_of=datetime.now(timezone.utc).date())
    found = {str(row["id"]) for row in rows}
    for value in values:
        printable = {key: item for key, item in value.items() if key != "_decision" or args.explain}
        print("AUTOMATION_DECISION_ROW=" + json.dumps(printable, ensure_ascii=False, sort_keys=True))
    clusters = cluster_automation_exceptions([value["_decision"] for value in values])
    print("CVITAE_OPPORTUNITY_AUTOMATION=" + json.dumps({
        "mode": "DRY_RUN", "requested": len(ids), "selected": len(rows),
        "missing_ids": [value for value in ids if value not in found],
        "decisions": {decision: sum(row["decision"] == decision for row in values) for decision in ("AUTO_PROMOTE", "HUMAN_REVIEW", "BLOCK", "HOLD")},
        "exception_clusters": clusters, "commit": False, "embeddings_generated": 0,
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
