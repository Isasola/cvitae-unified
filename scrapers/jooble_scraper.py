"""
Jooble — agregador global con API REST gratuita.
Busca ofertas en Paraguay + términos LatAm remotos.
API key gratuita en: https://jooble.org/api/about
Registrar con: apikey env JOOBLE_API_KEY
"""
import requests
import os
import re
import time

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
JOOBLE_API_KEY = os.environ.get("JOOBLE_API_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"

HEADERS_DB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

JOOBLE_API = f"https://jooble.org/api/{JOOBLE_API_KEY}"

# (keywords, location, rubro)
SEARCHES = [
    ("", "Asunción, Paraguay", "General"),
    ("", "Paraguay", "General"),
    ("remoto", "Paraguay", "General"),
    ("desarrollador", "Paraguay", "Tecnología e IT"),
    ("analista", "Paraguay", "Tecnología e IT"),
    ("contador", "Paraguay", "Banca y Finanzas"),
    ("administración", "Paraguay", "Administración"),
    ("ventas", "Paraguay", "Ventas y Comercial"),
    ("diseño", "Paraguay", "Diseño"),
    ("marketing", "Paraguay", "Marketing y Publicidad"),
    ("recursos humanos", "Paraguay", "Recursos Humanos"),
]


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()[:800]


def fetch_jobs(keywords, location, page=1):
    if not JOOBLE_API_KEY:
        print("  [Jooble] JOOBLE_API_KEY no configurada")
        return []
    payload = {
        "keywords": keywords,
        "location": location,
        "page": page,
        "resultonpage": 20,
    }
    try:
        r = requests.post(JOOBLE_API, json=payload, timeout=30)
        if r.status_code != 200:
            print(f"  [Jooble] HTTP {r.status_code}")
            return []
        data = r.json()
        return data.get("jobs", [])
    except Exception as e:
        print(f"  [Jooble] fetch error: {e}")
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


def guess_type(snippet):
    s = (snippet or "").lower()
    if "tiempo completo" in s or "full time" in s or "full-time" in s:
        return "Tiempo completo"
    if "medio tiempo" in s or "part time" in s or "part-time" in s:
        return "Medio tiempo"
    if "freelance" in s or "proyecto" in s:
        return "Freelance"
    if "remoto" in s or "remote" in s:
        return "Remoto"
    return "Tiempo completo"


def main():
    if not JOOBLE_API_KEY:
        print("[Jooble] Saltando — JOOBLE_API_KEY no configurada")
        return

    total_found = 0
    total_inserted = 0
    seen_urls = set()

    for keywords, location, rubro in SEARCHES:
        print(f"\nBuscando: '{keywords}' en '{location}'")
        jobs = fetch_jobs(keywords, location)

        for raw in jobs:
            url = raw.get("link", "")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            total_found += 1

            title = raw.get("title", "").strip()
            company = raw.get("company", "").strip()
            loc = raw.get("location", location).strip()
            snippet = strip_html(raw.get("snippet", ""))
            salary = raw.get("salary", "")

            description = snippet
            if salary:
                description = f"Salario: {salary}\n\n{snippet}"

            job = {
                "titulo": title,
                "organization": company or "No especificada",
                "location": loc,
                "rubro": rubro,
                "type": guess_type(snippet),
                "description": description[:800],
                "application_url": url,
                "source": "jooble",
                "is_active": True,
                "tags": [keywords] if keywords else [],
            }

            status = insert_job(job)
            if status in (200, 201, 409):
                total_inserted += 1
            print(f"  [{company}] {title[:50]} -> {status}")

        time.sleep(1)

    print(f"\n=== Jooble: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
