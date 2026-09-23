"""UNJobs V2 collector: discover lists, then enrich from public vacancy details."""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink
from source_adapters import AdapterResult, AtomicEnricher, RunLineageWriter, build_scan_lineage, clean, coverage, geo_from_detail, health, recommend
from source_evidence import ingestion_accounting_telemetry, runtime_telemetry, eight_gates_run_evidence, run_quality_metrics

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
FETCH_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9,es;q=0.8"}
ADAPTER_VERSION = "unjobs:v2.0.0"

PAGES = [
    "https://unjobs.org/duty_stations/paraguay", "https://unjobs.org/duty_stations/argentina",
    "https://unjobs.org/duty_stations/bolivia", "https://unjobs.org/duty_stations/colombia",
    "https://unjobs.org/duty_stations/peru", "https://unjobs.org/duty_stations/brazil",
    "https://unjobs.org/duty_stations/chile", "https://unjobs.org/duty_stations/mexico",
    "https://unjobs.org/themes/youth", "https://unjobs.org/themes/gender", "https://unjobs.org/themes/innovation",
]
# UNJobs uses Cloudflare; challenge pages are tiny (< 2 KB).
_CF_BLOCK_LEN = 2000
_CF_MARKERS = ("just a moment", "cloudflare", "cf-chl", "challenge-platform", "attention required")
_MAX_LISTING_PAGES = 200

FIELD_BREAK = re.compile(r"\s+(?:Organization|Country|City|Field location|Office|Job Category|Duty Station(?:\(s\)|s)?|Posting (?:Start|End) Date|Contract Type|Seniority Level|Work schedule|Salary|Job description|Duties|Responsibilities|Qualifications|Details|Description)\s*:", re.I)
ELIGIBILITY_CUE = re.compile(
    r"(?:candidates?\s+must\s+be\s+currently\s+based\s+and\s+authorized\s+to\s+work\s+in\s+one\s+of\s+the\s+following\s+countries\s+to\s+be\s+eligible\s+for\s+(?:this|the)\s+position\s*:\s*|one\s+of\s+the\s+following\s+countries[^.:]{0,180}(?:eligible|eligibility)[^:]{0,120}:\s*|eligible\s+countries\s*:\s*|open\s+to\s+(?:candidates|applicants|nationals)\s+from\s*:)(?P<list>[^.]{1,1200})",
    re.I,
)
ELIGIBILITY_COUNTRIES = {"bolivia":"BO", "belize":"BZ", "chile":"CL", "ecuador":"EC", "guatemala":"GT", "guyana":"GY", "honduras":"HN", "mexico":"MX", "paraguay":"PY", "peru":"PE", "suriname":"SR"}
ELIGIBILITY_REGIONS = {"latin america":"LATAM", "latam":"LATAM", "caribbean":"CARIBBEAN", "global":"GLOBAL"}


def _label_value(text: str, *labels: str) -> str | None:
    escaped = "|".join(re.escape(label) for label in labels)
    line_match = re.search(rf"(?:^|\n)\s*(?:{escaped})\s*:\s*([^\n]+)", text, re.I)
    if line_match:
        return clean(line_match.group(1), 240)
    stop = r"(?=\s+(?:Organization|Country|City|Field location|Office|Job Category|Duty Station(?:\(s\)|s)?|Posting (?:Start|End) Date|Contract Type|Seniority Level|Work schedule|Salary|Job description|Duties|Responsibilities|Qualifications|Details|Description)\s*:|$)"
    match = re.search(rf"(?:{escaped})\s*:\s*(.+?){stop}", text, re.I)
    return clean(match.group(1), 240) if match else None


def _inline_label_value(text: str | None, *labels: str) -> str | None:
    """Extract a label from a flattened multi-field detail container."""
    value = clean(text, 2000) or ""
    if not value:
        return None
    escaped = "|".join(re.escape(label) for label in labels)
    match = re.search(rf"(?:^|\s)(?:{escaped})\s*:\s*(.+?)(?={FIELD_BREAK.pattern}|$)", value, re.I)
    return clean(match.group(1), 240) if match else None


def _detail_label_value(soup: BeautifulSoup, text: str, *labels: str) -> str | None:
    """UNJobs often renders a label and its value in the same list item."""
    wanted = {label.casefold().rstrip(":") for label in labels}
    for node in soup.find_all(string=True):
        if node.strip().casefold().rstrip(":") not in wanted:
            continue
        container = node.parent.find_parent(["li", "p", "tr", "div"]) or node.parent
        value = clean(container.get_text(" "), 300)
        if value:
            inline = _inline_label_value(value, *labels)
            if inline:
                return inline
            stripped = re.sub(rf"^(?:{'|'.join(re.escape(label) for label in labels)})\s*:\s*", "", value, flags=re.I)
            if stripped and stripped != value:
                return clean(FIELD_BREAK.split(stripped, maxsplit=1)[0], 240)
    return _label_value(text, *labels)


def _eligibility(detail_text: str | None) -> tuple[list[str], list[str], str | None]:
    """Use country/region lists only when an explicit eligibility cue exists."""
    evidence: list[str] = []
    countries: set[str] = set()
    regions: set[str] = set()
    for match in ELIGIBILITY_CUE.finditer(detail_text or ""):
        window = match.group("list").casefold()
        countries.update(code for name, code in ELIGIBILITY_COUNTRIES.items() if re.search(rf"\b{re.escape(name)}\b", window))
        regions.update(code for name, code in ELIGIBILITY_REGIONS.items() if re.search(rf"\b{re.escape(name)}\b", window))
        evidence.append(clean(match.group(0), 1200) or "")
    return sorted(countries), sorted(regions), clean("; ".join(evidence), 1000)


def _iso_date(value: str | None) -> str | None:
    value = clean(value, 64)
    if not value:
        return None
    for pattern in ("%d-%b-%Y", "%d %b %Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, pattern).date().isoformat()
        except ValueError:
            pass
    return value if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) else None


def _vacancy_id(url: str) -> str | None:
    match = re.search(r"/vacancies/(\d+)", urlparse(url).path)
    return match.group(1) if match else None


def _section_text(soup: BeautifulSoup) -> str | None:
    for selector in ("#job-description", ".job-description", "#jobdesc", ".jobdesc", 'div[id^="job"]', "article", "main"):
        node = soup.select_one(selector)
        value = clean(node.get_text(" ") if node else None, 7000)
        if value and len(value) >= 80:
            return value
    for heading in soup.find_all(["h2", "h3", "h4"]):
        if not re.search(r"job description|duties|responsibilit|qualifications|details", heading.get_text(" "), re.I):
            continue
        parts = []
        for sibling in heading.find_all_next(["p", "li"]):
            if sibling.find_previous(["h2", "h3", "h4"]) is not heading:
                break
            parts.append(sibling.get_text(" ", strip=True))
        value = clean(" ".join(parts), 7000)
        if value and len(value) >= 80:
            return value
    return None


def _apply_url(soup: BeautifulSoup, url: str) -> str:
    for node in soup.find_all("a", href=True):
        label = clean(node.get_text(" "), 80) or ""
        href = urljoin(url, node["href"])
        if re.search(r"apply|application", label, re.I) and urlparse(href).netloc not in {"", "unjobs.org", "www.unjobs.org"}:
            return href
    return url


def parse_unjobs_detail(url: str, session: requests.Session | None = None) -> AdapterResult:
    """Parse a detail page; list-page country is intentionally not an input."""
    try:
        response = (session or requests).get(url, headers=FETCH_HEADERS, timeout=(5, 20))
    except requests.RequestException:
        return AdapterResult(source="unjobs", adapter_version=ADAPTER_VERSION, source_url=url, source_status=0)
    soup = BeautifulSoup(response.text if response.ok else "", "html.parser")
    json_job = {}
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            parsed = json.loads(node.get_text())
            values = parsed if isinstance(parsed, list) else [parsed] + list(parsed.get("@graph", [])) if isinstance(parsed, dict) else []
            json_job = next((item for item in values if isinstance(item, dict) and (item.get("@type") == "JobPosting" or "JobPosting" in item.get("@type", []))), {})
            if json_job:
                break
        except (ValueError, TypeError):
            continue
    canonical_node = soup.select_one('link[rel="canonical"]')
    canonical_url = urljoin(url, canonical_node["href"]) if canonical_node and canonical_node.get("href") else url
    title_node = soup.select_one("h1, h2")
    content = soup.select_one('div[id^="job"], main, article, #content, #job') or soup.new_tag("div")
    body_text = content.get_text("\n", strip=True)
    title = clean(json_job.get("title"), 240) or clean(title_node.get_text(" ") if title_node else None, 240)
    organization = clean((json_job.get("hiringOrganization") or {}).get("name"), 240) or _detail_label_value(soup, body_text, "Organization")
    country_label, city = _detail_label_value(soup, body_text, "Country"), _detail_label_value(soup, body_text, "City")
    # UNJobs uses both City and Field location.  The latter is a job-location
    # subdivision, not an eligibility or work-arrangement signal.
    field_location = _detail_label_value(soup, body_text, "Field location")
    duty_station = _detail_label_value(soup, body_text, "Duty Station(s)", "Duty Stations", "Duty Station")
    office = _detail_label_value(soup, body_text, "Office")
    locality = field_location or city
    location = ", ".join(part for part in (locality, country_label) if part) or duty_station or office
    description = clean(json_job.get("description"), 7000) or _section_text(soup)
    remote_text = " ".join(filter(None, [location, duty_station, _label_value(body_text, "Work location"), description[:500] if description else None]))
    remote = True if re.search(r"\b(remote|home[ -]based|telecommut)\b", remote_text, re.I) else None
    country, scope, onsite = geo_from_detail(" ".join(filter(None, [country_label, locality, duty_station])), None, remote)
    salary_text = _detail_label_value(soup, body_text, "Salary", "Salary - Monthly")
    currency_match = re.search(r"\b(USD|EUR|GBP|CHF)\b", salary_text or "", re.I)
    employment_type = _detail_label_value(soup, body_text, "Contract Type", "Work schedule")
    date_posted = _iso_date(clean(json_job.get("datePosted"), 64) or _detail_label_value(soup, body_text, "Posting Start Date"))
    deadline = _iso_date(clean(json_job.get("validThrough"), 64) or _detail_label_value(soup, body_text, "Posting End Date", "Closing Date", "Apply by"))
    eligible_countries, eligible_regions, eligibility_evidence = _eligibility(description)
    result = AdapterResult(source="unjobs", adapter_version=ADAPTER_VERSION, source_url=url, source_native_id=_vacancy_id(url), canonical_url=canonical_url, apply_url=_apply_url(soup, url), title=title, organization=organization, description=description, location=location, country_code=country, onsite_country=onsite, remote=remote, remote_scope=scope, employment_type=employment_type, salary_text=salary_text, currency=currency_match.group(1).upper() if currency_match else None, date_posted=date_posted, deadline=deadline, applicant_location_requirements=eligibility_evidence, eligible_countries=eligible_countries, eligible_regions=eligible_regions, extraction_method="unjobs_json_ld" if json_job else "unjobs_html", source_status=response.status_code, confidence=.98 if json_job else .82)
    result.extracted_fields = [key for key in ("title", "organization", "description", "location", "country_code", "onsite_country", "remote_scope", "employment_type", "date_posted", "deadline", "eligible_countries", "eligible_regions") if getattr(result, key)]
    result.missing_expected_fields = [key for key in ("organization", "description", "location") if not getattr(result, key)]
    clear_arrangement = bool(country and remote is None and scope is None)
    result.evidence = {"method": result.extraction_method, "fields": result.extracted_fields, "source_status": response.status_code, "confidence": result.confidence, "job_geo": {"location": location, "country_code": country, "onsite_country": onsite}, "eligibility": {"countries": eligible_countries, "regions": eligible_regions, "evidence": eligibility_evidence}, "work_arrangement": "undetermined" if clear_arrangement else "explicit", "clear_inherited_work_arrangement": clear_arrangement}
    return recommend(result)


def fetch(url: str) -> str:
    try:
        response = requests.get(url, headers=FETCH_HEADERS, timeout=30)
        return response.text if response.ok else ""
    except requests.RequestException as exc:
        print(f"  fetch error {url}: {type(exc).__name__}")
        return ""


def _scrape_listing_page(url: str) -> tuple[list[dict], bool]:
    """Return (jobs, cf_blocked) for a single listing page."""
    html = fetch(url)
    soup = BeautifulSoup(html, "html.parser")
    # A short response alone is ambiguous: a valid small listing must not be
    # labelled a provider block when it still has the expected job structure.
    lowered = html.casefold()
    has_listing = bool(soup.select("div.job a.jtitle"))
    if not has_listing and (any(marker in lowered for marker in _CF_MARKERS) or len(html) < _CF_BLOCK_LEN):
        return [], True
    jobs = []
    for card in soup.select("div.job"):
        title_el = card.select_one("a.jtitle")
        if title_el and title_el.get("href"):
            jobs.append({
                "title": clean(title_el.get_text(" "), 240),
                "application_url": urljoin(url, title_el["href"]),
                "source": "unjobs", "is_active": True,
                "rubro": "Organismos Internacionales",
                "tags": ["onu", "internacional", "organismo-internacional"],
            })
    return jobs, False


def scrape_page(url: str) -> list[dict]:
    """Compat shim — single listing page without pagination."""
    jobs, _ = _scrape_listing_page(url)
    return jobs


def _discover_listing(base_url: str, seen: set[str]) -> tuple[list[dict], str]:
    """
    Follow numbered pagination for base_url until natural exhaustion or CF block.
    Returns (new_jobs, stop_reason) where stop_reason is 'exhausted' or
    'provider_rate_limit'.  New jobs are deduplicated against seen.
    """
    new_jobs: list[dict] = []
    page_num = 1
    while page_num <= _MAX_LISTING_PAGES:
        url = base_url if page_num == 1 else f"{base_url}/{page_num}"
        jobs, cf_blocked = _scrape_listing_page(url)
        if cf_blocked:
            return new_jobs, "provider_rate_limit"
        if not jobs:
            return new_jobs, "exhausted"
        added = 0
        for job in jobs:
            if job["application_url"] not in seen:
                seen.add(job["application_url"])
                new_jobs.append(job)
                added += 1
        if not added:
            return new_jobs, "pagination_stalled"
        page_num += 1
        time.sleep(1.0)
    return new_jobs, "pagination_safety_limit"


def main() -> None:
    max_items = int(os.getenv("CVITAE_MAX_ITEMS", "250"))
    seen: set[str] = set()
    discovered_jobs: list[dict] = []
    details: list[AdapterResult] = []
    new_jobs: list[dict] = []
    enrichment = {"attempted": 0, "changed": 0, "noop": 0, "stale": 0, "failed": 0}
    enricher = AtomicEnricher(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_KEY else None

    # Phase 1: Discovery — follow pagination for every configured listing URL.
    # Tracks all accessible unique vacancies before detail budget applies.
    discovery_stops: list[str] = []
    for page_url in PAGES:
        new, stop = _discover_listing(page_url, seen)
        discovered_jobs.extend(new)
        discovery_stops.append(stop)
        time.sleep(1.5)

    discovered_total = len(discovered_jobs)
    any_cf = any(s == "provider_rate_limit" for s in discovery_stops)
    all_exhausted = all(s == "exhausted" for s in discovery_stops)

    # Phase 2: Detail — process up to max_items from the discovered pool.
    for job in discovered_jobs:
        if len(details) >= max_items:
            break
        discovery_url = job["application_url"]
        detail = parse_unjobs_detail(discovery_url)
        details.append(detail)
        for key, value in {
            "title": detail.title, "organization": detail.organization,
            "description": detail.description, "location": detail.location,
            "country_code": detail.country_code, "onsite_country": detail.onsite_country,
            "remote": detail.remote, "remote_scope": detail.remote_scope,
            "eligible_countries": detail.eligible_countries, "eligible_regions": detail.eligible_regions,
            "type": detail.employment_type,
            "value": detail.salary_text, "currency": detail.currency,
            "published_at": detail.date_posted, "deadline": detail.deadline,
            "source_url": detail.source_url, "application_url": detail.apply_url,
        }.items():
            if value is not None:
                job[key] = value
        job["source_authority"] = "aggregator"
        job["original_source_verified"] = False
        existing = (enricher.lookup(discovery_url) or enricher.lookup(detail.source_url, "source_url")) if enricher else None
        if existing:
            enrichment["attempted"] += 1
            outcome = enricher.enrich_existing(detail, existing)
            if outcome.status in enrichment:
                enrichment[outcome.status] += 1
        else:
            new_jobs.append(job)

    summary = OpportunitySink().upsert(new_jobs) if new_jobs else None
    metrics_lineage = (
        RunLineageWriter(SUPABASE_URL, SUPABASE_KEY).record(details)
        if SUPABASE_KEY
        else build_scan_lineage(details, run_id=os.getenv("CVITAE_SCRAPER_RUN_ID"), scan_request_id=os.getenv("CVITAE_SOURCE_SCAN_REQUEST_ID"))
    )

    budget_hit = len(details) >= max_items and discovered_total > max_items
    source_coverage_complete = all_exhausted
    source_stop = "natural_exhaustion" if all_exhausted else "provider_rate_limit" if any_cf else next((item for item in discovery_stops if item != "exhausted"), "configured_listing_pages")
    if any_cf:
        _coverage_complete = False
        _coverage_stop = "provider_rate_limit"
    elif not source_coverage_complete:
        _coverage_complete = False
        _coverage_stop = source_stop
    elif budget_hit:
        _coverage_complete = False
        _coverage_stop = "record_budget_reached"
    else:
        _coverage_complete = True
        _coverage_stop = "natural_exhaustion"

    metrics = {
        "found": discovered_total,
        "discovered_total": discovered_total,
        "detail_pages_attempted": len(details),
        "detail_pages_success": sum(item.source_status == 200 for item in details),
        "parsed": sum(bool(item.title) for item in details),
        "coverage": coverage(details),
        "enrichment": enrichment,
        "scan_lineage": metrics_lineage,
        "classification": {
            key: sum(item.recommendation == key for item in details)
            for key in ("AUTO_PUBLISH", "AUTO_BLOCK", "HUMAN_REVIEW")
        },
    }
    metrics["discovery"] = {"total": discovered_total, "coverage_complete": source_coverage_complete, "stop_reason": source_stop}
    metrics["processing"] = {"attempted": len(details), "budget": max_items, "coverage_complete": not budget_hit, "stop_reason": "record_budget_reached" if budget_hit else "discovered_pool_processed", "unprocessed_due_to_budget": max(0, discovered_total - len(details))}
    baseline = enricher.recent_healthy_baseline("unjobs_scraper") if enricher else None
    status, reasons = health(metrics, baseline)
    metrics["health"] = {"status": status, "reasons": reasons}
    metrics.update(runtime_telemetry(
        provider_health="DEGRADED" if status == "DEGRADED" else "HEALTHY",
        coverage_complete=_coverage_complete,
        coverage_stop_reason=_coverage_stop,
        found=discovered_total,
        valid=metrics["parsed"],
        processed=len(details),
        rejected=max(0, len(details) - metrics["parsed"]),
        rejection_reasons={"detail_parse": max(0, len(details) - metrics["parsed"])},
    ))
    ingestion_summary = ingestion_accounting_telemetry(
        discovered=discovered_total,
        detail_attempted=len(details),
        parsed=metrics["parsed"],
        existing_enrichment=enrichment,
        new_rows_submitted_to_sink=len(new_jobs),
        sink_summary=summary.to_dict() if summary else None,
        budget_skipped=max(0, discovered_total - len(details)),
    )
    metrics["ingestion_accounting"] = ingestion_summary["ingestion_accounting"]
    qm = run_quality_metrics(details, coverage_complete=_coverage_complete, stop_reason=_coverage_stop)
    metrics["eight_gates"] = eight_gates_run_evidence(
        source="unjobs", adapter_version=ADAPTER_VERSION,
        metrics=metrics, details=details,
        summary=ingestion_summary,
        quality_metrics=qm,
    )
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(ingestion_summary, ensure_ascii=False))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION, "extraction_metrics": metrics}, ensure_ascii=False))


if __name__ == "__main__":
    main()
