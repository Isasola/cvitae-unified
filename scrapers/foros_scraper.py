"""Foros y comunidades paraguayas — hilos de ofertas laborales."""
import requests
from bs4 import BeautifulSoup
import os
import re

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TABLE_URL = f"{SUPABASE_URL}/rest/v1/opportunities"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# Fuentes de foros y comunidades con hilos de empleo
FOROS = [
    {
        "key": "reddit_py_jobs",
        "url": "https://www.reddit.com/r/Paraguay/search.json?q=empleo+trabajo+vacante&sort=new&restrict_sr=1&limit=25",
        "source": "reddit_py",
        "org": "Reddit r/Paraguay",
        "rubro": "Comunidad Online",
        "tags": ["foro", "reddit", "comunidad"],
        "type": "json",
    },
    {
        "key": "reddit_py_new",
        "url": "https://www.reddit.com/r/trabajoparaguay/new.json?limit=25",
        "source": "reddit_py_trabajo",
        "org": "Reddit r/trabajoparaguay",
        "rubro": "Comunidad Online",
        "tags": ["foro", "reddit", "comunidad"],
        "type": "json",
    },
    {
        "key": "foroparaguay",
        "url": "https://www.foroparaguay.com/empleos",
        "source": "foroparaguay",
        "org": "Foro Paraguay",
        "rubro": "Comunidad Online",
        "tags": ["foro", "comunidad", "paraguay"],
        "type": "html",
    },
    {
        "key": "merienderos",
        "url": "https://www.merienderos.com.py/empleos",
        "source": "merienderos",
        "org": "Merienderos PY",
        "rubro": "Comunidad Online",
        "tags": ["foro", "comunidad", "paraguay"],
        "type": "html",
    },
    {
        "key": "ofertaslab_py",
        "url": "https://www.ofertaslaborales.com.py",
        "source": "ofertaslaborales",
        "org": "Ofertas Laborales PY",
        "rubro": "Bolsa de Empleo",
        "tags": ["foro", "empleo", "paraguay"],
        "type": "html",
    },
    {
        "key": "zonajobs_py",
        "url": "https://www.zonajobs.com.py/empleos-en-paraguay",
        "source": "zonajobs_py",
        "org": "ZonaJobs Paraguay",
        "rubro": "Bolsa de Empleo",
        "tags": ["bolsa-empleo", "zonajobs", "paraguay"],
        "type": "html",
    },
]

JOB_SELECTORS = [
    ".thread", ".topic", ".post", ".job", ".vacancy", "article",
    ".listing-item", ".thread-item", "tr.topic-row",
]
TITLE_KEYWORDS = ["busco", "ofrezco", "empleo", "trabajo", "vacante", "cargo", "puesto", "contrato", "oportunidad"]


def fetch(url):
    try:
        r = requests.get(url, headers=UA, timeout=30, verify=False)
        return r
    except Exception as e:
        print(f"  fetch error {url}: {e}")
        return None


def scrape_reddit_json(foro):
    r = fetch(foro["url"])
    if not r:
        return []
    try:
        data = r.json()
    except Exception:
        return []
    jobs = []
    posts = data.get("data", {}).get("children", [])
    for post in posts:
        d = post.get("data", {})
        title = d.get("title", "")
        permalink = d.get("permalink", "")
        if not title or not permalink:
            continue
        job_url = f"https://www.reddit.com{permalink}"
        if not any(kw in title.lower() for kw in TITLE_KEYWORDS):
            continue
        jobs.append({
            "title": title,
            "organization": foro["org"],
            "location": "Paraguay",
            "rubro": foro["rubro"],
            "type": "Publicación en foro",
            "description": d.get("selftext", "")[:500] or "",
            "application_url": job_url,
            "source": foro["source"],
            "is_active": True,
            "tags": foro["tags"],
        })
    return jobs[:20]


def scrape_html_foro(foro):
    r = fetch(foro["url"])
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    jobs = []

    for sel in JOB_SELECTORS:
        items = soup.select(sel)
        if items:
            for item in items:
                title_el = item.select_one("h2, h3, h4, .title, a")
                if not title_el:
                    continue
                title = title_el.get_text(strip=True)
                if not title or len(title) < 8:
                    continue
                link_el = item.select_one("a[href]")
                job_url = foro["url"]
                if link_el:
                    href = link_el.get("href", "")
                    job_url = href if href.startswith("http") else foro["url"]
                jobs.append({
                    "title": title,
                    "organization": foro["org"],
                    "location": "Paraguay",
                    "rubro": foro["rubro"],
                    "type": "Publicación en foro",
                    "description": "",
                    "application_url": job_url,
                    "source": foro["source"],
                    "is_active": True,
                    "tags": foro["tags"],
                })
            if jobs:
                break

    if not jobs:
        for a in soup.select("a[href]"):
            text = a.get_text(strip=True)
            href = a.get("href", "")
            if not text or len(text) < 8 or len(text) > 150:
                continue
            if any(kw in text.lower() for kw in TITLE_KEYWORDS):
                job_url = href if href.startswith("http") else foro["url"]
                jobs.append({
                    "title": text,
                    "organization": foro["org"],
                    "location": "Paraguay",
                    "rubro": foro["rubro"],
                    "type": "Publicación en foro",
                    "description": "",
                    "application_url": job_url,
                    "source": foro["source"],
                    "is_active": True,
                    "tags": foro["tags"],
                })

    seen = set()
    unique = []
    for j in jobs:
        if j["application_url"] not in seen:
            seen.add(j["application_url"])
            unique.append(j)
    return unique[:20]


def insert_job(job):
    try:
        r = requests.post(TABLE_URL + "?on_conflict=application_url", headers=HEADERS, json=job)
        return r.status_code
    except Exception as e:
        print(f"  insert error: {e}")
        return "error"


def main():
    import urllib3
    urllib3.disable_warnings()
    all_jobs = []
    for foro in FOROS:
        if foro["type"] == "json":
            jobs = scrape_reddit_json(foro)
        else:
            jobs = scrape_html_foro(foro)
        print(f"[{foro['key']}] encontradas: {len(jobs)}")
        all_jobs.extend(jobs)

    count = 0
    for job in all_jobs:
        status = insert_job(job)
        if status in (200, 201, 409):
            count += 1
    print(f"[foros] Total insertados: {count}/{len(all_jobs)}")


if __name__ == "__main__":
    main()
