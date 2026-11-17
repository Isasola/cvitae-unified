import os
import json
import re
import time
import requests

from opportunity_sink import OpportunitySink

FUENTEPY_BASE = "https://bekvaxcdwyidmblwyqmf.supabase.co"
FUENTEPY_ANON_KEY = os.environ.get(
    "FUENTEPY_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJla3ZheGNkd3lpZG1ibHd5cW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3Nzk4NzUsImV4cCI6MjA3NzM1NTg3NX0.d5PzWGXujpwAjZ1ez9e0m2msnevg19Yjp2AtW49T168",
)

FUENTEPY_HEADERS = {
    "apikey": FUENTEPY_ANON_KEY,
    "Authorization": f"Bearer {FUENTEPY_ANON_KEY}",
    "Content-Type": "application/json",
}

PAGE_SIZE = 100
APP_BASE = "https://ats.fuentepy.com/jobs"

COUNTRY_CODE_MAP = {
    "paraguay": "PY",
    "argentina": "AR",
    "brasil": "BR",
    "uruguay": "UY",
    "chile": "CL",
    "colombia": "CO",
    "perú": "PE",
    "peru": "PE",
    "bolivia": "BO",
    "mexico": "MX",
    "méxico": "MX",
}

SENIORITY_LABEL = {
    "junior": "Junior",
    "semi-senior": "Semi-Senior",
    "semi_senior": "Semi-Senior",
    "senior": "Senior",
    "lead": "Lead",
    "manager": "Manager",
}

EMOJI_RE = re.compile(
    "[\U00010000-\U0010ffff"
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "☀-➿"
    "✀-➿"
    "]+",
    flags=re.UNICODE,
)


def _strip_emojis(text: str) -> str:
    return EMOJI_RE.sub("", text).strip()


def _infer_remote(modality: str | None, is_remote: bool | None) -> bool:
    if is_remote:
        return True
    if modality and "remoto" in modality.lower():
        return True
    return False


def _infer_remote_scope(modality: str | None, is_remote: bool | None, country_code: str) -> str | None:
    if _infer_remote(modality, is_remote):
        return "latam" if country_code != "PY" else "latam"
    return None


def _build_type(seniority: str | None, contract_type: str | None, service_type: str | None) -> str:
    parts = []
    if seniority:
        label = SENIORITY_LABEL.get(seniority.lower().replace("-", "_"), seniority.capitalize())
        parts.append(label)
    if contract_type:
        parts.append(contract_type.capitalize())
    elif service_type and service_type not in ("tercerizacion",):
        parts.append(service_type.replace("_", " ").capitalize())
    return " · ".join(parts) if parts else "Empleo"


def _build_tags(skills: list, seniority: str | None, modality: str | None) -> list[str]:
    tags = [s.strip() for s in (skills or []) if s and s.strip()]
    if seniority:
        label = SENIORITY_LABEL.get(seniority.lower().replace("-", "_"), seniority)
        if label not in tags:
            tags.append(label)
    if modality and modality.lower() not in ("presencial",):
        cap = modality.capitalize()
        if cap not in tags:
            tags.append(cap)
    return tags[:20]


def _build_location(city: str | None, country: str | None) -> str:
    parts = [p.strip() for p in [city, country] if p and p.strip()]
    return ", ".join(parts) if parts else "Paraguay"


def fetch_jobs(offset: int = 0) -> list[dict]:
    url = (
        f"{FUENTEPY_BASE}/rest/v1/jobs"
        f"?select=id,title,description_rich,skills,seniority,city,country,modality,"
        f"is_remote,salary_min,salary_max,currency,published_at,closes_at,"
        f"contract_type,service_type,benefits,languages"
        f"&status=eq.active"
        f"&offset={offset}&limit={PAGE_SIZE}"
        f"&order=published_at.desc"
    )
    r = requests.get(url, headers=FUENTEPY_HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def build_opportunity(row: dict) -> dict | None:
    job_id = row.get("id", "")
    title = (row.get("title") or "").strip()
    if not title or not job_id:
        return None

    description_raw = row.get("description_rich") or ""
    description = _strip_emojis(description_raw).strip()

    # Append benefits if present
    benefits = row.get("benefits") or []
    if benefits:
        benefit_lines = "\n".join(f"- {b}" for b in benefits if b)
        description = f"{description}\n\nBeneficios:\n{benefit_lines}".strip()

    country_str = (row.get("country") or "Paraguay").strip().lower()
    country_code = COUNTRY_CODE_MAP.get(country_str, "PY")
    city = (row.get("city") or "").strip() or None

    modality = (row.get("modality") or "").strip() or None
    is_remote_flag = row.get("is_remote") or False
    remote = _infer_remote(modality, is_remote_flag)
    remote_scope = _infer_remote_scope(modality, is_remote_flag, country_code)

    seniority = (row.get("seniority") or "").strip() or None
    contract_type = (row.get("contract_type") or "").strip() or None
    service_type = (row.get("service_type") or "").strip() or None
    opp_type = _build_type(seniority, contract_type, service_type)

    skills = row.get("skills") or []
    tags = _build_tags(skills, seniority, modality)

    # Value/salary
    salary_min = row.get("salary_min")
    salary_max = row.get("salary_max")
    currency = (row.get("currency") or "").strip()
    value: str | None = None
    if salary_min and salary_max:
        value = f"{salary_min:,.0f} – {salary_max:,.0f} {currency}".strip()
    elif salary_min:
        value = f"Desde {salary_min:,.0f} {currency}".strip()
    elif salary_max:
        value = f"Hasta {salary_max:,.0f} {currency}".strip()

    return {
        "title": title,
        "organization": "FuentePy",
        "location": _build_location(city, row.get("country")),
        "country_code": country_code,
        "city": city,
        "remote": remote,
        "remote_scope": remote_scope,
        "type": opp_type,
        "opportunity_type": "job",
        "opportunity_kind": "job",
        "description": description,
        "application_url": f"{APP_BASE}/{job_id}",
        "source": "fuentepy",
        "source_authority": "original",
        "original_source_url": f"{APP_BASE}/{job_id}",
        "original_source_verified": True,
        "is_active": True,
        "tags": tags,
        "published_at": row.get("published_at"),
        "deadline": row.get("closes_at"),
        "value": value,
    }


def run() -> None:
    all_jobs: list[dict] = []
    offset = 0

    while True:
        batch = fetch_jobs(offset)
        if not batch:
            break
        for row in batch:
            opp = build_opportunity(row)
            if opp:
                all_jobs.append(opp)
        print(f"  [fuentepy] offset={offset}: {len(batch)} obtenidos")
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(1)

    print(f"  [fuentepy] total válidos: {len(all_jobs)}")
    summary = OpportunitySink().upsert(all_jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== FuentePy: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas "
        f"de {summary.found} encontradas ==="
    )
    for error in summary.errors[:5]:
        print(f"  ERROR: {error}")


if __name__ == "__main__":
    run()
