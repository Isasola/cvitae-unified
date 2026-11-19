"""Review-gated adapter for individual Outsourcing Paraguay vacancy pages."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse, urljoin

import requests
from bs4 import BeautifulSoup

from latam_source_runtime import RetryDeferred, UpstreamFailure

SOURCE_ID = "outsourcing_paraguay"
BASE_URL = "https://outsourcing.com.py/oportunidades-laborales"
HOST = "outsourcing.com.py"
ADAPTER_VERSION = "outsourcing-py:v1.0.0"
DETAIL_PATHS = {"/ficha-trabaja-con-nosotros", "/ficha-oportunidades-laborales"}


def _get(session: requests.Session, url: str) -> requests.Response:
    response = session.get(url, headers={"User-Agent": "CVitaeSourceMonitor/1.0 (+https://cvitae.lat)"}, timeout=(5, 20))
    if response.status_code == 429:
        value = response.headers.get("Retry-After", "8")
        try:
            delay = max(0, int(float(value)))
        except ValueError:
            delay = 8
        raise RetryDeferred(delay)
    if response.status_code in (401, 403, 406, 451):
        raise UpstreamFailure("BLOCKED", f"outsourcing_py_http_{response.status_code}", status_code=response.status_code)
    if response.status_code == 404:
        raise UpstreamFailure("HTTP_404", "outsourcing_py_vacancy_not_found", status_code=404)
    if response.status_code >= 500 or response.status_code != 200:
        raise UpstreamFailure("HTTP_ERROR", f"outsourcing_py_http_{response.status_code}", status_code=response.status_code)
    return response


def _detail_identity(url: str, base: str = BASE_URL) -> tuple[int, str]:
    parsed = urlparse(urljoin(base, url))
    if parsed.scheme != "https" or parsed.netloc.casefold() != HOST or parsed.path not in DETAIL_PATHS:
        raise UpstreamFailure("IDENTITY_MISMATCH", "outsourcing_py_unrecognized_detail_url")
    ids = parse_qs(parsed.query).get("vacancy") or []
    if len(ids) != 1 or not ids[0].isdigit():
        raise UpstreamFailure("IDENTITY_MISMATCH", "outsourcing_py_missing_native_vacancy_id")
    canonical = parsed._replace(query=f"vacancy={ids[0]}", fragment="").geturl()
    return int(ids[0]), canonical


def parse_listing(html: str, page_url: str = BASE_URL) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    headings = [" ".join(node.get_text(" ", strip=True).split()).casefold() for node in soup.select("h1,h2")]
    if not any("oportunidades laborales" in value or "vacantes externas" in value for value in headings):
        raise UpstreamFailure("UNEXPECTED_MARKUP", "outsourcing_py_listing_contract_missing")
    vacancies = []
    seen: set[int] = set()
    for anchor in soup.select('a[href*="vacancy="]'):
        try:
            native_id, canonical = _detail_identity(str(anchor.get("href") or ""), page_url)
        except UpstreamFailure:
            continue
        if native_id in seen:
            continue
        seen.add(native_id)
        vacancies.append({"native_id": native_id, "canonical_url": canonical})
    if not vacancies:
        raise UpstreamFailure("UNEXPECTED_MARKUP", "outsourcing_py_no_individual_vacancy_ids")
    # No source total or pagination was advertised; the two observed cards do not prove archive EOF.
    return {"vacancies": vacancies, "eof_confirmed": False, "continuation_pending": True,
            "listing_scope": "CURRENT_PUBLIC_VACANCIES_PAGE"}


def parse_detail(html: str, expected_url: str) -> dict[str, Any]:
    native_id, canonical = _detail_identity(expected_url, expected_url)
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.select_one("main h1, h1")
    title = " ".join(heading.get_text(" ", strip=True).split()) if heading else ""
    if not title or title.casefold() in {"suscribite hoy", "ficha trabaja con nosotros", "ficha oportunidades laborales"}:
        raise UpstreamFailure("UNEXPECTED_MARKUP", "outsourcing_py_detail_title_missing")
    return {"source": SOURCE_ID, "source_native_id": f"{SOURCE_ID}:{native_id}",
            "recruiter_vacancy_id": f"{SOURCE_ID}:{native_id}", "title": title, "organization": None,
            "description": None, "location": None, "country_code": None, "onsite_country": None,
            "remote": None, "remote_scope": "UNKNOWN", "eligible_countries": [], "eligible_regions": [],
            "published_at": None, "deadline": None, "application_url": canonical, "source_url": canonical,
            "original_source_url": canonical, "source_authority": "original", "original_source_verified": True,
            "opportunity_kind": "job", "type": None, "is_active": False, "verification_status": "in_review",
            "verification_reasons": ["JOB_LOCATION_UNKNOWN", "CANDIDATE_ELIGIBILITY_UNKNOWN", "EXPIRY_NOT_PROVIDED",
                                     "EMPLOYER_NOT_DISCLOSED", "SOURCE_REUSE_PERMISSION_REVIEW_REQUIRED"],
            "catalog_eligible": False, "match_eligible": False, "alerts_eligible": False, "seo_eligible": False,
            "tags": ["Outsourcing Paraguay", "external_vacancy"],
            "evidence": {"native_id": native_id, "source_lifecycle": "UNKNOWN", "listing_scope": "CURRENT_PUBLIC_VACANCIES_PAGE",
                         "job_location": "UNKNOWN", "candidate_eligibility": "UNKNOWN", "work_arrangement": "UNKNOWN",
                         "employer": "NOT_DISCLOSED_IN_CAPTURED_FIELDS", "description_saved": False,
                         "application_route": "ORIGINAL_INDIVIDUAL_VACANCY_PAGE", "reuse_permission": "UNKNOWN_REVIEW_REQUIRED"}}


def acquire(*, session: requests.Session | None = None, max_details: int = 50) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    client = session or requests.Session()
    listing_response = _get(client, BASE_URL)
    listing = parse_listing(listing_response.text, listing_response.url)
    vacancies = listing["vacancies"][:max(0, min(int(max_details), 50))]
    rows = []
    failed = []
    for vacancy in vacancies:
        try:
            response = _get(client, vacancy["canonical_url"])
            row = parse_detail(response.text, vacancy["canonical_url"])
            row["detail_http_status"] = response.status_code
            rows.append(row)
        except (UpstreamFailure, requests.RequestException) as exc:
            failed.append({"native_id": vacancy["native_id"], "reason": getattr(exc, "kind", type(exc).__name__)})
    return rows, {"source": SOURCE_ID, "listing_http": listing_response.status_code,
                  "discovered": len(listing["vacancies"]), "detail_attempted": len(vacancies),
                  "detail_ok": len(rows), "detail_failed": failed, "eof_confirmed": listing["eof_confirmed"],
                  "continuation_pending": listing["continuation_pending"], "source_lifecycle": "UNKNOWN"}


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
        print("PRODUCTION_RUN_ROW_REQUIRED_FOR_MONITORED_EXECUTION", file=sys.stderr)
        return 2
    if audit:
        os.environ["CVITAE_AUDIT_MODE"] = "1"
    try:
        rows, metrics = acquire(max_details=args.max_details)
    except (UpstreamFailure, requests.RequestException) as exc:
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found": 0, "failed": 1, "reason": getattr(exc, "kind", type(exc).__name__)}))
        return 1
    if args.audit_jsonl:
        target = Path(args.audit_jsonl).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("w", encoding="utf-8", newline="\n") as stream:
            for row in rows:
                stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    from opportunity_sink import OpportunitySink
    summary = OpportunitySink().upsert(rows, adapter_version=ADAPTER_VERSION, cleaner_id="OutsourcingPyCleaner:v1") if rows else None
    metrics["sink"] = summary.to_dict() if summary else {"found": 0}
    if not audit and rows:
        from source_adapters import AdapterResult, RunLineageWriter
        lineage_rows = [AdapterResult(source=SOURCE_ID, adapter_version=ADAPTER_VERSION, source_url=row["source_url"],
            canonical_url=row["source_url"], apply_url=row["application_url"], source_native_id=row["source_native_id"],
            title=row["title"], organization=None, location=None, country_code=None, onsite_country=None,
            remote=None, remote_scope="UNKNOWN", date_posted=None, deadline=None,
            extracted_fields=["source_native_id", "title", "canonical_url"], extraction_method="outsourcing_public_individual_vacancy",
            source_status=200, confidence=.90, evidence=row["evidence"], recommendation="HUMAN_REVIEW",
            recommendation_reasons=row["verification_reasons"]) for row in rows]
        lineage = RunLineageWriter(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")).record(lineage_rows)
        metrics["scan_lineage"] = RunLineageWriter.lineage_summary(lineage)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(metrics, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
