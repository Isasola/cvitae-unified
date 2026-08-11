"""Grupo Vierci (La Nación, GEN, etc.) — portal de empleos."""
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

# Grupo Vierci: La Nación, GEN TV, radio, supermercados MegaSuper, etc.
ENDPOINTS = [
    ("https://www.grupovierci.com/trabaja-con-nosotros", "Grupo Vierci"),
    ("https://www.grupovierci.com/empleos", "Grupo Vierci"),
    ("https://www.lanacion.com.py/institucional/trabaja-con-nosotros", "La Nación"),
    ("https://www.gen.com.py/trabaja-con-nosotros", "GEN Paraguay"),
    ("https://www.megasuper.com.py/trabaja-con-nosotros", "MegaSuper"),
    ("https://www.vierci.com.py/careers", "Grupo Vierci"),
    ("https://www.nacionmedia.com.py/trabaja-con-nosotros", "Nación Media"),
]

LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "oportunidad", "cargo", "plaza", "postula"]
JOB_SELECTORS = [".job", ".oportunidad", ".vacante", "article", ".card", ".listing-item"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_url(url, org):
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .cargo")
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
                    "rubro": "Medios y Comunicación",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": "grupo_vierci",
                    "is_active": True,
                    "tags": ["grupo-vierci", "medios", "comunicacion"],
                })
            if jobs:
                break

    if not jobs:
        for a in soup.select("a[href]"):
            text = a.get_text(strip=True)
            href = a.get("href", "")
            if not text or len(text) < 6 or len(text) > 120:
                continue
            if any(kw in text.lower() for kw in LINK_KEYWORDS):
                job_url = href if href.startswith("http") else url
                jobs.append({
                    "title": text,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": "Medios y Comunicación",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": "grupo_vierci",
                    "is_active": True,
                    "tags": ["grupo-vierci", "medios"],
                })

    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)
    return unique[:15]


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
    seen_urls = set()
    for url, org in ENDPOINTS:
        jobs = scrape_url(url, org)
        print(f"[vierci] {url}: {len(jobs)}")
        for j in jobs:
            if j["application_url"] not in seen_urls:
                seen_urls.add(j["application_url"])
                all_jobs.append(j)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[grupo_vierci] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
