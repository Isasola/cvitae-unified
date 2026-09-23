"""Build a local desired-policy projection from a captured read-only DB snapshot.

The input is deliberately required. This script never contacts Supabase and
will not invent canonical sources or current flags from aggregate counts.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from source_registry_v2 import resolve_emitted_source

FIELDS = (
    "is_enabled", "catalog_enabled", "matching_enabled", "alerts_enabled", "seo_enabled",
    "web_catalog_allowed", "search_engine_indexing_allowed", "google_jobs_distribution_allowed",
    "third_party_job_distribution_allowed",
)


def evidence(value: bool | None, *, explicit_deny: bool = False, internal: bool = False) -> str:
    if explicit_deny:
        return "EXPLICIT_DENY"
    if internal:
        return "PRODUCT_POLICY_ALLOW"
    if value is True:
        return "CONFIG_ONLY"
    return "UNKNOWN" if value is None else "CONFIG_ONLY"


def projection(row: dict) -> dict:
    canonical = resolve_emitted_source(row["source"]).source
    current = {field: row.get(field) for field in FIELDS}
    is_himalayas = canonical == "himalayas"
    enabled = current["is_enabled"] is True
    internal_product_allowed = enabled and (is_himalayas or canonical != "himalayas")
    # Product policy may propose internal switches for an enabled collected
    # source, but it never manufactures an external/web capability.
    desired = dict(current)
    if enabled:
        desired.update({"catalog_enabled": True, "matching_enabled": True, "alerts_enabled": True})
    if is_himalayas:
        desired.update({
            "catalog_enabled": True, "matching_enabled": True, "alerts_enabled": True,
            "seo_enabled": False, "search_engine_indexing_allowed": False,
            "google_jobs_distribution_allowed": False, "third_party_job_distribution_allowed": False,
        })
    elif enabled:
        # False/null current external flags are configuration observations, not
        # a proposed legal denial. Preserve lack of affirmative evidence as
        # UNKNOWN in the desired projection rather than silently enabling it.
        for field in ("web_catalog_allowed", "search_engine_indexing_allowed", "google_jobs_distribution_allowed", "third_party_job_distribution_allowed"):
            if current[field] is not True:
                desired[field] = None
    # SEO controls remain unchanged unless there is affirmative external
    # evidence. Unknown/null remains null rather than becoming true.
    external_unknown = not is_himalayas and any(current[field] is None for field in ("search_engine_indexing_allowed", "google_jobs_distribution_allowed", "third_party_job_distribution_allowed"))
    reasons: list[str] = []
    if is_himalayas:
        state = "KEEP_DENIED"
        reasons.extend(["HIMALAYAS_EXPLICIT_SEARCH_INDEXING_DENY", "HIMALAYAS_INTERNAL_PRODUCT_SEPARATE", "SOURCE_ATTRIBUTION_REQUIRED"])
    elif not enabled:
        state = "KEEP_DISABLED"
        reasons.append("SOURCE_GLOBALLY_DISABLED_SEPARATE_ACTIVATION_REQUIRED")
    elif external_unknown or current["search_engine_indexing_allowed"] is not True:
        state = "NEEDS_PERMISSION_EVIDENCE"
        reasons.extend(["EXTERNAL_DISTRIBUTION_PERMISSION_NOT_AFFIRMATIVELY_EVIDENCED", "INTERNAL_SWITCHES_SEPARATE_FROM_EXTERNAL_CAPABILITIES"])
    else:
        state = "SAFE_LOCAL_PROJECTION"
        reasons.append("CURRENT_EXTERNAL_CAPABILITY_ALREADY_AFFIRMATIVE")
    return {
        "canonical_source": canonical,
        "current": current,
        "evidence": {
            "internal_catalog": evidence(current["web_catalog_allowed"], internal=internal_product_allowed),
            "internal_matching": evidence(current["matching_enabled"], internal=internal_product_allowed),
            "internal_alerts": evidence(current["alerts_enabled"], internal=internal_product_allowed),
            "search_indexing": evidence(current["search_engine_indexing_allowed"], explicit_deny=is_himalayas),
            "google_jobs": evidence(current["google_jobs_distribution_allowed"], explicit_deny=is_himalayas),
            "third_party_distribution": evidence(current["third_party_job_distribution_allowed"], explicit_deny=is_himalayas),
        },
        "desired": desired,
        "decision_state": state,
        "reasons": reasons,
    }


def main() -> int:
    input_path = Path(os.environ.get("EFFECTIVE_ROUTING_PRODUCTION_BASELINE", ROOT / "generated" / "production-source-policy-readonly.json"))
    if not input_path.exists():
        raise SystemExit(f"production_policy_baseline_missing:{input_path}")
    raw = json.loads(input_path.read_text(encoding="utf-8"))
    rows = raw.get("policies", raw) if isinstance(raw, dict) else raw
    if not isinstance(rows, list) or len(rows) != 34:
        raise SystemExit(f"production_policy_baseline_requires_34_rows:got_{len(rows) if isinstance(rows, list) else 'invalid'}")
    canonical_rows: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get("source"):
            raise SystemExit("production_policy_baseline_invalid_row")
        canonical = resolve_emitted_source(row["source"]).source
        if canonical in canonical_rows:
            raise SystemExit(f"production_policy_baseline_duplicate_canonical:{canonical}")
        canonical_rows[canonical] = row
    if len(canonical_rows) != 34:
        raise SystemExit(f"production_policy_baseline_requires_34_canonical:got_{len(canonical_rows)}")
    entries = [projection(canonical_rows[key]) for key in sorted(canonical_rows)]
    counts = {state: sum(item["decision_state"] == state for item in entries) for state in ("SAFE_LOCAL_PROJECTION", "NEEDS_PERMISSION_EVIDENCE", "KEEP_DENIED", "KEEP_DISABLED", "UNKNOWN")}
    output_dir = Path(os.environ.get("EFFECTIVE_ROUTING_PROJECTION_OUTPUT_DIR", ROOT / "generated"))
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "effective-routing-policy-projection.json"
    output.write_text(json.dumps({"schema_version": "effective-routing-policy-projection:v1", "evidence_level": "READ_ONLY_SNAPSHOT_REQUIRED", "sources": entries, "counts": counts}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown = ["# Effective routing policy diff", "", "Snapshot-derived only; no policy mutation.", ""]
    groups = {
        "A. NO CHANGE": [item for item in entries if item["desired"] == item["current"]],
        "B. INTERNAL CONSUMERS CAN SAFELY BE PROJECTED": [item for item in entries if item["current"]["is_enabled"] is True and any(item["desired"][field] is True and item["current"][field] is not True for field in ("catalog_enabled", "matching_enabled", "alerts_enabled"))],
        "C. EXTERNAL DISTRIBUTION EXPLICITLY DENIED": [item for item in entries if item["decision_state"] == "KEEP_DENIED"],
        "D. EXTERNAL PERMISSION EVIDENCE NEEDED": [item for item in entries if item["decision_state"] == "NEEDS_PERMISSION_EVIDENCE"],
        "E. GLOBALLY DISABLED / REQUIRES SEPARATE ACTIVATION DECISION": [item for item in entries if item["decision_state"] == "KEEP_DISABLED"],
    }
    for title, members in groups.items():
        names = [item["canonical_source"] for item in members]
        markdown.extend([f"## {title} ({len(names)})", "", ", ".join(names) or "None", ""])
    (output_dir / "effective-routing-policy-diff.md").write_text("\n".join(markdown), encoding="utf-8")
    sql = "-- PREVIEW ONLY. No UPDATE statements are generated.\n-- Apply only after explicit human approval and an atomic reviewed migration.\nselect source, is_enabled, catalog_enabled, matching_enabled, alerts_enabled, seo_enabled, web_catalog_allowed, search_engine_indexing_allowed, google_jobs_distribution_allowed, third_party_job_distribution_allowed\nfrom public.opportunity_sources\norder by source;\n"
    (output_dir / "effective-routing-policy-preview.sql").write_text(sql, encoding="utf-8")
    print(f"effective_routing_policy_projection: PASS sources=34 counts={counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
