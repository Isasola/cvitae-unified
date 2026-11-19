"""Collect scholarships and job competitions from Entidad Binacional Yacyretá (EBY)."""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "eby_yacyreta"
START_URL = "https://eby.gov.py/"
# Sub-paths to probe after parsing the home page
CANDIDATE_PATHS = [
    "convocatorias/",
    "becas/",
    "llamados/",
    "oportunidades/",
    "concursos/",
    "recursos-humanos/",
]
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}
CVITAE_REQUIRE_REVIEW = "1"

# A heading must reference an active call or scholarship
CALL_RE = re.compile(
    r"\b(convocatoria|concurso|beca|llamado|proceso de selecci[oó]n|postulaci[oó]n|inscripci[oó]n)\b",
    re.IGNORECASE,
)
# Skip non-call or closed content
CLOSED_RE = re.compile(
    r"\b(cerrad[oa]|finaliz[ao]d[oa]|ganadores?|seleccionados?|resultados?|adjudicad[oa]|"
    r"renovaci[oó]n|desembolso|firma|noticias?|comunicado|licitaci[oó]n)\b",
    re.IGNORECASE,
)
SCHOLARSHIP_RE = re.compile(r"\bbeca\b", re.IGNORECASE)
# EBY operates in these departments; include in eligible regions when relevant
EBY_REGIONS = ["Itapúa", "Misiones", "Ñeembucú", "Caazapá"]


def _infer_type(text: str) -> tuple[str, str]:
    if SCHOLARSHIP_RE.search(text):
        return "scholarship", "beca"
    return "job", "empleo"


def _parse_page(page: str, base_url: str) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()
    for heading in soup.find_all(["h1", "h2", "h3", "h4"]):
        title = " ".join(heading.get_text(" ", strip=True).split())
        if len(title) < 8 or not CALL_RE.search(title) or CLOSED_RE.search(title):
            continue
        container = heading.find_parent(["article", "section", "div", "li"]) or heading.parent
        context = " ".join(container.get_text(" ", strip=True).split()) if container else title
        if CLOSED_RE.search(context):
            continue
        # Resolve application URL from container links
        source_url = None
        for anchor in (container.select("a[href]") if container else []):
            href = urljoin(base_url, anchor.get("href", ""))
            if href.startswith("https://") and href not in (START_URL, base_url):
                source_url = href
                break
        if not source_url:
            anchor = heading.find("a", href=True)
            if anchor:
                source_url = urljoin(base_url, anchor["href"])
        if not source_url or source_url in seen:
            continue
        seen.add(source_url)
        opp_type, opp_kind = _infer_type(title + " " + context[:500])
        # Determine eligible regions (EBY is binational — include department scope)
        eligible = EBY_REGIONS if opp_type == "scholarship" else []
        rows.append({
            "title": title,
            "organization": "Entidad Binacional Yacyretá (EBY)",
            "location": "Paraguay",
            "country_code": "PY",
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": source_url,
            "source_url": source_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": source_url,
            "original_source_verified": True,
            "eligible_countries": ["PY"],
            "eligible_regions": eligible,
            "tags": ["EBY", "Yacyretá", "Paraguay", opp_kind],
            "description": context[:4000],
        })
    return rows


def _discover_call_urls(main_page: str) -> list[str]:
    """Return internal EBY links that look like call or scholarship sections."""
    soup = BeautifulSoup(main_page, "html.parser")
    urls: list[str] = []
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        full = urljoin(START_URL, href)
        if not full.startswith("https://eby.gov.py/"):
            continue
        text = anchor.get_text(" ", strip=True).casefold()
        path_lower = href.casefold()
        if re.search(r"convocatoria|beca|concurso|llamado|oportunidad", text + path_lower, re.I):
            if full not in urls:
                urls.append(full)
    return urls


def extract() -> list[dict]:
    # Fetch home page
    try:
        resp = requests.get(START_URL, timeout=45, headers=HEADERS, verify=False)
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"{SOURCE_ID}: error fetching {START_URL}: {exc}")
        return []

    rows = _parse_page(resp.text, START_URL)

    # Build additional URLs to probe: discovered from nav + static candidates
    extra_urls = _discover_call_urls(resp.text)
    for path in CANDIDATE_PATHS:
        url = urljoin(START_URL, path)
        if url not in extra_urls:
            extra_urls.append(url)

    visited: set[str] = {START_URL}
    for url in extra_urls[:12]:
        if url in visited:
            continue
        visited.add(url)
        try:
            sub = requests.get(url, timeout=30, headers=HEADERS, verify=False)
            if sub.status_code == 200:
                rows.extend(_parse_page(sub.text, url))
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
