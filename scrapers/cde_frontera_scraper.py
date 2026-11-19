"""Ciudad del Este, Alto Paraná, Saltos del Guairá, Encarnación y frontera — portales de RRHH."""
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

SOURCE = "cde_frontera_py"

# (key, url, organization, rubro, location)
EMPRESAS = [
    ("shopping_del_este", "https://www.shoppingdeleste.com.py/trabaja-con-nosotros", "Shopping del Este (CDE)", "Retail / Mall", "Ciudad del Este"),
    ("foca_py", "https://www.foca.com.py/trabaja-con-nosotros", "FOCA (CDE)", "Retail / Importaciones", "Ciudad del Este"),
    ("monalisa_py", "https://www.monalisa.com.py/trabaja-con-nosotros", "Casa Monalisa CDE", "Retail / Electrónica", "Ciudad del Este"),
    ("city_electronique", "https://www.cityelectronique.com.py/trabaja-con-nosotros", "City Electronique", "Retail Electrónica", "Ciudad del Este"),
    ("saltos_guaira_py", "https://www.municipalidaddesaltosdeguaira.gov.py/empleos", "Municipalidad Saltos del Guairá", "Gobierno Local", "Saltos del Guairá"),
    ("itaipu_cde", "https://www.itaipu.gov.py/empleo", "Itaipú Binacional (CDE)", "Energía", "Ciudad del Este"),
    ("mec_alto_parana", "https://www.mec.gov.py/cms/index.php?module=concurso&region=alto_parana", "MEC Alto Paraná", "Educación Pública", "Alto Paraná"),
    ("encarnacion_municipio", "https://www.encarnacion.gov.py/empleos", "Municipalidad de Encarnación", "Gobierno Local", "Encarnación"),
    ("iquitos_py", "https://www.iquitos.com.py/trabaja-con-nosotros", "Iquitos Paraguay", "Retail / Importaciones", "Ciudad del Este"),
    ("grupo_casino_py", "https://www.casinopy.com/trabaja-con-nosotros", "Casino Paraguay (CDE)", "Entretenimiento", "Ciudad del Este"),
    ("hernandarias_municipio", "https://www.hernandarias.gov.py/empleos", "Municipalidad de Hernandarias", "Gobierno Local", "Alto Paraná"),
]

JOB_SELECTORS = [
    ".job", ".oportunidad", ".vacante", ".career", "article",
    ".item-vacante", ".puesto", "li.offer", ".listing-item",
    ".empleo", ".convocatoria", ".position",
]
LINK_KEYWORDS = ["vacante", "empleo", "trabaja", "trabajo", "oportunidad", "cargo", "plaza", "puesto", "carrera", "concurso"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def scrape_empresa(key, url, org, rubro, location):
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    # Try structured job items first
    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, .puesto, .cargo, .job-title")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                if not title or len(title) < 5:
                    continue
                link_el = item.select_one("a[href]")
                job_url = ""
                if link_el:
                    href = link_el.get("href", "")
                    job_url = href if href.startswith("http") else f"{url.rstrip('/')}/{href.lstrip('/')}"
                if not job_url:
                    job_url = f"{url}#{title[:40].replace(' ', '-').lower()}"
                jobs.append({
                    "title": title,
                    "organization": org,
                    "location": location,
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": SOURCE,
                    "is_active": True,
                    "tags": [key, rubro.lower(), "frontera"],
                })
            if jobs:
                break

    # Fallback: look for links with job keywords
    if not jobs:
        for a in soup.select("a[href]"):
            text = a.get_text(strip=True)
            href = a.get("href", "")
            if not text or len(text) < 6 or len(text) > 120:
                continue
            if any(kw in text.lower() or kw in href.lower() for kw in LINK_KEYWORDS):
                job_url = href if href.startswith("http") else url
                jobs.append({
                    "title": text,
                    "organization": org,
                    "location": location,
                    "rubro": rubro,
                    "type": "Tiempo completo",
                    "description": "",
                    "application_url": job_url,
                    "source": SOURCE,
                    "is_active": True,
                    "tags": [key, rubro.lower(), "frontera"],
                })

    # Last resort: insert a generic entry so the org is tracked
    if not jobs:
        jobs.append({
            "title": f"Ver empleos en {org}",
            "organization": org,
            "location": location,
            "rubro": rubro,
            "type": "Tiempo completo",
            "description": f"Visitá el portal de empleos de {org} para ver las vacantes disponibles.",
            "application_url": url,
            "source": SOURCE,
            "is_active": True,
            "tags": [key, rubro.lower(), "frontera"],
        })

    # Dedup by URL
    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)
    return unique[:20]


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


def main():
    import urllib3
    urllib3.disable_warnings()
    all_jobs = []
    for key, url, org, rubro, location in EMPRESAS:
        jobs = scrape_empresa(key, url, org, rubro, location)
        print(f"[{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[cde_frontera] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
