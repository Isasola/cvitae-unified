"""
HireOn — plataforma de empleo LATAM / remoto internacional.
URL: https://hireon.io/jobs
Extrae ofertas abiertas usando JSON-LD + HTML fallback.
"""
import requests
from bs4 import BeautifulSoup
import json
import time
import os

from opportunity_sink import OpportunitySink

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

BASE_URL = "https://hireon.io"
JOBS_URL = f"{BASE_URL}/jobs"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

RUBRO_MAP = {
    "engineering": "Tecnología e IT",
    "software": "Tecnología e IT",
    "developer": "Tecnología e IT",
    "design": "Diseño y Creatividad",
    "marketing": "Marketing y Publicidad",
    "sales": "Ventas y Comercial",
    "finance": "Banca y Finanzas",
    "operations": "Administración",
    "customer": "Atención al Cliente",
    "data": "Tecnología e IT",
    "product": "Tecnología e IT",
    "hr": "Recursos Humanos",
    "human resources": "Recursos Humanos",
}


def infer_rubro(title: str) -> str:
    t = title.lower()
    for k, v in RUBRO_MAP.items():
        if k in t:
            return v
    return "Tecnología e IT"


def fetch(url: str) -> str:
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def extract_from_jsonld(soup, source_url: str) -> list:
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
            title = item.get("title") or item.get("name", "")
            if not title:
                continue
            org = item.get("hiringOrganization", {})
            company = org.get("name", "") if isinstance(org, dict) else str(org)
            loc_data = item.get("jobLocation", {})
            location = "Remote"
            if isinstance(loc_data, dict):
                addr = loc_data.get("address", {})
                location = addr.get("addressLocality", "Remote") if isinstance(addr, dict) else "Remote"
            description = item.get("description", "")
            if description:
                from bs4 import BeautifulSoup as BS
                description = BS(description, "html.parser").get_text(separator=" ")[:2000]
            url_val = item.get("url") or source_url
            jobs.append({
                "title": title,
                "organization": company,
                "location": location,
                "rubro": infer_rubro(title),
                "type": item.get("employmentType", ""),
                "description": description,
                "application_url": url_val,
                "source": "hireon",
                "country_code": "WW",
                "is_active": True,
                "tags": ["remoto", "latam"],
            })
    return jobs


def extract_from_html(soup, source_url: str) -> list:
    jobs = []
    # HireOn job card selectors (inspect-based — may need updating)
    cards = soup.select("div.job-card, article.job, li.job-listing, div[class*='job']")
    for card in cards:
        title_el = card.select_one("h2, h3, a.job-title, [class*='title']")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        if not title or len(title) < 4:
            continue
        link_el = card.select_one("a[href]")
        href = link_el.get("href", "") if link_el else ""
        full_url = href if href.startswith("http") else BASE_URL + href

        company_el = card.select_one("[class*='company'], [class*='employer'], span.org")
        company = company_el.get_text(strip=True) if company_el else ""

        loc_el = card.select_one("[class*='location'], [class*='loc']")
        location = loc_el.get_text(strip=True) if loc_el else "Remote"

        desc_el = card.select_one("[class*='description'], [class*='desc'], p")
        description = desc_el.get_text(separator=" ", strip=True)[:2000] if desc_el else ""

        jobs.append({
            "title": title,
            "organization": company,
            "location": location,
            "rubro": infer_rubro(title),
            "type": "",
            "description": description,
            "application_url": full_url or source_url,
            "source": "hireon",
            "country_code": "WW",
            "is_active": True,
            "tags": ["remoto", "latam"],
        })
    return jobs


def scrape(max_pages: int = 3) -> list:
    all_jobs = []
    for page in range(1, max_pages + 1):
        url = JOBS_URL if page == 1 else f"{JOBS_URL}?page={page}"
        html = fetch(url)
        if not html:
            print(f"  página {page}: no response")
            break
        soup = BeautifulSoup(html, "html.parser")
        jobs = extract_from_jsonld(soup, url)
        if not jobs:
            jobs = extract_from_html(soup, url)
        if not jobs:
            print(f"  página {page}: 0 resultados — stop")
            break
        print(f"  página {page}: {len(jobs)} ofertas")
        all_jobs.extend(jobs)
        time.sleep(1.5)
    return all_jobs


def main():
    print("Rastreando HireOn...")
    jobs = scrape(max_pages=3)
    summary = OpportunitySink().upsert(jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(f"\n=== HireOn: {summary.inserted} nuevas, {summary.updated} actualizadas, "
          f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas ===")


if __name__ == "__main__":
    main()
