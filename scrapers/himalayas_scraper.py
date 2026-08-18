"""
Himalayas — 86.000+ empleos remote-first con API pública.
Filtramos los que tienen locationRestrictions: Worldwide, Anywhere,
Latin America, o que no tienen restricción de ubicación.
API: https://himalayas.app/jobs/api
"""
import requests
import re
import time
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"
HEADERS_DB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

API_URL = "https://himalayas.app/jobs/api"

# Locations that are open to LatAm
OPEN_LOCATIONS = {
    "worldwide", "anywhere", "global", "latin america", "south america",
    "americas", "latam", "remote", "international", "",
}

RUBRO_MAP = {
    "engineering": "Tecnología e IT",
    "software": "Tecnología e IT",
    "devops": "Tecnología e IT",
    "data": "Tecnología e IT",
    "machine learning": "Tecnología e IT",
    "design": "Diseño",
    "marketing": "Marketing y Publicidad",
    "sales": "Ventas y Comercial",
    "customer": "Atención al Cliente",
    "finance": "Banca y Finanzas",
    "accounting": "Banca y Finanzas",
    "hr": "Recursos Humanos",
    "people": "Recursos Humanos",
    "product": "Producto",
    "operations": "Operaciones",
    "legal": "Legal",
    "content": "Comunicación y Medios",
    "writing": "Comunicación y Medios",
    "qa": "Tecnología e IT",
}


def get_rubro(title, categories=None):
    combined = (title + " " + " ".join(categories or [])).lower()
    for keyword, rubro in RUBRO_MAP.items():
        if keyword in combined:
            return rubro
    return "General"


def strip_html(text):
    return re.sub(r'<[^>]+>', ' ', text or '').strip()[:600]


def is_latam_friendly(job):
    restrictions = job.get("locationRestrictions") or []
    if isinstance(restrictions, str):
        restrictions = [restrictions]
    if not restrictions:
        return True  # No restriction = open worldwide
    for loc in restrictions:
        loc_lower = loc.lower()
        if any(kw in loc_lower for kw in OPEN_LOCATIONS):
            return True
    return False


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers=HEADERS_DB,
            json=job,
        )
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def main():
    total_found = 0
    total_inserted = 0
    seen = set()
    offset = 0
    limit = 100

    while True:
        try:
            r = requests.get(
                API_URL,
                params={"limit": limit, "offset": offset},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=20,
            )
            if r.status_code != 200:
                print(f"  HTTP {r.status_code} at offset {offset}")
                break
            data = r.json()
            jobs_raw = data.get("jobs", [])
            if not jobs_raw:
                break
        except Exception as e:
            print(f"  error at offset {offset}: {e}")
            break

        page_inserted = 0
        for job in jobs_raw:
            url = job.get("applicationLink") or job.get("guid", "")
            if not url or url in seen:
                continue
            seen.add(url)

            if not is_latam_friendly(job):
                continue

            title = job.get("title", "")
            if not title:
                continue

            company = job.get("companyName", "").strip()
            if company.lower() in {"name", "", "n/a", "-", "employer", "company"}:
                continue

            total_found += 1
            salary = ""
            min_s = job.get("minSalary")
            max_s = job.get("maxSalary")
            currency = job.get("currency", "USD")
            period = job.get("salaryPeriod", "year")
            if min_s and max_s:
                salary = f"{currency} {min_s:,}–{max_s:,}/{period}"
            elif min_s:
                salary = f"{currency} {min_s:,}+/{period}"

            cats = job.get("categories") or job.get("parentCategories") or []
            payload = {
                "title": title,
                "organization": company,
                "location": "Remote",
                "remote": True,
                "rubro": get_rubro(title, cats),
                "type": "Remoto",
                "description": (salary + "\n" + strip_html(job.get("description") or job.get("excerpt", "")))[:600],
                "application_url": url,
                "source": "himalayas",
                "is_active": True,
                "tags": [c.lower().replace(" ", "-") for c in cats[:8]],
            }

            status = insert_job(payload)
            if status in (200, 201, 409):
                total_inserted += 1
                page_inserted += 1

        print(f"  offset {offset}: {page_inserted} insertadas de {len(jobs_raw)}")

        # Stop at 2000 to avoid flooding; cron runs daily anyway
        offset += limit
        if offset >= 2000:
            print("  Límite de 2000 alcanzado para esta corrida")
            break
        time.sleep(0.3)

    print(f"\n=== Himalayas: {total_inserted}/{total_found} remotos globales insertados ===")


if __name__ == "__main__":
    main()
