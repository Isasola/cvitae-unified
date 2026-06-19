import time
import requests
import os
from playwright.sync_api import sync_playwright
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

BASE_URL = "https://empleos.abc.com.py"


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS,
            json=job,
        )
        return r.status_code
    except Exception as e:
        print(f"[ABC] insert error: {e}")
        return "error"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL, timeout=60000)

        # Wait for React to render
        page.wait_for_timeout(8000)

        # Scroll to load more results
        for _ in range(5):
            page.evaluate("window.scrollBy(0, 1000)")
            page.wait_for_timeout(1500)

        html = page.content()
        browser.close()

    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    seen_urls = set()

    for link in soup.find_all("a", href=True):
        href = link["href"]
        if "/ofertas/" not in href:
            continue

        full_url = href if href.startswith("http") else BASE_URL + href
        if full_url in seen_urls:
            continue
        seen_urls.add(full_url)

        title = link.get_text(strip=True)
        if not title:
            parent = link.find_parent(["article", "div", "li"])
            if parent:
                title_el = parent.find(["h2", "h3", "h4"])
                title = title_el.get_text(strip=True) if title_el else ""
        if not title:
            continue

        parent = link.find_parent(["article", "div", "li"]) or link.parent
        company = ""
        location = ""
        if parent:
            company_el = parent.find(class_=lambda c: c and any(x in c for x in ["empresa", "company", "business", "employer"]))
            company = company_el.get_text(strip=True) if company_el else ""
            location_el = parent.find(class_=lambda c: c and any(x in c for x in ["ciudad", "location", "city", "ubicacion"]))
            location = location_el.get_text(strip=True) if location_el else ""

        jobs.append({
            "titulo": title,
            "organization": company,
            "location": location or "Paraguay",
            "rubro": "General",
            "type": "Tiempo completo",
            "description": "",
            "application_url": full_url,
            "source": "abc_color",
            "is_active": True,
            "tags": [],
        })

    total = 0
    for job in jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            total += 1
        print(f"[ABC] {job['titulo'][:60]} -> {status}")

    print(f"\nTotal ABC insertadas/actualizadas: {total}/{len(jobs)}")


if __name__ == "__main__":
    main()
