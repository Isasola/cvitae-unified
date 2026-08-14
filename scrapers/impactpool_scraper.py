"""Collect UN/NGO/multilateral jobs and internships from Impactpool for LATAM.

Source tier B — aggregator. original_source_required=True.
access_note: Tratar como agregador Tier B. Seguir application_url hasta el
ATS u organismo original para verificar vigencia, ubicacion, nacionalidad,
nivel, remuneracion y deadline. No asumir que un puesto internacional acepta
paraguayos. Deduplicar organismos que CVitae recolecte directamente.

NOTE: Impactpool renders results via JavaScript (React SPA). This scraper
attempts two strategies:
  1. JSON embedded in a <script id="__NEXT_DATA__"> tag (Next.js SSR).
  2. HTML card fallback for whatever the server returns.
If both yield 0 results, pass pre-rendered HTML from a headless browser
(Playwright) to parse() for production runs.
"""
from __future__ import annotations

import json
import os
import re
import time
from urllib.parse import urljoin, urlencode

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "impactpool"
BASE_URL = "https://www.impactpool.org"
SEARCH_URL = f"{BASE_URL}/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# LATAM country filters to use in separate requests
LATAM_QUERIES = [
    {"location": "Paraguay"},
    {"location": "Latin+America"},
    {"location": "Argentina"},
    {"location": "Bolivia"},
    {"location": "Peru"},
    {"location": "Colombia"},
]

SKIP_RE = re.compile(
    r"\b(login|register|sign up|subscribe|newsletter|privacy|terms|about|careers at)\b",
    re.IGNORECASE,
)
INTERNSHIP_RE = re.compile(r"\b(internship|pasant[ií]a|trainee|intern\b)\b", re.I)


def _infer_type(title: str) -> tuple[str, str]:
    if INTERNSHIP_RE.search(title):
        return "internship", "pasantia"
    return "job", "empleo"


def _parse_next_data(page: str) -> list[dict]:
    """Extract jobs from Next.js __NEXT_DATA__ JSON if present."""
    match = re.search(r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', page, re.S)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []

    # Walk common Next.js page prop paths
    props = data.get("props", {})
    page_props = props.get("pageProps", {})
    # Try various key paths used by job boards
    jobs_raw: list = (
        page_props.get("jobs")
        or page_props.get("results")
        or page_props.get("data", {}).get("jobs")
        or page_props.get("data", {}).get("results")
        or []
    )
    if not isinstance(jobs_raw, list):
        return []

    rows: list[dict] = []
    for item in jobs_raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        url = str(item.get("url") or item.get("link") or item.get("apply_url") or "").strip()
        if not title or not url:
            continue
        if not url.startswith(("https://", "http://")):
            url = urljoin(BASE_URL, url)
        org = str(item.get("organization") or item.get("org") or item.get("company") or "").strip()
        location_raw = item.get("location") or item.get("country") or {}
        if isinstance(location_raw, dict):
            location = str(location_raw.get("name") or location_raw.get("country") or "").strip()
        else:
            location = str(location_raw).strip()
        deadline = str(item.get("deadline") or item.get("closing_date") or "").strip()
        description = str(item.get("description") or item.get("summary") or "").strip()[:4000]
        opp_type, opp_kind = _infer_type(title)
        row: dict = {
            "title": title,
            "organization": org or "International organization via Impactpool",
            "location": location or "Latin America",
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": url,
            "source_url": url,
            "source": SOURCE_ID,
            "source_authority": "aggregator",
            "original_source_url": url,
            "original_source_verified": False,
            "eligible_regions": ["LATAM", "CARIBBEAN", "GLOBAL"],
            "tags": ["Impactpool", "ONU", "ONG", "multilateral", opp_type],
            "description": description,
        }
        if deadline:
            row["deadline"] = deadline
        rows.append(row)
    return rows


def _parse_html_cards(page: str, search_url: str) -> list[dict]:
    """Fallback: parse visible job cards from server-rendered HTML."""
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    # Impactpool uses various card class patterns; try the most common
    cards = (
        soup.select("article")
        or soup.select("[class*='job-card']")
        or soup.select("[class*='search-result']")
        or soup.select("[class*='listing']")
        or soup.select("li[class*='item']")
    )

    for card in cards:
        anchor = card.find("a", href=True)
        if not anchor:
            continue
        href = anchor.get("href", "").strip()
        heading = card.find(["h2", "h3", "h4"]) or anchor
        text = " ".join(heading.get_text(" ", strip=True).split())
        if not text or len(text) < 8:
            continue
        if SKIP_RE.search(text):
            continue

        full_url = urljoin(BASE_URL, href)
        if not full_url.startswith(("https://", "http://")):
            continue
        if full_url in seen:
            continue
        seen.add(full_url)

        org_el = card.find(class_=re.compile(r"org|company|employer", re.I))
        org = " ".join(org_el.get_text(" ", strip=True).split()) if org_el else ""
        loc_el = card.find(class_=re.compile(r"location|country|city", re.I))
        location = " ".join(loc_el.get_text(" ", strip=True).split()) if loc_el else "Latin America"
        description = " ".join(card.get_text(" ", strip=True).split())[:4000]
        opp_type, opp_kind = _infer_type(text)

        rows.append({
            "title": text,
            "organization": org or "International organization via Impactpool",
            "location": location,
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "aggregator",
            "original_source_url": full_url,
            "original_source_verified": False,
            "eligible_regions": ["LATAM", "CARIBBEAN", "GLOBAL"],
            "tags": ["Impactpool", "ONU", "ONG", "multilateral", opp_type],
            "description": description,
        })
    return rows


def _fetch_search(params: dict) -> str:
    url = SEARCH_URL + "?" + urlencode(params)
    try:
        response = requests.get(url, timeout=45, headers=HEADERS)
        response.raise_for_status()
        return response.text
    except requests.RequestException as exc:
        print(f"{SOURCE_ID}: error fetching {url}: {exc}")
        return ""


def extract() -> list[dict]:
    all_rows: list[dict] = []
    seen_urls: set[str] = set()

    for query_params in LATAM_QUERIES:
        page = _fetch_search(query_params)
        if not page:
            continue

        # Strategy 1: Next.js embedded JSON
        rows = _parse_next_data(page)
        # Strategy 2: HTML cards fallback
        if not rows:
            rows = _parse_html_cards(page, SEARCH_URL)

        for row in rows:
            url = row.get("application_url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                all_rows.append(row)

        time.sleep(1.5)

    if not all_rows:
        print(
            f"{SOURCE_ID}: 0 items extracted — Impactpool likely requires JavaScript. "
            "Pass rendered HTML from a headless browser to _parse_html_cards() or "
            "_parse_next_data() for production use."
        )
    return all_rows


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
