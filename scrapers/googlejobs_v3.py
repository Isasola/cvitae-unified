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

SEARCH_URL = "https://www.google.com/search?q=trabajos+paraguay&udm=8&hl=es"


def insert_job(title, url, company, location):
    payload = {
        "title": title,
        "organization": company,
        "location": location or "Paraguay",
        "rubro": "General",
        "type": "Tiempo completo",
        "description": "",
        "application_url": url,
        "source": "googlejobs",
        "is_active": True,
        "tags": [],
    }
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS,
            json=payload,
        )
        return r.status_code
    except Exception as e:
        print(f"[GoogleJobs] insert error: {e}")
        return "error"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page.goto(SEARCH_URL, timeout=60000)

        # Wait for job cards to appear (class discovered via DOM inspection)
        try:
            page.wait_for_selector("div.MQUd2b", timeout=20000)
        except PlaywrightTimeout:
            print("[GoogleJobs v3] Job cards (div.MQUd2b) not found — Google may block headless")

        for _ in range(15):
            page.evaluate("window.scrollBy(0, 1000)")
            time.sleep(1.5)
        page.wait_for_timeout(3000)

        html = page.content()
        browser.close()

    soup = BeautifulSoup(html, "html.parser")
    seen_urls = set()
    total = 0
    found = 0

    for card in soup.select("div.MQUd2b"):
        link_el = card.find("a", class_="L5NwLd")
        if not link_el:
            continue
        url = link_el.get("href", "")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)

        title_el = card.find("span", class_="PUpOsf")
        title = title_el.get_text(strip=True) if title_el else ""
        if not title:
            continue
        found += 1

        info_divs = card.find_all("div", class_="FqK3wc")
        company = info_divs[0].get_text(strip=True) if len(info_divs) > 0 else ""
        location = info_divs[1].get_text(strip=True) if len(info_divs) > 1 else "Paraguay"

        status = insert_job(title, url, company, location)
        if status in (200, 201, 409):
            total += 1
        print(f"[GoogleJobs v3] {title[:60]} -> {status}")

    print(f"\nTotal insertados/actualizados desde Google Jobs v3: {total}/{found}")


if __name__ == "__main__":
    main()
