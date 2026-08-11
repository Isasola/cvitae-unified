"""Universidades paraguayas — portales de empleo docente y administrativo."""
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

UNIVERSIDADES = [
    ("una", "https://www.una.py/institucional/concursos-de-meritos", "Universidad Nacional de Asunción"),
    ("una_rec", "https://www.rec.una.py/index.php/convocatorias", "Universidad Nacional de Asunción"),
    ("ucn", "https://www.ucn.edu.py/carreras/recursos-humanos/convocatorias", "Universidad Católica Nuestra Señora"),
    ("uap", "https://www.uap.edu.py/trabaja-con-nosotros", "Universidad Americana"),
    ("uninorte", "https://www.uninorte.edu.py/trabaja-con-nosotros", "Universidad del Norte"),
    ("ucom", "https://www.ucom.edu.py/institucional/trabaja-con-nosotros", "UCOM"),
    ("ucsa", "https://www.ucsa.edu.py/recursos-humanos", "UCSA"),
    ("uade_py", "https://www.uade.edu.py/trabaja-con-nosotros", "UADE Paraguay"),
    ("fpune", "https://www.fpune.edu.py/convocatorias", "FPUNE"),
    ("upa", "https://www.upa.edu.py/convocatorias", "UPA — Universidad del Pacífico"),
    ("unida", "https://www.unida.edu.py/trabaja-con-nosotros", "UNIDA"),
    ("upe", "https://www.upe.edu.py/trabaja-con-nosotros", "UPE — Universidades del Paraguay"),
    ("itapua", "https://www.itapua.edu.py/convocatorias", "Universidad Nacional Itapúa"),
    ("unipacifico", "https://www.unipacifico.edu.py/trabaja-con-nosotros", "Universidad del Pacífico Privada"),
]

LINK_KEYWORDS = [
    "concurso", "convocatoria", "docente", "vacante", "empleo",
    "trabaja", "cargo", "puesto", "postulacion", "rrhh", "personal",
]
JOB_SELECTORS = [
    ".concurso", ".convocatoria", ".job", ".vacante", "article",
    ".list-group-item", ".item", ".card",
]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_univ(key, url, org):
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .cargo, a")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                if not title or len(title) < 8:
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
                    "rubro": "Educación Superior",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"univ_{key}",
                    "is_active": True,
                    "tags": ["universidad", "educacion", "docente", key],
                })
            if jobs:
                break

    if not jobs:
        for a in soup.select("a[href]"):
            text = a.get_text(strip=True)
            href = a.get("href", "")
            if not text or len(text) < 8 or len(text) > 150:
                continue
            if any(kw in text.lower() or kw in href.lower() for kw in LINK_KEYWORDS):
                job_url = href if href.startswith("http") else url
                jobs.append({
                    "title": text,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": "Educación Superior",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"univ_{key}",
                    "is_active": True,
                    "tags": ["universidad", "educacion", key],
                })

    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)
    return unique[:20]


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
    for key, url, org in UNIVERSIDADES:
        if org in seen_orgs:
            continue
        jobs = scrape_univ(key, url, org)
        print(f"[univ_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        if jobs:
            seen_orgs.add(org)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[universidades] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
