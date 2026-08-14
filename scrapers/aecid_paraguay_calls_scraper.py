"""Discover recent actionable calls from AECID's official Paraguay office."""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "aecid_paraguay_calls"
START_URL = "https://paraguay.aecid.es/convocatorias"
HEADERS = {"User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)"}
EXCLUDE = re.compile(r"\b(admitidos?|excluidos?|resultados?|adjudicad|subasta|veh[ií]culo|cancelad|cerrad)\b", re.I)
DATE = re.compile(r"(?:Fecha de publicaci[oó]n|Date of publication):\s*(\d{2})/(\d{2})/(\d{4})", re.I)


def parse(page: str, now: datetime | None = None, max_age_days: int = 150) -> list[dict]:
    now = now or datetime.now()
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        raw_title = " ".join(heading.get_text(" ", strip=True).split())
        if not re.search(r"t[ií]tulo del anuncio|title of the announcement", raw_title, re.I):
            continue
        title = re.sub(r"^(?:T[ií]tulo del anuncio|Title of the announcement):\s*", "", raw_title, flags=re.I)
        link = heading.find_next("a", href=True, string=re.compile(r"leer m[aá]s|read more", re.I))
        if not link:
            continue
        previous_date = heading.find_previous(string=re.compile(r"(?:Fecha de publicaci[oó]n|Date of publication):", re.I))
        date_match = DATE.search(str(previous_date or ""))
        if not date_match:
            continue
        published = datetime(int(date_match.group(3)), int(date_match.group(2)), int(date_match.group(1)))
        if published < now - timedelta(days=max_age_days) or published > now + timedelta(days=1):
            continue
        if len(title) < 12 or EXCLUDE.search(title):
            continue
        source_url = urljoin(START_URL, link["href"])
        if source_url in seen:
            continue
        seen.add(source_url)
        container = heading.find_parent(["article", "li"]) or heading.parent
        context = " ".join(container.get_text(" ", strip=True).split()) if container else title
        is_job = bool(re.search(r"personal laboral|ingreso como|mayordomo", title, re.I))
        rows.append({
            "title": title, "organization": "AECID / Oficina de Cooperación Española en Paraguay",
            "location": "Asunción, Paraguay", "country_code": "PY",
            "opportunity_type": "job" if is_job else "consultancy", "opportunity_kind": "empleo",
            "application_url": source_url, "source_url": source_url, "source": SOURCE_ID,
            "source_authority": "original", "original_source_url": source_url,
            "original_source_verified": True, "eligible_countries": ["PY"],
            "published_at": published.date().isoformat(), "tags": ["cooperación", "AECID", "Paraguay"],
            "description": context[:4000],
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
