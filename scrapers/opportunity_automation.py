"""Pure, source-aware automation decisions for opportunity pipeline stages.

This module deliberately has no HTTP, Supabase, model or mutation dependency.
It converts already-collected evidence into a reproducible policy decision.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

from source_cleaners.base import SourceProfile
from source_registry_v2 import certification


POLICY_VERSION = "opportunity_automation:v1"

AUTO_PROMOTE = "AUTO_PROMOTE"
HUMAN_REVIEW = "HUMAN_REVIEW"
BLOCK = "BLOCK"
HOLD = "HOLD"

ROW_EXCEPTION = "ROW_EXCEPTION"
SOURCE_POLICY_HOLD = "SOURCE_POLICY_HOLD"
SYSTEMIC_DATA_ISSUE = "SYSTEMIC_DATA_ISSUE"
TRANSIENT_RETRY = "TRANSIENT_RETRY"
BLOCKING_RULE = "BLOCKING_RULE"

ALLOW = "ALLOW"
GATE_HOLD = "HOLD"
GATE_BLOCK = "BLOCK"

REASON_CATEGORY = {
    "SOURCE_NOT_CERTIFIED": SOURCE_POLICY_HOLD,
    "SOURCE_NOT_AUTO_ENABLED": SOURCE_POLICY_HOLD,
    "SOURCE_DISABLED": BLOCKING_RULE,
    "SOURCE_POLICY_UNAVAILABLE": SOURCE_POLICY_HOLD,
    "SEMANTIC_CONTRACT_MISSING": SOURCE_POLICY_HOLD,
    "SOURCE_UNHEALTHY": SOURCE_POLICY_HOLD,
    "SOURCE_HEALTH_DEGRADED": SOURCE_POLICY_HOLD,
    "SOURCE_HEALTH_UNKNOWN": SOURCE_POLICY_HOLD,
    "FRESHNESS_INSUFFICIENT": SOURCE_POLICY_HOLD,
    "HARD_DEAD": BLOCKING_RULE,
    "FACTORY_PENDING": SOURCE_POLICY_HOLD,
    "TRANSIENT_SOURCE_FAILURE": TRANSIENT_RETRY,
    "TRANSIENT_FACTORY_FAILURE": TRANSIENT_RETRY,
    "IDENTITY_INVALID": BLOCKING_RULE,
    "EXPIRED": BLOCKING_RULE,
    "FACTORY_BLOCKED": BLOCKING_RULE,
    "POLICY_CONFLICT": BLOCKING_RULE,
    "IDENTITY_AMBIGUOUS": ROW_EXCEPTION,
    "ELIGIBILITY_UNRESOLVED": ROW_EXCEPTION,
    "GEO_CONTRADICTION": ROW_EXCEPTION,
    "CONTENT_INSUFFICIENT": ROW_EXCEPTION,
    "FACTORY_REVIEW": ROW_EXCEPTION,
    "READY_FOR_AUTO_PROMOTION": "READY",
}


@dataclass(frozen=True)
class AutomationDecision:
    decision: str
    reason_codes: tuple[str, ...]
    confidence: str
    human_intervention_required: bool
    allowed_actions: tuple[str, ...]
    downstream_gates: dict[str, bool]
    evidence: dict[str, Any]
    policy_version: str = POLICY_VERSION

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SourceRuntimeGate:
    """One source-level gate shared by runtime callers and future executors."""
    action: str
    reason_codes: tuple[str, ...]
    evidence: dict[str, Any]


def evaluate_source_runtime_gate(
    source_profile: SourceProfile,
    operational_health: dict[str, Any] | None = None,
    source_policy: dict[str, Any] | None = None,
) -> SourceRuntimeGate:
    """Pure, fail-closed source gate; it never changes profile or DB state."""
    source_policy = source_policy or {}
    certificate = certification(source_profile)
    certified = bool(source_policy.get("certified", certificate["certified"]))
    auto_enabled = bool(source_policy.get("auto_enabled", source_profile.auto_enabled))
    health = operational_health or {}
    status = str(health.get("status") or source_policy.get("operational_health") or "UNKNOWN").upper()
    source_enabled = source_policy.get("source_enabled", True)
    policy_available = source_policy.get("source_policy_available", True)
    evidence = {
        "source": source_profile.source,
        "certified": certified,
        "auto_enabled": auto_enabled,
        "source_enabled": source_enabled,
        "source_policy_available": policy_available,
        "operational_health": status,
        "health_observed_at": health.get("observed_at"),
        "health_fresh": health.get("fresh"),
        "health_source": health.get("evidence_source"),
    }
    if source_enabled is False:
        return SourceRuntimeGate(GATE_BLOCK, ("SOURCE_DISABLED",), evidence)
    if policy_available is False:
        return SourceRuntimeGate(GATE_HOLD, ("SOURCE_POLICY_UNAVAILABLE",), evidence)
    if not certified:
        return SourceRuntimeGate(GATE_HOLD, ("SOURCE_NOT_CERTIFIED",), evidence)
    if not auto_enabled:
        return SourceRuntimeGate(GATE_HOLD, ("SOURCE_NOT_AUTO_ENABLED",), evidence)
    if status == "HEALTHY" and health.get("fresh") is not False:
        return SourceRuntimeGate(ALLOW, (), evidence)
    if status == "DEGRADED":
        return SourceRuntimeGate(GATE_HOLD, ("SOURCE_HEALTH_DEGRADED",), evidence)
    if status == "UNHEALTHY":
        return SourceRuntimeGate(GATE_HOLD, ("SOURCE_UNHEALTHY",), evidence)
    return SourceRuntimeGate(GATE_HOLD, ("SOURCE_HEALTH_UNKNOWN",), evidence)


def _is_expired(row: dict[str, Any], as_of: date | None) -> bool:
    if row.get("expired") is True:
        return True
    if not row.get("deadline") or as_of is None:
        return False
    try:
        return date.fromisoformat(str(row["deadline"])[:10]) < as_of
    except ValueError:
        return False


def _distribution(profile: SourceProfile, decision: str, source_policy: dict[str, Any] | None = None) -> dict[str, bool]:
    promotable = decision == AUTO_PROMOTE
    sp = source_policy or {}
    # catalog requires web_catalog_allowed (policy assertion) AND catalog_enabled (durable DB flag)
    catalog = promotable and profile.web_catalog_allowed and bool(sp.get("catalog_enabled", False))
    # matching is independent from catalog; depends on its own durable flag
    matching = promotable and bool(sp.get("matching_enabled", False))
    # embedding capability follows matching, not catalog
    embedding = matching
    # alerts are an independent B2C capability
    alerts = promotable and bool(sp.get("alerts_enabled", False))
    # organic SEO requires catalog as prerequisite
    organic_seo = catalog and bool(sp.get("seo_enabled", False))
    return {
        "web_catalog": catalog,
        "matching": matching,
        "embedding": embedding,
        "alerts": alerts,
        "organic_seo": organic_seo,
        "google_jobs": catalog and profile.google_jobs_distribution_allowed,
        "third_party_distribution": catalog and profile.third_party_job_distribution_allowed,
    }


def _decision(
    decision: str,
    reasons: list[str],
    profile: SourceProfile,
    evidence: dict[str, Any],
    source_policy: dict[str, Any] | None = None,
) -> AutomationDecision:
    human = decision == HUMAN_REVIEW
    actions = {
        AUTO_PROMOTE: ("PROMOTE_WHEN_EXECUTOR_AVAILABLE",),
        HOLD: ("WAIT_FOR_POLICY_OR_RETRY",),
        HUMAN_REVIEW: ("QUEUE_ROW_EXCEPTION",),
        BLOCK: ("BLOCK_WHEN_EXECUTOR_AVAILABLE",),
    }[decision]
    return AutomationDecision(
        decision=decision,
        reason_codes=tuple(reasons),
        confidence="high" if decision in {AUTO_PROMOTE, BLOCK} else "medium",
        human_intervention_required=human,
        allowed_actions=actions,
        downstream_gates=_distribution(profile, decision, source_policy),
        evidence=evidence,
    )


def evaluate_opportunity_automation_policy(
    opportunity: dict[str, Any],
    source_profile: SourceProfile,
    factory_snapshot: dict[str, Any],
    observations: dict[str, Any] | None = None,
    source_policy: dict[str, Any] | None = None,
    *,
    as_of: date | None = None,
) -> AutomationDecision:
    """Return a deterministic decision; callers own reads, writes and retries."""
    source_policy = source_policy or {}
    certificate = certification(source_profile)
    certified = bool(source_policy.get("certified", certificate["certified"]))
    auto_enabled = bool(source_policy.get("auto_enabled", source_profile.auto_enabled))
    health = str(source_policy.get("operational_health", "UNKNOWN")).upper()
    stamps = factory_snapshot.get("stamps") or {}
    factory_status = str(factory_snapshot.get("status") or opportunity.get("factory_status") or "pending")
    observation_status = str((observations or {}).get("identity_status") or "")
    http_status = (observations or {}).get("http_status")
    evidence = {
        "source": source_profile.source,
        "source_authority": opportunity.get("source_authority"),
        "original_source_verified": opportunity.get("original_source_verified") is True,
        "factory_status": factory_status,
        "factory_stamps": stamps,
        "certified": certified,
        "auto_enabled": auto_enabled,
        "operational_health": health,
        "observation_status": observation_status or None,
        "observation_http_status": http_status,
        "semantic_version": source_profile.semantic_version,
        "freshness_state": opportunity.get("freshness_state"),
    }

    if observation_status in {"IDENTITY_UNRESOLVED", "IDENTITY_MISMATCH"} or opportunity.get("identity_valid") is False:
        return _decision(HUMAN_REVIEW, ["IDENTITY_AMBIGUOUS"], source_profile, evidence, source_policy)
    if stamps.get("identity") == "block":
        return _decision(BLOCK, ["IDENTITY_INVALID"], source_profile, evidence, source_policy)
    if _is_expired(opportunity, as_of) or stamps.get("validity") == "block":
        return _decision(BLOCK, ["EXPIRED"], source_profile, evidence, source_policy)
    if factory_status == "blocked":
        return _decision(BLOCK, ["FACTORY_BLOCKED"], source_profile, evidence, source_policy)
    if observation_status in {"REMOVED", "DEAD"} and http_status in {404, 410}:
        return _decision(BLOCK, ["HARD_DEAD"], source_profile, evidence, source_policy)
    if observation_status in {"NETWORK_TRANSIENT", "RATE_LIMITED", "UPSTREAM_5XX"} or http_status == 0 or (isinstance(http_status, int) and http_status >= 500):
        return _decision(HOLD, ["TRANSIENT_SOURCE_FAILURE"], source_profile, evidence, source_policy)
    if factory_status == "failed":
        return _decision(HOLD, ["TRANSIENT_FACTORY_FAILURE"], source_profile, evidence, source_policy)
    if opportunity.get("eligibility_resolved") is False or opportunity.get("eligibility_structure_mismatch") is True:
        return _decision(HUMAN_REVIEW, ["ELIGIBILITY_UNRESOLVED"], source_profile, evidence, source_policy)
    if opportunity.get("geo_contradiction") is True:
        return _decision(HUMAN_REVIEW, ["GEO_CONTRADICTION"], source_profile, evidence, source_policy)
    if stamps.get("content") == "review":
        return _decision(HUMAN_REVIEW, ["CONTENT_INSUFFICIENT"], source_profile, evidence, source_policy)
    if stamps.get("classification") == "review" or stamps.get("geo") == "review" or factory_status == "review":
        return _decision(HUMAN_REVIEW, ["FACTORY_REVIEW"], source_profile, evidence, source_policy)
    if not source_profile.semantic_version or not source_profile.adapter or not source_profile.cleaner:
        return _decision(HOLD, ["SEMANTIC_CONTRACT_MISSING"], source_profile, evidence, source_policy)
    gate = evaluate_source_runtime_gate(
        source_profile,
        {
            "status": health,
            "fresh": source_policy.get("health_fresh"),
            "observed_at": source_policy.get("health_observed_at"),
            "evidence_source": source_policy.get("health_source"),
        },
        source_policy,
    )
    evidence["source_runtime_gate"] = gate.evidence
    if gate.action == GATE_BLOCK:
        return _decision(BLOCK, list(gate.reason_codes), source_profile, evidence, source_policy)
    if gate.action == GATE_HOLD:
        return _decision(HOLD, list(gate.reason_codes), source_profile, evidence, source_policy)
    if str(opportunity.get("freshness_state") or "UNKNOWN").upper() != "FRESH":
        return _decision(HOLD, ["FRESHNESS_INSUFFICIENT"], source_profile, evidence, source_policy)
    return _decision(AUTO_PROMOTE, ["READY_FOR_AUTO_PROMOTION"], source_profile, evidence, source_policy)


def embedding_permitted(decision: AutomationDecision, row: dict[str, Any]) -> bool:
    """A vector is downstream matching work, never a consequence of sealing."""
    return bool(
        decision.decision == AUTO_PROMOTE
        and decision.downstream_gates.get("matching")
        and decision.downstream_gates.get("embedding")
        and row.get("embedding") is None
    )


SYSTEMIC_CLUSTER_MIN_SAMPLE = 10
SYSTEMIC_CLUSTER_MIN_PREVALENCE = 0.50


def cluster_automation_exceptions(decisions: list[dict[str, Any] | AutomationDecision]) -> list[dict[str, Any]]:
    """Project many row decisions into small systemic/row exception groups."""
    groups: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for raw in decisions:
        decision = raw.to_dict() if isinstance(raw, AutomationDecision) else raw
        evidence = decision.get("evidence") or {}
        source = str(evidence.get("source") or raw.get("source") or "unknown")
        semantic = str(evidence.get("semantic_version") or "unknown")
        for reason in decision.get("reason_codes") or ():
            category = REASON_CATEGORY.get(reason, ROW_EXCEPTION)
            key = (source, str(reason), semantic, str(decision.get("policy_version") or POLICY_VERSION))
            group = groups.setdefault(key, {
                "source": source, "reason_code": reason, "category": category,
                "semantic_version": semantic, "policy_version": key[3], "count": 0,
                "recommended_action": "review_row" if category == ROW_EXCEPTION else "fix_source_or_policy" if category == SOURCE_POLICY_HOLD else "retry" if category == TRANSIENT_RETRY else "promote_when_executor_available" if category == "READY" else "block_or_hold",
            })
            group["count"] += 1
    totals: dict[tuple[str, str, str], int] = {}
    for raw in decisions:
        value = raw.to_dict() if isinstance(raw, AutomationDecision) else raw
        evidence = value.get("evidence") or {}; key = (str(evidence.get("source") or raw.get("source") or "unknown"), str(evidence.get("semantic_version") or "unknown"), str(value.get("policy_version") or POLICY_VERSION))
        totals[key] = totals.get(key, 0) + 1
    for group in groups.values():
        total = totals[(group["source"], group["semantic_version"], group["policy_version"])]
        group["sample_size"] = total; group["prevalence"] = round(group["count"] / total, 4) if total else 0.0
        if group["category"] == ROW_EXCEPTION and total >= SYSTEMIC_CLUSTER_MIN_SAMPLE and group["count"] >= SYSTEMIC_CLUSTER_MIN_SAMPLE and group["prevalence"] >= SYSTEMIC_CLUSTER_MIN_PREVALENCE:
            group["cluster_kind"] = "PROBABLE_SYSTEMIC_DATA_ISSUE"; group["recommended_action"] = "investigate_systemic_cause"
        else: group["cluster_kind"] = "ROW_EXCEPTION" if group["category"] == ROW_EXCEPTION else group["category"]
    return sorted(groups.values(), key=lambda item: (-item["count"], item["source"], item["reason_code"]))
