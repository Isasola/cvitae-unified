"""
BECAL (Becas Carlos Antonio López) — becas del gobierno paraguayo para
posgrados en el exterior. El sitio es un WordPress, las convocatorias
son entradas de blog. Se raspean via WP REST API con fallback HTML.
"""
import requests
from bs4 import BeautifulSoup
import time
import os
import re
import json
from datetime import datetime, timedelta, timezone

from opportunity_sink import OpportunitySink

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}

# Only fetch posts from last 18 months (reduces old blog noise)
_AFTER = (datetime.now(timezone.utc) - timedelta(days=548)).strftime("%Y-%m-%dT%H:%M:%S")
WP_API = f"https://becal.gov.py/wp-json/wp/v2/posts?per_page=20&_fields=id,title,link,excerpt,date&after={_AFTER}&page={{page}}"

BASE_PAGES = [
    "https://becal.gov.py/convocatorias/",
    "https://becal.gov.py/noticias/",
    "https://becal.gov.py/",
]

# More specific keywords to avoid news/retrospective articles
KEYWORDS = [
    "convocatoria", "postulación", "postulacion", "inscripci",
    "beca 202", "becas 202", "aplica hasta", "plazo", "abierta",
    "posgrado", "maestría", "doctorado", "fellowship", "grant",
    "call for", "oportunidad de beca",
]


def fetch_via_api(page=1):
    try:
        r = requests.get(WP_API.format(page=page), headers=FETCH_HEADERS, timeout=20)
        if r.status_code == 200:
            return r.json()
        return []
    except Exception as e:
        print(f"  WP API error: {e}")
        return []


def fetch_html(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=20)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def is_relevant(title, excerpt=""):
    text = (title + " " + excerpt).lower()
    return any(k in text for k in KEYWORDS)


def _base_item(title, url, description=""):
    return {
        "title": title,
        "organization": "BECAL - Gobierno de Paraguay",
        "location": "Internacional",
        "rubro": "Becas y Posgrados",
        "description": description,
        "application_url": url,
        "source_url": url,
        "source": "becal",
        "source_authority": "original",
        "original_source_verified": True,
        "is_active": True,
        "country_code": "PY",
        "opportunity_kind": "scholarship",
        "tags": ["beca", "gobierno", "paraguay", "posgrado"],
    }


def scrape_via_api():
    jobs = []
    seen = set()
    max_pages = int(os.getenv("CVITAE_MAX_PAGES", "50"))
    for page in range(1, max_pages + 1):
        posts = fetch_via_api(page)
        if not posts:
            break
        page_urls = {str(p.get("link") or "") for p in posts}
        page_urls.discard("")
        if page_urls and page_urls.issubset(seen):
            print(f"  WP página {page}: repetida, deteniendo")
            break
        for post in posts:
            url = post.get("link", "")
            if not url or url in seen:
                continue
            seen.add(url)
            title = re.sub(r"<[^>]+>", "", post.get("title", {}).get("rendered", "")).strip()
            excerpt = re.sub(r"<[^>]+>", "", post.get("excerpt", {}).get("rendered", "")).strip()
            if not is_relevant(title, excerpt):
                continue
            jobs.append(_base_item(title, url, excerpt[:500]))
        time.sleep(1)
    else:
        print(f"  presupuesto de {max_pages} páginas agotado; cobertura pendiente, no EOF")
    return jobs


def scrape_via_html():
    jobs = []
    seen = set()
    for base_url in BASE_PAGES:
        html = fetch_html(base_url)
        if not html:
            continue
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            text = a.get_text(strip=True)
            if not href or href in seen:
                continue
            if "becal.gov.py" not in href or "/20" not in href:
                continue
            if len(text) < 15:
                continue
            if not is_relevant(text):
                continue
            seen.add(href)
            jobs.append(_base_item(text, href))
    return jobs


def main():
    print("Intentando API WordPress de BECAL...")
    jobs = scrape_via_api()
    if not jobs:
        print("  API no disponible — usando scraper HTML")
        jobs = scrape_via_html()

    summary = OpportunitySink().upsert(jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== BECAL: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.rejected} rechazadas de {summary.found} encontradas ==="
    )
    for error in summary.errors[:5]:
        print(f"  ERROR: {error}")


if __name__ == "__main__":
    main()
