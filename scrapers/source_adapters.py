"""Small deterministic contracts shared by source-specific opportunity adapters."""
from __future__ import annotations

import re
from datetime import date
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests

RPC_FIELDS = {
    "title", "organization", "description", "location", "country_code", "onsite_country",
    "remote_scope", "remote", "value", "currency", "published_at", "deadline",
    "application_url", "source_url", "eligible_countries", "eligible_regions",
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
    eligible_countries: list[str] = field(default_factory=list)
    eligible_regions: list[str] = field(default_factory=list)
    extracted_fields: list[str] = field(default_factory=list)
    missing_expected_fields: list[str] = field(default_factory=list); extraction_method: str = "html"
    source_status: int = 0; confidence: float = 0.0; evidence: dict[str, Any] = field(default_factory=dict)
    recommendation: str = "HUMAN_REVIEW"; recommendation_reasons: list[str] = field(default_factory=list)

def clean(value: Any, limit: int = 4000) -> str | None:
    text = re.sub(r"<[^>]+>", " ", str(value or "")).replace("&nbsp;", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] or None

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

def geo_from_detail(location: str | None, restrictions: str | None, remote: bool | None) -> tuple[str | None, str | None, str | None]:
    text = " ".join(filter(None, [location, restrictions]))
    countries = {code for terms, code in COUNTRY_TERMS if any(term in text.lower() for term in terms)}
    if len(countries) > 1:
        return None, "REGIONAL" if remote else "ONSITE", None
    country = country_from_text(text)
    if RESTRICTED.search(text): return country, "REGIONAL", country
    if re.search(r"\b(worldwide|all countries|global|anywhere in (?:the )?world|work from anywhere)\b", text, re.I): return "WW", "WORLDWIDE", None
    if re.search(r"\b(latam|latin america|south america)\b", text, re.I): return None, "LATAM", None
    if country:
        # Unknown modality is not evidence of onsite work.  Callers may pass
        # False only when the source explicitly establishes non-remote work.
        return country, "COUNTRY_SPECIFIC" if remote is True else "ONSITE" if remote is False else None, country
    return None, "UNKNOWN" if remote else None, None

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
      "eligible_countries": result.eligible_countries, "eligible_regions": result.eligible_regions}
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
    """Keep job location, candidate eligibility and work arrangement distinct."""
    explicit_scope = result.remote_scope in {"WORLDWIDE", "LATAM", "REGIONAL", "COUNTRY_SPECIFIC"}
    explicit_location = bool(result.country_code or result.onsite_country)
    return explicit_location or explicit_scope

def recommend(result: AdapterResult, health: str = "HEALTHY") -> AdapterResult:
    if health == "DEGRADED": result.recommendation, result.recommendation_reasons = "HUMAN_REVIEW", ["source_degraded_deferred"]; return result
    text = " ".join(filter(None, [result.title, result.description, result.location, result.applicant_location_requirements]))
    if result.source_status in {404, 410} or not result.title or len(result.title) < 3:
        result.recommendation, result.recommendation_reasons = "AUTO_BLOCK", ["dead_or_invalid_detail"]; return result
    if result.deadline and re.match(r"^\d{4}-\d{2}-\d{2}$", result.deadline) and result.deadline < date.today().isoformat():
        result.recommendation, result.recommendation_reasons = "AUTO_BLOCK", ["expired"]; return result
    if result.source_status == 200 and len(result.description or "") >= 80 and result.organization and has_positive_job_geo_evidence(result):
        result.recommendation, result.recommendation_reasons = "AUTO_PUBLISH", ["strong_detail_geo_evidence"]
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
            payload = {
                "p_opportunity_id": row["id"],
                "p_expected_updated_at": row["updated_at"],
                "p_adapter_version": result.adapter_version,
                "p_source_url": result.source_url,
                "p_canonical_url": result.canonical_url,
                "p_patch": patch,
                "p_evidence": result.evidence,
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
