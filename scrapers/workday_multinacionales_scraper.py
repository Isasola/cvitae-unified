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

# (variable_name, company_id, company_name, rubro)
EMPRESAS = [
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


def fetch_workday_jobs(company_id: str, company_name: str, rubro: str, search_text: str = "Paraguay") -> list:
    url = f"https://{company_id}.wd1.myworkdayjobs.com/wday/cxs/{company_id}/External/jobs"
    payload = {
        "limit": 20,
        "offset": 0,
        "searchText": search_text,
        "locations": [],
    }
    try:
        r = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=20,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        jobs = data.get("jobPostings", [])
        result = []
        for job in jobs:
            title = job.get("title", "")
            if not title:
                continue
            job_path = job.get("externalPath", "")
            app_url = f"https://{company_id}.wd1.myworkdayjobs.com/External{job_path}" if job_path else ""
            if not app_url:
                continue
            location_info = job.get("locationsText", "Paraguay")
            description = ""
            jd = job.get("jobDescription", {})
            if isinstance(jd, dict):
                description = jd.get("descriptor", "")[:500]
            result.append({
                "titulo": title,
                "organization": company_name,
                "location": location_info if location_info else "Paraguay",
                "rubro": rubro,
                "type": "Tiempo completo",
                "description": description,
                "application_url": app_url,
                "source": SOURCE,
                "is_active": True,
                "tags": ["multinacional", rubro.lower()],
            })
        return result
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
    for _var, company_id, company_name, rubro in EMPRESAS:
        # First attempt: search for "Paraguay"
        jobs = fetch_workday_jobs(company_id, company_name, rubro, search_text="Paraguay")
        print(f"[{company_id}] Paraguay search: {len(jobs)} resultados")

        # If no results, retry with "Asuncion"
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
