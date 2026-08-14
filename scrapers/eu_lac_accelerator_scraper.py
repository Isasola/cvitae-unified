"""Collect open calls from the EU-LAC Digital Accelerator.

Source tier A — official EU-funded program channel.
access_note: Programa financiado por la UE para alianzas corporate-startup
entre UE, LATAM y Caribe. La próxima convocatoria se anuncia para septiembre
2026: publicar solo cuando haya fecha, bases y formulario verificados.
Diferenciar grant monetario (hasta EUR 10.500 para startups/pymes) de valor
estimado de servicios y de la plataforma de matching. Excluir noticias, calls
cerradas, directorio y perfiles sin alianza elegible.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from opportunity_sink import OpportunitySink


SOURCE_ID = "eu_lac_accelerator"
START_URL = "https://eulacdigitalaccelerator.com/open-call/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

OPEN_RE = re.compile(
    r"\b(apply now|apply today|applications open|submit your application|"
    r"open call|open for applications|deadline|apply here|apply before|"
    r"postula ahora|postulaciones abiertas|plazo|submit now|"
    r"applications close|accepting applications|now accepting)\b",
    re.IGNORECASE,
)
UPCOMING_RE = re.compile(
    r"\b(coming soon|stay tuned|upcoming|pr[oó]ximamente|"
    r"will open|abrir[aá]|applications will open|next call|next open call|"
    r"be notified|notify me|register your interest|save the date|"
    r"we will release|we will announce|launching soon)\b",
    re.IGNORECASE,
)


def parse(page: str, base_url: str = START_URL) -> list[dict]:
    soup = BeautifulSoup(page, "html.parser")
    body_text = " ".join(soup.get_text(" ", strip=True).split())

    if not OPEN_RE.search(body_text):
        print(f"{SOURCE_ID}: no open call signal found — call not yet published")
        return []

    # If upcoming language dominates without a concrete apply signal, skip
    if UPCOMING_RE.search(body_text[:3000]):
        concrete_open = re.search(
            r"\b(apply now|apply today|deadline|apply here|submit now)\b",
            body_text[:1500],
            re.I,
        )
        if not concrete_open:
            print(f"{SOURCE_ID}: call signaled as upcoming only — not yet open")
            return []

    # Find apply link
    apply_url = base_url
    for anchor in soup.find_all("a", href=True):
        txt = " ".join(anchor.get_text(" ", strip=True).split())
        if re.search(
            r"\b(apply now|apply here|apply today|submit|postula|get started|start application)\b",
            txt,
            re.I,
        ):
            href = anchor.get("href", "").strip()
            candidate = urljoin(base_url, href)
            if candidate.startswith(("https://", "http://")):
                apply_url = candidate
                break

    h1 = soup.find("h1")
    title = (
        " ".join(h1.get_text(" ", strip=True).split())
        if h1
        else "EU-LAC Digital Accelerator — Open Call"
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
            "organization": "EU-LAC Digital Accelerator (European Union funded)",
            "location": "Europe / Latin America / Caribbean (hybrid)",
            "continent": "Europe",
            "opportunity_type": "accelerator",
            "opportunity_kind": "programa",
            "application_url": apply_url,
            "source_url": START_URL,
            "source": SOURCE_ID,
            "source_authority": "original",
            "original_source_url": START_URL,
            "original_source_verified": True,
            "eligible_regions": ["EU", "LATAM", "CARIBBEAN"],
            "equity_free": True,
            "funding_amount": 10500,
            "currency": "EUR",
            "tags": [
                "EU-LAC",
                "accelerator",
                "EU",
                "LATAM",
                "Caribbean",
                "equity_free",
                "digital_transformation",
                "corporate_startup",
            ],
            "description": description or title,
        }
    ]


def extract() -> list[dict]:
    try:
        resp = requests.get(START_URL, timeout=45, headers=HEADERS)
        if resp.status_code == 403:
            print(f"{SOURCE_ID}: 403 blocked at {START_URL}")
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
