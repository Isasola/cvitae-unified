"""Small, bounded, auditable enrichment canary runner (dry-run by default)."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_adapters import AtomicEnricher, AdapterResult, build_rpc_patch, coverage, health
from opportunity_sink import normalize_opportunity, OpportunitySink
from source_identity import IdentityResult, confirm_identity, native_id
from opportunity_quality import quality_signals_for
from source_registry_v2 import emitted_ids_for, resolve_emitted_source
from source_cleaners.profiles import get_profile
from talentcom_scraper import parse_talent_detail
from unjobs_scraper import parse_unjobs_detail
from himalayas_scraper import adapt_himalayas_job, canonical_himalayas_url, fetch_api_inventory, fetch_search_inventory, job_identity_urls
from weworkremotely_scraper import BASE_RSS, CATEGORIES, parse_feed, parse_wwr_detail, rss_job

MAX_LIMIT = 50
SOURCE_SCAN_LIMITS = {"unjobs": 1000}
SUCCESSFUL_ENRICHMENT_TTL = timedelta(days=7)
OBSERVATION_TTLS = {
    "REMOVED": timedelta(days=7),
    "DEAD": timedelta(days=7),
    "IDENTITY_MISMATCH": timedelta(days=3),
    "IDENTITY_UNRESOLVED": timedelta(hours=6),
    "NETWORK_FAILURE": timedelta(minutes=30),
}
ALIASES = {"talent": "talentcom", "talent.com": "talentcom", "talentcom": "talentcom", "unjobs": "unjobs", "un-jobs": "unjobs", "himalayas": "himalayas", "wwr": "weworkremotely", "weworkremotely": "weworkremotely", "we-work-remotely": "weworkremotely"}
ADAPTERS = {"talentcom": "talent:v2.0.0", "unjobs": "unjobs:v2.0.0", "himalayas": "himalayas:v2.0.0", "weworkremotely": "wwr:v2.0.0"}
LATAM_COUNTRIES = frozenset({"AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "HT", "MX", "NI", "PA", "PE", "PY", "SV", "UY", "VE"})
CARIBBEAN_COUNTRIES = frozenset({"AI", "AG", "AW", "BS", "BB", "BQ", "KY", "CW", "DM", "DO", "GD", "GP", "HT", "JM", "KN", "LC", "PR", "VC", "TT", "TC", "VG", "VI"})
LAC_COUNTRIES = LATAM_COUNTRIES | CARIBBEAN_COUNTRIES | frozenset({"BZ", "GY", "SR"})


def source_distribution_policy(source: str) -> dict[str, bool]:
    """Expose source-level distribution rules without duplicating them per lane."""
    profile = get_profile(source)
    return {
        "web_catalog_allowed": profile.web_catalog_allowed,
        "source_attribution_required": profile.source_attribution_required,
        "third_party_job_distribution_allowed": profile.third_party_job_distribution_allowed,
        "google_jobs_distribution_allowed": profile.google_jobs_distribution_allowed,
    }


def load_local_env() -> None:
    """Load missing local values without echoing a secret or overriding CI env."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def canonical_source(value: str) -> str:
    try:
        return resolve_emitted_source(value).source
    except ValueError as exc:
        raise ValueError("unsupported_source") from exc


def api_headers() -> dict[str, str]:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def api_base() -> str:
    return os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"


def assert_apply_target() -> None:
    """A production canary must never silently fall back to a local Supabase."""
    hostname = (urlparse(os.environ["SUPABASE_URL"]).hostname or "").casefold()
    if hostname in {"localhost", "127.0.0.1", "::1"} and os.getenv("CVITAE_ALLOW_LOCAL_ENRICHMENT") != "1":
        raise RuntimeError("apply_requires_nonlocal_supabase_target")


SELECT_FIELDS = "id,source,updated_at,title,organization,description,location,country_code,onsite_country,remote,remote_scope,eligible_countries,eligible_regions,value,currency,published_at,deadline,application_url,source_url,verification_status,catalog_eligible,match_eligible,embedding,deleted_at,archived_at"


def is_candidate(row: dict[str, Any]) -> bool:
    if row.get("deleted_at") or row.get("archived_at"):
        return False
    return bool(row.get("source_url") or row.get("application_url"))


def quality_signals(row: dict[str, Any]) -> list[str]:
    """Kind-aware signals; this does not mutate lifecycle or publication."""
    return quality_signals_for(row)


def needs_enrichment(row: dict[str, Any]) -> bool:
    return bool(quality_signals(row))


def selection_detail(row: dict[str, Any]) -> dict[str, Any] | None:
    signals = quality_signals(row)
    if not signals:
        return None
    if row.get("match_eligible"):
        priority_name, base, class_reason = "P0", 100, "match_eligible"
    elif row.get("catalog_eligible"):
        priority_name, base, class_reason = "P1", 60, "catalog_eligible"
    elif row.get("verification_status") == "in_review":
        priority_name, base, class_reason = "P2", 40, "in_review"
    else:
        priority_name, base, class_reason = "P3", 0, "degraded_other"
    weights = {"missing_description": 30, "missing_organization": 20, "missing_application_url": 20, "bad_country": 25, "missing_source_url": 15, "missing_or_weak_location": 10, "missing_onsite_country": 10}
    return {"priority": priority_name, "score": base + sum(weights[item] for item in signals), "reasons": [class_reason, *signals]}


def priority(row: dict[str, Any]) -> tuple[int, int, str, str]:
    detail = selection_detail(row)
    if not detail:
        return (4, 0, str(row.get("updated_at") or ""), str(row.get("id") or ""))
    # P0 → P1 → P2 → P3 is an invariant; degradation score ranks only inside
    # its operational band.
    band = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}[detail["priority"]]
    return (band, -detail["score"], str(row.get("updated_at") or ""), str(row.get("id") or ""))


def fetch_rows(source: str, limit: int, opportunity_id: str | None = None) -> list[dict[str, Any]]:
    scan_limit = 1 if opportunity_id else SOURCE_SCAN_LIMITS.get(source, 200)
    params: dict[str, str] = {"select": SELECT_FIELDS, "deleted_at": "is.null", "archived_at": "is.null", "limit": str(scan_limit), "order": "updated_at.asc,id.asc"}
    if opportunity_id:
        params["id"] = f"eq.{opportunity_id}"
    else:
        params["source"] = f"in.({','.join(emitted_ids_for(source))})"
    response = requests.get(f"{api_base()}/opportunities", headers=api_headers(), params=params, timeout=30)
    response.raise_for_status()
    return [row for row in response.json() if is_candidate(row)]


def _parse_observed_at(value: str | None) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def recent_enrichments(source: str, now: datetime | None = None) -> dict[str, datetime]:
    """One bounded read for successful recent patches, never one request per row."""
    now = now or datetime.now(timezone.utc)
    params = {
        "select": "opportunity_id,created_at", "source": f"in.({','.join(emitted_ids_for(source))})",
        "created_at": f"gte.{(now - SUCCESSFUL_ENRICHMENT_TTL).isoformat()}",
        "order": "created_at.desc", "limit": "1000",
    }
    response = requests.get(f"{api_base()}/opportunity_enrichment_events", headers=api_headers(), params=params, timeout=30)
    # Dry-run diagnostics remain useful against a local schema that does not
    # materialize the append-only event table. APPLY still requires it later.
    if response.status_code == 404:
        return {}
    response.raise_for_status()
    latest: dict[str, datetime] = {}
    for item in response.json():
        observed = _parse_observed_at(item.get("created_at"))
        if observed and item.get("opportunity_id") not in latest:
            latest[item["opportunity_id"]] = observed
    return latest


def recent_observations(source: str, now: datetime | None = None) -> tuple[dict[str, dict[str, Any]], bool]:
    """Schema absence is non-fatal in dry-run until the local migration is applied."""
    now = now or datetime.now(timezone.utc)
    params = {
        "select": "opportunity_id,identity_status,http_status,observed_at", "source": f"in.({','.join(emitted_ids_for(source))})",
        "observed_at": f"gte.{(now - max(OBSERVATION_TTLS.values())).isoformat()}",
        "order": "observed_at.desc", "limit": "1000",
    }
    response = requests.get(f"{api_base()}/opportunity_source_observations", headers=api_headers(), params=params, timeout=30)
    if response.status_code == 404:
        return {}, False
    response.raise_for_status()
    latest: dict[str, dict[str, Any]] = {}
    for item in response.json():
        if item.get("opportunity_id") not in latest:
            latest[item["opportunity_id"]] = item
    return latest, True


def observation_exclusion(observation: dict[str, Any] | None, now: datetime) -> str | None:
    if not observation:
        return None
    observed_at = _parse_observed_at(observation.get("observed_at"))
    if not observed_at:
        return None
    kind = "NETWORK_FAILURE" if observation.get("http_status") == 0 else str(observation.get("identity_status") or "")
    ttl = OBSERVATION_TTLS.get(kind)
    if not ttl or observed_at < now - ttl:
        return None
    return {
        "REMOVED": "recent_removed", "DEAD": "recent_removed",
        "IDENTITY_MISMATCH": "recent_identity_mismatch",
        "IDENTITY_UNRESOLVED": "recent_identity_unresolved",
        "NETWORK_FAILURE": "recent_network_failure",
    }[kind]


def select_candidates(rows: list[dict[str, Any]], limit: int, opportunity_id: str | None = None, enrichments: dict[str, datetime] | None = None, observations: dict[str, dict[str, Any]] | None = None, now: datetime | None = None) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, dict[str, Any]]]:
    """Pure, deterministic selection. Directed IDs bypass TTLs but not safety guards."""
    now = now or datetime.now(timezone.utc)
    enrichments, observations = enrichments or {}, observations or {}
    excluded = {"recent_enrichment": 0, "recent_removed": 0, "recent_identity_mismatch": 0, "recent_identity_unresolved": 0, "recent_network_failure": 0, "not_degraded": 0, "archived_or_deleted": 0}
    details: dict[str, dict[str, Any]] = {}
    selected: list[dict[str, Any]] = []
    for row in rows:
        if not is_candidate(row):
            excluded["archived_or_deleted"] += 1
            continue
        key = str(row.get("id"))
        if opportunity_id:
            selected.append(row)
            details[key] = {"priority": "DIRECTED", "score": None, "reasons": ["directed_id"]}
            continue
        detail = selection_detail(row)
        if not detail:
            excluded["not_degraded"] += 1
            continue
        if key in enrichments:
            excluded["recent_enrichment"] += 1
            continue
        exclusion = observation_exclusion(observations.get(key), now)
        if exclusion:
            excluded[exclusion] += 1
            continue
        selected.append(row)
        details[key] = detail
    selected.sort(key=priority)
    selected = selected[:limit]
    details = {str(row.get("id")): details[str(row.get("id"))] for row in selected}
    bands = {"p0": 0, "p1": 0, "p2": 0, "p3": 0}
    for detail in details.values():
        band = detail["priority"].casefold()
        if band in bands:
            bands[band] += 1
    return selected, {"considered": len(rows), "degraded": sum(needs_enrichment(row) for row in rows), **bands, "excluded": excluded}, details


def himalayas_db_inventory(opportunity_id: str | None = None) -> list[dict[str, Any]]:
    """Read all active Himalayas rows in bounded REST pages for a local join."""
    if opportunity_id:
        return fetch_rows("himalayas", 1, opportunity_id)
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        params = {"select": SELECT_FIELDS, "source": f"in.({','.join(emitted_ids_for('himalayas'))})", "deleted_at": "is.null", "archived_at": "is.null", "order": "updated_at.asc,id.asc", "limit": "1000", "offset": str(offset)}
        response = requests.get(f"{api_base()}/opportunities", headers=api_headers(), params=params, timeout=30)
        response.raise_for_status()
        page = response.json()
        rows.extend(row for row in page if is_candidate(row))
        if len(page) < 1000:
            return rows
        offset += len(page)


def latest_himalayas_deep_cursor() -> str | None:
    """Read the durable cursor recorded in established scraper_runs metrics.

    This is deliberately read-only. A cursor is only written as part of an
    explicit APPLY run's existing telemetry write; dry-runs never checkpoint.
    """
    try:
        params = {
            "select": "extraction_metrics,started_at",
            "scraper_id": "eq.enrichment_himalayas",
            "order": "started_at.desc",
            "limit": "1",
        }
        response = requests.get(f"{api_base()}/scraper_runs", headers=api_headers(), params=params, timeout=15)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        rows = response.json()
        metrics = (rows[0].get("extraction_metrics") or {}) if rows else {}
        inventory = metrics.get("himalayas_inventory") or {}
        cursor = inventory.get("next_cursor_saved_expected")
        return cursor if isinstance(cursor, str) and cursor else None
    except (requests.RequestException, KeyError, ValueError, TypeError):
        return None


def himalayas_current_rows(limit: int, opportunity_id: str | None = None, session: requests.Session | None = None, start_cursor: str | None = None, max_pages: int = 200) -> tuple[list[tuple[dict[str, Any], dict[str, Any]]], dict[str, Any]]:
    """Reconcile the full structured API inventory against legacy URL evidence.

    ``limit`` applies only after exact identity matching, never to API discovery.
    API absence remains an explicit unresolved historical state, never death.
    """
    db_rows = himalayas_db_inventory(opportunity_id)
    inventory = fetch_api_inventory(page_size=100, max_pages=max_pages, start_cursor=start_cursor, session=session)
    # An opaque cursor may expire upstream. Restarting from HEAD is safe; feed
    # absence remains unresolved rather than death either way.
    resume_restarted_from_head = False
    if start_cursor and inventory.error in {"http_400", "http_404", "http_422"}:
        inventory = fetch_api_inventory(page_size=100, max_pages=max_pages, session=session)
        resume_restarted_from_head = True
    api_by_url: dict[str, dict[str, Any]] = {}
    for raw in inventory.jobs:
        for url in job_identity_urls(raw):
            api_by_url.setdefault(url, raw)
    pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    matched_api_records: set[int] = set()
    for row in db_rows:
        urls = {url for url in (canonical_himalayas_url(row.get("source_url")), canonical_himalayas_url(row.get("application_url"))) if url}
        raw = next((api_by_url[url] for url in urls if url in api_by_url), None)
        if raw:
            pairs.append((row, raw))
            matched_api_records.add(id(raw))
    pairs.sort(key=lambda item: priority(item[0]))
    matched_ids = {str(row["id"]) for row, _ in pairs}
    metrics = {
        "api_records_seen": inventory.records_seen,
        "api_pages_seen": inventory.pages_seen,
        "api_inventory_complete": inventory.complete,
        "api_error": inventory.error,
        "reported_total_count": inventory.reported_total_count,
        "api_unique_records": inventory.records_seen,
        "api_duplicate_records": inventory.duplicate_records,
        "last_cursor_present": inventory.last_cursor_present,
        "resume_cursor_used": inventory.resume_cursor_used,
        "resume_cursor_restarted_from_head": resume_restarted_from_head,
        "next_cursor_saved_expected": inventory.next_cursor,
        "cycle_complete": inventory.complete,
        "db_inventory": len(db_rows),
        "api_existing_exact_matches": len(matched_api_records),
        "api_new_not_in_db": max(0, inventory.records_seen - len(matched_api_records)),
        "db_rows_exactly_matched": len(pairs),
        "db_rows_unmatched": len(db_rows) - len(pairs),
        # API failure/budget exhaustion is not feed absence. Only a completed
        # inventory may label a legacy row as currently unmatched.
        "historical_not_in_current_api": len(db_rows) - len(matched_ids) if inventory.complete else None,
        # Discovery detects candidates only. This reconciliation runner never
        # inserts them; a future explicit ingestion path may consume them.
        "selected_new_for_ingestion": 0,
    }
    return pairs, metrics


def himalayas_new_candidates(limit: int, session: requests.Session | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Build, classify and sample API-new Himalayas jobs without persistence."""
    db_rows = himalayas_db_inventory()
    py_search = fetch_search_inventory(filters={"country": "PY", "exclude_worldwide": "true", "sort": "recent"}, max_pages=50, session=session)
    worldwide_search = fetch_search_inventory(filters={"worldwide": "true", "sort": "recent"}, max_pages=50, session=session)
    inventory = fetch_api_inventory(page_size=100, max_pages=200, session=session)
    db_urls = {url for row in db_rows for url in (canonical_himalayas_url(row.get("source_url")), canonical_himalayas_url(row.get("application_url"))) if url}
    lane_jobs = [("PY_EXPLICIT", raw) for raw in py_search.jobs] + [("WORLDWIDE", raw) for raw in worldwide_search.jobs] + [("DEEP", raw) for raw in inventory.jobs]
    raw_by_url: dict[str, dict[str, Any]] = {}; memberships: dict[str, set[str]] = {}; duplicates = 0
    for lane, raw in lane_jobs:
        key = next(iter(job_identity_urls(raw)), None)
        if not key: continue
        if key in raw_by_url: duplicates += 1
        else: raw_by_url[key] = raw
        memberships.setdefault(key, set()).add(lane)
    candidates: list[dict[str, Any]] = []
    for canonical_url, raw in raw_by_url.items():
        identities = job_identity_urls(raw)
        if not identities or any(url in db_urls for url in identities):
            continue
        result = adapt_himalayas_job(raw)
        expired = bool(result.deadline and result.deadline < datetime.now(timezone.utc).date().isoformat())
        requirements = result.applicant_location_requirements or ""
        mismatch = "eligibility_structure_mismatch" in result.recommendation_reasons
        missing = [name for name, value in (("identity_invalid", bool(identities)), ("missing_title", bool(result.title and len(result.title) >= 3)), ("missing_organization", bool(result.organization)), ("missing_description", bool(result.description and len(result.description) >= 80)), ("missing_application_url", bool(result.apply_url)) ) if not value]
        ready = not expired and not missing and not mismatch and result.remote_scope in {"WORLDWIDE", "COUNTRY_SPECIFIC", "REGIONAL"}
        if expired:
            decision, reasons = "BLOCKED", ["expired"]
        elif ready:
            decision, reasons = "READY_FOR_INGESTION", ["validated_himalayas_api_candidate"]
        else:
            decision, reasons = "HUMAN_REVIEW", ([*missing] or ["eligibility_structure_mismatch" if mismatch else "remote_semantics_incomplete"])
        countries = result.eligible_countries
        worldwide = result.remote_scope == "WORLDWIDE"
        py_explicit = "PY" in countries
        latam_explicit = bool(set(countries) & LATAM_COUNTRIES)
        caribbean_explicit = bool(set(countries) & CARIBBEAN_COUNTRIES)
        lac_explicit = bool(set(countries) & LAC_COUNTRIES)
        segment = "PY_EXPLICIT" if py_explicit else "WORLDWIDE" if worldwide else "LATAM_EXPLICIT" if latam_explicit else "OTHER_COUNTRY_SPECIFIC"
        candidate_lanes = sorted(memberships[canonical_url] | {segment})
        candidates.append({"canonical_url": identities[0], "source_native_id": result.source_native_id, "source": "himalayas", "adapter_version": result.adapter_version, "semantic_version": "himalayas:semantic:v2", "title": result.title, "organization": result.organization, "_description": result.description, "description_length": len(result.description or ""), "source_url": result.source_url, "application_url": result.apply_url, "location": result.location, "country_code": result.country_code, "onsite_country": result.onsite_country, "remote": result.remote, "remote_scope": result.remote_scope, "eligible_countries": countries, "eligible_regions": result.eligible_regions, "applicant_location_requirements": requirements, "deadline": result.deadline, "value": result.salary_text, "currency": result.currency, "lane_memberships": candidate_lanes, "priority_segment": segment, "py_explicit": py_explicit, "py_eligible": py_explicit or worldwide, "latam_explicit": latam_explicit, "latam_eligible": latam_explicit or worldwide, "caribbean_explicit": caribbean_explicit, "caribbean_eligible": caribbean_explicit or worldwide, "lac_explicit": lac_explicit, "lac_eligible": lac_explicit or worldwide, "worldwide": worldwide, "expired": expired, "quality_status": decision, "catalog_readiness": ready, "match_readiness": ready, "seo_preflight": None, "embedding_needed_if_ingested": ready, "attribution_ready": bool(result.source_url and canonical_himalayas_url(result.source_url)), "distribution_policy": source_distribution_policy("himalayas"), "decision": decision, "reasons": reasons})
    priority = {"PY_EXPLICIT": 0, "WORLDWIDE": 1, "LATAM_EXPLICIT": 2, "OTHER_COUNTRY_SPECIFIC": 3}
    candidates.sort(key=lambda item: (priority[item["priority_segment"]], item["canonical_url"]))
    totals = {"ready_for_ingestion": sum(item["decision"] == "READY_FOR_INGESTION" for item in candidates), "human_review": sum(item["decision"] == "HUMAN_REVIEW" for item in candidates), "blocked": sum(item["decision"] == "BLOCKED" for item in candidates), "expired": sum(item["expired"] for item in candidates), "unknown_expiry": sum(item["deadline"] is None for item in candidates), "worldwide_count": sum(item["worldwide"] for item in candidates), "timezone_full_coverage_worldwide_count": sum(item["worldwide"] and "Timezone restrictions" not in item["applicant_location_requirements"] for item in candidates), "py_explicit_count": sum(item["py_explicit"] for item in candidates), "py_eligible_total": sum(item["py_eligible"] for item in candidates), "latam_explicit_count": sum(item["latam_explicit"] for item in candidates), "latam_eligible_total": sum(item["latam_eligible"] for item in candidates), "caribbean_explicit_count": sum(item["caribbean_explicit"] for item in candidates), "caribbean_eligible_total": sum(item["caribbean_eligible"] for item in candidates), "lac_explicit_count": sum(item["lac_explicit"] for item in candidates), "lac_eligible_total": sum(item["lac_eligible"] for item in candidates), "other_country_specific_count": sum(item["priority_segment"] == "OTHER_COUNTRY_SPECIFIC" for item in candidates), "missing_description": sum("missing_description" in item["reasons"] for item in candidates), "missing_org": sum("missing_organization" in item["reasons"] for item in candidates), "identity_invalid": 0, "eligibility_structure_mismatch": sum("eligibility_structure_mismatch" in item["reasons"] for item in candidates), "unresolved_location_name_count": sum(len((item.get("reasons") or [])) for item in candidates if "eligibility_structure_mismatch" in item.get("reasons", [])), "catalog_candidate_count": sum(item["catalog_readiness"] for item in candidates), "match_candidate_count": sum(item["match_readiness"] for item in candidates), "seo_candidate_count": None, "seo_blocked_count": None}
    metrics = {"reported_total_count": inventory.reported_total_count, "api_records_seen": inventory.records_seen, "api_unique_records": inventory.records_seen, "api_pages_seen": inventory.pages_seen, "api_inventory_complete": inventory.complete, "api_error": inventory.error, "deep_records_seen": inventory.records_seen, "deep_existing": sum(any(url in db_urls for url in job_identity_urls(raw)) for raw in inventory.jobs), "deep_new": sum(not any(url in db_urls for url in job_identity_urls(raw)) for raw in inventory.jobs), "py_search_records_seen": py_search.records_seen, "py_search_pages_seen": py_search.pages_seen, "py_search_complete": py_search.complete, "py_search_error": py_search.error, "py_search_existing": sum(any(url in db_urls for url in job_identity_urls(raw)) for raw in py_search.jobs), "py_search_new": sum(not any(url in db_urls for url in job_identity_urls(raw)) for raw in py_search.jobs), "worldwide_search_records_seen": worldwide_search.records_seen, "worldwide_search_pages_seen": worldwide_search.pages_seen, "worldwide_search_complete": worldwide_search.complete, "worldwide_search_error": worldwide_search.error, "worldwide_search_existing": sum(any(url in db_urls for url in job_identity_urls(raw)) for raw in worldwide_search.jobs), "worldwide_search_new": sum(not any(url in db_urls for url in job_identity_urls(raw)) for raw in worldwide_search.jobs), "cross_lane_duplicates_deduped": duplicates, "db_inventory": len(db_rows), "api_existing_exact_matches": len(raw_by_url) - len(candidates), "api_new_not_in_db": len(candidates), "unique_new_candidates_total": len(candidates), "new_candidates_evaluated": len(candidates), **totals, "selected_new_for_ingestion": min(limit, len(candidates)), "no_insert": True, "no_embeddings": True, "no_seo_mutation": True}
    return candidates[:limit], metrics


CANARY_SEGMENTS = (("PY_COUNTRY_SPECIFIC", 2), ("PY_REGIONAL", 2), ("WORLDWIDE", 2), ("LATAM_NON_PY", 1), ("CARIBBEAN_LAC_NON_PY", 1))

def _canary_segment(candidate: dict[str, Any]) -> str | None:
    if candidate.get("decision") != "READY_FOR_INGESTION" or not candidate.get("attribution_ready"): return None
    countries = set(candidate.get("eligible_countries") or [])
    if candidate.get("py_explicit") and candidate.get("remote_scope") == "COUNTRY_SPECIFIC": return "PY_COUNTRY_SPECIFIC"
    if candidate.get("py_explicit") and candidate.get("remote_scope") == "REGIONAL": return "PY_REGIONAL"
    if candidate.get("worldwide"): return "WORLDWIDE"
    if candidate.get("latam_explicit") and "PY" not in countries: return "LATAM_NON_PY"
    if candidate.get("lac_explicit") and not candidate.get("latam_explicit") and "PY" not in countries: return "CARIBBEAN_LAC_NON_PY"
    return None

def enforce_canary_safe_state(candidate: dict[str, Any]) -> dict[str, Any]:
    raw = {"title": candidate["title"], "organization": candidate["organization"], "description": candidate.get("_description") or candidate.get("description"), "location": candidate.get("location"), "country_code": candidate.get("country_code"), "onsite_country": candidate.get("onsite_country"), "remote": candidate.get("remote"), "remote_scope": candidate.get("remote_scope"), "eligible_countries": candidate.get("eligible_countries") or [], "eligible_regions": candidate.get("eligible_regions") or [], "value": candidate.get("value"), "currency": candidate.get("currency"), "deadline": candidate.get("deadline"), "application_url": candidate["application_url"], "source_url": candidate["source_url"], "source": "himalayas", "opportunity_type": "job", "opportunity_kind": "job", "source_authority": "aggregator", "original_source_verified": False, "verification_status": "in_review", "is_active": False}
    payload, reason = normalize_opportunity(raw)
    if not payload: raise ValueError(f"canary_normalization_failed:{reason}")
    payload.update({"verification_status":"in_review","is_active":False,"catalog_eligible":False,"match_eligible":False,"alerts_eligible":False,"seo_eligible":False,"seo_status":None,"factory_status":"pending","embedding":None,"source":"himalayas","source_authority":"aggregator","original_source_verified":False})
    validate_canary_payload(payload)
    return payload


def validate_canary_payload(payload: dict[str, Any]) -> None:
    required = {"verification_status":"in_review","is_active":False,"catalog_eligible":False,"match_eligible":False,"alerts_eligible":False,"seo_eligible":False,"seo_status":None,"factory_status":"pending","embedding":None,"source":"himalayas"}
    if any(payload.get(key) != value for key, value in required.items()):
        raise ValueError("canary_safe_state_violation")
    if not payload.get("source_url") or not payload.get("application_url") or not payload.get("slug"):
        raise ValueError("canary_identity_payload_incomplete")

def canary_preflight(payload: dict[str, Any]) -> dict[str, bool]:
    checks = {"source_url_collision": payload["source_url"], "application_url_collision": payload["application_url"], "slug_collision": payload["slug"]}
    out: dict[str, bool] = {}
    for key, value in checks.items():
        column = key.removesuffix("_collision")
        response = requests.get(f"{api_base()}/opportunities", headers=api_headers(), params={"select":"id", column:f"eq.{value}", "limit":"1"}, timeout=20)
        response.raise_for_status(); out[key] = bool(response.json())
    return out

def plan_himalayas_canary(size: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if size != 8: raise ValueError("canary_size_must_be_8")
    candidates, _ = himalayas_new_candidates(10_000)
    buckets = {name: [] for name, _ in CANARY_SEGMENTS}
    for candidate in candidates:
        segment = _canary_segment(candidate)
        if segment: buckets[segment].append(candidate)
    rows=[]; shortages={}; collisions=0
    for segment, needed in CANARY_SEGMENTS:
        accepted=[]
        for candidate in sorted(buckets[segment], key=lambda item: item["canonical_url"]):
            payload = enforce_canary_safe_state(candidate); preflight = canary_preflight(payload)
            if any(preflight.values()): collisions += 1; continue
            accepted.append((candidate,payload,preflight))
            if len(accepted) == needed: break
        if len(accepted) < needed: shortages[segment]=needed-len(accepted)
        for candidate,payload,preflight in accepted:
            rows.append({"canary_position":len(rows)+1,"segment":segment,"source":"himalayas","source_native_id":candidate.get("source_native_id"),"source_url":payload["source_url"],"application_url":payload["application_url"],"slug":payload["slug"],"title":payload["title"],"organization":payload.get("organization"),"remote_scope":payload.get("remote_scope"),"eligible_countries":payload.get("eligible_countries"),"eligible_regions":payload.get("eligible_regions"),"semantic_fingerprint":payload.get("semantic_fingerprint"),"content_fingerprint":payload.get("content_fingerprint"),"distribution_policy":candidate["distribution_policy"],"preflight":preflight,"safe_state":{key:payload.get(key) for key in ("verification_status","is_active","catalog_eligible","match_eligible","alerts_eligible","seo_eligible","seo_status","factory_status","embedding")},"payload":payload,"planned_action":"INSERT_FAIL_CLOSED"})
    try: sha=subprocess.check_output(["git","rev-parse","HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: sha=None
    try: branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: branch = None
    manifest={"mode":"PLAN_ONLY","source":"himalayas","canary_size":size,"generated_at":datetime.now(timezone.utc).isoformat(),"adapter_version":ADAPTERS["himalayas"],"semantic_version":"himalayas:semantic:v2","branch":branch,"git_sha":sha,"rows":rows,"plan_ready":len(rows)==size and not shortages}
    artifact=ROOT/"artifacts"/"canary"; artifact.mkdir(parents=True,exist_ok=True); path=artifact/f"himalayas-{int(time.time())}.json"; path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    return rows,{"requested_rows":size,"planned_rows":len(rows),"composition":{name:sum(row["segment"]==name for row in rows) for name,_ in CANARY_SEGMENTS},"collisions_rejected":collisions,"shortages":shortages,"manifest_path":str(path),"plan_ready":manifest["plan_ready"]}


def load_canary_manifest(path: str) -> dict[str, Any]:
    try:
        manifest = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("canary_manifest_invalid") from exc
    rows = manifest.get("rows")
    if (manifest.get("mode") != "PLAN_ONLY" or manifest.get("source") != "himalayas" or
            manifest.get("canary_size") != 8 or not manifest.get("plan_ready") or
            not isinstance(rows, list) or len(rows) != 8):
        raise ValueError("canary_manifest_not_execution_safe")
    return manifest


def execute_himalayas_canary(manifest_path: str) -> list[dict[str, Any]]:
    """Future-only INSERT path. It is intentionally separate from --apply."""
    assert_apply_target()
    manifest = load_canary_manifest(manifest_path)
    sink = OpportunitySink()
    inserted: list[dict[str, Any]] = []
    for row in manifest["rows"]:
        payload = row.get("payload")
        if not isinstance(payload, dict):
            raise ValueError("canary_manifest_row_payload_missing")
        validate_canary_payload(payload)
        # The source could have been ingested after planning; never trust an old plan.
        if any(canary_preflight(payload).values()):
            raise RuntimeError(f"canary_execution_collision:{payload.get('source_url')}")
        response = sink.insert_new_fail_closed(payload)
        inserted.append({key: response.get(key) for key in ("id", "slug", "created_at", "source_url", "application_url")})
    return inserted


def wwr_current_rows(limit: int) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Bounded current-RSS reconciliation; historical URLs never prove freshness."""
    slug, rubro = CATEGORIES[0]
    rss_rows = [rss_job(item, rubro) for item in parse_feed(BASE_RSS.format(slug))]
    rss_rows = [item for item in rss_rows if item and item.get("url")][:20]
    if not rss_rows:
        return []
    values = ",".join(f'"{str(item["url"]).replace(chr(34), "")}"' for item in rss_rows)
    params = {"select": SELECT_FIELDS, "source": "eq.weworkremotely", "deleted_at": "is.null", "archived_at": "is.null", "application_url": f"in.({values})"}
    response = requests.get(f"{api_base()}/opportunities", headers=api_headers(), params=params, timeout=30)
    response.raise_for_status()
    by_url = {item["url"]: item for item in rss_rows}
    rows = sorted([row for row in response.json() if is_candidate(row) and row.get("application_url") in by_url], key=priority)[:limit]
    return [(row, by_url[row["application_url"]]) for row in rows]


def adapt(source: str, row: dict[str, Any], source_payload: dict[str, Any] | None = None, session: requests.Session | None = None) -> AdapterResult:
    detail_url = row.get("source_url") or row.get("application_url")
    if source == "talentcom": return parse_talent_detail(detail_url, session=session)
    if source == "unjobs": return parse_unjobs_detail(detail_url, session=session)
    if source == "himalayas":
        if not source_payload: raise ValueError("himalayas_api_record_unavailable")
        return adapt_himalayas_job(source_payload)
    if source == "weworkremotely":
        rss = source_payload or {"title": row.get("title"), "company": row.get("organization"), "summary": row.get("description"), "requirements": row.get("location"), "published_at": row.get("published_at"), "deadline": row.get("deadline")}
        return parse_wwr_detail(detail_url, rss, session=session)
    raise ValueError("unsupported_source")


def changed_patch(result: AdapterResult, row: dict[str, Any], identity: IdentityResult | None = None) -> dict[str, Any]:
    # A dead page or a source-specific detail mismatch is evidence to defer,
    # never a reason to overwrite a valid historical record with fallback UI.
    if result.source_status in {404, 410} or result.evidence.get("detail_match") is False or (identity and identity.status != "IDENTITY_CONFIRMED"):
        return {}
    proposed = build_rpc_patch(result, row)
    return {key: value for key, value in proposed.items() if row.get(key) != value}


def compact(row: dict[str, Any], result: AdapterResult, patch: dict[str, Any], identity: IdentityResult) -> dict[str, Any]:
    fields = ("organization", "location", "country_code", "onsite_country", "remote", "remote_scope", "eligible_countries", "eligible_regions", "value", "currency", "deadline", "application_url")
    safe_patch = {key: ({"description_length": len(value or "")} if key == "description" else value) for key, value in patch.items()}
    return {"id": row["id"], "source": row["source"], "title": row.get("title"), "detail_url": result.source_url, "adapter_version": result.adapter_version, "http_status": result.source_status, "method": result.extraction_method, "detail_match": result.evidence.get("detail_match", True), "identity_status": identity.status, "identity_method": identity.method, "identity_reason": identity.reason, "before": {**{key: row.get(key) for key in fields}, "description_length": len(row.get("description") or "")}, "extracted": {**{key: getattr(result, {"value": "salary_text", "application_url": "apply_url"}.get(key, key)) for key in fields}, "applicant_location_requirements": result.applicant_location_requirements, "description_length": len(result.description or ""), "description_preview": (result.description or "")[:160]}, "patch": safe_patch, "recommendation": result.recommendation, "reasons": result.recommendation_reasons}


def metrics_for(plans: list[tuple[dict[str, Any], AdapterResult, dict[str, Any], IdentityResult]], selected: int, skipped: int = 0) -> dict[str, Any]:
    results = [result for _, result, _, _ in plans]
    usable = [item for item in results if item.evidence.get("detail_match", True)]
    identities = [identity for _, _, _, identity in plans]
    identity_metrics = {"confirmed": sum(item.status == "IDENTITY_CONFIRMED" for item in identities), "unresolved": sum(item.status == "IDENTITY_UNRESOLVED" for item in identities), "mismatch": sum(item.status == "IDENTITY_MISMATCH" for item in identities), "dead": sum(item.status in {"DEAD", "REMOVED"} for item in identities)}
    removed = [result for result, identity in zip(results, identities) if identity.status in {"DEAD", "REMOVED"} or result.source_status in {404, 410}]
    # A live attempt includes every non-removed response, including 200 pages
    # that the parser cannot understand. That preserves genuine extractor
    # failures while excluding correctly classified source removals.
    live_attempts = [result for result, identity in zip(results, identities) if identity.status not in {"DEAD", "REMOVED"} and result.source_status not in {404, 410}]
    live_details = [item for item in live_attempts if item.source_status == 200 and item.evidence.get("detail_match", True)]
    metrics = {"found": selected, "selected": selected, "skipped": skipped, "detail_pages_attempted": len(results), "detail_pages_success": sum(item.source_status == 200 and item.evidence.get("detail_match", True) for item in results), "parsed": sum(bool(item.title) and item.evidence.get("detail_match", True) for item in results), "coverage": coverage(usable), "live": len(live_details), "removed_or_dead": len(removed), "dead_rate": len(removed) / selected if selected else 0.0, "live_detail_attempted": len(live_attempts), "live_detail_success": len(live_details), "parsed_live": sum(bool(item.title) for item in live_details), "coverage_live": coverage(live_details), "identity": identity_metrics, "enrichment": {"attempted": 0, "changed": 0, "noop": 0, "stale": 0, "failed": 0}, "classification": {key: sum(item.recommendation == key for item in results) for key in ("AUTO_PUBLISH", "AUTO_BLOCK", "HUMAN_REVIEW")}}
    status, reasons = health(metrics); metrics["health"] = {"status": status, "reasons": reasons}; return metrics


def persist_run(source: str, metrics: dict[str, Any], started: datetime, finished: datetime) -> None:
    payload = {"run_id": f"enrichment-canary-{source}-{int(started.timestamp())}", "scraper_id": f"enrichment_{source}", "scraper_name": f"Enrichment canary {source}", "script_path": "scripts/run_opportunity_enrichment_batch.py", "trigger_type": "manual", "status": "healthy" if metrics["health"]["status"] == "HEALTHY" else "warning", "started_at": started.isoformat(), "finished_at": finished.isoformat(), "duration_seconds": max(0, round((finished - started).total_seconds())), "found_count": metrics["selected"], "valid_count": metrics["parsed"], "adapter_version": ADAPTERS[source], "extraction_metrics": metrics}
    response = requests.post(f"{api_base()}/scraper_runs", headers={**api_headers(), "Prefer": "return=minimal"}, json=payload, timeout=30)
    response.raise_for_status()


def observation_payload(row: dict[str, Any], result: AdapterResult, identity: IdentityResult) -> dict[str, Any]:
    """Compact append-only record of an attempted detail, including no-patch outcomes."""
    return {
        "opportunity_id": row["id"], "source": row["source"], "adapter_version": result.adapter_version,
        "identity_status": identity.status, "identity_method": identity.method, "identity_reason": identity.reason,
        "http_status": result.source_status, "detail_url": result.source_url, "canonical_url": result.canonical_url,
        "evidence": {
            "method": result.extraction_method, "fields": result.extracted_fields,
            "confidence": result.confidence, "detail_match": result.evidence.get("detail_match", True),
            "recommendation": result.recommendation, "recommendation_reasons": result.recommendation_reasons,
        },
    }


def persist_observations(plans: list[tuple[dict[str, Any], AdapterResult, dict[str, Any], IdentityResult]]) -> int:
    if not plans:
        return 0
    response = requests.post(
        f"{api_base()}/opportunity_source_observations", headers={**api_headers(), "Prefer": "return=minimal"},
        json=[observation_payload(row, result, identity) for row, result, _, identity in plans], timeout=30,
    )
    response.raise_for_status()
    return len(plans)


def run(source: str, limit: int, apply: bool, opportunity_id: str | None = None, explain_selection: bool = False) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    started = datetime.now(timezone.utc)
    himalayas_inventory_metrics: dict[str, Any] | None = None
    if source == "himalayas":
        # A directed diagnostic starts from HEAD so it cannot be hidden behind
        # an unrelated deep-cycle cursor. Ordinary runs resume durably.
        resume_cursor = None if opportunity_id else latest_himalayas_deep_cursor()
        selected_pairs, himalayas_inventory_metrics = himalayas_current_rows(limit, opportunity_id, start_cursor=resume_cursor); rows = [row for row, _ in selected_pairs]; raw_by_id = {row["id"]: raw for row, raw in selected_pairs}
    elif source == "weworkremotely" and not opportunity_id:
        selected_pairs = wwr_current_rows(limit); rows = [row for row, _ in selected_pairs]; raw_by_id = {row["id"]: raw for row, raw in selected_pairs}
    else:
        rows = fetch_rows(source, limit, opportunity_id); raw_by_id = {}
    now = datetime.now(timezone.utc)
    enrichments = recent_enrichments(source, now)
    observations, observations_available = recent_observations(source, now)
    rows, selection_metrics, selection_details = select_candidates(rows, limit, opportunity_id, enrichments, observations, now)
    plans: list[tuple[dict[str, Any], AdapterResult, dict[str, Any], IdentityResult]] = []; skipped = 0
    for row in rows:
        try:
            result = adapt(source, row, raw_by_id.get(row["id"])); identity = confirm_identity(source, row, result); plans.append((row, result, changed_patch(result, row, identity), identity))
        except Exception as exc:
            skipped += 1; print(json.dumps({"id": row["id"], "error": type(exc).__name__}))
    metrics = metrics_for(plans, len(rows), skipped)
    if himalayas_inventory_metrics is not None:
        metrics["himalayas_inventory"] = himalayas_inventory_metrics
        metrics["source_url_backfills_expected"] = sum(not row.get("source_url") and "source_url" in patch for row, _, patch, _ in plans)
        metrics["rows_semantically_changed"] = sum(bool(patch) for _, _, patch, _ in plans)
        metrics["location_changes"] = sum("location" in patch or "country_code" in patch or "onsite_country" in patch for _, _, patch, _ in plans)
        metrics["eligibility_changes"] = sum("eligible_countries" in patch or "eligible_regions" in patch for _, _, patch, _ in plans)
        metrics["eligible_countries_changes"] = sum("eligible_countries" in patch for _, _, patch, _ in plans)
        metrics["remote_scope_changes"] = sum("remote_scope" in patch for _, _, patch, _ in plans)
        metrics["workplace_location_changes"] = metrics["location_changes"]
        metrics["eligibility_structure_mismatch_count"] = sum("eligibility_structure_mismatch" in result.recommendation_reasons for _, result, _, _ in plans)
        metrics["selected_existing_for_reconciliation"] = len(plans)
        # No SEO scorer is invoked here: ingestion/reconciliation remains
        # separate from catalogue and SEO policy decisions.
        metrics["seo_candidate_count"] = None
        metrics["seo_blocked_count"] = None
    metrics["selection"] = selection_metrics
    metrics["observations_available"] = observations_available
    output = [compact(row, result, patch, identity) for row, result, patch, identity in plans]
    if explain_selection:
        for item in output:
            item["selection"] = selection_details.get(str(item["id"]))
        print("CVITAE_ENRICHMENT_SELECTION=" + json.dumps(selection_metrics, ensure_ascii=True))
    for item in output: print(json.dumps(item, ensure_ascii=True))
    print("CVITAE_ENRICHMENT_BATCH=" + json.dumps({"mode": "APPLY" if apply else "DRY_RUN", "source": source, "adapter_version": ADAPTERS[source], "metrics": metrics}, ensure_ascii=True))
    if not apply:
        return output, metrics
    if metrics["health"]["status"] == "DEGRADED":
        raise RuntimeError("canary_health_degraded_apply_refused")
    if not observations_available:
        raise RuntimeError("source_observations_schema_required_for_apply")
    metrics["observations"] = {"attempted": len(plans), "persisted": persist_observations(plans)}
    enricher = None
    for row, result, patch, identity in plans:
        if not patch:
            metrics["enrichment"]["noop"] += 1; continue
        metrics["enrichment"]["attempted"] += 1
        if enricher is None:
            enricher = AtomicEnricher(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        outcome = enricher.enrich_existing(result, row)
        metrics["enrichment"][outcome.status if outcome.status in metrics["enrichment"] else "failed"] += 1
    persist_run(source, metrics, started, datetime.now(timezone.utc))
    print("CVITAE_ENRICHMENT_APPLY=" + json.dumps({"source": source, "events_created": metrics["enrichment"]["changed"], "metrics": metrics}, ensure_ascii=True))
    return output, metrics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True); parser.add_argument("--limit", type=int, default=5); parser.add_argument("--id", dest="opportunity_id"); parser.add_argument("--apply", action="store_true"); parser.add_argument("--explain-selection", action="store_true"); parser.add_argument("--new-candidates", action="store_true")
    parser.add_argument("--plan-canary", action="store_true")
    parser.add_argument("--canary-size", type=int, default=8)
    parser.add_argument("--execute-canary", action="store_true")
    parser.add_argument("--manifest")
    args = parser.parse_args(); load_local_env()
    if args.limit < 1 or args.limit > MAX_LIMIT: parser.error(f"--limit debe estar entre 1 y {MAX_LIMIT}")
    try: source = canonical_source(args.source)
    except ValueError: parser.error("--source no soportado")
    if args.plan_canary:
        if source != "himalayas" or args.apply or args.execute_canary or args.new_candidates:
            parser.error("--plan-canary sólo admite Himalayas y no puede combinarse con APPLY/execute/new-candidates")
        try:
            rows, summary = plan_himalayas_canary(args.canary_size)
        except ValueError as exc:
            parser.error(str(exc))
        for row in rows:
            printable = {key: value for key, value in row.items() if key != "payload"}
            print("CANARY_PLAN_ROW=" + json.dumps(printable, ensure_ascii=True))
        print("CVITAE_HIMALAYAS_CANARY_PLAN=" + json.dumps(summary, ensure_ascii=True))
        return 0
    if args.execute_canary:
        if source != "himalayas" or args.apply or args.new_candidates or not args.manifest:
            parser.error("--execute-canary requiere --source himalayas y --manifest; no combina con --apply")
        inserted = execute_himalayas_canary(args.manifest)
        print("CVITAE_HIMALAYAS_CANARY_EXECUTION=" + json.dumps({"inserted": inserted}, ensure_ascii=True))
        return 0
    if args.new_candidates:
        if source != "himalayas": parser.error("--new-candidates actualmente sólo admite himalayas")
        if args.apply: parser.error("--new-candidates es estrictamente DRY RUN; no inserta ni aplica")
        candidates, metrics = himalayas_new_candidates(args.limit)
        for candidate in candidates:
            print(json.dumps({key: value for key, value in candidate.items() if key != "_description"}, ensure_ascii=True))
        print("CVITAE_HIMALAYAS_NEW_CANDIDATES=" + json.dumps({"mode": "DRY_RUN", "source": source, "metrics": metrics}, ensure_ascii=True))
        return 0
    if args.apply:
        assert_apply_target()
    print(f"{'APPLY' if args.apply else 'DRY RUN'} MODE source={source} limit={args.limit}")
    run(source, args.limit, args.apply, args.opportunity_id, args.explain_selection); return 0


if __name__ == "__main__": raise SystemExit(main())
