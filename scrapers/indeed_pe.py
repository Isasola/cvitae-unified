"""
Indeed Peru — versión peruana del mayor portal de empleo del mundo.
URL: https://pe.indeed.com
Nota: Indeed bloquea scraping agresivo. Usar con max_pages=1 y delay alto.
Depende de JSON-LD (JobPosting schema) en páginas de búsqueda.
"""
import requests
from bs4 import BeautifulSoup
import time
import os
import re
import json

from opportunity_sink import OpportunitySink

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

BASE_URL = "https://pe.indeed.com"

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Cache-Control": "max-age=0",
}

SEARCHES = [
    ("administración", "Lima", "Administración"),
    ("ventas", "Lima", "Ventas y Comercial"),
    ("desarrollador software", "Lima", "Tecnología e IT"),
    ("marketing digital", "Lima", "Marketing y Publicidad"),
    ("contador", "Lima", "Banca y Finanzas"),
    ("recursos humanos", "Lima", "Recursos Humanos"),
    ("logística", "Lima", "Logística y Transporte"),
    ("enfermera médico", "Lima", "Salud y Medicina"),
    ("ingeniero", "Lima", "Ingeniería"),
    ("docente", "Lima", "Educación"),
]


def _strip_html(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r" {2,}", " ", text).strip()


def fetch(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def extract_from_jsonld(soup, rubro, keyword):
    jobs = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = data.get("@graph", [data]) if isinstance(data, dict) else data
        if not isinstance(items, list):
            items = [items]
        for item in items:
            if item.get("@type") != "JobPosting":
                continue
            title = item.get("title", "") or item.get("name", "")
            url_val = item.get("url", "")
            if not title or not url_val:
                continue
            org = item.get("hiringOrganization", {})
            company = org.get("name", "") if isinstance(org, dict) else str(org)
            loc_data = item.get("jobLocation", {})
            if isinstance(loc_data, dict):
                addr = loc_data.get("address", {})
                location = addr.get("addressLocality", "Lima") if isinstance(addr, dict) else "Lima"
            else:
                location = "Lima"
            description = _strip_html(item.get("description", ""))[:2000]
            full_url = url_val if url_val.startswith("http") else BASE_URL + url_val
            jobs.append({
                "title": title,
                "organization": company,
                "location": f"{location}, Peru",
                "rubro": rubro,
                "type": item.get("employmentType", ""),
                "description": description,
                "application_url": full_url,
                "source": "indeed_pe",
                "country_code": "PE",
                "is_active": True,
                "tags": [keyword.lower()],
            })
    return jobs


def extract_from_html(soup, rubro, keyword):
    jobs = []
    # Indeed job cards use td.resultContent or div.job_seen_beacon
    cards = soup.select("div.job_seen_beacon, td.resultContent, div[class*='jobCard']")
    for card in cards:
        title_el = card.select_one("h2 a, a.jobtitle, a[data-jk]")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        if not title:
            continue
        link = title_el.get("href", "")
        if not link:
            continue
        full_url = link if link.startswith("http") else BASE_URL + link

        company_el = card.select_one("span.companyName, a[data-testid='company-name'], span[class*='company']")
        company = company_el.get_text(strip=True) if company_el else ""

        location_el = card.select_one("div.companyLocation, span[data-testid='text-location']")
        location = location_el.get_text(strip=True) if location_el else "Lima, Peru"

        desc_el = card.select_one("div.job-snippet, ul.jobCardShelfContainer, div[class*='snippet']")
        description = desc_el.get_text(separator=" ", strip=True)[:2000] if desc_el else ""

        jobs.append({
            "title": title,
            "organization": company,
            "location": location,
            "rubro": rubro,
            "type": "",
            "description": description,
            "application_url": full_url,
            "source": "indeed_pe",
            "country_code": "PE",
            "is_active": True,
            "tags": [keyword.lower()],
        })
    return jobs


def scrape_search(keyword, city, rubro, max_pages=2):
    jobs = []
    for page in range(max_pages):
        start = page * 10
        url = f"{BASE_URL}/jobs?q={requests.utils.quote(keyword)}&l={requests.utils.quote(city)}&start={start}"
        html = fetch(url)
        if not html:
            break

        soup = BeautifulSoup(html, "html.parser")
        extracted = extract_from_jsonld(soup, rubro, keyword)
        if not extracted:
            extracted = extract_from_html(soup, rubro, keyword)

        if not extracted:
            break

        jobs.extend(extracted)
        print(f"  [{keyword}] página {page+1}: {len(extracted)} ofertas")
        time.sleep(3)  # Indeed requires slower crawling

    return jobs


def main():
    all_jobs = []

    for keyword, city, rubro in SEARCHES:
        print(f"\nRastreando Indeed PE: '{keyword}' en {city}")
        jobs = scrape_search(keyword, city, rubro, max_pages=2)
        all_jobs.extend(jobs)
        time.sleep(3)

    summary = OpportunitySink().upsert(all_jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== Indeed PE: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas ==="
    )


if __name__ == "__main__":
    main()
