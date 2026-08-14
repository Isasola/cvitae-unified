"""Monitor Becas Gobierno del Paraguay (ITAIPU) for new scholarship calls.

Source tier A — official Becas Gobierno del Paraguay / ITAIPU Binacional channel.
access_note: La convocatoria 2026 ya cerró (beneficiarios definitivos publicados).
Monitorear el portal principal para la siguiente convocatoria. Exigir bases,
carreras habilitadas, requisitos, cronograma y postulación vigente antes de
publicar. Noticias de ITAIPU son apoyo de verificación: excluir resultados,
exámenes, renovaciones, firmas de acuerdos y desembolsos.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "becas_gobierno_itaipu"
PORTAL_URL = "https://becasgobierno.gov.py/sgbc/DashPrincipal.aspx"
NEWS_URL = "https://www.itaipu.gov.py/noticias/tag/convocatoria-2026/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

# Signals a new open call — requires explicit "abierta/abiertas/abierto" or
# active inscription language; "convocatoria YYYY" alone is NOT enough because
# the portal always shows the current cycle title even after it closes.
OPEN_CALL_RE = re.compile(
    r"\b(convocatoria abierta|nueva convocatoria|inscripciones abiertas|"
    r"apertura de inscripciones|se abre la convocatoria|postulaciones abiertas|"
    r"nuevo llamado|beca.*abierta|"
    r"plazo de inscripci[oó]n.*\d{4}|plazo de postulaci[oó]n.*\d{4}|"
    r"postular ahora|aplica ahora|applications open|"
    r"inscrib[ií].*ahora|regist.*postulaci[oó]n)\b",
    re.IGNORECASE,
)
# Signals that DO NOT represent a new open call
CLOSED_OR_RESULT_RE = re.compile(
    r"\b(resultados?|beneficiarios? definitivos?|adjudicad|examen|renovaci[oó]n|"
    r"desembolso|firma de acuerdo|postulaci[oó]n cerrada|plazo vencido|"
    r"cerrad|ya cerr[oó]|acto de firma|ganadores?)\b",
    re.IGNORECASE,
)

YEAR_RE = re.compile(r"\b(202[5-9]|203\d)\b")


def _is_new_open_call(text: str) -> bool:
    """Return True only if the text clearly signals a new open call, not a closed/result announcement."""
    has_open = bool(OPEN_CALL_RE.search(text))
    has_closed = bool(CLOSED_OR_RESULT_RE.search(text[:600]))
    return has_open and not has_closed


def parse_portal(page: str, base_url: str = PORTAL_URL) -> list[dict]:
    """Parse the main Becas Gobierno portal for a new open call."""
    soup = BeautifulSoup(page, "html.parser")
    body_text = " ".join(soup.get_text(" ", strip=True).split())

    if not _is_new_open_call(body_text):
        print(f"{SOURCE_ID}: portal does not show a new open call (may have closed or not yet opened)")
        return []

    # Look for application button/link
    apply_url = base_url
    for anchor in soup.find_all("a", href=True):
        txt = " ".join(anchor.get_text(" ", strip=True).split())
        if re.search(r"\b(postular|inscribirse|aplicar|apply|registrarse|ingresar)\b", txt, re.I):
            href = anchor.get("href", "").strip()
            candidate = urljoin(base_url, href)
            if candidate.startswith(("https://", "http://")):
                apply_url = candidate
                break

    h1 = soup.find("h1")
    base_title = (
        " ".join(h1.get_text(" ", strip=True).split())
        if h1
        else "Becas Gobierno del Paraguay"
    )

    # Enrich title with detected year
    year_match = YEAR_RE.search(body_text)
    if year_match:
        title = f"Becas Gobierno del Paraguay {year_match.group()} — Convocatoria"
    else:
        title = f"{base_title} — Nueva Convocatoria"

    desc_parts = []
    for tag in soup.find_all(["p", "li"]):
        t = " ".join(tag.get_text(" ", strip=True).split())
        if t and len(t) > 20:
            desc_parts.append(t)
    description = " ".join(desc_parts)[:4000]

    return [
        {
            "title": title,
            "organization": "Becas Gobierno del Paraguay / ITAIPU Binacional",
            "location": "Paraguay",
            "continent": "Americas",
            "country_code": "PY",
            "opportunity_type": "scholarship",
            "opportunity_kind": "beca",
            "application_url": apply_url,
            "source_url": PORTAL_URL,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": PORTAL_URL,
            "original_source_verified": True,
            "eligible_regions": ["PY"],
            "eligible_countries": ["PY"],
            "fully_funded": True,
            "tags": ["Becas Gobierno", "ITAIPU", "Paraguay", "beca", "universidad", "tecnica", "formacion_docente"],
            "description": description or title,
        }
    ]


def parse_itaipu_news(page: str, base_url: str = NEWS_URL) -> list[dict]:
    """Scan ITAIPU news for a new open call announcement linking to the official portal."""
    soup = BeautifulSoup(page, "html.parser")
    rows: list[dict] = []
    seen: set[str] = set()

    # Look for article containers
    articles = soup.find_all(
        ["article", "li", "div"],
        class_=re.compile(r"post|article|entry|news|item", re.I),
    )
    if not articles:
        articles = soup.find_all(["article", "h2", "h3"])

    for article in articles:
        heading = article.find(["h1", "h2", "h3", "h4"])
        if not heading:
            continue
        title_text = " ".join(heading.get_text(" ", strip=True).split())
        if not title_text or not _is_new_open_call(title_text):
            continue

        anchor = article.find("a", href=True) or heading.find("a", href=True)
        if not anchor:
            continue
        href = anchor.get("href", "").strip()
        full_url = urljoin(base_url, href)
        if not full_url.startswith(("https://", "http://")):
            continue
        if full_url in seen:
            continue
        seen.add(full_url)

        description = " ".join(article.get_text(" ", strip=True).split())[:4000]

        rows.append(
            {
                "title": title_text,
                "organization": "Becas Gobierno del Paraguay / ITAIPU Binacional",
                "location": "Paraguay",
                "continent": "Americas",
                "country_code": "PY",
                "opportunity_type": "scholarship",
                "opportunity_kind": "beca",
                # Always link to the official application portal, not to the news article
                "application_url": PORTAL_URL,
                "source_url": full_url,
                "source": SOURCE_ID,
                "source_authority": "original",
                "original_source_url": PORTAL_URL,
                "original_source_verified": True,
                "eligible_regions": ["PY"],
                "eligible_countries": ["PY"],
                "fully_funded": True,
                "tags": ["Becas Gobierno", "ITAIPU", "Paraguay", "beca", "convocatoria"],
                "description": description or title_text,
            }
        )

    return rows


def extract() -> list[dict]:
    session = requests.Session()
    rows: list[dict] = []

    # 1. Check main portal (ASP.NET — may return 403 to bots)
    try:
        resp = session.get(PORTAL_URL, timeout=45, headers=HEADERS)
        if resp.status_code == 403:
            print(
                f"{SOURCE_ID}: 403 on portal {PORTAL_URL} — "
                "ASP.NET site may block automated requests; falling back to news source"
            )
        elif resp.ok:
            rows.extend(parse_portal(resp.text))
        else:
            resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"{SOURCE_ID}: error fetching portal {PORTAL_URL}: {exc}")

    # 2. Check ITAIPU news tag as secondary verification source
    try:
        resp = session.get(NEWS_URL, timeout=45, headers=HEADERS)
        resp.raise_for_status()
        news_rows = parse_itaipu_news(resp.text)
        if news_rows:
            rows.extend(news_rows)
        else:
            print(f"{SOURCE_ID}: no new open call found in ITAIPU news")
    except requests.RequestException as exc:
        print(f"{SOURCE_ID}: error fetching news {NEWS_URL}: {exc}")

    return rows


def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
