"""Collect vacancies from UCOM's public job board (Universidad Comunera).

UCOM uses a WordPress custom post type (CPT) called 'bolsa-de-trabajo' managed
through JetEngine/Elementor.  Posts are served via the WP REST API at:
  https://ucom.edu.py/wp-json/wp/v2/bolsa-de-trabajo

Each CPT entry represents one vacancy.  Content is often an embedded WhatsApp
image; the scraper records the title and CPT permalink as the entry point for
human review, which is required before any publication.
"""
from __future__ import annotations

import html as html_module
import json
import os
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "ucom_job_board"
START_URL = "https://ucom.edu.py/bolsa-de-trabajo/"
CPT_API_URL = "https://ucom.edu.py/wp-json/wp/v2/bolsa-de-trabajo"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}
OPERATIONAL_EXPIRY_DAYS = 90
MAX_ITEMS = 100

MONTHS_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}
_DATE_ISO = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_DATE_SLASH = re.compile(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})")
_DATE_WORDS = re.compile(
    r"(\d{1,2})\s+de\s+([A-Za-záéíóúñÑ]+)\s+(?:de\s+)?(\d{4})", re.I
)
# Exclude non-job academic content
EXCLUDED = re.compile(
    r"\b(diplomado|maestr[íi]a|licenciatura|postgrado|posgrado|feria\s+de\s+empleo|"
    r"evento|admisi[oó]n|bienvenid[oa]|calendario|carrera\s+de\s+grado)\b",
    re.IGNORECASE,
)


def _clean(text: str) -> str:
    return " ".join(BeautifulSoup(html_module.unescape(text or ""), "html.parser").get_text(" ", strip=True).split())


def _parse_date(text: str) -> datetime | None:
    m = _DATE_ISO.search(text)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    m = _DATE_SLASH.search(text)
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass
    m = _DATE_WORDS.search(text)
    if m:
        month = MONTHS_ES.get(m.group(2).lower())
        if month:
            try:
                return datetime(int(m.group(3)), month, int(m.group(1)))
            except ValueError:
                pass
    return None


def _op_deadline(published: datetime, now: datetime) -> str | None:
    expiry = published + timedelta(days=OPERATIONAL_EXPIRY_DAYS)
    return expiry.date().isoformat() if expiry > now else None


def _is_internship(text: str) -> bool:
    return bool(re.search(r"\b(pasant[eíiaeí]|intern|práctica\s+profesional)\b", text, re.I))


def _parse_cpt_posts(posts: list[dict], now: datetime) -> list[dict]:
    """Parse UCOM 'bolsa-de-trabajo' custom post type entries."""
    rows: list[dict] = []
    for post in posts:
        title = _clean((post.get("title") or {}).get("rendered", ""))
        if not title or len(title) < 5 or EXCLUDED.search(title):
            continue
        rendered = (post.get("content") or {}).get("rendered", "")
        content = _clean(rendered)
        try:
            published = datetime.fromisoformat(
                str(post.get("date", "")).replace("Z", "+00:00")
            ).replace(tzinfo=None)
        except ValueError:
            published = now
        if published < now - timedelta(days=OPERATIONAL_EXPIRY_DAYS):
            continue
        source_url = str(post.get("link") or "").strip()
        if not source_url.startswith("http"):
            continue
        internship = _is_internship(title + " " + content)
        # Content is often image-only; use title as fallback description
        description = content if len(content) > 20 else title
        rows.append({
            "title": title,
            "organization": "Empresa publicada por UCOM",
            "location": "Asunción, Paraguay",
            "country_code": "PY",
            "opportunity_type": "internship" if internship else "job",
            "opportunity_kind": "pasantia" if internship else "empleo",
            "application_url": source_url,
            "source_url": source_url,
            "source": SOURCE_ID,
            "source_authority": "aggregator",
            "original_source_url": source_url,
            "original_source_verified": False,
            "eligible_regions": ["PY"],
            "published_at": published.date().isoformat(),
            "deadline": _op_deadline(published, now),
            "tags": ["UCOM", "Universidad Comunera", "empleo", "Paraguay"],
            "description": description[:4000],
        })
    return rows


def _parse_html_fallback(html: str, base_url: str, now: datetime) -> list[dict]:
    """Fallback HTML parser using JetEngine field selectors."""
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    # Each JetEngine listing item has the title in .jet-listing-dynamic-field__content
    # and a button link in .jet-button__instance
    items = soup.select(".jet-listing-grid__item, .elementor-post, article")
    if not items:
        # Broader fallback: find each title+link pair
        titles = soup.select(".jet-listing-dynamic-field__content")
        links = soup.select(".jet-button__instance[href]")
        for title_node, link_node in zip(titles, links):
            title = title_node.get_text(" ", strip=True)
            href = link_node.get("href", "")
            source_url = urljoin(base_url, href)
            if len(title) < 5 or not source_url.startswith("http") or source_url in seen:
                continue
            if EXCLUDED.search(title):
                continue
            seen.add(source_url)
            internship = _is_internship(title)
            rows.append({
                "title": title,
                "organization": "Empresa publicada por UCOM",
                "location": "Asunción, Paraguay",
                "country_code": "PY",
                "opportunity_type": "internship" if internship else "job",
                "opportunity_kind": "pasantia" if internship else "empleo",
                "application_url": source_url,
                "source_url": source_url,
                "source": SOURCE_ID,
                "source_authority": "aggregator",
                "original_source_url": source_url,
                "original_source_verified": False,
                "eligible_regions": ["PY"],
                "published_at": now.date().isoformat(),
                "deadline": _op_deadline(now, now),
                "tags": ["UCOM", "Universidad Comunera", "empleo", "Paraguay"],
                "description": title,
            })
        return rows

    for item in items[:MAX_ITEMS]:
        link_node = item.select_one(".jet-button__instance[href], .entry-title a, h2 a, h3 a, a[href]")
        title_node = (
            item.select_one(".jet-listing-dynamic-field__content") or
            item.find(["h2", "h3", "h4"]) or
            link_node
        )
        if not link_node or not title_node:
            continue
        title = title_node.get_text(" ", strip=True)
        if len(title) < 5 or EXCLUDED.search(title):
            continue
        source_url = urljoin(base_url, link_node.get("href", ""))
        if not source_url.startswith("http") or source_url in seen:
            continue
        seen.add(source_url)
        time_node = item.find("time")
        date_raw = (time_node.get("datetime") or time_node.get_text()) if time_node else ""
        published = _parse_date(date_raw) or now
        if published < now - timedelta(days=OPERATIONAL_EXPIRY_DAYS):
            continue
        internship = _is_internship(title)
        rows.append({
            "title": title,
            "organization": "Empresa publicada por UCOM",
            "location": "Asunción, Paraguay",
            "country_code": "PY",
            "opportunity_type": "internship" if internship else "job",
            "opportunity_kind": "pasantia" if internship else "empleo",
            "application_url": source_url,
            "source_url": source_url,
            "source": SOURCE_ID,
            "source_authority": "aggregator",
            "original_source_url": source_url,
            "original_source_verified": False,
            "eligible_regions": ["PY"],
            "published_at": published.date().isoformat(),
            "deadline": _op_deadline(published, now),
            "tags": ["UCOM", "Universidad Comunera", "empleo", "Paraguay"],
            "description": item.get_text(" ", strip=True)[:4000],
        })
    return rows


def extract() -> list[dict]:
    now = datetime.now()

    # Primary: WP REST API for the 'bolsa-de-trabajo' custom post type
    try:
        resp = requests.get(
            CPT_API_URL,
            params={"per_page": MAX_ITEMS, "_fields": "id,date,link,title,content"},
            headers=HEADERS,
            timeout=30,
        )
        if resp.status_code == 200:
            posts = resp.json()
            if isinstance(posts, list) and posts:
                rows = _parse_cpt_posts(posts, now)
                if rows:
                    return rows
    except requests.RequestException:
        pass

    # Fallback: parse the HTML page with JetEngine selectors
    response = requests.get(START_URL, headers=HEADERS, timeout=45)
    response.raise_for_status()
    return _parse_html_fallback(response.text, START_URL, now)


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    summary = OpportunitySink().upsert(extract())
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
