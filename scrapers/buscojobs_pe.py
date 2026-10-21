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

CATEGORIES = [
    ("ts1030", "trabajo-de-ventas",                       "Ventas y Comercial"),
    ("ts1008", "trabajo-de-atencion-al-cliente",          "Atención al Cliente"),
    ("ts1037", "trabajo-de-oficios",                      "Oficios y Construcción"),
    ("ts1019", "trabajo-de-gestion",                      "Gestión y Gerencia"),
    ("ts1002", "trabajo-de-administracion",               "Administración"),
    ("ts1010", "trabajo-de-distribucion",                 "Logística y Transporte"),
    ("ts1011", "trabajo-de-educacion",                    "Educación"),
    ("ts1012", "trabajo-de-ingenieria",                   "Ingeniería"),
    ("ts1014", "trabajo-de-negocios",                     "Negocios"),
    ("ts1031", "trabajo-de-ciencias",                     "Ciencia e Investigación"),
    ("ts1005", "trabajo-de-arte-creatividad",             "Arte y Creatividad"),
    ("ts1006", "trabajo-de-desarrollo-empresarial",       "Desarrollo Empresarial"),
    ("ts1009", "trabajo-de-diseno",                       "Diseño"),
    ("ts1015", "trabajo-de-atencion-medica",              "Salud y Medicina"),
    ("ts1017", "trabajo-de-tecnologia-de-la-informacion", "Tecnología e IT"),
    ("ts29",   "trabajo-de-otros",                        "General"),
]

BASE_URL = "https://www.buscojobs.pe"


def fetch_page(category_code, slug, page=1):
    url = f"{BASE_URL}/ofertas/{category_code}/{slug}"
    if page > 1:
        url += f"/{page}"
    h = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
        "Referer": "https://www.buscojobs.pe/",
    }
    try:
        r = requests.get(url, headers=h, timeout=30)
        if r.status_code == 200:
            return r.text
        print(f"  HTTP {r.status_code} en {url}")
        return None
    except Exception as e:
        print(f"  fetch error: {e}")
        return None


def extract_jobs(html):
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
        page_props = data.get('props', {}).get('pageProps', {})

        for key in ['resultadosIniciales', 'initialData', 'ofertas', 'jobs', 'results', 'data', 'items', 'vacantes']:
            if key not in page_props:
                continue
            val = page_props[key]
            if isinstance(val, list) and val:
                return val
            if isinstance(val, dict):
                for sub in ['ofertas', 'items', 'results', 'data', 'jobs', 'vacantes']:
                    sub_val = val.get(sub)
                    if isinstance(sub_val, list) and sub_val:
                        return sub_val

        job_id_keys = {'CargoVacante', 'Titulo', 'title', 'IdOferta', 'id', 'titulo', 'cargo'}
        for key, val in page_props.items():
            if isinstance(val, list) and val and isinstance(val[0], dict):
                if job_id_keys & set(val[0].keys()):
                    print(f"  [buscojobs_pe] found jobs under pageProps.{key} ({len(val)} items)")
                    return val

        for key, val in page_props.items():
            if not isinstance(val, dict):
                continue
            for sub_key, sub_val in val.items():
                if isinstance(sub_val, list) and sub_val and isinstance(sub_val[0], dict):
                    if job_id_keys & set(sub_val[0].keys()):
                        print(f"  [buscojobs_pe] found jobs under pageProps.{key}.{sub_key} ({len(sub_val)} items)")
                        return sub_val

        print(f"  [buscojobs_pe] no job list found; pageProps keys: {list(page_props.keys())[:15]}")
        return []
    except (json.JSONDecodeError, KeyError) as e:
        print(f"  [buscojobs_pe] extract error: {e}")
        return []


def insert_job(job_raw, rubro):
    title = job_raw.get('CargoVacante', '') or job_raw.get('Titulo', '') or job_raw.get('title', '')
    if not title:
        return None

    job_id = job_raw.get('IdOferta', '') or job_raw.get('id', '')
    url = f"https://www.buscojobs.pe/oferta/{job_id}" if job_id else ''
    if not url:
        return None

    company = job_raw.get('NombreEmpresa', '') or job_raw.get('Empresa', '') or job_raw.get('company', '')
    ciudad_obj = job_raw.get('Ciudad') or {}
    depto_obj = job_raw.get('Departamento') or {}
    ciudad = ciudad_obj.get('Nombre', '') if isinstance(ciudad_obj, dict) else str(ciudad_obj)
    depto = depto_obj.get('Nombre', '') if isinstance(depto_obj, dict) else str(depto_obj)
    location = f"{ciudad}, {depto}".strip(', ') or "Perú"
    description = job_raw.get('Descripcion', '') or job_raw.get('description', '')

    payload = {
        "title": title,
        "organization": company or None,
        "location": location,
        "city": ciudad or None,
        "department": depto or None,
        "country_code": "PE",
        "rubro": rubro,
        "type": "Tiempo completo",
        "opportunity_type": "job",
        "description": description[:800] if description else "",
        "application_url": url,
        "source": "buscojobs_pe",
        "source_authority": "aggregator",
        "original_source_verified": True,
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
        seen_page_ids = set()
        max_pages = int(os.getenv("CVITAE_MAX_PAGES", "50"))
        for page in range(1, max_pages + 1):
            html = fetch_page(code, slug, page)
            if not html:
                print(f"  página {page}: sin respuesta")
                break

            jobs = extract_jobs(html)
            if not jobs:
                print(f"  página {page}: sin ofertas (fin de paginación o sin Next.js data)")
                break
            page_ids = {str(job.get('IdOferta', '') or job.get('id', '')) for job in jobs}
            page_ids.discard('')
            if page_ids and page_ids.issubset(seen_page_ids):
                print(f"  página {page}: repetida; continuación detenida de forma explícita")
                break
            seen_page_ids.update(page_ids)

            total_found += len(jobs)
            for job in jobs:
                status = insert_job(job, rubro)
                if status in (200, 201, 409):
                    total_inserted += 1
                title = job.get('CargoVacante', job.get('Titulo', '?'))
                print(f"  [{title[:45]}] -> {status}")

            time.sleep(1)
        else:
            print(f"  presupuesto de {max_pages} páginas agotado; cobertura pendiente, no EOF")

        time.sleep(1.5)

    print(f"\n=== BuscoJobs PE: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
