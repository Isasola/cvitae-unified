"""Cooperativas paraguayas — portales de empleo."""
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

COOPERATIVAS = [
    ("universitaria", "https://www.universitaria.com.py/trabaja-con-nosotros", "Cooperativa Universitaria"),
    ("universitaria2", "https://www.universitaria.com.py/empleos", "Cooperativa Universitaria"),
    ("medalla", "https://www.medallamilagrosa.com.py/trabaja-con-nosotros", "Cooperativa Medalla Milagrosa"),
    ("sancristobal", "https://www.coopsancristobal.com.py/trabaja-con-nosotros", "Cooperativa San Cristóbal"),
    ("yaguarete", "https://www.yaguarete.com.py/trabaja-con-nosotros", "Cooperativa Yaguarete"),
    ("capiibary", "https://www.capiibary.com.py/trabaja-con-nosotros", "Cooperativa Capiibary"),
    ("chortitzer", "https://www.chortitzer.com.py/trabaja-con-nosotros", "Cooperativa Chortitzer"),
    ("colonias", "https://www.coloniasunidas.com.py/trabaja-con-nosotros", "Colonias Unidas"),
    ("minga", "https://www.mingapora.com.py/trabaja-con-nosotros", "Cooperativa Minga Porã"),
    ("parana", "https://www.coopparana.com.py/trabaja-con-nosotros", "Cooperativa Paranaense"),
    ("nazareno", "https://www.coopnazareno.com.py/trabaja-con-nosotros", "Cooperativa Nazareno"),
    ("sacoop", "https://www.sacoop.com.py/trabaja-con-nosotros", "SACOOP"),
]

LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "plaza", "puesto", "recursos humanos"]
JOB_SELECTORS = [".job", ".oportunidad", ".vacante", "article", ".listing-item", "li.offer", ".career-item"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=25, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_coop(key, url, org):
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .puesto")
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
                    "rubro": "Cooperativas",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"coop_{key}",
                    "is_active": True,
                    "tags": ["cooperativa", key],
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
                    "titulo": text,
                    "organization": org,
                    "location": "Paraguay",
                    "rubro": "Cooperativas",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"coop_{key}",
                    "is_active": True,
                    "tags": ["cooperativa", key],
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
    seen_orgs = set()
    for key, url, org in COOPERATIVAS:
        if org in seen_orgs:
            continue
        jobs = scrape_coop(key, url, org)
        print(f"[coop_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        if jobs:
            seen_orgs.add(org)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[cooperativas] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
