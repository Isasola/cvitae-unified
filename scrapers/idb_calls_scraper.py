"""Collect active grants, innovation calls and startup programs from IDB/BID.

Source tier A — official IDB/BID channel.
access_note: Verificar en cada llamado tipo de postulante, paises, sector,
etapa, financiamiento, contrapartida, documentos, deadline y portal de
aplicacion. Excluir compras, procurement, consultorias, noticias, resultados
y convocatorias cerradas.

NOTE: The IADB calls page renders many items dynamically via JavaScript.
This scraper parses the server-side HTML. If results are consistently empty,
upstream the rendered HTML from a headless browser (Playwright / Pyppeteer)
and pass it directly to parse().
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "idb_calls"
START_URL = "https://www.iadb.org/en/home/calls-proposals"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

# A link/card must match at least one of these to be treated as an opportunity
CALL_RE = re.compile(
    r"\b(grant|fund|innovation|call|proposal|startup|research|challenge|"
    r"program|award|convocatoria|financing|initiative|challenge|competition|"
    r"concurso|innovaci[oó]n|desaf[ií]o)\b",
    re.IGNORECASE,
)
# Generic navigation / site links to discard
SKIP_RE = re.compile(
    r"\b(procurement|terms of use|privacy|contact us|sitemap|home|careers|"
    r"news|subscribe|newsletter|about|press|investor)\b",
    re.IGNORECASE,
)
STARTUP_RE = re.compile(r"\b(startup|accelerat|incubat|entrepreneur|emprendedor)\b", re.I)
GRANT_RE = re.compile(r"\b(grant|funding|research|challenge|innovation|fund)\b", re.I)


def _infer_type(text: str) -> tuple[str, str]:
    if STARTUP_RE.search(text):
        return "accelerator", "programa"
    if GRANT_RE.search(text):
        return "grant", "programa"
    return "grant", "programa"


def _cards(soup: BeautifulSoup) -> list:
    """Return candidate card elements from the page."""
    # Try progressively broader selectors
    for selector in (
        "article",
        "div.card",
        "[class*='card']",
        "[class*='call']",
        "[class*='opportunity']",
        "[class*='result']",
    ):
        found = soup.select(selector)
        if found:
            return found
    # Fallback: headings that might contain links
    return soup.find_all(["h2", "h3", "h4"])


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    for element in _cards(soup):
        anchor = element.find("a", href=True)
        if not anchor:
            continue

        href = anchor.get("href", "").strip()
        # Prefer a heading's text over the bare anchor text for a cleaner title
        heading = element.find(["h2", "h3", "h4"])
        text = " ".join((heading or anchor).get_text(" ", strip=True).split())
        if not text or len(text) < 10:
            continue
        if not CALL_RE.search(text):
            continue
        if SKIP_RE.search(text):
            continue

        full_url = urljoin(base_url, href)
        if not full_url.startswith(("https://", "http://")):
            continue
        if full_url in seen or full_url == base_url:
            continue
        seen.add(full_url)

        description = " ".join(element.get_text(" ", strip=True).split())[:4000]
        opp_type, opp_kind = _infer_type(text + " " + description[:400])

        rows.append({
            "title": text,
            "organization": "Inter-American Development Bank (IDB / BID)",
            "location": "Latin America and the Caribbean",
            "continent": "Americas",
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": full_url,
            "original_source_verified": True,
            "eligible_regions": ["LATAM", "CARIBBEAN"],
            "tags": ["IDB", "BID", "LATAM", opp_type],
            "description": description or text,
        })

    return rows


FALLBACK_URLS = [
    "https://www.iadb.org/en/search#q=call+for+proposals&f:language=[English]",
    "https://www.iadb.org/en/how-we-are-organized/department/decentralized-cooperation",
]


def extract() -> list[dict]:
    for url in [START_URL] + FALLBACK_URLS:
        try:
            response = requests.get(url, timeout=45, headers=HEADERS)
            if response.status_code == 403:
                print(f"{SOURCE_ID}: 403 blocked at {url} — trying next URL")
                continue
            response.raise_for_status()
            rows = parse(response.text)
            if rows:
                return rows
        except requests.RequestException as exc:
            print(f"{SOURCE_ID}: error fetching {url}: {exc}")
    print(
        f"{SOURCE_ID}: all URLs returned 0 results. "
        "The calls-proposals page requires JavaScript rendering; "
        "use Playwright/Pyppeteer in production for full results."
    )
    return []


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
