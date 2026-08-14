"""Collect Santander Open Academy scholarship programs with deadlines for LATAM.

Source tier B — Santander Open Academy aggregates programs from multiple
universities and organizations. Follow each program to the issuing institution
to verify eligibility, deadline, coverage and application channel.
access_note: Verificar pais de residencia, edad, institucion, modalidad,
idioma, cobertura, coste, deadline y bases en cada programa. Diferenciar
cursos permanentes de convocatorias con cupos y fecha limite.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "santander_open_academy"
START_URL = "https://www.santanderopenacademy.com/en/sites/scholarships.html"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

PROGRAM_RE = re.compile(
    r"\b(scholarship|grant|fellowship|bursary|award|program|programme|"
    r"mobility|exchange|training|course|master|study|academic)\b",
    re.IGNORECASE,
)
SKIP_RE = re.compile(
    r"\b(login|sign in|privacy|terms|contact|about|news|press|newsletter|"
    r"sitemap|home|language|faq|cookie|back|all programs|"
    r"fran[cç]ais|espa[nñ]ol|portugu[eê]s|deutsch)\b",
    re.IGNORECASE,
)
SKIP_DOMAINS = re.compile(r"(facebook|twitter|linkedin|instagram|youtube)", re.I)

# Permanent courses (no deadline) to skip
PERMANENT_RE = re.compile(
    r"\b(permanent|ongoing|open enrollment|sin fecha|no deadline|siempre abierto)\b",
    re.IGNORECASE,
)

EDUCATION_MAP = [
    (re.compile(r"\bphd\b|\bdoctorate?\b|\bdoctoral\b", re.I), "doctorate"),
    (re.compile(r"\bmaster\b|\bmaestría\b|\bm\.sc\b|\bm\.a\b", re.I), "masters"),
    (re.compile(r"\bundergraduate?\b|\bbachelor\b|\bgrado\b", re.I), "undergraduate"),
]

TRAINING_RE = re.compile(r"\b(course|training|bootcamp|workshop|diploma|certificat)\b", re.I)
MOBILITY_RE = re.compile(r"\b(mobility|exchange|intercambio|movilidad|erasmus)\b", re.I)


def _is_valid_url(url: str) -> bool:
    return url.startswith(("https://", "http://")) and not SKIP_DOMAINS.search(url)


def _education_level(text: str) -> str:
    for pattern, level in EDUCATION_MAP:
        if pattern.search(text):
            return level
    return "postgraduate"


def _infer_type(text: str, description: str) -> tuple[str, str]:
    combined = f"{text} {description}"
    if MOBILITY_RE.search(combined):
        return "exchange_program", "intercambio"
    if TRAINING_RE.search(combined):
        return "training", "curso"
    return "scholarship", "beca"


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
        or soup.find("div", id=re.compile(r"content|main|scholarships", re.I))
        or soup
    )

    # Try card selectors first
    cards = (
        main.select("article")
        or main.select("[class*='card']")
        or main.select("[class*='scholarship']")
        or main.select("[class*='program']")
        or main.select("[class*='item']")
    )

    processed_anchors: set[int] = set()

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
        if PERMANENT_RE.search(text):
            continue

        full_url = urljoin(base_url, href)
        if not _is_valid_url(full_url):
            continue
        if full_url in seen or full_url == base_url:
            continue
        seen.add(full_url)
        processed_anchors.add(id(anchor))

        description = " ".join(card.get_text(" ", strip=True).split())[:4000]
        edu_level = _education_level(text + " " + description[:400])
        opp_type, opp_kind = _infer_type(text, description[:400])

        rows.append({
            "title": text,
            "organization": "Santander Open Academy",
            "location": "Global / LATAM",
            "continent": "Americas",
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "aggregator",
            "original_source_url": full_url,
            "original_source_verified": False,
            "eligible_regions": ["LATAM"],
            "education_level": edu_level,
            "tags": ["Santander", "Open Academy", "scholarship", "LATAM", edu_level],
            "description": description or text,
        })

    # Fallback: scan all anchors
    if not rows:
        for anchor in main.find_all("a", href=True):
            if id(anchor) in processed_anchors:
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
            opp_type, opp_kind = _infer_type(text, description[:300])

            rows.append({
                "title": text,
                "organization": "Santander Open Academy",
                "location": "Global / LATAM",
                "continent": "Americas",
                "opportunity_type": opp_type,
                "opportunity_kind": opp_kind,
                "application_url": full_url,
                "source_url": full_url,
                "source": SOURCE_ID,
                "source_authority": "aggregator",
                "original_source_url": full_url,
                "original_source_verified": False,
                "eligible_regions": ["LATAM"],
                "education_level": edu_level,
                "tags": ["Santander", "Open Academy", "scholarship", "LATAM", edu_level],
                "description": description or text,
            })

    if not rows:
        print(
            f"{SOURCE_ID}: 0 items parsed from {START_URL}. "
            "Page may require JavaScript (React SPA). "
            "Provide rendered HTML via a headless browser for production use."
        )

    return rows


def extract() -> list[dict]:
    session = requests.Session()
    session.headers.update({
        **HEADERS,
        "Referer": "https://www.santanderopenacademy.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })

    try:
        resp = session.get(START_URL, timeout=45)
        if resp.status_code == 403:
            print(
                f"{SOURCE_ID}: HTTP 403 on {START_URL}. "
                "Site may require browser-level cookies. Returning 0 items."
            )
            return []
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
