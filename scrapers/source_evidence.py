"""Source-neutral runtime evidence contracts.

Providers report transport/parser health, inventory coverage and row quality
independently.  A bounded run is useful evidence; it is not a provider outage.
All helpers are pure so runners can use them without creating observations.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any


HEALTHY = "HEALTHY"
DEGRADED = "DEGRADED"
UNHEALTHY = "UNHEALTHY"
UNKNOWN = "UNKNOWN"


def runtime_telemetry(
    *, provider_health: str | None, coverage_complete: bool | None,
    coverage_stop_reason: str | None, found: int, valid: int,
    processed: int | None = None, rejected: int = 0,
    rejection_reasons: dict[str, int] | None = None,
    page_budget_reached: bool = False, runtime_budget_reached: bool = False,
    provider_error: str | None = None, parser_error: str | None = None,
) -> dict[str, Any]:
    """Build the portable V2 telemetry shape emitted into ``scraper_runs``."""
    health = (provider_health or UNKNOWN).upper()
    if health not in {HEALTHY, DEGRADED, UNHEALTHY, UNKNOWN}:
        health = UNKNOWN
    stop = coverage_stop_reason or (
        "complete" if coverage_complete is True else "unknown"
    )
    return {
        "runtime_evidence_version": "source-evidence:v1",
        "operational_health": {
            "status": health,
            "provider_error": provider_error,
            "parser_error": parser_error,
        },
        "coverage_state": {
            "complete": coverage_complete,
            "stop_reason": stop,
            "page_budget_reached": bool(page_budget_reached),
            "runtime_budget_reached": bool(runtime_budget_reached),
        },
        "row_quality": {
            "found": max(0, int(found)),
            "valid": max(0, int(valid)),
            "processed": max(0, int(processed if processed is not None else valid)),
            "rejected": max(0, int(rejected)),
            "rejection_reasons": dict(rejection_reasons or {}),
        },
    }


# Eight Gates is deliberately a compact, transport-safe projection.  The full
# page body never belongs in scraper_runs; row-level detail evidence remains in
# opportunity_source_observations and opportunity_enrichment_events.
EIGHT_GATE_STATUSES = {"PASS", "WARNING", "FAIL", "NOT_APPLICABLE", "NOT_EVALUATED"}


def eight_gates_run_evidence(
    *, source: str, adapter_version: str, metrics: dict[str, Any], details: list[Any],
    summary: dict[str, Any] | None, semantic_version: str = "source-contract:v2.0",
) -> dict[str, Any]:
    """Emit durable, aggregate run evidence without guessing absent fields.

    This is consumed by Source Intelligence.  ``UNKNOWN`` deliberately means
    the adapter did not establish whether a source omitted a field or failed
    to expose it; it is never silently recast as NOT_PUBLISHED_BY_SOURCE.
    """
    total = len(details)
    found = int(metrics.get("found", total) or 0)
    success = int(metrics.get("detail_pages_success", 0) or 0)
    parsed = int(metrics.get("parsed", 0) or 0)
    fields = {
        "title": "title", "description": "description", "organization": "organization",
        "location": "location", "country": "country_code", "application_url": "apply_url",
        "source_url": "source_url", "salary": "salary_text", "eligibility": "eligible_countries",
        "work_arrangement": "remote_scope", "dates": "deadline", "opportunity_type": "employment_type",
    }
    expected = {"title", "description", "organization", "application_url", "source_url"}
    field_states: dict[str, dict[str, Any]] = {}
    for name, attribute in fields.items():
        extracted = sum(bool(getattr(item, attribute, None)) for item in details)
        if not total:
            state = "UNKNOWN"
        elif extracted:
            state = "EXTRACTED"
        elif name in expected:
            state = "EXPECTED_BUT_NOT_EXTRACTED"
        else:
            state = "UNKNOWN"
        field_states[name] = {"state": state, "extracted": extracted, "total": total}
    discovery_status = (
        "PROVIDER_UNREACHABLE" if found and not success and total else
        "NO_RESULTS" if found == 0 else
        "PARTIAL_COVERAGE" if metrics.get("coverage_complete") is False else "PASS"
    )
    detail_status = "FAIL" if total and success == 0 else "WARNING" if total and parsed < total else "PASS" if total else "NOT_EVALUATED"
    rejected = int((summary or {}).get("rejected", 0) or 0)
    context = {"source": source, "run_id": os.getenv("CVITAE_SCRAPER_RUN_ID") or os.getenv("GITHUB_RUN_ID") or None, "opportunity_id": None, "adapter_version": adapter_version, "semantic_version": semantic_version}
    gates = {
        "gate_1": {"status": "FAIL" if discovery_status == "PROVIDER_UNREACHABLE" else "WARNING" if discovery_status in {"NO_RESULTS", "PARTIAL_COVERAGE"} else "PASS", "reason_code": discovery_status, "metrics": {"found": found, "detail_attempted": total, "detail_success": success}},
        "gate_2": {"status": detail_status, "reason_code": "DETAIL_TRANSLATED" if detail_status == "PASS" else "DETAIL_PARTIAL" if detail_status == "WARNING" else "DETAIL_UNAVAILABLE", "metrics": {"parsed": parsed, "attempted": total, "fields": field_states}},
        "gate_3": {"status": "WARNING" if rejected else "PASS", "reason_code": "FILTERED_ROWS" if rejected else "FILTERS_COMPLETED", "metrics": {"rejected": rejected, "valid": (summary or {}).get("valid")}},
    }
    return {
        "contract": "source-intelligence:eight-gates:v1",
        **context,
        **{name: {**value, "evidence": {}, "observed_at": None, **context} for name, value in gates.items()},
    }


def classify_run_evidence(run: dict[str, Any]) -> dict[str, Any]:
    """Classify one persisted run without treating policy caps as incidents.

    Old, unstructured ``warning`` rows intentionally remain ``UNKNOWN``.  They
    cannot prove a provider is healthy, but they also must not poison health
    merely because a configured cap or a few rejected rows were reported.
    """
    metrics = run.get("extraction_metrics") or {}
    structured = metrics.get("operational_health") if isinstance(metrics, dict) else None
    legacy_health = (metrics.get("health") or {}).get("status") if isinstance(metrics, dict) else None
    run_status = str(run.get("status") or "").casefold()
    if run_status in {"failed", "telemetry_failed"}:
        return {"status": UNHEALTHY, "reason_codes": ["LATEST_RUN_FAILED"], "provenance": "run_status"}
    if isinstance(structured, dict):
        status = str(structured.get("status") or UNKNOWN).upper()
        if status not in {HEALTHY, DEGRADED, UNHEALTHY, UNKNOWN}:
            status = UNKNOWN
        reasons: list[str] = []
        if structured.get("provider_error"):
            reasons.append("PROVIDER_ERROR")
        if structured.get("parser_error"):
            reasons.append("PARSER_ERROR")
        if not reasons and status != HEALTHY:
            reasons.append(f"PROVIDER_{status}")
        return {"status": status, "reason_codes": reasons, "provenance": "structured_v2"}
    if legacy_health in {"DEGRADED", "WARNING"} or run_status in {"warning", "partial_success"}:
        return {"status": UNKNOWN, "reason_codes": ["LEGACY_WARNING_UNCLASSIFIED"], "provenance": "legacy_unstructured"}
    if legacy_health == "HEALTHY" or run_status == "healthy":
        return {"status": UNKNOWN, "reason_codes": ["HEALTH_EVIDENCE_UNSTRUCTURED"], "provenance": "legacy_unstructured"}
    return {"status": UNKNOWN, "reason_codes": ["NO_HEALTH_EVIDENCE"], "provenance": "legacy_unstructured"}


@dataclass(frozen=True)
class ObservationCandidate:
    """Append-only observation proposal; persistence is deliberately separate."""
    source: str
    opportunity_id: str
    adapter_version: str
    identity_status: str
    identity_method: str
    identity_reason: str
    http_status: int | None
    detail_url: str | None
    canonical_url: str | None
    run_id: str | None
    observed_at: str
    evidence: dict[str, Any]

    def to_payload(self) -> dict[str, Any]:
        return {
            "source": self.source, "opportunity_id": self.opportunity_id,
            "adapter_version": self.adapter_version,
            "identity_status": self.identity_status,
            "identity_method": self.identity_method,
            "identity_reason": self.identity_reason,
            "http_status": self.http_status, "detail_url": self.detail_url,
            "canonical_url": self.canonical_url, "run_id": self.run_id,
            "observed_at": self.observed_at, "evidence": self.evidence,
        }


def exact_live_observation_candidate(*, source: str, opportunity_id: str,
    adapter_version: str, canonical_url: str, run_id: str | None,
    observed_at: str, evidence: dict[str, Any] | None = None) -> ObservationCandidate:
    """Provider-bulk evidence is live only when canonical identity matches exactly."""
    return ObservationCandidate(
        source=source, opportunity_id=str(opportunity_id), adapter_version=adapter_version,
        identity_status="IDENTITY_CONFIRMED", identity_method="canonical_url_exact",
        identity_reason="authoritative_provider_inventory_exact_match", http_status=200,
        detail_url=canonical_url, canonical_url=canonical_url, run_id=run_id,
        observed_at=observed_at, evidence={"provider_live": True, "bulk_identity": True, **(evidence or {})},
    )
