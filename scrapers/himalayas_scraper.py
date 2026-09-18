"""Himalayas V2: public API discovery and normalized source adapter."""
from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from urllib.parse import urlparse, urlunparse

import requests

from opportunity_sink import OpportunitySink
from source_adapters import AdapterResult, AtomicEnricher, RunLineageWriter, build_scan_lineage, clean, coverage, health, recommend
from source_evidence import runtime_telemetry, eight_gates_run_evidence

API_URL = "https://himalayas.app/jobs/api"
SEARCH_API_URL = "https://himalayas.app/jobs/api/search"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ADAPTER_VERSION = "himalayas:v2.0.0"

# Himalayas sends country restrictions as display names in current API payloads.
# This source-local table deliberately normalizes exact country labels only; it
# never guesses from a substring or turns an unknown label into an ISO code.
HIMALAYAS_COUNTRY_CODES = {
    "united states": "US", "mexico": "MX", "canada": "CA", "paraguay": "PY", "argentina": "AR",
    "bolivia": "BO", "brazil": "BR", "brasil": "BR", "chile": "CL", "colombia": "CO",
    "costa rica": "CR", "cuba": "CU", "dominican republic": "DO", "ecuador": "EC",
    "el salvador": "SV", "guatemala": "GT", "haiti": "HT", "honduras": "HN", "nicaragua": "NI",
    "panama": "PA", "peru": "PE", "uruguay": "UY", "venezuela": "VE", "australia": "AU",
    "singapore": "SG", "south korea": "KR", "taiwan": "TW", "serbia": "RS", "netherlands": "NL",
    "luxembourg": "LU", "india": "IN", "spain": "ES", "bulgaria": "BG", "united kingdom": "GB",
    "ireland": "IE", "france": "FR", "germany": "DE", "italy": "IT", "portugal": "PT",
    "belgium": "BE", "switzerland": "CH", "austria": "AT", "denmark": "DK", "finland": "FI",
    "norway": "NO", "sweden": "SE", "poland": "PL", "romania": "RO", "ukraine": "UA",
    "japan": "JP", "china": "CN", "hong kong": "HK", "new zealand": "NZ", "israel": "IL",
    "south africa": "ZA", "nigeria": "NG", "kenya": "KE", "ghana": "GH", "philippines": "PH",
    "indonesia": "ID", "malaysia": "MY", "thailand": "TH", "vietnam": "VN", "turkey": "TR",
    "united arab emirates": "AE", "saudi arabia": "SA", "egypt": "EG", "morocco": "MA",
    "belize": "BZ", "guyana": "GY", "suriname": "SR", "jamaica": "JM", "trinidad and tobago": "TT",
    "puerto rico": "PR", "aruba": "AW", "curaçao": "CW", "curacao": "CW", "anguilla": "AI",
    "antigua and barbuda": "AG", "bahamas": "BS", "barbados": "BB", "bermuda": "BM",
    "bonaire, sint eustatius and saba": "BQ", "cayman islands": "KY", "dominica": "DM", "grenada": "GD",
    "guadeloupe": "GP", "saint kitts and nevis": "KN", "saint lucia": "LC", "saint vincent and the grenadines": "VC",
    "turks and caicos islands": "TC", "virgin islands, british": "VG", "british virgin islands": "VG",
    "virgin islands, u.s.": "VI", "u.s. virgin islands": "VI", "falkland islands (malvinas)": "FK",
    "south georgia and the south sandwich islands": "GS",
}
HIMALAYAS_FULL_TIMEZONE_OFFSETS = frozenset({-11,-10,-9.5,-9,-8,-7,-6,-5,-4,-3.5,-3,-2,-1,0,1,2,3,3.5,4,4.5,5,5.5,5.75,6,6.5,7,8,8.75,9,9.5,10,10.5,11,12,12.75,13,14})


@dataclass(frozen=True)
class HimalayasInventory:
    jobs: tuple[dict, ...]
    pages_seen: int
    records_seen: int
    http_statuses: tuple[int, ...]
    complete: bool
    error: str | None = None
    reported_total_count: int | None = None
    duplicate_records: int = 0
    last_cursor_present: bool = False
    next_cursor: str | None = None
    resume_cursor_used: bool = False


def canonical_himalayas_url(value: object) -> str | None:
    """Stable identity for API guid/applicationLink and legacy DB URLs."""
    text = clean(value, 2000)
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or parsed.netloc.casefold() not in {"himalayas.app", "www.himalayas.app"}:
        return None
    path = parsed.path.rstrip("/")
    if not path.startswith("/companies/") or "/jobs/" not in path:
        return None
    return urlunparse(("https", "himalayas.app", path, "", "", ""))


def job_identity_urls(job: dict) -> tuple[str, ...]:
    return tuple(sorted({url for url in (canonical_himalayas_url(job.get("guid")), canonical_himalayas_url(job.get("applicationLink"))) if url}))


def _country_code_from_himalayas_name(value: object) -> str | None:
    label = clean(value, 160)
    if not label:
        return None
    normalized = re.sub(r"\s+", " ", label.casefold()).strip(" .")
    return HIMALAYAS_COUNTRY_CODES.get(normalized)


def _restriction_values(value: object) -> list[tuple[str | None, str]]:
    """Return explicit ISO-2 evidence before falling back to display text."""
    values = value if isinstance(value, list) else [value] if value else []
    extracted: list[tuple[str | None, str]] = []
    for item in values:
        if isinstance(item, dict):
            alpha2 = clean(item.get("alpha2"), 2)
            alpha2 = alpha2.upper() if alpha2 and re.fullmatch(r"[A-Za-z]{2}", alpha2) else None
            label = clean(item.get("name") or item.get("label") or item.get("value"), 160)
            alpha2 = alpha2 or _country_code_from_himalayas_name(label)
        else:
            label = clean(item, 160)
            alpha2 = _country_code_from_himalayas_name(label)
        if alpha2 or label:
            extracted.append((alpha2, label or alpha2 or ""))
    return extracted


def _himalayas_remote_semantics(job: dict) -> tuple[list[str], str, str | None, str | None]:
    """Keep applicant restrictions distinct from a remote job's workplace.

    Himalayas' ``locationRestrictions`` answers where an applicant may be
    based. It is not evidence that the work itself is on-site in that country.
    """
    restrictions = _restriction_values(job.get("locationRestrictions"))
    timezone_raw = job.get("timezoneRestrictions")
    if timezone_raw is None: timezone_raw = job.get("timezoneRestriction")
    timezones = _restriction_values(timezone_raw)
    numeric_timezones = {float(value) for value in (timezone_raw if isinstance(timezone_raw, list) else [timezone_raw]) if isinstance(value, (int, float))}
    full_timezone_coverage = HIMALAYAS_FULL_TIMEZONE_OFFSETS.issubset(numeric_timezones)
    labels = [label for _, label in restrictions]
    joined = " ".join(labels).casefold()
    explicit_worldwide = any(token in joined for token in ("worldwide", "anywhere", "global"))
    countries = sorted({code for code, _ in restrictions if code})
    if explicit_worldwide or (not restrictions and (not timezones or full_timezone_coverage)):
        scope = "WORLDWIDE"
    elif len(countries) == 1:
        scope = "COUNTRY_SPECIFIC"
    elif len(countries) > 1 or restrictions:
        scope = "REGIONAL"
    else:
        # A time-zone restriction is real eligibility evidence, but is not
        # equivalent to unrestricted worldwide work.
        scope = "UNKNOWN"
    requirements: list[str] = labels[:20]
    if timezones and not full_timezone_coverage:
        requirements.append("Timezone restrictions: " + "; ".join(label for _, label in timezones[:10]))
    return countries, scope, clean("; ".join(requirements), 1000), clean("; ".join(label for _, label in timezones[:20]), 500)

RUBRO_MAP = {"engineering": "Tecnología e IT", "software": "Tecnología e IT", "devops": "Tecnología e IT", "data": "Tecnología e IT", "machine learning": "Tecnología e IT", "design": "Diseño", "marketing": "Marketing y Publicidad", "sales": "Ventas y Comercial", "customer": "Atención al Cliente", "finance": "Banca y Finanzas", "accounting": "Banca y Finanzas", "hr": "Recursos Humanos", "people": "Recursos Humanos", "product": "Producto", "operations": "Operaciones", "legal": "Legal", "content": "Comunicación y Medios", "writing": "Comunicación y Medios", "qa": "Tecnología e IT"}


def get_rubro(title: str, categories: list[str] | None = None) -> str:
    text = f"{title} {' '.join(categories or [])}".lower()
    return next((value for key, value in RUBRO_MAP.items() if key in text), "General")


def _date(value: object) -> str | None:
    text = clean(value, 64)
    return text[:10] if text and re.match(r"^\d{4}-\d{2}-\d{2}", text) else None


def _salary(job: dict) -> tuple[str | None, str | None]:
    currency = clean(job.get("currency"), 12)
    minimum, maximum = job.get("minSalary"), job.get("maxSalary")
    period = clean(job.get("salaryPeriod"), 40) or "year"
    if isinstance(minimum, (int, float)) and isinstance(maximum, (int, float)):
        return f"{currency or ''} {minimum:,.0f}–{maximum:,.0f}/{period}".strip(), currency
    if isinstance(minimum, (int, float)):
        return f"{currency or ''} {minimum:,.0f}+/{period}".strip(), currency
    return None, currency


def adapt_himalayas_job(job: dict, source_status: int = 200) -> AdapterResult:
    """Use Himalayas API fields directly; no list geography or HTML fallback."""
    source_url = clean(job.get("guid"), 2000) or clean(job.get("applicationLink"), 2000) or ""
    apply_url = clean(job.get("applicationLink"), 2000) or source_url
    restrictions = _restriction_values(job.get("locationRestrictions"))
    eligible_countries, scope, requirements, timezone_evidence = _himalayas_remote_semantics(job)
    remote = True
    salary_text, currency = _salary(job)
    description = clean(job.get("description"), 12000) or clean(job.get("excerpt"), 4000)
    result = AdapterResult(source="himalayas", adapter_version=ADAPTER_VERSION, source_url=source_url, source_native_id=source_url.rstrip("/").split("/")[-1] or None, canonical_url=source_url, apply_url=apply_url, title=clean(job.get("title"), 240), organization=clean(job.get("companyName"), 240), description=description, location="Remote", country_code=None, onsite_country=None, remote=remote, remote_scope=scope, employment_type=clean(job.get("employmentType"), 120), salary_text=salary_text, currency=currency, date_posted=_date(job.get("pubDate")), deadline=_date(job.get("expiryDate")), applicant_location_requirements=requirements, eligible_countries=eligible_countries, extraction_method="himalayas_api", source_status=source_status, confidence=.98)
    result.extracted_fields = [key for key in ("title", "organization", "description", "location", "remote", "remote_scope", "eligible_countries", "employment_type", "salary_text", "date_posted", "deadline") if getattr(result, key)]
    result.missing_expected_fields = [key for key in ("organization", "description") if not getattr(result, key)]
    unresolved = sorted({label for code, label in restrictions if not code and label})
    result.evidence = {"method": "himalayas_api", "fields": result.extracted_fields, "source_status": source_status, "confidence": .98, "job_location_evidence": None, "work_arrangement_evidence": "himalayas_remote_job", "clear_inherited_geo": True, "location_restrictions": [{"alpha2": code, "name": label} for code, label in restrictions[:20]], "timezone_restrictions": timezone_evidence, "eligibility_evidence": requirements, "unresolved_eligibility_evidence": unresolved}
    result = recommend(result)
    # A restriction list is explicit candidate-eligibility evidence. Never
    # auto-publish if it cannot be faithfully represented in structured form.
    if restrictions and scope != "WORLDWIDE" and (not eligible_countries or unresolved):
        result.recommendation = "HUMAN_REVIEW"
        result.recommendation_reasons = ["eligibility_structure_mismatch"]
    return result


def fetch_page(cursor: str | None = None, limit: int = 100, session: requests.Session | None = None) -> tuple[list[dict], str | None, int | None, int]:
    """Fetch one cursor page; the cursor is opaque and never constructed locally."""
    params: dict[str, object] = {"limit": limit}
    if cursor:
        params["cursor"] = cursor
    response: requests.Response | None = None
    for attempt in range(3):
        response = (session or requests).get(API_URL, params=params, headers={"User-Agent": "CVitae Himalayas inventory/1.0"}, timeout=(5, 20))
        if response.status_code not in {429, 500, 502, 503, 504} or attempt == 2:
            break
        time.sleep(.5 * (2 ** attempt))
    assert response is not None
    if not response.ok:
        return [], None, None, response.status_code
    payload = response.json()
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs", []), list):
        raise ValueError("malformed_himalayas_api_response")
    total = payload.get("totalCount")
    return payload["jobs"], payload.get("nextCursor") or None, int(total) if isinstance(total, int) else None, response.status_code


def fetch_search_inventory(*, filters: dict[str, object], page_size: int = 20, max_pages: int = 50, session: requests.Session | None = None) -> HimalayasInventory:
    """Search API provider: page-based, deliberately independent of Browse cursors."""
    jobs: list[dict] = []; seen: set[str] = set(); statuses: list[int] = []; duplicates = 0; total: int | None = None
    page_size = min(max(int(page_size), 1), 20)
    for page in range(1, max(1, max_pages) + 1):
        params = {**filters, "page": page, "limit": page_size}
        response: requests.Response | None = None
        try:
            for attempt in range(3):
                response = (session or requests).get(SEARCH_API_URL, params=params, headers={"User-Agent": "CVitae Himalayas search/1.0"}, timeout=(5, 20))
                if response.status_code not in {429, 500, 502, 503, 504} or attempt == 2: break
                retry_after = response.headers.get("Retry-After")
                time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else .5 * (2 ** attempt))
        except requests.RequestException as exc:
            return HimalayasInventory(tuple(jobs), page - 1, len(jobs), tuple(statuses), False, type(exc).__name__, total, duplicates)
        assert response is not None; statuses.append(response.status_code)
        if response.status_code != 200:
            return HimalayasInventory(tuple(jobs), page, len(jobs), tuple(statuses), False, f"http_{response.status_code}", total, duplicates)
        try: payload = response.json()
        except ValueError: return HimalayasInventory(tuple(jobs), page, len(jobs), tuple(statuses), False, "malformed_himalayas_search_response", total, duplicates)
        batch = payload.get("jobs") if isinstance(payload, dict) else None
        if not isinstance(batch, list): return HimalayasInventory(tuple(jobs), page, len(jobs), tuple(statuses), False, "malformed_himalayas_search_response", total, duplicates)
        reported = payload.get("totalCount")
        if isinstance(reported, int): total = reported
        for job in batch:
            identity = next(iter(job_identity_urls(job)), None)
            if not identity or identity in seen: duplicates += 1; continue
            seen.add(identity); jobs.append(job)
        if not batch or (total is not None and len(jobs) >= total):
            return HimalayasInventory(tuple(jobs), page, len(jobs), tuple(statuses), True, None, total, duplicates)
    return HimalayasInventory(tuple(jobs), max_pages, len(jobs), tuple(statuses), False, "page_budget_reached", total, duplicates)


def fetch_api_inventory(*, page_size: int = 100, max_pages: int = 200, max_records: int | None = None, start_cursor: str | None = None, session: requests.Session | None = None) -> HimalayasInventory:
    """Single structured API inventory path for scraper, scout and reconciliation.

    A missing current record is deliberately not interpreted as death.  The
    returned inventory is only identity/semantic evidence for exact matches.
    """
    page_size = min(max(int(page_size), 1), 100)
    jobs: list[dict] = []; seen: set[str] = set(); cursors: set[str] = {start_cursor} if start_cursor else set(); statuses: list[int] = []
    cursor: str | None = start_cursor; duplicates = 0; reported_total: int | None = None
    for page in range(max(1, max_pages)):
        try:
            batch, next_cursor, total, status = fetch_page(cursor, page_size, session)
        except (requests.RequestException, ValueError) as exc:
            return HimalayasInventory(tuple(jobs), page, len(jobs), tuple(statuses), False, type(exc).__name__, reported_total, duplicates, bool(cursor), cursor, bool(start_cursor))
        statuses.append(status)
        if status != 200:
            return HimalayasInventory(tuple(jobs), page + 1, len(jobs), tuple(statuses), False, f"http_{status}", reported_total, duplicates, bool(cursor), cursor, bool(start_cursor))
        if total is not None:
            reported_total = total
        for job in batch:
            identity = next(iter(job_identity_urls(job)), None)
            if not identity or identity in seen:
                duplicates += 1
                continue
            seen.add(identity); jobs.append(job)
            if max_records is not None and len(jobs) >= max_records:
                return HimalayasInventory(tuple(jobs), page + 1, len(jobs), tuple(statuses), False, "record_budget_reached", reported_total, duplicates, bool(next_cursor), next_cursor, bool(start_cursor))
        if not next_cursor:
            return HimalayasInventory(tuple(jobs), page + 1, len(jobs), tuple(statuses), True, None, reported_total, duplicates, False, None, bool(start_cursor))
        if next_cursor in cursors:
            return HimalayasInventory(tuple(jobs), page + 1, len(jobs), tuple(statuses), False, "repeated_cursor", reported_total, duplicates, True, next_cursor, bool(start_cursor))
        cursors.add(next_cursor)
        cursor = next_cursor
    return HimalayasInventory(tuple(jobs), max_pages, len(jobs), tuple(statuses), False, "page_budget_reached", reported_total, duplicates, bool(cursor), cursor, bool(start_cursor))


def main() -> None:
    max_items = int(os.getenv("CVITAE_MAX_ITEMS", "250"))
    seen: set[str] = set(); details: list[AdapterResult] = []; new_jobs: list[dict] = []
    enrichment = {"attempted": 0, "changed": 0, "noop": 0, "stale": 0, "failed": 0}
    enricher = AtomicEnricher(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_KEY else None
    inventory = fetch_api_inventory(page_size=100, max_pages=200)
    if inventory.error:
        print(f"Himalayas API error: {inventory.error}")
    for raw in inventory.jobs:
            if len(seen) >= max_items:
                break
            status = 200
            detail = adapt_himalayas_job(raw, status)
            if not detail.source_url or detail.source_url in seen:
                continue
            seen.add(detail.source_url); details.append(detail)
            categories = raw.get("categories") or raw.get("parentCategories") or []
            job = {"title": detail.title, "organization": detail.organization, "description": detail.description, "location": detail.location, "country_code": detail.country_code, "onsite_country": detail.onsite_country, "remote": detail.remote, "remote_scope": detail.remote_scope, "value": detail.salary_text, "currency": detail.currency, "published_at": detail.date_posted, "deadline": detail.deadline, "source_url": detail.source_url, "application_url": detail.apply_url, "source": "himalayas", "is_active": True, "rubro": get_rubro(detail.title or "", categories), "tags": [str(item).lower().replace(" ", "-") for item in categories[:8]], "source_authority": "aggregator", "original_source_verified": False}
            existing = (enricher.lookup(detail.apply_url) or enricher.lookup(detail.source_url, "source_url")) if enricher else None
            if existing:
                enrichment["attempted"] += 1; outcome = enricher.enrich_existing(detail, existing)
                if outcome.status in enrichment: enrichment[outcome.status] += 1
            else:
                new_jobs.append(job)
    summary = OpportunitySink().upsert(new_jobs) if new_jobs else None
    metrics_lineage = RunLineageWriter(SUPABASE_URL, SUPABASE_KEY).record(details) if SUPABASE_KEY else build_scan_lineage(details, run_id=os.getenv("CVITAE_SCRAPER_RUN_ID"), scan_request_id=os.getenv("CVITAE_SOURCE_SCAN_REQUEST_ID"))
    valid = sum(bool(item.title) for item in details)
    rejected = max(0, len(seen) - valid)
    provider_health = "HEALTHY"
    # A bounded traversal is a coverage decision, never a transport/parser
    # incident. Only genuine provider failures affect operational health.
    if inventory.error and inventory.error not in {"page_budget_reached", "record_budget_reached", "runtime_budget_reached"}:
        provider_health = "DEGRADED" if inventory.error.startswith(("http_429", "http_5", "Connection", "Timeout")) else "UNHEALTHY"
    _budget_hit = len(seen) >= max_items
    _coverage_complete = False if _budget_hit else inventory.complete
    coverage_stop = "record_budget_reached" if _budget_hit else ("complete" if inventory.complete else (inventory.error or "incomplete"))
    metrics = {"found": len(seen), "valid": valid, "processed": len(details), "rejected": rejected,
      "detail_pages_attempted": len(details), "detail_pages_success": sum(item.source_status == 200 for item in details), "parsed": valid,
      "coverage": coverage(details), "enrichment": enrichment, "scan_lineage": metrics_lineage,
      "classification": {key: sum(item.recommendation == key for item in details) for key in ("AUTO_PUBLISH", "AUTO_BLOCK", "HUMAN_REVIEW")}}
    # Provider health is deliberately independent from a bounded inventory walk
    # and minor row rejections.  The monitor persists this shape in
    # ``scraper_runs.extraction_metrics`` for the source runtime.
    metrics.update(runtime_telemetry(
        provider_health=provider_health, coverage_complete=_coverage_complete,
        coverage_stop_reason=coverage_stop, found=len(seen), valid=valid,
        processed=len(details), rejected=rejected,
        rejection_reasons={"missing_or_generic_title": rejected} if rejected else {},
        page_budget_reached=inventory.error == "page_budget_reached",
        runtime_budget_reached=inventory.error == "runtime_budget_reached",
        provider_error=inventory.error,
    ))
    metrics["health"] = {"status": provider_health, "reasons": [] if provider_health == "HEALTHY" else [inventory.error or "provider_error"]}
    metrics["eight_gates"] = eight_gates_run_evidence(source="himalayas", adapter_version=ADAPTER_VERSION, metrics=metrics, details=details, summary=summary.to_dict() if summary else None)
    if summary: print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION, "extraction_metrics": metrics}, ensure_ascii=False))


if __name__ == "__main__":
    main()
