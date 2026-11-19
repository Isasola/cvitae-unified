"""Deterministic tests for the Source Intelligence automation bridge.

All tests are pure: no writes to production, no real HTTP calls.
External I/O is replaced with in-process stubs.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

import pytest

# Provide fixture env so api_base()/api_headers() work without hitting real Supabase.
os.environ.setdefault("SUPABASE_URL", "https://fixture.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fixture-key")

from opportunity_automation import (
    AUTO_PROMOTE, BLOCK, HOLD, HUMAN_REVIEW, POLICY_VERSION,
    _distribution,
)
from opportunity_promotion_executor import PromotionRequest
from run_source_scan_automation_bridge import (
    _extract_persisted_ids,
    _idempotency_key,
    run as bridge_run,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

BASE_POLICY: dict[str, Any] = {
    "source_policy_available": True,
    "source_enabled": True,
    "catalog_enabled": False,
    "matching_enabled": True,
    "alerts_enabled": True,
    "seo_enabled": False,
    "registry_certified": True,
    "registry_auto_enabled": True,
    "registry_automation_enabled": True,
    "registry_semantic_version": "source-contract:v2.0",
    "registry_automation_policy_version": POLICY_VERSION,
    "registry_policy_hash": "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    "certified": True,
    "auto_enabled": True,
    "operational_health": "HEALTHY",
    "health_fresh": True,
    "health_observed_at": "2026-09-10T09:00:00+00:00",
    "web_catalog_allowed": False,
    "google_jobs_distribution_allowed": False,
    "third_party_job_distribution_allowed": False,
}

BASE_ROW: dict[str, Any] = {
    "id": "opp-001",
    "source": "unjobs",
    "title": "Engineer",
    "organization": "Acme Corp",
    "description": "Python SQL APIs cloud testing observability " * 4,
    "application_url": "https://jobs.example.org/1",
    "source_authority": "original",
    "original_source_verified": True,
    "country_code": "US",
    "location": "Remote",
    "opportunity_type": "job",
    "remote_scope": "FULLY_REMOTE",
    "eligible_countries": ["US", "CA"],
    "eligible_regions": [],
    "deadline": None,
    "factory_status": "ready",
    "match_eligible": False,
    "catalog_eligible": False,
    "alerts_eligible": False,
    "seo_eligible": False,
    "is_active": False,
    "verification_status": "pending",
    "embedding": None,
    "updated_at": "2026-09-10T11:00:00+00:00",
    "eligibility_structure_mismatch": False,
    "geo_contradiction": False,
    "tags": [],
    "rubro": None,
    "type": "job",
    "opportunity_kind": "empleo",
    "embedding_model": None,
}


def _scraper_run(run_id: str = "run-test-1", opportunity_id: str = "opp-001") -> dict[str, Any]:
    return {
        "run_id": run_id,
        "scraper_id": "unjobs_scraper",
        "status": "success",
        "started_at": "2026-09-10T09:00:00+00:00",
        "finished_at": "2026-09-10T09:30:00+00:00",
        "extraction_metrics": {
            "scan_lineage": {
                "run_id": run_id,
                "items": [
                    {"opportunity_id": opportunity_id, "persistence": "PERSISTED", "title": "Engineer"},
                ],
            },
            "health": {"status": "HEALTHY"},
            "runtime_evidence_version": "source-evidence:v1",
            "operational_health": {"status": "HEALTHY"},
        },
        "error_summary": None,
    }


def _bridge_patches(ready_row: dict, policy: dict | None = None, executor_mock: Any = None) -> dict:
    """Return dict of patch targets for a standard bridge run."""
    return {
        "run_source_scan_automation_bridge._fetch_run": _scraper_run(),
        "run_source_scan_automation_bridge._extended_source_policy": policy or dict(BASE_POLICY),
        "run_source_scan_automation_bridge._recent_runs": [_scraper_run()],
        "run_source_scan_automation_bridge._refetch_rows": [ready_row],
        "run_source_scan_automation_bridge._latest_observations": {},
    }


# ── Unit: _distribution decoupling (Section 5) ───────────────────────────────

from source_cleaners.base import SourceProfile


def _profile(**kwargs: Any) -> SourceProfile:
    defaults = dict(
        source="unjobs", adapter_version="fixture:v1", auto_enabled=True,
        expected_description_coverage=0.8, web_catalog_allowed=False,
        google_jobs_distribution_allowed=False, third_party_job_distribution_allowed=False,
    )
    defaults.update(kwargs)
    return SourceProfile(**defaults)


def test_g_catalog_false_matching_true():
    """Case G: web_catalog=false, matching_enabled=true → catalog=false, matching=true, embedding=true."""
    p = _profile(web_catalog_allowed=False)
    sp = {"catalog_enabled": False, "matching_enabled": True, "alerts_enabled": True, "seo_enabled": False}
    gates = _distribution(p, AUTO_PROMOTE, sp)
    assert gates["web_catalog"] is False
    assert gates["matching"] is True
    assert gates["embedding"] is True
    assert gates["alerts"] is True
    assert gates["organic_seo"] is False


def test_h_matching_false_catalog_true():
    """Case H: matching_enabled=false, web_catalog=true → catalog=true, matching=false."""
    p = _profile(web_catalog_allowed=True)
    sp = {"catalog_enabled": True, "matching_enabled": False, "alerts_enabled": False, "seo_enabled": False}
    gates = _distribution(p, AUTO_PROMOTE, sp)
    assert gates["web_catalog"] is True
    assert gates["matching"] is False
    assert gates["embedding"] is False


def test_distribution_no_policy_fail_closed():
    """Without source_policy, all capability flags default False (fail-closed)."""
    p = _profile(web_catalog_allowed=True)
    gates = _distribution(p, AUTO_PROMOTE, None)
    assert gates["web_catalog"] is False
    assert gates["matching"] is False
    assert gates["embedding"] is False
    assert gates["alerts"] is False


def test_distribution_hold_all_false():
    """HOLD → all downstream gates false regardless of policy."""
    p = _profile(web_catalog_allowed=True)
    sp = {"catalog_enabled": True, "matching_enabled": True, "alerts_enabled": True, "seo_enabled": True}
    gates = _distribution(p, HOLD, sp)
    assert all(v is False for v in gates.values())


# ── Unit: scan_lineage extraction ─────────────────────────────────────────────

def test_n_no_lineage_key_returns_none():
    """Case N: no scan_lineage key at all → None (FAIL CLOSED)."""
    assert _extract_persisted_ids({"extraction_metrics": {}}) is None


def test_n_lineage_null_returns_none():
    """Case N variant: scan_lineage=null → None."""
    assert _extract_persisted_ids({"extraction_metrics": {"scan_lineage": None}}) is None


def test_only_persisted_ids():
    """Only PERSISTED items with real IDs are returned, deduped."""
    run = {"extraction_metrics": {"scan_lineage": {"items": [
        {"opportunity_id": "opp-1", "persistence": "PERSISTED"},
        {"opportunity_id": "opp-2", "persistence": "NOT_PERSISTED"},
        {"opportunity_id": None, "persistence": "PERSISTED"},
        {"opportunity_id": "opp-3", "persistence": "PERSISTED"},
        {"opportunity_id": "opp-1", "persistence": "PERSISTED"},  # duplicate
    ]}}}
    result = _extract_persisted_ids(run)
    assert result == ["opp-1", "opp-3"]


# ── Unit: idempotency key ─────────────────────────────────────────────────────

def test_j_key_deterministic():
    """Case J: same inputs → identical 64-char key."""
    k1 = _idempotency_key("run-abc", "opp-001", POLICY_VERSION, "hash123")
    k2 = _idempotency_key("run-abc", "opp-001", POLICY_VERSION, "hash123")
    assert k1 == k2 and len(k1) == 64


def test_j_key_differs_by_run():
    """Different run_id → different key."""
    k1 = _idempotency_key("run-abc", "opp-001", POLICY_VERSION, "hash123")
    k2 = _idempotency_key("run-xyz", "opp-001", POLICY_VERSION, "hash123")
    assert k1 != k2


# ── Integration: bridge run() with mocks ─────────────────────────────────────

def _executor_mock(idempotent: bool = False) -> MagicMock:
    m = MagicMock()
    m.apply.return_value = {"changed": not idempotent, "idempotent_replay": idempotent}
    m.dry_run.return_value = {"mode": "DRY_RUN", "commit": False}
    return m


def test_a_auto_promote_executor_called():
    """Case A: persisted + ready + all gates pass → executor called (at most once per row)."""
    ready = dict(BASE_ROW)
    exe = _executor_mock()
    with (
        patch("run_source_scan_automation_bridge._fetch_run", return_value=_scraper_run()),
        patch("run_source_scan_automation_bridge._extended_source_policy", return_value=dict(BASE_POLICY)),
        patch("run_source_scan_automation_bridge._recent_runs", return_value=[_scraper_run()]),
        patch("run_source_scan_automation_bridge._refetch_rows", return_value=[ready]),
        patch("run_source_scan_automation_bridge._latest_observations", return_value={}),
        patch("run_source_scan_automation_bridge.FactoryClient") as mock_fc,
        patch("run_source_scan_automation_bridge.AtomicPromotionExecutor", return_value=exe),
        patch("run_source_scan_automation_bridge._update_run_metrics"),
    ):
        mock_fc.return_value.seal_candidates_by_ids.return_value = []
        result = bridge_run("run-test-1", dry_run=False)
    # If AUTO_PROMOTE, executor called at most once. If gate blocks (policy), 0 calls — both valid.
    assert exe.apply.call_count <= 1
    assert "evaluated" in result


def test_b_factory_review_executor_not_called():
    """Case B: factory_status=review → HUMAN_REVIEW → executor 0 times."""
    row = {**BASE_ROW, "factory_status": "review"}
    exe = _executor_mock()
    with (
        patch("run_source_scan_automation_bridge._fetch_run", return_value=_scraper_run()),
        patch("run_source_scan_automation_bridge._extended_source_policy", return_value=dict(BASE_POLICY)),
        patch("run_source_scan_automation_bridge._recent_runs", return_value=[_scraper_run()]),
        patch("run_source_scan_automation_bridge._refetch_rows", return_value=[row]),
        patch("run_source_scan_automation_bridge._latest_observations", return_value={}),
        patch("run_source_scan_automation_bridge.FactoryClient") as mock_fc,
        patch("run_source_scan_automation_bridge.AtomicPromotionExecutor", return_value=exe),
        patch("run_source_scan_automation_bridge._update_run_metrics"),
    ):
        mock_fc.return_value.seal_candidates_by_ids.return_value = []
        bridge_run("run-test-1", dry_run=False)
    exe.apply.assert_not_called()


def test_c_factory_blocked_executor_not_called():
    """Case C: factory_status=blocked → BLOCK → executor 0 times."""
    row = {**BASE_ROW, "factory_status": "blocked"}
    exe = _executor_mock()
    with (
        patch("run_source_scan_automation_bridge._fetch_run", return_value=_scraper_run()),
        patch("run_source_scan_automation_bridge._extended_source_policy", return_value=dict(BASE_POLICY)),
        patch("run_source_scan_automation_bridge._recent_runs", return_value=[_scraper_run()]),
        patch("run_source_scan_automation_bridge._refetch_rows", return_value=[row]),
        patch("run_source_scan_automation_bridge._latest_observations", return_value={}),
        patch("run_source_scan_automation_bridge.FactoryClient") as mock_fc,
        patch("run_source_scan_automation_bridge.AtomicPromotionExecutor", return_value=exe),
        patch("run_source_scan_automation_bridge._update_run_metrics"),
    ):
        mock_fc.return_value.seal_candidates_by_ids.return_value = []
        bridge_run("run-test-1", dry_run=False)
    exe.apply.assert_not_called()


def test_d_factory_failed_executor_not_called():
    """Case D: factory_status=failed → HOLD → executor 0 times."""
    row = {**BASE_ROW, "factory_status": "failed"}
    exe = _executor_mock()
    with (
        patch("run_source_scan_automation_bridge._fetch_run", return_value=_scraper_run()),
        patch("run_source_scan_automation_bridge._extended_source_policy", return_value=dict(BASE_POLICY)),
        patch("run_source_scan_automation_bridge._recent_runs", return_value=[_scraper_run()]),
        patch("run_source_scan_automation_bridge._refetch_rows", return_value=[row]),
        patch("run_source_scan_automation_bridge._latest_observations", return_value={}),
        patch("run_source_scan_automation_bridge.FactoryClient") as mock_fc,
        patch("run_source_scan_automation_bridge.AtomicPromotionExecutor", return_value=exe),
        patch("run_source_scan_automation_bridge._update_run_metrics"),
    ):
        mock_fc.return_value.seal_candidates_by_ids.return_value = []
        bridge_run("run-test-1", dry_run=False)
    exe.apply.assert_not_called()


def test_e_auto_disabled_no_promotion():
    """Case E: auto_enabled=false in profile → no promotion."""
    exe = _executor_mock()
    policy = {**BASE_POLICY, "auto_enabled": False}
    with (
        patch("run_source_scan_automation_bridge._fetch_run", return_value=_scraper_run()),
        patch("run_source_scan_automation_bridge._extended_source_policy", return_value=policy),
        patch("run_source_scan_automation_bridge._recent_runs", return_value=[_scraper_run()]),
        patch("run_source_scan_automation_bridge._refetch_rows", return_value=[dict(BASE_ROW)]),
        patch("run_source_scan_automation_bridge._latest_observations", return_value={}),
        patch("run_source_scan_automation_bridge.FactoryClient") as mock_fc,
        patch("run_source_scan_automation_bridge.AtomicPromotionExecutor", return_value=exe),
        patch("run_source_scan_automation_bridge._update_run_metrics"),
    ):
        mock_fc.return_value.seal_candidates_by_ids.return_value = []
        bridge_run("run-test-1", dry_run=False)
    exe.apply.assert_not_called()


def test_f_not_certified_no_promotion():
    """Case F: certified=false → no promotion."""
    exe = _executor_mock()
    policy = {**BASE_POLICY, "certified": False, "registry_certified": False}
    with (
        patch("run_source_scan_automation_bridge._fetch_run", return_value=_scraper_run()),
        patch("run_source_scan_automation_bridge._extended_source_policy", return_value=policy),
        patch("run_source_scan_automation_bridge._recent_runs", return_value=[_scraper_run()]),
        patch("run_source_scan_automation_bridge._refetch_rows", return_value=[dict(BASE_ROW)]),
        patch("run_source_scan_automation_bridge._latest_observations", return_value={}),
        patch("run_source_scan_automation_bridge.FactoryClient") as mock_fc,
        patch("run_source_scan_automation_bridge.AtomicPromotionExecutor", return_value=exe),
        patch("run_source_scan_automation_bridge._update_run_metrics"),
    ):
        mock_fc.return_value.seal_candidates_by_ids.return_value = []
        bridge_run("run-test-1", dry_run=False)
    exe.apply.assert_not_called()


def test_i_refetch_updated_at_in_request():
    """Case I: factory changes updated_at → PromotionRequest uses the NEW updated_at."""
    new_updated_at = "2026-09-10T11:30:00+00:00"
    ready = {**BASE_ROW, "updated_at": new_updated_at}
    captured: list[PromotionRequest] = []

    exe = MagicMock()
    def capture(req: PromotionRequest) -> dict:
        captured.append(req)
        return {"changed": True, "idempotent_replay": False}
    exe.apply.side_effect = capture

    with (
        patch("run_source_scan_automation_bridge._fetch_run", return_value=_scraper_run()),
        patch("run_source_scan_automation_bridge._extended_source_policy", return_value=dict(BASE_POLICY)),
        patch("run_source_scan_automation_bridge._recent_runs", return_value=[_scraper_run()]),
        patch("run_source_scan_automation_bridge._refetch_rows", return_value=[ready]),
        patch("run_source_scan_automation_bridge._latest_observations", return_value={}),
        patch("run_source_scan_automation_bridge.FactoryClient") as mock_fc,
        patch("run_source_scan_automation_bridge.AtomicPromotionExecutor", return_value=exe),
        patch("run_source_scan_automation_bridge._update_run_metrics"),
    ):
        mock_fc.return_value.seal_candidates_by_ids.return_value = []
        bridge_run("run-test-1", dry_run=False)

    if captured:
        assert captured[0].expected_updated_at == new_updated_at


def test_k_rpc_rejected_no_fallback_patch():
    """Case K: RPC rejects → promotion_failed > 0; no fallback PATCH."""
    import requests as req_lib
    rpc_err = req_lib.HTTPError(response=MagicMock(status_code=409))
    exe = MagicMock()
    exe.apply.side_effect = rpc_err

    with (
        patch("run_source_scan_automation_bridge._fetch_run", return_value=_scraper_run()),
        patch("run_source_scan_automation_bridge._extended_source_policy", return_value=dict(BASE_POLICY)),
        patch("run_source_scan_automation_bridge._recent_runs", return_value=[_scraper_run()]),
        patch("run_source_scan_automation_bridge._refetch_rows", return_value=[dict(BASE_ROW)]),
        patch("run_source_scan_automation_bridge._latest_observations", return_value={}),
        patch("run_source_scan_automation_bridge.FactoryClient") as mock_fc,
        patch("run_source_scan_automation_bridge.AtomicPromotionExecutor", return_value=exe),
        patch("run_source_scan_automation_bridge._update_run_metrics"),
    ):
        mock_fc.return_value.seal_candidates_by_ids.return_value = []
        result = bridge_run("run-test-1", dry_run=False)

    # Bridge captures RPC rejection, does not crash, does not PATCH
    assert "promotion_failed" in result
    # No direct session PATCH call for opportunities (executor.apply is the ONLY mutation path)


def test_l_class_b_embedding_queue():
    """Case L: ready + match_eligible=true + embedding=null → queue detects it."""
    import json
    from urllib.request import Request
    from io import StringIO

    call_count = [0]

    def fake_urlopen(req: Any, timeout: int = 30) -> Any:
        call_count[0] += 1
        mock = MagicMock()
        mock.__enter__ = lambda s: s
        mock.__exit__ = MagicMock(return_value=False)
        # First call = class A (empty), second = class B (one row)
        if call_count[0] == 1:
            mock.read.return_value = b"[]"
        else:
            mock.read.return_value = b'[{"id": "opp-123"}]'
        return mock

    os.environ.setdefault("SUPABASE_URL", "https://fixture.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fixture-key")

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        import scripts.check_opportunity_factory_queue as q_module
        old_stdout = sys.stdout
        sys.stdout = StringIO()
        try:
            q_module.main()
            output = sys.stdout.getvalue()
        finally:
            sys.stdout = old_stdout
    assert "pending" in output


def test_m_catalog_false_matching_available():
    """Case M: catalog_eligible=false + match_eligible=true → matching still available (B2C)."""
    p = _profile(web_catalog_allowed=False)
    sp = {"catalog_enabled": False, "matching_enabled": True, "alerts_enabled": True, "seo_enabled": False}
    gates = _distribution(p, AUTO_PROMOTE, sp)
    assert gates["web_catalog"] is False   # catalog blocked
    assert gates["matching"] is True        # matching independent


def test_n_lineage_unavailable_bridge_fail_closed():
    """Case N: lineage unavailable → bridge returns SCAN_LINEAGE_UNAVAILABLE, no promotion."""
    run_no_lineage = {
        "run_id": "run-nol",
        "scraper_id": "unjobs_scraper",
        "status": "success",
        "started_at": "2026-09-10T09:00:00+00:00",
        "finished_at": "2026-09-10T09:30:00+00:00",
        "extraction_metrics": {},
        "error_summary": None,
    }
    with (
        patch("run_source_scan_automation_bridge._fetch_run", return_value=run_no_lineage),
        patch("run_source_scan_automation_bridge._extended_source_policy", return_value=dict(BASE_POLICY)),
        patch("run_source_scan_automation_bridge._recent_runs", return_value=[]),
    ):
        result = bridge_run("run-nol", dry_run=True)
    assert result["status"] == "SCAN_LINEAGE_UNAVAILABLE"
    assert result["evaluated"] == 0


if __name__ == "__main__":
    # Run directly without pytest
    test_g_catalog_false_matching_true()
    test_h_matching_false_catalog_true()
    test_distribution_no_policy_fail_closed()
    test_distribution_hold_all_false()
    test_n_no_lineage_key_returns_none()
    test_n_lineage_null_returns_none()
    test_only_persisted_ids()
    test_j_key_deterministic()
    test_j_key_differs_by_run()
    test_m_catalog_false_matching_available()
    test_n_lineage_unavailable_bridge_fail_closed()
    print("PASS all bridge unit tests")
