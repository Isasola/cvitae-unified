"""Bancos paraguayos — portales de RRHH."""
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

BANCOS = [
    ("bnf", "https://www.bnf.gov.py/trabaja-con-nosotros", "Banco Nacional de Fomento"),
    ("continental", "https://www.continental.com.py/trabaja-con-nosotros", "Banco Continental"),
    ("continental2", "https://www.continental.com.py/institucional/recursos-humanos", "Banco Continental"),
    ("sudameris", "https://www.sudameris.com.py/trabaja-con-nosotros", "Banco Sudameris"),
    ("gnb", "https://www.gnb.com.py/trabaja-con-nosotros", "GNB Paraguay"),
    ("vision", "https://www.visionbanco.com.py/trabaja-con-nosotros", "Vision Banco"),
    ("atlas", "https://www.bancoatlas.com.py/trabaja-con-nosotros", "Banco Atlas"),
    ("basa", "https://www.basa.com.py/trabaja-con-nosotros", "BASA"),
    ("regional", "https://www.bancoregional.com.py/trabaja-con-nosotros", "Banco Regional"),
    ("familiar", "https://www.bancofamiliar.com.py/sumate", "Banco Familiar"),
    ("rio", "https://www.bancorio.com.py/trabaja-con-nosotros", "Banco Rio"),
    ("interfisa", "https://www.interfisa.com.py/trabaja-con-nosotros", "Interfisa Banco"),
    ("bbva", "https://www.bbva.com.py/trabaja-con-nosotros", "BBVA Paraguay"),
    ("bcp_empleos", "https://www.bcp.gov.py/llamado-a-concurso-de-meritos-i432", "Banco Central del Paraguay"),
    ("ueno", "https://ueno.com.py/trabaja-con-nosotros", "Banco Ueno"),
]

JOB_SELECTORS = [
    ".job", ".oportunidad", ".vacante", ".career", "article",
    ".item-vacante", ".puesto", "li.offer", ".listing-item",
]
LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "plaza", "puesto", "carrera"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_banco(key, url, org):
    html = fetch(url)
    if not html:
        return []
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
                job_url = ""
                if link_el:
                    href = link_el.get("href", "")
                    job_url = href if href.startswith("http") else f"{url.rstrip('/')}/{href.lstrip('/')}"
                if not job_url:
                    job_url = f"{url}#{title[:40].replace(' ', '-').lower()}"
                jobs.append({
                    "title": title,
                    "organization": org,
                    "location": "Asunción, Paraguay",
                    "rubro": "Banca y Finanzas",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"banco_{key}",
                    "is_active": True,
                    "tags": ["banco", "finanzas", key],
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
                    "rubro": "Banca y Finanzas",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"banco_{key}",
                    "is_active": True,
                    "tags": ["banco", "finanzas", key],
                })

    # Dedup by URL
    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)
    return unique[:20]


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
    seen_orgs = set()
    for key, url, org in BANCOS:
        if org in seen_orgs:
            continue
        jobs = scrape_banco(key, url, org)
        print(f"[banco_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        if jobs:
            seen_orgs.add(org)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[bancos] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
