"""Fail-closed client contract for the future atomic automation transition."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import requests


@dataclass(frozen=True)
class PromotionRequest:
    opportunity_id: str; expected_updated_at: str; policy_version: str
    source_certification_version: str; decision: str; reason_codes: tuple[str, ...]
    allowed_actions: dict[str, bool]; runtime_gate_evidence: dict[str, Any]
    registry_policy_hash: str; idempotency_key: str; execution_id: str; runtime_run_id: str

    def validate(self) -> None:
        if self.decision != "AUTO_PROMOTE": raise ValueError("decision_not_auto_promote")
        if not self.opportunity_id or not self.expected_updated_at: raise ValueError("identity_and_optimistic_lock_required")
        if not self.policy_version or not self.source_certification_version or not self.registry_policy_hash: raise ValueError("version_required")
        if not self.idempotency_key or not self.execution_id or not self.runtime_run_id: raise ValueError("execution_identity_required")
        gate = self.runtime_gate_evidence
        if not (gate.get("source_enabled") and gate.get("certified") and gate.get("auto_enabled") and gate.get("health_fresh") and gate.get("operational_health") == "HEALTHY"):
            raise ValueError("runtime_gate_denied")
        allowed = {"verification", "activation", "catalog", "matching", "alerts", "organic_seo", "google_jobs", "third_party_distribution"}
        if not isinstance(self.allowed_actions, dict) or any(key not in allowed or type(value) is not bool for key, value in self.allowed_actions.items()):
            raise ValueError("invalid_allowed_actions")
        forbidden = {key for key, value in self.allowed_actions.items() if value}.intersection({"google_jobs", "third_party_distribution"})
        if forbidden and not gate.get("distribution_allowed", False): raise ValueError("distribution_policy_denied")

    def payload(self) -> dict[str, Any]:
        self.validate()
        return {"p_opportunity_id": self.opportunity_id, "p_expected_updated_at": self.expected_updated_at,
                "p_expected_registry_hash": self.registry_policy_hash, "p_expected_semantic_version": self.source_certification_version,
                "p_policy_version": self.policy_version,
                "p_decision": self.decision, "p_reason_codes": list(self.reason_codes),
                "p_allowed_actions": self.allowed_actions, "p_idempotency_key": self.idempotency_key,
                "p_execution_id": self.execution_id, "p_runtime_run_id": self.runtime_run_id}


class AtomicPromotionExecutor:
    """No fallback PATCH: only the reviewed atomic RPC may mutate a row."""
    def __init__(self, base_url: str, headers: dict[str, str], session: requests.Session | None = None):
        self.base_url, self.headers, self.session = base_url.rstrip("/"), headers, session or requests.Session()

    def dry_run(self, request: PromotionRequest) -> dict[str, Any]:
        return {"mode": "DRY_RUN", "commit": False, "request": request.payload()}

    def apply(self, request: PromotionRequest) -> dict[str, Any]:
        payload = request.payload()
        response = self.session.post(f"{self.base_url}/rpc/apply_opportunity_automation_transition", headers={**self.headers, "Prefer": "return=representation"}, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
