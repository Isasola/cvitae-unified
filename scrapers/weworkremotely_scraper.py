"""We Work Remotely V2: RSS discovery followed by deterministic detail parsing."""
from __future__ import annotations

import json
import os
import re
import time
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree as ET

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink
from source_adapters import AdapterResult, AtomicEnricher, COUNTRY_TERMS, clean, country_from_text, geo_from_detail, health, recommend
from source_evidence import runtime_telemetry, eight_gates_run_evidence

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ADAPTER_VERSION = "wwr:v2.0.0"
CATEGORIES = [("remote-programming-jobs", "Tecnología e IT"), ("remote-devops-sysadmin-jobs", "Tecnología e IT"), ("remote-design-jobs", "Diseño"), ("remote-marketing-jobs", "Marketing y Publicidad"), ("remote-sales-and-marketing-jobs", "Ventas y Comercial"), ("remote-customer-support-jobs", "Atención al Cliente"), ("remote-finance-jobs", "Banca y Finanzas"), ("remote-product-jobs", "Producto"), ("remote-operations-jobs", "Operaciones"), ("remote-writing-jobs", "Comunicación y Medios"), ("remote-business-jobs", "Negocios"), ("remote-data-science-jobs", "Tecnología e IT"), ("remote-qa-jobs", "Tecnología e IT"), ("remote-hr-jobs", "Recursos Humanos")]
BASE_RSS = "https://weworkremotely.com/categories/{}.rss"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"}


def _date(value: str | None) -> str | None:
    if not value: return None
    try: return parsedate_to_datetime(value).date().isoformat()
    except (TypeError, ValueError): return clean(value, 64)[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", clean(value, 64) or "") else None


def _native_id(url: str) -> str | None:
    return urlparse(url).path.rstrip("/").split("/")[-1] or None


def parse_feed(url: str) -> list[ET.Element]:
    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        return ET.fromstring(response.content).findall(".//item") if response.ok else []
    except (requests.RequestException, ET.ParseError) as exc:
        print(f"RSS parse error {url}: {type(exc).__name__}"); return []


def rss_job(item: ET.Element, rubro: str) -> dict | None:
    raw_title, url = clean(item.findtext("title"), 300), clean(item.findtext("link") or item.findtext("guid"), 2000)
    if not raw_title or not url: return None
    company, title = (raw_title.split(": ", 1) + [""])[:2] if ": " in raw_title else (None, raw_title)
    requirements = "; ".join(filter(None, [clean(item.findtext(key), 240) for key in ("region", "country", "state")])) or None
    return {"url": url, "title": title, "company": company, "summary": item.findtext("description") or "", "requirements": requirements, "employment_type": clean(item.findtext("type"), 120), "published_at": _date(item.findtext("pubDate")), "deadline": _date(item.findtext("expires_at")), "rubro": rubro}


def _description(soup: BeautifulSoup) -> str | None:
    for selector in ("#job-description", ".job-description", ".listing-container .description", "article", "main"):
        node = soup.select_one(selector); value = clean(node.get_text(" ") if node else None, 12000)
        if value and len(value) >= 80: return value
    return None


def _apply_url(soup: BeautifulSoup, detail_url: str) -> str:
    for node in soup.find_all("a", href=True):
        label, href = clean(node.get_text(" "), 80) or "", urljoin(detail_url, node["href"])
        if re.search(r"apply|application", label, re.I) and urlparse(href).netloc not in {"", "weworkremotely.com", "www.weworkremotely.com"}:
            return href
    return detail_url


def _eligibility_from_restriction(value: str | None) -> tuple[list[str], list[str], str]:
    """WWR RSS/detail restrictions are applicant evidence, never workplace geo."""
    text = clean(value, 1000) or ""
    lowered = text.casefold()
    if any(token in lowered for token in ("worldwide", "anywhere", "all countries")):
        return [], [], "WORLDWIDE"
    countries = sorted({code for terms, code in COUNTRY_TERMS if any(term in lowered for term in terms)})
    if countries:
        return countries, [], "COUNTRY_SPECIFIC" if len(countries) == 1 else "REGIONAL"
    if any(token in lowered for token in ("europe", "emea", "americas", "apac", "latin america", "latam")):
        region = "LATAM" if "lat" in lowered or "america" in lowered and "latin" in lowered else "REGIONAL"
        return [], [region], "REGIONAL"
    return [], [], "UNKNOWN"


def parse_wwr_detail(url: str, rss: dict | None = None, session: requests.Session | None = None) -> AdapterResult:
    try: response = (session or requests).get(url, headers=HEADERS, timeout=(5, 20))
    except requests.RequestException: return AdapterResult(source="weworkremotely", adapter_version=ADAPTER_VERSION, source_url=url, source_status=0)
    soup = BeautifulSoup(response.text if response.ok else "", "html.parser"); json_job = {}
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            value = json.loads(node.get_text()); items = value if isinstance(value, list) else [value] + list(value.get("@graph", [])) if isinstance(value, dict) else []
            json_job = next((item for item in items if isinstance(item, dict) and (item.get("@type") == "JobPosting" or "JobPosting" in item.get("@type", []))), {})
            if json_job: break
        except (ValueError, TypeError): continue
    canonical = soup.select_one('link[rel="canonical"]'); canonical_url = urljoin(url, canonical["href"]) if canonical and canonical.get("href") else url
    h1 = soup.select_one("h1"); title = clean(json_job.get("title"), 240) or clean(h1.get_text(" ") if h1 else (rss or {}).get("title"), 240)
    detail_organization = clean((soup.select_one(".company, [class*='company']") or soup.new_tag("div")).get_text(" "), 240)
    if detail_organization and (len(detail_organization) > 120 or re.search(r"\b(posted|apply|save job)\b", detail_organization, re.I) or detail_organization == title):
        detail_organization = None
    organization = clean((json_job.get("hiringOrganization") or {}).get("name"), 240) or detail_organization or clean((rss or {}).get("company"), 240)
    description = clean(json_job.get("description"), 12000) or _description(soup) or clean((rss or {}).get("summary"), 4000)
    page_text = clean((soup.select_one("main, article, .listing-container") or soup.new_tag("div")).get_text(" "), 5000) or ""
    requirements = clean("; ".join(filter(None, [(rss or {}).get("requirements"), re.search(r"(?:location|eligible|must be located|work from)\s*:?\s*([^\.]{1,180})", page_text, re.I).group(1) if re.search(r"(?:location|eligible|must be located|work from)\s*:?\s*([^\.]{1,180})", page_text, re.I) else None])), 1000)
    remote = True
    # JSON-LD jobLocation, when present, is the only workplace evidence.
    job_address = (json_job.get("jobLocation") or {}).get("address") if isinstance(json_job.get("jobLocation"), dict) else {}
    job_location = clean(" ".join(str(job_address.get(key) or "") for key in ("addressLocality", "addressRegion", "addressCountry")), 240) if isinstance(job_address, dict) else None
    country, _, onsite = geo_from_detail(job_location, None, remote)
    if remote:
        onsite = None
    eligible_countries, eligible_regions, scope = _eligibility_from_restriction(requirements)
    salary_match = re.search(r"(?:salary|compensation)\s*:?\s*([\$\u20ac\u00a3]?\s*[\d,]+(?:\s*[-–]\s*[\$\u20ac\u00a3]?\s*[\d,]+)?)", page_text, re.I)
    currency = "USD" if salary_match and "$" in salary_match.group(1) else None
    requested_id, canonical_id = _native_id(url), _native_id(canonical_url)
    # Old RSS links may resolve with HTTP 200 to WWR's generic index.  HTTP
    # success is not evidence that the requested advert still exists.
    detail_mismatch = bool(
        (title or "").casefold() == "the largest job board for remote jobs"
        or (requested_id and canonical_id and requested_id != canonical_id)
    )
    result = AdapterResult(source="weworkremotely", adapter_version=ADAPTER_VERSION, source_url=url, source_native_id=requested_id, canonical_url=canonical_url, apply_url=_apply_url(soup, url), title=title, organization=organization, description=description, location=job_location, country_code=country, onsite_country=onsite, remote=True, remote_scope=scope, employment_type=clean((rss or {}).get("employment_type"), 120), salary_text=salary_match.group(1) if salary_match else None, currency=currency, date_posted=(rss or {}).get("published_at"), deadline=(rss or {}).get("deadline"), applicant_location_requirements=requirements, eligible_countries=eligible_countries, eligible_regions=eligible_regions, extraction_method="wwr_json_ld" if json_job else "wwr_html", source_status=response.status_code, confidence=.98 if json_job else .82)
    result.extracted_fields = [key for key in ("title", "organization", "description", "country_code", "remote_scope", "employment_type", "salary_text", "date_posted", "deadline") if getattr(result, key)]
    result.missing_expected_fields = [key for key in ("organization", "description") if not getattr(result, key)]
    result.evidence = {"method": result.extraction_method, "fields": result.extracted_fields, "source_status": response.status_code, "confidence": result.confidence, "rss_requirements": (rss or {}).get("requirements"), "detail_match": not detail_mismatch}
    result = recommend(result)
    if detail_mismatch:
        result.recommendation = "HUMAN_REVIEW"
        result.recommendation_reasons = ["wwr_detail_page_mismatch"]
    return result


def main() -> None:
    seen: set[str] = set(); details: list[AdapterResult] = []; new_jobs: list[dict] = []; enrichment = {"attempted": 0, "changed": 0, "noop": 0, "stale": 0, "failed": 0}
    enricher = AtomicEnricher(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_KEY else None
    for slug, rubro in CATEGORIES:
        for item in parse_feed(BASE_RSS.format(slug)):
            rss = rss_job(item, rubro)
            if not rss or rss["url"] in seen: continue
            seen.add(rss["url"]); detail = parse_wwr_detail(rss["url"], rss); details.append(detail)
            job = {"title": detail.title, "organization": detail.organization, "description": detail.description, "location": detail.location, "country_code": detail.country_code, "onsite_country": detail.onsite_country, "remote": detail.remote, "remote_scope": detail.remote_scope, "value": detail.salary_text, "currency": detail.currency, "published_at": detail.date_posted, "deadline": detail.deadline, "source_url": detail.source_url, "application_url": detail.apply_url, "source": "weworkremotely", "is_active": True, "rubro": rss["rubro"], "tags": [rss["rubro"].lower().replace(" ", "-")], "source_authority": "aggregator", "original_source_verified": False}
            existing = (enricher.lookup(rss["url"]) or enricher.lookup(detail.source_url, "source_url")) if enricher else None
            if existing:
                enrichment["attempted"] += 1; outcome = enricher.enrich_existing(detail, existing)
                if outcome.status in enrichment: enrichment[outcome.status] += 1
            else: new_jobs.append(job)
        time.sleep(1)
    summary = OpportunitySink().upsert(new_jobs) if new_jobs else None
    metrics = {"found": len(seen), "detail_pages_attempted": len(details), "detail_pages_success": sum(item.source_status == 200 for item in details), "parsed": sum(bool(item.title) for item in details), "coverage": coverage(details), "enrichment": enrichment, "classification": {key: sum(item.recommendation == key for item in details) for key in ("AUTO_PUBLISH", "AUTO_BLOCK", "HUMAN_REVIEW")}}
    baseline = enricher.recent_healthy_baseline("weworkremotely_scraper") if enricher else None; status, reasons = health(metrics, baseline); metrics["health"] = {"status": status, "reasons": reasons}
    metrics.update(runtime_telemetry(provider_health="DEGRADED" if status == "DEGRADED" else "HEALTHY", coverage_complete=None, coverage_stop_reason="rss_category_walk", found=len(seen), valid=metrics["parsed"], processed=len(details), rejected=max(0, len(seen)-metrics["parsed"]), rejection_reasons={"detail_or_generic_mismatch": sum(item.evidence.get("detail_match") is False for item in details)}))
    metrics["eight_gates"] = eight_gates_run_evidence(source="weworkremotely", adapter_version=ADAPTER_VERSION, metrics=metrics, details=details, summary=summary.to_dict() if summary else None)
    if summary: print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION, "extraction_metrics": metrics}, ensure_ascii=False))


if __name__ == "__main__": main()
