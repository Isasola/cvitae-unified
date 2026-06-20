"""
Fundación Carolina — becas de posgrado (maestría, doctorado) para
latinoamericanos en universidades españolas. Una de las más importantes
para el público de CVitae.

El sitio no tiene listado paginado de convocatorias — cada convocatoria
es una página fija (no una entrada de blog). Se mapean manualmente las
URLs conocidas + la convocatoria anual principal.
"""
import requests
from bs4 import BeautifulSoup
import re
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

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9",
}

# Páginas conocidas con convocatorias
KNOWN_PAGES = [
    ("https://www.fundacioncarolina.es/convocatoria-de-becas-2026-2027/",   "Convocatoria General 2026-2027"),
    ("https://www.fundacioncarolina.es/formacion/becas-de-doctorado-y-estancias-cortas", "Becas de Doctorado"),
    ("https://www.fundacioncarolina.es/programa-int-visitantes/visitas-de-grupo/programa-jovenes-lideres-iberoamericanos/", "Jóvenes Líderes Iberoamericanos"),
    ("https://www.fundacioncarolina.es/programa-int-visitantes/visitas-de-grupo/mujeres-lideres-iberoamericanas/", "Mujeres Líderes Iberoamericanas"),
    ("https://www.fundacioncarolina.es/programa-personas-defensoras-de-derechos-humanos/", "Defensores de DDHH"),
    ("https://www.fundacioncarolina.es/programa-periodistas-iberoamericanos/", "Periodistas Iberoamericanos"),
    ("https://www.fundacioncarolina.es/becas/", "Página de Becas"),
]

# También buscar dinámicamente en la página de becas
BECAS_INDEX = "https://www.fundacioncarolina.es/becas/"


def fetch(url):
    try:
        r = requests.get(url, headers=FETCH_HEADERS, timeout=20)
        return r if r.status_code == 200 else None
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return None


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


def extract_description(soup):
    """Extrae el primer párrafo de contenido de la página."""
    for sel in ['.entry-content p', 'main p', 'article p', '.content p']:
        paras = soup.select(sel)
        if paras:
            text = " ".join(p.get_text(strip=True) for p in paras[:3])
            return text[:600]
    return ""


def scrape():
    jobs = []
    seen = set()

    # 1. Scrape known pages
    for url, label in KNOWN_PAGES:
        resp = fetch(url)
        if not resp:
            continue
        soup = BeautifulSoup(resp.text, "html.parser")
        title_el = soup.find("h1")
        title = title_el.get_text(strip=True) if title_el else label
        description = extract_description(soup)
        if url in seen:
            continue
        seen.add(url)
        jobs.append({
            "titulo": title,
            "organization": "Fundación Carolina",
            "location": "España",
            "rubro": "Becas y Posgrados",
            "type": "Beca",
            "description": description,
            "application_url": url,
            "source": "fundacion_carolina",
            "is_active": True,
            "tags": ["beca", "españa", "posgrado", "latinoamerica", "fundacion-carolina"],
        })
        print(f"  ✓ {title[:65]}")

    # 2. Discover additional convocatorias dynamically from becas page
    resp = fetch(BECAS_INDEX)
    if resp:
        soup = BeautifulSoup(resp.text, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            text = a.get_text(strip=True)
            if href in seen:
                continue
            if "fundacioncarolina.es" not in href:
                continue
            # Only include pages that are likely convocatorias
            if any(kw in href.lower() for kw in ["convocatoria", "beca", "programa", "master", "doctorado"]):
                if len(text) > 8:
                    seen.add(href)
                    resp2 = fetch(href)
                    description = ""
                    if resp2:
                        soup2 = BeautifulSoup(resp2.text, "html.parser")
                        description = extract_description(soup2)
                    jobs.append({
                        "titulo": text,
                        "organization": "Fundación Carolina",
                        "location": "España",
                        "rubro": "Becas y Posgrados",
                        "type": "Beca",
                        "description": description,
                        "application_url": href,
                        "source": "fundacion_carolina",
                        "is_active": True,
                        "tags": ["beca", "españa", "posgrado", "latinoamerica"],
                    })
                    print(f"  + {text[:65]}")

    return jobs


def main():
    print("Rastreando Fundación Carolina...")
    jobs = scrape()
    total_inserted = 0
    for job in jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            total_inserted += 1
    print(f"\n=== Fundación Carolina: {total_inserted}/{len(jobs)} insertadas/actualizadas ===")


if __name__ == "__main__":
    main()
