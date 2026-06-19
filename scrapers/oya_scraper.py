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

BASE_URL = "https://oyaop.com"


def fetch(url):
    h = {"User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(url, headers=h, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"[OYA] fetch error: {e}")
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
        print(f"[OYA] insert error: {e}")
        return "error"


def determine_type(url):
    url_lower = url.lower()
    if "/scholarship" in url_lower or "/fellowship" in url_lower:
        return "Beca"
    elif "/job/" in url_lower:
        return "Empleo"
    elif "/conference" in url_lower:
        return "Conferencia"
    elif "/internship" in url_lower:
        return "Pasantía"
    elif "/exchange" in url_lower:
        return "Intercambio"
    elif "/competition" in url_lower or "/award" in url_lower:
        return "Concurso"
    else:
        return "Oportunidad"


def scrape_oya():
    html = fetch(BASE_URL)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    for a in soup.select("a.opportunity-title"):
        url = a.get("href")
        if not url:
            continue
        full_url = url if url.startswith("http") else BASE_URL + url

        content = a.select_one(".hc-content")
        if not content:
            continue
        title_span = content.select_one("span.hc-title, span.opportunity-title, span")
        title = title_span.get_text(strip=True) if title_span else ""
        if not title:
            continue

        date_span = content.select_one("span.opportunity-date")
        description = date_span.get_text(strip=True) if date_span else ""

        opp_type = determine_type(full_url)

        jobs.append({
            "titulo": title,
            "organization": "OYA Opportunities",
            "location": "Global",
            "rubro": "Internacional",
            "type": opp_type,
            "description": description,
            "application_url": full_url,
            "source": "oyaop",
            "is_active": True,
            "tags": [],
        })
    return jobs


def main():
    jobs = scrape_oya()
    total = 0
    for job in jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            total += 1
        print(f"[OYA] {job['titulo'][:60]} -> {status}")
    print(f"\nTotal OYA insertadas/actualizadas: {total}/{len(jobs)}")


if __name__ == "__main__":
    main()
