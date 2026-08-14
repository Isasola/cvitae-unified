"""Collect vacancies from FCQ-UNA's job board (Facultad de Ciencias Químicas, UNA).

Architecture note (2026-08):
  FCQ/UNA maintains one persistent WordPress post per career in the
  'bolsa-de-trabajo' category (category ID 74).  Each post is a running
  document that accumulates job listings chronologically, separated by a
  "Publicado el DD/MM/YYYY" line.

  Category posts API:
    GET https://www.qui.una.py/wp-json/wp/v2/posts
        ?categories=74&per_page=10&_fields=id,date,link,title,content

  This scraper:
  1. Fetches all posts in category 74 via the WP REST API.
  2. For each post, splits the content by "Publicado el" markers to extract
     individual listings.
  3. Only keeps listings published within the last OPERATIONAL_EXPIRY_DAYS.
  4. Builds a stable application_url by appending a per-listing index fragment
     to the post permalink (e.g. /post-slug/#listing-3).
"""
from __future__ import annotations

import hashlib
import html as html_module
import json
import os
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "fcq_una_job_board"
START_URL = "https://www.qui.una.py/category/bolsa-de-trabajo/"
DOMAIN_ROOT = "https://www.qui.una.py"
CATEGORY_ID = 74  # 'bolsa-de-trabajo' confirmed via WP REST API 2026-08
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
# Separator pattern used inside FCQ posts ("Publicado el 02/02/2023")
LISTING_SEP = re.compile(r"Publicado\s+el\s+\d{1,2}/\d{1,2}/\d{4}", re.I)
# Exclude internal FCQ academic/institutional content
EXCLUDED = re.compile(
    r"\b(concurso\s+(interno|externo|docente)|admisi[oó]n|feria.*realizada|"
    r"cerrad[oa]s?|ya\s+realizada|resultado|adjudicad[oa]s?)\b",
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


def _org_from_block(block: str) -> str:
    """Extract employer from 'Nombre de la empresa: ...' in a listing block."""
    m = re.search(r"Nombre\s+de\s+la\s+empresa\s*[:\-]\s*(.+?)(?:\n|Direcci|Perfil|$)", block, re.I)
    if m:
        name = m.group(1).strip().rstrip(".")
        if len(name) > 2:
            return name
    # Fallback: first line of the block may be "Empresa busca ..."
    first_line = block.split("\n")[0].strip() if "\n" in block else block[:80]
    match = re.match(r"^(.+?)\s+(?:busca|requiere|necesita|solicita|contrata)\b", first_line, re.I)
    if match:
        candidate = match.group(1).strip()
        if 2 < len(candidate) < 80:
            return candidate
    return "Empresa publicada por FCQ/UNA"


def _role_from_block(block: str) -> str | None:
    """Extract the job role from a listing block, if explicitly stated."""
    m = re.search(r"(?:Puesto|Cargo|Posici[oó]n|Role|Rol)\s*[:\-]\s*(.+?)(?:\n|Empresa|$)", block, re.I | re.S)
    return m.group(1).strip()[:120] if m else None


def _parse_listing_block(
    block: str,
    pub_date_line: str,
    post_url: str,
    block_index: int,
    career_tag: str,
    now: datetime,
) -> dict | None:
    """Convert one 'Publicado el ...' block to an opportunity row."""
    # pub_date_line is the full "Publicado el DD/MM/YYYY" string
    published = _parse_date(pub_date_line)
    if not published:
        return None
    if published < now - timedelta(days=OPERATIONAL_EXPIRY_DAYS) or published > now + timedelta(days=1):
        return None

    text = " ".join(block.split())  # collapse whitespace
    if len(text) < 20:
        return None

    organization = _org_from_block(block)
    role = _role_from_block(block)
    # Build a stable unique URL: post permalink + fragment derived from date+index
    fragment = hashlib.sha1(f"{pub_date_line}-{block_index}".encode()).hexdigest()[:8]
    source_url = f"{post_url}#listing-{fragment}"

    # Prefer an explicit role title; fall back to the career tag + employer
    if role:
        title = role
    else:
        # Try to derive a meaningful title from the block text
        first_sentence = re.split(r"[.!?\n]", text)[0][:120].strip()
        title = first_sentence if len(first_sentence) > 10 else f"Oportunidad en {organization}"

    if EXCLUDED.search(title):
        return None

    internship = _is_internship(title + " " + text)
    return {
        "title": title,
        "organization": organization,
        "location": "Paraguay",
        "country_code": "PY",
        "opportunity_type": "internship" if internship else "job",
        "opportunity_kind": "pasantia" if internship else "empleo",
        "application_url": source_url,
        "source_url": post_url,
        "source": SOURCE_ID,
        "source_authority": "aggregator",
        "original_source_url": post_url,
        "original_source_verified": False,
        "eligible_regions": ["PY"],
        "published_at": published.date().isoformat(),
        "deadline": _op_deadline(published, now),
        "sector": "chemistry",
        "tags": ["FCQ", "UNA", "química", career_tag, "Paraguay"],
        "description": text[:4000],
    }


def _career_tag(post_title: str) -> str:
    """Derive a short career label from the post title."""
    t = post_title.lower()
    if "bioquím" in t or "bioquim" in t:
        return "bioquímica"
    if "farmac" in t:
        return "farmacia"
    if "aliment" in t:
        return "alimentos"
    if "quím" in t or "quim" in t:
        return "química"
    if "ingenier" in t:
        return "ingeniería química"
    return "ciencias químicas"


def _parse_wp_posts(posts: list[dict], now: datetime) -> list[dict]:
    """Split each FCQ career post into individual listing blocks."""
    rows: list[dict] = []
    for post in posts:
        post_title = _clean((post.get("title") or {}).get("rendered", ""))
        rendered = (post.get("content") or {}).get("rendered", "")
        content = _clean(rendered)
        post_url = str(post.get("link") or "").strip()
        if not post_url.startswith("http"):
            continue
        career = _career_tag(post_title)

        # Split on "Publicado el DD/MM/YYYY" separator lines
        # Re-attach the separator to the following block
        parts = re.split(r"(Publicado\s+el\s+\d{1,2}/\d{1,2}/\d{4})", content, flags=re.I)
        # parts = [pre_text, "Publicado el ...", block1_text, "Publicado el ...", block2_text, ...]
        block_index = 0
        for i in range(1, len(parts), 2):
            pub_date_line = parts[i]
            block_text = parts[i + 1] if i + 1 < len(parts) else ""
            row = _parse_listing_block(
                block_text, pub_date_line, post_url, block_index, career, now
            )
            block_index += 1
            if row:
                rows.append(row)
                if len(rows) >= MAX_ITEMS:
                    return rows
    return rows


def _parse_html_fallback(html: str, base_url: str, now: datetime) -> list[dict]:
    """Fallback: parse the WordPress category archive page for article links."""
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    articles = soup.select("article") or soup.select(".post")
    for article in articles[:MAX_ITEMS]:
        link_node = (
            article.select_one(".entry-title a, h1 a, h2 a, h3 a, h4 a") or
            article.find("a", href=True)
        )
        if not link_node:
            continue
        title = link_node.get_text(" ", strip=True)
        if len(title) < 5 or EXCLUDED.search(title):
            continue
        source_url = urljoin(base_url, link_node["href"])
        if not source_url.startswith("http") or source_url in seen:
            continue
        seen.add(source_url)
        time_node = article.find("time")
        date_raw = (time_node.get("datetime") or time_node.get_text()) if time_node else ""
        published = _parse_date(date_raw) or _parse_date(article.get_text()) or now
        if published < now - timedelta(days=OPERATIONAL_EXPIRY_DAYS):
            continue
        internship = _is_internship(title)
        rows.append({
            "title": title,
            "organization": "Empresa publicada por FCQ/UNA",
            "location": "Paraguay",
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
            "sector": "chemistry",
            "tags": ["FCQ", "UNA", "química", "bioquímica", "farmacia", "Paraguay"],
            "description": article.get_text(" ", strip=True)[:4000],
        })
    return rows


def extract() -> list[dict]:
    now = datetime.now()

    # Primary: WP REST API for category 74 (bolsa-de-trabajo)
    try:
        resp = requests.get(
            f"{DOMAIN_ROOT}/wp-json/wp/v2/posts",
            params={
                "categories": CATEGORY_ID,
                "per_page": 10,  # small number; these are long aggregate posts
                "_fields": "id,date,link,title,content",
            },
            headers=HEADERS,
            timeout=30,
        )
        if resp.status_code == 200:
            posts = resp.json()
            if isinstance(posts, list) and posts:
                rows = _parse_wp_posts(posts, now)
                if rows:
                    return rows
    except requests.RequestException:
        pass

    # Fallback: HTML category archive page
    response = requests.get(START_URL, headers=HEADERS, timeout=45)
    response.raise_for_status()
    return _parse_html_fallback(response.text, START_URL, now)


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    summary = OpportunitySink().upsert(extract())
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
