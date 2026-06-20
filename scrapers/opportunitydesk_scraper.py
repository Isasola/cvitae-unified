import requests
from bs4 import BeautifulSoup
import time
import os
import re

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

BASE_URL = "https://opportunitydesk.org"

# Categories — URLs verified live against the actual site structure
CATEGORIES = [
    ("/category/fellowships-and-scholarships/",              "Beca"),
    ("/category/fellowships-and-scholarships/study-abroad/study-in-america/", "Beca"),
    ("/category/fellowships-and-scholarships/online-courses/", "Curso"),
    ("/category/fellowships-and-scholarships/short-courses/",  "Curso"),
    ("/category/awards-and-grants/",                         "Capital Semilla"),
    ("/category/contests/",                                  "Concurso"),
    ("/category/fellowships/",                               "Fellowship"),
    ("/category/blog/od-live/",                              "Oportunidad"),
]

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
}


def fetch(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            json=job,
        )
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def scrape_category(path, opp_type, max_pages=3):
    jobs = []
    seen = set()

    for page in range(1, max_pages + 1):
        url = BASE_URL + path
        if page > 1:
            url = BASE_URL + path + f"page/{page}/"

        html = fetch(url)
        if not html:
            break

        soup = BeautifulSoup(html, "html.parser")

        # WordPress theme — links in h2 and h4 headings are post titles
        links = soup.select("h2 > a, h4 > a, h3 > a")
        page_jobs = []

        for link in links:
            href = link.get("href", "")
            if not href or href in seen:
                continue
            # Only include actual post URLs (not category/tag pages)
            if not re.match(r'https://opportunitydesk\.org/\d{4}/', href):
                continue
            seen.add(href)

            title = link.get_text(strip=True)
            if not title or len(title) < 5:
                continue

            # Extract deadline/organization from title heuristically
            # Titles often look like: "XYZ Fellowship 2026 for Young Leaders (Fully Funded)"
            description = title

            page_jobs.append({
                "titulo": title,
                "organization": "OpportunityDesk",
                "location": "Global",
                "rubro": "Internacional",
                "type": opp_type,
                "description": description,
                "application_url": href,
                "source": "opportunitydesk",
                "is_active": True,
                "tags": [opp_type.lower(), "internacional", "beca"],
            })

        if not page_jobs:
            break

        jobs.extend(page_jobs)
        print(f"  [{path.split('/')[-2]}] página {page}: {len(page_jobs)} oportunidades")
        time.sleep(2)

    return jobs


def main():
    total_found = 0
    total_inserted = 0

    for path, opp_type in CATEGORIES:
        print(f"\nRastreando: {path} ({opp_type})")
        jobs = scrape_category(path, opp_type, max_pages=3)
        total_found += len(jobs)

        for job in jobs:
            status = insert_job(job)
            if status in (200, 201, 409):
                total_inserted += 1
            print(f"  {job['titulo'][:60]} -> {status}")

        time.sleep(2)

    print(f"\n=== OpportunityDesk: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
