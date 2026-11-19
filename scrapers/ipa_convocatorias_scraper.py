"""Discover current-year calls from Paraguay's official Handicrafts Institute."""
from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "ipa_convocatorias"
START_URL = "https://artesania.gov.py/convocatorias/"
HEADERS = {"User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)"}
EXCLUDE = re.compile(r"\b(ganadores?|seleccionad[oa]s?|resultados?|cerrad[oa]|finalizad[oa])\b", re.I)


def _slug(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")[:90]


def _type(title: str) -> tuple[str, str]:
    folded = title.casefold()
    if "capital semilla" in folded:
        return "seed_capital", "programa"
    if "tutor" in folded:
        return "consultancy", "empleo"
    return "startup_competition", "concurso"


def parse(page: str, year: int | None = None) -> list[dict]:
    year = year or datetime.now().year
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()
    for heading in soup.select("h2, h3, h4"):
        title = " ".join(heading.get_text(" ", strip=True).split())
        if len(title) < 8 or title in seen or EXCLUDE.search(title):
            continue
        container = heading.find_parent(["article", "section", "div"]) or heading.parent
        context = " ".join(container.get_text(" ", strip=True).split()) if container else title
        if str(year) not in context and str(year) not in title:
            continue
        if not re.search(r"capital semilla|premio|programa|convocatoria|encuentro|fashion week|feria", title, re.I):
            continue
        seen.add(title)
        links = [urljoin(START_URL, node.get("href")) for node in (container.select("a[href]") if container else [])]
        official = next((url for url in links if url.startswith("https://") and ("artesania.gov.py" in url or "forms.gle" in url)), None)
        source_url = official or f"{START_URL}#{_slug(title)}"
        opportunity_type, opportunity_kind = _type(title)
        rows.append({
            "title": title, "organization": "Instituto Paraguayo de Artesanía (IPA)",
            "location": "Paraguay", "country_code": "PY", "opportunity_type": opportunity_type,
            "opportunity_kind": opportunity_kind, "application_url": source_url, "source_url": source_url,
            "source": SOURCE_ID, "source_authority": "original", "original_source_url": source_url,
            "original_source_verified": True, "eligible_countries": ["PY"],
            "tags": ["artesanía", "Paraguay", opportunity_kind], "description": context[:4000],
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
