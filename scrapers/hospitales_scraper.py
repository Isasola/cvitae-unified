"""Hospitales y clínicas paraguayas — portales de empleo."""
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

HOSPITALES = [
    ("hnnbb", "https://www.hnnbb.gov.py/convocatorias", "Hospital de Niños"),
    ("iics", "https://www.iics.una.py/convocatorias", "IICS - UNA"),
    ("ineram", "https://www.ineram.gov.py/convocatorias", "INERAM"),
    ("hch", "https://www.hch.gov.py/convocatorias", "Hospital Central"),
    ("ccss", "https://www.ccss.com.py/trabaja-con-nosotros", "Centro de Cirugía"),
    ("sanatorio_italiano", "https://www.sanatorioitaliano.com.py/trabaja-con-nosotros", "Sanatorio Italiano"),
    ("bautista", "https://www.hospitalbautista.com.py/trabaja-con-nosotros", "Hospital Bautista"),
    ("frances", "https://www.hospitalfrances.com.py/trabaja-con-nosotros", "Hospital Francés"),
    ("privado_frances", "https://www.hpf.com.py/trabaja-con-nosotros", "HPF"),
    ("militar", "https://www.hospitalmilitar.mil.py/convocatorias", "Hospital Militar"),
    ("policial", "https://www.hospitalpolicialpy.gov.py/convocatorias", "Hospital Policial"),
    ("santa_clara", "https://www.hospitalstaclara.com.py/trabaja-con-nosotros", "Hospital Santa Clara"),
    ("mca", "https://www.mca.com.py/trabaja-con-nosotros", "MCA"),
    ("medicar", "https://www.medicar.com.py/trabaja-con-nosotros", "Medicar"),
    ("rigane", "https://www.rigane.com.py/trabaja-con-nosotros", "Clínica Rigane"),
    ("universal", "https://www.clinicauniversal.com.py/trabaja-con-nosotros", "Clínica Universal"),
    ("inanba", "https://www.inanba.gov.py/convocatorias", "INANBA"),
    ("seme", "https://www.seme.gov.py/convocatorias", "SEME"),
]

LINK_KEYWORDS = [
    "vacante", "empleo", "trabaja", "oportunidad", "cargo",
    "medico", "enfermera", "enfermero", "tecnico", "internado",
    "convocatoria", "concurso", "postula",
]
JOB_SELECTORS = [".job", ".oportunidad", ".vacante", "article", ".listing-item", ".card", ".convocatoria"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_hospital(key, url, org):
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
                    "rubro": "Salud",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"hosp_{key}",
                    "is_active": True,
                    "tags": ["salud", "hospital", "medicina", key],
                })
            if jobs:
                break

    if not jobs:
        for a in soup.select("a[href]"):
            text = a.get_text(strip=True)
            href = a.get("href", "")
            if not text or len(text) < 6 or len(text) > 150:
                continue
            if any(kw in text.lower() or kw in href.lower() for kw in LINK_KEYWORDS):
                job_url = href if href.startswith("http") else url
                jobs.append({
                    "titulo": text,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": "Salud",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"hosp_{key}",
                    "is_active": True,
                    "tags": ["salud", "hospital", key],
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
    for key, url, org in HOSPITALES:
        if org in seen_orgs:
            continue
        jobs = scrape_hospital(key, url, org)
        print(f"[hosp_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        if jobs:
            seen_orgs.add(org)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[hospitales] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
