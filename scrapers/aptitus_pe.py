"""
Aptitus Peru — portal de empleo líder en Perú, parte del grupo El Comercio.
URL: https://aptitus.pe
"""
import requests
from bs4 import BeautifulSoup
import time
import os
import re
import json

from opportunity_sink import OpportunitySink

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

BASE_URL = "https://aptitus.pe"

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-PE,es;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://aptitus.pe/",
}

# Categories on Aptitus — mapped to their URL slugs
CATEGORIES = [
    ("lima", "administracion", "Administración"),
    ("lima", "ventas-y-comercial", "Ventas y Comercial"),
    ("lima", "tecnologia-e-informatica", "Tecnología e IT"),
    ("lima", "marketing-y-publicidad", "Marketing y Publicidad"),
    ("lima", "contabilidad-y-finanzas", "Banca y Finanzas"),
    ("lima", "recursos-humanos", "Recursos Humanos"),
    ("lima", "logistica-y-distribucion", "Logística y Transporte"),
    ("lima", "salud-y-medicina", "Salud y Medicina"),
    ("lima", "educacion-y-docencia", "Educación"),
    ("lima", "ingenieria-civil-y-electronica", "Ingeniería"),
    ("arequipa", "administracion", "Administración"),
    ("arequipa", "tecnologia-e-informatica", "Tecnología e IT"),
]


def fetch(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_category(city, category, rubro, max_pages=3):
    jobs = []
    for page in range(1, max_pages + 1):
        url = f"{BASE_URL}/empleos/{city}/{category}"
        if page > 1:
            url += f"?page={page}"

        html = fetch(url)
        if not html:
            break

        soup = BeautifulSoup(html, "html.parser")

        # Aptitus uses div.aviso or article.aviso for job listings
        cards = soup.select("div.aviso, article.aviso, li.aviso, div[class*='aviso'], div[class*='job-card']")
        if not cards:
            cards = soup.select("article, li.item")

        # Also try JSON-LD
        jsonld_jobs = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if item.get("@type") == "JobPosting":
                        t = item.get("title", "") or item.get("name", "")
                        u = item.get("url", "")
                        if t and u:
                            org = item.get("hiringOrganization", {})
                            company = org.get("name", "") if isinstance(org, dict) else ""
                            loc = item.get("jobLocation", {})
                            if isinstance(loc, dict):
                                addr = loc.get("address", {})
                                location = addr.get("addressLocality", city.title()) if isinstance(addr, dict) else city.title()
                            else:
                                location = city.title()
                            jsonld_jobs.append({
                                "title": t,
                                "organization": company,
                                "location": location + ", Peru",
                                "rubro": rubro,
                                "type": "",
                                "description": item.get("description", "")[:2000],
                                "application_url": u if u.startswith("http") else BASE_URL + u,
                                "source": "aptitus_pe",
                                "country_code": "PE",
                                "is_active": True,
                                "tags": [category.replace("-", " ")],
                            })
            except (json.JSONDecodeError, TypeError):
                continue

        page_jobs = []

        for card in cards:
            title_el = card.select_one("h2 a, h3 a, a.titulo, a.title, a[class*='title']")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 3:
                continue

            link = title_el.get("href", "")
            if not link:
                continue
            full_url = link if link.startswith("http") else BASE_URL + link

            company_el = card.select_one("span.empresa, a.empresa, span[class*='empresa'], p.empresa")
            company = company_el.get_text(strip=True) if company_el else ""

            location_el = card.select_one("span.lugar, span.ubicacion, span[class*='lugar']")
            location = location_el.get_text(strip=True) if location_el else f"{city.title()}, Peru"
            if not location:
                location = f"{city.title()}, Peru"

            page_jobs.append({
                "title": title,
                "organization": company,
                "location": location,
                "rubro": rubro,
                "type": "",
                "description": "",
                "application_url": full_url,
                "source": "aptitus_pe",
                "country_code": "PE",
                "is_active": True,
                "tags": [category.replace("-", " ")],
            })

        combined = page_jobs if page_jobs else jsonld_jobs
        if not combined:
            break

        jobs.extend(combined)
        print(f"  [{city}/{category}] página {page}: {len(combined)} ofertas")
        time.sleep(2)

    return jobs


def main():
    all_jobs = []

    for city, category, rubro in CATEGORIES:
        print(f"\nRastreando Aptitus PE: {city}/{category}")
        jobs = scrape_category(city, category, rubro, max_pages=3)
        all_jobs.extend(jobs)
        time.sleep(2)

    summary = OpportunitySink().upsert(all_jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== Aptitus PE: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas ==="
    )


if __name__ == "__main__":
    main()
