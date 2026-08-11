"""ONGs, fundaciones y organismos de cooperación en Paraguay."""
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

ORGS = [
    ("fpj", "https://www.fundacionparaguaya.org.py/trabaja-con-nosotros", "Fundación Paraguaya"),
    ("probienestar", "https://www.probienestar.org.py/trabaja-con-nosotros", "Pro Bienestar"),
    ("cird", "https://www.cird.org.py/trabaja-con-nosotros", "CIRD"),
    ("decidamos", "https://www.decidamos.org.py/trabaja-con-nosotros", "Decidamos"),
    ("alter_vida", "https://www.altervida.org.py/trabaja-con-nosotros", "Alter Vida"),
    ("seducar", "https://www.seducar.org/trabaja-con-nosotros", "SEDUCAR"),
    ("vision_mundial", "https://www.visionmundial.org.py/trabaja-con-nosotros", "Visión Mundial Paraguay"),
    ("care_py", "https://www.care.org.py/trabaja-con-nosotros", "CARE Paraguay"),
    ("cruz_roja_py", "https://www.cruzroja.org.py/trabaja-con-nosotros", "Cruz Roja Paraguaya"),
    ("pnud_py", "https://jobs.undp.org/cj_view_jobs.cfm?cur_job_level=All&cur_job_type=All&cur_org_id=UNDP&cur_office_id=1580", "PNUD Paraguay"),
    ("unicef_py", "https://www.unicef.org/paraguay/oportunidades-profesionales", "UNICEF Paraguay"),
    ("fao_py", "https://www.fao.org/paraguay/empleo/es/", "FAO Paraguay"),
    ("bid_py", "https://jobs.iadb.org/en/search#q=paraguay&t=Jobs", "BID Paraguay"),
    ("onu_mujeres", "https://jobs.undp.org/cj_view_jobs.cfm?cur_office_id=2186", "ONU Mujeres Paraguay"),
    ("crs_py", "https://www.crs.org/our-work-overseas/where-we-work/paraguay", "CRS Paraguay"),
    ("plan_py", "https://www.planparaguay.org/trabaja-con-nosotros", "Plan International Paraguay"),
    ("habitat_py", "https://www.habitatparaguay.org.py/trabaja-con-nosotros", "Hábitat for Humanity"),
    ("usaid_py", "https://www.usaid.gov/paraguay/jobs", "USAID Paraguay"),
    ("giz_py", "https://www.giz.de/en/worldwide/357.html", "GIZ Paraguay"),
    ("oas_py", "https://www.oas.org/en/topics/jobs.asp", "OEA / OAS"),
]

LINK_KEYWORDS = [
    "vacante", "empleo", "trabaja", "oportunidad", "cargo", "puesto",
    "consultor", "oficial", "especialista", "postula", "convocatoria",
]
JOB_SELECTORS = [".job", ".vacancy", ".position", "article", ".listing", ".card", ".career-item", "li"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_org(key, url, org):
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .position-title, a")
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
                    "rubro": "ONG / Cooperación Internacional",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"ong_{key}",
                    "is_active": True,
                    "tags": ["ong", "cooperacion", "internacional", key],
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
                    "rubro": "ONG / Cooperación Internacional",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"ong_{key}",
                    "is_active": True,
                    "tags": ["ong", "cooperacion", key],
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
    for key, url, org in ORGS:
        jobs = scrape_org(key, url, org)
        print(f"[ong_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[ongs] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
