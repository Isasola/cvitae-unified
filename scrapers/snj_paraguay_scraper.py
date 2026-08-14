"""Collect actionable youth scholarships and training from Paraguay's SNJ."""
from __future__ import annotations

import html
import json
import os
import re
import unicodedata
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "snj_paraguay"
START_URL = "https://snj.gov.py/"
API_URL = "https://snj.gov.py/2023/wp-json/wp/v2/posts"
HEADERS = {"User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)"}
ACTIONABLE = re.compile(r"\b(convocatoria|convoca|postulaciones?|inscripciones?|inscribite|becas?|cursos?|taller(?:es)?|capacitaci[oó]n|formaci[oó]n|intercambio)\b", re.IGNORECASE)
EXCLUDED = re.compile(r"\b(resultados?|seleccionad[oa]s?|adjudicad[oa]s?|informe|feria|voluntari[oa]s?|premios?)\b", re.IGNORECASE)
MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def _clean(value: str) -> str:
    return " ".join(BeautifulSoup(html.unescape(value or ""), "html.parser").get_text(" ", strip=True).split())


def _fold(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").casefold()


def _deadline(text: str, now: datetime) -> datetime | None:
    folded = _fold(text)
    match = re.search(r"(?:hasta|cierre|fecha limite)\s+(?:el\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?", folded)
    if not match or match.group(2) not in MONTHS:
        return None
    year = int(match.group(3) or now.year)
    try:
        return datetime(year, MONTHS[match.group(2)], int(match.group(1)), 23, 59, 59)
    except ValueError:
        return None


def _application_url(rendered: str, source_url: str) -> str:
    soup = BeautifulSoup(rendered or "", "html.parser")
    links = [urljoin(source_url, node.get("href", "")) for node in soup.select("a[href]")]
    preferred = re.compile(r"(postulacion|inscrip|forms\.gle|docs\.google\.com/forms|formulario|bit\.ly)", re.IGNORECASE)
    return next((link for link in links if link.startswith("https://") and preferred.search(link)), source_url)


def _type(text: str) -> tuple[str, str] | None:
    folded = _fold(text)
    if "beca" in folded:
        return "scholarship", "beca"
    if "intercambio" in folded:
        return "exchange_program", "intercambio"
    if any(term in folded for term in ("curso", "taller", "capacitacion", "formacion")):
        return "training", "curso"
    return None


def parse(posts: list[dict], now: datetime | None = None) -> list[dict]:
    now = now or datetime.now()
    rows: list[dict] = []
    for post in posts:
        title = _clean((post.get("title") or {}).get("rendered", ""))
        rendered = (post.get("content") or {}).get("rendered", "")
        content = _clean(rendered)
        combined = f"{title} {content}"
        # SNJ articles often mention scholarships or courses contextually. Only
        # a title that itself announces an actionable call can enter review.
        if not ACTIONABLE.search(title) or EXCLUDED.search(title):
            continue
        typed = _type(title)
        if not typed:
            continue
        try:
            published = datetime.fromisoformat(str(post.get("date", "")).replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            continue
        if published < now - timedelta(days=45):
            continue
        deadline = _deadline(combined, now)
        if deadline and deadline < now:
            continue
        source_url = str(post.get("link") or "").strip()
        if not source_url.startswith("https://snj.gov.py/"):
            continue
        opportunity_type, opportunity_kind = typed
        row = {
            "title": title,
            "organization": "Secretaría Nacional de la Juventud (SNJ)",
            "location": "Paraguay",
            "country_code": "PY",
            "opportunity_type": opportunity_type,
            "opportunity_kind": opportunity_kind,
            "application_url": _application_url(rendered, source_url),
            "source_url": source_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": source_url,
            "original_source_verified": True,
            "eligible_countries": ["PY"],
            "published_at": published.isoformat(),
            "tags": ["SNJ", "jóvenes", "Paraguay", opportunity_kind],
            "description": content[:4000],
        }
        if deadline:
            row["deadline"] = deadline.isoformat()
        rows.append(row)
    return rows


def extract() -> list[dict]:
    response = requests.get(
        API_URL,
        params={"per_page": 50, "_fields": "id,date,modified,link,title,content"},
        timeout=30,
        headers=HEADERS,
    )
    response.raise_for_status()
    return parse(response.json())


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    summary = OpportunitySink().upsert(extract())
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
