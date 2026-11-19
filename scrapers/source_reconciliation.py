"""Pure diff-before-apply accounting shared by maintenance and Admin backends."""
from __future__ import annotations

from collections import Counter
from typing import Any, Iterable


DIFF_KEYS = ("location", "onsite_country", "eligible_countries", "eligible_regions", "remote_scope")


def diff_before_apply(plans: Iterable[tuple[dict[str, Any], Any, dict[str, Any], Any]], *, suppressions: int = 0, restorations: int = 0) -> dict[str, int]:
    rows = list(plans)
    values: Counter[str] = Counter(rows_considered=len(rows), suppressions=suppressions, restorations=restorations)
    for row, _result, patch, _identity in rows:
        if not patch:
            values["rows_unchanged"] += 1; continue
        values["rows_changed"] += 1
        values["quality_changes"] += 1
        for key in DIFF_KEYS:
            if key in patch: values[f"{key}_changes"] += 1
        if any(key in patch for key in ("title", "organization", "description", *DIFF_KEYS)):
            values["semantic_fingerprints_invalidated"] += 1
            if row.get("match_eligible"): values["embeddings_needing_refresh"] += 1
    values["catalog_eligibility_changes"] = suppressions
    values["match_eligibility_changes"] = suppressions
    # Source reconciliation never changes SEO directly; downstream gates own it.
    values["seo_eligibility_changes"] = 0
    values["errors"] = 0
    values["exceptions"] = 0
    return {key: int(values[key]) for key in (
        "rows_considered", "rows_unchanged", "rows_changed", "location_changes", "onsite_country_changes",
        "eligible_countries_changes", "eligible_regions_changes", "remote_scope_changes",
        "quality_changes", "catalog_eligibility_changes", "match_eligibility_changes", "seo_eligibility_changes",
        "semantic_fingerprints_invalidated", "embeddings_needing_refresh", "suppressions", "restorations", "errors", "exceptions",
    )}


def impact_report(diff: dict[str, int]) -> dict[str, int | str]:
    """Only direct consequences; unavailable product measurements stay explicit."""
    changed = int(diff.get("rows_changed", 0))
    suppressed = int(diff.get("suppressions", 0))
    restored = int(diff.get("restorations", 0))
    return {
        "rows_evaluated": int(diff.get("rows_considered", 0)), "rows_normalized": changed,
        "fields_changed": sum(int(diff.get(key, 0)) for key in ("location_changes", "onsite_country_changes", "eligible_countries_changes", "eligible_regions_changes", "remote_scope_changes")),
        "suppressions_expected": suppressed, "restorations_expected": restored,
        "fingerprints_changed": int(diff.get("semantic_fingerprints_invalidated", 0)), "embeddings_needing_refresh": int(diff.get("embeddings_needing_refresh", 0)),
        "catalog_gate_changes": int(diff.get("catalog_eligibility_changes", 0)), "match_gate_changes": int(diff.get("match_eligibility_changes", 0)), "seo_gate_changes": int(diff.get("seo_eligibility_changes", 0)),
        "high_confidence_opportunities_gained": "unavailable_without_post_gate_evaluation",
        "unsafe_or_impossible_matches_removed": suppressed, "opportunities_restored": restored,
        "catalog_pool_delta": -suppressed, "match_pool_delta": -suppressed,
        "seo_indexable_pool_delta": "unavailable_downstream_gate_owned", "candidate_discovery_pool_delta": -suppressed,
        "b2b_usable_opportunity_pool_delta": "unavailable_without_b2b_gate",
    }
