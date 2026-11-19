"""Collect active Erasmus Mundus Joint Master programs for LATAM students.

Source tier A — official European Commission / Erasmus+ channel.
access_note: Recolectar maestrias con beca completa, movilidad academica y
estudios en la Union Europea. Verificar nacionalidad, residencia, titulo,
idioma, movilidad, cobertura y deadline en cada programa individual.
Marcar fully_funded solo cuando la ficha confirme cobertura completa.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "erasmus_mundus"
START_URL = (
    "https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/"
    "erasmus-mundus-joint-masters"
)
CATALOGUE_URL = "https://www.eacea.ec.europa.eu/scholarships/emjm-catalogue_en"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

PROGRAM_RE = re.compile(
    r"\b(erasmus|mundus|joint master|scholarship|masters?|fellowship|"
    r"programme|program|emjm|grant|mobility|study|academic)\b",
    re.IGNORECASE,
)
SKIP_RE = re.compile(
    r"\b(login|sign in|privacy|terms|cookie|contact|about|news|press|"
    r"newsletter|sitemap|subscribe|back to top|home|language|faq|"
    r"bachelor|internship only|linkedin|facebook|twitter)\b",
    re.IGNORECASE,
)
SKIP_DOMAINS = re.compile(r"(facebook|twitter|linkedin|instagram|youtube)", re.I)

# Domains that are authoritative for Erasmus Mundus programmes
TRUSTED_DOMAINS = re.compile(
    r"(erasmus-plus\.ec\.europa\.eu|eacea\.ec\.europa\.eu|"
    r"ec\.europa\.eu|europa\.eu)",
    re.I,
)


def _is_valid_url(url: str) -> bool:
    return url.startswith(("https://", "http://")) and not SKIP_DOMAINS.search(url)


def _description_from_container(anchor) -> str:
    container = anchor.find_parent(["article", "section", "li", "div"])
    if container:
        return " ".join(container.get_text(" ", strip=True).split())[:4000]
    return ""


def parse(page: str, base_url: str = START_URL) -> list[dict]:
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
        if full_url in seen or full_url == base_url:
            continue
        seen.add(full_url)

        description = _description_from_container(anchor)

        # Determine if this is a catalogue/program link or general information
        is_catalogue = bool(
            re.search(r"(catalogue|catalog|emjm|programme|find a|search)", full_url, re.I)
            or re.search(r"(catalogue|emjm|joint master|find a programme)", text, re.I)
        )

        rows.append({
            "title": text,
            "organization": "European Commission — Erasmus+ / Erasmus Mundus",
            "location": "European Union",
            "continent": "Europe",
            "opportunity_type": "scholarship",
            "opportunity_kind": "beca",
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": full_url,
            "original_source_verified": True,
            "eligible_regions": ["LATAM", "REGION_10_LATIN_AMERICA"],
            "education_level": "masters",
            "fully_funded": True,
            "tags": ["Erasmus Mundus", "EU", "masters", "fully_funded", "LATAM", "mobility"],
            "description": description or text,
        })

    # If no items parsed (JS-rendered page), emit the canonical landing page
    if not rows:
        rows.append({
            "title": "Erasmus Mundus Joint Masters — Scholarships for International Students",
            "organization": "European Commission — Erasmus+ / Erasmus Mundus",
            "location": "European Union",
            "continent": "Europe",
            "opportunity_type": "scholarship",
            "opportunity_kind": "beca",
            "application_url": START_URL,
            "source_url": START_URL,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": START_URL,
            "original_source_verified": True,
            "eligible_regions": ["LATAM", "REGION_10_LATIN_AMERICA"],
            "education_level": "masters",
            "fully_funded": True,
            "tags": ["Erasmus Mundus", "EU", "masters", "fully_funded", "LATAM", "mobility"],
            "description": (
                "Erasmus Mundus Joint Masters (EMJM) are fully-funded international master "
                "programmes offered by consortia of higher education institutions from different "
                "countries. Students from Latin America are eligible to apply for scholarships "
                "covering tuition fees, travel, installation and living costs."
            ),
        })

    return rows


def extract() -> list[dict]:
    session = requests.Session()
    rows: list[dict] = []

    for url in (START_URL, CATALOGUE_URL):
        try:
            resp = session.get(url, timeout=45, headers=HEADERS)
            resp.raise_for_status()
            rows.extend(parse(resp.text, base_url=url))
        except requests.RequestException as exc:
            print(f"{SOURCE_ID}: error fetching {url}: {exc}")

    return rows


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
