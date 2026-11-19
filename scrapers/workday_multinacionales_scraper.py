"""Multinacionales con presencia en Paraguay — API JSON de Workday."""
import requests
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

SOURCE = "workday_multinacionales"

# PY country facet ID for Workday locationCountry filter
PY_COUNTRY_FACET = "db69d70c446c11de98360015c5e6daf6"

# Companies with CONFIRMED Workday tenant + PY locationCountry filter
# (source_id, api_base, board, company_name, rubro)
# Verified working: Tigo (2026-10-15) via POST to wday/cxs endpoint
EMPRESAS_DIRECT = [
    ("tigo_py", "tigo.wd103", "tigocareers", "Tigo Paraguay", "Telecomunicaciones"),
]

# Companies using text-search fallback (less reliable, may include non-PY jobs)
# (variable_name, company_id, company_name, rubro)
EMPRESAS_TEXT_SEARCH = [
    ("unilever_py", "unilever", "Unilever Paraguay", "Consumo Masivo"),
    ("nestle_py", "nestle", "Nestlé Paraguay", "Alimentación / Consumo"),
    ("mondelez_py", "mdlz", "Mondelez Paraguay", "Alimentación"),
    ("ab_inbev_py", "ab-inbev", "AB InBev / Brahma Paraguay", "Bebidas"),
    ("pg_py", "pg", "Procter & Gamble Paraguay", "Consumo Masivo"),
    ("pepsico_py", "pepsico", "PepsiCo Paraguay", "Bebidas / Alimentación"),
    ("3m_py", "3m", "3M Paraguay", "Industrial / Consumo"),
    ("jnj_py", "jnj", "Johnson & Johnson Paraguay", "Salud / Consumo"),
    ("reckitt_py", "reckitt", "Reckitt Paraguay", "Consumo Masivo"),
    ("coca_cola_py", "cocacola", "Coca-Cola (ANSA) Paraguay", "Bebidas"),
    ("cargill_wd", "cargill", "Cargill Paraguay (Workday)", "Agroindustria"),
    ("bunge_wd", "bunge", "Bunge Paraguay (Workday)", "Agroindustria"),
]

FETCH_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; CVitaeBot/1.0)",
}


def _make_row(title: str, organization: str, rubro: str, app_url: str, location: str = "Paraguay", description: str = "") -> dict:
    return {
        "title": title,
        "organization": organization,
        "location": location,
        "country_code": "PY",
        "rubro": rubro,
        "type": "Tiempo completo",
        "opportunity_type": "job",
        "description": description,
        "application_url": app_url,
        "source": SOURCE,
        "source_authority": "original",
        "original_source_verified": True,
        "is_active": True,
        "tags": ["multinacional", rubro.lower()],
    }


def fetch_workday_direct(source_id: str, api_base: str, board: str, company_name: str, rubro: str) -> list:
    """Fetch PY jobs using confirmed locationCountry facet filter."""
    url = f"https://{api_base}.myworkdayjobs.com/wday/cxs/{api_base.split('.')[0]}/{board}/jobs"
    payload = {
        "appliedFacets": {"locationCountry": [PY_COUNTRY_FACET]},
        "limit": 20,
        "offset": 0,
        "searchText": "",
    }
    result = []
    try:
        while True:
            r = requests.post(url, json=payload, headers=FETCH_HEADERS, timeout=20)
            if r.status_code != 200:
                print(f"  [{source_id}] HTTP {r.status_code}")
                break
            jobs = r.json().get("jobPostings", [])
            if not jobs:
                break
            for job in jobs:
                title = job.get("title", "")
                job_path = job.get("externalPath", "")
                if not title or not job_path:
                    continue
                app_url = f"https://{api_base}.myworkdayjobs.com/{board}{job_path}"
                location = job.get("locationsText", "Paraguay") or "Paraguay"
                result.append(_make_row(title, company_name, rubro, app_url, location))
            if len(jobs) < payload["limit"]:
                break
            payload["offset"] += len(jobs)
    except Exception as e:
        print(f"  [{source_id}] error: {e}")
    return result


def fetch_workday_jobs(company_id: str, company_name: str, rubro: str, search_text: str = "Paraguay") -> list:
    """Text-search fallback for companies without confirmed PY facet filter."""
    url = f"https://{company_id}.wd1.myworkdayjobs.com/wday/cxs/{company_id}/External/jobs"
    payload = {"limit": 20, "offset": 0, "searchText": search_text, "locations": []}
    try:
        result = []
        while True:
            r = requests.post(url, json=payload, headers=FETCH_HEADERS, timeout=20)
            if r.status_code != 200:
                return result
            jobs = r.json().get("jobPostings", [])
            if not jobs:
                return result
            page_added = 0
            for job in jobs:
                title = job.get("title", "")
                if not title:
                    continue
                job_path = job.get("externalPath", "")
                app_url = f"https://{company_id}.wd1.myworkdayjobs.com/External{job_path}" if job_path else ""
                if not app_url:
                    continue
                page_added += 1
                location = job.get("locationsText", "Paraguay") or "Paraguay"
                jd = job.get("jobDescription", {})
                description = jd.get("descriptor", "")[:500] if isinstance(jd, dict) else ""
                result.append(_make_row(title, company_name, rubro, app_url, location, description))
            if not page_added or len(jobs) < payload["limit"]:
                return result
            payload["offset"] += len(jobs)
    except Exception as e:
        print(f"  Workday error {company_id}: {e}")
        return []


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
    all_jobs = []

    # Companies with confirmed PY locationCountry filter (reliable)
    for source_id, api_base, board, company_name, rubro in EMPRESAS_DIRECT:
        jobs = fetch_workday_direct(source_id, api_base, board, company_name, rubro)
        print(f"[{source_id}] PY (locationCountry): {len(jobs)} resultados")
        all_jobs.extend(jobs)

    # Companies using text-search fallback
    for _var, company_id, company_name, rubro in EMPRESAS_TEXT_SEARCH:
        jobs = fetch_workday_jobs(company_id, company_name, rubro, search_text="Paraguay")
        print(f"[{company_id}] Paraguay search: {len(jobs)} resultados")
        if not jobs:
            jobs = fetch_workday_jobs(company_id, company_name, rubro, search_text="Asuncion")
            print(f"[{company_id}] Asuncion fallback: {len(jobs)} resultados")
        all_jobs.extend(jobs)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[workday_multinacionales] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
