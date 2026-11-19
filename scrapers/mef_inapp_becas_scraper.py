"""Collect active cooperation scholarships from Paraguay's MEF/INAPP portal."""
from __future__ import annotations

import json
import os
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "mef_inapp_becas"
START_URL = "https://becas.mef.gov.py/cooperacion/"
HEADERS = {"User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)"}


def _date(value: str) -> datetime | None:
    try:
        return datetime.strptime(value.strip(), "%d/%m/%Y %H:%M")
    except ValueError:
        return None


def parse(html: str, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now()
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict] = []
    for card in soup.select("div.card.bg-card"):
        title_node = card.select_one(".card-body a[href] h6")
        detail_link = title_node.find_parent("a") if title_node else None
        if not title_node or not detail_link:
            continue

        fields: dict[str, str] = {}
        for node in card.select(".card-body .d-flex h6"):
            label = node.select_one("b")
            value = node.select_one("strong")
            if label and value:
                fields[label.get_text(" ", strip=True).rstrip(":").casefold()] = value.get_text(" ", strip=True)

        deadline_raw = fields.get("límite de postulación", "")
        deadline = _date(deadline_raw)
        if not deadline or deadline < now:
            continue

        postulate = card.select_one("a.btnPostular[href]")
        application_url = urljoin(START_URL, (postulate or detail_link).get("href", ""))
        detail_url = urljoin(START_URL, detail_link.get("href", ""))
        organization = (card.select_one(".card-body p strong") or {}).get_text(" ", strip=True) if card.select_one(".card-body p strong") else "MEF / INAPP"
        financing = fields.get("financiamiento", "")
        level = fields.get("nivel", "")
        mode = fields.get("modalidad", "")
        place = fields.get("lugar", "")
        rows.append({
            "title": title_node.get_text(" ", strip=True),
            "organization": organization,
            "location": place or "Paraguay",
            "country_code": "PY",
            "opportunity_type": "scholarship",
            "opportunity_kind": "beca",
            "application_url": application_url,
            "source_url": detail_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": detail_url,
            "original_source_verified": True,
            "eligible_countries": ["PY"],
            "funding_type": financing or None,
            "fully_funded": financing.casefold() == "total",
            "education_level": level or None,
            "deadline": deadline.isoformat(),
            "tags": [value for value in (organization, financing, level, mode, place) if value],
            "description": " | ".join(
                f"{label.title()}: {value}" for label, value in fields.items() if label != "visita"
            ),
        })
    return rows


def extract() -> list[dict]:
    response = requests.get(START_URL, timeout=30, headers=HEADERS)
    response.raise_for_status()
    return parse(response.text)


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    summary = OpportunitySink().upsert(extract())
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
