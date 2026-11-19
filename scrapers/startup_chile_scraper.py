"""Collect open acceleration calls from Startup Chile (CORFO).

Source tier A — official Startup Chile / CORFO channel.
access_note: Monitorear por separado Build, Ignite y Growth. Publicar solo
cuando exista convocatoria con bases, formulario y fecha de cierre verificados.
No publicar ediciones históricas, resultados ni anuncios de próximas aperturas.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "startup_chile"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

TRACKS = [
    {
        "url": "https://startupchile.org/en/apply/build/",
        "name": "Build",
    },
    {
        "url": "https://startupchile.org/en/apply/ignite/",
        "name": "Ignite",
    },
    {
        "url": "https://startupchile.org/en/apply/growth/",
        "name": "Growth",
    },
]

# Signals that an application window is OPEN
OPEN_RE = re.compile(
    r"\b(apply now|applications open|apply today|open for applications|"
    r"postula ahora|postulaciones abiertas|accepting applications|"
    r"submit your application|deadline|apply here|apply before|"
    r"closing date|fecha l[ií]mite|plazo de postulaci[oó]n|"
    r"applications close|open call)\b",
    re.IGNORECASE,
)
# Signals that a round is CLOSED or future-only
CLOSED_RE = re.compile(
    r"\b(applications closed|convocatoria cerrada|coming soon|"
    r"pr[oó]ximamente|stay tuned|join waitlist|be notified|"
    r"notify me|next cohort|closed)\b",
    re.IGNORECASE,
)


def parse_track(page: str, track: dict, base_url: str) -> dict | None:
    """Parse a single track page and return an opportunity dict or None."""
    soup = BeautifulSoup(page, "html.parser")
    body_text = " ".join(soup.get_text(" ", strip=True).split())

    # Require an open signal
    if not OPEN_RE.search(body_text):
        return None
    # Reject if explicitly closed / upcoming only (check first 2000 chars)
    if CLOSED_RE.search(body_text[:2000]) and not OPEN_RE.search(body_text[:500]):
        return None

    # Try to find the primary apply button/link
    apply_url = base_url
    for anchor in soup.find_all("a", href=True):
        txt = " ".join(anchor.get_text(" ", strip=True).split())
        if re.search(r"\b(apply now|apply here|postula|submit application|apply before)\b", txt, re.I):
            href = anchor.get("href", "").strip()
            candidate = urljoin(base_url, href)
            if candidate.startswith(("https://", "http://")):
                apply_url = candidate
                break

    # Pull the page title
    h1 = soup.find("h1")
    title_text = " ".join(h1.get_text(" ", strip=True).split()) if h1 else ""
    title = title_text or f"Startup Chile — {track['name']}"

    # Description: key sections (p, li) up to 4000 chars
    desc_parts = []
    for tag in soup.find_all(["p", "li"]):
        t = " ".join(tag.get_text(" ", strip=True).split())
        if t and len(t) > 20:
            desc_parts.append(t)
    description = " ".join(desc_parts)[:4000]

    return {
        "title": title,
        "organization": "Startup Chile / CORFO",
        "location": "Santiago, Chile",
        "continent": "Americas",
        "country_code": "CL",
        "opportunity_type": "accelerator",
        "opportunity_kind": "programa",
        "application_url": apply_url,
        "source_url": base_url,
        "source": SOURCE_ID,
        "source_authority": "original",
        "original_source_url": base_url,
        "original_source_verified": True,
        "eligible_regions": ["GLOBAL"],
        "equity_free": True,
        "tags": ["Startup Chile", "CORFO", track["name"], "accelerator", "equity_free", "GLOBAL"],
        "description": description or title,
    }


def extract() -> list[dict]:
    session = requests.Session()
    rows: list[dict] = []
    for track in TRACKS:
        try:
            resp = session.get(track["url"], timeout=45, headers=HEADERS)
            if resp.status_code == 403:
                print(f"{SOURCE_ID}: 403 blocked at {track['url']}")
                continue
            resp.raise_for_status()
            item = parse_track(resp.text, track, track["url"])
            if item:
                rows.append(item)
            else:
                print(f"{SOURCE_ID}: no open call detected for track {track['name']}")
        except requests.RequestException as exc:
            print(f"{SOURCE_ID}: error fetching {track['url']}: {exc}")
    return rows


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
