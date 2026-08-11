import requests
from bs4 import BeautifulSoup
import time
import os
import re
import json

from opportunity_sink import OpportunitySink

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

BASE_URL = "https://py.computrabajo.com"
FOREIGN_COUNTRIES = re.compile(
    r"\b(uruguay|argentina|brasil|brazil|bolivia|per[uú]|chile|colombia|m[eé]xico|espa[nñ]a)\b",
    re.IGNORECASE,
)

# Categories to scrape — covers the main job sectors in Paraguay
CATEGORIES = [
    ("administracion", "Administración"),
    ("ventas", "Ventas y Comercial"),
    ("tecnologia", "Tecnología"),
    ("marketing", "Marketing"),
    ("contabilidad", "Banca y Finanzas"),
    ("recursos-humanos", "Recursos Humanos"),
    ("logistica", "Logística y Transporte"),
    ("salud", "Salud y Medicina"),
    ("educacion", "Educación"),
    ("ingenieria", "Ingeniería"),
    ("gastronomia", "Gastronomía y Hotelería"),
    ("comercio-exterior", "Comercio Exterior"),
    ("atencion-al-cliente", "Atención al Cliente"),
]

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

RUBRO_MAP = {
    "administracion": "Administración",
    "ventas": "Ventas y Comercial",
    "tecnologia": "Tecnología e IT",
    "marketing": "Marketing y Publicidad",
    "contabilidad": "Banca y Finanzas",
    "recursos-humanos": "Recursos Humanos",
    "logistica": "Logística y Transporte",
    "salud": "Salud y Medicina",
    "educacion": "Educación",
    "ingenieria": "Ingeniería",
    "gastronomia": "Gastronomía y Hotelería",
    "comercio-exterior": "Comercio Exterior",
    "atencion-al-cliente": "Atención al Cliente",
}


def fetch(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=30)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


_insert_error_reported = False


def insert_job(job):
    global _insert_error_reported
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
            timeout=30,
        )
        if r.status_code >= 400 and not _insert_error_reported:
            print(f"  Supabase rechazó la oportunidad ({r.status_code}): {r.text[:800]}")
            _insert_error_reported = True
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def scrape_category(slug, rubro, max_pages=3):
    jobs = []
    for page in range(1, max_pages + 1):
        url = f"{BASE_URL}/trabajo-de-{slug}"
        if page > 1:
            url += f"?p={page}"

        html = fetch(url)
        if not html:
            break

        soup = BeautifulSoup(html, "html.parser")

        # Computrabajo uses article.box_offer for each listing
        cards = soup.select("article.box_offer, article[data-ga-label]")
        if not cards:
            # Fallback: try any article with an h2 heading
            cards = soup.select("article")

        page_jobs = []
        for card in cards:
            # Confirmed selectors from live DOM inspection
            title_el = card.select_one("h2 a.js-o-link")
            if not title_el:
                title_el = card.select_one("h2 a")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title:
                continue

            link = title_el.get("href", "")
            if not link:
                continue
            # Strip tracking fragment (#lc=...) and make absolute
            link = re.sub(r'#.*$', '', link)
            full_url = link if link.startswith("http") else BASE_URL + link

            # Company: <a> inside second <p> tag
            company_el = card.select_one("p a[href*='/empresas/']")
            company = company_el.get_text(strip=True) if company_el else ""

            # Location: plain <span> inside third <p> (no special class)
            location_spans = card.select("p span")
            location = ""
            for span in location_spans:
                text = span.get_text(strip=True)
                if text and not text.startswith("i_") and len(text) > 2:
                    location = text
                    break
            if not location:
                location = "Paraguay"
            if FOREIGN_COUNTRIES.search(location):
                print(f"  omitida fuera de Paraguay: {title} ({location})")
                continue

            # Salary: inside .fs13 div
            salary_el = card.select_one("div.fs13 span:last-child, div.fs13")
            description = ""
            if salary_el:
                sal_text = salary_el.get_text(strip=True)
                if "$" in sal_text or "G." in sal_text:
                    description = sal_text

            page_jobs.append({
                "title": title,
                "organization": company,
                "location": location,
                "rubro": rubro,
                "type": "Tiempo completo",
                "description": description,
                "application_url": full_url,
                "source": "computrabajo",
                "is_active": True,
                "tags": [slug.replace("-", " ")],
            })

        if not page_jobs:
            break

        jobs.extend(page_jobs)
        print(f"  [{slug}] página {page}: {len(page_jobs)} ofertas")
        time.sleep(1.5)

    return jobs


def main():
    all_jobs = []

    for slug, rubro in CATEGORIES:
        print(f"\nRastreando: {slug} ({rubro})")
        jobs = scrape_category(slug, rubro, max_pages=5)
        all_jobs.extend(jobs)

        time.sleep(2)

    summary = OpportunitySink().upsert(all_jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== Computrabajo: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas "
        f"de {summary.found} encontradas ==="
    )
    for error in summary.errors[:5]:
        print(f"  ERROR: {error}")


if __name__ == "__main__":
    main()
