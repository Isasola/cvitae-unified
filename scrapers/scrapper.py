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


def fetch(url, verify=True):
    h = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        r = requests.get(url, headers=h, timeout=30, verify=verify)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


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


# ---------- CLASIPAR ----------
def scrape_clasipar():
    html = fetch("https://www.clasipar.com/empleos", verify=False)
    if not html:
        print("[clasipar] No se pudo obtener HTML")
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for item in soup.select(".listing-item, .job-card, article"):
        title_el = item.select_one(".title, h2, h3")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        url_el = item.select_one("a[href]")
        if not url_el:
            continue
        url = url_el.get("href", "")
        if not url:
            continue
        if not url.startswith("http"):
            url = "https://www.clasipar.com" + url
        company_el = item.select_one(".company, .business, .employer")
        company = company_el.get_text(strip=True) if company_el else ""
        location_el = item.select_one(".location, .city")
        location = location_el.get_text(strip=True) if location_el else "Paraguay"
        jobs.append({
            "titulo": title,
            "organization": company,
            "location": location,
            "rubro": "General",
            "type": "Tiempo completo",
            "description": "",
            "application_url": url,
            "source": "clasipar",
            "is_active": True,
            "tags": [],
        })
    return jobs


# ---------- MTESS ----------
def scrape_mtess():
    html = fetch("https://www.mtess.gov.py/")
    if not html:
        print("[mtess] No se pudo obtener HTML")
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for link in soup.select("a[href]"):
        href = link.get("href", "")
        text = link.get_text(strip=True).lower()
        if not text or len(text) < 5:
            continue
        if any(p in text for p in ["convocatoria", "empleo", "oportunidad", "trabajo"]) or \
           any(p in href for p in ["convocatoria", "empleo", "oportunidad"]):
            url = href if href.startswith("http") else "https://www.mtess.gov.py" + href
            jobs.append({
                "titulo": link.get_text(strip=True),
                "organization": "MTESS",
                "location": "Paraguay",
                "rubro": "Gobierno",
                "type": "Tiempo completo",
                "description": "",
                "application_url": url,
                "source": "mtess",
                "is_active": True,
                "tags": ["gobierno", "mtess"],
            })
    return jobs


# ---------- ABC COLOR EMPLEOS ----------
def scrape_abc():
    url = "https://empleos.abc.com.py/ofertas"
    html = fetch(url)
    if not html:
        print("[abc] No se pudo obtener HTML (React SPA — usar abc_scrapper.py con Playwright)")
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for item in soup.select(".ofertas-lista .item, .job-listing, article"):
        title_el = item.select_one("h2 a, h3 a, .title a")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        link = title_el.get("href", "")
        if not link:
            continue
        if not link.startswith("http"):
            link = "https://empleos.abc.com.py" + link
        company_el = item.select_one(".company, .empresa")
        company = company_el.get_text(strip=True) if company_el else ""
        location_el = item.select_one(".location, .ciudad")
        location = location_el.get_text(strip=True) if location_el else "Paraguay"
        jobs.append({
            "titulo": title,
            "organization": company,
            "location": location,
            "rubro": "General",
            "type": "Tiempo completo",
            "description": "",
            "application_url": link,
            "source": "abc_color",
            "is_active": True,
            "tags": [],
        })
    return jobs


# ---------- TIGO ----------
def scrape_tigo():
    html = fetch("https://www.tigo.com.py/trabaja-con-nosotros")
    if not html:
        print("[tigo] No se pudo obtener HTML")
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for item in soup.select(".job, .oportunidad, .vacante, article"):
        title_el = item.select_one("h2, h3, .title")
        link_el = item.select_one("a[href]")
        if not title_el or not link_el:
            continue
        title = title_el.get_text(strip=True)
        url = link_el.get("href", "")
        if not url:
            continue
        if not url.startswith("http"):
            url = "https://www.tigo.com.py" + url
        jobs.append({
            "titulo": title,
            "organization": "Tigo Paraguay",
            "location": "Paraguay",
            "rubro": "Telecomunicaciones",
            "type": "Tiempo completo",
            "description": "",
            "application_url": url,
            "source": "tigo",
            "is_active": True,
            "tags": ["telecomunicaciones", "tigo"],
        })
    return jobs


# ---------- PERSONAL (NÚCLEO) ----------
def scrape_personal():
    html = fetch("https://www.personal.com.py/institucional/trabaja-con-nosotros")
    if not html:
        print("[personal] No se pudo obtener HTML")
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for item in soup.select(".job, .oportunidad, article"):
        title_el = item.select_one("h2, h3, .title")
        link_el = item.select_one("a[href]")
        if not title_el or not link_el:
            continue
        title = title_el.get_text(strip=True)
        url = link_el.get("href", "")
        if not url:
            continue
        if not url.startswith("http"):
            url = "https://www.personal.com.py" + url
        jobs.append({
            "titulo": title,
            "organization": "Personal Paraguay",
            "location": "Paraguay",
            "rubro": "Telecomunicaciones",
            "type": "Tiempo completo",
            "description": "",
            "application_url": url,
            "source": "personal",
            "is_active": True,
            "tags": ["telecomunicaciones", "personal"],
        })
    return jobs


# ---------- BANCO ITAÚ ----------
def scrape_itau():
    html = fetch("https://www.itau.com.py/trabaja-con-nosotros")
    if not html:
        print("[itau] No se pudo obtener HTML")
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for item in soup.select(".job, .oportunidad, article"):
        title_el = item.select_one("h2, h3, .title")
        link_el = item.select_one("a[href]")
        if not title_el or not link_el:
            continue
        title = title_el.get_text(strip=True)
        url = link_el.get("href", "")
        if not url:
            continue
        if not url.startswith("http"):
            url = "https://www.itau.com.py" + url
        jobs.append({
            "titulo": title,
            "organization": "Banco Itaú Paraguay",
            "location": "Paraguay",
            "rubro": "Banca y Finanzas",
            "type": "Tiempo completo",
            "description": "",
            "application_url": url,
            "source": "itau",
            "is_active": True,
            "tags": ["banco", "finanzas", "itau"],
        })
    return jobs


# ---------- COPACO ----------
def scrape_copaco():
    html = fetch("https://www.copaco.com.py/vacantes")
    if not html:
        print("[copaco] No se pudo obtener HTML")
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for item in soup.select(".job, .oportunidad, article"):
        title_el = item.select_one("h2, h3, .title")
        link_el = item.select_one("a[href]")
        if not title_el or not link_el:
            continue
        title = title_el.get_text(strip=True)
        url = link_el.get("href", "")
        if not url:
            continue
        if not url.startswith("http"):
            url = "https://www.copaco.com.py" + url
        jobs.append({
            "titulo": title,
            "organization": "Copaco",
            "location": "Paraguay",
            "rubro": "Telecomunicaciones",
            "type": "Tiempo completo",
            "description": "",
            "application_url": url,
            "source": "copaco",
            "is_active": True,
            "tags": ["telecomunicaciones", "copaco"],
        })
    return jobs


def main():
    scrapers = [
        ("clasipar", scrape_clasipar),
        ("mtess", scrape_mtess),
        ("abc_color", scrape_abc),
        ("tigo", scrape_tigo),
        ("personal", scrape_personal),
        ("itau", scrape_itau),
        ("copaco", scrape_copaco),
    ]

    all_jobs = []
    for name, fn in scrapers:
        jobs = fn()
        print(f"[{name}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
        print(f"[{job['source']}] {job['titulo'][:60]} -> {status}")

    print(f"\nTotal insertados/actualizados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
