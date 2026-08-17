import requests
from bs4 import BeautifulSoup
import time
import os
import re
import json
import html as html_mod
from concurrent.futures import ThreadPoolExecutor, as_completed

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

# Set COMPUTRABAJO_FETCH_DETAILS=false to skip detail page fetching (faster, less data)
FETCH_DETAILS = os.environ.get("COMPUTRABAJO_FETCH_DETAILS", "true").lower() != "false"
DETAIL_WORKERS = int(os.environ.get("COMPUTRABAJO_DETAIL_WORKERS", "4"))

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


def _strip_html(text):
    """Remove HTML tags and decode entities from a string."""
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html_mod.unescape(text)
    return re.sub(r" {2,}", " ", text).strip()


def fetch_detail(url):
    """Fetch a job detail page to get description and company name.
    Computrabajo renders its pages as SPAs — the visible HTML lacks the job body.
    The real content lives in an application/ld+json <script> with @type:JobPosting.
    CSS selectors are kept as fallbacks for edge cases.
    Never invents data — returns empty strings when not found."""
    raw_html = fetch(url)
    if not raw_html:
        return {"description": "", "organization": ""}

    soup = BeautifulSoup(raw_html, "html.parser")
    description = ""
    organization = ""

    # Primary: extract from JSON-LD JobPosting (works on JS-rendered pages where HTML body is empty)
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        items = data.get("@graph", [data]) if isinstance(data, dict) else []
        for item in items:
            if item.get("@type") != "JobPosting":
                continue
            raw_desc = item.get("description", "")
            if raw_desc:
                desc = _strip_html(raw_desc)[:3000]
                if len(desc) > 50:
                    description = desc
            org_data = item.get("hiringOrganization", {})
            if isinstance(org_data, dict):
                organization = org_data.get("name", "").strip()
            elif isinstance(org_data, str):
                organization = org_data.strip()
            if description:
                break

    # Fallback: CSS selectors for description (legacy layout / non-SPA pages)
    if not description:
        for sel in [
            "div#offerDec",
            "div.offerDesc",
            "div[data-qa='job-description']",
            "section.boxDescription",
            "div.js-description",
            "div[class*='description']",
        ]:
            el = soup.select_one(sel)
            if el:
                for tag in el.find_all(["script", "style"]):
                    tag.decompose()
                text = el.get_text(separator="\n", strip=True)
                if len(text) > 50:
                    description = text[:3000]
                    break

    # Fallback: CSS selectors for organization
    if not organization:
        company_el = soup.select_one("h2 a[href*='/empresas/'], a.it_bold[href*='/empresas/']")
        if company_el:
            organization = company_el.get_text(strip=True)
        else:
            for sel in ["p.dFlex > a", "div[class*='company'] a", "h3 a[href*='empresa']", "p.fs16 a"]:
                el = soup.select_one(sel)
                if el:
                    text = el.get_text(strip=True)
                    if text and len(text) > 1:
                        organization = text
                        break

    return {"description": description, "organization": organization}


def enrich_with_details(jobs):
    """Fetch detail pages concurrently for jobs missing description or organization."""
    to_enrich = [
        (i, j) for i, j in enumerate(jobs)
        if not (j.get("description") and len(j["description"]) >= 50) or not j.get("organization")
    ]
    if not to_enrich:
        return jobs

    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        futures = {executor.submit(fetch_detail, j["application_url"]): i for i, j in to_enrich}
        for future in as_completed(futures):
            idx = futures[future]
            try:
                detail = future.result()
                if detail["description"] and not (jobs[idx].get("description") and len(jobs[idx]["description"]) >= 50):
                    jobs[idx]["description"] = detail["description"]
                if detail["organization"] and not jobs[idx].get("organization"):
                    jobs[idx]["organization"] = detail["organization"]
            except Exception as e:
                print(f"  detail enrich error for job at index {idx}: {e}")

    time.sleep(1.5)
    return jobs


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

            page_jobs.append({
                "title": title,
                "organization": company,
                "location": location,
                "rubro": rubro,
                "type": "",
                "description": "",
                "application_url": full_url,
                "source": "computrabajo",
                "is_active": True,
                "tags": [slug.replace("-", " ")],
            })

        if not page_jobs:
            break

        if FETCH_DETAILS:
            page_jobs = enrich_with_details(page_jobs)

        jobs.extend(page_jobs)
        enriched = sum(1 for j in page_jobs if j.get("description"))
        print(f"  [{slug}] página {page}: {len(page_jobs)} ofertas, {enriched} con descripción")
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
