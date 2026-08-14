"""Collect active OAS/OEA scholarship programs for LATAM and Caribbean members.

Source tier A — official OEA channel.
access_note: Recolectar becas de grado y posgrado con deadline, elegibilidad y
application_url verificable. Verificar ciclo vigente, pais de ciudadania,
residencia, educacion, cobertura y deadline en cada programa.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "oas_scholarships"
START_URL = "https://www.oas.org/en/scholarships/"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9"}

# Must contain at least one scholarship / academic program term
PROGRAM_RE = re.compile(
    r"\b(scholarship|fellowship|grant|bursary|master|doctorate|doctoral|"
    r"undergraduate|postgraduate|academic|education|beca|posgrado|grado)\b",
    re.IGNORECASE,
)
# Generic site links to skip
SKIP_RE = re.compile(
    r"\b(login|privacy|terms|copyright|sitemap|home|contact|about oas|"
    r"espa[nñ]ol|portugu[eê]s|fran[cç]ais|donate|news|press|careers|"
    r"internship program|events|publications|media)\b",
    re.IGNORECASE,
)
# Map title text to education level
EDUCATION_MAP = [
    (re.compile(r"\bundergraduate?\b|\bbachelor\b|\bgrado\b", re.I), "undergraduate"),
    (re.compile(r"\bdoctorate\b|\bdoctoral\b|\bphd\b|\bdoctor\b", re.I), "doctorate"),
    (re.compile(r"\bmaster\b|\bmaestría\b|\bpostgrad\b", re.I), "masters"),
]


def _education_level(text: str) -> str:
    for pattern, level in EDUCATION_MAP:
        if pattern.search(text):
            return level
    return "postgraduate"


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    # OAS uses div#page but nav is inside div#navigation — remove it before scanning
    root = soup.find("div", id="page") or soup.find("main") or soup
    nav = root.find("div", id="navigation")
    if nav:
        nav.decompose()

    for anchor in root.find_all("a", href=True):
        href = anchor.get("href", "").strip()
        text = " ".join(anchor.get_text(" ", strip=True).split())

        if not text or len(text) < 8:
            continue
        # Must match program terms in the link text or href
        if not PROGRAM_RE.search(text) and not PROGRAM_RE.search(href):
            continue
        if SKIP_RE.search(text):
            continue

        full_url = urljoin(base_url, href)
        if not full_url.startswith(("https://", "http://")):
            continue
        if full_url in seen or full_url == base_url:
            continue
        seen.add(full_url)

        # Gather surrounding paragraph/section text for description
        container = anchor.find_parent(["article", "section", "li", "div"])
        description = ""
        if container:
            description = " ".join(container.get_text(" ", strip=True).split())[:4000]

        edu_level = _education_level(text + " " + description[:300])

        rows.append({
            "title": text,
            "organization": "Organization of American States (OAS / OEA)",
            "location": "Americas",
            "continent": "Americas",
            "opportunity_type": "scholarship",
            "opportunity_kind": "beca",
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": full_url,
            "original_source_verified": True,
            "eligible_regions": ["LATAM", "CARIBBEAN"],
            "education_level": edu_level,
            "tags": ["OAS", "OEA", "scholarship", "LATAM", edu_level],
            "description": description or text,
        })

    return rows


def extract() -> list[dict]:
    try:
        response = requests.get(START_URL, timeout=45, headers=HEADERS)
        response.raise_for_status()
        return parse(response.text)
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
