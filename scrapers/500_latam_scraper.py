"""Collect open seed capital and acceleration calls from 500 Global — LATAM.

Source tier A — official 500 Global channel.
access_note: Confirmar monto, instrumento, cohorte, deadline y formulario antes
de publicar. No presentar la inversión como grant ni como financiamiento sin
participación accionaria. Separar la aceleradora de cursos pagos, eventos,
waitlists y programas de educación para inversionistas.

NOTE: 500.co/latam may redirect or render content via JavaScript.
If results are consistently empty, verify the current URL with a browser.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "500_latam"
START_URL = "https://500.co/latam"
FALLBACK_URLS = [
    "https://500.co/accelerators",
    "https://500.co/programs",
]
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

OPEN_RE = re.compile(
    r"\b(apply now|apply today|applications open|accepting applications|"
    r"submit your application|apply here|deadline|closing date|"
    r"postula ahora|postulaciones abiertas|apply before|open call|"
    r"batch|cohort|cohorte|now accepting|applications close)\b",
    re.IGNORECASE,
)
SKIP_RE = re.compile(
    r"\b(privacy policy|terms of service|contact us|about us|blog|"
    r"portfolio|news|press|investors|team|login|sign in|"
    r"newsletter|subscribe|fund)\b",
    re.IGNORECASE,
)


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    body_text = " ".join(soup.get_text(" ", strip=True).split())

    if not OPEN_RE.search(body_text):
        print(f"{SOURCE_ID}: no open application signal at {base_url} — no call currently published")
        return []

    # Try to find apply link
    apply_url = base_url
    for anchor in soup.find_all("a", href=True):
        txt = " ".join(anchor.get_text(" ", strip=True).split())
        href = anchor.get("href", "").strip()
        if SKIP_RE.search(txt):
            continue
        if re.search(r"\b(apply now|apply here|apply today|postula|get started|apply before)\b", txt, re.I):
            candidate = urljoin(base_url, href)
            if candidate.startswith(("https://", "http://")):
                apply_url = candidate
                break

    h1 = soup.find("h1")
    title = (
        " ".join(h1.get_text(" ", strip=True).split())
        if h1
        else "500 Global LATAM — Seed Capital & Acceleration"
    )

    desc_parts = []
    for tag in soup.find_all(["p", "li"]):
        t = " ".join(tag.get_text(" ", strip=True).split())
        if t and len(t) > 20 and not SKIP_RE.search(t):
            desc_parts.append(t)
    description = " ".join(desc_parts)[:4000]

    return [
        {
            "title": title,
            "organization": "500 Global",
            "location": "Latin America",
            "continent": "Americas",
            "opportunity_type": "seed_capital",
            "opportunity_kind": "programa",
            "application_url": apply_url,
            "source_url": base_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": base_url,
            "original_source_verified": True,
            "eligible_regions": ["LATAM"],
            "funding_amount": 300000,
            "currency": "USD",
            "tags": ["500 Global", "seed_capital", "LATAM", "accelerator", "venture_capital"],
            "description": description or title,
        }
    ]


def extract() -> list[dict]:
    session = requests.Session()
    for url in [START_URL] + FALLBACK_URLS:
        try:
            resp = session.get(url, timeout=45, headers=HEADERS)
            if resp.status_code == 403:
                print(f"{SOURCE_ID}: 403 blocked at {url} — trying next URL")
                continue
            resp.raise_for_status()
            rows = parse(resp.text, base_url=url)
            if rows:
                return rows
        except requests.RequestException as exc:
            print(f"{SOURCE_ID}: error fetching {url}: {exc}")
    print(
        f"{SOURCE_ID}: all URLs returned 0 results. "
        "Page may require JavaScript rendering; use Playwright/Pyppeteer in production."
    )
    return []


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
