"""Puertos e importadoras paraguayos — portales de RRHH."""
import requests
from bs4 import BeautifulSoup
import os, time

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
    ("puerto_asuncion",      "https://www.pna.gov.py/convocatorias",                                       "Puerto de Asunción",                     "Puertos / Transporte Marítimo"),
    ("administracion_puertos","https://www.annp.gov.py/index.php/convocatorias",                           "ANNP (Admin. Nacional de Naveg. y Puertos)", "Puertos"),
    ("transceanica",         "https://www.transoceanic.com.py/trabaja-con-nosotros",                       "Transoceánica Paraguay",                 "Importaciones / Logística"),
    ("villeta_puerto",       "https://www.puertodevilleta.com/empleos",                                    "Puerto de Villeta",                      "Puertos"),
    ("apa_py",               "https://www.apa.gov.py/convocatorias",                                       "APA (Aeropuertos del Paraguay)",          "Aviación / Infraestructura"),
    ("proargen",             "https://www.proargen.com.py/trabaja-con-nosotros",                            "Proargen",                               "Importaciones"),
    ("export_import_py",     "https://www.exportimportpy.com/empleos",                                     "Export Import Paraguay",                 "Comercio Exterior"),
    ("bunge_logistica",      "https://careers.bunge.com/search/?q=paraguay&locationsearch=paraguay",       "Bunge Paraguay - Logística",             "Logística / Agroindustria"),
    ("dreyfus_py",           "https://careers.ldcom.com/search/?q=paraguay",                               "Louis Dreyfus Paraguay - Operaciones",   "Agroindustria / Logística"),
    ("terminal_graneles",    "https://www.tgp.com.py/trabaja-con-nosotros",                                "Terminal de Graneles del Paraguay",       "Puertos"),
]

JOB_SELECTORS = [
    ".job", ".oportunidad", ".vacante", ".career", "article",
    ".item-vacante", ".puesto", "li.offer", ".listing-item",
    ".convocatoria", ".concurso", ".llamado", ".position",
    "[class*='job']", "[class*='career']", "[class*='convoc']",
]
LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "plaza", "puesto",
                 "carrera", "convocatoria", "concurso", "llamado", "job", "career", "position", "empleo"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_empresa(key, url, org, rubro):
    html = fetch(url)
    if not html:
        return fallback(key, url, org, rubro)
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    # Try structured job items first
    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .puesto, .cargo, .job-title, [class*='title']")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                link_el = item.select_one("a[href]")
                job_url = ""
                if link_el:
                    href = link_el.get("href", "")
                    job_url = href if href.startswith("http") else f"{url.rstrip('/')}/{href.lstrip('/')}"
                if not job_url:
                    job_url = f"{url}#{title[:40].replace(' ', '-').lower()}"
                jobs.append({
                    "title": title,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": "puertos_importadoras_py",
                    "is_active": True,
                    "tags": ["puertos", "importaciones", key],
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
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": "puertos_importadoras_py",
                    "is_active": True,
                    "tags": ["puertos", "importaciones", key],
                })

    # Dedup by URL
    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)
    result = unique[:20]
    return result if result else fallback(key, url, org, rubro)


def fallback(key, url, org, rubro):
    """Generic fallback entry when no vacancies found in HTML."""
    return [{
        "title": f"Empleos en {org}",
        "organization": org,
        "location": "Paraguay",
        "rubro": rubro,
        "type": "Tiempo completo",
        "description": f"Visitá la página de empleos de {org} para ver las oportunidades disponibles.",
        "application_url": url,
        "source": "puertos_importadoras_py",
        "is_active": True,
        "tags": ["puertos", "importaciones", key],
    }]


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS,
            json=job,
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
        print(f"[{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        time.sleep(1)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[puertos_importadoras] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
