"""Collect One Young World fellowship and grant programs for LATAM applicants.

Source tier A — official One Young World channel.
access_note: Recolectar fellowships, programas de liderazgo y algunos grants
vinculados al Summit de One Young World. Verificar region, edad, sector,
identidad, cobertura, sede, deadline y socio financiador en cada ficha.
Marcar funded_travel o grant solo cuando la convocatoria lo confirme.
Excluir contenido editorial, plazas de pago y ediciones pasadas.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "one_young_world_scholarships"
START_URL = "https://www.oneyoungworld.com/scholarships"
APPLY_URL = "https://apply.oneyoungworld.com/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

PROGRAM_RE = re.compile(
    r"\b(scholarship|fellow|fellowship|grant|award|program|programme|"
    r"leadership|funded|summit|apply|latin america|latam|caribe|caribbean)\b",
    re.IGNORECASE,
)
SKIP_RE = re.compile(
    r"\b(login|sign in|privacy|terms|contact|about|news|press|newsletter|"
    r"sitemap|home|language|faq|cookie|back|ambassador|counsellor|"
    r"speaker|delegate|past summit|stories|blog|media)\b",
    re.IGNORECASE,
)
SKIP_DOMAINS = re.compile(r"(facebook|twitter|linkedin|instagram|youtube|t\.co)", re.I)

FELLOWSHIP_RE = re.compile(r"\b(fellow|fellowship|leadership|liderazgo)\b", re.I)
GRANT_RE = re.compile(r"\b(grant|award|funded|financiad|prize|beca)\b", re.I)
FUNDED_TRAVEL_RE = re.compile(r"\b(funded travel|viaje financiad|travel grant|transport)\b", re.I)


def _is_valid_url(url: str) -> bool:
    return url.startswith(("https://", "http://")) and not SKIP_DOMAINS.search(url)


def _description_from_container(anchor) -> str:
    container = anchor.find_parent(["article", "section", "li", "div"])
    if container:
        return " ".join(container.get_text(" ", strip=True).split())[:4000]
    return ""


def _infer_type(text: str, description: str) -> tuple[str, str]:
    combined = f"{text} {description}"
    if FELLOWSHIP_RE.search(combined):
        return "fellowship", "programa"
    if GRANT_RE.search(combined):
        return "grant", "programa"
    return "fellowship", "programa"


def _is_funded(text: str, description: str) -> bool:
    combined = f"{text} {description}"
    return bool(
        re.search(r"\b(fully funded|all expenses|travel funded|financiad|covered|cubierto)\b", combined, re.I)
    )


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
        or main.select("[class*='fellowship']")
        or main.select("[class*='program']")
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

        full_url = urljoin(base_url, href)
        if not _is_valid_url(full_url):
            continue
        if full_url in seen or full_url == base_url:
            continue
        seen.add(full_url)
        processed_anchors.add(id(anchor))

        description = " ".join(card.get_text(" ", strip=True).split())[:4000]
        opp_type, opp_kind = _infer_type(text, description[:400])
        funded = _is_funded(text, description[:400])

        rows.append({
            "title": text,
            "organization": "One Young World",
            "location": "Global",
            "continent": "Global",
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": full_url,
            "original_source_verified": True,
            "eligible_regions": ["LATAM", "CARIBBEAN", "GLOBAL"],
            "fully_funded": funded,
            "tags": ["One Young World", "fellowship", "leadership", "LATAM", opp_type],
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
            opp_type, opp_kind = _infer_type(text, description[:300])
            funded = _is_funded(text, description[:300])

            rows.append({
                "title": text,
                "organization": "One Young World",
                "location": "Global",
                "continent": "Global",
                "opportunity_type": opp_type,
                "opportunity_kind": opp_kind,
                "application_url": full_url,
                "source_url": full_url,
                "source": SOURCE_ID,
                "source_authority": "original",
                "original_source_url": full_url,
                "original_source_verified": True,
                "eligible_regions": ["LATAM", "CARIBBEAN", "GLOBAL"],
                "fully_funded": funded,
                "tags": ["One Young World", "fellowship", "leadership", "LATAM", opp_type],
                "description": description or text,
            })

    return rows


def extract() -> list[dict]:
    session = requests.Session()
    session.headers.update({
        **HEADERS,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })

    rows: list[dict] = []

    # 1. Scholarships landing page
    for url in (START_URL, APPLY_URL):
        try:
            resp = session.get(url, timeout=45)
            if resp.status_code == 403:
                print(f"{SOURCE_ID}: HTTP 403 on {url} — skipping.")
                continue
            resp.raise_for_status()
            found = parse(resp.text, base_url=url)
            rows.extend(found)
            if not found:
                print(
                    f"{SOURCE_ID}: 0 items from {url}. "
                    "Page may require JavaScript. Use a headless browser for production."
                )
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
