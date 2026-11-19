"""Review-gated factual adapter for Lizzy Castillo's public job listings."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse, urljoin

import requests
from bs4 import BeautifulSoup

from latam_source_runtime import RetryDeferred, UpstreamFailure

SOURCE_ID = "lizzy_castillo_py"
RUNNER_ID = "lizzy_castillo_scraper"
BASE_URL = "https://seleccion.lizzycastillo.com.py/"
HOST = "seleccion.lizzycastillo.com.py"
ADAPTER_VERSION = "lizzy-castillo:v1.0.0"
JOB_PATH = re.compile(r"^/trabajo/[a-z0-9-]+/?$", re.I)


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
        raise UpstreamFailure("BLOCKED", f"lizzy_castillo_http_{response.status_code}", status_code=response.status_code)
    if response.status_code == 404:
        raise UpstreamFailure("HTTP_404", "lizzy_castillo_posting_not_found", status_code=404)
    if response.status_code >= 500 or response.status_code != 200:
        raise UpstreamFailure("HTTP_ERROR", f"lizzy_castillo_http_{response.status_code}", status_code=response.status_code)
    return response


def _canonical(url: str, base_url: str) -> str:
    parsed = urlparse(urljoin(base_url, url))
    if parsed.scheme != "https" or parsed.netloc.casefold() != HOST or not JOB_PATH.fullmatch(parsed.path):
        raise UpstreamFailure("IDENTITY_MISMATCH", "lizzy_castillo_noncanonical_job_url")
    return parsed._replace(query="", fragment="").geturl()


def parse_listing(html: str, page_url: str = BASE_URL) -> dict[str, Any]:
    """The live homepage exposes featured posting links; /jobs/ returned no cards."""
    soup = BeautifulSoup(html, "html.parser")
    postings: list[dict[str, str]] = []
    seen: set[str] = set()
    for anchor in soup.select('a[href*="/trabajo/"]'):
        try:
            canonical = _canonical(str(anchor.get("href") or ""), page_url)
        except UpstreamFailure:
            continue
        if canonical in seen:
            continue
        seen.add(canonical)
        title = " ".join(anchor.get_text(" ", strip=True).split())
        if title:
            postings.append({"canonical_url": canonical, "listing_title": title})
    if not postings:
        raise UpstreamFailure("UNEXPECTED_MARKUP", "lizzy_castillo_no_individual_job_links")
    # This is a homepage featured-post scan, not proof that the whole archive was read.
    return {"postings": postings, "listing_scope": "FEATURED_HOMEPAGE", "eof_confirmed": False,
            "continuation_pending": True, "next_action": "rescan_homepage_and_follow_wordpress_job_listing_archive_if_added"}


def _iter_jobposting(soup: BeautifulSoup) -> list[dict[str, Any]]:
    output = []
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            payload = json.loads(node.string or node.get_text())
        except (ValueError, TypeError):
            continue
        stack = payload if isinstance(payload, list) else payload.get("@graph", [payload]) if isinstance(payload, dict) else []
        for item in stack:
            if not isinstance(item, dict):
                continue
            kinds = item.get("@type") if isinstance(item.get("@type"), list) else [item.get("@type")]
            if "JobPosting" in kinds:
                output.append(item)
    return output


def _iso(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _native_id(item: dict[str, Any], canonical: str) -> str:
    identifier = item.get("identifier") or {}
    value = str(identifier.get("value") or "") if isinstance(identifier, dict) else str(identifier)
    query = parse_qs(urlparse(value.replace("&#038;", "&")).query)
    post_id = (query.get("p") or [None])[0]
    if post_id and post_id.isdigit():
        return post_id
    slug = urlparse(canonical).path.rstrip("/").split("/")[-1]
    if not slug:
        raise UpstreamFailure("IDENTITY_MISMATCH", "lizzy_castillo_missing_native_identity")
    return slug


def parse_detail(html: str, expected_url: str, listing_title: str, *, now: datetime | None = None) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    canonical_tag = soup.select_one('link[rel="canonical"]')
    canonical = _canonical(str(canonical_tag.get("href") or expected_url) if canonical_tag else expected_url, expected_url)
    if canonical != _canonical(expected_url, expected_url):
        raise UpstreamFailure("IDENTITY_MISMATCH", "lizzy_castillo_detail_canonical_mismatch")
    matches = _iter_jobposting(soup)
    if len(matches) != 1:
        raise UpstreamFailure("UNEXPECTED_MARKUP", "lizzy_castillo_jobposting_schema_missing_or_ambiguous")
    item = matches[0]
    title = " ".join(str(item.get("title") or listing_title).split())
    if not title or title.casefold() != listing_title.casefold():
        raise UpstreamFailure("IDENTITY_MISMATCH", "lizzy_castillo_title_mismatch")
    native = _native_id(item, canonical)
    posted = _iso(item.get("datePosted"))
    expiry = _iso(item.get("validThrough"))
    instant = now or datetime.now(timezone.utc)
    if item.get("validThrough") and expiry is None:
        status = "UNKNOWN"
        date_reason = "INVALID_VALID_THROUGH"
    elif expiry and expiry <= instant:
        status = "CLOSED"
        date_reason = "VALID_THROUGH_ELAPSED"
    elif posted and posted > instant:
        status = "UPCOMING"
        date_reason = "DATE_POSTED_IN_FUTURE"
    elif expiry:
        status = "OPEN"
        date_reason = "LISTED_AND_VALID_THROUGH_FUTURE"
    else:
        status = "UNKNOWN"
        date_reason = "NO_VERIFIABLE_VALID_THROUGH"
    location = item.get("jobLocation")
    address = None
    if isinstance(location, dict):
        address = location.get("address") or location
    elif isinstance(location, list) and location and isinstance(location[0], dict):
        address = location[0].get("address") or location[0]
    if isinstance(address, dict):
        parts = [str(address.get(key) or "").strip() for key in ("addressLocality", "addressRegion", "addressCountry")]
        work_location = ", ".join(value for value in parts if value) or None
    else:
        work_location = None
    application_link = next((urljoin(canonical, str(a.get("href"))) for a in soup.select('a[href]')
                             if "postularme" in " ".join(a.get_text(" ", strip=True).split()).casefold()), None)
    org = item.get("hiringOrganization") or {}
    organization = str(org.get("name") or "").strip() or None if isinstance(org, dict) else None
    employment = item.get("employmentType")
    if isinstance(employment, list):
        employment = ", ".join(str(value) for value in employment)
    # The observed CTA is a generic application form without posting identity.
    # Keep the unique canonical posting URL as the sink key and record the CTA separately.
    return {"source": SOURCE_ID, "source_native_id": f"{SOURCE_ID}:{native}",
            "recruiter_vacancy_id": f"{SOURCE_ID}:{native}", "title": title, "organization": organization,
            "description": None, "location": work_location, "country_code": None, "onsite_country": None,
            "remote": None, "remote_scope": "UNKNOWN", "eligible_countries": [], "eligible_regions": [],
            "published_at": posted.isoformat() if posted else None, "deadline": expiry.isoformat() if expiry else None,
            "application_url": canonical, "source_url": canonical, "original_source_url": canonical,
            "source_authority": "original", "original_source_verified": True, "opportunity_kind": "job",
            "type": employment, "is_active": False, "verification_status": "in_review",
            "verification_reasons": ["SOURCE_PERMISSION_REVIEW_REQUIRED", "JOB_LOCATION_UNKNOWN", "CANDIDATE_ELIGIBILITY_UNKNOWN", date_reason],
            "catalog_eligible": False, "match_eligible": False, "alerts_eligible": False, "seo_eligible": False,
            "tags": ["Lizzy Castillo Selección"], "evidence": {"native_id": native, "posting_url": canonical,
                "listing_scope": "FEATURED_HOMEPAGE", "source_lifecycle": status, "date_reason": date_reason,
                "candidate_eligibility": "UNKNOWN", "work_arrangement": "UNKNOWN", "job_location": work_location or "UNKNOWN",
                "apply_cta_url": application_link, "apply_route_is_generic": True, "description_saved": False,
                "reuse_permission": "UNKNOWN_REVIEW_REQUIRED"}}


def acquire(*, session: requests.Session | None = None, max_details: int = 50) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    client = session or requests.Session()
    listing_response = _get(client, BASE_URL)
    listing = parse_listing(listing_response.text, listing_response.url)
    postings = listing["postings"][:max(0, min(int(max_details), 50))]
    rows: list[dict[str, Any]] = []
    failures = []
    for posting in postings:
        try:
            response = _get(client, posting["canonical_url"])
            row = parse_detail(response.text, posting["canonical_url"], posting["listing_title"])
            row["detail_http_status"] = response.status_code
            rows.append(row)
        except (UpstreamFailure, requests.RequestException) as exc:
            failures.append({"url": posting["canonical_url"], "reason": getattr(exc, "kind", type(exc).__name__)})
    return rows, {"source": SOURCE_ID, "listing_http": listing_response.status_code,
                  "listing_scope": listing["listing_scope"], "discovered": len(listing["postings"]),
                  "detail_attempted": len(postings), "detail_ok": len(rows), "detail_failed": failures,
                  "open_at_source_snapshot": sum(row["evidence"]["source_lifecycle"] == "OPEN" for row in rows),
                  "upcoming": sum(row["evidence"]["source_lifecycle"] == "UPCOMING" for row in rows),
                  "closed": sum(row["evidence"]["source_lifecycle"] == "CLOSED" for row in rows),
                  "unknown_date": sum(row["evidence"]["source_lifecycle"] == "UNKNOWN" for row in rows),
                  "eof_confirmed": False, "continuation_pending": True,
                  "next_action": listing["next_action"]}


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
    summary = OpportunitySink().upsert(rows, adapter_version=ADAPTER_VERSION, cleaner_id="LizzyCastilloCleaner:v1") if rows else None
    metrics["sink"] = summary.to_dict() if summary else {"found": 0}
    if not audit and rows:
        from source_adapters import AdapterResult, RunLineageWriter
        lineage_rows = [AdapterResult(source=SOURCE_ID, adapter_version=ADAPTER_VERSION, source_url=row["source_url"],
            canonical_url=row["source_url"], apply_url=row["application_url"], source_native_id=row["source_native_id"],
            title=row["title"], organization=row.get("organization"), location=row.get("location"),
            country_code=row.get("country_code"), onsite_country=row.get("onsite_country"),
            remote=row.get("remote"), remote_scope="UNKNOWN", employment_type=row.get("type"),
            date_posted=row.get("published_at"), deadline=row.get("deadline"),
            extracted_fields=["source_native_id", "title", "datePosted", "validThrough", "canonical_url"],
            extraction_method="lizzy_public_jobposting_jsonld", source_status=200, confidence=.90,
            evidence=row["evidence"], recommendation="HUMAN_REVIEW", recommendation_reasons=row["verification_reasons"])
            for row in rows]
        lineage = RunLineageWriter(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")).record(lineage_rows)
        metrics["scan_lineage"] = RunLineageWriter.lineage_summary(lineage)
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(metrics, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
