"""
Get on Board — API pública oficial, sin autenticación.
Docs: https://api-doc.getonbrd.com
Endpoint: GET https://api.getonbrd.com/v0/jobs
Formato: JSON:API (data[], included[])

Estrategia: paginamos todos los empleos y filtramos por país PY/PE/LATAM.
Para remotos sin país: los incluimos con country_code vacío (gates deciden).
"""
import requests
import time
import json
import os

from opportunity_sink import OpportunitySink

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

BASE_API = "https://api.getonbrd.com/v0"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "CVitae/1.0 (cvitae.lat; contacto@cvitae.lat)",
}

# Países que nos interesan — incluimos null/vacío para remotos globales
ALLOWED_COUNTRY_CODES = {"PY", "PE", "AR", "BO", "UY", ""}

MAX_PAGES = 20  # 20 páginas × 25 items/página = hasta 500 empleos
PER_PAGE = 25


def fetch_page(page: int) -> dict:
    url = f"{BASE_API}/jobs"
    params = {"per_page": PER_PAGE, "page": page, "expand[]": "company"}
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 429:
            print(f"  Rate limit en página {page}, esperando 10s...")
            time.sleep(10)
            return {}
        print(f"  HTTP {r.status_code} en página {page}")
        return {}
    except Exception as e:
        print(f"  Error en página {page}: {e}")
        return {}


def extract_company(job: dict, included: list) -> str:
    """Extrae el nombre de empresa desde relationships + included."""
    try:
        company_rel = job.get("relationships", {}).get("company", {}).get("data", {})
        if not company_rel:
            return ""
        company_id = str(company_rel.get("id", ""))
        for inc in included:
            if inc.get("type") == "companies" and str(inc.get("id", "")) == company_id:
                return inc.get("attributes", {}).get("name", "")
    except Exception:
        pass
    return ""


def build_item(job: dict, included: list) -> dict | None:
    attrs = job.get("attributes", {})
    title = (attrs.get("title") or "").strip()
    if not title:
        return None

    # URL de postulación
    app_url = (attrs.get("applications_url") or attrs.get("url") or "").strip()
    if not app_url:
        return None

    company = extract_company(job, included) or (attrs.get("company_name") or "").strip()

    # Geolocalización
    country_code = (attrs.get("country_code") or attrs.get("country_code_abbreviation") or "").upper().strip()
    city = (attrs.get("city") or "").strip()
    location = city or (attrs.get("country") or "").strip()

    # Filtro: solo LATAM + remotos globales
    if country_code and country_code not in ALLOWED_COUNTRY_CODES:
        return None

    description = (attrs.get("description") or attrs.get("functions") or "").strip()
    # Limpia HTML básico
    import re
    description = re.sub(r"<[^>]+>", " ", description)
    description = re.sub(r"\s{2,}", " ", description).strip()[:3000]

    # Tipo de oportunidad
    remote_modality = (attrs.get("remote_modality") or "").lower()
    remote = remote_modality in ("full", "partial", "remote")

    tags = []
    if attrs.get("category"):
        tags.append(str(attrs["category"]).lower().replace("-", " "))
    if remote:
        tags.append("remoto")
    if country_code:
        tags.append(country_code.lower())

    return {
        "title": title,
        "organization": company,
        "location": location,
        "description": description,
        "application_url": app_url,
        "source_url": app_url,
        "source": "getonboard",
        "source_authority": "aggregator",
        "original_source_verified": True,
        "is_active": True,
        "country_code": country_code,
        "remote": remote,
        "opportunity_kind": "job",
        "tags": tags,
    }


def scrape() -> list[dict]:
    jobs = []
    page = 1
    total_found = 0
    filtered_out = 0

    print("Iniciando Get on Board scraper...")

    while page <= MAX_PAGES:
        print(f"  Página {page}/{MAX_PAGES}...")
        data = fetch_page(page)

        if not data:
            print(f"  Sin datos en página {page}, deteniendo.")
            break

        items = data.get("data", [])
        included = data.get("included", [])

        if not items:
            print(f"  Página {page} vacía, fin de resultados.")
            break

        # Primer página: log de estructura para diagnóstico
        if page == 1 and items:
            first = items[0]
            print(f"  Estructura item: type={first.get('type')}, attrs={list(first.get('attributes',{}).keys())[:10]}")

        total_found += len(items)
        for job in items:
            item = build_item(job, included)
            if item:
                jobs.append(item)
            else:
                filtered_out += 1

        # Paginación: si la respuesta tiene meta/links usarlos, si no, avanzar
        meta = data.get("meta", {})
        total_pages = meta.get("total_pages") or meta.get("pages")
        if total_pages and page >= int(total_pages):
            break

        links = data.get("links", {})
        if links and not links.get("next"):
            break

        page += 1
        time.sleep(1)

    print(f"  Total encontrados: {total_found} | Filtrados (otros países): {filtered_out} | A ingestar: {len(jobs)}")
    return jobs


def main():
    jobs = scrape()
    summary = OpportunitySink().upsert(jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== Get on Board: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.rejected} rechazadas de {summary.found} encontradas ==="
    )
    for error in summary.errors[:5]:
        print(f"  ERROR: {error}")


if __name__ == "__main__":
    main()
