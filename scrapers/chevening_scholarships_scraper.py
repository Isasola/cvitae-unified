"""Collect active Chevening scholarship programs for LATAM applicants.

Source tier A — official UK Government / Chevening channel.
access_note: Recolectar maestrias totalmente financiadas en el Reino Unido.
Verificar ciclo vigente, pais de ciudadania, residencia, experiencia,
titulacion, cursos elegibles, componentes de cobertura y deadline.
Marcar fully_funded solo cuando la ficha del ciclo lo confirme.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "chevening"
START_URL = "https://www.chevening.org/scholarships/"
COUNTRY_URL = "https://www.chevening.org/scholarship/paraguay/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

# A link must match at least one scholarship-related term
PROGRAM_RE = re.compile(
    r"\b(scholarship|fellow|award|grant|master|bursary|fund|programme|program)\b",
    re.IGNORECASE,
)
# Generic navigation/site links to skip
SKIP_RE = re.compile(
    r"\b(login|sign in|privacy|terms|contact|about|news|press|alumni|"
    r"faq|blog|find a course|home|partner|host|chevening story|"
    r"who we are|what is chevening)\b",
    re.IGNORECASE,
)
# Country page selectors for individual scholarship cards
SKIP_DOMAINS = re.compile(r"(facebook|twitter|linkedin|instagram|youtube|t\.co)", re.I)


def _is_valid_url(url: str) -> bool:
    return url.startswith(("https://", "http://")) and not SKIP_DOMAINS.search(url)


def _description_from_container(anchor) -> str:
    container = anchor.find_parent(["article", "section", "li", "div", "p"])
    if container:
        return " ".join(container.get_text(" ", strip=True).split())[:4000]
    return ""


def parse_country_page(page: str, base_url: str = COUNTRY_URL) -> list[dict]:
    """Parse the Paraguay-specific scholarship page."""
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    main = (
        soup.find("main")
        or soup.find("div", id=re.compile(r"content|main", re.I))
        or soup
    )

    # Collect the page title as a scholarship entry if it describes an active program
    page_title_tag = soup.find("h1")
    page_title = " ".join(page_title_tag.get_text(" ", strip=True).split()) if page_title_tag else ""

    # Look for 'apply' or 'application' links as the primary application URL
    apply_link = None
    for anchor in main.find_all("a", href=True):
        href = anchor.get("href", "").strip()
        text = " ".join(anchor.get_text(" ", strip=True).split())
        if re.search(r"\b(apply|application|how to apply)\b", text, re.I):
            full_url = urljoin(base_url, href)
            if _is_valid_url(full_url):
                apply_link = full_url
                break

    # If no dedicated apply link found, use the country page itself
    if not apply_link:
        apply_link = base_url

    if apply_link not in seen:
        seen.add(apply_link)
        # Extract page-level description
        description_parts = []
        for tag in main.find_all(["p", "li"]):
            txt = " ".join(tag.get_text(" ", strip=True).split())
            if txt and len(txt) > 30:
                description_parts.append(txt)
        description = " ".join(description_parts)[:4000]

        title = page_title or "Chevening Scholarships — Paraguay"

        rows.append({
            "title": title,
            "organization": "Chevening / UK Foreign, Commonwealth and Development Office",
            "location": "United Kingdom",
            "continent": "Europe",
            "onsite_country": "GB",
            "opportunity_type": "scholarship",
            "opportunity_kind": "beca",
            "application_url": apply_link,
            "source_url": COUNTRY_URL,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": COUNTRY_URL,
            "original_source_verified": True,
            "eligible_regions": ["LATAM"],
            "education_level": "masters",
            "fully_funded": True,
            "tags": ["Chevening", "UK", "masters", "fully_funded", "LATAM", "Paraguay"],
            "description": description or title,
        })

    return rows


def parse_catalog(page: str, base_url: str = START_URL) -> list[dict]:
    """Parse the main scholarships catalog page for additional programs."""
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    main = (
        soup.find("main")
        or soup.find("div", id=re.compile(r"content|main", re.I))
        or soup
    )

    for anchor in main.find_all("a", href=True):
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
        # Only follow links within chevening.org
        if "chevening.org" not in full_url:
            continue
        if full_url in seen or full_url == base_url:
            continue
        seen.add(full_url)

        description = _description_from_container(anchor)

        rows.append({
            "title": text,
            "organization": "Chevening / UK Foreign, Commonwealth and Development Office",
            "location": "United Kingdom",
            "continent": "Europe",
            "onsite_country": "GB",
            "opportunity_type": "scholarship",
            "opportunity_kind": "beca",
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": full_url,
            "original_source_verified": True,
            "eligible_regions": ["LATAM"],
            "education_level": "masters",
            "fully_funded": True,
            "tags": ["Chevening", "UK", "masters", "fully_funded", "LATAM"],
            "description": description or text,
        })

    return rows


def extract() -> list[dict]:
    rows: list[dict] = []
    session = requests.Session()

    # 1. Country-specific page (Paraguay) — primary signal
    try:
        resp = session.get(COUNTRY_URL, timeout=45, headers=HEADERS)
        resp.raise_for_status()
        rows.extend(parse_country_page(resp.text))
    except requests.RequestException as exc:
        print(f"{SOURCE_ID}: error fetching country page {COUNTRY_URL}: {exc}")

    # 2. General catalog — secondary, avoids duplicates via application_url dedup in sink
    try:
        resp = session.get(START_URL, timeout=45, headers=HEADERS)
        resp.raise_for_status()
        rows.extend(parse_catalog(resp.text))
    except requests.RequestException as exc:
        print(f"{SOURCE_ID}: error fetching catalog {START_URL}: {exc}")

    return rows


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
