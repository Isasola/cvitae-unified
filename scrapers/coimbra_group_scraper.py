"""Collect Coimbra Group scholarship and research mobility programs for LATAM.

Source tier A — official Coimbra Group channel.
access_note: Recolectar estancias de investigacion y movilidad en universidades
europeas del Coimbra Group Scholarship Programme for Young Professors and
Researchers from Latin American Universities. Verificar ciclo vigente, pais
elegible, vinculo con universidad latinoamericana, grado academico, edad si
aplica, universidad anfitriona, duracion, cobertura y deadline.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "coimbra_group"
START_URL = "https://www.coimbra-group.eu/scholarships/grant-information-for-latin-america/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

PROGRAM_RE = re.compile(
    r"\b(scholarship|grant|fellowship|research|mobility|stay|programme|"
    r"program|professor|researcher|academic|university|latin america|latam)\b",
    re.IGNORECASE,
)
SKIP_RE = re.compile(
    r"\b(login|sign in|privacy|terms|contact|about|news|press|newsletter|"
    r"sitemap|home|language|faq|cookie|back to top|member universities|"
    r"facebook|twitter|linkedin)\b",
    re.IGNORECASE,
)
SKIP_DOMAINS = re.compile(r"(facebook|twitter|linkedin|instagram|youtube)", re.I)

# Coimbra Group scholarship types
RESEARCH_RE = re.compile(
    r"\b(research|researcher|professor|academic staff|scientific|investigaci[oó]n)\b",
    re.I,
)
EXCHANGE_RE = re.compile(
    r"\b(exchange|mobility|intercambio|movilidad|visit)\b",
    re.I,
)


def _is_valid_url(url: str) -> bool:
    return url.startswith(("https://", "http://")) and not SKIP_DOMAINS.search(url)


def _description_from_container(anchor) -> str:
    container = anchor.find_parent(["article", "section", "li", "div"])
    if container:
        return " ".join(container.get_text(" ", strip=True).split())[:4000]
    return ""


def _infer_type(text: str, description: str) -> str:
    combined = f"{text} {description}"
    if RESEARCH_RE.search(combined):
        return "research_funding"
    if EXCHANGE_RE.search(combined):
        return "exchange_program"
    return "research_funding"


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    main = (
        soup.find("main")
        or soup.find("div", id=re.compile(r"content|main|page", re.I))
        or soup
    )

    # Extract the page-level description to use as context
    page_description_parts = []
    for tag in main.find_all(["p", "li"]):
        txt = " ".join(tag.get_text(" ", strip=True).split())
        if txt and len(txt) > 30:
            page_description_parts.append(txt)
    page_context = " ".join(page_description_parts)[:2000]

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
        if not description:
            description = page_context

        opp_type = _infer_type(text, description[:400])
        opp_kind = "intercambio" if opp_type == "exchange_program" else "beca"

        rows.append({
            "title": text,
            "organization": "Coimbra Group — European University Network",
            "location": "Europe",
            "continent": "Europe",
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": full_url,
            "original_source_verified": True,
            "eligible_regions": ["LATAM"],
            "education_level": "postgraduate",
            "tags": ["Coimbra Group", "Europe", "research", "mobility", "LATAM"],
            "description": description or text,
        })

    # If no links found, emit the canonical landing page as a placeholder
    if not rows:
        rows.append({
            "title": "Coimbra Group Scholarship Programme for Latin American Researchers",
            "organization": "Coimbra Group — European University Network",
            "location": "Europe",
            "continent": "Europe",
            "opportunity_type": "research_funding",
            "opportunity_kind": "beca",
            "application_url": START_URL,
            "source_url": START_URL,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": START_URL,
            "original_source_verified": True,
            "eligible_regions": ["LATAM"],
            "education_level": "postgraduate",
            "tags": ["Coimbra Group", "Europe", "research", "mobility", "LATAM"],
            "description": page_context or (
                "The Coimbra Group Scholarship Programme offers research stays and academic "
                "mobility opportunities at European universities for young professors and "
                "researchers from Latin American universities."
            ),
        })

    return rows


def extract() -> list[dict]:
    try:
        resp = requests.get(START_URL, timeout=45, headers=HEADERS)
        resp.raise_for_status()
        return parse(resp.text)
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
