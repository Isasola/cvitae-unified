"""Lever Postings connector with bounded skip/limit continuation."""
from __future__ import annotations
import json, os, sys, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
import requests
from opportunity_sink import OpportunitySink
from greenhouse_scraper import clean_html

SOURCE_ID = "lever"; CONFIG = Path(__file__).with_name("ats_boards.json")
BASES = {"global": "https://api.lever.co/v0/postings/{site}", "eu": "https://api.eu.lever.co/v0/postings/{site}"}

def adapt_posting(site: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    categories=raw.get("categories") or {}; hosted=str(raw.get("hostedUrl") or "").strip(); apply=str(raw.get("applyUrl") or hosted).strip()
    workplace=str(raw.get("workplaceType") or "unspecified").casefold(); country=str(raw.get("country") or "").upper()
    native_id=str(raw.get("id") or "").strip()
    if not native_id:
        raise ValueError("lever_posting_missing_native_id")
    hosted_parts=urlparse(hosted)
    hosted_segments=[part for part in hosted_parts.path.split("/") if part]
    if hosted_parts.scheme != "https" or hosted_parts.netloc.casefold() not in {"jobs.lever.co", "jobs.eu.lever.co"} or \
       len(hosted_segments) < 2 or hosted_segments[0].casefold() != str(site["site"]).casefold() or hosted_segments[1] != native_id:
        raise ValueError("lever_hosted_url_identity_mismatch")
    created_at=raw.get("createdAt")
    published_at=datetime.fromtimestamp(int(created_at)/1000, timezone.utc).isoformat() if created_at else None
    all_locations=categories.get("allLocations") or []
    return {
        "title": str(raw.get("text") or "").strip(), "organization": site["employer"],
        "description": (str(raw.get("descriptionPlain") or clean_html(raw.get("description")))[:12000]
                        if site.get("description_reuse_allowed") is True else None),
        "location": str(categories.get("location") or "").strip(), "country_code": country or None,
        "onsite_country": country or None, "published_at": published_at,
        "remote": True if workplace == "remote" else False if workplace == "on-site" else None,
        "remote_scope": "UNKNOWN", "eligible_countries": [], "eligible_regions": [],
        "application_url": apply, "source_url": hosted, "original_source_url": hosted,
        "source": SOURCE_ID, "source_authority": "original", "original_source_verified": bool(hosted),
        "opportunity_type": "job", "type": categories.get("commitment"),
        "recruiter_vacancy_id": f"lever:{site['site']}:{native_id}",
        "source_native_id": f"lever:{site['site']}:{native_id}",
        "tags": ["Lever", site["employer"], categories.get("team"), categories.get("department")],
        "workplace_type": raw.get("workplaceType"),
        "alternate_locations": [str(value) for value in all_locations if value],
        "verification_status": "in_review", "is_active": False,
        "catalog_eligible": False, "match_eligible": False, "alerts_eligible": False, "seo_eligible": False,
    }

def fetch_site(site: dict[str, Any], session: requests.Session | None = None, page_size: int = 100, max_pages: int = 100) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    client=session or requests.Session(); base=BASES.get(site.get("region", "global"), BASES["global"]).format(site=site["site"])
    rows=[]; seen=set(); pages=0
    offset=0
    while pages < max_pages:
        response=client.get(base, params={"mode":"json","skip":offset,"limit":page_size}, headers={"Accept":"application/json","User-Agent":"CVitaeBot/1.0 (+https://cvitae.lat)"}, timeout=(5,25))
        if response.status_code == 429: raise RuntimeError("lever_rate_limited")
        response.raise_for_status(); page=response.json()
        if not isinstance(page,list): raise RuntimeError("lever_invalid_payload")
        pages += 1
        offset += len(page)
        ids=[str(item.get("id")) for item in page if item.get("id")]
        if ids and all(i in seen for i in ids): raise RuntimeError("lever_repeated_page")
        for item in page:
            identity=str(item.get("id") or "")
            if not identity or identity in seen: continue
            seen.add(identity); rows.append(item)
        if len(page) < page_size: break
        time.sleep(float(site.get("delay_seconds", .25)))
    else: raise RuntimeError("lever_continuation_budget_exhausted")
    return [adapt_posting(site, row) for row in rows], {"pages":pages,"received":len(rows),"complete":True}

def fetch_posting_detail(site: dict[str, Any], native_id: str, session: requests.Session | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Fetch exactly one native Lever posting; never list a whole tenant for a canary."""
    if not native_id or "/" in native_id or "?" in native_id or "#" in native_id:
        raise ValueError("lever_invalid_native_id")
    client=session or requests.Session()
    base=BASES.get(site.get("region", "global"), BASES["global"]).format(site=site["site"])
    response=client.get(f"{base}/{native_id}", headers={"Accept":"application/json","User-Agent":"CVitaeBot/1.0 (+https://cvitae.lat)"}, timeout=(5,25))
    if response.status_code == 429: raise RuntimeError("lever_rate_limited")
    response.raise_for_status()
    raw=response.json()
    if not isinstance(raw,dict) or str(raw.get("id") or "") != native_id:
        raise RuntimeError("lever_canary_detail_identity_mismatch")
    # Verify the API's own hosted URL binds the expected tenant and ID before
    # returning data to the canary path/Sink.
    adapt_posting(site, raw)
    return raw,{"http_status":response.status_code,"endpoint":"detail","native_id":native_id}

def configured_sites(requested: list[str] | None = None) -> list[dict[str, Any]]:
    data=json.loads(CONFIG.read_text(encoding="utf-8")); sites=data.get("lever") or []
    approved = [x for x in sites if x.get("enabled") is True and x.get("permission_state") == "REVIEW_APPROVED" and x.get("site") and x.get("employer")]
    if requested:
        by_name = {str(site["site"]).casefold(): site for site in approved}
        missing = [name for name in requested if name.casefold() not in by_name]
        if missing:
            raise ValueError("lever_production_tenant_not_enabled_and_review_approved:" + ",".join(missing))
        return [by_name[name.casefold()] for name in requested]
    return approved

def review_sites(requested: list[str]) -> list[dict[str, Any]]:
    """Select exact configured tenants for local audit only; never activates them."""
    data=json.loads(CONFIG.read_text(encoding="utf-8")); sites=data.get("lever") or []
    by_name={str(row.get("site") or "").casefold(): row for row in sites if row.get("site") and row.get("employer")}
    selected=[]
    for name in requested:
        row=by_name.get(name.casefold())
        if row is None:
            raise ValueError("lever_audit_tenant_not_configured")
        selected.append(row)
    return selected

def parse_canary_native_id(value: str) -> tuple[str, str]:
    """Require a tenant-scoped identity such as lever:coderio:<native-id>."""
    parts = str(value or "").strip().split(":", 2)
    if len(parts) != 3 or parts[0].casefold() != SOURCE_ID or not parts[1].strip() or not parts[2].strip():
        raise ValueError("lever_canary_id_must_be_lever_tenant_native_id")
    return parts[1].strip(), parts[2].strip()

def select_canary_rows(rows: list[dict[str, Any]], target: str) -> list[dict[str, Any]]:
    """Fail closed unless exactly one adapted posting matches the tenant-scoped ID."""
    tenant, native_id = parse_canary_native_id(target)
    expected = f"{SOURCE_ID}:{tenant}:{native_id}"
    matches = [row for row in rows if row.get("source_native_id") == expected]
    if len(matches) != 1:
        raise RuntimeError("lever_canary_target_not_found_or_ambiguous")
    return matches

def validate_market_scope(site: dict[str, Any], row: dict[str, Any]) -> None:
    """Reject a tenant-scoped PY canary when the primary job location is elsewhere."""
    if site.get("market_scope") == "PY_PRIMARY" and str(row.get("country_code") or "").upper() != "PY":
        raise RuntimeError("lever_canary_not_primary_py")

def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1"); rows=[]
    audit = os.getenv("CVITAE_AUDIT_MODE", "0") == "1"
    review_tenants = [value.strip() for value in os.getenv("CVITAE_LEVER_REVIEW_TENANTS", "").split(",") if value.strip()]
    if review_tenants and not audit:
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found":0,"failed":1,"reason":"LEVER_REVIEW_TENANTS_REQUIRE_AUDIT_MODE"}))
        raise SystemExit(2)
    target = os.getenv("CVITAE_LEVER_CANARY_NATIVE_ID", "").strip()
    target_site = parse_canary_native_id(target)[0] if target else None
    production_tenants = [value.strip() for value in os.getenv("CVITAE_LEVER_PRODUCTION_TENANTS", "").split(",") if value.strip()]
    try:
        sites = review_sites(review_tenants) if review_tenants else configured_sites(production_tenants or None)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found":0,"failed":1,"reason":str(exc)}))
        raise SystemExit(2) from exc
    if target_site:
        sites = [site for site in sites if site["site"] == target_site]
        if not sites:
            print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found":0,"failed":1,"reason":"CANARY_SITE_NOT_ENABLED_AND_REVIEW_APPROVED","canary_native_id":target}))
            raise SystemExit(2)
    if target:
        try:
            tenant, native_id = parse_canary_native_id(target)
            site = next(site for site in sites if site["site"] == tenant)
            raw, detail_meta = fetch_posting_detail(site, native_id)
            row = adapt_posting(site, raw)
            validate_market_scope(site, row)
            rows = select_canary_rows([row], target)
            print(json.dumps({"provider":SOURCE_ID,"site":tenant,"canary_only":True,**detail_meta}))
        except (RuntimeError, StopIteration, requests.RequestException, ValueError) as exc:
            print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found":0,"failed":1,"reason":str(exc),"canary_native_id":target}))
            raise SystemExit(2) from exc
    else:
        for site in sites:
            page_budget = max(1, min(int(os.getenv("CVITAE_LEVER_MAX_PAGES", "100")), 100))
            found,coverage=fetch_site(site, max_pages=page_budget)
            primary_py = sum(1 for row in found if str(row.get("country_code") or "").upper() == "PY")
            alternate_py = sum(1 for row in found if str(row.get("country_code") or "").upper() != "PY"
                               and any("paraguay" in value.casefold() or "asuncion" in value.casefold() or "asunción" in value.casefold()
                                       for value in row.get("alternate_locations", [])))
            if site.get("market_scope") == "PY_PRIMARY":
                found = [row for row in found if str(row.get("country_code") or "").upper() == "PY"]
                if site.get("detail_verify_before_sink"):
                    verified = []
                    detail_failures = []
                    detail_session = requests.Session()
                    for row in found:
                        native_id = row["source_native_id"].split(":", 2)[-1]
                        try:
                            raw_detail, _detail_meta = fetch_posting_detail(site, native_id, session=detail_session)
                            detail_row = adapt_posting(site, raw_detail)
                            if detail_row["source_native_id"] != row["source_native_id"] or detail_row["title"] != row["title"]:
                                raise RuntimeError("lever_detail_identity_or_title_mismatch")
                            row["detail_fetch_status"] = 200
                            verified.append(row)
                        except requests.RequestException as exc:
                            status = getattr(getattr(exc, "response", None), "status_code", None)
                            if status == 429:
                                raise RuntimeError("lever_rate_limited") from exc
                            detail_failures.append({"native_id": native_id, "http_status": status, "reason": type(exc).__name__})
                        except RuntimeError as exc:
                            if "rate_limited" in str(exc):
                                raise
                            detail_failures.append({"native_id": native_id, "reason": str(exc)})
                        time.sleep(float(site.get("delay_seconds", .25)))
                    found = verified
                    coverage["detail_attempted"] = primary_py
                    coverage["detail_http_200"] = len(verified)
                    coverage["detail_failed"] = detail_failures
                rows.extend(found)
            else:
                rows.extend(found)
            print(json.dumps({"provider":SOURCE_ID,"site":site["site"],"py_primary":primary_py,
                              "py_alternate_only":alternate_py,"py_rows_submitted_to_sink":len(found),**coverage}, ensure_ascii=False))
    summary=OpportunitySink().upsert(rows, adapter_version="lever:v1.1.0") if rows else None
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict() if summary else {"found":0,"reason":"NO_APPROVED_SITES"}))
    audit_jsonl = os.getenv("CVITAE_LEVER_AUDIT_JSONL", "").strip()
    if audit_jsonl:
        if not audit:
            print("LEVER_AUDIT_JSONL_REQUIRES_AUDIT_MODE", file=sys.stderr)
            raise SystemExit(2)
        target_path = Path(audit_jsonl).resolve()
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with target_path.open("w", encoding="utf-8", newline="\n") as stream:
            for row in rows:
                item = {key: value for key, value in row.items() if key not in {"description", "evidence"}}
                item.update({"evidence_grade":"LIVE_HTTP_API_LISTING_REVIEW_ONLY", "new_vs_prod":"UNVERIFIED",
                             "production_write":False, "candidate_eligibility":"UNKNOWN"})
                stream.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")
    if rows and not audit:
        from source_adapters import AdapterResult, RunLineageWriter
        site_by_name = {str(site["site"]).casefold(): site for site in sites}
        lineage_rows=[]
        for row in rows:
            posted=row.get("published_at")
            native=row.get("source_native_id")
            tenant = native.split(":", 2)[1] if isinstance(native, str) and native.count(":") >= 2 else ""
            source_site = site_by_name.get(tenant.casefold(), {})
            lineage_rows.append(AdapterResult(
                source=SOURCE_ID, adapter_version="lever:v1.1.0", source_url=row["source_url"],
                source_native_id=native, canonical_url=row["source_url"], apply_url=row["application_url"],
                title=row["title"], organization=row["organization"], description=row.get("description"),
                location=row.get("location"), country_code=row.get("country_code"), onsite_country=row.get("onsite_country"),
                remote=row.get("remote"), remote_scope="UNKNOWN", employment_type=row.get("type"), date_posted=posted,
                eligible_countries=[], extracted_fields=["native_id","title","hostedUrl","applyUrl","country","location","workplaceType"] + (["createdAt"] if posted else []),
                extraction_method="lever_public_postings_api_detail" if target else "lever_public_postings_api_listing",
                source_status=200, confidence=.95,
                evidence={"tenant":row.get("source_native_id", "").split(":")[1], "source_native_id":native,
                    "primary_location":row.get("location"),"primary_country":row.get("onsite_country"),
                    "alternate_locations":row.get("alternate_locations",[]),
                    "candidate_eligibility":"UNKNOWN","work_arrangement":row.get("workplace_type"),
                    "deadline":"NOT_PROVIDED","created_at":posted,"detail_endpoint_used":bool(target),
                    "description_reuse_allowed":source_site.get("description_reuse_allowed") is True},
                recommendation="HUMAN_REVIEW", recommendation_reasons=["TENANT_REVIEW_REQUIRED","CANDIDATE_ELIGIBILITY_UNKNOWN","REUSE_PERMISSION_REQUIRES_APPROVAL"],
            ))
        lineage=RunLineageWriter(os.getenv("SUPABASE_URL", ""),os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")).record(lineage_rows)
        print("CVITAE_SCAN_LINEAGE="+json.dumps(RunLineageWriter.lineage_summary(lineage)))

if __name__ == "__main__": main()
