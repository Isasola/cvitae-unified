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
    "paraguayconcursa_mef": SourceProfile(
        source="paraguayconcursa_mef", adapter_version="paraguayconcursa-mef:v1.0.0", auto_enabled=False,
        expected_description_coverage=.90, adapter="ParaguayConcursaAdapter", cleaner="ParaguayConcursaCleaner",
        scout="official_mef_listing", discovery_strategy="paginated_listing", detail_strategy="html_detail",
        source_family="official_government_job_portal", opportunity_kinds=("job",),
        max_workers=1, max_detail_fetches_per_run=20, retry_attempts=3,
        supports_eligibility=False, emitted_aliases=("paraguayconcursa_mef_scraper",),
        operational_runner_ids=("paraguayconcursa_mef_scraper",),
        known_assumptions=("location_and_vacancies_required_for_ingestion", "unknown_status_never_ready", "review_required", "source_cursor_in_scraper_runs"),
        source_attribution_required=True, search_engine_indexing_allowed=False,
    ),
    "psf_hiringroom": SourceProfile(
        source="psf_hiringroom", adapter_version="psf-hiringroom:v1.0.0", auto_enabled=False,
        expected_description_coverage=.85, adapter="HiringRoomPsfAdapter", cleaner="PsfHiringRoomCleaner",
        scout="psf_employer_listing", discovery_strategy="tenant_scoped_html", detail_strategy="individual_html",
        source_family="employer_ats", opportunity_kinds=("job",),
        max_workers=1, max_detail_fetches_per_run=20, retry_attempts=3,
        supports_eligibility=False, emitted_aliases=("psf_hiringroom_scraper",),
        operational_runner_ids=("psf_hiringroom_scraper",),
        known_assumptions=(
            "written_feed_rights_required_before_http", "public_html_is_not_distribution_permission",
            "tenant_and_native_posting_id_form_identity", "relative_age_is_not_exact_published_at",
            "job_location_is_not_candidate_eligibility", "no_customer_api_credentials",
            "all_consumer_permissions_remain_unapproved",
        ),
        source_attribution_required=True, search_engine_indexing_allowed=False,
        web_catalog_allowed=False, third_party_job_distribution_allowed=False,
        google_jobs_distribution_allowed=False,
    ),
    "grupovierci": SourceProfile(
        source="grupovierci", adapter_version="grupo-vierci-scout:v1.0.0", auto_enabled=False,
        expected_description_coverage=.85, adapter="GrupoVierciScout", cleaner="GrupoVierciCleaner",
        scout="retail_sa_employer_portal", discovery_strategy="tenant_listing_html", detail_strategy="unverified",
        source_family="employer_career_portal", opportunity_kinds=("job",),
        max_workers=1, max_detail_fetches_per_run=0, retry_attempts=3,
        supports_eligibility=False, emitted_aliases=("grupo_vierci", "grupovierci_scraper"),
        operational_runner_ids=("grupovierci_scraper",),
        known_assumptions=(
            "written_feed_rights_required_before_http", "old_scraper_direct_write_removed",
            "current_employer_route_observed_empty", "nonempty_markup_fails_closed_until_native_id_and_detail_contract",
            "public_portal_is_not_distribution_permission",
        ),
        source_attribution_required=True, search_engine_indexing_allowed=False,
        web_catalog_allowed=False, third_party_job_distribution_allowed=False,
        google_jobs_distribution_allowed=False,
    ),
    "greenhouse": SourceProfile(
        source="greenhouse", adapter_version="greenhouse:v1.0.0", auto_enabled=False,
        expected_description_coverage=.85, adapter="GreenhouseBoardAdapter", cleaner=None,
        scout="configured_board_api", discovery_strategy="public_api_allowlist", detail_strategy="api_bulk",
        source_family="employer_ats", opportunity_kinds=("job",), max_workers=2,
        supports_eligibility=False, known_assumptions=("board_allowlist_required", "public_get_is_not_distribution_permission", "job_location_is_not_eligibility"),
        source_attribution_required=True, search_engine_indexing_allowed=False,
    ),
    "lever": SourceProfile(
        source="lever", adapter_version="lever:v1.0.0", auto_enabled=False,
        expected_description_coverage=.85, adapter="LeverPostingAdapter", cleaner=None,
        scout="configured_site_api", discovery_strategy="public_api_allowlist", detail_strategy="api_paginated",
        source_family="employer_ats", opportunity_kinds=("job",), max_workers=2,
        supports_eligibility=False, known_assumptions=("site_allowlist_required", "skip_limit_to_eof", "public_get_is_not_distribution_permission", "workplace_type_is_not_eligibility"),
        source_attribution_required=True, search_engine_indexing_allowed=False,
    ),
    "prodato_direct": SourceProfile(
        source="prodato_direct", adapter_version="prodato-direct:v1.0.0", auto_enabled=False,
        expected_description_coverage=0.0, adapter="ProdatoFirstPartyAdapter", cleaner="ProdatoCleaner",
        scout="employer_first_party_board", discovery_strategy="single_page_html_cards", detail_strategy="individual_posting_html",
        source_family="employer_career_portal", opportunity_kinds=("job",), max_workers=1,
        max_detail_fetches_per_run=50, supports_eligibility=False, emitted_aliases=("prodato_scraper",),
        operational_runner_ids=("prodato_scraper",),
        known_assumptions=("numeric_career_path_segment_is_native_id", "listed_vacancies_have_no_explicit_deadline",
                           "facts_and_original_link_only_until_reuse_permission_review", "talent_pool_is_not_a_job"),
        source_attribution_required=True, search_engine_indexing_allowed=False,
        web_catalog_allowed=False, third_party_job_distribution_allowed=False, google_jobs_distribution_allowed=False,
    ),
    "lizzy_castillo_py": SourceProfile(
        source="lizzy_castillo_py", adapter_version="lizzy-castillo:v1.0.0", auto_enabled=False,
        expected_description_coverage=0.0, adapter="LizzyCastilloJobPostingAdapter", cleaner="LizzyCastilloCleaner",
        scout="featured_homepage_job_links", discovery_strategy="homepage_featured_cards", detail_strategy="jobposting_jsonld",
        source_family="employment_agency", opportunity_kinds=("job",), max_workers=1, max_detail_fetches_per_run=50,
        supports_eligibility=False, emitted_aliases=("lizzy_castillo_scraper",),
        operational_runner_ids=("lizzy_castillo_scraper",),
        known_assumptions=("homepage_is_featured_not_complete_archive", "jobLocation_absent_means_unknown",
                           "generic_application_form_is_not_a_unique_posting_key", "validThrough_controls_source_currentness",
                           "public_JobPosting_is_not_description_reuse_permission"),
        source_attribution_required=True, search_engine_indexing_allowed=False,
        web_catalog_allowed=False, third_party_job_distribution_allowed=False, google_jobs_distribution_allowed=False,
    ),
    "outsourcing_paraguay": SourceProfile(
        source="outsourcing_paraguay", adapter_version="outsourcing-py:v1.0.0", auto_enabled=False,
        expected_description_coverage=0.0, adapter="OutsourcingPyIndividualVacancyAdapter", cleaner="OutsourcingPyCleaner",
        scout="current_public_vacancies_page", discovery_strategy="individual_vacancy_query_ids", detail_strategy="individual_html_heading",
        source_family="employment_agency", opportunity_kinds=("job",), max_workers=1, max_detail_fetches_per_run=50,
        supports_eligibility=False, emitted_aliases=("outsourcing_py_scraper",),
        operational_runner_ids=("outsourcing_py_scraper",),
        known_assumptions=("vacancy_query_parameter_is_native_id", "external_employer_not_disclosed", "job_location_unknown",
                           "listing_has_no_total_or_eof_signal", "personal_application_form_is_never_read_or_submitted"),
        source_attribution_required=True, search_engine_indexing_allowed=False,
        web_catalog_allowed=False, third_party_job_distribution_allowed=False, google_jobs_distribution_allowed=False,
    ),
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
        # First-party ordinary public pages may be indexed with source attribution
        # and linkback. JobPosting and third-party job distribution remain denied.
        search_engine_indexing_allowed=True,
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

# Each SmartRecruiters company is a separate source/control identity even
# though the API and parser are shared. The native posting ID is also tenant
# scoped by the adapter, so records cannot collide across employers.
for _tenant, _display_name in (("deliveryhero", "Delivery Hero / PedidosYa"), ("sgs", "SGS Paraguay"), ("tieto2", "Tieto Tech Consulting")):
    _source = f"smartrecruiters_{_tenant}"
    V2_PROFILES[_source] = SourceProfile(
        source=_source, adapter_version="smartrecruiters:v1.0.0", auto_enabled=False,
        expected_description_coverage=.85, adapter="SmartRecruitersPostingAdapter", cleaner="SmartRecruitersCleaner",
        scout="company_scoped_public_api", discovery_strategy="company_country_paginated_api", detail_strategy="individual_posting_api",
        source_family="employer_ats", opportunity_kinds=("job",), max_workers=1, max_detail_fetches_per_run=50,
        supports_eligibility=False, emitted_aliases=(f"{_source}_scraper",),
        operational_runner_ids=(f"{_source}_scraper",),
        known_assumptions=("company_identifier_and_posting_id_form_identity", "job_location_is_not_candidate_eligibility",
                           "public_get_is_not_description_or_distribution_permission", "released_date_is_not_deadline",
                           f"company_account_{_display_name}_requires_independent_permission_review"),
        source_attribution_required=True, search_engine_indexing_allowed=False,
    )


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
