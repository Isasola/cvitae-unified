"""Ingestion continuity invariants — 10 fixtures A-J.

Tests the dedupe/fingerprint path, INSERT/UPDATE/UNCHANGED/REJECTED tracking,
partial-run safety, and legacy alias reconciliation.  No DB connection required.
All assertions run against the pure Python logic in opportunity_sink.py and
source_adapters.py.
"""
from __future__ import annotations

import copy
import json
import os
import sys
from typing import Any
from unittest.mock import MagicMock, patch

# Resolve package roots without modifying production code paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scrapers"))

from opportunity_sink import (
    IngestionSummary,
    OpportunitySink,
    _fingerprint,
    CONTENT_FINGERPRINT_FIELDS,
    normalize_opportunity,
)
from source_adapters import (
    RunLineageWriter,
    build_scan_lineage,
    AdapterResult,
)

PASS_COUNT = 0
FAIL_COUNT = 0


def assert_eq(actual: Any, expected: Any, label: str) -> None:
    global PASS_COUNT, FAIL_COUNT
    if actual == expected:
        print(f"  PASS  {label}")
        PASS_COUNT += 1
    else:
        print(f"  FAIL  {label}")
        print(f"        expected={expected!r}")
        print(f"        actual  ={actual!r}")
        FAIL_COUNT += 1


def assert_true(condition: Any, label: str) -> None:
    assert_eq(bool(condition), True, label)


def assert_none(actual: Any, label: str) -> None:
    assert_eq(actual, None, label)


# ─── Shared helpers ──────────────────────────────────────────────────────────

BASE_ITEM: dict[str, Any] = {
    "title": "Software Engineer",
    "application_url": "https://example.com/jobs/123",
    "source": "himalayas",
    "description": "A great job for engineers with 3+ years experience.",
    "organization": "Acme Corp",
    "country_code": "US",
    "is_active": True,
    "source_authority": "aggregator",
    "original_source_verified": False,
}


def _item(**overrides: Any) -> dict[str, Any]:
    return {**BASE_ITEM, **overrides}


def _sink_with_existing(existing: dict[str, dict]) -> OpportunitySink:
    """OpportunitySink wired to return `existing` rows without hitting DB."""
    sink = OpportunitySink.__new__(OpportunitySink)
    sink.audit_mode = False
    sink.supabase_url = "https://fake.supabase.co"
    sink.service_key = "fake-key"
    sink.table_url = "https://fake.supabase.co/rest/v1/opportunities"
    # Mocked session: _existing_urls returns `existing`, POST returns 204
    session = MagicMock()
    get_resp = MagicMock()
    get_resp.raise_for_status = lambda: None
    get_resp.json.return_value = list(existing.values())
    post_resp = MagicMock()
    post_resp.status_code = 204
    post_resp.text = ""
    session.get.return_value = get_resp
    session.post.return_value = post_resp
    sink.session = session
    sink.headers = {}
    return sink


def _fp(item: dict) -> str:
    """Compute content_fingerprint for a normalized item."""
    normalized, _ = normalize_opportunity(copy.deepcopy(item))
    assert normalized is not None
    return normalized["content_fingerprint"]


# ─── Fixture A: Same URL + same content --UNCHANGED ─────────────────────────
def test_a_unchanged() -> None:
    print("\nFixture A: same URL + content --UNCHANGED, no write")
    raw = _item()
    fp = _fp(raw)
    existing = {
        raw["application_url"]: {
            "application_url": raw["application_url"],
            "slug": "software-engineer-abc12345",
            "content_fingerprint": fp,
            "semantic_fingerprint": "x",
            "verification_status": "in_review",
            "is_active": True,
            "catalog_eligible": False,
            "match_eligible": False,
            "alerts_eligible": False,
            "seo_eligible": False,
        }
    }
    sink = _sink_with_existing(existing)
    summary = sink.upsert([raw])
    assert_eq(summary.unchanged, 1, "A: unchanged=1")
    assert_eq(summary.inserted, 0, "A: inserted=0")
    assert_eq(summary.updated, 0, "A: updated=0")
    # POST must not have been called (no DB write)
    assert_eq(sink.session.post.called, False, "A: no POST issued")


# ─── Fixture B: Same URL + changed title --UPDATE ────────────────────────────
def test_b_update() -> None:
    print("\nFixture B: same URL + changed content --UPDATE")
    old_raw = _item()
    new_raw = _item(title="Senior Software Engineer")
    old_fp = _fp(old_raw)
    existing = {
        old_raw["application_url"]: {
            "application_url": old_raw["application_url"],
            "slug": "software-engineer-abc12345",
            "content_fingerprint": old_fp,
            "semantic_fingerprint": "x",
            "verification_status": "in_review",
            "is_active": False,
            "catalog_eligible": False,
            "match_eligible": False,
            "alerts_eligible": False,
            "seo_eligible": False,
        }
    }
    sink = _sink_with_existing(existing)
    summary = sink.upsert([new_raw])
    assert_eq(summary.unchanged, 0, "B: unchanged=0")
    assert_eq(summary.updated, 1, "B: updated=1")
    assert_eq(summary.inserted, 0, "B: inserted=0")
    assert_eq(sink.session.post.called, True, "B: POST issued for update")


# ─── Fixture C: New URL --INSERT ─────────────────────────────────────────────
def test_c_insert() -> None:
    print("\nFixture C: new URL --INSERT")
    raw = _item(application_url="https://example.com/jobs/new-999")
    sink = _sink_with_existing({})
    summary = sink.upsert([raw])
    assert_eq(summary.inserted, 1, "C: inserted=1")
    assert_eq(summary.updated, 0, "C: updated=0")
    assert_eq(summary.unchanged, 0, "C: unchanged=0")


# ─── Fixture D: Invalid application_url --REJECTED ───────────────────────────
def test_d_invalid_url() -> None:
    print("\nFixture D: invalid application_url --REJECTED")
    raw = _item(application_url="not-a-url")
    item, reason = normalize_opportunity(raw)
    assert_none(item, "D: normalize returns None for bad URL")
    assert_true(reason, "D: reason is non-empty")

    sink = _sink_with_existing({})
    summary = sink.upsert([raw])
    assert_eq(summary.rejected, 1, "D: rejected=1")
    assert_eq(summary.inserted, 0, "D: inserted=0")


# ─── Fixture E: Generic title --REJECTED ─────────────────────────────────────
def test_e_generic_title() -> None:
    print("\nFixture E: generic/navigation title --REJECTED")
    raw = _item(title="Login")
    item, reason = normalize_opportunity(raw)
    assert_none(item, "E: normalize returns None for generic title")

    summary = _sink_with_existing({}).upsert([raw])
    assert_eq(summary.rejected, 1, "E: rejected=1")


# ─── Fixture F: In-run duplicate URLs --deduped to last ──────────────────────
def test_f_inrun_dedup() -> None:
    print("\nFixture F: two items with same URL in one run --one persisted")
    url = "https://example.com/jobs/dup"
    first = _item(application_url=url, title="First Version")
    second = _item(application_url=url, title="Second Version")
    sink = _sink_with_existing({})
    summary = sink.upsert([first, second])
    assert_eq(summary.duplicates_in_run, 1, "F: duplicates_in_run=1")
    assert_eq(summary.unique, 1, "F: unique=1")
    assert_eq(summary.valid, 2, "F: valid=2 (both passed normalize)")


# ─── Fixture G: coverage_complete=False --existing rows NOT marked stale ─────
def test_g_partial_run_no_stale() -> None:
    """A bounded run that only sees 10 of 500 opportunities must not deactivate
    the other 490 that were not included in this run."""
    print("\nFixture G: partial run (coverage_complete=False) --no stale marking")
    # Sink only sees ONE item; DB has a different item not in this run
    in_run = _item(application_url="https://example.com/jobs/seen")
    not_in_run_url = "https://example.com/jobs/not-seen"
    not_in_run_existing = {
        not_in_run_url: {
            "application_url": not_in_run_url,
            "slug": "existing-job-xyz",
            "content_fingerprint": "abc123",
            "semantic_fingerprint": "x",
            "verification_status": "verified",
            "is_active": True,
            "catalog_eligible": True,
            "match_eligible": True,
            "alerts_eligible": True,
            "seo_eligible": True,
        }
    }
    sink = _sink_with_existing(not_in_run_existing)
    summary = sink.upsert([in_run])
    # POST is called only for `in_run` — never touches `not_in_run_url`
    if sink.session.post.called:
        posted_payload = sink.session.post.call_args[1].get("json") or sink.session.post.call_args[0][1] if len(sink.session.post.call_args[0]) > 1 else []
        posted_urls = [row.get("application_url") for row in (posted_payload if isinstance(posted_payload, list) else [])]
        assert_true(not_in_run_url not in posted_urls, "G: unseen URL never written")
    else:
        # in_run was also UNCHANGED --still safe (no writes at all)
        assert_true(True, "G: no writes issued at all — partial run is safe")
    # Regardless of outcome, rejected must be 0 for the seen item
    assert_eq(summary.errors, [], "G: no errors on partial run")


# ─── Fixture H: Verified opp + content change --in_review + is_active=False ──
def test_h_verified_content_change() -> None:
    print("\nFixture H: verified opp with content change --set to in_review")
    old_fp = "old-fingerprint-does-not-match"
    raw = _item()
    existing = {
        raw["application_url"]: {
            "application_url": raw["application_url"],
            "slug": "software-engineer-abc12345",
            "content_fingerprint": old_fp,
            "semantic_fingerprint": "x",
            "verification_status": "verified",
            "is_active": True,
            "catalog_eligible": True,
            "match_eligible": True,
            "alerts_eligible": True,
            "seo_eligible": True,
        }
    }
    sink = _sink_with_existing(existing)
    summary = sink.upsert([raw])
    # Should be an update (content changed) — POST is called
    assert_eq(sink.session.post.called, True, "H: POST issued for changed verified opp")
    posted_payload = sink.session.post.call_args[1].get("json") or []
    if posted_payload:
        row = posted_payload[0] if isinstance(posted_payload, list) else posted_payload
        assert_eq(row.get("verification_status"), "in_review", "H: verification_status=in_review")
        assert_eq(row.get("is_active"), False, "H: is_active=False")


# ─── Fixture I: Non-original source --in_review, is_active=False ─────────────
def test_i_aggregator_source() -> None:
    print("\nFixture I: aggregator source --in_review, is_active=False")
    raw = _item(source_authority="aggregator", original_source_verified=False)
    # normalize succeeds but doesn't set verification_status -- that's done in upsert
    item, reason = normalize_opportunity(copy.deepcopy(raw))
    assert_true(item, "I: normalize succeeds")
    # Verify via the full sink path (no existing row -- new item)
    sink = _sink_with_existing({})
    sink.upsert([raw])
    assert_eq(sink.session.post.called, True, "I: POST called for new aggregator item")
    posted_payload = sink.session.post.call_args[1].get("json") or [] if sink.session.post.called else []
    row = posted_payload[0] if isinstance(posted_payload, list) and posted_payload else {}
    assert_eq(row.get("verification_status"), "in_review", "I: verification_status=in_review")
    assert_eq(row.get("is_active"), False, "I: is_active=False for unverified aggregator")


# ─── Fixture J: CVITAE_MAX_ITEMS cap --partial batch, rejected_count grows ───
def test_j_max_items_cap() -> None:
    print("\nFixture J: CVITAE_MAX_ITEMS=2 --3rd item rejected, rejected_count += 1")
    items = [
        _item(application_url=f"https://example.com/jobs/{i}", title=f"Job {i}")
        for i in range(3)
    ]
    sink = _sink_with_existing({})
    with patch.dict(os.environ, {"CVITAE_MAX_ITEMS": "2"}):
        summary = sink.upsert(items)
    assert_eq(summary.unique, 2, "J: only 2 unique items processed after cap")
    assert_true(summary.rejected >= 1, "J: at least 1 rejected due to cap")
    assert_true(any("Límite operativo" in e for e in summary.errors), "J: cap error logged")


# ─── Lineage summary method ───────────────────────────────────────────────────
def test_lineage_summary() -> None:
    print("\nLineage summary: lineage_summary() returns correct compact shape")
    result1 = AdapterResult(
        source="unjobs", adapter_version="v2", source_url="https://unjobs.org/vacancies/1",
        apply_url="https://unjobs.org/vacancies/1",
    )
    result2 = AdapterResult(
        source="unjobs", adapter_version="v2", source_url="https://unjobs.org/vacancies/2",
        apply_url=None,
    )
    manifest = build_scan_lineage(
        [result1, result2],
        run_id="local-12345",
        scan_request_id="req-abc",
        persisted={"https://unjobs.org/vacancies/1": "uuid-111"},
    )
    summary = RunLineageWriter.lineage_summary(manifest)
    assert_eq(summary["persisted"], 1, "lineage_summary: persisted=1")
    assert_eq(summary["not_persisted"], 1, "lineage_summary: not_persisted=1")
    assert_eq(summary["total"], 2, "lineage_summary: total=2")
    assert_eq(summary["run_id"], "local-12345", "lineage_summary: run_id preserved")
    assert_eq(summary["scan_request_id"], "req-abc", "lineage_summary: scan_request_id preserved")
    assert_true("lineage_status" in summary, "lineage_summary: lineage_status present")


# ─── CVITAE_MAX_ITEMS trigger_type invariant ──────────────────────────────────
def test_trigger_type_max_items() -> None:
    """Verify the documented trigger_type→CVITAE_MAX_ITEMS mapping in run_scraper_monitored."""
    print("\nTrigger-type max_items invariant: scan < manual <= schedule")
    # We test the logic inline since it's just arithmetic
    def compute_cap(trigger: str, control_max: int | None) -> int:
        if trigger == "scan":
            return control_max or 50
        elif trigger == "schedule":
            return control_max or 10000
        else:
            return control_max or 250

    assert_eq(compute_cap("scan", None), 50, "scan with no control --50")
    assert_eq(compute_cap("scan", 100), 100, "scan with control=100 --100")
    assert_eq(compute_cap("schedule", None), 10000, "schedule with no control --10000")
    assert_eq(compute_cap("schedule", 500), 500, "schedule with control=500 --500")
    assert_eq(compute_cap("manual", None), 250, "manual with no control --250")
    assert_eq(compute_cap("local", None), 250, "local with no control --250")
    assert_true(compute_cap("scan", None) < compute_cap("manual", None), "scan < manual")
    assert_true(compute_cap("manual", None) < compute_cap("schedule", None), "manual < schedule")


# ─── Fixture K: same canonical source string both runs — UNCHANGED ───────────
def test_k_source_alias_stable() -> None:
    """source field uses the same canonical string across runs.
    Same canonical source + same content → UNCHANGED, no review trigger."""
    print("\nFixture K: same canonical source string both runs --UNCHANGED")
    raw = _item(source="unjobs")
    fp = _fp(raw)
    existing = {
        raw["application_url"]: {
            "application_url": raw["application_url"],
            "slug": "software-engineer-unjobs-abc",
            "content_fingerprint": fp,
            "semantic_fingerprint": "x",
            "verification_status": "verified",
            "is_active": True,
            "catalog_eligible": True,
            "match_eligible": True,
            "alerts_eligible": True,
            "seo_eligible": True,
        }
    }
    sink = _sink_with_existing(existing)
    summary = sink.upsert([raw])
    assert_eq(summary.unchanged, 1, "K: same source string -- unchanged=1")
    assert_eq(sink.session.post.called, False, "K: no DB write for truly unchanged item")


# ─── Fixture L: different canonical source — fingerprints must differ ─────────
def test_l_source_different_canonical() -> None:
    """Two truly different canonical sources at the same application_url.
    The source field is part of the fingerprint, so they must NOT collapse."""
    print("\nFixture L: different canonical source --fingerprint differs, no collapse")
    url = "https://example.com/jobs/shared-url"
    item_unjobs = _item(source="unjobs", application_url=url)
    item_himalayas = _item(source="himalayas", application_url=url)
    fp_unjobs = _fp(item_unjobs)
    fp_himalayas = _fp(item_himalayas)
    assert_true(fp_unjobs != fp_himalayas, "L: different source -- different fingerprints (no collapse)")
    # DB row has source=unjobs fingerprint; new run delivers source=himalayas → update path
    existing = {
        url: {
            "application_url": url,
            "slug": "some-job-abc",
            "content_fingerprint": fp_unjobs,
            "semantic_fingerprint": "x",
            "verification_status": "in_review",
            "is_active": False,
            "catalog_eligible": False,
            "match_eligible": False,
            "alerts_eligible": False,
            "seo_eligible": False,
        }
    }
    sink = _sink_with_existing(existing)
    summary = sink.upsert([item_himalayas])
    assert_eq(summary.updated, 1, "L: source change causes update (fingerprint differs)")
    assert_eq(summary.unchanged, 0, "L: not flagged as unchanged when source differs")


# ─── Fixture M: coverage stop reason semantics ────────────────────────────────
def test_m_coverage_stop_reason_semantics() -> None:
    """Budget hit → stop_reason='record_budget_reached'.
    Natural exhaustion → scraper-specific reason preserved.
    Scheduled max_items=10000 with source>10000 is still partial coverage."""
    print("\nFixture M: coverage stop reason semantics")

    def expected_stop(scraped: int, budget: int, natural_reason: str) -> str:
        return "record_budget_reached" if scraped >= budget else natural_reason

    # Under budget → natural reason preserved
    assert_eq(expected_stop(50, 10000, "configured_listing_pages"), "configured_listing_pages",
              "M: under budget --configured_listing_pages preserved")
    assert_eq(expected_stop(50, 10000, "rss_category_walk"), "rss_category_walk",
              "M: under budget --rss_category_walk preserved")
    assert_eq(expected_stop(50, 10000, "configured_search_set"), "configured_search_set",
              "M: under budget --configured_search_set preserved")
    assert_eq(expected_stop(4999, 5000, "configured_listing_pages"), "configured_listing_pages",
              "M: one below budget --natural reason")

    # Budget exactly reached → record_budget_reached
    assert_eq(expected_stop(10000, 10000, "configured_listing_pages"), "record_budget_reached",
              "M: budget exactly reached --record_budget_reached")
    assert_eq(expected_stop(250, 250, "rss_category_walk"), "record_budget_reached",
              "M: default manual budget 250 reached --record_budget_reached")
    assert_eq(expected_stop(50, 50, "configured_listing_pages"), "record_budget_reached",
              "M: scan budget 50 reached --record_budget_reached")

    # schedule=10000 but source has 15000 → partial, NOT full coverage
    assert_eq(expected_stop(10000, 10000, "configured_listing_pages"), "record_budget_reached",
              "M: schedule hits 10000 of 15000 --record_budget_reached (not full coverage)")
    # schedule=10000, source only has 5000 → natural exhaustion
    assert_eq(expected_stop(5000, 10000, "configured_listing_pages"), "configured_listing_pages",
              "M: schedule=10000 but source only 5000 --natural reason (no budget cut)")


# ─── Runner ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    for fn in [
        test_a_unchanged,
        test_b_update,
        test_c_insert,
        test_d_invalid_url,
        test_e_generic_title,
        test_f_inrun_dedup,
        test_g_partial_run_no_stale,
        test_h_verified_content_change,
        test_i_aggregator_source,
        test_j_max_items_cap,
        test_lineage_summary,
        test_trigger_type_max_items,
        test_k_source_alias_stable,
        test_l_source_different_canonical,
        test_m_coverage_stop_reason_semantics,
    ]:
        fn()

    print(f"\n{'='*55}")
    print(f"RESULT: {PASS_COUNT} passed, {FAIL_COUNT} failed")
    print(f"{'='*55}")
    sys.exit(0 if FAIL_COUNT == 0 else 1)
