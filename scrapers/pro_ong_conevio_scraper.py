"""Collect ONG jobs and volunteering from Conévio / PRO ONG Paraguay (Tier B aggregator).

Access note: Conévio is an aggregator. Every listing is followed to find the original
ONG's application URL. Records with no verifiable original source remain in review
with original_source_verified=False.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "pro_ong_conevio"
START_URL = "https://ong.com.py/listings/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}
CVITAE_REQUIRE_REVIEW = "1"
# Per-run limit on detail-page fetches to avoid hammering the server
MAX_DETAIL_FETCH = 20

VOLUNTEER_RE = re.compile(r"\b(voluntari[oa]|voluntariado|volunteer)\b", re.IGNORECASE)
CLOSED_RE = re.compile(
    r"\b(cerrad[oa]|finaliz[ao]d[oa]|vencid[oa]|expirad[oa]|no disponible|"
    r"ya no est[aá] disponible)\b",
    re.IGNORECASE,
)
# Anchor text patterns that signal the external application link
APPLY_RE = re.compile(
    r"\b(postul|aplicar|apply|ver oferta|inscrib|m[aá]s info|sitio oficial|visitar|ir a la oferta)\b",
    re.IGNORECASE,
)


def _infer_type(text: str) -> tuple[str, str]:
    if VOLUNTEER_RE.search(text):
        return "volunteering", "voluntariado"
    return "job", "empleo"


def _is_off_domain(url: str) -> bool:
    host = urlparse(url).hostname or ""
    return bool(host) and "ong.com.py" not in host


def _follow_to_original(detail_url: str) -> str | None:
    """Fetch Conévio detail page and return the original ONG application URL if found."""
    try:
        resp = requests.get(detail_url, timeout=20, headers=HEADERS)
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")
        # Priority 1: explicit apply/postulate link pointing off-domain
        for anchor in soup.find_all("a", href=True):
            href = anchor["href"].strip()
            full = href if href.startswith("http") else urljoin(detail_url, href)
            if _is_off_domain(full) and APPLY_RE.search(anchor.get_text(" ", strip=True)):
                return full
        # Priority 2: any off-domain link that looks like a career/vacancy URL
        for anchor in soup.find_all("a", href=True):
            href = anchor["href"].strip()
            full = href if href.startswith("http") else urljoin(detail_url, href)
            if _is_off_domain(full) and re.search(r"/vacanc|/empleo|/trabajo|/career|/job", full, re.I):
                return full
        return None
    except requests.RequestException:
        return None


def parse(page: str) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()
    for heading in soup.find_all(["h1", "h2", "h3", "h4"]):
        title = " ".join(heading.get_text(" ", strip=True).split())
        if len(title) < 8 or CLOSED_RE.search(title):
            continue
        container = heading.find_parent(["article", "li", "div"]) or heading.parent
        context = " ".join(container.get_text(" ", strip=True).split()) if container else title
        if CLOSED_RE.search(context):
            continue
        # Locate the Conévio detail page link
        detail_url = None
        anchor = heading.find("a", href=True)
        if anchor:
            detail_url = urljoin(START_URL, anchor["href"])
        if not detail_url:
            for a in (container.select("a[href]") if container else []):
                href = urljoin(START_URL, a.get("href", ""))
                if "ong.com.py" in (urlparse(href).hostname or ""):
                    detail_url = href
                    break
        if not detail_url or detail_url in seen or detail_url == START_URL:
            continue
        seen.add(detail_url)
        opp_type, opp_kind = _infer_type(title + " " + context[:400])
        rows.append({
            "_detail_url": detail_url,   # internal — stripped before upsert
            "title": title,
            "organization": "Conévio / PRO ONG Paraguay",
            "location": "Paraguay",
            "country_code": "PY",
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": detail_url,
            "source_url": detail_url,
            "source": SOURCE_ID,
            "source_authority": "aggregator",
            "original_source_url": detail_url,
            "original_source_verified": False,
            "eligible_countries": ["PY"],
            "tags": ["ONG", "Paraguay", "Conévio", opp_kind],
            "description": context[:4000],
        })
    return rows


def enrich_with_originals(rows: list[dict]) -> list[dict]:
    """Follow each Conévio detail page to replace the application_url with the ONG's own URL."""
    enriched: list[dict] = []
    fetched = 0
    for row in rows:
        detail_url = row.pop("_detail_url", None)
        if detail_url and fetched < MAX_DETAIL_FETCH:
            original = _follow_to_original(detail_url)
            fetched += 1
            if original:
                row["application_url"] = original
                row["original_source_url"] = original
                row["original_source_verified"] = True
        enriched.append(row)
    return enriched


def extract() -> list[dict]:
    try:
        resp = requests.get(START_URL, timeout=45, headers=HEADERS)
        resp.raise_for_status()
        rows = parse(resp.text)
        return enrich_with_originals(rows)
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
