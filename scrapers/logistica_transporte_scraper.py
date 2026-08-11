"""Logística y transporte paraguayos — portales de RRHH."""
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
    ("dhl_py",           "https://careers.dhl.com/global/en/search-results?keywords=paraguay",                  "DHL Paraguay",              "Logística / Transporte"),
    ("fedex_py",         "https://careers.fedex.com/fedex/search?q=paraguay",                                   "FedEx Paraguay",            "Logística / Transporte"),
    ("ups_py",           "https://www.jobs-ups.com/search-jobs/paraguay/1152/4/3437223/62/-58/50/2",             "UPS Paraguay",              "Logística / Transporte"),
    ("copa_airlines",    "https://jobs.copaair.com/search/?q=&locationsearch=paraguay",                          "COPA Airlines Paraguay",    "Aviación / Transporte"),
    ("latam_py",         "https://careers.latamairlines.com/search/?q=&locationsearch=paraguay",                 "LATAM Airlines Paraguay",   "Aviación / Transporte"),
    ("avianca_py",       "https://careers.avianca.com/search/?q=&locationsearch=paraguay",                      "Avianca Paraguay",          "Aviación / Transporte"),
    ("transchaco",       "https://www.transchaco.com.py/trabaja-con-nosotros",                                   "Transchaco",                "Logística / Transporte"),
    ("frio_flet",        "https://www.frioflet.com.py/trabaja-con-nosotros",                                     "Frío Flet",                 "Logística Frigorífica"),
    ("distribuidora_py", "https://www.distribuidorapy.com/trabaja-con-nosotros",                                 "Distribuidora Paraguay",    "Logística"),
    ("luft_py",          "https://www.luft.com.py/trabaja-con-nosotros",                                         "Luft Logística",            "Logística / Transporte"),
]

JOB_SELECTORS = [
    ".job", ".oportunidad", ".vacante", ".career", "article",
    ".item-vacante", ".puesto", "li.offer", ".listing-item",
    ".job-listing", ".position", "[class*='job']", "[class*='career']",
]
LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "plaza", "puesto", "carrera", "job", "career", "position"]


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
                    "source": "logistica_transporte_py",
                    "is_active": True,
                    "tags": ["logistica", "transporte", key],
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
                    "source": "logistica_transporte_py",
                    "is_active": True,
                    "tags": ["logistica", "transporte", key],
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
        "source": "logistica_transporte_py",
        "is_active": True,
        "tags": ["logistica", "transporte", key],
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
    print(f"[logistica_transporte] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
