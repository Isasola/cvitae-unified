"""Fail-closed scout for the current Grupo Vierci / Retail S.A. job portal.

The previous script guessed jobs from unrelated corporate pages and wrote
directly to ``opportunities``. The current employer portal showed an explicit
empty state in a bounded read. This scout refuses to fetch until a written
feed/use authorization is configured and refuses to interpret an unknown page
as EOF or as a vacancy.
"""
from __future__ import annotations

import json
import os
import sys
import unicodedata

import requests
from bs4 import BeautifulSoup

from latam_source_runtime import UnexpectedMarkup, UpstreamFailure, fetch_response

SOURCE_ID = "grupo_vierci"
RUNNER_ID = "grupovierci_scraper"
LISTING_URL = "https://empleo.grupovierci.com/vista_prueba.php"
ADAPTER_VERSION = "grupo-vierci-scout:v1.0.0"
EMPTY_MARKERS = (
    "no se encontraron resultados con los criterios actuales",
    "en este momento no se encuentra ninguna vacante disponible",
    "no hay vacantes disponibles",
)


def _fold(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").casefold()


def parse_listing_page(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    text = " ".join(soup.get_text(" ", strip=True).split())
    folded = _fold(text)
    if any(marker in folded for marker in EMPTY_MARKERS):
        return {"items": [], "eof": True, "empty_state": "EXPLICIT_NO_CURRENT_VACANCIES"}
    # The publicly visible page may contain a modal template with generic
    # labels such as "Título de la vacante". Only real individual posting URLs
    # can prove a non-empty listing; no selectors or source IDs are established
    # for that contract yet, so report unexpected markup instead of inventing.
    if soup.select(".vacancy-card, .vacancy, article[data-vacancy-id], a[href*='/vacante/']"):
        raise UpstreamFailure("LISTING_CONTRACT_UNVERIFIED", "posting_like_markup_requires_native_id_and_detail_contract")
    raise UnexpectedMarkup("listing_has_neither_verified_vacancy_cards_nor_explicit_empty_state")


def _authorization_failure() -> int:
    summary = {"found": 0, "valid": 0, "unique": 0, "inserted": 0, "updated": 0,
        "unchanged": 0, "duplicates_in_run": 0, "rejected": 0, "failed": 0,
        "technical_failure": True, "errors": ["FEED_AUTHORIZATION_REQUIRED"]}
    metrics = {"adapter_version": ADAPTER_VERSION, "extraction_metrics": {
        "health": {"status": "ERROR", "reason": "FEED_AUTHORIZATION_REQUIRED"}, "http_requests": 0}}
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary, separators=(",", ":")))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps(metrics, separators=(",", ":")))
    return 2


def main() -> int:
    if os.getenv("CVITAE_GRUPO_VIERCI_FEED_AUTHORIZED", "false").casefold() != "true":
        return _authorization_failure()
    if not os.getenv("CVITAE_SCRAPER_RUN_DB_ID"):
        print("PRODUCTION_RUN_ROW_REQUIRED_FOR_MONITORED_SCOUT", file=sys.stderr)
        return 2
    try:
        response = fetch_response(requests.Session(), LISTING_URL, attempts=3)
        if not response.url.startswith("https://empleo.grupovierci.com/"):
            raise UpstreamFailure("IDENTITY_MISMATCH", "portal_redirected_outside_employer_host")
        result = parse_listing_page(response.text)
    except (UpstreamFailure, requests.RequestException) as exc:
        reason = exc.kind if isinstance(exc, UpstreamFailure) else type(exc).__name__
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found": 0, "valid": 0, "inserted": 0,
            "failed": 1, "technical_failure": True, "errors": [reason]}, separators=(",", ":")))
        print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION,
            "extraction_metrics": {"health": {"status": "DEGRADED", "reason": reason}, "error_kind": reason}}, separators=(",", ":")))
        return 1

    summary = {"found": len(result["items"]), "valid": 0, "unique": 0, "inserted": 0,
        "updated": 0, "unchanged": 0, "duplicates_in_run": 0, "rejected": 0,
        "failed": 0, "budget_skipped": 0, "technical_failure": False, "errors": []}
    metrics = {"adapter_version": ADAPTER_VERSION, "extraction_metrics": {
        "http_status": response.status_code, "eof_confirmed": result["eof"],
        "continuation_pending": False, "cursor_advanced": False,
        "discovered": 0, "detail_attempted": 0, "normalized": 0, "unique": 0,
        "submitted": 0, "inserted": 0, "updated": 0, "unchanged": 0,
        "duplicate": 0, "rejected_by_gate": 0, "failed": 0, "budget_skipped": 0,
        "empty_state": result["empty_state"], "permission_status": "REVIEW_REQUIRED",
        "health": {"status": "EMPTY_EOF_CONFIRMED", "reason": result["empty_state"]},
    }}
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary, separators=(",", ":")))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps(metrics, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
