import requests
import json
import re
import time
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

BASE_URL = "https://www.buscojobs.com.py/ofertas/tc29/trabajo-de-otros"


def fetch_page(page=1):
    url = f"{BASE_URL}/{page}" if page > 1 else BASE_URL
    h = {"User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(url, headers=h, timeout=30)
        return r.text if r.status_code == 200 else None
    except Exception as e:
        print(f"[BuscoJobs] fetch error page {page}: {e}")
        return None


def extract_jobs(html):
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
        return data['props']['pageProps']['resultadosIniciales']['ofertas']
    except (json.JSONDecodeError, KeyError):
        return []


def insert_job(job_raw):
    title = job_raw.get('CargoVacante', '')
    if not title:
        return None
    job_id = job_raw.get('IdOferta', '')
    url = f"https://www.buscojobs.com.py/oferta/{job_id}" if job_id else ''
    if not url:
        return None
    company = job_raw.get('NombreEmpresa', '')
    ciudad = (job_raw.get('Ciudad') or {}).get('Nombre', '')
    depto = (job_raw.get('Departamento') or {}).get('Nombre', '')
    location = f"{ciudad}, {depto}".strip(', ') or "Paraguay"
    description = job_raw.get('Descripcion', '')

    payload = {
        "titulo": title,
        "organization": company,
        "location": location,
        "rubro": "General",
        "type": "Tiempo completo",
        "description": description[:800] if description else "",
        "application_url": url,
        "source": "buscojobs",
        "is_active": True,
        "tags": [],
    }
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS,
            json=payload,
        )
        return r.status_code
    except Exception as e:
        print(f"[BuscoJobs] insert error: {e}")
        return "error"


def main():
    total = 0
    found = 0
    for page in range(1, 6):
        print(f"Scrapeando página {page}...")
        html = fetch_page(page)
        if not html:
            print(f"No se pudo obtener página {page}")
            continue
        jobs = extract_jobs(html)
        if not jobs:
            print(f"No se encontraron ofertas en página {page}")
            break
        found += len(jobs)
        for job in jobs:
            status = insert_job(job)
            if status in (200, 201, 409):
                total += 1
            print(f"  [{job.get('CargoVacante', '')[:50]}] -> {status}")
        time.sleep(1)
    print(f"\nTotal insertados/actualizados desde BuscoJobs: {total}/{found}")


if __name__ == "__main__":
    main()
