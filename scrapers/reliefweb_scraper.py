"""
ReliefWeb API — empleos del sector humanitario global.
Cubre todas las agencias ONU y ONGs humanitarias.
API pública, sin key. Docs: https://reliefweb.int/help/api
Filtra por países LatAm + puestos abiertos a candidatos de la región.
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

RELIEFWEB_API = "https://api.reliefweb.int/v1/jobs"

# País ISO codes LatAm que ReliefWeb usa
LATAM_COUNTRIES = [
    "paraguay", "argentina", "bolivia", "peru", "colombia",
    "mexico", "chile", "brazil", "ecuador", "uruguay",
    "venezuela", "guatemala", "costa-rica", "panama",
]

RUBRO_MAP = {
    "Administration": "Administración",
    "Coordination": "Administración",
    "Finance": "Banca y Finanzas",
    "Human Resources": "Recursos Humanos",
    "Information Technology": "Tecnología e IT",
    "Logistics": "Logística y Supply Chain",
    "Programme and Project Management": "Administración",
    "Communication and Outreach": "Comunicación y Medios",
    "Monitoring and Evaluation": "Consultoría",
    "Health": "Salud",
    "Education": "Educación",
    "Protection and Human Rights": "Derecho",
    "Water Sanitation Hygiene": "Ingeniería y Manufactura",
    "Food and Nutrition": "Ciencias Agropecuarias",
}


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()[:800]


def fetch_jobs(country, offset=0):
    params = {
        "appname": "cvitae-lat",
        "profile": "full",
        "slim": 1,
        "limit": 50,
        "offset": offset,
        "filter[field]": "country.iso3",
        "filter[value][]": country,
        "sort[]": "date:desc",
        "fields[include][]": [
            "title", "source", "city", "country", "type",
            "career_categories", "url", "body-html", "date",
        ],
    }
    try:
        r = requests.get(RELIEFWEB_API, params=params, timeout=30)
        if r.status_code != 200:
            print(f"  [ReliefWeb] HTTP {r.status_code} for {country}")
            return []
        data = r.json()
        return data.get("data", [])
    except Exception as e:
        print(f"  [ReliefWeb] fetch error {country}: {e}")
        return []


def fetch_global_remote():
    """Empleos globales/remotos con mención a LATAM."""
    params = {
        "appname": "cvitae-lat",
        "profile": "full",
        "slim": 1,
        "limit": 50,
        "filter[operator]": "AND",
        "filter[conditions][0][field]": "type",
        "filter[conditions][0][value]": "job",
        "query[value]": "latin america OR latinoamerica OR remote OR global",
        "query[operator]": "OR",
        "sort[]": "date:desc",
        "fields[include][]": [
            "title", "source", "city", "country", "type",
            "career_categories", "url", "body-html",
        ],
    }
    try:
        r = requests.get(RELIEFWEB_API, params=params, timeout=30)
        if r.status_code != 200:
            return []
        return r.json().get("data", [])
    except Exception as e:
        print(f"  [ReliefWeb] global fetch error: {e}")
        return []


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


def parse_job(raw):
    fields = raw.get("fields", {})
    title = fields.get("title", "").strip()
    url = fields.get("url", "")
    if not title or not url:
        return None

    sources = fields.get("source", [])
    org = sources[0].get("name", "Organización humanitaria") if sources else "Organización humanitaria"

    country_list = fields.get("country", [])
    country_name = country_list[0].get("name", "Global") if country_list else "Global"
    city = fields.get("city", [{}])
    city_name = city[0].get("name", "") if city else ""
    location = f"{city_name}, {country_name}".strip(", ") if city_name else country_name

    body = strip_html(fields.get("body-html", ""))

    cats = fields.get("career_categories", [])
    cat_name = cats[0].get("name", "") if cats else ""
    rubro = RUBRO_MAP.get(cat_name, "Organismos Internacionales")

    job_type = fields.get("type", [{}])
    type_name = job_type[0].get("name", "Tiempo completo") if job_type else "Tiempo completo"

    return {
        "titulo": title,
        "organization": org,
        "location": location,
        "rubro": rubro,
        "type": type_name,
        "description": body[:800],
        "application_url": url,
        "source": "reliefweb",
        "is_active": True,
        "tags": [cat_name] if cat_name else ["humanitario"],
    }


def main():
    total_found = 0
    total_inserted = 0
    seen_urls = set()

    for country in LATAM_COUNTRIES:
        print(f"\nFetching ReliefWeb: {country}")
        jobs = fetch_jobs(country)

        for raw in jobs:
            job = parse_job(raw)
            if not job or job["application_url"] in seen_urls:
                continue
            seen_urls.add(job["application_url"])
            total_found += 1

            status = insert_job(job)
            if status in (200, 201, 409):
                total_inserted += 1
            print(f"  [{job['organization']}] {job['titulo'][:50]} -> {status}")

        time.sleep(0.5)

    # Empleos globales con mención LATAM
    print("\nFetching ReliefWeb: global/remote LATAM")
    for raw in fetch_global_remote():
        job = parse_job(raw)
        if not job or job["application_url"] in seen_urls:
            continue
        seen_urls.add(job["application_url"])
        total_found += 1
        status = insert_job(job)
        if status in (200, 201, 409):
            total_inserted += 1
        print(f"  [{job['organization']}] {job['titulo'][:50]} -> {status}")

    print(f"\n=== ReliefWeb: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
