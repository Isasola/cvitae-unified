"""
Talent.com — agregador global con buena cobertura de Paraguay y LatAm.
No requiere API key. Scraping HTML público.
"""
import requests
from bs4 import BeautifulSoup
import time
import os
import re

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"

HEADERS_DB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

HEADERS_FETCH = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

BASE_URL = "https://www.talent.com"

# (keywords, location, rubro)
SEARCHES = [
    ("", "Paraguay", "General"),
    ("analista", "Paraguay", "General"),
    ("desarrollador", "Paraguay", "Tecnología e IT"),
    ("contador", "Paraguay", "Banca y Finanzas"),
    ("administración", "Paraguay", "Administración"),
    ("ventas", "Paraguay", "Ventas y Comercial"),
    ("diseño", "Paraguay", "Diseño"),
    ("marketing", "Paraguay", "Marketing y Publicidad"),
    ("recursos humanos", "Paraguay", "Recursos Humanos"),
    ("logística", "Paraguay", "Logística y Supply Chain"),
    ("salud enfermería", "Paraguay", "Salud"),
    ("remoto latam", "Paraguay", "General"),
    ("ingeniero", "Paraguay", "Ingeniería y Manufactura"),
    ("docente educación", "Paraguay", "Educación"),
]

RUBRO_KEYWORDS = {
    "tecnolog": "Tecnología e IT",
    "software": "Tecnología e IT",
    "developer": "Tecnología e IT",
    "programador": "Tecnología e IT",
    "sistemas": "Tecnología e IT",
    "contador": "Banca y Finanzas",
    "finanzas": "Banca y Finanzas",
    "banco": "Banca y Finanzas",
    "ventas": "Ventas y Comercial",
    "comercial": "Ventas y Comercial",
    "marketing": "Marketing y Publicidad",
    "diseño": "Diseño",
    "rrhh": "Recursos Humanos",
    "recursos humanos": "Recursos Humanos",
    "logística": "Logística y Supply Chain",
    "salud": "Salud",
    "médico": "Salud",
    "enfermería": "Salud",
    "docente": "Educación",
    "educación": "Educación",
    "ingenier": "Ingeniería y Manufactura",
    "legal": "Derecho",
    "abogado": "Derecho",
    "comunicación": "Comunicación y Medios",
}


def guess_rubro(title, default="General"):
    t = title.lower()
    for kw, rubro in RUBRO_KEYWORDS.items():
        if kw in t:
            return rubro
    return default


def fetch_page(keywords, location, page=1):
    params = {"k": keywords, "l": location, "p": page}
    try:
        r = requests.get(f"{BASE_URL}/jobs", params=params, headers=HEADERS_FETCH, timeout=30)
        if r.status_code != 200:
            print(f"  [Talent.com] HTTP {r.status_code}")
            return []
        return r.text
    except Exception as e:
        print(f"  [Talent.com] fetch error: {e}")
        return ""


def parse_jobs(html, default_rubro, location):
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    seen_titles = set()

    for h2 in soup.select("h2"):
        title = h2.get_text(strip=True)
        if not title or len(title) < 5 or title in seen_titles:
            continue
        seen_titles.add(title)

        # Get link from h2 or nearest parent
        a = h2.find("a")
        if not a:
            a = h2.find_parent("a")
        if not a:
            a = h2.find_next("a")
        if not a:
            continue

        href = a.get("href", "")
        if not href:
            continue
        url = href if href.startswith("http") else f"{BASE_URL}{href}"

        # Get company from nearby element
        parent = h2.parent or h2
        company_el = parent.find_next(string=re.compile(r"^[A-Z].{2,60}$"))
        company = ""
        # Try sibling spans/divs for company name
        for sib in h2.find_next_siblings(["span", "div", "p"])[:3]:
            txt = sib.get_text(strip=True)
            if txt and 3 < len(txt) < 80 and not txt.startswith("http"):
                company = txt
                break

        rubro = guess_rubro(title, default_rubro)

        jobs.append({
            "title": title,
            "organization": company or "No especificada",
            "location": location,
            "rubro": rubro,
            "type": "Remoto" if "remote" in title.lower() or "remoto" in title.lower() else "Tiempo completo",
            "description": "",
            "application_url": url,
            "source": "talentcom",
            "is_active": True,
            "tags": [],
        })

    return jobs


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS_DB,
            json=job,
        )
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def main():
    total_found = 0
    total_inserted = 0
    seen_urls = set()

    for keywords, location, rubro in SEARCHES:
        label = f"'{keywords}'" if keywords else "general"
        print(f"\nFetching Talent.com: {label} en {location}")

        html = fetch_page(keywords, location)
        jobs = parse_jobs(html, rubro, location)

        for job in jobs:
            if job["application_url"] in seen_urls:
                continue
            seen_urls.add(job["application_url"])
            total_found += 1

            status = insert_job(job)
            if status in (200, 201, 409):
                total_inserted += 1
            print(f"  [{job['organization'][:30]}] {job['title'][:50]} -> {status}")

        time.sleep(1.5)

    print(f"\n=== Talent.com: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
