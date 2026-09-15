"""
Talent.com — agregador global con buena cobertura de Paraguay y LatAm.
No requiere API key. Scraping HTML público.
"""
import requests
from bs4 import BeautifulSoup
import time
import os
import re
import json
from urllib.parse import urljoin
from source_adapters import (
    AdapterResult, AtomicEnricher, RunLineageWriter, build_scan_lineage, clean, coverage, geo_from_detail, health,
    native_id, recommend,
)
from opportunity_sink import OpportunitySink
from source_evidence import runtime_telemetry, eight_gates_run_evidence

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"

HEADERS_DB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

HEADERS_FETCH = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

BASE_URL = "https://www.talent.com"

# (keywords, location, rubro)
SEARCHES = [
    ("", "Paraguay", "General"),
    ("analista", "Paraguay", "General"),
    ("desarrollador", "Paraguay", "Tecnología e IT"),
    ("contador", "Paraguay", "Banca y Finanzas"),
    ("administración", "Paraguay", "Administración"),
    ("ventas", "Paraguay", "Ventas y Comercial"),
    ("diseño", "Paraguay", "Diseño"),
    ("marketing", "Paraguay", "Marketing y Publicidad"),
    ("recursos humanos", "Paraguay", "Recursos Humanos"),
    ("logística", "Paraguay", "Logística y Supply Chain"),
    ("salud enfermería", "Paraguay", "Salud"),
    ("remoto latam", "Paraguay", "General"),
    ("ingeniero", "Paraguay", "Ingeniería y Manufactura"),
    ("docente educación", "Paraguay", "Educación"),
]

RUBRO_KEYWORDS = {
    "tecnolog": "Tecnología e IT",
    "software": "Tecnología e IT",
    "developer": "Tecnología e IT",
    "programador": "Tecnología e IT",
    "sistemas": "Tecnología e IT",
    "contador": "Banca y Finanzas",
    "finanzas": "Banca y Finanzas",
    "banco": "Banca y Finanzas",
    "ventas": "Ventas y Comercial",
    "comercial": "Ventas y Comercial",
    "marketing": "Marketing y Publicidad",
    "diseño": "Diseño",
    "rrhh": "Recursos Humanos",
    "recursos humanos": "Recursos Humanos",
    "logística": "Logística y Supply Chain",
    "salud": "Salud",
    "médico": "Salud",
    "enfermería": "Salud",
    "docente": "Educación",
    "educación": "Educación",
    "ingenier": "Ingeniería y Manufactura",
    "legal": "Derecho",
    "abogado": "Derecho",
    "comunicación": "Comunicación y Medios",
}


def guess_rubro(title, default="General"):
    t = title.lower()
    for kw, rubro in RUBRO_KEYWORDS.items():
        if kw in t:
            return rubro
    return default


def fetch_page(keywords, location, page=1):
    params = {"k": keywords, "l": location, "p": page}
    try:
        r = requests.get(f"{BASE_URL}/jobs", params=params, headers=HEADERS_FETCH, timeout=30)
        if r.status_code != 200:
            print(f"  [Talent.com] HTTP {r.status_code}")
            return []
        return r.text
    except Exception as e:
        print(f"  [Talent.com] fetch error: {e}")
        return ""


ADAPTER_VERSION = "talent:v2.0.0"


def _talent_eligibility(value: str | None) -> tuple[list[str], list[str], str | None]:
    """ApplicantLocationRequirements is eligibility, not a workplace address."""
    text = clean(value, 500) or ""
    country, scope, _ = geo_from_detail(None, text, True)
    if scope == "WORLDWIDE":
        return [], [], "WORLDWIDE"
    if country:
        return [country], [], "COUNTRY_SPECIFIC"
    if scope in {"LATAM", "REGIONAL"}:
        return [], [scope], "REGIONAL"
    return [], [], "UNKNOWN" if text else None

def parse_talent_detail(url, session: requests.Session | None = None):
    """Extract one public Talent detail page; search location is never an input here."""
    try:
        response = (session or requests).get(url, headers=HEADERS_FETCH, timeout=(5, 20))
    except requests.RequestException:
        return AdapterResult(source="talentcom", adapter_version=ADAPTER_VERSION, source_url=url, source_status=0)
    html = response.text if response.ok else ""
    soup = BeautifulSoup(html, "html.parser")
    job = {}
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            parsed = json.loads(node.get_text())
            values = parsed if isinstance(parsed, list) else [parsed] + list(parsed.get("@graph", [])) if isinstance(parsed, dict) else []
            job = next((item for item in values if isinstance(item, dict) and (item.get("@type") == "JobPosting" or "JobPosting" in item.get("@type", []))), {})
            if job: break
        except (ValueError, TypeError): pass
    canonical = soup.select_one('link[rel="canonical"]')
    canonical_url = urljoin(url, canonical.get("href")) if canonical else url
    title_node = soup.select_one("h1")
    title = clean(job.get("title")) or clean(title_node.get_text() if title_node else None, 240)
    organization = clean((job.get("hiringOrganization") or {}).get("name"), 240)
    detail_column = soup.select_one('[class*="jobDescriptionColumn"]')
    detail_text = clean(detail_column.get_text(" ") if detail_column else None, 6000)
    if detail_text and "job description" in detail_text.lower():
        detail_text = re.split(r"job description\s*", detail_text, maxsplit=1, flags=re.I)[-1]
    description = clean(job.get("description"), 4000) or clean(detail_text, 4000) or clean((soup.select_one('[data-testid*="description"], .job-description, .job_description') or soup.new_tag("div")).get_text(" "), 4000)
    header_meta = title_node.parent.find_next_sibling() if title_node and title_node.parent else None
    header_parts = [clean(part.get_text(" "), 240) for part in header_meta.select("span")] if header_meta else []
    header_parts = [part for part in header_parts if part and not re.fullmatch(r"[^\w]+", part)]
    if not organization and header_parts:
        organization = header_parts[0]
    location = clean(((job.get("jobLocation") or {}).get("address") or {}).get("addressLocality"), 240)
    country_text = clean(((job.get("jobLocation") or {}).get("address") or {}).get("addressCountry"), 80)
    if not location and len(header_parts) > 1:
        location = header_parts[1]
    restrictions = clean(job.get("applicantLocationRequirements"), 240)
    details_text = clean((soup.select_one('[class*="jobDetails"]') or soup.new_tag("div")).get_text(" "), 400)
    remote = bool(job.get("jobLocationType") == "TELECOMMUTE" or re.search(r"\bremote\b", " ".join(filter(None, [title, location, restrictions, details_text])), re.I))
    # Workplace derives only from JobPosting.jobLocation. Applicant restrictions
    # are structured separately and must never manufacture onsite geography.
    country, workplace_scope, onsite = geo_from_detail(" ".join(filter(None, [location, country_text])), None, remote)
    if remote:
        onsite = None
    eligible_countries, eligible_regions, eligibility_scope = _talent_eligibility(restrictions)
    scope = eligibility_scope or workplace_scope
    salary = job.get("baseSalary") or {}; salary_value = salary.get("value") if isinstance(salary, dict) else None
    salary_text = clean(salary_value.get("value") if isinstance(salary_value, dict) else salary_value, 160)
    salary_match = re.search(r"(?:compensation|salary)\s*:\s*([\$\u20ac\u00a3]?\s*[\d,.]+(?:\s*/\s*\w+)?)", detail_text or "", re.I)
    salary_text = salary_text or (salary_match.group(1).strip() if salary_match else None)
    employment_type = clean(job.get("employmentType"), 120)
    if not employment_type and details_text:
        match = re.search(r"job type\s+(.+?)(?:\s+remote|$)", details_text, re.I)
        employment_type = clean(match.group(1) if match else None, 120)
    source_id = native_id(url)
    apply_node = next(
        (node for node in soup.find_all("a", href=lambda href: href and "/redirect" in href) if native_id(urljoin(url, node.get("href"))) == source_id),
        None,
    )
    apply_link = apply_node.get("href") if apply_node else None
    apply_link = apply_link or next((node.get("href") for node in soup.select("a[href]") if clean(node.get_text(" "), 40) and clean(node.get_text(" "), 40).casefold() == "apply"), None)
    apply_url = urljoin(url, apply_link) if apply_link else url
    currency = clean(salary.get("currency") if isinstance(salary, dict) else None, 12)
    if not currency and salary_text and "$" in salary_text:
        currency = "USD"
    result = AdapterResult(source="talentcom", adapter_version=ADAPTER_VERSION, source_url=url, source_native_id=native_id(url), canonical_url=canonical_url,
      apply_url=apply_url, title=title, organization=organization, description=description, location=location, country_code=country,
      onsite_country=onsite, remote=remote if remote else None, remote_scope=scope, employment_type=employment_type, salary_text=salary_text,
      currency=currency, date_posted=clean(job.get("datePosted"), 64), deadline=clean(job.get("validThrough"), 64),
      applicant_location_requirements=restrictions, eligible_countries=eligible_countries, eligible_regions=eligible_regions, extraction_method="talent_json_ld" if job else "talent_html", source_status=response.status_code, confidence=.98 if job else .55)
    result.extracted_fields = [key for key, value in result.__dict__.items() if value and key in {"title","organization","description","location","country_code","remote_scope","employment_type","salary_text","currency","date_posted","deadline"}]
    result.missing_expected_fields = [key for key in ("organization", "description", "location") if not getattr(result, key)]
    result.evidence = {"method": result.extraction_method, "fields": result.extracted_fields, "source_status": response.status_code, "confidence": result.confidence}
    return recommend(result)


def parse_jobs(html, default_rubro, location):
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    seen_titles = set()

    for h2 in soup.select("h2"):
        title = h2.get_text(strip=True)
        if not title or len(title) < 5 or title in seen_titles:
            continue
        seen_titles.add(title)

        # Get link from h2 or nearest parent
        a = h2.find("a")
        if not a:
            a = h2.find_parent("a")
        if not a:
            a = h2.find_next("a")
        if not a:
            continue

        href = a.get("href", "")
        if not href:
            continue
        url = href if href.startswith("http") else f"{BASE_URL}{href}"

        # Get company from nearby element
        parent = h2.parent or h2
        company_el = parent.find_next(string=re.compile(r"^[A-Z].{2,60}$"))
        company = ""
        # Try sibling spans/divs for company name
        for sib in h2.find_next_siblings(["span", "div", "p"])[:3]:
            txt = sib.get_text(strip=True)
            if txt and 3 < len(txt) < 80 and not txt.startswith("http"):
                company = txt
                break

        rubro = guess_rubro(title, default_rubro)

        jobs.append({
            "title": title,
            "organization": company or None,
            "location": None,
            "rubro": rubro,
            "type": "Remoto" if "remote" in title.lower() or "remoto" in title.lower() else "Tiempo completo",
            "description": None,
            "application_url": url,
            "source": "talentcom",
            "is_active": True,
            "tags": [],
        })

    return jobs


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS_DB,
            json=job,
        )
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def main():
    total_found = 0
    seen_urls = set()
    detail_results = []
    new_jobs = []
    enrichment = {"attempted": 0, "changed": 0, "noop": 0, "stale": 0, "failed": 0}
    enricher = AtomicEnricher(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_KEY else None

    for keywords, location, rubro in SEARCHES:
        label = f"'{keywords}'" if keywords else "general"
        print(f"\nFetching Talent.com: {label} en {location}")

        html = fetch_page(keywords, location)
        jobs = parse_jobs(html, rubro, location)

        for job in jobs:
            if job["application_url"] in seen_urls:
                continue
            seen_urls.add(job["application_url"])
            total_found += 1
            detail = parse_talent_detail(job["application_url"])
            detail_results.append(detail)
            for key, value in {"title": detail.title, "organization": detail.organization, "description": detail.description,
                               "location": detail.location, "country_code": detail.country_code, "onsite_country": detail.onsite_country,
                               "remote": detail.remote, "remote_scope": detail.remote_scope, "value": detail.salary_text,
                               "currency": detail.currency, "published_at": detail.date_posted, "deadline": detail.deadline,
                               "source_url": detail.source_url, "application_url": detail.apply_url}.items():
                if value is not None: job[key] = value
            job["source_authority"] = "aggregator"
            job["original_source_verified"] = False
            existing = (enricher.lookup(job["application_url"]) or enricher.lookup(detail.source_url, "source_url")) if enricher else None
            if existing:
                enrichment["attempted"] += 1
                outcome = enricher.enrich_existing(detail, existing)
                if outcome.status in enrichment:
                    enrichment[outcome.status] += 1
                print(f"  [{(job['organization'] or 'sin organización')[:30]}] {job['title'][:50]} -> enrichment:{outcome.status}")
            else:
                new_jobs.append(job)

        time.sleep(1.5)

    summary = OpportunitySink().upsert(new_jobs) if new_jobs else None
    metrics_lineage = RunLineageWriter(SUPABASE_URL, SUPABASE_KEY).record(detail_results) if SUPABASE_KEY else build_scan_lineage(detail_results, run_id=os.getenv("CVITAE_SCRAPER_RUN_ID"), scan_request_id=os.getenv("CVITAE_SOURCE_SCAN_REQUEST_ID"))
    inserted = (summary.inserted + summary.updated) if summary else 0
    metrics = {
        "found": total_found,
        "detail_pages_attempted": total_found,
        "detail_pages_success": sum(item.source_status == 200 for item in detail_results),
        "parsed": sum(bool(item.title) for item in detail_results),
        "coverage": coverage(detail_results),
        "enrichment": enrichment, "scan_lineage": metrics_lineage,
        "classification": {key: sum(item.recommendation == key for item in detail_results) for key in ("AUTO_PUBLISH", "AUTO_BLOCK", "HUMAN_REVIEW")},
    }
    baseline = enricher.recent_healthy_baseline("talentcom_scraper") if enricher else None
    status, reasons = health(metrics, baseline)
    metrics["health"] = {"status": status, "reasons": reasons}
    metrics.update(runtime_telemetry(provider_health="DEGRADED" if status == "DEGRADED" else "HEALTHY", coverage_complete=False, coverage_stop_reason="configured_search_set", found=total_found, valid=metrics["parsed"], processed=len(detail_results), rejected=max(0,total_found-metrics["parsed"]), rejection_reasons={"detail_parse": max(0,total_found-metrics["parsed"])}))
    metrics["eight_gates"] = eight_gates_run_evidence(source="talentcom", adapter_version=ADAPTER_VERSION, metrics=metrics, details=detail_results, summary=summary.to_dict() if summary else None)
    if summary:
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION, "extraction_metrics": metrics}, ensure_ascii=False))
    print(f"\n=== Talent.com V2: {inserted} nuevas/actualizadas, {enrichment['changed']} enriquecidas de {total_found} detail pages ===")


if __name__ == "__main__":
    main()
