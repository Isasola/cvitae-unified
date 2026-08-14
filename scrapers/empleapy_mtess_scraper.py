"""Collect public vacancies from EmpleaPY – Paraguay's official MTESS job portal.

Architecture note (2026-08):
  The job database lives at https://bolsa.mtess.gov.py/vacancia_list.php, but that
  endpoint redirects to a login form for every unauthenticated request.  Login
  requires a Paraguayan cédula de identidad, which CVitae must never automate.

  This scraper therefore harvests only content that is reachable without any login:
  1. WordPress posts from emplea.mtess.gov.py (EmpleaPY Joven announcements and
     programme calls that are published as public WP posts).
  2. Any future public listing endpoint the MTESS may add.

  When bolsa.mtess.gov.py publishes a public search page or feed, update
  BOLSA_PUBLIC_URL below and implement _parse_bolsa_html / _parse_bolsa_json.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "empleapy_mtess"
START_URL = "https://emplea.mtess.gov.py/"
WP_API_URL = "https://emplea.mtess.gov.py/wp-json/wp/v2/posts"
# The bolsa URL requires login; kept here for when a public endpoint is added.
BOLSA_URL = "https://bolsa.mtess.gov.py/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-PY,es;q=0.9",
}
OPERATIONAL_EXPIRY_DAYS = 90
MAX_ITEMS = 100

ACTIONABLE = re.compile(
    r"\b(empleo|trabajo|vacante|plaza|contrataci[oó]n|convocatoria|postulaci[oó]n|"
    r"pasant[ií]a|oportunidad|cargo|puesto|oferta\s+laboral|EmpleaPY\s+Joven)\b",
    re.IGNORECASE,
)
EXCLUDED = re.compile(
    r"\b(resultados?|adjudicad[oa]s?|cerrad[oa]s?|lista\s+de\s+seleccionad[oa]s?)\b",
    re.IGNORECASE,
)
MONTHS_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def _clean(text: str) -> str:
    return " ".join(BeautifulSoup(text or "", "html.parser").get_text(" ", strip=True).split())


def _fold(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").casefold()


def _deadline(text: str, now: datetime) -> datetime | None:
    folded = _fold(text)
    m = re.search(
        r"(?:hasta|cierre|fecha\s+l[ií]mite|vencimiento|fecha\s+de\s+cierre)\s+(?:el\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?",
        folded,
    )
    if not m or m.group(2) not in MONTHS_ES:
        return None
    year = int(m.group(3) or now.year)
    try:
        return datetime(year, MONTHS_ES[m.group(2)], int(m.group(1)), 23, 59, 59)
    except ValueError:
        return None


def _op_deadline(published: datetime, now: datetime) -> str | None:
    expiry = published + timedelta(days=OPERATIONAL_EXPIRY_DAYS)
    return expiry.date().isoformat() if expiry > now else None


def _is_login_page(text: str) -> bool:
    """Return True if the response is a login/auth wall, not job content."""
    return "login.php" in text or "iniciar sesi" in text.lower() or "contraseña" in text.lower()


def _parse_wp_posts(posts: list[dict], now: datetime) -> list[dict]:
    """Extract actionable job/programme announcements from WP REST API posts."""
    rows: list[dict] = []
    for post in posts:
        title = _clean((post.get("title") or {}).get("rendered", ""))
        if not title or len(title) < 8:
            continue
        if not ACTIONABLE.search(title) or EXCLUDED.search(title):
            continue
        rendered = (post.get("content") or {}).get("rendered", "")
        content = _clean(rendered)
        try:
            published = datetime.fromisoformat(
                str(post.get("date", "")).replace("Z", "+00:00")
            ).replace(tzinfo=None)
        except ValueError:
            continue
        if published < now - timedelta(days=90):
            continue
        source_url = str(post.get("link") or "").strip()
        if not source_url.startswith("https://emplea.mtess.gov.py/"):
            continue
        dl = _deadline(f"{title} {content}", now)
        if dl and dl < now:
            continue
        rows.append({
            "title": title,
            "organization": "Ministerio del Trabajo, Empleo y Seguridad Social (MTESS)",
            "location": "Paraguay",
            "country_code": "PY",
            "opportunity_type": "job",
            "opportunity_kind": "empleo",
            "application_url": source_url,
            "source_url": source_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": source_url,
            "original_source_verified": True,
            "eligible_regions": ["PY"],
            "published_at": published.date().isoformat(),
            "deadline": dl.isoformat() if dl else _op_deadline(published, now),
            "tags": ["MTESS", "EmpleaPY", "empleo", "Paraguay"],
            "description": content[:4000],
        })
    return rows


def extract() -> list[dict]:
    now = datetime.now()

    # 1. Try the WordPress REST API for public posts on emplea.mtess.gov.py
    try:
        resp = requests.get(
            WP_API_URL,
            params={"per_page": MAX_ITEMS, "_fields": "id,date,link,title,content"},
            headers=HEADERS,
            timeout=30,
        )
        if resp.status_code == 200:
            posts = resp.json()
            if isinstance(posts, list) and posts:
                return _parse_wp_posts(posts, now)
    except requests.RequestException:
        pass

    # 2. Try the bolsa.mtess.gov.py public listing page (requires login as of 2026-08;
    #    if that changes, add parsing logic here).
    try:
        resp2 = requests.get(
            f"{BOLSA_URL}vacancia_list.php?page=list",
            headers=HEADERS,
            timeout=15,
            allow_redirects=True,
        )
        if resp2.status_code == 200 and not _is_login_page(resp2.text):
            # TODO: implement _parse_bolsa_html when MTESS adds a public listing
            pass
    except requests.RequestException:
        pass

    return []


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    summary = OpportunitySink().upsert(extract())
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
