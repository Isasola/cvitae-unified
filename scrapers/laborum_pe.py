"""
Laborum Peru — portal de empleo del grupo Universia/Santander, muy popular en LATAM.
URL: https://www.laborum.pe
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

BASE_URL = "https://www.laborum.pe"

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-PE,es;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

CATEGORIES = [
    ("administracion", "Administración"),
    ("ventas", "Ventas y Comercial"),
    ("tecnologia-informatica", "Tecnología e IT"),
    ("marketing-publicidad", "Marketing y Publicidad"),
    ("contabilidad-finanzas", "Banca y Finanzas"),
    ("recursos-humanos", "Recursos Humanos"),
    ("logistica", "Logística y Transporte"),
    ("salud", "Salud y Medicina"),
    ("educacion", "Educación"),
    ("ingenieria", "Ingeniería"),
]


def fetch(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_category(slug, rubro, max_pages=3):
    jobs = []
    for page in range(1, max_pages + 1):
        url = f"{BASE_URL}/empleos/{slug}/"
        if page > 1:
            url += f"?page={page}"

        html = fetch(url)
        if not html:
            break

        soup = BeautifulSoup(html, "html.parser")

        # Laborum uses article tags with class job-item or similar
        cards = soup.select("article.job-item, div.job-item, li.job-item, article[class*='job']")
        if not cards:
            # Fallback: JSON-LD
            cards = soup.select("article")

        page_jobs = []
        for card in cards:
            title_el = card.select_one("h2 a, h3 a, a.job-title, a[class*='title']")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 3:
                continue

            link = title_el.get("href", "")
            if not link:
                continue
            full_url = link if link.startswith("http") else BASE_URL + link

            company_el = card.select_one("a.company-name, span.company, p.company, a[class*='company']")
            company = company_el.get_text(strip=True) if company_el else ""

            location_el = card.select_one("span.location, li.location, span[class*='location']")
            location = location_el.get_text(strip=True) if location_el else "Peru"
            if not location:
                location = "Peru"
            location = re.sub(r',\s*Per[uú]$', '', location, flags=re.IGNORECASE).strip() or "Peru"

            desc_el = card.select_one("p.description, div.description, p[class*='desc']")
            description = desc_el.get_text(strip=True)[:2000] if desc_el else ""

            page_jobs.append({
                "title": title,
                "organization": company,
                "location": location,
                "rubro": rubro,
                "type": "",
                "description": description,
                "application_url": full_url,
                "source": "laborum_pe",
                "country_code": "PE",
                "is_active": True,
                "tags": [slug.replace("-", " ")],
            })

        if not page_jobs:
            # Try JSON-LD on the page as fallback
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string or "")
                    items = data if isinstance(data, list) else data.get("@graph", [])
                    for item in items:
                        if item.get("@type") != "JobPosting":
                            continue
                        title = item.get("title", "") or item.get("name", "")
                        url_val = item.get("url", "")
                        if not title or not url_val:
                            continue
                        org = item.get("hiringOrganization", {})
                        company = org.get("name", "") if isinstance(org, dict) else str(org)
                        page_jobs.append({
                            "title": title,
                            "organization": company,
                            "location": "Peru",
                            "rubro": rubro,
                            "type": "",
                            "description": item.get("description", "")[:2000],
                            "application_url": url_val,
                            "source": "laborum_pe",
                            "country_code": "PE",
                            "is_active": True,
                            "tags": [slug],
                        })
                except (json.JSONDecodeError, TypeError):
                    continue

        if not page_jobs:
            break

        jobs.extend(page_jobs)
        print(f"  [{slug}] página {page}: {len(page_jobs)} ofertas")
        time.sleep(2)

    return jobs


def main():
    all_jobs = []

    for slug, rubro in CATEGORIES:
        print(f"\nRastreando Laborum PE: {slug}")
        jobs = scrape_category(slug, rubro, max_pages=3)
        all_jobs.extend(jobs)
        time.sleep(2)

    summary = OpportunitySink().upsert(all_jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== Laborum PE: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas ==="
    )


if __name__ == "__main__":
    main()
