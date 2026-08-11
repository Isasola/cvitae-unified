import time
import requests
import os
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from bs4 import BeautifulSoup

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

BASE_URL = "https://www.fundacionparaguaya.org.py/portal-empleo/#/home"


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS,
            json=job,
        )
        return r.status_code
    except Exception as e:
        print(f"[Fundacion] insert error: {e}")
        return "error"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL, timeout=60000)

        # Hash-based SPA — wait for any card-like element
        try:
            page.wait_for_selector(".card, .job-card, .oportunidad, article, [class*='job'], [class*='vacante']", timeout=20000)
        except PlaywrightTimeout:
            print("[Fundacion] Timeout waiting for cards — continuing with whatever loaded")

        for _ in range(5):
            page.evaluate("window.scrollBy(0, 800)")
            time.sleep(1)

        html = page.content()
        browser.close()

    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    seen = set()

    for card in soup.select(".card, .job-card, .oportunidad, article, [class*='job'], [class*='vacante']"):
        title_el = card.select_one("h2, h3, h4, .title, .job-title, [class*='title']")
        if not title_el:
            continue
        title = title_el.get_text(strip=True)
        if not title:
            continue

        link_el = card.select_one("a[href]")
        url = ""
        if link_el:
            url = link_el.get("href", "")
            if url.startswith("/"):
                url = "https://www.fundacionparaguaya.org.py" + url
        # For hash-based SPAs, fall back to page URL + card text as unique key
        if not url:
            url = f"{BASE_URL}/{title[:40].replace(' ', '-').lower()}"
        if url in seen:
            continue
        seen.add(url)

        company_el = card.select_one(".company, .empresa, [class*='company'], [class*='empresa']")
        company = company_el.get_text(strip=True) if company_el else "Fundación Paraguaya"

        location_el = card.select_one(".location, .ciudad, [class*='location'], [class*='ciudad']")
        location = location_el.get_text(strip=True) if location_el else "Paraguay"

        jobs.append({
            "title": title,
            "organization": company,
            "location": location,
            "rubro": "ONGs y Social",
            "type": "Tiempo completo",
            "description": "",
            "application_url": url,
            "source": "fundacionparaguaya",
            "is_active": True,
            "tags": ["fundacion", "social", "ong"],
        })

    total = 0
    for job in jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            total += 1
        print(f"[Fundacion] {job['title'][:60]} -> {status}")

    print(f"\nTotal Fundación Paraguaya: {total}/{len(jobs)}")


if __name__ == "__main__":
    main()
