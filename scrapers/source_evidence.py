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
    quality_metrics: RunQualityMetrics | None = None,
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
    coverage_complete = metrics.get("coverage_state", {}).get("complete") if isinstance(metrics.get("coverage_state"), dict) else metrics.get("coverage_complete")
    discovery_status = (
        "PROVIDER_UNREACHABLE" if found and not success and total else
        "NO_RESULTS" if found == 0 else
        "PARTIAL_COVERAGE" if coverage_complete is False else "PASS"
    )
    detail_status = "FAIL" if total and success == 0 else "WARNING" if total and parsed < total else "PASS" if total else "NOT_EVALUATED"
    rejected = int((summary or {}).get("rejected", 0) or 0)
    context = {"source": source, "run_id": os.getenv("CVITAE_SCRAPER_RUN_ID") or os.getenv("GITHUB_RUN_ID") or None, "opportunity_id": None, "adapter_version": adapter_version, "semantic_version": semantic_version}
    gates = {
        "gate_1": {"status": "FAIL" if discovery_status == "PROVIDER_UNREACHABLE" else "WARNING" if discovery_status in {"NO_RESULTS", "PARTIAL_COVERAGE"} else "PASS", "reason_code": discovery_status, "metrics": {"found": found, "detail_attempted": total, "detail_success": success}},
        "gate_2": {"status": detail_status, "reason_code": "DETAIL_TRANSLATED" if detail_status == "PASS" else "DETAIL_PARTIAL" if detail_status == "WARNING" else "DETAIL_UNAVAILABLE", "metrics": {"parsed": parsed, "attempted": total, "fields": field_states}},
        "gate_3": {"status": "WARNING" if rejected else "PASS", "reason_code": "FILTERED_ROWS" if rejected else "FILTERS_COMPLETED", "metrics": {"rejected": rejected, "valid": (summary or {}).get("valid")}},
    }
    if quality_metrics is not None:
        qm = quality_metrics
        quality_failures: list[str] = []
        if qm.total and qm.title_ok < qm.total * 0.9:
            quality_failures.append("TITLE_INCOMPLETE")
        if qm.total and qm.description_ok < qm.total * 0.5:
            quality_failures.append("DESCRIPTION_INCOMPLETE")
        if qm.total and qm.organization_ok == 0:
            quality_failures.append("ORGANIZATION_MISSING")
        if qm.total and qm.country_ok == 0:
            quality_failures.append("COUNTRY_MISSING")
        g4_status = "NOT_EVALUATED" if not qm.total else ("FAIL" if quality_failures else "PASS")
        gates["gate_4"] = {
            "status": g4_status,
            "reason_code": quality_failures[0] if quality_failures else "QUALITY_PASS",
            "metrics": {**qm.as_dict(), "_rows_source": "run_specific"},
            "evidence": {"reasons": quality_failures},
            "observed_at": None,
        }
        g2_desc_extracted = int((gates.get("gate_2", {}).get("metrics", {}).get("fields", {}).get("description", {}).get("extracted") or 0))
        proven_lost = g2_desc_extracted > 0 and qm.description_ok < max(1, qm.total * 0.25)
        field_losses: list[str] = []
        if proven_lost:
            field_losses.append("DESCRIPTION_LOST_BEFORE_PERSISTENCE")
        if g2_desc_extracted > 0 and qm.source_url_ok == 0:
            field_losses.append("SOURCE_URL_LOST")
        if g2_desc_extracted > 0 and qm.application_url_ok == 0:
            field_losses.append("APPLICATION_URL_LOST")
        g5_status = "FAIL" if proven_lost else ("WARNING" if not qm.source_url_ok or not qm.description_ok else "PASS")
        g5_reason = (field_losses[0] if field_losses else (
            "PERSISTENCE_UNPROVEN_SOURCE_URL_MISSING" if not qm.source_url_ok else
            "PERSISTENCE_UNPROVEN_DESCRIPTION_MISSING" if not qm.description_ok else "PERSISTED_OK"
        ))
        gates["gate_5"] = {
            "status": g5_status,
            "reason_code": g5_reason,
            "metrics": {"total": qm.total, "description_ok": qm.description_ok, "source_url_ok": qm.source_url_ok, "application_url_ok": qm.application_url_ok, "_rows_source": "run_specific"},
            "evidence": {"field_losses": field_losses, "extracted_description": g2_desc_extracted},
            "observed_at": None,
        }
        g1_s = gates["gate_1"]["status"]
        g3_s = gates["gate_3"]["status"]
        g4_s = gates["gate_4"]["status"]
        g5_s = gates["gate_5"]["status"]
        if g1_s == "FAIL" or g3_s == "FAIL":
            g6_overall, g6_status, g6_reason = "RUNTIME_FAIL", "FAIL", "RUNTIME_HEALTH_FAIL"
        elif g4_s == "FAIL":
            g6_overall, g6_status, g6_reason = "DATA_QUALITY_FAIL", "FAIL", "DATA_QUALITY_FAIL"
        elif g5_s == "FAIL":
            g6_overall, g6_status, g6_reason = "PERSISTENCE_FAIL", "FAIL", "PERSISTENCE_FAIL"
        elif any(gates.get(f"gate_{i}", {}).get("status") == "WARNING" for i in range(1, 6)):
            g6_overall, g6_status, g6_reason = "PARTIAL", "WARNING", "PARTIAL_HEALTH"
        else:
            g6_overall, g6_status, g6_reason = "HEALTHY", "PASS", "HEALTHY"
        gates["gate_6"] = {
            "status": g6_status,
            "reason_code": g6_reason,
            "metrics": {
                "overall": g6_overall,
                "scope": "run_specific",
                "runtime_health": g1_s,
                "filter_health": g3_s,
                "quality_health": g4_s,
                "persistence_health": g5_s,
            },
            "evidence": {},
            "observed_at": None,
        }

    gate_entries: dict[str, Any] = {}
    for name, value in gates.items():
        if name in {"gate_4", "gate_5", "gate_6"}:
            gate_entries[name] = {**value, **context}
        else:
            gate_entries[name] = {**value, "evidence": {}, "observed_at": None, **context}
    return {
        "contract": "source-intelligence:eight-gates:v1",
        **context,
        **gate_entries,
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


@dataclass
class RunQualityMetrics:
    """Field-level quality measured during a bounded scraper run (before DB persistence)."""
    total: int
    title_ok: int
    description_ok: int
    description_thin: int
    organization_ok: int
    location_ok: int
    country_ok: int
    application_url_ok: int
    source_url_ok: int
    eligibility_present: int
    tags_present: int
    coverage_complete: bool | None = None
    stop_reason: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "title_ok": self.title_ok,
            "description_ok": self.description_ok,
            "description_thin": self.description_thin,
            "organization_ok": self.organization_ok,
            "location_ok": self.location_ok,
            "country_ok": self.country_ok,
            "application_url_ok": self.application_url_ok,
            "source_url_ok": self.source_url_ok,
            "eligibility_present": self.eligibility_present,
            "tags_present": self.tags_present,
            "coverage_complete": self.coverage_complete,
            "stop_reason": self.stop_reason,
        }


def run_quality_metrics(
    details: list[Any],
    *,
    coverage_complete: bool | None = None,
    stop_reason: str | None = None,
) -> RunQualityMetrics:
    """Compute RunQualityMetrics from a list of scraped items (arbitrary attr access)."""
    def _has(item: Any, attr: str, min_len: int = 1) -> bool:
        v = getattr(item, attr, None)
        return (len(v.strip()) >= min_len) if isinstance(v, str) else bool(v)

    total = len(details)
    return RunQualityMetrics(
        total=total,
        title_ok=sum(_has(r, "title") for r in details),
        description_ok=sum(_has(r, "description", 80) for r in details),
        description_thin=sum(1 for r in details if _has(r, "description", 1) and not _has(r, "description", 80)),
        organization_ok=sum(_has(r, "organization") for r in details),
        location_ok=sum(_has(r, "location") for r in details),
        country_ok=sum(_has(r, "country_code") for r in details),
        application_url_ok=sum(_has(r, "apply_url") for r in details),
        source_url_ok=sum(_has(r, "source_url") for r in details),
        eligibility_present=sum(_has(r, "eligible_countries") for r in details),
        tags_present=sum(_has(r, "tags") for r in details),
        coverage_complete=coverage_complete,
        stop_reason=stop_reason,
    )


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
