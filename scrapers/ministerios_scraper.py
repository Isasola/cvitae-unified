"""Ministerios del Paraguay — portales de RRHH y convocatorias."""
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

MINISTERIOS = [
    ("MEC", "https://www.mec.gov.py/cms/index.php?module=concurso", "Ministerio de Educación y Ciencias"),
    ("MSP", "https://www.mspbs.gov.py/convocatorias.html", "Ministerio de Salud Pública"),
    ("MOPC", "https://www.mopc.gov.py/index.php/institucional/recursos-humanos", "Ministerio de Obras Públicas"),
    ("MH", "https://www.hacienda.gov.py/web-hacienda/index.php?c=concursos", "Ministerio de Hacienda"),
    ("MAG", "https://www.mag.gov.py/index.php/noticias/concursos-convocatorias", "Ministerio de Agricultura"),
    ("STP", "https://www.stp.gov.py/v1/convocatorias/", "Secretaría Técnica de Planificación"),
    ("MUVH", "https://www.muvh.gov.py/index.php/recursos-humanos", "Ministerio de Urbanismo"),
    ("MIC", "https://www.mic.gov.py/mic/w/convocatorias.html", "Ministerio de Industria y Comercio"),
    ("MRREE", "https://www.mre.gov.py/index.php/convocatorias", "Ministerio de Relaciones Exteriores"),
    ("MT", "https://www.trabajo.gov.py/convocatorias", "Ministerio del Trabajo"),
    ("MINJUS", "https://www.minjusticia.gov.py/convocatoria", "Ministerio de Justicia"),
    ("MDS", "https://www.mds.gov.py/index.php/recursos-humanos", "Ministerio de Desarrollo Social"),
    ("MNI", "https://www.mni.gov.py/convocatorias", "Ministerio del Interior"),
    ("MD", "https://www.fuerzas.mil.py/convocatorias", "Ministerio de Defensa"),
    ("SEAM", "https://www.mades.gov.py/convocatorias/", "Ministerio del Ambiente (MADES)"),
]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r.text if r.status_code == 200 else ""
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return ""


def parse_ministry(html, base_url, key, org_name):
    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    link_keywords = ["concurso", "convocatoria", "vacante", "cargo", "llamado", "empleo", "puesto"]
    for link in soup.select("a[href]"):
        text = link.get_text(strip=True)
        href = link.get("href", "")
        if not text or len(text) < 8 or len(text) > 150:
            continue
        text_lower = text.lower()
        href_lower = href.lower()
        if not any(kw in text_lower or kw in href_lower for kw in link_keywords):
            continue
        if not href:
            continue
        url = href if href.startswith("http") else (
            base_url.rstrip("/") + "/" + href.lstrip("/") if href.startswith("/") else base_url + href
        )
        jobs.append({
            "title": text,
            "organization": org_name,
            "location": "Paraguay",
            "rubro": "Gobierno / Sector Público",
            "type": "Tiempo completo",
            "description": "",
            "application_url": url,
            "source": f"ministerio_{key.lower()}",
            "is_active": True,
            "tags": ["gobierno", "ministerio", key.lower()],
        })
    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)
    return unique


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
    for key, url, org in MINISTERIOS:
        html = fetch(url)
        if not html:
            print(f"[{key}] Sin respuesta")
            continue
        jobs = parse_ministry(html, url, key, org)
        print(f"[{key}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[ministerios] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
