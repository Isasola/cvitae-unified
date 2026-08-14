"""Collect DAAD scholarship and research funding programs for LATAM applicants.

Source tier B — DAAD official database (aggregates own and third-party programs).
access_note: Recolectar maestrias, doctorados y oportunidades de investigacion
en Alemania. Verificar nacionalidad, residencia, nivel, disciplina, idioma,
cobertura, deadline y financiador en cada ficha. Para programas de terceros,
seguir la convocatoria original antes de publicar.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin, urlencode

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "daad"
BASE_URL = "https://www2.daad.de"
START_URL = (
    "https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/"
    "?status=&daad=on&q=&page=1&lang=en"
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

PROGRAM_RE = re.compile(
    r"\b(scholarship|stipend|fellowship|grant|research|master|doctorate|"
    r"phd|postdoc|postgrad|study|program|programme|award|funding)\b",
    re.IGNORECASE,
)
SKIP_RE = re.compile(
    r"\b(login|sign in|privacy|terms|contact|about daad|news|press|"
    r"newsletter|sitemap|home|language|faq|cookie|datenschutz|impressum|"
    r"search|filter|sort|next page|prev|previous)\b",
    re.IGNORECASE,
)
SKIP_DOMAINS = re.compile(r"(facebook|twitter|linkedin|instagram|youtube)", re.I)

# Education level inference
EDUCATION_MAP = [
    (re.compile(r"\bphd\b|\bdoctorate?\b|\bdoctoral\b|\bpromotion\b", re.I), "doctorate"),
    (re.compile(r"\bmaster\b|\bmaestría\b|\bm\.sc\b|\bm\.a\b", re.I), "masters"),
    (re.compile(r"\bundergraduate?\b|\bbachelor\b|\bgrado\b", re.I), "undergraduate"),
    (re.compile(r"\bpostdoc\b|\bpost-?doctoral?\b|\bresearch stay\b|\bforschungs\b", re.I), "research"),
]


def _education_level(text: str) -> str:
    for pattern, level in EDUCATION_MAP:
        if pattern.search(text):
            return level
    return "postgraduate"


def _is_valid_url(url: str) -> bool:
    return url.startswith(("https://", "http://")) and not SKIP_DOMAINS.search(url)


def _description_from_container(anchor) -> str:
    container = anchor.find_parent(["article", "li", "div", "section"])
    if container:
        return " ".join(container.get_text(" ", strip=True).split())[:4000]
    return ""


def _infer_type(text: str, description: str) -> str:
    combined = f"{text} {description}".lower()
    if re.search(r"\b(research|forschung|postdoc|wissenschaft)\b", combined):
        return "research_funding"
    return "scholarship"


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    main = (
        soup.find("main")
        or soup.find("div", id=re.compile(r"content|main|result", re.I))
        or soup.find("div", class_=re.compile(r"result|list|program", re.I))
        or soup
    )

    # Try to find scholarship result cards/rows first
    cards = (
        main.select("article")
        or main.select("[class*='item']")
        or main.select("[class*='result']")
        or main.select("[class*='scholarship']")
        or main.find_all("li")
    )

    processed = set()
    for card in cards:
        anchor = card.find("a", href=True)
        if not anchor:
            continue

        href = anchor.get("href", "").strip()
        heading = card.find(["h2", "h3", "h4"])
        text = " ".join((heading or anchor).get_text(" ", strip=True).split())

        if not text or len(text) < 8:
            continue
        if not PROGRAM_RE.search(text) and not PROGRAM_RE.search(href):
            continue
        if SKIP_RE.search(text):
            continue

        full_url = urljoin(base_url, href)
        if not _is_valid_url(full_url):
            continue
        if full_url in seen or full_url == base_url:
            continue
        seen.add(full_url)
        processed.add(id(anchor))

        description = " ".join(card.get_text(" ", strip=True).split())[:4000]
        edu_level = _education_level(text + " " + description[:400])
        opp_type = _infer_type(text, description[:400])

        rows.append({
            "title": text,
            "organization": "DAAD — Deutscher Akademischer Austauschdienst",
            "location": "Germany",
            "continent": "Europe",
            "onsite_country": "DE",
            "opportunity_type": opp_type,
            "opportunity_kind": "beca",
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "aggregator",
            "original_source_url": full_url,
            "original_source_verified": False,
            "eligible_regions": ["LATAM"],
            "education_level": edu_level,
            "tags": ["DAAD", "Germany", edu_level, "LATAM", opp_type],
            "description": description or text,
        })

    # Fallback: scan all anchors on the page
    if not rows:
        for anchor in main.find_all("a", href=True):
            if id(anchor) in processed:
                continue
            href = anchor.get("href", "").strip()
            text = " ".join(anchor.get_text(" ", strip=True).split())

            if not text or len(text) < 8:
                continue
            if not PROGRAM_RE.search(text) and not PROGRAM_RE.search(href):
                continue
            if SKIP_RE.search(text):
                continue

            full_url = urljoin(base_url, href)
            if not _is_valid_url(full_url):
                continue
            if full_url in seen or full_url == base_url:
                continue
            seen.add(full_url)

            description = _description_from_container(anchor)
            edu_level = _education_level(text + " " + description[:300])
            opp_type = _infer_type(text, description[:300])

            rows.append({
                "title": text,
                "organization": "DAAD — Deutscher Akademischer Austauschdienst",
                "location": "Germany",
                "continent": "Europe",
                "onsite_country": "DE",
                "opportunity_type": opp_type,
                "opportunity_kind": "beca",
                "application_url": full_url,
                "source_url": full_url,
                "source": SOURCE_ID,
                "source_authority": "aggregator",
                "original_source_url": full_url,
                "original_source_verified": False,
                "eligible_regions": ["LATAM"],
                "education_level": edu_level,
                "tags": ["DAAD", "Germany", edu_level, "LATAM", opp_type],
                "description": description or text,
            })

    return rows


def extract() -> list[dict]:
    session = requests.Session()
    # Add a Referer and Accept header to reduce the chance of 403
    session.headers.update({
        **HEADERS,
        "Referer": "https://www.daad.de/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })

    rows: list[dict] = []
    try:
        resp = session.get(START_URL, timeout=45)
        if resp.status_code == 403:
            print(
                f"{SOURCE_ID}: HTTP 403 on {START_URL}. "
                "DAAD may require browser-level cookies or a headless session. "
                "Returning 0 items. Manual verification recommended."
            )
            return []
        resp.raise_for_status()
        rows = parse(resp.text)
        if not rows:
            print(
                f"{SOURCE_ID}: 0 items parsed from {START_URL}. "
                "Page may require JavaScript rendering (React/Angular). "
                "Provide rendered HTML via a headless browser for production use."
            )
    except requests.RequestException as exc:
        print(f"{SOURCE_ID}: error fetching {START_URL}: {exc}")

    return rows


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
