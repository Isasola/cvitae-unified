"""Collect recent vacancies from FIUNA's public job board."""
from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import datetime, timedelta

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "fiuna_job_board"
START_URL = "https://www.ing.una.py/FIUNA3/?page_id=12939"
HEADERS = {"User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)"}
MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def _published(text: str) -> datetime | None:
    match = re.search(r"Publicado el\s+(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+del\s+(\d{4})", text, re.I)
    if not match:
        return None
    month_name = unicodedata.normalize("NFKD", match.group(2)).encode("ascii", "ignore").decode("ascii").casefold()
    month = MONTHS.get(month_name)
    return datetime(int(match.group(3)), month, int(match.group(1))) if month else None


def _organization(title: str) -> str:
    parts = re.split(r"\s+busca\s+", title, maxsplit=1, flags=re.I)
    return parts[0].strip() if len(parts) == 2 else "Empresa publicada por FIUNA"


def parse(html: str, now: datetime | None = None, max_age_days: int = 60) -> list[dict]:
    now = now or datetime.now()
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict] = []
    for item in soup.select("details.e-n-accordion-item"):
        title_node = item.select_one("summary h5")
        body = item.select_one('[role="region"]')
        if not title_node or not body:
            continue
        title = title_node.get_text(" ", strip=True)
        body_text = body.get_text(" ", strip=True)
        published = _published(body_text)
        if not published or published < now - timedelta(days=max_age_days) or published > now + timedelta(days=1):
            continue

        item_id = item.get("id", "")
        source_url = f"{START_URL}#{item_id}" if item_id else START_URL
        is_internship = bool(re.search(r"\b(pasant[eií]|intern)\w*", title, re.I))
        emails = [link.get_text(" ", strip=True) for link in body.select('a[href^="mailto:"]')]
        rows.append({
            "title": title,
            "organization": _organization(title),
            "location": "Paraguay",
            "country_code": "PY",
            "opportunity_type": "internship" if is_internship else "job",
            "opportunity_kind": "pasantia" if is_internship else "empleo",
            "application_url": source_url,
            "source_url": source_url,
            "source": SOURCE_ID,
            "source_authority": "aggregator",
            "original_source_url": source_url,
            "original_source_verified": False,
            "eligible_countries": ["PY"],
            "published_at": published.date().isoformat(),
            "sector": "engineering",
            "tags": ["FIUNA", "ingeniería", "Paraguay"],
            "description": (body_text + (f" | Contacto publicado: {', '.join(emails)}" if emails else ""))[:4000],
        })
    return rows


def extract() -> list[dict]:
    response = requests.get(START_URL, timeout=45, headers=HEADERS)
    response.raise_for_status()
    return parse(response.text)


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    summary = OpportunitySink().upsert(extract())
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
