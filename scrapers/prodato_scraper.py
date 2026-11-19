"""Review-gated factual adapter for Prodato's first-party Paraguayan job board."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from latam_source_runtime import RetryDeferred, UpstreamFailure

SOURCE_ID = "prodato_direct"
RUNNER_ID = "prodato_scraper"
BASE_URL = "https://empleos.prodato.uk/"
ADAPTER_VERSION = "prodato-direct:v1.0.0"
DETAIL_RE = re.compile(r"^/careers/(\d+)/?$")
TALENT_TITLES = {"banco de talentos", "talent pool", "futuras oportunidades"}


class ProdatoCleaner:
    """Keep only factual listing metadata; never persist source description text."""

    @staticmethod
    def clean_title(value: str) -> str | None:
        result = " ".join(str(value or "").split())
        if not result or result.casefold() in TALENT_TITLES:
            return None
        return result


def _request(session: requests.Session, url: str) -> requests.Response:
    response = session.get(url, headers={"User-Agent": "CVitaeSourceMonitor/1.0 (+https://cvitae.lat)",
                                         "Accept": "text/html,application/xhtml+xml"}, timeout=(5, 20))
    if response.status_code == 429:
        value = response.headers.get("Retry-After", "8")
        try:
            delay = max(0, int(float(value)))
        except ValueError:
            delay = 8
        raise RetryDeferred(delay)
    if response.status_code in (401, 403, 406, 451):
        raise UpstreamFailure("BLOCKED", f"prodato_http_{response.status_code}", status_code=response.status_code)
    if response.status_code >= 500:
        raise UpstreamFailure("HTTP_ERROR", f"prodato_http_{response.status_code}", status_code=response.status_code)
    if response.status_code == 404:
        raise UpstreamFailure("HTTP_404", "prodato_detail_not_found", status_code=404)
    if response.status_code != 200:
        raise UpstreamFailure("HTTP_ERROR", f"prodato_http_{response.status_code}", status_code=response.status_code)
    return response


def _clean(node: Any) -> str | None:
    value = " ".join(node.get_text(" ", strip=True).split()) if node else ""
    return value or None


def _date(value: str | None) -> str | None:
    if not value:
        return None
    match = re.fullmatch(r"(\d{1,2})\s+([a-záéíóúñ.]+)\s+(\d{4})", value.strip(), re.I)
    if not match:
        return None
    months = {"ene": 1, "enero": 1, "feb": 2, "febrero": 2, "mar": 3, "marzo": 3,
              "abr": 4, "abril": 4, "may": 5, "mayo": 5, "jun": 6, "junio": 6,
              "jul": 7, "julio": 7, "ago": 8, "agosto": 8, "sept": 9, "sep": 9,
              "set": 9, "septiembre": 9, "oct": 10, "octubre": 10, "nov": 11,
              "noviembre": 11, "dic": 12, "diciembre": 12}
    month = months.get(match.group(2).casefold().rstrip("."))
    if not month:
        return None
    try:
        return datetime(int(match.group(3)), month, int(match.group(1)), tzinfo=timezone.utc).isoformat()
    except ValueError:
        return None


def parse_listing(html: str, page_url: str = BASE_URL) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    main = soup.select_one("main")
    if not main or "vacantes disponibles" not in _clean(main).casefold():
        raise UpstreamFailure("UNEXPECTED_MARKUP", "prodato_vacancy_listing_contract_missing")
    results = None
    heading = next((node for node in main.select("h2") if "vacantes disponibles" in (_clean(node) or "").casefold()), None)
    if heading:
        span = heading.find_next("span")
        match = re.search(r"\b(\d+)\s+resultados?\b", _clean(span) or "", re.I)
        results = int(match.group(1)) if match else None
    cards: list[dict[str, Any]] = []
    seen: set[str] = set()
    for anchor in main.select('a[href*="/careers/"]'):
        href = str(anchor.get("href") or "")
        parsed = urlparse(urljoin(page_url, href))
        match = DETAIL_RE.fullmatch(parsed.path)
        if parsed.scheme != "https" or parsed.netloc.casefold() != "empleos.prodato.uk" or not match:
            continue
        native_id = match.group(1)
        if native_id in seen:
            continue
        seen.add(native_id)
        card = anchor.find_parent("div", class_=lambda value: value and "rounded-[24px]" in value)
        if not card:
            continue
        title = _clean(card.select_one("h3"))
        if not title:
            continue
        if title.casefold() in TALENT_TITLES:
            cards.append({"native_id": native_id, "title": title, "kind": "talent_pool", "canonical_url": parsed._replace(query="", fragment="").geturl()})
            continue
        date_text = _clean(card.select_one("span"))
        category = _clean(card.select_one("p"))
        location_nodes = card.select("p")
        location = _clean(location_nodes[-1]) if location_nodes else None
        badges = [_clean(item) for item in card.select("span")]
        employment_type = next((item for item in badges if item and item.casefold() in {"tiempo completo", "medio tiempo", "temporal", "contrato"}), None)
        cards.append({"native_id": native_id, "title": title, "kind": "job", "canonical_url": parsed._replace(query="", fragment="").geturl(),
                      "published_at": _date(date_text), "source_date_text": date_text, "department": category,
                      "location": location, "employment_type": employment_type})
    job_cards = [row for row in cards if row["kind"] == "job"]
    if results is not None and len(cards) < results:
        raise UpstreamFailure("UNEXPECTED_MARKUP", "prodato_listing_cards_below_source_reported_total")
    return {"reported_results": results, "discovered": cards, "job_postings": job_cards,
            "excluded_non_job": len(cards) - len(job_cards), "eof_confirmed": results is not None and len(cards) >= results}


def parse_detail_identity(html: str, expected_id: str, expected_title: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    canonical = soup.select_one('link[rel="canonical"]')
    canonical_url = str(canonical.get("href") or "").strip() if canonical else f"https://empleos.prodato.uk/careers/{expected_id}"
    parsed = urlparse(canonical_url)
    match = DETAIL_RE.fullmatch(parsed.path)
    if parsed.scheme != "https" or parsed.netloc.casefold() != "empleos.prodato.uk" or not match or match.group(1) != expected_id:
        raise UpstreamFailure("IDENTITY_MISMATCH", "prodato_detail_canonical_id_mismatch")
    # The site currently streams some detail content after its initial shell;
    # only confirm visible title when the server response includes it. Never
    # infer or synthesize description text from the listing card.
    observed_title = _clean(soup.select_one("main h1"))
    if observed_title and observed_title.casefold() != expected_title.casefold():
        raise UpstreamFailure("IDENTITY_MISMATCH", "prodato_detail_title_mismatch")
    return {"native_id": expected_id, "canonical_url": canonical_url, "http_detail_title": observed_title,
            "detail_title_confirmed": observed_title is not None}


def to_sink_row(row: dict[str, Any]) -> dict[str, Any]:
    return {"title": row["title"], "organization": "Prodato", "description": None,
            "location": row.get("location"), "country_code": "PY", "onsite_country": "PY",
            "remote": None, "remote_scope": "UNKNOWN", "eligible_countries": [], "eligible_regions": [],
            "published_at": row.get("published_at"), "deadline": None,
            "application_url": row["canonical_url"], "source_url": row["canonical_url"],
            "original_source_url": row["canonical_url"], "source": SOURCE_ID,
            "source_authority": "original", "original_source_verified": True,
            "recruiter_vacancy_id": f"{SOURCE_ID}:{row['native_id']}", "opportunity_kind": "job",
            "type": row.get("employment_type"), "is_active": False, "verification_status": "in_review",
            "verification_reasons": ["SOURCE_REVIEW_REQUIRED", "DEADLINE_NOT_PROVIDED", "CANDIDATE_ELIGIBILITY_UNKNOWN"],
            "tags": ["prodato"] + ([row["department"]] if row.get("department") else []), "evidence": {"source_native_id": row["native_id"],
                "job_location_country": "PY", "candidate_eligibility": "UNKNOWN", "work_arrangement": "UNKNOWN",
                "source_date_text": row.get("source_date_text"), "deadline": "NOT_PROVIDED", "description_reuse": "NOT_SAVED"}}


def acquire(*, session: requests.Session | None = None, max_details: int = 50) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    client = session or requests.Session()
    listing_response = _request(client, BASE_URL)
    listing = parse_listing(listing_response.text, listing_response.url)
    rows = []
    failed = []
    details_attempted = 0
    for item in listing["job_postings"][:max(0, min(int(max_details), 50))]:
        details_attempted += 1
        try:
            response = _request(client, item["canonical_url"])
            detail = parse_detail_identity(response.text, item["native_id"], item["title"])
            rows.append({**item, **detail, "http_status": response.status_code,
                         "evidence_grade": "LIVE_HTTP_DETAIL_REVIEW_ONLY", "rights_state": "UNKNOWN_REVIEW_REQUIRED",
                         "new_vs_prod": "UNVERIFIED", "production_write": False})
        except (UpstreamFailure, requests.RequestException) as exc:
            failed.append({"native_id": item["native_id"], "reason": getattr(exc, "kind", type(exc).__name__)})
    return rows, {"source": SOURCE_ID, "listing_http": listing_response.status_code,
                  "reported_results": listing["reported_results"], "discovered_cards": len(listing["discovered"]),
                  "job_postings": len(listing["job_postings"]), "non_job_excluded": listing["excluded_non_job"],
                  "details_attempted": details_attempted, "details_http_200": len(rows), "details_failed": failed,
                  "listing_eof_confirmed": listing["eof_confirmed"], "rows": len(rows)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", action="store_true", help="Read-only capture and local Sink audit")
    parser.add_argument("--max-details", type=int, default=50)
    parser.add_argument("--audit-jsonl")
    args = parser.parse_args()
    audit = args.audit or os.getenv("CVITAE_AUDIT_MODE", "0") == "1"
    if args.audit_jsonl and not audit:
        print("AUDIT_JSONL_REQUIRES_AUDIT_MODE", file=sys.stderr)
        return 2
    if not audit and not os.getenv("CVITAE_SCRAPER_RUN_DB_ID"):
        print("PRODUCTION_RUN_ROW_REQUIRED_FOR_DURABLE_CURSOR", file=sys.stderr)
        return 2
    if audit:
        os.environ["CVITAE_AUDIT_MODE"] = "1"
    try:
        rows, metrics = acquire(max_details=args.max_details)
    except (UpstreamFailure, requests.RequestException) as exc:
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found": 0, "failed": 1, "reason": getattr(exc, "kind", type(exc).__name__)}))
        return 1
    sink_rows = [to_sink_row(row) for row in rows]
    if args.audit_jsonl:
        path = Path(args.audit_jsonl).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="\n") as stream:
            for row in sink_rows:
                stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    from opportunity_sink import OpportunitySink
    summary = OpportunitySink().upsert(sink_rows, adapter_version=ADAPTER_VERSION, cleaner_id="ProdatoCleaner:v1") if sink_rows else None
    if not audit:
        from source_adapters import AdapterResult, RunLineageWriter
        lineage_rows = [AdapterResult(source=SOURCE_ID, adapter_version=ADAPTER_VERSION, source_url=row["source_url"],
            canonical_url=row["source_url"], apply_url=row["application_url"], source_native_id=row["recruiter_vacancy_id"],
            title=row["title"], organization=row["organization"], location=row.get("location"), country_code="PY", onsite_country="PY",
            date_posted=row.get("published_at"), employment_type=row.get("type"), extracted_fields=["native_id", "title", "location", "source_date_text"],
            extraction_method="prodato_first_party_listing_and_detail", source_status=200, confidence=.9,
            evidence=row["evidence"], recommendation="HUMAN_REVIEW", recommendation_reasons=row["verification_reasons"]) for row in sink_rows]
        lineage = RunLineageWriter(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")).record(lineage_rows) if lineage_rows else None
        if lineage is not None:
            metrics["scan_lineage"] = RunLineageWriter.lineage_summary(lineage)
    metrics["sink"] = summary.to_dict() if summary else {"found": 0}
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(metrics, ensure_ascii=False))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION, "extraction_metrics": metrics}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
