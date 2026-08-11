"""
WeWorkRemotely — una de las bolsas de empleos remotos más grandes del mundo.
Tiene RSS feeds públicos por categoría, sin autenticación.
RSS: https://weworkremotely.com/categories/remote-[category]-jobs.rss
"""
import requests
import re
import time
import os
from xml.etree import ElementTree as ET

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"
HEADERS_DB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

# Category RSS feeds
CATEGORIES = [
    ("remote-programming-jobs",         "Tecnología e IT"),
    ("remote-devops-sysadmin-jobs",      "Tecnología e IT"),
    ("remote-design-jobs",               "Diseño"),
    ("remote-marketing-jobs",            "Marketing y Publicidad"),
    ("remote-sales-and-marketing-jobs",  "Ventas y Comercial"),
    ("remote-customer-support-jobs",     "Atención al Cliente"),
    ("remote-finance-jobs",              "Banca y Finanzas"),
    ("remote-product-jobs",              "Producto"),
    ("remote-operations-jobs",           "Operaciones"),
    ("remote-writing-jobs",              "Comunicación y Medios"),
    ("remote-business-jobs",             "Negocios"),
    ("remote-data-science-jobs",         "Tecnología e IT"),
    ("remote-qa-jobs",                   "Tecnología e IT"),
    ("remote-hr-jobs",                   "Recursos Humanos"),
]

BASE_RSS = "https://weworkremotely.com/categories/{}.rss"
FULL_RSS  = "https://weworkremotely.com/remote-jobs.rss"


def strip_html(text):
    return re.sub(r'<[^>]+>', ' ', text or '').strip()[:600]


def parse_feed(url):
    try:
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
        if r.status_code != 200:
            return []
        root = ET.fromstring(r.content)
        ns = {"content": "http://purl.org/rss/1.0/modules/content/"}
        items = root.findall(".//item")
        return items
    except Exception as e:
        print(f"  RSS parse error {url}: {e}")
        return []


def extract_job(item, rubro):
    title_el = item.find("title")
    link_el  = item.find("link")
    desc_el  = item.find("description")

    if title_el is None or link_el is None:
        return None

    # WWR title format: "Company: Job Title"
    raw_title = (title_el.text or "").strip()
    if ": " in raw_title:
        parts = raw_title.split(": ", 1)
        company = parts[0].strip()
        title   = parts[1].strip()
    else:
        company = ""
        title   = raw_title

    # link element has the URL as text after the tag (RSS quirk)
    url = ""
    if link_el.text:
        url = link_el.text.strip()
    else:
        # Try the next sibling text node
        url = item.find("guid")
        url = url.text.strip() if url is not None and url.text else ""

    if not url or not title:
        return None

    description = strip_html(desc_el.text if desc_el is not None else "")

    return {
        "title": title,
        "organization": company,
        "location": "Remote",
        "rubro": rubro,
        "type": "Remoto",
        "description": description[:600],
        "application_url": url,
        "source": "weworkremotely",
        "is_active": True,
        "tags": [rubro.lower().replace(" ", "-")[:20]],
    }


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
    seen = set()

    for slug, rubro in CATEGORIES:
        url = BASE_RSS.format(slug)
        print(f"\nFeed: {slug}")
        items = parse_feed(url)
        print(f"  {len(items)} items en RSS")

        for item in items:
            job = extract_job(item, rubro)
            if not job:
                continue
            if job["application_url"] in seen:
                continue
            seen.add(job["application_url"])
            total_found += 1

            status = insert_job(job)
            if status in (200, 201, 409):
                total_inserted += 1
            print(f"  [{job['organization'][:25]}] {job['title'][:45]} -> {status}")

        time.sleep(1)

    print(f"\n=== WeWorkRemotely: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
