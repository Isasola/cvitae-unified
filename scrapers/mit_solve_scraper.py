"""Collect active challenges from MIT Solve with open applications.

Source tier A — official MIT Solve channel.
access_note: Tratar cada challenge como convocatoria independiente. Publicar
solo desafíos con aplicaciones abiertas. Distinguir grant base de los equipos
seleccionados, premios condicionados, inversiones potenciales y apoyo no
monetario. Excluir eventos, application clinics, newsletters, challenges
pasados, directorio de Solvers y anuncios de próximas aperturas.

NOTE: solve.mit.edu renders challenge cards via JavaScript. Static HTML
often returns minimal content. If results are consistently empty, use a
headless browser (Playwright/Pyppeteer) and pass the rendered HTML to parse().
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "mit_solve"
START_URL = "https://solve.mit.edu/challenges"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

# At least one of these must appear in the title or card text
CHALLENGE_RE = re.compile(
    r"\b(challenge|competition|call|grant|innovation|impact|award|prize|"
    r"program|initiative|desaf[ií]o|concurso|convocatoria)\b",
    re.IGNORECASE,
)
# Skip generic nav / non-opportunity links
SKIP_RE = re.compile(
    r"\b(privacy|terms|contact|about|news|press|team|login|sign.?in|"
    r"solver profile|solvers|newsletter|event|summit|clinic|"
    r"apply to be a|judge|mentor|sponsor)\b",
    re.IGNORECASE,
)


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    # Try progressively broader selectors to find challenge cards
    elements: list = []
    for selector in (
        "article",
        "[class*='challenge']",
        "[class*='card']",
        "[class*='opportunity']",
        "li",
    ):
        found = soup.select(selector)
        if found:
            elements = found
            break
    if not elements:
        elements = soup.find_all(["h2", "h3"])

    for element in elements:
        anchor = element.find("a", href=True)
        if not anchor:
            if element.name == "a" and element.get("href"):
                anchor = element
            else:
                continue

        href = anchor.get("href", "").strip()
        heading = element.find(["h1", "h2", "h3", "h4"]) or anchor
        text = " ".join(heading.get_text(" ", strip=True).split())

        if not text or len(text) < 8:
            continue
        if SKIP_RE.search(text):
            continue
        if not CHALLENGE_RE.search(text) and not CHALLENGE_RE.search(href):
            continue

        full_url = urljoin(base_url, href)
        if not full_url.startswith(("https://", "http://")):
            continue
        if full_url in seen or full_url == base_url:
            continue
        # Only follow challenge detail pages — skip impact-area taxonomy pages
        # and other navigation sections (/impact/, /solvers/, /blog/, etc.)
        parsed_path = full_url.split("solve.mit.edu")[-1] if "solve.mit.edu" in full_url else ""
        if "solve.mit.edu" not in full_url:
            continue
        if parsed_path and not (
            parsed_path.startswith("/challenges/") or parsed_path == "/challenges"
        ):
            continue
        seen.add(full_url)

        card_text = " ".join(element.get_text(" ", strip=True).split())
        description = card_text[:4000]

        rows.append(
            {
                "title": text,
                "organization": "MIT Solve",
                "location": "Global (online)",
                "continent": "Americas",
                "opportunity_type": "startup_competition",
                "opportunity_kind": "concurso",
                "application_url": full_url,
                "source_url": full_url,
                "source": SOURCE_ID,
                "source_authority": "original",
                "original_source_url": full_url,
                "original_source_verified": True,
                "eligible_regions": ["GLOBAL"],
                "tags": ["MIT Solve", "innovation", "challenge", "social_impact", "GLOBAL"],
                "description": description or text,
            }
        )

    return rows


def extract() -> list[dict]:
    try:
        resp = requests.get(START_URL, timeout=45, headers=HEADERS)
        if resp.status_code == 403:
            print(f"{SOURCE_ID}: 403 blocked at {START_URL}")
            return []
        resp.raise_for_status()
        rows = parse(resp.text)
        if not rows:
            print(
                f"{SOURCE_ID}: 0 challenges parsed from static HTML. "
                "The challenges page uses React/JS rendering; "
                "use Playwright/Pyppeteer in production for full results."
            )
        return rows
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
