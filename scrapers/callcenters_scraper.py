"""Call centers en Paraguay — Atento, Teleperformance, Konecta, etc."""
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
    ("atento", "https://www.atento.com/es/trabaja-con-nosotros/", "Atento Paraguay", "Call Center / BPO"),
    ("atento_py", "https://empleos.atento.com/jobs?country=PY", "Atento Paraguay", "Call Center / BPO"),
    ("teleperformance", "https://jobs.teleperformance.com/search?country=Paraguay", "Teleperformance Paraguay", "Call Center / BPO"),
    ("konecta", "https://jobs.konectagroup.com/search-jobs/Paraguay", "Konecta Paraguay", "Call Center / BPO"),
    ("visionary", "https://www.visionary.com.py/trabaja-con-nosotros", "Visionary", "Call Center / BPO"),
    ("skytel", "https://www.skytel.com.py/trabaja-con-nosotros", "Skytel Paraguay", "Call Center / BPO"),
    ("avantica", "https://www.avantica.com.py/careers", "Avantica Technologies", "Tecnología"),
    ("itti", "https://www.itti.com.py/trabaja-con-nosotros", "ITTI", "Tecnología"),
    ("codium", "https://www.codium.com.py/careers", "Codium", "Tecnología"),
    ("pronet", "https://www.pronet.com.py/trabaja-con-nosotros", "Pronet SA", "Telecomunicaciones"),
    ("personal_cc", "https://www.personal.com.py/institucional/trabaja-con-nosotros", "Núcleo Personal", "Telecomunicaciones"),
    ("infocenter", "https://www.infocenter.com.py/empleos", "Infocenter", "Call Center / BPO"),
]

LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "apply", "postula", "job"]
JOB_SELECTORS = [".job", ".vacancy", ".position", ".career-item", "article.job", ".job-listing", "li.job", ".offer"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_company(key, url, org, rubro):
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .job-title, .position-name")
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
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"cc_{key}",
                    "is_active": True,
                    "tags": ["call-center", "bpo", key],
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
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"cc_{key}",
                    "is_active": True,
                    "tags": ["call-center", "bpo", key],
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
    for key, url, org, rubro in COMPANIES:
        if org in seen_orgs:
            continue
        jobs = scrape_company(key, url, org, rubro)
        print(f"[cc_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)
        if jobs:
            seen_orgs.add(org)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[callcenters] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
