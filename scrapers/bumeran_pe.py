"""
Bumeran Peru — uno de los portales de empleo más grandes de Perú.
URL: https://www.bumeran.com.pe
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

BASE_URL = "https://www.bumeran.com.pe"

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-PE,es;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

SEARCHES = [
    ("administracion-y-secretariado", "Administración"),
    ("comercial-ventas-y-negocios", "Ventas y Comercial"),
    ("sistemas-y-tecnologia", "Tecnología e IT"),
    ("marketing-y-publicidad", "Marketing y Publicidad"),
    ("contabilidad-y-finanzas", "Banca y Finanzas"),
    ("recursos-humanos", "Recursos Humanos"),
    ("logistica-y-almacenamiento", "Logística y Transporte"),
    ("salud-medicina-y-farmacia", "Salud y Medicina"),
    ("educacion-docencia-e-investigacion", "Educación"),
    ("ingenieria", "Ingeniería"),
]


def fetch(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_category(category_slug, rubro, max_pages=3):
    jobs = []
    for page in range(1, max_pages + 1):
        url = f"{BASE_URL}/empleos-busqueda-{category_slug}.html"
        if page > 1:
            url = f"{BASE_URL}/empleos-busqueda-{category_slug}-pagina-{page}.html"

        html = fetch(url)
        if not html:
            break

        soup = BeautifulSoup(html, "html.parser")

        # Bumeran uses article tags or div with data-qa for job cards
        cards = soup.select("article[data-qa='posting-list-item'], div[data-qa='posting-list-item']")
        if not cards:
            cards = soup.select("article")

        page_jobs = []
        for card in cards:
            title_el = card.select_one("h2 a, h3 a, a[data-qa='posting-title-label']")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title:
                continue

            link = title_el.get("href", "")
            if not link:
                continue
            full_url = link if link.startswith("http") else BASE_URL + link

            company_el = card.select_one("a[data-qa='company-link'], span[data-qa='company-name']")
            company = company_el.get_text(strip=True) if company_el else ""

            location_el = card.select_one("span[data-qa='location'], li[data-qa='location']")
            location = location_el.get_text(strip=True) if location_el else "Peru"
            if not location:
                location = "Peru"

            # Attempt to get description from card snippet
            desc_el = card.select_one("p[data-qa='job-description'], div[data-qa='job-description']")
            description = desc_el.get_text(strip=True)[:2000] if desc_el else ""

            page_jobs.append({
                "title": title,
                "organization": company,
                "location": location,
                "rubro": rubro,
                "type": "",
                "description": description,
                "application_url": full_url,
                "source": "bumeran_pe",
                "country_code": "PE",
                "is_active": True,
                "tags": [category_slug.replace("-", " ")],
            })

        if not page_jobs:
            break

        jobs.extend(page_jobs)
        print(f"  [{category_slug}] página {page}: {len(page_jobs)} ofertas")
        time.sleep(2)

    return jobs


def main():
    all_jobs = []

    for slug, rubro in SEARCHES:
        print(f"\nRastreando Bumeran PE: {slug}")
        jobs = scrape_category(slug, rubro, max_pages=3)
        all_jobs.extend(jobs)
        time.sleep(2)

    summary = OpportunitySink().upsert(all_jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== Bumeran PE: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas ==="
    )


if __name__ == "__main__":
    main()
