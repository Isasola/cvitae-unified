"""Medios de comunicación en Paraguay — Última Hora, Telefuturo, SNT, ABC Color, etc."""
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

COMPANIES = [
    ("ultima_hora", "https://www.ultimahora.com/trabaja-con-nosotros", "Última Hora"),
    ("telefuturo", "https://www.telefuturo.com.py/trabaja-con-nosotros", "Telefuturo Canal 4"),
    ("snt_canal9", "https://www.snt.com.py/trabaja-con-nosotros", "SNT Canal 9"),
    ("monumental", "https://www.monumental.com.py/trabaja-con-nosotros", "Monumental 1080 AM"),
    ("nanduti", "https://www.nanduti.com.py/trabaja-con-nosotros", "Radio Ñandutí"),
    ("grupo_mercurio", "https://www.mercurionoticias.com/trabaja-con-nosotros", "Grupo Mercurio"),
    ("abc_rrhh", "https://www.abc.com.py/empleos", "ABC Color"),
    ("la_nacion_rrhh", "https://www.lanacion.com.py/institucional/trabaja-con-nosotros", "La Nación Paraguay"),
    ("730am", "https://www.730am.com.py/trabaja-con-nosotros", "Radio 730 AM"),
    ("unicanal", "https://www.unicanal.com.py/trabaja-con-nosotros", "UniCanal"),
]

JOB_SELECTORS = [
    ".job", ".vacancy", ".position", ".career-item", "article.job",
    ".job-listing", "li.job", ".offer", ".oportunidad", ".vacante",
    ".item-vacante", ".puesto", "li.offer", ".listing-item",
]
LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "apply", "postula", "job", "puesto", "plaza"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_company(key, url, org):
    html = fetch(url)
    if not html:
        return [_generic_entry(key, url, org)]
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .job-title, .position-name, .puesto, .cargo")
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
                    "rubro": "Medios de Comunicación",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": "medios_py",
                    "is_active": True,
                    "tags": ["medios", "comunicacion", key],
                })
            if jobs:
                break

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
                    "rubro": "Medios de Comunicación",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": "medios_py",
                    "is_active": True,
                    "tags": ["medios", "comunicacion", key],
                })

    if not jobs:
        return [_generic_entry(key, url, org)]

    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)
    return unique[:20]


def _generic_entry(key, url, org):
    return {
        "title": f"Empleos en {org}",
        "organization": org,
        "location": "Paraguay",
        "rubro": "Medios de Comunicación",
        "type": "Tiempo completo",
        "description": "Revisá las posiciones abiertas en su portal de empleo.",
        "application_url": url,
        "source": "medios_py",
        "is_active": True,
        "tags": ["medios", "comunicacion", key],
    }


def insert_job(job):
    try:
        r = requests.post(TABLE_URL + "?on_conflict=application_url", headers=HEADERS, json=job)
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def main():
    import urllib3
    urllib3.disable_warnings()
    all_jobs = []
    seen_orgs = set()
    for key, url, org in COMPANIES:
        if org in seen_orgs:
            continue
        jobs = scrape_company(key, url, org)
        print(f"[medios_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        if jobs:
            seen_orgs.add(org)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[medios_comunicacion] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
