"""Portales de empleo locales paraguayos — ZonaJobs, Trabajos.com.py, EmpleosPublicos, MTESS."""
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
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

SOURCE = "bolsas_locales_py"

RUBRO_KEYWORDS = {
    "tecnología": ["developer", "programador", "sistemas", "it ", "tech", "software", "datos", "devops", "analista de sistemas"],
    "salud": ["médico", "enfermero", "farmacia", "salud", "odontólogo", "psicólogo", "nutricionista"],
    "educación": ["docente", "profesor", "maestro", "tutor", "educación", "pedagogía"],
    "finanzas": ["contador", "finanzas", "auditor", "tesorero", "contable", "cpa"],
    "logística": ["logística", "almacén", "transporte", "depósito", "conductor", "cadena de suministro"],
    "comercial": ["ventas", "comercial", "ejecutivo de cuenta", "asesor comercial", "vendedor"],
    "rrhh": ["recursos humanos", "rrhh", "selección", "talento humano"],
    "marketing": ["marketing", "comunicación", "publicidad", "diseñador", "community"],
    "administración": ["administración", "administrador", "asistente", "secretaria", "recepcionista"],
    "ingeniería": ["ingeniero", "técnico", "mecánico", "eléctrico", "civil", "industrial"],
}


def infer_rubro(title: str) -> str:
    title_lower = title.lower()
    for rubro, keywords in RUBRO_KEYWORDS.items():
        if any(kw in title_lower for kw in keywords):
            return rubro.capitalize()
    return "General"


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
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
        print(f"  insert error: {e}")
        return "error"


# ---------------------------------------------------------------------------
# 1. ZonaJobs Paraguay
# ---------------------------------------------------------------------------

def scrape_zonajobs(max_pages: int = 5) -> list:
    """Scrape ZonaJobs Paraguay (https://www.zonajobs.com.py)."""
    base_url = "https://www.zonajobs.com.py/empleos/"
    jobs = []
    seen = set()

    JOB_SELECTORS = [
        "article.aviso", ".aviso", ".job-listing", ".search-result",
        ".listado-aviso", "li.aviso", ".oferta", "article",
    ]

    for page in range(1, max_pages + 1):
        url = base_url if page == 1 else f"{base_url}?pagina={page}"
        html = fetch(url)
        if not html:
            break
        soup = BeautifulSoup(html, "html.parser")
        page_jobs = []

        for sel in JOB_SELECTORS:
            items = soup.select(sel)
            if not items:
                continue
            for item in items:
                title_el = item.select_one("h2, h3, h4, .titulo, .title, .aviso-title, .job-title")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                link_el = item.select_one("a[href]")
                job_url = ""
                if link_el:
                    href = link_el.get("href", "")
                    job_url = href if href.startswith("http") else f"https://www.zonajobs.com.py{href}"
                if not job_url or job_url in seen:
                    continue
                org_el = item.select_one(".empresa, .company, .organization, .empleador")
                org = org_el.get_text(strip=True) if org_el else "Empresa confidencial"
                loc_el = item.select_one(".ubicacion, .location, .ciudad")
                location = loc_el.get_text(strip=True) if loc_el else "Paraguay"
                seen.add(job_url)
                page_jobs.append({
                    "title": title,
                    "organization": org,
                    "location": location,
                    "rubro": infer_rubro(title),
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": SOURCE,
                    "is_active": True,
                    "tags": ["zonajobs", "paraguay"],
                })
            if page_jobs:
                break

        if not page_jobs:
            break

        jobs.extend(page_jobs)
        print(f"  [zonajobs] pag {page}: {len(page_jobs)} empleos")

    return jobs


# ---------------------------------------------------------------------------
# 2. Trabajos.com.py
# ---------------------------------------------------------------------------

def scrape_trabajos_com_py(max_pages: int = 5) -> list:
    """Scrape Trabajos.com.py (https://www.trabajos.com.py)."""
    base_url = "https://www.trabajos.com.py/empleos/"
    jobs = []
    seen = set()

    JOB_SELECTORS = [
        ".job", ".empleo", ".oferta", ".listing", "article",
        ".job-card", ".result-item", "li.job-item",
    ]

    for page in range(1, max_pages + 1):
        url = base_url if page == 1 else f"{base_url}?page={page}"
        html = fetch(url)
        if not html:
            break
        soup = BeautifulSoup(html, "html.parser")
        page_jobs = []

        for sel in JOB_SELECTORS:
            items = soup.select(sel)
            if not items:
                continue
            for item in items:
                title_el = item.select_one("h2, h3, h4, .titulo, .title, .job-title")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                link_el = item.select_one("a[href]")
                job_url = ""
                if link_el:
                    href = link_el.get("href", "")
                    job_url = href if href.startswith("http") else f"https://www.trabajos.com.py{href}"
                if not job_url or job_url in seen:
                    continue
                org_el = item.select_one(".empresa, .company, .organization")
                org = org_el.get_text(strip=True) if org_el else "Empresa confidencial"
                loc_el = item.select_one(".ubicacion, .location, .ciudad")
                location = loc_el.get_text(strip=True) if loc_el else "Paraguay"
                seen.add(job_url)
                page_jobs.append({
                    "title": title,
                    "organization": org,
                    "location": location,
                    "rubro": "General",
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": SOURCE,
                    "is_active": True,
                    "tags": ["trabajos.com.py", "paraguay"],
                })
            if page_jobs:
                break

        if not page_jobs:
            break

        jobs.extend(page_jobs)
        print(f"  [trabajos.com.py] pag {page}: {len(page_jobs)} empleos")

    return jobs


# ---------------------------------------------------------------------------
# 3. EmpleosPublicos.gov.py
# ---------------------------------------------------------------------------

def scrape_empleos_publicos() -> list:
    """Scrape portal oficial de empleos públicos del Estado paraguayo."""
    url = "https://www.empleospublicos.gov.py/convocatorias"
    html = fetch(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    seen = set()

    JOB_SELECTORS = [
        ".convocatoria", ".llamado", ".concurso", ".vacante",
        "article", ".job", ".card", "tr.convocatoria", "li.convocatoria",
    ]

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if not items:
            continue
        for item in items:
            title_el = item.select_one("h2, h3, h4, .titulo, .title, .cargo, td.cargo")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 5:
                continue
            link_el = item.select_one("a[href]")
            job_url = ""
            if link_el:
                href = link_el.get("href", "")
                job_url = href if href.startswith("http") else f"https://www.empleospublicos.gov.py{href}"
            if not job_url or job_url in seen:
                continue
            org_el = item.select_one(".institucion, .organization, .organismo, td.institucion")
            org = org_el.get_text(strip=True) if org_el else "Estado Paraguayo"
            seen.add(job_url)
            jobs.append({
                "title": title,
                "organization": org,
                "location": "Paraguay",
                "rubro": "Sector Público",
                "type": "Tiempo completo",
                "description": "",
                "application_url": job_url,
                "source": SOURCE,
                "is_active": True,
                "tags": ["estado", "sector público", "empleos públicos"],
            })
        if jobs:
            break

    print(f"  [empleos_publicos] encontradas: {len(jobs)}")
    return jobs


# ---------------------------------------------------------------------------
# 4. Portal del Empleo MTESS
# ---------------------------------------------------------------------------

def scrape_mtess() -> list:
    """Scrape Portal del Empleo del Ministerio de Trabajo (MTESS)."""
    url = "https://www.trabajo.gov.py/portaldelempleo/buscar-empleo"
    html = fetch(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    seen = set()

    JOB_SELECTORS = [
        ".empleo", ".oferta", ".vacante", ".job", ".listing",
        "article", ".card", ".resultado", "li.oferta",
    ]

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if not items:
            continue
        for item in items:
            title_el = item.select_one("h2, h3, h4, .titulo, .title, .cargo, .puesto")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)
            if not title or len(title) < 5:
                continue
            link_el = item.select_one("a[href]")
            job_url = ""
            if link_el:
                href = link_el.get("href", "")
                job_url = href if href.startswith("http") else f"https://www.trabajo.gov.py{href}"
            if not job_url or job_url in seen:
                continue
            org_el = item.select_one(".empresa, .organization, .empleador")
            org = org_el.get_text(strip=True) if org_el else "Empresa confidencial"
            loc_el = item.select_one(".ubicacion, .location, .ciudad")
            location = loc_el.get_text(strip=True) if loc_el else "Paraguay"
            seen.add(job_url)
            jobs.append({
                "title": title,
                "organization": org,
                "location": location,
                "rubro": "General",
                "type": "Tiempo completo",
                "description": "",
                "application_url": job_url,
                "source": SOURCE,
                "is_active": True,
                "tags": ["mtess", "ministerio", "paraguay"],
            })
        if jobs:
            break

    print(f"  [mtess] encontradas: {len(jobs)}")
    return jobs


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import urllib3
    urllib3.disable_warnings()

    all_jobs = []

    print("[zonajobs] Scrapeando ZonaJobs Paraguay...")
    all_jobs.extend(scrape_zonajobs())

    print("[trabajos.com.py] Scrapeando Trabajos.com.py...")
    all_jobs.extend(scrape_trabajos_com_py())

    print("[empleos_publicos] Scrapeando EmpleosPublicos.gov.py...")
    all_jobs.extend(scrape_empleos_publicos())

    print("[mtess] Scrapeando Portal del Empleo MTESS...")
    all_jobs.extend(scrape_mtess())

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[bolsas_locales] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
