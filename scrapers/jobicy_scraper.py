"""
Jobicy — empleos remotos con API pública, especialmente fuertes en
tech y marketing. Permite filtrar por industria.
API: https://jobicy.com/api/v2/remote-jobs
Docs: https://jobicy.com/jobs-rss-feed
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

API_URL = "https://jobicy.com/api/v2/remote-jobs"

# Industry tags available in Jobicy
INDUSTRIES = [
    ("devops-sysadmin",     "Tecnología e IT"),
    ("software-dev",        "Tecnología e IT"),
    ("data-science",        "Tecnología e IT"),
    ("design",              "Diseño"),
    ("marketing",           "Marketing y Publicidad"),
    ("sales",               "Ventas y Comercial"),
    ("customer-support",    "Atención al Cliente"),
    ("finance-legal",       "Banca y Finanzas"),
    ("hr",                  "Recursos Humanos"),
    ("product",             "Producto"),
    ("writing",             "Comunicación y Medios"),
    ("business",            "Negocios"),
]


def strip_html(text):
    return re.sub(r'<[^>]+>', ' ', text or '').strip()[:600]


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

    for industry_tag, rubro in INDUSTRIES:
        print(f"\nIndustria: {industry_tag}")
        try:
            r = requests.get(
                API_URL,
                params={"count": 50, "industry": industry_tag},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=20,
            )
            if r.status_code != 200:
                print(f"  HTTP {r.status_code}")
                continue
            data = r.json()
            jobs_raw = data.get("jobs", [])
        except Exception as e:
            print(f"  error: {e}")
            continue

        for job in jobs_raw:
            url = job.get("url", "")
            if not url or url in seen:
                continue
            seen.add(url)
            total_found += 1

            title = job.get("jobTitle", "")
            if not title:
                continue

            tags = job.get("jobIndustry") or []
            if isinstance(tags, str):
                tags = [tags]

            payload = {
                "titulo": title,
                "organization": job.get("companyName", ""),
                "location": job.get("jobGeo", "Remote"),
                "rubro": rubro,
                "type": "Remoto",
                "description": strip_html(job.get("jobDescription", ""))[:600],
                "application_url": url,
                "source": "jobicy",
                "is_active": True,
                "tags": [t.lower() for t in tags[:8]],
            }

            status = insert_job(payload)
            if status in (200, 201, 409):
                total_inserted += 1
            print(f"  [{job.get('companyName','?')[:25]}] {title[:45]} -> {status}")

        time.sleep(1)

    print(f"\n=== Jobicy: {total_inserted}/{total_found} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
