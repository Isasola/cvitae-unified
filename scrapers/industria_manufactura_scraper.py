"""Industria y Manufactura paraguaya — portales de RRHH."""
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

# (key, url, org, rubro)
EMPRESAS = [
    ("cementos_concepcion", "https://www.cementosconcepcion.com.py/trabaja-con-nosotros",                                              "Cementos Concepción",     "Construcción / Manufactura"),
    ("grupo_casado",        "https://www.casado.com.py/trabaja-con-nosotros",                                                          "Grupo Casado",            "Industria diversificada"),
    ("ceramica_ybytymi",    "https://www.ceramicaybytymi.com.py/trabaja-con-nosotros",                                                 "Cerámica Ybytymí",        "Manufactura"),
    ("indufar",             "https://www.indufar.com.py/trabaja-con-nosotros",                                                         "Indufar",                 "Industria Farmacéutica"),
    ("lasca",               "https://www.lasca.com.py/trabaja-con-nosotros",                                                           "Laboratorios Lasca",      "Industria Farmacéutica"),
    ("tecnoedil",           "https://www.tecnoedil.com.py/trabaja-con-nosotros",                                                       "Tecnoedil",               "Construcción / Materiales"),
    ("safilco",             "https://www.safilco.com.py/trabaja-con-nosotros",                                                         "Safilco SA",              "Manufactura"),
    ("mota_engil_py",       "https://www.mota-engil.com/en/careers/?location=Paraguay",                                               "Mota-Engil Paraguay",     "Construcción"),
    ("roemmers_py",         "https://www.roemmers.com.py/trabaja-con-nosotros",                                                        "Roemmers Paraguay",       "Farmacéutica"),
    ("cpc_py",              "https://www.cpc.com.py/trabaja-con-nosotros",                                                             "CPC Paraguay",            "Manufactura"),
    ("petrobras_py",        "https://www.petrobras.com.py/trabaja-con-nosotros",                                                       "Petrobras Paraguay",      "Energía / Manufactura"),
    ("total_energies_py",   "https://jobs.totalenergies.com/search/#t=Jobs&numberOfResults=25&sortCriteria=rs_datePosted&radiusMiles=50&location=Paraguay", "Total Energies Paraguay", "Energía"),
]

SOURCE = "industria_manufactura_py"
DEFAULT_LOCATION = "Paraguay"

JOB_SELECTORS = [
    ".job", ".oportunidad", ".vacante", ".career", "article",
    ".item-vacante", ".puesto", "li.offer", ".listing-item",
    ".position", ".job-listing", ".opening", ".role",
]
LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "plaza", "puesto", "carrera", "posici"]


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
        return [_generic_entry(key, url, org, rubro)]

    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    # Try structured job items first
    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .puesto, .cargo, .position-title, .job-title")
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
                jobs.append(_build_job(title, org, job_url, key, rubro))
            if jobs:
                break

    # Fallback: links with job keywords
    if not jobs:
        for a in soup.select("a[href]"):
            text = a.get_text(strip=True)
            href = a.get("href", "")
            if not text or len(text) < 6 or len(text) > 120:
                continue
            if any(kw in text.lower() or kw in href.lower() for kw in LINK_KEYWORDS):
                job_url = href if href.startswith("http") else url
                jobs.append(_build_job(text, org, job_url, key, rubro))

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


def _build_job(title, org, job_url, key, rubro):
    return {
        "title": title,
        "organization": org,
        "location": DEFAULT_LOCATION,
        "rubro": rubro,
        "type": "Tiempo completo",
        "description": "",
        "application_url": job_url,
        "source": SOURCE,
        "is_active": True,
        "tags": ["industria", "manufactura", key],
    }


def _generic_entry(key, url, org, rubro):
    return {
        "title": f"Empleo en {org}",
        "organization": org,
        "location": DEFAULT_LOCATION,
        "rubro": rubro,
        "type": "Tiempo completo",
        "description": "Consultá las posiciones disponibles en nuestra página de empleos.",
        "application_url": url,
        "source": SOURCE,
        "is_active": True,
        "tags": ["industria", "manufactura", key],
    }


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
        print(f"[{SOURCE}][{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        time.sleep(1)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[{SOURCE}] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
