"""Collect active job and consultancy calls from CAF — Banco de Desarrollo de América Latina y el Caribe.

NOTE: The CAF convocatorias page may render listings via JavaScript.
If this scraper consistently returns 0 results, feed it rendered HTML from
a headless browser (Playwright / Pyppeteer) by calling parse() directly.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "caf_calls"
START_URL = "https://www.caf.com/es/trabaja-con-nosotros/convocatorias/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}
CVITAE_REQUIRE_REVIEW = "1"

# A title must contain at least one call keyword
CALL_RE = re.compile(
    r"\b(convocatoria|vacante|posici[oó]n|puesto|cargo|consultor[ií]a|consultor|"
    r"contrataci[oó]n|concurso|proceso de selecci[oó]n|empleo)\b",
    re.IGNORECASE,
)
# Generic navigation links and non-call pages to discard
SKIP_RE = re.compile(
    r"\b(inicio|home|contacto|sobre\s+caf|qui[eé]nes\s+somos|trabaja\s+con\s+nosotros|"
    r"noticias|publicaciones|privacidad|cookies|mapa\s+del\s+sitio|newsletter|"
    r"redes\s+sociales|twitter|linkedin|facebook)\b",
    re.IGNORECASE,
)
CLOSED_RE = re.compile(
    r"\b(cerrad[oa]|finaliz[ao]d[oa]|cancelad[oa]|adjudicad[oa]|seleccionad[oa]|"
    r"vencid[oa]|no\s+vigente)\b",
    re.IGNORECASE,
)
CONSULTANCY_RE = re.compile(
    r"\b(consultor[ií]a|consultor[/\s]a|firma|servicio profesional|asistencia t[eé]cnica)\b",
    re.IGNORECASE,
)

# Broad selectors tried in order; first one that yields elements wins
CARD_SELECTORS = [
    "article",
    "[class*='card']",
    "[class*='vacancy']",
    "[class*='vacante']",
    "[class*='job']",
    "[class*='call']",
    "[class*='convocatoria']",
    "[class*='item']",
]


def _infer_type(text: str) -> tuple[str, str]:
    if CONSULTANCY_RE.search(text):
        return "consultancy", "empleo"
    return "job", "empleo"


def _card_elements(soup: BeautifulSoup) -> list:
    for selector in CARD_SELECTORS:
        found = soup.select(selector)
        if found:
            return found
    # Ultimate fallback: headings that may contain links
    return soup.find_all(["h2", "h3", "h4"])


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    for element in _card_elements(soup):
        # Extract the best title from a heading inside the card, or the element text
        heading = (
            element.find(["h1", "h2", "h3", "h4"])
            if element.name not in ("h1", "h2", "h3", "h4")
            else element
        )
        title = " ".join((heading or element).get_text(" ", strip=True).split())
        if len(title) < 8 or SKIP_RE.search(title) or CLOSED_RE.search(title):
            continue
        if not CALL_RE.search(title):
            continue

        # Find the application link: prefer explicit "apply" anchors, then any href
        anchor = None
        container = element if element.name not in ("h1", "h2", "h3", "h4") else (
            element.find_parent(["article", "section", "div", "li"]) or element.parent
        )
        for a in (container.select("a[href]") if container else []):
            href = a.get("href", "").strip()
            if href and href not in ("#", "/"):
                anchor = a
                break
        if not anchor and element.name not in ("h1", "h2", "h3", "h4"):
            anchor = element.find("a", href=True)

        if not anchor:
            continue
        source_url = urljoin(base_url, anchor["href"])
        if not source_url.startswith("https://"):
            continue
        if source_url in seen or source_url == base_url:
            continue
        seen.add(source_url)

        description = " ".join((container or element).get_text(" ", strip=True).split())[:4000]
        opp_type, opp_kind = _infer_type(title + " " + description[:400])

        rows.append({
            "title": title,
            "organization": "CAF — Banco de Desarrollo de América Latina y el Caribe",
            "location": "América Latina y el Caribe",
            "continent": "Americas",
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": source_url,
            "source_url": source_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": source_url,
            "original_source_verified": True,
            "eligible_regions": ["LATAM", "CARIBBEAN"],
            "tags": ["CAF", "banco de desarrollo", "LATAM", opp_kind],
            "description": description or title,
        })
    return rows


def extract() -> list[dict]:
    try:
        resp = requests.get(START_URL, timeout=45, headers=HEADERS, verify=False)
        resp.raise_for_status()
        rows = parse(resp.text)
        if not rows:
            print(
                f"{SOURCE_ID}: 0 items parsed — the page likely requires JavaScript rendering. "
                "Supply rendered HTML via a headless browser to parse() for production use."
            )
        return rows
    except requests.RequestException as exc:
        print(f"{SOURCE_ID}: error fetching {START_URL}: {exc}")
        return []


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
