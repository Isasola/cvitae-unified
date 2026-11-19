"""
Pivot Jobs — plataforma de empleos remotos y tech para LATAM.
URL: https://www.pivot.jobs
Enfocada en roles tech y startups para profesionales latinoamericanos.
"""
import requests
from bs4 import BeautifulSoup
import json
import time
import os
import re

from opportunity_sink import OpportunitySink

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

BASE_URL = "https://www.pivot.jobs"
JOBS_URL = f"{BASE_URL}/jobs"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

RUBRO_MAP = {
    "engineer": "Tecnología e IT",
    "developer": "Tecnología e IT",
    "software": "Tecnología e IT",
    "data": "Tecnología e IT",
    "product": "Tecnología e IT",
    "design": "Diseño y Creatividad",
    "ux": "Diseño y Creatividad",
    "marketing": "Marketing y Publicidad",
    "sales": "Ventas y Comercial",
    "finance": "Banca y Finanzas",
    "operations": "Administración",
    "devops": "Tecnología e IT",
    "backend": "Tecnología e IT",
    "frontend": "Tecnología e IT",
    "fullstack": "Tecnología e IT",
    "mobile": "Tecnología e IT",
    "qa": "Tecnología e IT",
    "growth": "Marketing y Publicidad",
    "hr": "Recursos Humanos",
    "people": "Recursos Humanos",
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
            location = "Remote, LATAM"
            if isinstance(loc_data, dict):
                addr = loc_data.get("address", {})
                location = addr.get("addressLocality", "Remote, LATAM") if isinstance(addr, dict) else "Remote, LATAM"
            description = re.sub(r"<[^>]+>", " ", item.get("description", ""))[:2000]
            url_val = item.get("url") or source_url
            jobs.append({
                "title": title,
                "organization": company,
                "location": location,
                "rubro": infer_rubro(title),
                "type": item.get("employmentType", ""),
                "description": description,
                "application_url": url_val,
                "source": "pivot_jobs",
                "country_code": "WW",
                "is_active": True,
                "tags": ["remoto", "tech", "latam", "startups"],
            })
    return jobs


def extract_from_html(soup, source_url: str) -> list:
    jobs = []
    cards = soup.select("div.job-card, li.job, article.job, div[class*='job-item'], div[class*='position']")
    for card in cards:
        title_el = card.select_one("h2, h3, [class*='title'], [class*='position']")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        if not title or len(title) < 4:
            continue

        link_el = card.select_one("a[href]")
        href = link_el.get("href", "") if link_el else ""
        full_url = href if href.startswith("http") else BASE_URL + href

        company_el = card.select_one("[class*='company'], [class*='employer'], [class*='org']")
        company = company_el.get_text(strip=True) if company_el else ""

        loc_el = card.select_one("[class*='location'], [class*='loc'], [class*='remote']")
        location = loc_el.get_text(strip=True) if loc_el else "Remote, LATAM"

        desc_el = card.select_one("p, [class*='description'], [class*='desc']")
        description = desc_el.get_text(separator=" ", strip=True)[:2000] if desc_el else ""

        jobs.append({
            "title": title,
            "organization": company,
            "location": location,
            "rubro": infer_rubro(title),
            "type": "",
            "description": description,
            "application_url": full_url or source_url,
            "source": "pivot_jobs",
            "country_code": "WW",
            "is_active": True,
            "tags": ["remoto", "tech", "latam", "startups"],
        })
    return jobs


def scrape(max_pages: int = 5) -> list:
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
    print("Rastreando Pivot Jobs...")
    jobs = scrape(max_pages=5)
    summary = OpportunitySink().upsert(jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(f"\n=== Pivot Jobs: {summary.inserted} nuevas, {summary.updated} actualizadas, "
          f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas ===")


if __name__ == "__main__":
    main()
