"""Supermercados y retail de Paraguay — portales de empleo."""
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
    ("stock", "https://www.stock.com.py/trabaja-con-nosotros", "Supermercado Stock", "Retail / Supermercados"),
    ("salemma", "https://www.salemma.com.py/trabaja-con-nosotros", "Salemma", "Retail / Supermercados"),
    ("superseis", "https://www.superseis.com.py/trabaja-con-nosotros", "SuperSeis", "Retail / Supermercados"),
    ("biggie", "https://www.biggie.com.py/trabaja-con-nosotros", "Biggie", "Retail / Supermercados"),
    ("dia", "https://www.dia.com.py/trabaja-con-nosotros", "Supermercados DIA", "Retail / Supermercados"),
    ("paris", "https://www.paris.com.py/trabaja-con-nosotros", "Paris", "Retail / Supermercados"),
    ("spalding", "https://www.spalding.com.py/trabaja-con-nosotros", "Spalding", "Retail"),
    ("grino", "https://www.grino.com.py/trabaja-con-nosotros", "Griño", "Retail"),
    ("oechsle_py", "https://www.oechsle.com.py/trabaja-con-nosotros", "Oechsle Paraguay", "Retail"),
    ("tiendamia_py", "https://www.tiendamia.com/py/jobs", "TiendaMia", "E-commerce"),
    ("shopping_del_sol", "https://www.shoppingdelsol.com.py/trabaja-con-nosotros", "Shopping del Sol", "Retail / Mall"),
    ("mariscal", "https://www.mariscal.com.py/trabaja-con-nosotros", "Mariscal", "Retail / Mall"),
    ("la_gran_manzana", "https://www.lgm.com.py/trabaja-con-nosotros", "La Gran Manzana", "Retail / Mall"),
    ("casa_rica", "https://www.casarica.com.py/trabaja-con-nosotros", "Casa Rica", "Retail"),
]

LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "oportunidad", "cargo", "plaza", "postula"]
JOB_SELECTORS = [".job", ".oportunidad", ".vacante", "article", ".card", ".listing-item"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=25, verify=False)
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
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"retail_{key}",
                    "is_active": True,
                    "tags": ["retail", "supermercado", key],
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
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": f"retail_{key}",
                    "is_active": True,
                    "tags": ["retail", "supermercado", key],
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
    for key, url, org, rubro in EMPRESAS:
        jobs = scrape_empresa(key, url, org, rubro)
        print(f"[retail_{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[supermercados] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
