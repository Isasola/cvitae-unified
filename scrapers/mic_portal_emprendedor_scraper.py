"""Collect active entrepreneur calls from MIC Portal Emprendedor and MiPymes.gov.py."""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "mic_portal_emprendedor"
START_URL = "https://portalemprendedor.mic.gov.py/"
SECONDARY_URL = "https://www.mipymes.gov.py/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}
CVITAE_REQUIRE_REVIEW = "1"

# A heading must match at least one active-call keyword
CALL_RE = re.compile(
    r"\b(convocatoria|postulaci[oó]n|inscripci[oó]n|concurso|programa|capital semilla|"
    r"capacitaci[oó]n|formaci[oó]n|llamado|taller|subsidio)\b",
    re.IGNORECASE,
)
# Skip closed, historical or result pages
CLOSED_RE = re.compile(
    r"\b(cerrad[oa]|finaliz[ao]d[oa]|ganadores?|seleccionados?|resultados?|vencid[oa]|"
    r"historial|archivo|edicion anterior|anteriores)\b",
    re.IGNORECASE,
)
# Type inference rules (first match wins)
TYPE_RULES = [
    (re.compile(r"capital semilla|fondo|subsidio", re.I), ("seed_capital", "programa")),
    (re.compile(r"capacitaci[oó]n|formaci[oó]n|taller|curso", re.I), ("training", "curso")),
    (re.compile(r"concurso|premio|competencia", re.I), ("startup_competition", "concurso")),
    (re.compile(r"acelerador[ao]|aceleraci[oó]n", re.I), ("accelerator", "programa")),
]


def _infer_type(text: str) -> tuple[str, str]:
    for pattern, result in TYPE_RULES:
        if pattern.search(text):
            return result
    return "startup_competition", "concurso"


def _parse_page(page: str, base_url: str, org: str) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()
    for heading in soup.find_all(["h1", "h2", "h3", "h4"]):
        title = " ".join(heading.get_text(" ", strip=True).split())
        if len(title) < 10 or not CALL_RE.search(title) or CLOSED_RE.search(title):
            continue
        container = heading.find_parent(["article", "section", "div"]) or heading.parent
        context = " ".join(container.get_text(" ", strip=True).split()) if container else title
        if CLOSED_RE.search(context):
            continue
        # Resolve the best application URL from links in the container
        source_url = None
        for anchor in (container.select("a[href]") if container else []):
            href = urljoin(base_url, anchor.get("href", ""))
            if href.startswith("https://") and href not in (base_url, START_URL, SECONDARY_URL):
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
        rows.append({
            "title": title,
            "organization": org,
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
            "tags": ["MIC", "emprendedor", "Paraguay", opp_kind],
            "description": context[:4000],
        })
    return rows


def extract() -> list[dict]:
    sources = [
        (START_URL, "Ministerio de Industria y Comercio (MIC) — Portal Emprendedor"),
        (SECONDARY_URL, "Viceministerio de MIPYMES — MIC Paraguay"),
    ]
    rows: list[dict] = []
    for url, org in sources:
        try:
            resp = requests.get(url, timeout=45, headers=HEADERS)
            resp.raise_for_status()
            rows.extend(_parse_page(resp.text, url, org))
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
