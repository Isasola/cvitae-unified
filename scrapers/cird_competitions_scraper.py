"""Collect consultancies and tenders from CIRD (Centro de Información y Recursos para el Desarrollo)."""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "cird_competitions_tenders"
START_URL = "https://www.cird.org.py/concurso/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}
CVITAE_REQUIRE_REVIEW = "1"

# Skip closed, cancelled or historical records
CLOSED_RE = re.compile(
    r"\b(cerrad[oa]|adjudicad[oa]|desierto|anulad[oa]|cancelad[oa]|vencid[oa]|"
    r"resultados?|ganadores?|finaliz[ao]d[oa]|prorroga\s+vencida|no\s+presentado)\b",
    re.IGNORECASE,
)
# Exclude pure commercial procurement / goods purchases (not professional services)
# access_note: "Excluir compras de equipos, licitaciones puramente comerciales"
GOODS_PROCUREMENT_RE = re.compile(
    r"\b(adquisici[oó]n de equipos?|compra de equipos?|suministro de equipos?|"
    r"adquisici[oó]n de materiales?|compra de materiales?|adquisici[oó]n de bienes?|"
    r"compra de veh[ií]culos?|adquisici[oó]n de veh[ií]culos?)\b",
    re.IGNORECASE,
)
# Detect tenders vs consultancies
TENDER_RE = re.compile(r"\b(licitaci[oó]n|adquisici[oó]n|compra\s+de|suministro)\b", re.IGNORECASE)
CONSULTANCY_RE = re.compile(
    r"\b(consultor[ií]a|consultor[/\s]a|servicio profesional|firma consultora|"
    r"facilitador|evaluador|experto|asistencia t[eé]cnica)\b",
    re.IGNORECASE,
)
# A deadline must be present — either an explicit date pattern or a keyword
DEADLINE_RE = re.compile(
    r"\b(?:fecha|plazo|cierre|hasta|l[ií]mite|entrega)[^\d]*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b",
    re.IGNORECASE,
)
DEADLINE_KEYWORD_RE = re.compile(
    r"\b(plazo|deadline|fecha.{0,20}cierre|hasta\s+el|fecha\s+l[ií]mite)\b",
    re.IGNORECASE,
)


def _infer_type(text: str) -> tuple[str, str]:
    if TENDER_RE.search(text):
        return "tender", "programa"
    if CONSULTANCY_RE.search(text):
        return "consultancy", "empleo"
    # Default for CIRD: professional consultancy unless clearly a tender
    return "consultancy", "empleo"


def _has_verifiable_deadline(context: str) -> bool:
    return bool(DEADLINE_RE.search(context) or DEADLINE_KEYWORD_RE.search(context))


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    # Try article cards first, fall back to headings
    candidates: list = soup.select("article, [class*='card'], [class*='concurso'], [class*='licitacion']")
    if not candidates:
        candidates = soup.find_all(["h1", "h2", "h3", "h4"])

    for element in candidates:
        heading = (
            element.find(["h1", "h2", "h3", "h4"])
            if element.name not in ("h1", "h2", "h3", "h4")
            else element
        )
        title = " ".join((heading or element).get_text(" ", strip=True).split())
        if len(title) < 10 or CLOSED_RE.search(title) or GOODS_PROCUREMENT_RE.search(title):
            continue

        container = (
            element
            if element.name not in ("h1", "h2", "h3", "h4")
            else (element.find_parent(["article", "section", "div", "li"]) or element.parent)
        )
        context = " ".join(container.get_text(" ", strip=True).split()) if container else title
        if CLOSED_RE.search(context):
            continue
        # Require a verifiable deadline for consultancies/tenders per access_note
        if not _has_verifiable_deadline(context):
            continue

        # Resolve application URL
        source_url = None
        for anchor in (container.select("a[href]") if container else []):
            href = urljoin(base_url, anchor.get("href", ""))
            if href.startswith("https://") and href not in (base_url, START_URL):
                source_url = href
                break
        if not source_url:
            anchor = (heading or element).find("a", href=True)
            if anchor:
                source_url = urljoin(base_url, anchor["href"])
        if not source_url or source_url in seen:
            continue
        seen.add(source_url)

        opp_type, opp_kind = _infer_type(title + " " + context[:500])
        rows.append({
            "title": title,
            "organization": "CIRD — Centro de Información y Recursos para el Desarrollo",
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
            "tags": ["CIRD", "consultoría", "licitación", "cooperación", "Paraguay", opp_kind],
            "description": context[:4000],
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
