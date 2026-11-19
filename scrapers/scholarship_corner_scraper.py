"""
Scholarship Corner — base de datos de becas y oportunidades educativas internacionales.
URL: https://scholarshipcorner.website
Cubre becas para LATAM incluyendo Paraguay y Peru.
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

BASE_URL = "https://scholarshipcorner.website"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Secciones relevantes para LATAM
SECTIONS = [
    ("/scholarships-for-latin-america/", "Becas LATAM"),
    ("/scholarships-for-south-america/", "Becas Sudamérica"),
    ("/fully-funded-scholarships/", "Becas completas"),
    ("/masters-scholarships/", "Becas de Maestría"),
    ("/phd-scholarships/", "Becas de Doctorado"),
    ("/undergraduate-scholarships/", "Becas de Grado"),
]


def fetch(url: str) -> str:
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s{2,}", " ", text).strip()


def extract_cards(soup, rubro: str) -> list:
    jobs = []
    # Scholarship Corner uses article cards or div.post-item
    cards = soup.select("article, div.post-item, div.entry-item, div[class*='scholarship']")
    for card in cards:
        title_el = card.select_one("h2, h3, .entry-title, .post-title, a")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        if not title or len(title) < 5:
            continue

        link_el = card.select_one("a[href]")
        href = link_el.get("href", "") if link_el else ""
        full_url = href if href.startswith("http") else BASE_URL + href

        desc_el = card.select_one("p, .entry-summary, .post-excerpt, [class*='excerpt']")
        description = _strip_html(desc_el.get_text(separator=" ", strip=True))[:2000] if desc_el else ""

        # Intentar detectar organización del título (ej: "Fulbright Scholarship 2026")
        org_match = re.match(r"^([A-Z][^–—:]+?)\s+(?:Scholarship|Fellowship|Grant|Program)", title)
        organization = org_match.group(1).strip() if org_match else "Scholarship Corner"

        jobs.append({
            "title": title,
            "organization": organization,
            "location": "Internacional",
            "rubro": rubro,
            "type": "Beca / Fellowship",
            "description": description,
            "application_url": full_url,
            "source": "scholarship_corner",
            "country_code": "WW",
            "is_active": True,
            "tags": ["beca", "educacion", "latam"],
        })
    return jobs


def scrape_section(path: str, rubro: str, max_pages: int = 3) -> list:
    all_items = []
    for page in range(1, max_pages + 1):
        url = BASE_URL + path if page == 1 else BASE_URL + path + f"page/{page}/"
        html = fetch(url)
        if not html:
            break
        soup = BeautifulSoup(html, "html.parser")
        items = extract_cards(soup, rubro)
        if not items:
            break
        print(f"  [{rubro}] página {page}: {len(items)} becas")
        all_items.extend(items)
        time.sleep(1.5)
    return all_items


def main():
    all_items = []
    for path, rubro in SECTIONS:
        print(f"\nRastreando Scholarship Corner: {rubro}")
        items = scrape_section(path, rubro, max_pages=3)
        all_items.extend(items)
        time.sleep(2)

    summary = OpportunitySink().upsert(all_items)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(f"\n=== Scholarship Corner: {summary.inserted} nuevas, {summary.updated} actualizadas, "
          f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas ===")


if __name__ == "__main__":
    main()
