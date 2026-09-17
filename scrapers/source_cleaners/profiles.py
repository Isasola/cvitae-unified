"""Single source registry used by source maintenance.

The long-lived JSON registry and legacy workflow are both inputs.  A source
without a V2 adapter remains visible and diagnosable, but cannot be auto-run.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from .base import SourceProfile


ROOT = Path(__file__).resolve().parents[2]


V2_PROFILES: dict[str, SourceProfile] = {
    "unjobs": SourceProfile(
        source="unjobs", adapter_version="unjobs:v2.0.0", auto_enabled=True,
        expected_description_coverage=.80, adapter="UNJobsAdapter", cleaner="UNJobsCleaner",
        scout="unjobs_listing", discovery_strategy="listing", detail_strategy="html_detail",
        source_family="international_opportunity_portal", opportunity_kinds=("job", "consultancy", "internship"),
        max_workers=6, max_detail_fetches_per_run=250, supports_eligibility=True,
        certification=("live_validation",),
        known_assumptions=(
            "404_410_are_removed_not_parser_failure", "inline_labels_and_field_location",
            "job_geo_eligibility_and_arrangement_are_distinct", "unknown_remote_is_not_onsite",
        ),
        search_engine_indexing_allowed=False,
    ),
    # These adapters have passed focused tests, but automatic production
    # maintenance stays opt-in until source diagnosis confirms current live
    # behaviour for each one.
    "himalayas": SourceProfile(
        source="himalayas", adapter_version="himalayas:v2.0.0", auto_enabled=False,
        expected_description_coverage=.85, adapter="HimalayasAdapter", cleaner="HimalayasCleaner",
        scout="himalayas_api", discovery_strategy="public_api", detail_strategy="api_bulk",
        source_family="job_api", opportunity_kinds=("job",),
        max_workers=3, max_detail_fetches_per_run=100, supports_eligibility=True,
        certification=("live_validation",),
        certification_evidence={
            "live_validation": {
                "status": "passed",
                "validated_at": "2026-09-14",
                "adapter_version": "himalayas:v2.0.0",
                "semantic_version": "source-contract:v2.0",
                "stable_evidence": {
                    "live_api_validation": "passed",
                    "canonical_identity_validation": "passed",
                    "semantic_validation": "passed",
                    "conservative_exception_handling": "passed",
                    "production_hidden_canary": "8/8",
                    "factory_automation_canary": "8/8",
                    "fingerprints_stable": True,
                    "accidental_publication": False,
                    "distribution_policy_validated": True,
                },
                # These are observations at validation time, not enduring
                # source-size or quality guarantees.
                "observed_metrics": {
                    "unique_new_candidates_total": 5111,
                    "ready_for_ingestion": 4824,
                    "human_review": 287,
                    "blocked": 0,
                },
            },
        },
        known_assumptions=("api_is_primary", "remote_without_evidence_is_unknown", "worldwide_requires_explicit_evidence"),
        web_catalog_allowed=True, source_attribution_required=True,
        third_party_job_distribution_allowed=False, google_jobs_distribution_allowed=False,
        # Himalayas API TOS explicitly prohibits organic search engine indexing of
        # their listings. web_catalog_allowed=True is a separate concern (internal catalog).
        search_engine_indexing_allowed=False,
    ),
    "talentcom": SourceProfile(
        source="talentcom", adapter_version="talent:v2.0.0", auto_enabled=False,
        expected_description_coverage=.75, adapter="TalentAdapter", cleaner="TalentCleaner",
        scout="talent_listing", discovery_strategy="listing", detail_strategy="html_detail",
        source_family="aggregator", opportunity_kinds=("job",),
        min_workers=2, max_workers=3,
        known_assumptions=("aggregator_provenance_preserved", "search_geo_is_not_job_geo"),
        search_engine_indexing_allowed=False,
    ),
    "weworkremotely": SourceProfile(
        source="weworkremotely", adapter_version="wwr:v2.0.0", auto_enabled=False,
        expected_description_coverage=.75, adapter="WWRAdapter", cleaner="WWRCleaner",
        scout="wwr_rss", discovery_strategy="rss", detail_strategy="html_detail",
        source_family="remote_job_board", opportunity_kinds=("job",),
        max_workers=6,
        known_assumptions=("rss_is_discovery_only", "http_200_generic_page_is_detail_mismatch", "remote_is_not_worldwide"),
        search_engine_indexing_allowed=False,
    ),
}


def _normalize_workflow_id(value: str) -> str:
    value = value.casefold().strip()
    value = re.sub(r"(?:_scraper|_scrapper)$", "", value)
    return {"weworkremotely": "weworkremotely", "talentcom": "talentcom"}.get(value, value)


def _inactive_profile(source: str, *, strategy: str = "legacy_script") -> SourceProfile:
    name = source.casefold()
    family = "institutional_or_local_board" if any(token in name for token in ("minister", "univers", "embassy", "delegation", "gobierno", "una", "conacyt")) else "opportunity_portal" if any(token in name for token in ("bec", "fund", "scholar", "calls", "aid", "devex", "impact", "f6s", "vc4a")) else "job_board"
    return SourceProfile(
        source=source, adapter_version="unvalidated", auto_enabled=False, active=True,
        expected_description_coverage=0.0, adapter=None, cleaner=None, scout="none",
        discovery_strategy=strategy, detail_strategy="unvalidated", source_family=family,
        known_assumptions=("registered_for_diagnosis_only",),
    )


def _registry_profiles() -> dict[str, SourceProfile]:
    profiles = dict(V2_PROFILES)
    registry_path = ROOT / "scrapers" / "source_registry.json"
    if registry_path.exists():
        data = json.loads(registry_path.read_text(encoding="utf-8"))
        for item in data.get("sources", []):
            source = str(item.get("source_id") or "").strip()
            if source and source not in profiles:
                profiles[source] = _inactive_profile(source, strategy="registered_source")
    workflow = ROOT / ".github" / "workflows" / "scrapers.yml"
    if workflow.exists():
        pattern = re.compile(r"run_scraper_monitored\.py\s+([^\s]+)")
        for source in pattern.findall(workflow.read_text(encoding="utf-8")):
            normalized = _normalize_workflow_id(source)
            if normalized and normalized not in profiles:
                profiles[normalized] = _inactive_profile(normalized, strategy="legacy_workflow")
    # Explicit emitted aliases may refer to a historical source family not in
    # the old registry. Keep it visible/uncertified instead of guessing.
    for canonical in ("aptitus", "bumeran", "indeed", "laborum", "reddit", "copaco", "hireon", "idealist", "itau", "merienderos", "ofertaslaborales", "personal", "pivot_jobs", "reliefweb", "scholarship_corner", "tigo"):
        profiles.setdefault(canonical, _inactive_profile(canonical, strategy="emitted_source_family"))
    return profiles


PROFILES = _registry_profiles()


def get_profile(source: str) -> SourceProfile:
    try:
        return PROFILES[source]
    except KeyError as exc:
        raise ValueError("unsupported_source_profile") from exc
