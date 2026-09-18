"""Pure helpers for bounded, source-wide Opportunity Automation evaluation."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from opportunity_automation import (
    AUTO_PROMOTE,
    embedding_permitted,
    evaluate_opportunity_automation_policy,
)
from opportunity_factory import seal
from source_cleaners.base import SourceProfile
from source_evidence import classify_run_evidence


AUTOMATION_FACTORY_STATUSES = {"pending", "ready", "review", "failed"}
SAMPLE_LIMIT = 3


def parse_timestamp(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def operational_health_from_runs(
    runs: list[dict[str, Any]], profile: SourceProfile, *, now: datetime,
) -> dict[str, Any]:
    """Derive health only from real scraper/maintenance telemetry."""
    telemetry_error = next((item.get("_telemetry_error") for item in runs if item.get("_telemetry_error")), None)
    if telemetry_error:
        return {"status": "UNKNOWN", "fresh": False, "observed_at": None, "evidence_source": "scraper_runs", "reason_codes": [str(telemetry_error)]}
    ordered = sorted(
        runs,
        key=lambda item: parse_timestamp(item.get("finished_at") or item.get("started_at")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    if not ordered:
        return {"status": "UNKNOWN", "fresh": False, "observed_at": None, "evidence_source": "scraper_runs", "reason_codes": ["NO_SOURCE_RUN"]}
    latest = ordered[0]
    observed = parse_timestamp(latest.get("finished_at") or latest.get("started_at"))
    fresh = bool(observed and observed >= now - timedelta(hours=profile.freshness_ttl_hours))
    if not fresh:
        return {"status": "UNKNOWN", "fresh": False, "observed_at": observed.isoformat() if observed else None, "evidence_source": "scraper_runs", "latest_run_id": latest.get("run_id") or latest.get("scraper_id"), "reason_codes": ["SOURCE_HEALTH_STALE"]}
    classified = classify_run_evidence(latest)
    return {
        "status": classified["status"], "fresh": True, "observed_at": observed.isoformat() if observed else None,
        "evidence_source": "scraper_runs", "latest_run_id": latest.get("run_id") or latest.get("scraper_id"),
        "reason_codes": classified["reason_codes"], "evidence_provenance": classified["provenance"],
    }


def freshness_from_evidence(
    row: dict[str, Any], observation: dict[str, Any] | None, profile: SourceProfile, *, now: datetime,
) -> dict[str, Any]:
    """Conservative row freshness; source absence and transport errors are never death."""
    deadline = str(row.get("deadline") or "")
    if deadline:
        try:
            if date.fromisoformat(deadline[:10]) < now.date():
                return {"state": "EXPIRED", "evidence_source": "deadline", "observed_at": deadline, "reason_codes": ["DEADLINE_EXPIRED"]}
            return {"state": "FRESH", "evidence_source": "deadline", "observed_at": deadline, "reason_codes": ["FUTURE_DEADLINE"]}
        except ValueError:
            pass
    if not observation:
        return {"state": "UNKNOWN", "evidence_source": None, "observed_at": None, "reason_codes": ["MISSING_LIVE_EVIDENCE"]}
    status = str(observation.get("identity_status") or "")
    http_status = observation.get("http_status")
    observed = parse_timestamp(observation.get("observed_at"))
    if status in {"DEAD", "REMOVED"} and http_status in {404, 410}:
        return {"state": "HARD_DEAD", "evidence_source": "source_observation", "observed_at": observed.isoformat() if observed else None, "reason_codes": ["CONFIRMED_HARD_DEAD"]}
    if status in {"NETWORK_TRANSIENT", "RATE_LIMITED", "UPSTREAM_5XX"} or http_status == 0 or (isinstance(http_status, int) and http_status >= 500):
        return {"state": "UNKNOWN", "evidence_source": "source_observation", "observed_at": observed.isoformat() if observed else None, "reason_codes": ["TRANSIENT_SOURCE_EVIDENCE"]}
    if status == "IDENTITY_CONFIRMED" and http_status == 200:
        if observed and observed >= now - timedelta(hours=profile.freshness_ttl_hours):
            return {"state": "FRESH", "evidence_source": "source_observation", "observed_at": observed.isoformat(), "reason_codes": ["RECENT_CONFIRMED_LIVE"]}
        return {"state": "STALE", "evidence_source": "source_observation", "observed_at": observed.isoformat() if observed else None, "reason_codes": ["LIVE_EVIDENCE_STALE"]}
    return {"state": "UNKNOWN", "evidence_source": "source_observation", "observed_at": observed.isoformat() if observed else None, "reason_codes": ["AMBIGUOUS_LIVE_EVIDENCE"]}


def automation_input(row: dict[str, Any], freshness: dict[str, Any]) -> dict[str, Any]:
    scope = str(row.get("remote_scope") or "").upper()
    countries = row.get("eligible_countries") or []
    return {
        **row,
        "identity_valid": bool(row.get("title") and str(row.get("application_url") or "").startswith("https://")),
        "eligibility_resolved": not (scope in {"COUNTRY_SPECIFIC", "REGIONAL"} and not countries) and scope != "UNKNOWN",
        "eligibility_structure_mismatch": bool(row.get("eligibility_structure_mismatch")),
        "geo_contradiction": bool(row.get("geo_contradiction")),
        "freshness_state": freshness["state"],
    }


def evaluate_runtime_row(
    row: dict[str, Any], profile: SourceProfile, observation: dict[str, Any] | None,
    source_policy: dict[str, Any], *, now: datetime,
) -> dict[str, Any]:
    """Evaluate actual and shadow-AUTO paths without sealing, model or DB writes."""
    proposed_status, stamps, seal_evidence = seal(row, now)
    freshness = freshness_from_evidence(row, observation, profile, now=now)
    candidate = automation_input(row, freshness)
    snapshot = {"status": proposed_status, "stamps": stamps, "evidence": seal_evidence}
    actual = evaluate_opportunity_automation_policy(candidate, profile, snapshot, observation, source_policy, as_of=now.date())
    # Shadow mode changes only the AUTO switch. Certification, source policy,
    # health, freshness and row-level safety evidence remain mandatory.
    shadow_policy = {**source_policy, "auto_enabled": True}
    shadow = evaluate_opportunity_automation_policy(candidate, profile, snapshot, observation, shadow_policy, as_of=now.date())
    would_promote = shadow.decision == AUTO_PROMOTE
    return {
        "id": str(row["id"]), "source": row.get("source"), "title": row.get("title"),
        "factory_status_current": row.get("factory_status"), "factory_status_proposed": proposed_status,
        "freshness": freshness, "actual": actual.to_dict(), "shadow": shadow.to_dict(),
        "primary_reason": actual.reason_codes[0] if actual.reason_codes else None,
        "secondary_readiness_signals": list(shadow.reason_codes) if not would_promote else [],
        "would_auto_promote_if_enabled": would_promote,
        "promotion_candidate": would_promote,
        "embedding_allowed_now": embedding_permitted(actual, row),
        "embedding_candidate": embedding_permitted(shadow, row),
        "future_downstream_gates": shadow.downstream_gates,
    }


def summarize_runtime_rows(values: list[dict[str, Any]]) -> dict[str, Any]:
    decisions = Counter(value["actual"]["decision"] for value in values)
    freshness = Counter(value["freshness"]["state"] for value in values)
    def clustered(decision_key: str) -> list[dict[str, Any]]:
        samples: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
        for value in values:
            for reason in value[decision_key].get("reason_codes") or []:
                key = (str(value.get("source") or "unknown"), str(reason))
                if len(samples[key]) < SAMPLE_LIMIT:
                    samples[key].append({"id": value["id"], "title": str(value.get("title") or "")[:140]})
        from opportunity_automation import cluster_automation_exceptions
        clusters = cluster_automation_exceptions([value[decision_key] for value in values])
        for cluster in clusters:
            cluster["samples"] = samples[(cluster["source"], cluster["reason_code"])]
        return clusters
    return {
        "decisions": {key: decisions.get(key, 0) for key in ("AUTO_PROMOTE", "HOLD", "HUMAN_REVIEW", "BLOCK")},
        "freshness": dict(sorted(freshness.items())),
        "would_auto_promote_if_enabled": sum(value["would_auto_promote_if_enabled"] for value in values),
        "embedding_candidates": sum(value["embedding_allowed_now"] for value in values),
        "embedding_candidates_if_auto_enabled": sum(value["embedding_candidate"] for value in values),
        "promotion_candidates": sum(value["promotion_candidate"] for value in values),
        "exception_clusters": clustered("actual"),
        "shadow_readiness_clusters": clustered("shadow"),
    }
