"""Collect open calls from MITIC's official Opportunities category."""
from __future__ import annotations

import html
import json
import os
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "mitic_opportunities"
START_URL = "https://mitic.gov.py/"
API_URL = "https://mitic.gov.py/wp-json/wp/v2/posts"
HEADERS = {"User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)"}
OPEN_STATUS = re.compile(r"\ben\s+convocatoria\b", re.IGNORECASE)
CLOSED_STATUS = re.compile(r"\b(evaluaci[oó]n|adjudicad[oa]s?|cerrad[oa]s?|finalizad[oa]s?|resultados?)\b", re.IGNORECASE)


def _clean(value: str) -> str:
    return " ".join(BeautifulSoup(html.unescape(value or ""), "html.parser").get_text(" ", strip=True).split())


def _application_url(rendered: str, source_url: str) -> str:
    # Every call currently links to the same authenticated portal. The official
    # detail page is the unique, auditable entry point with the exact role and
    # instructions; using the shared login URL would collapse distinct calls.
    return source_url


def parse(posts: list[dict], now: datetime | None = None) -> list[dict]:
    now = now or datetime.now()
    rows: list[dict] = []
    for post in posts:
        raw_title = _clean((post.get("title") or {}).get("rendered", ""))
        rendered = (post.get("content") or {}).get("rendered", "")
        content = _clean(rendered)
        if not raw_title or not OPEN_STATUS.search(raw_title) or CLOSED_STATUS.search(raw_title):
            continue
        try:
            published = datetime.fromisoformat(str(post.get("date", "")).replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            continue
        # A stale title must not remain a candidate forever. MITIC can promote it
        # again by updating the post or status when a call reopens.
        modified_raw = str(post.get("modified") or post.get("date") or "")
        try:
            modified = datetime.fromisoformat(modified_raw.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            modified = published
        if modified < now - timedelta(days=60):
            continue

        source_url = str(post.get("link") or "").strip()
        if not source_url.startswith("https://mitic.gov.py/"):
            continue
        title = re.sub(r"\s*[-–—]\s*en\s+convocatoria\s*$", "", raw_title, flags=re.IGNORECASE).strip()
        combined = f"{title} {content}".casefold()
        opportunity_type = "consultancy" if "consultor" in combined or "consultoría" in combined else "job"
        rows.append({
            "title": title,
            "organization": "Ministerio de Tecnologías de la Información y Comunicación (MITIC)",
            "location": "Paraguay",
            "country_code": "PY",
            "opportunity_type": opportunity_type,
            "opportunity_kind": "empleo",
            "application_url": _application_url(rendered, source_url),
            "source_url": source_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": source_url,
            "original_source_verified": True,
            "eligible_countries": ["PY"],
            "published_at": published.isoformat(),
            "tags": ["MITIC", "sector público", "tecnología", "consultoría" if opportunity_type == "consultancy" else "empleo"],
            "description": content[:4000],
        })
    return rows


def extract() -> list[dict]:
    response = requests.get(
        API_URL,
        params={"categories": 54, "per_page": 50, "_fields": "id,date,modified,link,title,content"},
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
