"""Gastronomía, fast food y hotelería de Paraguay — portales de RRHH."""
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

# (key, url, org, rubro)
EMPRESAS = [
    ("mcdonalds_py", "https://www.mcdonalds.com.py/trabaja-con-nosotros", "McDonald's Paraguay", "Gastronomía / Fast Food"),
    ("burgerking_py", "https://www.burgerking.com.py/trabaja-con-nosotros", "Burger King Paraguay", "Gastronomía / Fast Food"),
    ("kfc_py", "https://www.kfc.com.py/trabaja-con-nosotros", "KFC Paraguay", "Gastronomía / Fast Food"),
    ("pizzahut_py", "https://www.pizzahut.com.py/trabaja-con-nosotros", "Pizza Hut Paraguay", "Gastronomía / Fast Food"),
    ("subway_py", "https://www.subway.com/es-PY/FindAStore", "Subway Paraguay", "Gastronomía / Fast Food"),
    ("bourbon_py", "https://www.bourbon.com.py/trabaja-con-nosotros", "Hotel Bourbon Asunción", "Hotelería"),
    ("granados_py", "https://www.granadospark.com/empleos", "Hotel Granados Park", "Hotelería"),
    ("nh_py", "https://www.nh-hotels.com/es/trabaja-con-nosotros?country=Paraguay", "NH Hotels Paraguay", "Hotelería"),
    ("sheraton_py", "https://jobs.marriott.com/marriott/search-jobs/Paraguay", "Sheraton Asunción (Marriott)", "Hotelería"),
    ("crowne_py", "https://careers.ihg.com/en/search-results?Country=Paraguay", "Crowne Plaza Asunción (IHG)", "Hotelería"),
]

SOURCE = "gastronomia_hoteles_py"

# International hotel chains that render via JS — we insert a generic entry directly
JS_RENDERED_KEYS = {"nh_py", "sheraton_py", "crowne_py"}

JOB_SELECTORS = [
    ".job", ".oportunidad", ".vacante", ".career", "article",
    ".item-vacante", ".puesto", "li.offer", ".listing-item", ".card",
    ".position", ".opening",
]
LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "plaza", "puesto", "carrera", "job", "apply"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=25, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_empresa(key, url, org, rubro):
    # JS-rendered international sites: insert generic entry without scraping
    if key in JS_RENDERED_KEYS:
        return [_generic_entry(key, url, org, rubro)]

    html = fetch(url)
    if not html:
        return [_generic_entry(key, url, org, rubro)]
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    # Try structured job items first
    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .puesto, .cargo, .position-title")
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
                    "titulo": title,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": SOURCE,
                    "is_active": True,
                    "tags": [rubro.split("/")[0].strip().lower().replace(" ", "_"), key],
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
                    "titulo": text,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": SOURCE,
                    "is_active": True,
                    "tags": [rubro.split("/")[0].strip().lower().replace(" ", "_"), key],
                })

    # Dedup by URL
    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)

    if not unique:
        return [_generic_entry(key, url, org, rubro)]
    return unique[:20]


def _generic_entry(key, url, org, rubro):
    return {
        "titulo": f"Vacantes abiertas en {org}",
        "organization": org,
        "location": "Paraguay",
        "rubro": rubro,
        "type": "Tiempo completo",
        "description": "Visitá nuestra página de empleos para ver posiciones disponibles.",
        "application_url": url,
        "source": SOURCE,
        "is_active": True,
        "tags": [rubro.split("/")[0].strip().lower().replace(" ", "_"), key],
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
    for key, url, org, rubro in EMPRESAS:
        jobs = scrape_empresa(key, url, org, rubro)
        print(f"[{SOURCE}_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        time.sleep(2)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[gastronomia_hoteles] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
