"""
BECAL (Becas Carlos Antonio López) — becas del gobierno paraguayo para
posgrados en el exterior. El sitio es un WordPress, las convocatorias
son entradas de blog. Se raspean las más recientes y se insertan como
tipo Beca con source=becal.
"""
import requests
from bs4 import BeautifulSoup
import time
import os
import re

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"
HEADERS_DB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}

# WordPress API endpoint — más confiable que parsear HTML
WP_API = "https://becal.gov.py/wp-json/wp/v2/posts?per_page=20&_fields=id,title,link,excerpt,date&page={page}"

BASE_PAGES = [
    "https://becal.gov.py/convocatorias/",
    "https://becal.gov.py/noticias/",
    "https://becal.gov.py/",
]


def fetch_via_api(page=1):
    """Intenta obtener posts via WP REST API."""
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


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS_DB,
            json=job,
        )
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def is_relevant(title, excerpt=""):
    """Filtra solo posts que parecen convocatorias/becas, no noticias genéricas."""
    text = (title + " " + excerpt).lower()
    keywords = ["beca", "convocatoria", "postulación", "postulacion", "aplica",
                "posgrado", "maestría", "doctorado", "pasantía", "programa",
                "opportunity", "call for", "fellowship", "grant"]
    return any(k in text for k in keywords)


def scrape_via_api():
    jobs = []
    seen = set()
    for page in range(1, 4):
        posts = fetch_via_api(page)
        if not posts:
            break
        for post in posts:
            url = post.get("link", "")
            if not url or url in seen:
                continue
            seen.add(url)
            title = post.get("title", {}).get("rendered", "")
            title = re.sub(r'<[^>]+>', '', title).strip()
            excerpt = re.sub(r'<[^>]+>', '', post.get("excerpt", {}).get("rendered", "")).strip()

            if not is_relevant(title, excerpt):
                continue

            jobs.append({
                "title": title,
                "organization": "BECAL - Gobierno de Paraguay",
                "location": "Internacional",
                "rubro": "Becas y Posgrados",
                "type": "Beca",
                "description": excerpt[:500],
                "application_url": url,
                "source": "becal",
                "is_active": True,
                "tags": ["beca", "gobierno", "paraguay", "posgrado"],
            })
        time.sleep(1)
    return jobs


def scrape_via_html():
    """Fallback HTML scraper si la API no está disponible."""
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
            jobs.append({
                "title": text,
                "organization": "BECAL - Gobierno de Paraguay",
                "location": "Internacional",
                "rubro": "Becas y Posgrados",
                "type": "Beca",
                "description": "",
                "application_url": href,
                "source": "becal",
                "is_active": True,
                "tags": ["beca", "gobierno", "paraguay", "posgrado"],
            })
    return jobs


def main():
    print("Intentando API WordPress de BECAL...")
    jobs = scrape_via_api()
    if not jobs:
        print("API no disponible — usando scraper HTML")
        jobs = scrape_via_html()

    total_inserted = 0
    for job in jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            total_inserted += 1
        print(f"  {job['title'][:65]} -> {status}")

    print(f"\n=== BECAL: {total_inserted}/{len(jobs)} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
