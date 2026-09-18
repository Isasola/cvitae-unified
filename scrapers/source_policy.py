"""Small source-agnostic policy classification from durable observations."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

HARD_DEAD_STATUSES = {"REMOVED", "DEAD"}
HARD_DEAD_HTTP_STATUSES = {404, 410}


@dataclass(frozen=True)
class SourcePolicyDecision:
    opportunity_id: str
    source: str
    policy: str
    action: str
    reasons: list[str] = field(default_factory=list)
    observation_id: str | None = None
    would_change: list[str] = field(default_factory=list)


def is_hard_dead(observation: dict[str, Any] | None) -> bool:
    return bool(observation and observation.get("identity_status") in HARD_DEAD_STATUSES and observation.get("http_status") in HARD_DEAD_HTTP_STATUSES)


def classify_source_policy(row: dict[str, Any], latest_observation: dict[str, Any] | None, *, previously_suppressed: bool = False) -> SourcePolicyDecision:
    """Classify only from the latest source observation; never infer death."""
    base = {"opportunity_id": str(row["id"]), "source": str(row["source"]), "policy": "HARD_DEAD_SUPPRESSION", "observation_id": latest_observation.get("id") if latest_observation else None}
    if is_hard_dead(latest_observation):
        reasons = [f"latest_observation_{str(latest_observation['identity_status']).casefold()}", f"http_{latest_observation['http_status']}"]
        changes = [field for field in ("catalog_eligible", "match_eligible") if row.get(field) is True]
        if changes:
            return SourcePolicyDecision(action="SUPPRESS", reasons=[*reasons, *changes], would_change=changes, **base)
        return SourcePolicyDecision(action="NOOP", reasons=[*reasons, "already_suppressed"], **base)
    if not latest_observation:
        return SourcePolicyDecision(action="NOOP", reasons=["missing_observation"], **base)
    status, http_status = latest_observation.get("identity_status"), latest_observation.get("http_status")
    if status == "IDENTITY_CONFIRMED" and http_status == 200:
        # A live observation can only request a restore audit if a previous
        # suppression exists; the DB RPC revalidates that history atomically.
        if previously_suppressed:
            return SourcePolicyDecision(action="RESTORE", reasons=["latest_identity_confirmed_http_200", "requires_existing_quality_gates"], would_change=[], **base)
        reason = "latest_live"
    elif http_status == 0 or (isinstance(http_status, int) and http_status >= 500):
        reason = "network_or_transient"
    else:
        reason = "ambiguous_latest_observation"
    return SourcePolicyDecision(action="NOOP", reasons=[reason], **base)
