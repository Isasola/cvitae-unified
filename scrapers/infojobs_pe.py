"""
InfoJobs Perú — portal de empleo líder en Perú.
URL: https://www.infojobs.com.pe
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

BASE_URL = "https://www.infojobs.com.pe"

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-PE,es;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.infojobs.com.pe/",
}

CATEGORIES = [
    ("administracion", "Administración"),
    ("tecnologia", "Tecnología e IT"),
    ("ventas", "Ventas y Comercial"),
    ("recursos-humanos", "Recursos Humanos"),
    ("contabilidad", "Banca y Finanzas"),
    ("marketing", "Marketing y Publicidad"),
    ("logistica", "Logística y Transporte"),
    ("ingenieria", "Ingeniería"),
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


def parse_infojobs_cards(html, rubro, category_slug):
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    # InfoJobs PE: offer cards use article.ij-OfferCardContent or similar
    cards = soup.select("article.ij-OfferCardContent, div.ij-OfferCard, li.ij-OfferCard")
    if not cards:
        # Fallback: any article with a heading link
        cards = soup.select("article")

    for card in cards:
        # Title
        title_el = (
            card.select_one("a.ij-OfferCardContent-description-title")
            or card.select_one("h2 a, h3 a")
            or card.select_one("a[class*='title']")
        )
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        if not title:
            continue

        link = title_el.get("href", "")
        if not link:
            continue
        full_url = link if link.startswith("http") else BASE_URL + link

        # Company
        company_el = (
            card.select_one("span.ij-OfferCardContent-description-subtitleText")
            or card.select_one("a[class*='company'], span[class*='company']")
        )
        company = company_el.get_text(strip=True) if company_el else ""

        # Location
        location_el = (
            card.select_one("li[class*='location'], span[class*='location']")
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
            "source": "infojobs_pe",
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
            url = f"{BASE_URL}/ofertas-trabajo/{slug}.xhtml"
        else:
            url = f"{BASE_URL}/ofertas-trabajo/{slug}.xhtml?page={page}"

        html = fetch(url)
        if not html:
            break

        page_jobs = parse_infojobs_cards(html, rubro, slug)
        if not page_jobs:
            break

        jobs.extend(page_jobs)
        print(f"  [{slug}] página {page}: {len(page_jobs)} ofertas")
        time.sleep(2)

    return jobs


def main():
    all_jobs = []

    for slug, rubro in CATEGORIES:
        print(f"\nRastreando InfoJobs PE: {slug}")
        jobs = scrape_category(slug, rubro, max_pages=4)
        all_jobs.extend(jobs)
        time.sleep(2)

    summary = OpportunitySink().upsert(all_jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== InfoJobs PE: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas ==="
    )


if __name__ == "__main__":
    main()
