"""SICCA / SFP — Concursos públicos de la Administración Pública del Paraguay."""
import requests
from bs4 import BeautifulSoup
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

ENDPOINTS = [
    ("https://sicca.sfp.gov.py/convocatorias", "sicca_sfp"),
    ("https://www.sfp.gov.py/sfpweb/convocatorias", "sfp_web"),
    ("https://www.sfp.gov.py/sfpweb/index.php?module=convocatoria&action=list", "sfp_convocatoria"),
]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  [sicca] fetch error {url}: {e}")
        return ""


def parse_jobs(html, source_url, source_key):
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    selectors = [
        "table tr", ".convocatoria", ".concurso", "article",
        ".list-group-item", ".resultado-item", "tr[data-id]",
    ]
    items = []
    for sel in selectors:
        found = soup.select(sel)
        if found:
            items = found
            break

    for item in items:
        title_el = item.select_one("td:first-child, h3, h4, .titulo, .cargo, .puesto, a")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        if not title or len(title) < 5:
            continue
        link_el = item.select_one("a[href]")
        url = ""
        if link_el:
            href = link_el.get("href", "")
            url = href if href.startswith("http") else f"https://www.sfp.gov.py{href}"
        if not url:
            url = f"{source_url}#{title[:40].replace(' ', '-').lower()}"
        org_el = item.select_one("td:nth-child(2), .institucion, .organismo")
        org = org_el.get_text(strip=True) if org_el else "Estado Paraguayo"
        jobs.append({
            "title": title,
            "organization": org or "Estado Paraguayo",
            "location": "Paraguay",
            "rubro": "Gobierno / Sector Público",
            "type": "Concurso Público",
            "description": "",
            "application_url": url,
            "source": source_key,
            "is_active": True,
            "tags": ["gobierno", "sector-publico", "concurso", "sicca"],
        })
    return jobs


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS,
            json=job,
        )
        return r.status_code
    except Exception as e:
        print(f"  [sicca] insert error: {e}")
        return "error"


def main():
    all_jobs = []
    for url, key in ENDPOINTS:
        html = fetch(url)
        if not html:
            print(f"[sicca] Sin HTML de {url}")
            continue
        jobs = parse_jobs(html, url, key)
        print(f"[{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[sicca] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
