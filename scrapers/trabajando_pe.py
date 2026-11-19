"""
Trabajando.pe — portal de empleo peruano.
URL: https://www.trabajando.pe
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

BASE_URL = "https://www.trabajando.pe"

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-PE,es;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Referer": "https://www.trabajando.pe/",
}

CATEGORIES = [
    ("administracion", "Administración"),
    ("tecnologia", "Tecnología e IT"),
    ("contabilidad", "Banca y Finanzas"),
    ("ventas", "Ventas y Comercial"),
    ("recursos-humanos", "Recursos Humanos"),
    ("ingenieria", "Ingeniería"),
    ("logistica", "Logística y Transporte"),
    ("marketing", "Marketing y Publicidad"),
    ("salud", "Salud y Medicina"),
    ("educacion", "Educación"),
]


def fetch(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def _extract_json_jobs(html):
    """Try to extract jobs from embedded JSON (common in Vue/React SPAs)."""
    jobs_data = []
    # Pattern 1: __NUXT_DATA__ or window.__INITIAL_STATE__
    for pattern in [
        r'window\.__INITIAL_STATE__\s*=\s*({.*?})\s*;',
        r'"offers"\s*:\s*(\[.*?\])',
        r'"jobs"\s*:\s*(\[.*?\])',
        r'"vacantes"\s*:\s*(\[.*?\])',
    ]:
        m = re.search(pattern, html, re.DOTALL)
        if m:
            try:
                data = json.loads(m.group(1))
                if isinstance(data, list) and data:
                    jobs_data = data
                    break
            except (json.JSONDecodeError, ValueError):
                continue
    return jobs_data


def parse_trabajando_cards(html, rubro, category_slug):
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    # Primary: standard article/div cards
    cards = soup.select("article.job-offer, article.oferta, div.job-item, div.offer-card")
    if not cards:
        cards = soup.select("article, li.vacancy, div[class*='job'], div[class*='offer']")

    seen_urls = set()
    for card in cards:
        title_el = card.select_one("h2 a, h3 a, a[class*='title'], a[class*='puesto']")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        if not title or len(title) < 3:
            continue

        link = title_el.get("href", "")
        if not link:
            continue
        full_url = link if link.startswith("http") else BASE_URL + link
        if full_url in seen_urls:
            continue
        seen_urls.add(full_url)

        company_el = card.select_one(
            "span[class*='empresa'], span[class*='company'], a[class*='empresa'], "
            "p[class*='empresa'], div[class*='company']"
        )
        company = company_el.get_text(strip=True) if company_el else ""

        location_el = card.select_one(
            "span[class*='location'], span[class*='ubicacion'], li[class*='location']"
        )
        location = location_el.get_text(strip=True) if location_el else "Perú"
        if not location:
            location = "Perú"

        jobs.append({
            "title": title,
            "organization": company,
            "location": location,
            "country_code": "PE",
            "rubro": rubro,
            "type": "",
            "opportunity_type": "job",
            "description": "",
            "application_url": full_url,
            "source_url": full_url,
            "source": "trabajando_pe",
            "source_authority": "aggregator",
            "original_source_verified": True,
            "is_active": True,
            "tags": [category_slug.replace("-", " ")],
        })

    return jobs


def scrape_category(slug, rubro, max_pages=4):
    jobs = []
    for page in range(1, max_pages + 1):
        if page == 1:
            url = f"{BASE_URL}/empleos/{slug}"
        else:
            url = f"{BASE_URL}/empleos/{slug}?page={page}"

        html = fetch(url)
        if not html:
            break

        page_jobs = parse_trabajando_cards(html, rubro, slug)
        if not page_jobs:
            print(f"  [{slug}] página {page}: 0 ofertas (fin de resultados o sitio con protección)")
            break

        jobs.extend(page_jobs)
        print(f"  [{slug}] página {page}: {len(page_jobs)} ofertas")
        time.sleep(2)

    return jobs


def main():
    all_jobs = []

    for slug, rubro in CATEGORIES:
        print(f"\nRastreando Trabajando PE: {slug}")
        jobs = scrape_category(slug, rubro, max_pages=4)
        all_jobs.extend(jobs)
        time.sleep(2)

    summary = OpportunitySink().upsert(all_jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== Trabajando PE: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas ==="
    )


if __name__ == "__main__":
    main()
