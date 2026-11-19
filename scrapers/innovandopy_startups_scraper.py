"""Discover active startup calls from Innovando.py — MITIC's official innovation program."""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "innovandopy_startups"
START_URL = "https://innovando.gov.py/"
API_URL = "https://innovando.gov.py/wp-json/wp/v2/posts"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}
CVITAE_REQUIRE_REVIEW = "1"

# A post/heading must match at least one of these to be an actionable call
CALL_RE = re.compile(
    r"\b(convocatoria|postulaci[oó]n|inscripci[oó]n|capital semilla|concurso|"
    r"acelerador[ao]|incubaci[oó]n|programa|edici[oó]n|llamado)\b",
    re.IGNORECASE,
)
# Skip results, closed editions, award announcements
CLOSED_RE = re.compile(
    r"\b(cerrad[oa]|finaliz[ao]d[oa]|ganadores?|seleccionados?|resultados?|adjudicad[oa]|clausurad[oa])\b",
    re.IGNORECASE,
)
# Map keywords → (opportunity_type, opportunity_kind)
TYPE_MAP = [
    (re.compile(r"capital semilla", re.I), ("seed_capital", "programa")),
    (re.compile(r"acelerador[ao]|aceleraci[oó]n", re.I), ("accelerator", "programa")),
    (re.compile(r"incubaci[oó]n|incubadora", re.I), ("incubator", "programa")),
    (re.compile(r"concurso|competencia|premio", re.I), ("startup_competition", "concurso")),
]


def _clean(value: str) -> str:
    return " ".join(BeautifulSoup(value or "", "html.parser").get_text(" ", strip=True).split())


def _infer_type(text: str) -> tuple[str, str]:
    for pattern, result in TYPE_MAP:
        if pattern.search(text):
            return result
    return "seed_capital", "programa"


# ---------------------------------------------------------------------------
# Parser A: WordPress REST API
# ---------------------------------------------------------------------------

def parse_api(posts: list[dict], now: datetime | None = None, max_age_days: int = 120) -> list[dict]:
    now = now or datetime.now()
    rows: list[dict] = []
    for post in posts:
        title = _clean((post.get("title") or {}).get("rendered", ""))
        content = _clean((post.get("content") or {}).get("rendered", "")[:5000])
        combined = f"{title} {content}"
        if not title or not CALL_RE.search(combined):
            continue
        if CLOSED_RE.search(title):
            continue
        try:
            published = datetime.fromisoformat(
                str(post.get("date", "")).replace("Z", "+00:00")
            ).replace(tzinfo=None)
        except ValueError:
            continue
        modified_raw = str(post.get("modified") or post.get("date") or "")
        try:
            modified = datetime.fromisoformat(
                modified_raw.replace("Z", "+00:00")
            ).replace(tzinfo=None)
        except ValueError:
            modified = published
        if modified < now - timedelta(days=max_age_days):
            continue
        source_url = str(post.get("link") or "").strip()
        if not source_url.startswith("https://"):
            continue
        opp_type, opp_kind = _infer_type(combined)
        rows.append({
            "title": title,
            "organization": "Innovando.py / MITIC",
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
            "published_at": published.date().isoformat(),
            "tags": ["Innovando.py", "MITIC", "startups", "Paraguay", opp_kind],
            "description": content[:4000],
        })
    return rows


# ---------------------------------------------------------------------------
# Parser B: HTML fallback
# ---------------------------------------------------------------------------

def parse_html(page: str, base_url: str = START_URL) -> list[dict]:
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
        source_url = None
        for anchor in (container.select("a[href]") if container else []):
            href = urljoin(base_url, anchor.get("href", ""))
            if href.startswith("https://innovando.gov.py/") and href != base_url:
                source_url = href
                break
        if not source_url:
            anchor = heading.find("a", href=True)
            if anchor:
                source_url = urljoin(base_url, anchor["href"])
        if not source_url or source_url in seen:
            continue
        seen.add(source_url)
        opp_type, opp_kind = _infer_type(title + " " + context[:400])
        rows.append({
            "title": title,
            "organization": "Innovando.py / MITIC",
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
            "tags": ["Innovando.py", "MITIC", "startups", "Paraguay", opp_kind],
            "description": context[:4000],
        })
    return rows


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def extract() -> list[dict]:
    # 1. Try WordPress REST API (faster and structured)
    try:
        resp = requests.get(
            API_URL,
            params={"per_page": 50, "_fields": "id,date,modified,link,title,content"},
            timeout=30,
            headers=HEADERS,
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and data:
                rows = parse_api(data)
                if rows:
                    return rows
    except requests.RequestException as exc:
        print(f"{SOURCE_ID}: WP API unavailable: {exc}")

    # 2. Fallback: parse landing page HTML
    try:
        resp = requests.get(START_URL, timeout=45, headers=HEADERS)
        resp.raise_for_status()
        return parse_html(resp.text)
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
