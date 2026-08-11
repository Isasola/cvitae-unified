"""
Idealist.org — ONGs globales, empleos de impacto social.
API pública sin autenticación (búsqueda pública).
Filtra por países LatAm y oportunidades remotas abiertas a la región.
"""
import requests
import re
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

HEADERS_FETCH = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
    "Referer": "https://www.idealist.org/",
}

IDEALIST_API = "https://www.idealist.org/api/v1/listings"

# Búsquedas: (query, country_code, tipo_label)
SEARCHES = [
    ("", "PY", "Trabajo"),          # Paraguay
    ("", "AR", "Trabajo"),          # Argentina
    ("", "BO", "Trabajo"),          # Bolivia
    ("", "PE", "Trabajo"),          # Perú
    ("", "CO", "Trabajo"),          # Colombia
    ("latam remote", "", "Trabajo"), # Global LATAM remoto
    ("latin america", "", "Trabajo"),
    ("paraguay", "", "Trabajo"),
]

RUBRO_KEYWORDS = {
    "technology": "Tecnología e IT",
    "finance": "Banca y Finanzas",
    "communications": "Comunicación y Medios",
    "education": "Educación",
    "health": "Salud",
    "environment": "Medio Ambiente",
    "human rights": "Derecho",
    "advocacy": "Consultoría",
    "research": "Investigación",
    "operations": "Administración",
    "social": "Ciencias Sociales",
    "community": "Ciencias Sociales",
}


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()[:800]


def guess_rubro(text):
    t = (text or "").lower()
    for kw, rubro in RUBRO_KEYWORDS.items():
        if kw in t:
            return rubro
    return "ONGs y Sociedad Civil"


def fetch_jobs(query, country_code, page=1):
    params = {
        "type": "JOB",
        "page": page,
        "pageSize": 25,
    }
    if query:
        params["q"] = query
    if country_code:
        params["country"] = country_code

    try:
        r = requests.get(IDEALIST_API, params=params, headers=HEADERS_FETCH, timeout=30)
        if r.status_code == 200:
            data = r.json()
            return data.get("results", [])
        print(f"  [Idealist] HTTP {r.status_code} q='{query}' country='{country_code}'")
        return []
    except Exception as e:
        print(f"  [Idealist] fetch error: {e}")
        return []


def fetch_jobs_html_fallback(country_code):
    """Fallback: scraping HTML si la API no responde."""
    url = f"https://www.idealist.org/en/jobs?country={country_code}"
    try:
        r = requests.get(url, headers=HEADERS_FETCH, timeout=30)
        if r.status_code != 200:
            return []
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(r.text, "html.parser")
        jobs = []
        for card in soup.select("[data-testid='listing-card'], .listing-card, article"):
            title_el = card.select_one("h2, h3, .listing-title, [data-testid='listing-title']")
            link_el = card.select_one("a[href]")
            org_el = card.select_one(".org-name, .organization, [data-testid='org-name']")
            if not title_el or not link_el:
                continue
            href = link_el.get("href", "")
            full_url = f"https://www.idealist.org{href}" if href.startswith("/") else href
            jobs.append({
                "title": title_el.get_text(strip=True),
                "organization": org_el.get_text(strip=True) if org_el else "ONG",
                "location": country_code,
                "description": "",
                "url": full_url,
            })
        return jobs
    except Exception as e:
        print(f"  [Idealist] HTML fallback error: {e}")
        return []


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


def parse_api_job(raw):
    title = raw.get("name", "").strip() or raw.get("title", "").strip()
    url = raw.get("url", "") or raw.get("actionUrl", "")
    if not title or not url:
        return None

    if not url.startswith("http"):
        url = f"https://www.idealist.org{url}"

    org = raw.get("organization", {})
    org_name = org.get("name", "ONG") if isinstance(org, dict) else str(org)

    location_data = raw.get("location", {}) or {}
    city = location_data.get("city", "")
    country = location_data.get("country", "Global")
    location = f"{city}, {country}".strip(", ") if city else country

    is_remote = raw.get("isRemoteOk", False) or raw.get("remote", False)
    if is_remote:
        location = f"Remoto ({location})" if location != "Global" else "Remoto"

    description = strip_html(raw.get("description", "") or raw.get("body", ""))
    categories = raw.get("categories", []) or []
    cat_text = " ".join(str(c) for c in categories).lower()
    rubro = guess_rubro(cat_text + " " + title.lower())

    job_type = "Remoto" if is_remote else "Tiempo completo"

    tags = [str(c) for c in categories[:5]] if categories else ["ong", "impacto-social"]

    return {
        "title": title,
        "organization": org_name,
        "location": location,
        "rubro": rubro,
        "type": job_type,
        "description": description[:800],
        "application_url": url,
        "source": "idealist",
        "is_active": True,
        "tags": tags,
    }


def main():
    total_found = 0
    total_inserted = 0
    seen_urls = set()

    for query, country_code, _ in SEARCHES:
        label = f"q='{query}'" if query else f"country={country_code}"
        print(f"\nFetching Idealist: {label}")

        jobs_raw = fetch_jobs(query, country_code)

        if not jobs_raw and country_code:
            print(f"  API sin resultados, intentando HTML fallback...")
            fallback = fetch_jobs_html_fallback(country_code)
            for item in fallback:
                if item["url"] in seen_urls:
                    continue
                seen_urls.add(item["url"])
                total_found += 1
                job = {
                    "title": item["title"],
                    "organization": item["organization"],
                    "location": item["location"],
                    "rubro": "ONGs y Sociedad Civil",
                    "type": "Tiempo completo",
                    "description": item["description"],
                    "application_url": item["url"],
                    "source": "idealist",
                    "is_active": True,
                    "tags": ["ong"],
                }
                status = insert_job(job)
                if status in (200, 201, 409):
                    total_inserted += 1
                print(f"  [fallback] {item['title'][:50]} -> {status}")
            time.sleep(1)
            continue

        for raw in jobs_raw:
            job = parse_api_job(raw)
            if not job or job["application_url"] in seen_urls:
                continue
            seen_urls.add(job["application_url"])
            total_found += 1

            status = insert_job(job)
            if status in (200, 201, 409):
                total_inserted += 1
            print(f"  [{job['organization']}] {job['title'][:50]} -> {status}")

        time.sleep(1)

    print(f"\n=== Idealist: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
