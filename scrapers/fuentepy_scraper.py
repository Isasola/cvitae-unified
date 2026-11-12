"""FuentePy ATS — empleos tech/fintech en Paraguay via API pública.

Fuente Tier A: https://ats.fuentepy.com
API: Supabase REST (anon key — lectura pública)
Mercado: PY — tech, fintech, startups
"""
import os
import time
import requests
from opportunity_sink import OpportunitySink

FUENTEPY_URL = "https://bekvaxcdwyidmblwyqmf.supabase.co"
FUENTEPY_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJla3ZheGNkd3lpZG1ibHd5cW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3Nzk4NzUsImV4cCI6MjA3NzM1NTg3NX0"
    ".d5PzWGXujpwAjZ1ez9e0m2msnevg19Yjp2AtW49T168"
)
PORTAL_BASE = "https://ats.fuentepy.com"
PAGE_SIZE = 100

MODALITY_MAP = {
    "remoto": True, "remote": True,
    "híbrido": False, "hibrido": False,
    "presencial": False, "on-site": False,
}

SENIORITY_MAP = {
    "junior": "Junior",
    "semi-senior": "Semi Senior",
    "senior": "Senior",
    "lead": "Lead",
    "manager": "Manager",
}


def fetch_page(offset: int) -> list:
    headers = {
        "apikey": FUENTEPY_ANON_KEY,
        "Authorization": f"Bearer {FUENTEPY_ANON_KEY}",
    }
    r = requests.get(
        f"{FUENTEPY_URL}/rest/v1/jobs",
        params={
            "select": "id,title,description_rich,skills,seniority,modality,city,country,is_remote,tags,published_at,closes_at,contract_type",
            "status": "eq.active",
            "offset": offset,
            "limit": PAGE_SIZE,
            "order": "published_at.desc",
        },
        headers=headers,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def normalize(row: dict) -> dict | None:
    desc = (row.get("description_rich") or "").strip()
    if len(desc) < 20:
        return None

    title = (row.get("title") or "").strip()
    if not title:
        return None

    seniority = (row.get("seniority") or "").lower()
    modality_raw = (row.get("modality") or "").lower()
    is_remote = row.get("is_remote") or MODALITY_MAP.get(modality_raw, False)

    city = (row.get("city") or "").strip()
    country = (row.get("country") or "Paraguay").strip()
    country_code = "PY" if "paraguay" in country.lower() else None

    tags = [s for s in (row.get("skills") or []) if isinstance(s, str) and s.strip()]
    if seniority and seniority in SENIORITY_MAP:
        tags.append(SENIORITY_MAP[seniority])

    if is_remote:
        emp_type = "remote"
    elif "híbrido" in modality_raw or "hibrido" in modality_raw:
        emp_type = "hybrid"
    else:
        emp_type = "full_time"

    job_id = row["id"]
    return {
        "title": title,
        "organization": "FuentePy",
        "description": desc,
        "location": city or country,
        "city": city or None,
        "country_code": country_code,
        "source": "fuentepy",
        "application_url": f"{PORTAL_BASE}/jobs/{job_id}",
        "is_active": True,
        "remote": is_remote,
        "employment_type": emp_type,
        "tags": tags,
        "rubro": "Tecnología",
        "type": "Empleo",
        "deadline": row.get("closes_at"),
    }


def main():
    max_items = int(os.getenv("CVITAE_MAX_ITEMS", "500"))
    all_jobs: list[dict] = []
    offset = 0

    while offset < max_items:
        try:
            batch = fetch_page(offset)
        except Exception as e:
            print(f"  [error] fetch offset={offset}: {type(e).__name__}: {e}")
            break

        if not batch:
            break

        for row in batch:
            job = normalize(row)
            if job:
                all_jobs.append(job)

        print(f"  offset={offset}: {len(batch)} fetched, {len(all_jobs)} válidos acumulados")

        if len(batch) < PAGE_SIZE:
            break

        offset += PAGE_SIZE
        time.sleep(1)

    print(f"\nTotal encontrados: {len(all_jobs)}")
    if not all_jobs:
        print("Sin empleos activos.")
        return

    summary = OpportunitySink().upsert(all_jobs)
    print(f"  valid={summary.valid} rejected={summary.rejected} inserted={summary.inserted} updated={summary.updated} unchanged={summary.unchanged}")
    print(f"CVITAE_INGESTION_SUMMARY={{'found':{len(all_jobs)},'valid':{summary.valid},'inserted':{summary.inserted},'updated':{summary.updated},'unchanged':{summary.unchanged},'rejected':{summary.rejected}}}")


if __name__ == "__main__":
    main()
