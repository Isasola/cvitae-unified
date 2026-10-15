"""Company-scoped SmartRecruiters public postings adapter.

The API's public visibility is not a distribution license. Tenant configs and
the scraper control both default OFF; unapproved tenants can only be fetched
with ``--audit`` and are never submitted to Supabase.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from latam_source_runtime import Cursor, DurableRunCursor, RetryDeferred, UpstreamFailure

SOURCE_ID = "smartrecruiters"
RUNNER_SUFFIX = "_scraper"
CONFIG = Path(__file__).with_name("ats_boards.json")
API_ROOT = "https://api.smartrecruiters.com/v1/companies"
POSTING_ROOT = "https://jobs.smartrecruiters.com"
ADAPTER_VERSION = "smartrecruiters:v1.0.0"
COMPANY_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


class SmartRecruitersCleaner:
    """Preserve factual fields and the separation between work and eligibility geography."""

    @staticmethod
    def clean_text(value: Any) -> str | None:
        return _text(value)


def source_for_company(company: str) -> str:
    if not COMPANY_RE.fullmatch(company or ""):
        raise ValueError("smartrecruiters_invalid_company_identifier")
    return f"smartrecruiters_{company.casefold().replace('-', '_')}"


def _payload(response: requests.Response, *, allow_404: bool = False) -> dict[str, Any] | None:
    if response.status_code == 429:
        raise RetryDeferred(_retry_after(response.headers.get("Retry-After")))
    if response.status_code == 404 and allow_404:
        return None
    if response.status_code >= 500:
        raise UpstreamFailure("HTTP_ERROR", f"smartrecruiters_http_{response.status_code}", status_code=response.status_code)
    if response.status_code in (401, 403, 406, 451):
        raise UpstreamFailure("BLOCKED", f"smartrecruiters_http_{response.status_code}", status_code=response.status_code)
    if response.status_code != 200:
        raise UpstreamFailure("HTTP_ERROR", f"smartrecruiters_http_{response.status_code}", status_code=response.status_code)
    try:
        data = response.json()
    except ValueError as exc:
        raise UpstreamFailure("UNEXPECTED_MARKUP", "smartrecruiters_non_json_response") from exc
    if not isinstance(data, dict):
        raise UpstreamFailure("UNEXPECTED_MARKUP", "smartrecruiters_invalid_payload_shape")
    return data


def _retry_after(value: str | None) -> int:
    if value:
        try:
            return max(0, int(float(value)))
        except ValueError:
            pass
    return 8


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        value = value.get("label") or value.get("name") or value.get("fullLocation") or value.get("value")
    cleaned = " ".join(str(value).split())
    return cleaned or None


def _detail_description(detail: dict[str, Any]) -> str | None:
    job_ad = detail.get("jobAd") or {}
    sections = job_ad.get("sections") or []
    chunks = []
    if isinstance(sections, list):
        for section in sections:
            if not isinstance(section, dict):
                continue
            text = _text(section.get("text")) or _text(section.get("content"))
            if text:
                chunks.append(text)
    return "\n\n".join(chunks) or None


def normalize_posting(company: dict[str, Any], listing: dict[str, Any], detail: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize a listing/detail pair without conflating work and eligibility geography."""
    tenant = str(company.get("company") or "").strip()
    posting_id = str(listing.get("id") or "").strip()
    if not tenant or not COMPANY_RE.fullmatch(tenant) or not posting_id or "/" in posting_id:
        raise ValueError("smartrecruiters_missing_stable_identity")
    if detail is not None and str(detail.get("id") or "") != posting_id:
        raise ValueError("smartrecruiters_detail_identity_mismatch")
    source = source_for_company(tenant)
    location_data = (detail or {}).get("location") or listing.get("location") or {}
    if not isinstance(location_data, dict):
        location_data = {}
    country = str(location_data.get("country") or "").strip().upper()
    city = _text(location_data.get("city"))
    full_location = _text(location_data.get("fullLocation"))
    if not full_location and (city or country):
        full_location = ", ".join(item for item in (city, "Paraguay" if country == "PY" else country or None) if item)
    if country and len(country) != 2:
        country = ""
    canonical = f"{POSTING_ROOT}/{tenant}/{posting_id}"
    posted = (detail or {}).get("releasedDate") or listing.get("releasedDate")
    if posted:
        try:
            posted = datetime.fromisoformat(str(posted).replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except (ValueError, TypeError):
            posted = None
    expiry = (detail or {}).get("expirationDate") or listing.get("expirationDate")
    if expiry:
        try:
            expiry = datetime.fromisoformat(str(expiry).replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except (ValueError, TypeError):
            expiry = None
    employment = (detail or {}).get("typeOfEmployment") or listing.get("typeOfEmployment")
    company_obj = (detail or {}).get("company") or listing.get("company") or {}
    employer = str(company.get("employer") or _text(company_obj) or "").strip() or None
    description_allowed = company.get("description_reuse_allowed") is True
    description = _detail_description(detail or {}) if description_allowed else None
    job_ad = (detail or {}).get("jobAd") or {}
    posted_url = ((detail or {}).get("postingUrl") or listing.get("postingUrl") or canonical)
    parsed = urlparse(str(posted_url))
    if parsed.scheme != "https" or parsed.netloc.casefold() != "jobs.smartrecruiters.com":
        raise ValueError("smartrecruiters_noncanonical_posting_url")
    return {
        "source": source,
        "source_native_id": f"{SOURCE_ID}:{tenant}:{posting_id}",
        "recruiter_vacancy_id": f"{SOURCE_ID}:{tenant}:{posting_id}",
        "title": str((detail or {}).get("name") or listing.get("name") or "").strip(),
        "organization": employer,
        "description": description,
        "description_reuse_allowed": description_allowed,
        "location": full_location,
        "city": city,
        "country_code": country or None,
        "onsite_country": country or None if location_data.get("remote") is False else None,
        "remote": True if location_data.get("remote") is True else False if location_data.get("remote") is False else None,
        "remote_scope": "UNKNOWN",
        "eligible_countries": [],
        "eligible_regions": [],
        "workplace_type": "REMOTE" if location_data.get("remote") is True else "HYBRID" if location_data.get("hybrid") is True else "ON_SITE" if location_data.get("remote") is False else "UNKNOWN",
        "published_at": posted,
        "deadline": expiry,
        "application_url": str((detail or {}).get("postingUrl") or listing.get("postingUrl") or canonical),
        "source_url": canonical,
        "original_source_url": canonical,
        "source_authority": "original",
        "original_source_verified": True,
        "opportunity_kind": "job",
        "type": _text(employment),
        "department": _text((detail or {}).get("department") or listing.get("department")),
        "tags": ["SmartRecruiters", employer, _text((detail or {}).get("function") or listing.get("function"))],
        "is_active": False,
        "verification_status": "in_review",
        "verification_reasons": ["SOURCE_TENANT_REVIEW_REQUIRED", "POSTING_FRESHNESS_REQUIRES_REVALIDATION"],
        "catalog_eligible": False,
        "match_eligible": False,
        "alerts_eligible": False,
        "seo_eligible": False,
        "source_status": "LISTED_BY_PUBLIC_API",
        "posting_ref": str((detail or {}).get("refNumber") or listing.get("refNumber") or "") or None,
        "application_route": "ORIGINAL_POSTING_PAGE",
        "detail_present": detail is not None,
        "evidence": {
            "tenant": tenant, "posting_id": posting_id, "job_location_country": country or "UNKNOWN",
            "candidate_eligibility": "UNKNOWN", "work_arrangement": "EXPLICIT_SOURCE_LOCATION_FLAGS" if location_data else "UNKNOWN",
            "release_date": posted, "deadline": expiry, "description_reuse_allowed": description_allowed,
            "job_ad_language": job_ad.get("language"),
        },
    }


def load_company(company_id: str, *, audit: bool) -> dict[str, Any]:
    try:
        companies = json.loads(CONFIG.read_text(encoding="utf-8")).get("smartrecruiters") or []
    except (OSError, ValueError) as exc:
        raise RuntimeError("smartrecruiters_config_unavailable") from exc
    matches = [row for row in companies if str(row.get("company") or "").casefold() == company_id.casefold()]
    if len(matches) != 1:
        raise ValueError("smartrecruiters_company_not_allowlisted")
    config = matches[0]
    if not audit and (config.get("enabled") is not True or config.get("permission_state") != "REVIEW_APPROVED"):
        raise PermissionError("smartrecruiters_company_not_review_approved")
    return config


def fetch_company(company: dict[str, Any], *, session: requests.Session | None = None, cursor: DurableRunCursor | None = None,
                  page_size: int = 100, max_pages: int = 20, max_details: int = 100,
                  sleep=time.sleep) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    tenant = str(company["company"])
    client = session or requests.Session()
    max_details = max(1, min(int(max_details), 250))
    page_size = max(1, min(int(page_size), 100, max_details))
    max_pages = max(1, min(int(max_pages), 20))
    saved = cursor.load() if cursor else Cursor()
    offset = max(0, (saved.page - 1) * page_size + saved.card_offset) if saved.continuation_pending else 0
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    pages = detail_attempted = detail_failed = duplicates = 0
    total_found: int | None = None
    eof = False
    failure_reason = None
    last_native_id: str | None = None
    while pages < max_pages and detail_attempted < max_details:
        listing_url = f"{API_ROOT}/{tenant}/postings"
        response = client.get(listing_url, params={"country": "py", "limit": page_size, "offset": offset, "destination": "PUBLIC"},
                              headers={"Accept": "application/json", "User-Agent": "CVitaeSourceMonitor/1.0 (+https://cvitae.lat)"}, timeout=(5, 25))
        payload = _payload(response)
        content = payload.get("content")
        if not isinstance(content, list):
            raise UpstreamFailure("UNEXPECTED_MARKUP", "smartrecruiters_missing_content_list")
        pages += 1
        page_total = payload.get("totalFound")
        if isinstance(page_total, int) and not isinstance(page_total, bool):
            total_found = page_total
        if not content:
            eof = True
            break
        for item in content:
            if not isinstance(item, dict):
                raise UpstreamFailure("UNEXPECTED_MARKUP", "smartrecruiters_invalid_posting_row")
            native_id = str(item.get("id") or "")
            if not native_id:
                raise UpstreamFailure("UNEXPECTED_MARKUP", "smartrecruiters_posting_missing_id")
            if native_id in seen:
                duplicates += 1
                continue
            seen.add(native_id)
            last_native_id = native_id
            detail_attempted += 1
            detail_response = client.get(f"{API_ROOT}/{tenant}/postings/{native_id}", params={"destination": "PUBLIC"},
                                         headers={"Accept": "application/json", "User-Agent": "CVitaeSourceMonitor/1.0 (+https://cvitae.lat)"}, timeout=(5, 25))
            try:
                detail = _payload(detail_response, allow_404=True)
                if detail is None:
                    detail_failed += 1
                    continue
                row = normalize_posting(company, item, detail)
                if row["country_code"] != "PY":
                    raise UpstreamFailure("IDENTITY_MISMATCH", "smartrecruiters_country_filter_mismatch")
                rows.append(row)
            except (ValueError, UpstreamFailure):
                detail_failed += 1
                if detail_response.status_code >= 500 or detail_response.status_code == 429:
                    raise
            time.sleep(0.05)
        offset += len(content)
        if total_found is not None and offset >= total_found or len(content) < page_size:
            eof = True
            break
        saved_page = offset // page_size + (1 if offset % page_size else 1)
        saved_offset = offset % page_size
        pending = Cursor(page=saved_page, card_offset=saved_offset, continuation_pending=True,
                         last_native_id=last_native_id)
        if cursor:
            cursor.save(pending, metrics={"provider": SOURCE_ID, "tenant": tenant})
        if pages < max_pages and detail_attempted < max_details:
            sleep(0.25)
    if not eof and total_found is not None and offset < total_found:
        failure_reason = "BUDGET_EXHAUSTED_CONTINUATION_PENDING"
    if eof and cursor:
        cursor.save(Cursor(), metrics={"provider": SOURCE_ID, "tenant": tenant})
    return rows, {"tenant": tenant, "pages": pages, "listed_total": total_found, "detail_attempted": detail_attempted,
                  "detail_ok": len(rows), "detail_failed_or_invalid": detail_failed, "duplicates": duplicates,
                  "offset": offset, "eof_confirmed": eof, "continuation_pending": not eof and (total_found is None or offset < total_found),
                  "status": "COMPLETE" if eof else "RESUMABLE", "reason": failure_reason}


def main(default_company: str | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company", default=os.getenv("CVITAE_SMARTRECRUITERS_COMPANY") or default_company,
                        help="Exact companyIdentifier in the reviewed ATS config")
    parser.add_argument("--audit", action="store_true", help="Read only; no Supabase requests or writes")
    parser.add_argument("--max-pages", type=int, default=5)
    parser.add_argument("--max-details", type=int, default=50)
    parser.add_argument("--audit-jsonl")
    parser.add_argument("--cursor-file", help="Local-only cursor for audit replays")
    args = parser.parse_args()
    if not args.company:
        print("SMARTRECRUITERS_COMPANY_REQUIRED", file=sys.stderr)
        return 2
    audit = args.audit or os.getenv("CVITAE_AUDIT_MODE", "0") == "1"
    if audit:
        os.environ["CVITAE_AUDIT_MODE"] = "1"
    if args.audit_jsonl and not audit:
        print("AUDIT_JSONL_REQUIRES_AUDIT_MODE", file=sys.stderr)
        return 2
    if not audit and not os.getenv("CVITAE_SCRAPER_RUN_DB_ID"):
        print("PRODUCTION_RUN_ROW_REQUIRED_FOR_DURABLE_CURSOR", file=sys.stderr)
        return 2
    try:
        company = load_company(args.company, audit=audit)
        source_id = source_for_company(args.company)
        session = requests.Session()
        cursor = DurableRunCursor(source_id + RUNNER_SUFFIX, session=session, local_path=args.cursor_file, audit=audit)
        rows, metrics = fetch_company(company, session=session, cursor=cursor, max_pages=args.max_pages, max_details=args.max_details)
    except PermissionError as exc:
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found": 0, "failed": 0, "skipped": True, "reason": str(exc)}))
        return 0
    except (OSError, ValueError, RuntimeError, requests.RequestException) as exc:
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found": 0, "failed": 1, "reason": str(exc)}))
        return 1

    if args.audit_jsonl:
        target = Path(args.audit_jsonl).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("w", encoding="utf-8", newline="\n") as stream:
            for row in rows:
                item = {key: value for key, value in row.items() if key not in {"description", "evidence"}}
                item.update({"evidence_grade": "LIVE_HTTP_DETAIL_REVIEW_ONLY", "new_vs_prod": "UNVERIFIED", "production_write": False,
                             "candidate_eligibility": "UNKNOWN", "reuse_permission": company.get("permission_state", "REVIEW_REQUIRED")})
                stream.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")
    if audit:
        from opportunity_sink import OpportunitySink
        summary = OpportunitySink().upsert(rows, adapter_version=ADAPTER_VERSION, cleaner_id="SmartRecruitersCleaner:v1") if rows else None
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict() if summary else {"found": 0, "reason": "NO_PY_POSTINGS"}, ensure_ascii=False))
    else:
        from opportunity_sink import OpportunitySink
        from source_adapters import AdapterResult, RunLineageWriter
        summary = OpportunitySink().upsert(rows, adapter_version=ADAPTER_VERSION, cleaner_id="SmartRecruitersCleaner:v1") if rows else None
        lineage_rows = [AdapterResult(source=row["source"], adapter_version=ADAPTER_VERSION, source_url=row["source_url"],
            canonical_url=row["source_url"], apply_url=row["application_url"], source_native_id=row["source_native_id"],
            title=row["title"], organization=row["organization"], description=row.get("description"), location=row.get("location"),
            country_code=row.get("country_code"), onsite_country=row.get("onsite_country"), remote=row.get("remote"), deadline=row.get("deadline"),
            date_posted=row.get("published_at"), employment_type=row.get("type"), extracted_fields=["native_id", "title", "company", "location", "releasedDate", "postingUrl"],
            extraction_method="smartrecruiters_public_postings_detail", source_status=200, confidence=.95,
            evidence=row["evidence"], recommendation="HUMAN_REVIEW", recommendation_reasons=row["verification_reasons"]) for row in rows]
        lineage = RunLineageWriter(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")).record(lineage_rows) if lineage_rows else None
        summary_payload = summary.to_dict() if summary else {"found": 0, "reason": "NO_PY_POSTINGS"}
        if lineage is not None:
            summary_payload["scan_lineage"] = RunLineageWriter.lineage_summary(lineage)
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary_payload, ensure_ascii=False))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION, "extraction_metrics": metrics}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
