"""Remotive collector with explicit candidate-eligibility separation.

``candidate_required_location`` answers where an applicant may be based. It
is not a physical job location and is never written to ``opportunities.location``.
"""
from __future__ import annotations

import os
import re
from typing import Any

import requests

from opportunity_sink import OpportunitySink
from source_adapters import AdapterResult, RunLineageWriter, clean, parse_applicant_eligibility, recommend

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rbrirxbjbmdxflzaxxzp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
REMOTIVE_API = "https://remotive.com/api/remote-jobs"
ADAPTER_VERSION = "remotive:v2.0.0"

CATEGORIES = ["software-dev", "customer-support", "design", "marketing", "product", "data", "devops", "finance-legal", "hr", "qa", "writing"]
RUBRO_MAP = {
    "software-dev": "Tecnología e IT", "customer-support": "Atención al Cliente", "design": "Diseño", "marketing": "Marketing y Publicidad", "product": "Producto", "data": "Tecnología e IT", "devops": "Tecnología e IT", "finance-legal": "Banca y Finanzas", "hr": "Recursos Humanos", "qa": "Tecnología e IT", "writing": "Comunicación y Medios",
}


def strip_html(text: str | None) -> str:
    return clean(re.sub(r"<[^>]+>", "", text or ""), 12000) or ""


def fetch_jobs(category: str | None = None) -> list[dict[str, Any]]:
    try:
        response = requests.get(REMOTIVE_API, params={"category": category} if category else {}, timeout=30)
        if response.status_code != 200:
            print(f"  [Remotive] HTTP {response.status_code}")
            return []
        return response.json().get("jobs", [])
    except (requests.RequestException, ValueError) as exc:
        print(f"  [Remotive] fetch error: {exc}")
        return []


def adapt_remotive_job(raw: dict[str, Any]) -> AdapterResult:
    """Adapt one API record without treating applicant scope as workplace geo."""
    source_url = clean(raw.get("url"), 2000) or ""
    candidate_required_location = clean(raw.get("candidate_required_location"), 1000)
    countries, regions, eligibility_scope = parse_applicant_eligibility(candidate_required_location)
    result = AdapterResult(
        source="remotive", adapter_version=ADAPTER_VERSION, source_url=source_url,
        source_native_id=str(raw.get("id") or "") or None, canonical_url=source_url, apply_url=source_url,
        title=clean(raw.get("title"), 240), organization=clean(raw.get("company_name"), 240),
        description=strip_html(raw.get("description")), location=None, country_code=None, onsite_country=None,
        remote=True, remote_scope="UNKNOWN", applicant_location_requirements=candidate_required_location,
        eligible_countries=countries, eligible_regions=regions,
        salary_text=clean(raw.get("salary"), 160), date_posted=clean(raw.get("publication_date"), 64),
        extraction_method="remotive_api", source_status=200, confidence=.98,
        evidence={"source_field": "candidate_required_location", "candidate_required_location": candidate_required_location, "eligibility_scope": eligibility_scope or "UNKNOWN", "work_arrangement": "REMOTE_SOURCE_CONTRACT", "job_geography": "NOT_DECLARED"},
    )
    result.extracted_fields = [field for field, value in (("title", result.title), ("organization", result.organization), ("description", result.description), ("remote", result.remote), ("eligible_countries", countries), ("eligible_regions", regions)) if value]
    result.missing_expected_fields = ["job_geography"]
    return recommend(result)


def new_row_from_detail(detail: AdapterResult, category: str) -> dict[str, Any]:
    """CREATE mapping: normalized eligibility survives, job geography remains absent."""
    return {"title": detail.title, "organization": detail.organization, "description": detail.description,
            "remote": detail.remote, "remote_scope": detail.remote_scope,
            "eligible_countries": detail.eligible_countries, "eligible_regions": detail.eligible_regions,
            "rubro": RUBRO_MAP.get(category, "General"), "type": "Remoto", "value": detail.salary_text,
            "published_at": detail.date_posted, "application_url": detail.apply_url, "source_url": detail.source_url,
            "source": "remotive", "is_active": True, "tags": [], "source_authority": "aggregator", "original_source_verified": False}


def main() -> None:
    details: list[AdapterResult] = []
    rows: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for category in CATEGORIES:
        print(f"\nFetching category: {category}")
        for raw in fetch_jobs(category):
            url = clean(raw.get("url"), 2000)
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            detail = adapt_remotive_job(raw)
            details.append(detail)
            rows.append(new_row_from_detail(detail, category))
    # Sink is used in monitored and direct CLI runs; the runtime bridge is not
    # required to preserve normalized fields.
    summary = OpportunitySink().upsert(rows) if rows else None
    lineage = RunLineageWriter(SUPABASE_URL, SUPABASE_KEY).record(details) if SUPABASE_KEY else None
    print(f"\n=== Remotive: {summary.to_dict() if summary else {}}; lineage={lineage} ===")


if __name__ == "__main__":
    main()
