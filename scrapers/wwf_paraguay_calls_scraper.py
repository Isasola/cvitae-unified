"""Discover recent consultancy calls from WWF Paraguay's official feed."""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "wwf_paraguay_calls"
START_URL = "https://www.wwf.org.py/informate/convocatorias/"
HEADERS = {"User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)"}
MONTHS = {"jan": 1, "ene": 1, "feb": 2, "mar": 3, "apr": 4, "abr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12, "dic": 12}


def _date(text: str) -> datetime | None:
    match = re.search(r"\b(\d{1,2})\s+([A-Za-záéíóú]{3,})\s+(\d{4})\b", text, re.I)
    if not match:
        return None
    month = MONTHS.get(match.group(2)[:3].casefold())
    return datetime(int(match.group(3)), month, int(match.group(1))) if month else None


def parse(page: str, now: datetime | None = None, max_age_days: int = 75) -> list[dict]:
    now = now or datetime.now()
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()
    for link in soup.find_all("a", href=True):
        title = " ".join(link.get_text(" ", strip=True).split())
        if len(title) < 20 or not re.search(r"llamado|consultor[ií]a|convocatoria|residencia", title, re.I):
            continue
        source_url = urljoin(START_URL, link["href"])
        host = urlparse(source_url).hostname or ""
        if not (host.endswith("wwf.org.py") or host.endswith("panda.org")) or source_url in seen:
            continue
        container = link.find_parent(["article", "li", "div"]) or link.parent
        context = " ".join(container.get_text(" ", strip=True).split()) if container else title
        published = _date(context)
        if not published or published < now - timedelta(days=max_age_days) or published > now + timedelta(days=1):
            continue
        seen.add(source_url)
        rows.append({
            "title": title, "organization": "WWF Paraguay", "location": "Paraguay / regional",
            "country_code": "PY", "opportunity_type": "consultancy", "opportunity_kind": "empleo",
            "application_url": source_url, "source_url": source_url, "source": SOURCE_ID,
            "source_authority": "original", "original_source_url": source_url,
            "original_source_verified": True, "eligible_countries": ["PY"],
            "published_at": published.date().isoformat(), "tags": ["WWF", "ambiente", "consultoría"],
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
