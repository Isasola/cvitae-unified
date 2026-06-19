import requests
import json
import re
import time
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

# Full category list discovered from BuscoJobs homepage
CATEGORIES = [
    ("ts1030", "trabajo-de-ventas",                     "Ventas y Comercial"),
    ("ts1008", "trabajo-de-atencion-al-cliente",        "Atención al Cliente"),
    ("ts1037", "trabajo-de-oficios",                    "Oficios y Construcción"),
    ("ts1019", "trabajo-de-gestion",                    "Gestión y Gerencia"),
    ("ts1002", "trabajo-de-administracion",             "Administración"),
    ("ts1010", "trabajo-de-distribucion",               "Logística y Transporte"),
    ("ts1011", "trabajo-de-educacion",                  "Educación"),
    ("ts1012", "trabajo-de-ingenieria",                 "Ingeniería"),
    ("ts1014", "trabajo-de-negocios",                   "Negocios"),
    ("ts1031", "trabajo-de-ciencias",                   "Ciencia e Investigación"),
    ("ts1005", "trabajo-de-arte-creatividad",           "Diseño"),
    ("ts1006", "trabajo-de-desarrollo-empresarial",     "Desarrollo Empresarial"),
    ("ts1009", "trabajo-de-diseno",                     "Diseño"),
    ("ts1015", "trabajo-de-atencion-medica",            "Salud y Medicina"),
    ("ts1017", "trabajo-de-tecnologia-de-la-informacion", "Tecnología e IT"),
    ("ts29",   "trabajo-de-otros",                      "General"),
]

BASE_URL = "https://www.buscojobs.com.py"


def fetch_page(category_code, slug, page=1):
    url = f"{BASE_URL}/ofertas/{category_code}/{slug}"
    if page > 1:
        url += f"/{page}"
    h = {"User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(url, headers=h, timeout=30)
        return r.text if r.status_code == 200 else None
    except Exception as e:
        print(f"  fetch error: {e}")
        return None


def extract_jobs(html):
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
        # Try multiple known paths in the Next.js data structure
        page_props = data.get('props', {}).get('pageProps', {})
        for key in ['resultadosIniciales', 'initialData', 'ofertas']:
            if key in page_props:
                val = page_props[key]
                if isinstance(val, list):
                    return val
                if isinstance(val, dict) and 'ofertas' in val:
                    return val['ofertas']
        return []
    except (json.JSONDecodeError, KeyError):
        return []


def insert_job(job_raw, rubro):
    title = job_raw.get('CargoVacante', '') or job_raw.get('Titulo', '') or job_raw.get('title', '')
    if not title:
        return None

    job_id = job_raw.get('IdOferta', '') or job_raw.get('id', '')
    url = f"https://www.buscojobs.com.py/oferta/{job_id}" if job_id else ''
    if not url:
        return None

    company = job_raw.get('NombreEmpresa', '') or job_raw.get('Empresa', '') or job_raw.get('company', '')
    ciudad_obj = job_raw.get('Ciudad') or {}
    depto_obj = job_raw.get('Departamento') or {}
    ciudad = ciudad_obj.get('Nombre', '') if isinstance(ciudad_obj, dict) else str(ciudad_obj)
    depto = depto_obj.get('Nombre', '') if isinstance(depto_obj, dict) else str(depto_obj)
    location = f"{ciudad}, {depto}".strip(', ') or "Paraguay"
    description = job_raw.get('Descripcion', '') or job_raw.get('description', '')

    payload = {
        "titulo": title,
        "organization": company,
        "location": location,
        "rubro": rubro,
        "type": "Tiempo completo",
        "description": description[:800] if description else "",
        "application_url": url,
        "source": "buscojobs",
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
        print(f"  insert error: {e}")
        return "error"


def main():
    total_found = 0
    total_inserted = 0

    for code, slug, rubro in CATEGORIES:
        print(f"\nCategoría: {rubro} ({code}/{slug})")
        for page in range(1, 4):
            html = fetch_page(code, slug, page)
            if not html:
                print(f"  página {page}: sin respuesta")
                break

            jobs = extract_jobs(html)
            if not jobs:
                print(f"  página {page}: sin ofertas (fin de paginación o sin Next.js data)")
                break

            total_found += len(jobs)
            for job in jobs:
                status = insert_job(job, rubro)
                if status in (200, 201, 409):
                    total_inserted += 1
                title = job.get('CargoVacante', job.get('Titulo', '?'))
                print(f"  [{title[:45]}] -> {status}")

            time.sleep(1)

        time.sleep(1.5)

    print(f"\n=== BuscoJobs: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
