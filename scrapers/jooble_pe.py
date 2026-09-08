"""
Jooble Peru — agregador global con API REST gratuita, búsquedas enfocadas en Perú.
API key gratuita en: https://jooble.org/api/about
Registrar con: apikey env JOOBLE_API_KEY
"""
import requests
import os
import re
import time
import json

from opportunity_sink import OpportunitySink

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
JOOBLE_API_KEY = os.environ.get("JOOBLE_API_KEY", "")

JOOBLE_API = f"https://jooble.org/api/{JOOBLE_API_KEY}"

SEARCHES = [
    ("", "Lima, Peru", "General"),
    ("", "Peru", "General"),
    ("remoto", "Peru", "General"),
    ("desarrollador", "Peru", "Tecnología e IT"),
    ("analista de sistemas", "Peru", "Tecnología e IT"),
    ("contador", "Lima, Peru", "Banca y Finanzas"),
    ("administración", "Lima, Peru", "Administración"),
    ("ventas", "Lima, Peru", "Ventas y Comercial"),
    ("marketing", "Lima, Peru", "Marketing y Publicidad"),
    ("recursos humanos", "Lima, Peru", "Recursos Humanos"),
    ("ingeniería", "Lima, Peru", "Ingeniería"),
    ("logística", "Lima, Peru", "Logística y Transporte"),
    ("salud enfermera", "Lima, Peru", "Salud y Medicina"),
    ("educación docente", "Lima, Peru", "Educación"),
    ("diseño gráfico", "Lima, Peru", "Diseño"),
]


def _strip_html(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r" {2,}", " ", text).strip()


def search_jooble(keywords, location, rubro):
    if not JOOBLE_API_KEY:
        print("  JOOBLE_API_KEY no configurado, saltando")
        return []

    payload = {"keywords": keywords, "location": location, "page": 1}
    try:
        r = requests.post(JOOBLE_API, json=payload, timeout=30)
        if r.status_code != 200:
            print(f"  Jooble error {r.status_code}: {r.text[:200]}")
            return []
        data = r.json()
    except Exception as e:
        print(f"  Jooble request error: {e}")
        return []

    jobs = []
    for item in data.get("jobs", []):
        title = (item.get("title") or "").strip()
        link = (item.get("link") or "").strip()
        if not title or not link:
            continue

        description = _strip_html(item.get("snippet", ""))[:2000]
        company = (item.get("company") or "").strip()
        loc = (item.get("location") or location).strip()

        jobs.append({
            "title": title,
            "organization": company,
            "location": loc,
            "rubro": rubro,
            "type": item.get("type", ""),
            "description": description,
            "application_url": link,
            "source": "jooble_pe",
            "country_code": "PE",
            "is_active": True,
            "tags": [keywords.strip() or "general"],
        })

    return jobs


def main():
    if not JOOBLE_API_KEY:
        print("JOOBLE_API_KEY no configurado. Configurar en variables de entorno y volver a ejecutar.")
        return

    all_jobs = []

    for keywords, location, rubro in SEARCHES:
        print(f"\nBuscando Jooble PE: '{keywords}' en '{location}'")
        jobs = search_jooble(keywords, location, rubro)
        all_jobs.extend(jobs)
        print(f"  {len(jobs)} resultados")
        time.sleep(1.5)

    summary = OpportunitySink().upsert(all_jobs)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))
    print(
        f"\n=== Jooble PE: {summary.inserted} nuevas, {summary.updated} actualizadas, "
        f"{summary.duplicates_in_run} duplicadas, {summary.rejected} rechazadas "
        f"de {summary.found} encontradas ==="
    )


if __name__ == "__main__":
    main()
