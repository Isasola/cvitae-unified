"""Empresas tech locales paraguayas — portales de empleo."""
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

EMPRESAS = [
    ("sodep", "https://www.sodep.com.py/careers", "SODEP", "Tecnología"),
    ("lsd", "https://www.lsd.com.py/careers", "LSD", "Tecnología"),
    ("codedge", "https://www.codedge.io/jobs", "CodeDge", "Tecnología"),
    ("roshka", "https://www.roshka.com/careers", "Roshka", "Tecnología"),
    ("ueno_tech", "https://www.uenotech.com.py/careers", "Ueno Tech", "Tecnología"),
    ("informatica", "https://www.informatica.com.py/trabaja-con-nosotros", "Informática PY", "Tecnología"),
    ("sinnaps_py", "https://www.sinnaps.com/jobs?location=Paraguay", "Sinnaps Paraguay", "Tecnología"),
    ("devgrid", "https://www.devgrid.com.py/careers", "Devgrid", "Tecnología"),
    ("infotech", "https://www.infotech.com.py/trabaja", "Infotech", "Tecnología"),
    ("confiamed", "https://www.confiamed.com.py/trabaja-con-nosotros", "Confiamed", "Tecnología / Salud"),
    ("idc", "https://www.idcsa.com.py/trabaja-con-nosotros", "IDC SA", "Tecnología"),
    ("cds_py", "https://www.cds.com.py/careers", "CDS Paraguay", "Tecnología"),
    ("geniuz", "https://www.geniuz.com.py/careers", "Geniuz", "Tecnología"),
    ("nubisis", "https://www.nubisis.com/careers", "Nubisis", "Tecnología"),
    ("click_py", "https://www.click.com.py/trabaja-con-nosotros", "Click Paraguay", "Tecnología"),
]

LINK_KEYWORDS = [
    "vacante", "empleo", "trabaja", "oportunidad", "developer", "programador",
    "cargo", "postula", "career", "apply", "job",
]
JOB_SELECTORS = [
    ".job", ".vacancy", ".position", ".career-item", "article.job",
    ".job-listing", "li.job", ".offer", ".open-role",
]


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
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .job-title, .role-title")
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
                    "source": f"tech_{key}",
                    "is_active": True,
                    "tags": ["tech", "tecnologia", "desarrollo", key],
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
                    "titulo": text,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"tech_{key}",
                    "is_active": True,
                    "tags": ["tech", "tecnologia", key],
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
    for key, url, org, rubro in EMPRESAS:
        jobs = scrape_empresa(key, url, org, rubro)
        print(f"[tech_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[tech_local] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
