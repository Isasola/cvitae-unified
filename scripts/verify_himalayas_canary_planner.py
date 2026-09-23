"""Offline safety contract for the Himalayas eight-row canary planner."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

import run_opportunity_enrichment_batch as runner
from opportunity_sink import OpportunitySink


POLICY = {
    "web_catalog_allowed": True,
    "source_attribution_required": True,
    "third_party_job_distribution_allowed": False,
    "google_jobs_distribution_allowed": False,
}


def candidate(slug: str, countries: list[str], scope: str, *, latam=False, caribbean=False) -> dict:
    url = f"https://himalayas.app/companies/acme/jobs/{slug}"
    return {
        "canonical_url": url,
        "source_native_id": slug,
        "source": "himalayas",
        "title": f"Role {slug}",
        "organization": "Acme",
        "_description": "A validated Himalayas position with sufficient real source detail. " * 3,
        "description_length": 180,
        "source_url": url,
        "application_url": url,
        "location": "Remote",
        "country_code": None,
        "onsite_country": None,
        "remote": True,
        "remote_scope": scope,
        "eligible_countries": countries,
        "eligible_regions": [],
        "value": None,
        "currency": None,
        "deadline": "2026-12-31",
        "decision": "READY_FOR_INGESTION",
        "quality_status": "READY_FOR_INGESTION",
        "catalog_readiness": True,
        "match_readiness": True,
        "attribution_ready": True,
        "distribution_policy": POLICY,
        "py_explicit": "PY" in countries,
        "worldwide": scope == "WORLDWIDE",
        "latam_explicit": latam or bool(set(countries) & runner.LATAM_COUNTRIES),
        "lac_explicit": latam or caribbean or bool(set(countries) & runner.LAC_COUNTRIES),
        "caribbean_explicit": caribbean or bool(set(countries) & runner.CARIBBEAN_COUNTRIES),
    }


rows = [
    candidate("py-country-a", ["PY"], "COUNTRY_SPECIFIC"), candidate("py-country-b", ["PY"], "COUNTRY_SPECIFIC"),
    candidate("py-regional-a", ["PY", "AR"], "REGIONAL", latam=True), candidate("py-regional-b", ["PY", "BR"], "REGIONAL", latam=True),
    candidate("world-a", [], "WORLDWIDE"), candidate("world-b", [], "WORLDWIDE"),
    candidate("latam-mx", ["MX"], "COUNTRY_SPECIFIC", latam=True), candidate("caribbean-jm", ["JM"], "COUNTRY_SPECIFIC", caribbean=True),
]

with tempfile.TemporaryDirectory() as temp:
    with patch.object(runner, "ROOT", Path(temp)), patch.object(runner, "himalayas_new_candidates", return_value=(list(reversed(rows)), {})), patch.object(runner, "canary_preflight", return_value={"source_url_collision": False, "application_url_collision": False, "slug_collision": False}):
        planned, summary = runner.plan_himalayas_canary(8)
    assert summary["plan_ready"] and len(planned) == 8
    assert [row["segment"] for row in planned] == [name for name, count in runner.CANARY_SEGMENTS for _ in range(count)]
    assert [row["source_url"] for row in planned[:2]] == sorted(row["source_url"] for row in planned[:2])
    safe = planned[0]["payload"]
    assert safe["verification_status"] == "in_review" and safe["is_active"] is False
    assert not safe["catalog_eligible"] and not safe["match_eligible"] and not safe["seo_eligible"]
    assert safe["embedding"] is None and safe["factory_status"] == "pending"

with tempfile.TemporaryDirectory() as temp:
    with patch.object(runner, "ROOT", Path(temp)), patch.object(runner, "himalayas_new_candidates", return_value=([row for row in rows if not row["worldwide"]], {})), patch.object(runner, "canary_preflight", return_value={"source_url_collision": False, "application_url_collision": False, "slug_collision": False}):
        planned, summary = runner.plan_himalayas_canary(8)
    assert not summary["plan_ready"] and summary["shortages"] == {"WORLDWIDE": 2} and len(planned) == 6

payload = runner.enforce_canary_safe_state(rows[0])
for collision in ("source_url_collision", "application_url_collision", "slug_collision"):
    with tempfile.TemporaryDirectory() as temp:
        with patch.object(runner, "ROOT", Path(temp)), patch.object(runner, "himalayas_new_candidates", return_value=(rows, {})), patch.object(runner, "canary_preflight", return_value={"source_url_collision": collision == "source_url_collision", "application_url_collision": collision == "application_url_collision", "slug_collision": collision == "slug_collision"}):
            _, summary = runner.plan_himalayas_canary(8)
    assert not summary["plan_ready"] and summary["collisions_rejected"] > 0

sink = OpportunitySink("https://example.supabase.co", "key")
response = Mock(status_code=201)
response.json.return_value = [{"id": "new-id", "slug": payload["slug"]}]
with patch("opportunity_sink.requests.post", return_value=response) as post:
    inserted = sink.insert_new_fail_closed(payload)
assert inserted["id"] == "new-id"
assert post.call_args.args[0].endswith("/rest/v1/opportunities")
assert "params" not in post.call_args.kwargs
assert "on_conflict" not in str(post.call_args)
assert "merge-duplicates" not in str(post.call_args)
conflict = Mock(status_code=409)
with patch("opportunity_sink.requests.post", return_value=conflict):
    try:
        sink.insert_new_fail_closed(payload)
        raise AssertionError("conflict must fail closed")
    except RuntimeError as exc:
        assert "409" in str(exc)

# Future execution is tested only with a fake sink: it must re-preflight every
# planned row, remain INSERT-only and stop on the first failure.
with tempfile.TemporaryDirectory() as temp:
    manifest_path = Path(temp) / "plan.json"
    manifest_path.write_text(json.dumps({
        "mode": "PLAN_ONLY", "source": "himalayas", "canary_size": 8,
        "plan_ready": True, "rows": [{"payload": {**payload, "source_url": f"https://himalayas.app/companies/acme/jobs/{index}", "application_url": f"https://himalayas.app/companies/acme/jobs/{index}", "slug": f"role-{index}"}} for index in range(8)],
    }), encoding="utf-8")
    fake_sink = Mock()
    fake_sink.insert_new_fail_closed.side_effect = lambda item: {"id": item["slug"], "slug": item["slug"], "created_at": "now", "source_url": item["source_url"], "application_url": item["application_url"]}
    with patch.object(runner, "assert_apply_target"), patch.object(runner, "OpportunitySink", return_value=fake_sink), patch.object(runner, "canary_preflight", return_value={"source_url_collision": False, "application_url_collision": False, "slug_collision": False}):
        execution = runner.execute_himalayas_canary(str(manifest_path))
    assert len(execution) == 8 and fake_sink.insert_new_fail_closed.call_count == 8
    fake_sink.reset_mock()
    with patch.object(runner, "assert_apply_target"), patch.object(runner, "OpportunitySink", return_value=fake_sink), patch.object(runner, "canary_preflight", return_value={"source_url_collision": True, "application_url_collision": False, "slug_collision": False}):
        try:
            runner.execute_himalayas_canary(str(manifest_path))
            raise AssertionError("execution-time collision must abort before insert")
        except RuntimeError as exc:
            assert "canary_execution_collision" in str(exc)
    assert fake_sink.insert_new_fail_closed.call_count == 0

snapshot = json.loads((ROOT / "src/generated/source-intelligence-registry.json").read_text(encoding="utf-8"))
himalayas = next(item for item in snapshot["sources"] if item["canonical_source"] == "himalayas")
assert himalayas["distribution_policy"] == POLICY
job_detail = (ROOT / "src/pages/JobDetail.tsx").read_text(encoding="utf-8")
assert "google_jobs_distribution_allowed !== false" in job_detail
assert "source_attribution_required" in job_detail and "job.source_url" in job_detail
app = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
assert 'path="/empleos/:slug" component={JobDetail}' in app
assert 'path="/vacante/:slug" component={VacantePage}' in app

print("PASS himalayas canary planner: composition, collisions, safe state, insert-only transport and publication policy")
