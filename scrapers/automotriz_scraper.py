"""Concesionarias y empresas automotrices de Paraguay — portales de RRHH."""
import requests
from bs4 import BeautifulSoup
import os
import time

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

EMPRESAS = [
    ("toyota_py", "https://www.toyota.com.py/trabaja-con-nosotros", "Toyota Paraguay"),
    ("nissen_py", "https://www.nissen.com.py/trabaja-con-nosotros", "Nissen Paraguay"),
    ("ford_yave", "https://www.yave.com.py/trabaja-con-nosotros", "Ford / Yave Paraguay"),
    ("vw_automotor", "https://www.automotor.com.py/trabaja-con-nosotros", "Volkswagen / Automotor Paraguay"),
    ("kia_py", "https://www.kia.com.py/trabaja-con-nosotros", "Kia Paraguay"),
    ("hyundai_py", "https://www.hyundai.com.py/trabaja-con-nosotros", "Hyundai Paraguay"),
    ("stellantis_py", "https://www.stellantis.com.py/trabaja-con-nosotros", "Chrysler / Stellantis Paraguay"),
    ("bmw_py", "https://www.bmwparaguay.com/trabaja-con-nosotros", "BMW Paraguay"),
    ("honda_py", "https://www.honda.com.py/trabaja-con-nosotros", "Honda Paraguay"),
    ("diesa_py", "https://www.diesa.com.py/trabaja-con-nosotros", "Grupo Diesa Paraguay"),
]

RUBRO = "Automotriz / Concesionarias"
SOURCE = "automotriz_py"

JOB_SELECTORS = [
    ".job", ".oportunidad", ".vacante", ".career", "article",
    ".item-vacante", ".puesto", "li.offer", ".listing-item", ".card",
]
LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "plaza", "puesto", "carrera"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=25, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_empresa(key, url, org):
    html = fetch(url)
    if not html:
        return [_generic_entry(key, url, org)]
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    # Try structured job items first
    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .puesto, .cargo")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                link_el = item.select_one("a[href]")
                job_url = url
                if link_el:
                    href = link_el.get("href", "")
                    job_url = href if href.startswith("http") else f"{url.rstrip('/')}/{href.lstrip('/')}"
                jobs.append({
                    "title": title,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": RUBRO,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": SOURCE,
                    "is_active": True,
                    "tags": ["automotriz", "concesionaria", key],
                })
            if jobs:
                break

    # Fallback: look for links with job keywords
    if not jobs:
        for a in soup.select("a[href]"):
            text = a.get_text(strip=True)
            href = a.get("href", "")
            if not text or len(text) < 6 or len(text) > 120:
                continue
            if any(kw in text.lower() or kw in href.lower() for kw in LINK_KEYWORDS):
                job_url = href if href.startswith("http") else url
                jobs.append({
                    "title": text,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": RUBRO,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": SOURCE,
                    "is_active": True,
                    "tags": ["automotriz", "concesionaria", key],
                })

    # Dedup by URL
    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)

    if not unique:
        return [_generic_entry(key, url, org)]
    return unique[:20]


def _generic_entry(key, url, org):
    return {
        "title": f"Vacantes abiertas en {org}",
        "organization": org,
        "location": "Paraguay",
        "rubro": RUBRO,
        "type": "Tiempo completo",
        "description": "Visitá nuestra página de empleos para ver posiciones disponibles.",
        "application_url": url,
        "source": SOURCE,
        "is_active": True,
        "tags": ["automotriz", "concesionaria", key],
    }


def insert_job(payload):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS,
            json=payload,
        )
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def main():
    import urllib3
    urllib3.disable_warnings()
    all_jobs = []
    for key, url, org in EMPRESAS:
        jobs = scrape_empresa(key, url, org)
        print(f"[{SOURCE}_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        time.sleep(2)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[automotriz] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
