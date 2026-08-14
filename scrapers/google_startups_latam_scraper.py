"""Collect open cohorts from Google for Startups Accelerator — Spanish-speaking Latin America.

Source tier A — official Google for Startups channel.
access_note: Publicar solo cuando exista una cohorte con postulación abierta,
fechas y formulario verificables. No prometer créditos de Google Cloud separados.
Excluir alumni, testimonios, programas de Brasil u otras regiones y páginas sin
convocatoria activa.

NOTE: The program page is largely static but may load cohort status dynamically.
If results are consistently empty, confirm whether a new cohort has been announced.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "google_startups_latam"
START_URL = "https://startup.google.com/programs/accelerator/spanish-speaking-latin-america/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

OPEN_RE = re.compile(
    r"\b(apply now|apply today|applications open|accepting applications|"
    r"submit your application|apply here|deadline|closing date|open for|"
    r"applications close|postula ahora|postulaciones abiertas|plazo|now open)\b",
    re.IGNORECASE,
)
CLOSED_RE = re.compile(
    r"\b(applications closed|closed|coming soon|stay tuned|"
    r"pr[oó]ximamente|be notified|notify me|applications will open|"
    r"check back|not currently accepting)\b",
    re.IGNORECASE,
)


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    body_text = " ".join(soup.get_text(" ", strip=True).split())

    if not OPEN_RE.search(body_text):
        print(f"{SOURCE_ID}: no open application signal found — no active cohort announced")
        return []
    # If only closed/upcoming signal with no concrete open signal, skip
    if CLOSED_RE.search(body_text[:3000]):
        if not re.search(r"\b(apply now|apply today|deadline|apply here)\b", body_text[:1000], re.I):
            print(f"{SOURCE_ID}: page signals closed or upcoming — not yet open")
            return []

    # Try to find the apply link
    apply_url = base_url
    for anchor in soup.find_all("a", href=True):
        txt = " ".join(anchor.get_text(" ", strip=True).split())
        if re.search(r"\b(apply now|apply here|apply today|postula|submit|get started)\b", txt, re.I):
            href = anchor.get("href", "").strip()
            candidate = urljoin(base_url, href)
            if candidate.startswith(("https://", "http://")):
                apply_url = candidate
                break

    h1 = soup.find("h1")
    title = (
        " ".join(h1.get_text(" ", strip=True).split())
        if h1
        else "Google for Startups Accelerator — Latin America"
    )

    desc_parts = []
    for tag in soup.find_all(["p", "li"]):
        t = " ".join(tag.get_text(" ", strip=True).split())
        if t and len(t) > 20:
            desc_parts.append(t)
    description = " ".join(desc_parts)[:4000]

    return [
        {
            "title": title,
            "organization": "Google for Startups",
            "location": "Latin America (remote/hybrid)",
            "continent": "Americas",
            "opportunity_type": "accelerator",
            "opportunity_kind": "programa",
            "application_url": apply_url,
            "source_url": START_URL,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": START_URL,
            "original_source_verified": True,
            "eligible_regions": ["SPANISH_SPEAKING_LATAM"],
            "equity_free": True,
            "tags": ["Google", "accelerator", "LATAM", "equity_free", "AI", "ML", "startups"],
            "description": description or title,
        }
    ]


def extract() -> list[dict]:
    try:
        resp = requests.get(START_URL, timeout=45, headers=HEADERS)
        if resp.status_code == 403:
            print(f"{SOURCE_ID}: 403 blocked — page may require JavaScript rendering")
            return []
        resp.raise_for_status()
        return parse(resp.text)
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
