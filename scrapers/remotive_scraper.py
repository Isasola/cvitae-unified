import requests
import os
import re

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"

# Remotive public API — max 4 requests/day recommended
REMOTIVE_API = "https://remotive.com/api/remote-jobs"

# Categories available in Remotive API
CATEGORIES = [
    "software-dev",
    "customer-support",
    "design",
    "marketing",
    "product",
    "data",
    "devops",
    "finance-legal",
    "hr",
    "qa",
    "writing",
]

RUBRO_MAP = {
    "software-dev": "Tecnología e IT",
    "customer-support": "Atención al Cliente",
    "design": "Diseño",
    "marketing": "Marketing y Publicidad",
    "product": "Producto",
    "data": "Tecnología e IT",
    "devops": "Tecnología e IT",
    "finance-legal": "Banca y Finanzas",
    "hr": "Recursos Humanos",
    "qa": "Tecnología e IT",
    "writing": "Comunicación y Medios",
}


def strip_html(text):
    return re.sub(r'<[^>]+>', '', text or '').strip()[:800]


def fetch_jobs(category=None):
    params = {}
    if category:
        params["category"] = category
    try:
        r = requests.get(REMOTIVE_API, params=params, timeout=30)
        if r.status_code != 200:
            print(f"  [Remotive] HTTP {r.status_code}")
            return []
        data = r.json()
        return data.get("jobs", [])
    except Exception as e:
        print(f"  [Remotive] fetch error: {e}")
        return []


def insert_job(job):
    try:
        r = requests.post(
            TABLE_URL + "?on_conflict=application_url",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            json=job,
        )
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def main():
    total_found = 0
    total_inserted = 0
    seen_urls = set()

    for cat in CATEGORIES:
        print(f"\nFetching category: {cat}")
        raw_jobs = fetch_jobs(cat)

        for raw in raw_jobs:
            url = raw.get("url", "")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            total_found += 1

            title = raw.get("title", "")
            company = raw.get("company_name", "")
            location = raw.get("candidate_required_location", "Remote")
            salary = raw.get("salary", "")
            description = strip_html(raw.get("description", ""))
            tags = raw.get("tags", [])
            rubro = RUBRO_MAP.get(cat, "General")

            full_description = description
            if salary:
                full_description = f"{salary}\n\n{description}"

            job = {
                "titulo": title,
                "organization": company,
                "location": location,
                "rubro": rubro,
                "type": "Remoto",
                "description": full_description[:800],
                "application_url": url,
                "source": "remotive",
                "is_active": True,
                "tags": tags[:10] if tags else [cat],
            }

            status = insert_job(job)
            if status in (200, 201, 409):
                total_inserted += 1
            print(f"  [{company}] {title[:50]} -> {status}")

    print(f"\n=== Remotive: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
