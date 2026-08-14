"""Collect jobs, traineeships and grants from the EU Delegation in Paraguay (EEAS).

Source tier A — official EU/EEAS channel.
access_note: Recolectar empleo, traineeships, grants y tenders activos cuya
ficha confirme elegibilidad local, fecha limite y postulacion. Excluir
vacantes de otras delegaciones, noticias, resultados y programas reservados
a ciudadanos de la UE. Mantener tenders separados del feed profesional.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "eu_delegation_paraguay"
# Vacancies page for Paraguay delegation (s=188 = Paraguay office filter)
VACANCIES_URL = "https://www.eeas.europa.eu/eeas/vacantes_es?s=188"
DELEGATION_URL = "https://www.eeas.europa.eu/delegations/paraguay_es"
BASE_URL = "https://www.eeas.europa.eu"
HEADERS = {
    "User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "es,en;q=0.9",
}

# Date patterns: "Fecha límite: 15/09/2026" or "Deadline: 15 September 2026"
DEADLINE_RE = re.compile(
    r"(?:fecha l[ií]mite|deadline|closing date|cierre)[:\s]+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}|\d{1,2}\s+\w+\s+\d{4})",
    re.IGNORECASE,
)

EXCLUDE_RE = re.compile(
    r"\b(adjudicad|resultados?|cerrad|cancelad|privacidad|t[eé]rminos|cookies|sitemap|"
    r"inicio|noticias|prensa|acerca de|europa\.eu/web|login|newsletter)\b",
    re.IGNORECASE,
)

TENDER_RE = re.compile(r"\b(licitaci[oó]n|tender|concurso de contratos?|procurement)\b", re.I)
TRAINEESHIP_RE = re.compile(r"\b(traine|pr[aá]cticas?|pasant|internship)\b", re.I)
GRANT_RE = re.compile(r"\b(grant|subvenci[oó]n|beca|convocatoria de propuestas?|call for proposals?)\b", re.I)

MONTHS_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def _parse_deadline(text: str) -> str | None:
    """Return ISO date string if a deadline is found in text, else None."""
    match = DEADLINE_RE.search(text)
    if not match:
        return None
    raw = match.group(1).strip()
    # Numeric format: 15/09/2026 or 15-09-2026
    num = re.match(r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})$", raw)
    if num:
        d, m, y = int(num.group(1)), int(num.group(2)), int(num.group(3))
        if y < 100:
            y += 2000
        try:
            import datetime
            datetime.date(y, m, d)
            return f"{y:04d}-{m:02d}-{d:02d}"
        except ValueError:
            return None
    # Text format: "15 September 2026"
    text_match = re.match(r"(\d{1,2})\s+(\w+)\s+(\d{4})", raw, re.I)
    if text_match:
        month_name = text_match.group(2).casefold()
        month_num = MONTHS_ES.get(month_name)
        if month_num:
            try:
                import datetime
                d, y = int(text_match.group(1)), int(text_match.group(3))
                datetime.date(y, month_num, d)
                return f"{y:04d}-{month_num:02d}-{d:02d}"
            except ValueError:
                return None
    return None


def _infer_type(text: str) -> tuple[str, str]:
    if TENDER_RE.search(text):
        return "tender", "concurso"
    if TRAINEESHIP_RE.search(text):
        return "internship", "pasantia"
    if GRANT_RE.search(text):
        return "grant", "programa"
    return "job", "empleo"


def _parse_vacancies_page(page: str) -> list[dict]:
    """Parse the EEAS vacancies listing page filtered to Paraguay (s=188)."""
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    # EEAS Drupal site renders vacancies as view rows or article elements
    # Try multiple selectors for robustness
    cards = (
        soup.select("article")
        or soup.select(".views-row")
        or soup.select("[class*='vacancy']")
        or soup.select("[class*='job']")
        or soup.select("li[class*='item']")
    )
    if not cards:
        # Fallback: headings with links in main content
        main = soup.find("main") or soup
        cards = main.find_all(["h2", "h3", "h4"])

    for card in cards:
        anchor = card.find("a", href=True)
        if not anchor:
            continue
        href = anchor.get("href", "").strip()
        heading = card.find(["h2", "h3", "h4"]) or anchor
        text = " ".join(heading.get_text(" ", strip=True).split())
        if not text or len(text) < 8:
            continue
        if EXCLUDE_RE.search(text):
            continue

        full_url = urljoin(BASE_URL, href)
        if not full_url.startswith(("https://", "http://")):
            continue
        if full_url in seen:
            continue
        seen.add(full_url)

        context = " ".join(card.get_text(" ", strip=True).split())
        deadline = _parse_deadline(context)
        opp_type, opp_kind = _infer_type(text + " " + context[:400])

        row: dict = {
            "title": text,
            "organization": "European Union Delegation to Paraguay (EEAS)",
            "location": "Asunción, Paraguay",
            "country_code": "PY",
            "continent": "Americas",
            "opportunity_type": opp_type,
            "opportunity_kind": opp_kind,
            "application_url": full_url,
            "source_url": full_url,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": full_url,
            "original_source_verified": True,
            "eligible_regions": ["PY"],
            "eligible_countries": ["PY"],
            "tags": ["EU", "Union Europea", "EEAS", "Paraguay", opp_type],
            "description": context[:4000],
        }
        if deadline:
            row["deadline"] = deadline
        rows.append(row)

    return rows


def extract() -> list[dict]:
    rows: list[dict] = []
    for url, label in ((VACANCIES_URL, "vacantes"), (DELEGATION_URL, "delegacion")):
        try:
            response = requests.get(url, timeout=45, headers=HEADERS)
            response.raise_for_status()
            found = _parse_vacancies_page(response.text)
            print(f"{SOURCE_ID} [{label}]: {len(found)} items found")
            rows.extend(found)
        except requests.RequestException as exc:
            print(f"{SOURCE_ID}: error fetching {url}: {exc}")
    # Deduplicate by application_url
    seen: set[str] = set()
    unique: list[dict] = []
    for row in rows:
        url = row.get("application_url", "")
        if url and url not in seen:
            seen.add(url)
            unique.append(row)
    return unique


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
