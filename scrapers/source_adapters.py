"""Small deterministic contracts shared by source-specific opportunity adapters."""
from __future__ import annotations

import re
import os
import json
from collections import Counter
from datetime import date, datetime, timezone
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests
from eligibility_truth import geo_decision_ready, has_explicit_job_geography, normalize_eligibility_region

RPC_FIELDS = {
    "title", "organization", "description", "location", "country_code", "onsite_country",
    "remote_scope", "remote", "value", "currency", "published_at", "deadline",
    "application_url", "source_url", "eligible_countries", "eligible_regions",
    "requirements", "responsibilities", "benefits", "duration_text", "start_date",
    "start_date_text", "employment_type",
}
GEO_CLEAR_FIELDS = {"location", "country_code", "onsite_country", "remote_scope", "remote"}
SCOPES = {"WORLDWIDE", "LATAM", "REGIONAL", "COUNTRY_SPECIFIC", "ONSITE", "HYBRID", "UNKNOWN"}
RESTRICTED = re.compile(r"\b(us(?:a)?\s*only|united states(?:\s*only)?|canada\s*only|emea|europe(?:\s*only)?|uk\s*only|north america|apac)\b", re.I)
COUNTRY_TERMS = (
    (("paraguay", "asuncion"), "PY"), (("peru", "lima"), "PE"), (("brazil", "brasil"), "BR"),
    (("argentina",), "AR"), (("bolivia",), "BO"), (("colombia",), "CO"), (("chile",), "CL"),
    (("mexico",), "MX"), (("ecuador",), "EC"), (("uruguay",), "UY"), (("venezuela",), "VE"),
    (("united states", "usa", "new york"), "US"), (("canada",), "CA"), (("united kingdom", "uk", "london"), "GB"),
    (("switzerland", "geneva"), "CH"), (("austria", "vienna"), "AT"), (("france", "paris"), "FR"),
    (("spain", "madrid"), "ES"), (("italy", "rome"), "IT"), (("germany", "berlin"), "DE"),
    (("moldova", "chisinau"), "MD"), (("uzbekistan", "tashkent"), "UZ"), (("syria", "damascus"), "SY"),
    (("ethiopia", "addis ababa"), "ET"), (("kenya", "nairobi"), "KE"), (("somalia", "mogadishu"), "SO"),
    (("mozambique", "maputo"), "MZ"), (("south africa",), "ZA"), (("nigeria",), "NG"), (("ghana",), "GH"),
    (("india", "new delhi"), "IN"), (("indonesia", "jakarta"), "ID"), (("philippines", "manila"), "PH"),
)

@dataclass
class AdapterResult:
    source: str; adapter_version: str; source_url: str; source_native_id: str | None = None
    canonical_url: str | None = None; apply_url: str | None = None; title: str | None = None
    organization: str | None = None; description: str | None = None; location: str | None = None
    country_code: str | None = None; onsite_country: str | None = None; remote: bool | None = None
    remote_scope: str | None = None; employment_type: str | None = None; salary_text: str | None = None
    currency: str | None = None; date_posted: str | None = None; deadline: str | None = None
    applicant_location_requirements: str | None = None
    requirements: list[dict[str, str]] = field(default_factory=list)
    responsibilities: list[dict[str, str]] = field(default_factory=list)
    benefits: list[dict[str, str]] = field(default_factory=list)
    duration_text: str | None = None; start_date: str | None = None; start_date_text: str | None = None
    eligible_countries: list[str] = field(default_factory=list)
    eligible_regions: list[str] = field(default_factory=list)
    extracted_fields: list[str] = field(default_factory=list)
    missing_expected_fields: list[str] = field(default_factory=list); extraction_method: str = "html"
    source_status: int = 0; confidence: float = 0.0; evidence: dict[str, Any] = field(default_factory=dict)
    recommendation: str = "HUMAN_REVIEW"; recommendation_reasons: list[str] = field(default_factory=list)


def factual_observation_candidate(result: AdapterResult, opportunity_id: str, run_id: str | None, observed_at: str):
    """Build source-neutral factual observation only from AdapterResult evidence.

    OpportunitySink receipts are deliberately not accepted here: the adapter
    must report HTTP 200, exact source identity, both source/canonical URLs,
    and the persisted opportunity ID.
    """
    from source_evidence import ObservationCandidate
    from urllib.parse import urlparse

    if not opportunity_id or result.source_status != 200 or not result.source_native_id:
        return None
    if not result.source_url or not result.canonical_url:
        return None
    if any(urlparse(value).scheme not in {"http", "https"} or not urlparse(value).netloc for value in (result.source_url, result.canonical_url)):
        return None
    return ObservationCandidate(
        source=result.source, opportunity_id=str(opportunity_id), adapter_version=result.adapter_version,
        identity_status="IDENTITY_CONFIRMED", identity_method="adapter_native_id_and_canonical_url",
        identity_reason="ADAPTER_REPORTED_HTTP_200_EXACT_SOURCE_IDENTITY", http_status=200,
        detail_url=result.source_url, canonical_url=result.canonical_url, run_id=run_id,
        observed_at=observed_at,
        evidence={"evidence_kind":"FACTUAL_ADAPTER_OBSERVATION","source_native_id":clean(result.source_native_id, 240),
            "extraction_method":clean(result.extraction_method, 120),"extracted_fields":list(result.extracted_fields)[:40],
            "confidence":result.confidence},
    )


def eligibility_evidence_payload(result: AdapterResult) -> dict[str, Any]:
    """Return compact, source-neutral eligibility provenance for audit stores.

    Opportunity rows retain only normalized decision fields.  This payload is
    deliberately evidence, not a new decision input: it records the adapter's
    declared source field and the normalized result so a later diagnostic can
    explain ELIGIBLE, INELIGIBLE or UNKNOWN without re-parsing source code.
    """
    source_evidence = dict(result.evidence or {})
    countries = sorted({str(value).strip().upper() for value in result.eligible_countries if str(value).strip()})
    regions = sorted({str(value).strip().upper() for value in result.eligible_regions if str(value).strip()})
    requirements = clean(result.applicant_location_requirements, 1200)
    if countries or regions:
        evidence_kind = "EXPLICIT_STRUCTURED"
    elif requirements:
        evidence_kind = "EXPLICIT_UNSTRUCTURED"
    else:
        evidence_kind = "NO_EXPLICIT_ELIGIBILITY_EVIDENCE"
    source_field = (
        "locationRestrictions" if "location_restrictions" in source_evidence else
        "rss.requirements" if "rss_requirements" in source_evidence else
        "detail_description" if "eligibility" in source_evidence else
        "applicant_location_requirements" if requirements else None
    )
    payload = {
        **source_evidence,
        "eligibility_evidence_v1": {
            "contract": "eligibility-evidence:v1",
            "evidence_kind": evidence_kind,
            "source_field": source_field,
            "source_native_id": clean(result.source_native_id, 240),
            "extraction_method": clean(result.extraction_method, 120),
            "applicant_location_requirements": requirements,
            "eligible_countries": countries,
            "eligible_regions": regions,
            "remote_scope": clean(result.remote_scope, 80),
            "provenance": clean(source_evidence.get("eligibility_provenance"), 120),
        },
    }
    # The atomic RPC accepts at most 16 KiB of evidence. Source adapters are
    # already compact by contract; fail closed rather than dropping the new
    # eligibility envelope if a future adapter violates that bound.
    if len(json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")) > 16_384:
        raise ValueError("adapter_evidence_exceeds_enrichment_limit")
    return payload

def clean(value: Any, limit: int = 4000) -> str | None:
    text = re.sub(r"<[^>]+>", " ", str(value or "")).replace("&nbsp;", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] or None

def structured_items(value: Any, with_category: bool = False) -> list[dict[str, str]]:
    """Keep only factual, non-empty ordered items for the optional JSONB contract."""
    if not isinstance(value, list): return []
    items: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict): continue
        item_text = clean(item.get("text"), 1000)
        if not item_text: continue
        normalized = {"text": item_text}
        if with_category:
            category = clean(item.get("category"), 80)
            if category: normalized["category"] = category
        items.append(normalized)
    return items[:100]

def country_from_text(text: str | None) -> str | None:
    value = (text or "").lower()
    if RESTRICTED.search(value):
        if "canada" in value: return "CA"
        if "uk" in value: return "GB"
        if "united states" in value or re.search(r"\bus\b|\busa\b", value): return "US"
        return None
    for terms, code in COUNTRY_TERMS:
        if any(term in value for term in terms): return code
    return None

def _meaningful_job_location(value: str | None) -> str | None:
    """Return a concrete workplace location, never an arrangement/scope label."""
    text = clean(value, 240)
    if not text or not has_explicit_job_geography({"location": text}):
        return None
    return text


def parse_job_geography(location: str | None, remote: bool | None) -> tuple[str | None, str | None, str | None]:
    """Parse workplace geography from an explicit job-location field only.

    The middle value remains the legacy ``remote_scope`` representation for
    callers that persist it.  It is derived solely from workplace evidence and
    must never be used as applicant-eligibility evidence.
    """
    text = _meaningful_job_location(location) or ""
    countries = {code for terms, code in COUNTRY_TERMS if any(term in text.lower() for term in terms)}
    if len(countries) > 1:
        return None, "REGIONAL" if remote else "ONSITE", None
    country = country_from_text(text)
    if country:
        # Unknown modality is not evidence of onsite work.  Callers may pass
        # False only when the source explicitly establishes non-remote work.
        return country, "COUNTRY_SPECIFIC" if remote is True else "ONSITE" if remote is False else None, country
    return None, "UNKNOWN" if remote else None, None


def parse_applicant_eligibility(restrictions: str | None) -> tuple[list[str], list[str], str | None]:
    """Normalize an explicit applicant-restriction field without job-geo input."""
    text = clean(restrictions, 1000)
    if not text:
        return [], [], None
    folded = text.casefold()
    region = normalize_eligibility_region(text)
    if region == "GLOBAL":
        return [], [region], "WORLDWIDE"
    countries = sorted({code for terms, code in COUNTRY_TERMS if any(term in folded for term in terms)})
    if countries:
        return countries, [], "COUNTRY_SPECIFIC" if len(countries) == 1 else "REGIONAL"
    if region:
        return [], [region], "REGIONAL"
    return [], [], "UNKNOWN"


def geo_from_detail(location: str | None, restrictions: str | None, remote: bool | None) -> tuple[str | None, str | None, str | None]:
    """Compatibility wrapper for legacy workplace callers.

    Restrictions deliberately fail loudly: combining them with ``location``
    was the dimension-swap bug this wrapper replaces.
    """
    if clean(restrictions, 1000):
        raise ValueError("geo_from_detail no longer accepts applicant restrictions; use parse_applicant_eligibility")
    return parse_job_geography(location, remote)

def build_rpc_patch(result: AdapterResult, current: dict[str, Any]) -> dict[str, Any]:
    # Some sources can return a generic/index page with HTTP 200 for a stale
    # detail URL.  Such a response is not eligible to overwrite DB evidence.
    if result.evidence.get("detail_match") is False:
        return {}
    mapping = {"title": result.title, "organization": result.organization, "description": result.description,
      "location": result.location, "country_code": result.country_code, "onsite_country": result.onsite_country,
      "remote_scope": result.remote_scope, "remote": result.remote, "value": result.salary_text,
      "currency": result.currency, "published_at": result.date_posted, "deadline": result.deadline,
      "application_url": result.apply_url, "source_url": result.source_url,
      "eligible_countries": result.eligible_countries, "eligible_regions": result.eligible_regions,
      "requirements": structured_items(result.requirements, with_category=True) or None,
      "responsibilities": structured_items(result.responsibilities) or None,
      "benefits": structured_items(result.benefits) or None, "duration_text": clean(result.duration_text, 240),
      "start_date": result.start_date, "start_date_text": result.start_date_text,
      "employment_type": result.employment_type}
    patch = {key: value for key, value in mapping.items() if key in RPC_FIELDS and value not in (None, "") and current.get(key) != value}
    # Only clear inherited search/list geo when the adapter explicitly marks it untrusted.
    if result.evidence.get("clear_inherited_geo"):
        for key in GEO_CLEAR_FIELDS:
            if key in current and current.get(key) and mapping.get(key) is None: patch[key] = None
    # Work arrangement is independent from job geo.  This opt-in source signal
    # may clear only stale modality defaults, never location or eligibility.
    if result.evidence.get("clear_inherited_work_arrangement"):
        for key in ("remote", "remote_scope"):
            if current.get(key) is not None and mapping.get(key) is None:
                patch[key] = None
    # Arrays are additive evidence only. Empty means "no evidence", never clear.
    for key in ("eligible_countries", "eligible_regions"):
        if not mapping[key]:
            patch.pop(key, None)
    return patch


def has_positive_job_geo_evidence(result: AdapterResult) -> bool:
    """Require job-place or workplace evidence, never applicant restrictions.

    ``remote_scope`` may be derived from applicant eligibility by a source
    adapter, so it cannot certify the job-geo dimension by itself.
    """
    return has_explicit_job_geography({"location": result.location, "country_code": result.country_code, "onsite_country": result.onsite_country})

def recommend(result: AdapterResult, health: str = "HEALTHY") -> AdapterResult:
    if health == "DEGRADED": result.recommendation, result.recommendation_reasons = "HUMAN_REVIEW", ["source_degraded_deferred"]; return result
    text = " ".join(filter(None, [result.title, result.description, result.location, result.applicant_location_requirements]))
    if result.source_status in {404, 410} or not result.title or len(result.title) < 3:
        result.recommendation, result.recommendation_reasons = "AUTO_BLOCK", ["dead_or_invalid_detail"]; return result
    if result.deadline and re.match(r"^\d{4}-\d{2}-\d{2}$", result.deadline) and result.deadline < date.today().isoformat():
        result.recommendation, result.recommendation_reasons = "AUTO_BLOCK", ["expired"]; return result
    routing = {"location": result.location, "country_code": result.country_code, "onsite_country": result.onsite_country, "remote": result.remote, "eligible_countries": result.eligible_countries, "eligible_regions": result.eligible_regions}
    if result.source_status == 200 and len(result.description or "") >= 80 and result.organization and geo_decision_ready(routing):
        result.recommendation, result.recommendation_reasons = "AUTO_PUBLISH", ["strong_detail_routing_evidence"]
    else: result.recommendation, result.recommendation_reasons = "HUMAN_REVIEW", ["ambiguous_detail_evidence"]
    return result

def coverage(results: list[AdapterResult]) -> dict[str, float]:
    total = len(results)
    if not total: return {key: 0.0 for key in ("description", "organization", "geo", "apply_url", "deadline")}
    return {"description": sum(bool(x.description) for x in results)/total, "organization": sum(bool(x.organization) for x in results)/total,
      "geo": sum(bool(x.country_code or x.remote_scope not in (None, "UNKNOWN")) for x in results)/total,
      "apply_url": sum(bool(x.apply_url) for x in results)/total, "deadline": sum(bool(x.deadline) for x in results)/total}

def health(metrics: dict[str, Any], baseline: dict[str, Any] | None = None) -> tuple[str, list[str]]:
    # Bounded enrichment canaries may explicitly separate confirmed removed
    # listings from live detail attempts.  Removed 404/410 pages describe
    # source freshness; they must not masquerade as parser failures.
    uses_live_metrics = "live_detail_attempted" in metrics
    found = int(metrics.get("live_detail_attempted", metrics.get("found", 0)))
    parsed = int(metrics.get("parsed_live", metrics.get("parsed", 0)))
    attempted = int(metrics.get("live_detail_attempted", metrics.get("detail_pages_attempted", 0)))
    success = int(metrics.get("live_detail_success", metrics.get("detail_pages_success", 0)))
    cov = metrics.get("coverage_live", metrics.get("coverage", {})); reasons: list[str] = []
    if found and attempted and (success / attempted < .15 or parsed / found < .10): return "DEGRADED", ["detail_or_parse_failure"]
    if baseline and baseline.get("coverage", {}).get("description", 0) >= .6 and cov.get("description", 0) < baseline["coverage"]["description"] * .5: return "DEGRADED", ["description_coverage_drop"]
    if not found:
        if int(metrics.get("selected", metrics.get("found", 0))) > 0 and float(metrics.get("dead_rate", 0)) >= .35:
            return "WARNING", ["dead_rate_high"]
        return "UNKNOWN", ["no_records"]
    if attempted and success / attempted < .65: reasons.append("detail_success_low")
    if attempted and parsed / attempted < .65: reasons.append("detail_parse_low")
    if cov.get("description", 0) < .5: reasons.append("description_coverage_low")
    # Dead items are a source-freshness signal, not an extraction failure. The
    # threshold applies only to batches of at least three selected records.
    if int(metrics.get("selected", metrics.get("found", 0))) >= 3 and float(metrics.get("dead_rate", 0)) >= .35:
        reasons.append("dead_rate_high")
    return ("WARNING" if reasons else "HEALTHY"), reasons

def native_id(url: str) -> str | None:
    return parse_qs(urlparse(url).query).get("id", [None])[0]


@dataclass
class EnrichmentOutcome:
    """Result of one bounded atomic-enrichment attempt."""
    status: str
    retries: int = 0
    changed_fields: list[str] = field(default_factory=list)


class AtomicEnricher:
    """Small service-role client for the existing enrichment RPC.

    It deliberately has no direct UPDATE/INSERT path: the database RPC is the
    only persistence route for an existing opportunity and owns its audit row.
    """

    def __init__(self, supabase_url: str, service_key: str, session: requests.Session | None = None):
        self.base_url = supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }
        self.session = session or requests.Session()

    def lookup(self, value: str, field: str = "application_url") -> dict[str, Any] | None:
        if field not in {"application_url", "source_url"}:
            raise ValueError("unsupported_lookup_field")
        response = self.session.get(
            f"{self.base_url}/opportunities",
            headers=self.headers,
            params={
                field: f"eq.{value}",
                "select": "id,updated_at,title,organization,description,location,country_code,onsite_country,remote_scope,remote,value,currency,published_at,deadline,application_url,source_url",
                "limit": "1",
            },
            timeout=20,
        )
        response.raise_for_status()
        rows = response.json()
        return rows[0] if rows else None

    @staticmethod
    def _stale(response: requests.Response) -> bool:
        try:
            return "stale_opportunity" in str(response.json())
        except ValueError:
            return "stale_opportunity" in response.text

    def enrich_existing(self, result: AdapterResult, current: dict[str, Any] | None = None) -> EnrichmentOutcome:
        """Apply a patch once, reread on stale, and retry at most once."""
        row = current or self.lookup(result.apply_url or result.source_url)
        if not row:
            return EnrichmentOutcome("not_found")
        for attempt in range(2):
            patch = build_rpc_patch(result, row)
            if not patch:
                return EnrichmentOutcome("noop", retries=attempt)
            # The database RPC already creates the durable enrichment event.
            # Carry the monitored run identity into that event so an opportunity
            # can be traced back to the exact scan without using timestamps.
            evidence = eligibility_evidence_payload(result)
            if os.getenv("CVITAE_SCRAPER_RUN_ID"):
                evidence["run_id"] = os.environ["CVITAE_SCRAPER_RUN_ID"]
            if os.getenv("CVITAE_SOURCE_SCAN_REQUEST_ID"):
                evidence["scan_request_id"] = os.environ["CVITAE_SOURCE_SCAN_REQUEST_ID"]
            payload = {
                "p_opportunity_id": row["id"],
                "p_expected_updated_at": row["updated_at"],
                "p_adapter_version": result.adapter_version,
                "p_source_url": result.source_url,
                "p_canonical_url": result.canonical_url,
                "p_patch": patch,
                "p_evidence": evidence,
            }
            response = self.session.post(
                f"{self.base_url}/rpc/apply_opportunity_enrichment_atomic",
                headers=self.headers,
                json=payload,
                timeout=30,
            )
            if response.ok:
                data = response.json()
                value = data[0] if isinstance(data, list) and data else data
                return EnrichmentOutcome(
                    "changed" if value.get("changed") else "noop",
                    retries=attempt,
                    changed_fields=list(value.get("changed_fields") or []),
                )
            if self._stale(response) and attempt == 0:
                row = self.lookup(result.apply_url or result.source_url)
                if row:
                    continue
            return EnrichmentOutcome("stale" if self._stale(response) else "failed", retries=attempt)
        return EnrichmentOutcome("stale", retries=1)

    def recent_healthy_baseline(self, scraper_id: str) -> dict[str, Any] | None:
        """Read a few prior V2 metrics; no history means no degradation claim."""
        response = self.session.get(
            f"{self.base_url}/scraper_runs",
            headers=self.headers,
            params={
                "scraper_id": f"eq.{scraper_id}",
                "status": "eq.healthy",
                "select": "extraction_metrics",
                "order": "started_at.desc",
                "limit": "5",
            },
            timeout=20,
        )
        response.raise_for_status()
        coverages = [
            item.get("coverage", {})
            for row in response.json()
            for item in [row.get("extraction_metrics")]
            if isinstance(item, dict) and isinstance(item.get("coverage"), dict)
        ]
        if not coverages:
            return None
        keys = {key for item in coverages for key in item}
        return {"coverage": {key: sum(float(item.get(key, 0)) for item in coverages) / len(coverages) for key in keys}}


def _lineage_identity(result: AdapterResult) -> str | None:
    return result.apply_url or result.source_url or result.canonical_url


def build_scan_lineage(
    details: list[AdapterResult], *, run_id: str | None, scan_request_id: str | None,
    persisted: dict[str, str] | None = None, lineage_errors: list[str] | None = None,
    observation_states: dict[str, dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Build the compact, durable manifest for one monitored scraper run.

    ``persisted`` is keyed by an exact source/application identity.  A missing
    row is intentionally not attributed to a historical opportunity.
    """
    persisted = persisted or {}
    observation_states = observation_states or {}
    items: list[dict[str, Any]] = []
    issue_groups: Counter[str] = Counter(lineage_errors or [])
    for result in details:
        identity = _lineage_identity(result)
        opportunity_id = persisted.get(identity or "")
        if not identity:
            persistence, reason = "NOT_PERSISTED", "IDENTITY_LOOKUP_FAILED"
        elif opportunity_id:
            persistence, reason = "PERSISTED", None
        else:
            persistence, reason = "NOT_PERSISTED", "ROW_NOT_FOUND_AFTER_SINK"
        if result.source_status in {404, 410}:
            reason = "DETAIL_NOT_FOUND"
        elif not result.description:
            reason = reason or "DESCRIPTION_NOT_EXTRACTED"
        if reason:
            issue_groups[reason] += 1
        items.append({
            "identity": identity,
            "opportunity_id": opportunity_id,
            "title": clean(result.title, 240),
            "organization": clean(result.organization, 240),
            "location": clean(result.location, 240),
            "description_length": len(result.description or ""),
            "application_url": result.apply_url,
            "source_url": result.source_url,
            "detail_status": result.source_status,
            "persistence": persistence,
            "observation": observation_states.get(identity or "", {"state": "MISSING", "reason": "FACTUAL_ADAPTER_EVIDENCE_INSUFFICIENT"}),
            "reason_code": reason,
            "recommendation": result.recommendation,
        })
    return {
        "version": "scan-lineage:v1",
        "run_id": run_id,
        "scan_request_id": scan_request_id,
        "items": items,
        "counts": dict(Counter(item["persistence"] for item in items)),
        "issue_groups": dict(issue_groups),
        "lineage_evidence": {"status": "WARNING" if lineage_errors else "PASS", "reason_codes": list(dict.fromkeys(lineage_errors or []))},
    }


class RunLineageWriter:
    """Persist scan-to-opportunity lineage using existing run/event evidence."""

    def __init__(self, supabase_url: str, service_key: str, session: requests.Session | None = None):
        self.base_url = supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"}
        self.session = session or requests.Session()

    def _lookup(self, result: AdapterResult) -> str | None:
        for field, value in (("application_url", result.apply_url), ("source_url", result.source_url)):
            if not value:
                continue
            response = self.session.get(f"{self.base_url}/opportunities", headers=self.headers, params={field: f"eq.{value}", "select": "id", "limit": "1"}, timeout=20)
            response.raise_for_status()
            rows = response.json()
            if rows:
                return str(rows[0]["id"])
        return None

    def record(self, details: list[AdapterResult]) -> dict[str, Any]:
        run_id = os.getenv("CVITAE_SCRAPER_RUN_ID") or os.getenv("GITHUB_RUN_ID") or None
        scan_request_id = os.getenv("CVITAE_SOURCE_SCAN_REQUEST_ID") or None
        persisted: dict[str, str] = {}
        events: list[dict[str, Any]] = []
        lineage_errors: list[str] = []
        observation_states: dict[str, dict[str, str]] = {}
        observations: list[Any] = []
        for result in details:
            identity = _lineage_identity(result)
            if not identity:
                continue
            try:
                opportunity_id = self._lookup(result)
            except requests.RequestException:
                lineage_errors.append("LINEAGE_LOOKUP_FAILED")
                continue
            if not opportunity_id:
                continue
            persisted[identity] = opportunity_id
            observation = factual_observation_candidate(result, opportunity_id, run_id, datetime.now(timezone.utc).isoformat())
            if observation is None:
                observation_states[identity] = {"state": "MISSING", "reason": "FACTUAL_ADAPTER_EVIDENCE_INSUFFICIENT"}
            else:
                observations.append(observation)
                observation_states[identity] = {"state": "PENDING", "reason": "FACTUAL_ADAPTER_EVIDENCE_READY"}
            events.append({"opportunity_id": opportunity_id, "source": result.source, "adapter_version": result.adapter_version,
                "source_url": result.source_url, "canonical_url": result.canonical_url, "changed_fields": [],
                "before_fields": {}, "after_fields": {}, "evidence": {"event": "scan_lineage", "run_id": run_id,
                "scan_request_id": scan_request_id, "persistence": "PERSISTED",
                **eligibility_evidence_payload(result)}})
        # Existing append-only evidence table makes reverse lookup durable even
        # when a detail produced no enrichment patch.
        if events:
            try:
                response = self.session.post(f"{self.base_url}/opportunity_enrichment_events", headers={**self.headers, "Prefer": "return=minimal"}, json=events, timeout=30)
                response.raise_for_status()
            except requests.RequestException:
                # Ingestion already completed. Preserve the run manifest with a
                # durable diagnostic rather than silently losing reverse lineage.
                lineage_errors.append("LINEAGE_EVENT_WRITE_FAILED")
        if observations:
            try:
                from observation_writer import write as write_observations
                write_observations(observations, base_url=self.base_url, headers=self.headers, apply=True, session=self.session)
                written_state = {"state": "PERSISTED", "reason": "FACTUAL_OBSERVATION_WRITTEN"}
            except (requests.RequestException, ValueError):
                lineage_errors.append("OBSERVATION_WRITE_FAILED")
                written_state = {"state": "WRITE_FAILED", "reason": "FACTUAL_OBSERVATION_WRITE_FAILED"}
            for result in details:
                identity = _lineage_identity(result)
                if identity and persisted.get(identity) in {item.opportunity_id for item in observations}:
                    observation_states[identity] = written_state
        # Manifest identity is the adapter's exact application/source URL.
        normalized_observation_states = {}
        for result in details:
            identity = _lineage_identity(result)
            if identity and identity not in observation_states:
                observation_states[identity] = {"state": "MISSING", "reason": "FACTUAL_ADAPTER_EVIDENCE_INSUFFICIENT"}
            if identity:
                state = observation_states.get(identity)
                normalized_observation_states[identity] = state or {"state": "MISSING", "reason": "FACTUAL_ADAPTER_EVIDENCE_INSUFFICIENT"}
        return build_scan_lineage(details, run_id=run_id, scan_request_id=scan_request_id, persisted=persisted, lineage_errors=lineage_errors, observation_states=normalized_observation_states)

    @staticmethod
    def lineage_summary(manifest: dict[str, Any]) -> dict[str, Any]:
        """Compact summary extracted from a completed lineage manifest for logging."""
        counts = manifest.get("counts", {})
        items = manifest.get("items", [])
        return {
            "persisted": counts.get("PERSISTED", 0),
            "not_persisted": counts.get("NOT_PERSISTED", 0),
            "total": len(items),
            "issues": dict(manifest.get("issue_groups", {})),
            "lineage_status": manifest.get("lineage_evidence", {}).get("status", "UNKNOWN"),
            "scan_request_id": manifest.get("scan_request_id"),
            "run_id": manifest.get("run_id"),
        }
