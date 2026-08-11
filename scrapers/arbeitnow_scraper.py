"""
Arbeitnow — bolsa de empleos tech/remote con API pública gratuita.
Filtramos solo empleos remotos que aceptan candidatos de cualquier lugar
(location=Anywhere/Remote/Worldwide) o con mención a LATAM/Latin America.
API: https://www.arbeitnow.com/api/job-board-api
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

API_URL = "https://www.arbeitnow.com/api/job-board-api"

LATAM_KEYWORDS = {
    "latam", "latin america", "latin-america", "latinoamerica",
    "anywhere", "worldwide", "remote", "global", "international",
    "south america", "sudamerica", "americas",
}

RUBRO_MAP = {
    "engineering": "Tecnología e IT",
    "software": "Tecnología e IT",
    "developer": "Tecnología e IT",
    "devops": "Tecnología e IT",
    "data": "Tecnología e IT",
    "design": "Diseño",
    "marketing": "Marketing y Publicidad",
    "sales": "Ventas y Comercial",
    "customer": "Atención al Cliente",
    "finance": "Banca y Finanzas",
    "hr": "Recursos Humanos",
    "product": "Producto",
    "operations": "Operaciones",
    "content": "Comunicación y Medios",
    "writing": "Comunicación y Medios",
}


def get_rubro(title, tags):
    combined = (title + " " + " ".join(tags or [])).lower()
    for keyword, rubro in RUBRO_MAP.items():
        if keyword in combined:
            return rubro
    return "Tecnología e IT"


def strip_html(text):
    return re.sub(r'<[^>]+>', ' ', text or '').strip()[:600]


def is_latam_friendly(job):
    location = (job.get("location") or "").lower()
    description = (job.get("description") or "").lower()[:500]
    tags = [t.lower() for t in (job.get("tags") or [])]

    if job.get("remote"):
        return True
    if any(kw in location for kw in LATAM_KEYWORDS):
        return True
    if any(kw in description for kw in LATAM_KEYWORDS):
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

    for page in range(1, 11):  # 100 jobs per page = up to 1000
        try:
            r = requests.get(
                API_URL,
                params={"page": page},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=20,
            )
            if r.status_code != 200:
                print(f"  page {page}: HTTP {r.status_code}")
                break
            data = r.json()
            jobs_raw = data.get("data", [])
            if not jobs_raw:
                break
        except Exception as e:
            print(f"  page {page} error: {e}")
            break

        page_inserted = 0
        for job in jobs_raw:
            url = job.get("url", "")
            if not url or url in seen:
                continue
            seen.add(url)

            if not is_latam_friendly(job):
                continue

            title = job.get("title", "")
            if not title:
                continue

            total_found += 1
            payload = {
                "title": title,
                "organization": job.get("company_name", ""),
                "location": job.get("location", "Remote"),
                "rubro": get_rubro(title, job.get("tags", [])),
                "type": "Remoto" if job.get("remote") else "Tiempo completo",
                "description": strip_html(job.get("description", ""))[:600],
                "application_url": url,
                "source": "arbeitnow",
                "is_active": True,
                "tags": (job.get("tags") or [])[:10],
            }

            status = insert_job(payload)
            if status in (200, 201, 409):
                total_inserted += 1
                page_inserted += 1

        print(f"  página {page}: {page_inserted} insertadas de {len(jobs_raw)} totales")
        time.sleep(0.5)

    print(f"\n=== Arbeitnow: {total_inserted}/{total_found} remotos/globales insertados ===")


if __name__ == "__main__":
    main()
