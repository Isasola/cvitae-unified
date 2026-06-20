"""
UNJobs scraper — cubre toda la familia ONU: UNDP, UNICEF, OPS/OMS, FAO,
IDB/BID, OEA, PNUD y más, en Paraguay y principales países de LatAm.
unjobs.org hace el trabajo duro de agregar todos los portales de la ONU.
"""
import requests
from bs4 import BeautifulSoup
import time
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"
HEADERS_DB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9",
}

# Country/region pages + thematic pages on unjobs.org
PAGES = [
    ("https://unjobs.org/duty_stations/paraguay",    "Paraguay"),
    ("https://unjobs.org/duty_stations/argentina",   "Argentina"),
    ("https://unjobs.org/duty_stations/bolivia",     "Bolivia"),
    ("https://unjobs.org/duty_stations/colombia",    "Colombia"),
    ("https://unjobs.org/duty_stations/peru",        "Perú"),
    ("https://unjobs.org/duty_stations/brazil",      "Brasil"),
    ("https://unjobs.org/duty_stations/chile",       "Chile"),
    ("https://unjobs.org/duty_stations/mexico",      "México"),
    ("https://unjobs.org/themes/youth",              "Global - Youth"),
    ("https://unjobs.org/themes/gender",             "Global - Gender"),
    ("https://unjobs.org/themes/innovation",         "Global - Innovation"),
]


def fetch(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=20)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


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


def scrape_page(url, default_location):
    html = fetch(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for card in soup.select("div.job"):
        title_el = card.select_one("a.jtitle")
        if not title_el:
            continue

        title = title_el.get_text(strip=True)
        job_url = title_el.get("href", "")
        if not job_url:
            continue

        # Organization: text node after the title link, before the date
        card_text = card.get_text(separator="\n").strip()
        lines = [l.strip() for l in card_text.split("\n") if l.strip()]
        # lines[0] = title, lines[1] = org (if present), lines[2] = "Updated:"
        organization = ""
        for line in lines[1:]:
            if line.startswith("Updated:") or not line:
                break
            organization = line
            break

        jobs.append({
            "titulo": title,
            "organization": organization or "Organización ONU",
            "location": default_location,
            "rubro": "Organismos Internacionales",
            "type": "Tiempo completo",
            "description": "",
            "application_url": job_url,
            "source": "unjobs",
            "is_active": True,
            "tags": ["onu", "internacional", "organismo-internacional"],
        })

    return jobs


def main():
    total_found = 0
    total_inserted = 0
    seen = set()

    for url, location in PAGES:
        print(f"\nRastreando: {url}")
        jobs = scrape_page(url, location)
        new_jobs = [j for j in jobs if j["application_url"] not in seen]
        seen.update(j["application_url"] for j in new_jobs)
        total_found += len(new_jobs)
        print(f"  {len(new_jobs)} vacantes únicas")

        for job in new_jobs:
            status = insert_job(job)
            if status in (200, 201, 409):
                total_inserted += 1
            print(f"  [{job['organization'][:30]}] {job['titulo'][:45]} -> {status}")

        time.sleep(1.5)

    print(f"\n=== UNJobs: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
