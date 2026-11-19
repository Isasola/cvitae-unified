"""Deterministic checks for scan lineage; no provider or Supabase access."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from source_adapters import AdapterResult, build_scan_lineage
from source_adapters import RunLineageWriter
from run_source_scan_automation_bridge import _extract_persisted_ids, _ingestion_outcomes


def detail(url: str, description: str = "usable description") -> AdapterResult:
    return AdapterResult(source="unjobs", adapter_version="fixture:v1", source_url=url,
        apply_url=url + "/apply", title="Role", organization="Org", description=description,
        location="Asuncion", source_status=200)


first = detail("https://source.test/one")
second = detail("https://source.test/two", "")
run_one = build_scan_lineage([first], run_id="run-one", scan_request_id="request-one", persisted={first.apply_url: "opportunity-one"})
run_two = build_scan_lineage([second], run_id="run-two", scan_request_id="request-two", persisted={})

# Two same-source scans are disjoint, and no historical timestamp is involved.
assert run_one["run_id"] == "run-one" and run_one["items"][0]["opportunity_id"] == "opportunity-one"
assert run_two["run_id"] == "run-two" and run_two["items"][0]["opportunity_id"] is None
assert run_one["items"][0]["identity"] != run_two["items"][0]["identity"]
assert run_two["items"][0]["persistence"] == "NOT_PERSISTED"
assert run_two["issue_groups"]["ROW_NOT_FOUND_AFTER_SINK"] == 1
failed_lineage = build_scan_lineage([first], run_id="run-three", scan_request_id="request-three", persisted={first.apply_url: "opportunity-one"}, lineage_errors=["LINEAGE_EVENT_WRITE_FAILED"])
assert failed_lineage["lineage_evidence"] == {"status": "WARNING", "reason_codes": ["LINEAGE_EVENT_WRITE_FAILED"]}

automation_run = {"extraction_metrics": {"scan_lineage": {"items": [
    {"opportunity_id": "unchanged-row", "persistence": "PERSISTED"},
    {"opportunity_id": "changed-row", "persistence": "PERSISTED"},
    {"opportunity_id": "already-skipped", "persistence": "PERSISTED", "promotion_status": "UNCHANGED_SKIPPED"},
]}}}
assert _extract_persisted_ids(automation_run) == ["unchanged-row", "changed-row"]

class OutcomeResponse:
    def raise_for_status(self): pass
    def json(self): return [
        {"opportunity_id": "unchanged-row", "outcome": "UNCHANGED"},
        {"opportunity_id": "changed-row", "outcome": "UPDATED"},
    ]

class OutcomeSession:
    def get(self, url, **kwargs):
        assert url.endswith("/opportunity_ingestion_events")
        assert kwargs["params"]["run_id"] == "eq.run-one"
        assert kwargs["params"]["opportunity_id"] == 'in.("unchanged-row","changed-row")'
        return OutcomeResponse()

import os
from unittest.mock import patch
with patch.dict(os.environ, {"SUPABASE_SERVICE_ROLE_KEY": "fixture-only"}, clear=False), \
     patch("run_source_scan_automation_bridge.api_base", return_value="https://db.test/rest/v1"):
    outcomes = _ingestion_outcomes(OutcomeSession(), "run-one", ["unchanged-row", "changed-row"])
assert outcomes["unchanged-row"] == ["UNCHANGED"]
assert outcomes["changed-row"] == ["UPDATED"]


class Response:
    status_code = 201

    def __init__(self, rows=None, status_code=201):
        self._rows = rows or []
        self.status_code = status_code

    def json(self): return self._rows
    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            raise requests.HTTPError(f"http_{self.status_code}")


class Session:
    def __init__(self, observation_status=201):
        self.posts = []
        self.observation_status = observation_status

    def get(self, *args, **kwargs): return Response([{"id": "opportunity-factual"}])
    def post(self, url, **kwargs):
        payload = kwargs.get("json")
        self.posts.append((url, payload))
        return Response(status_code=self.observation_status if url.endswith("opportunity_source_observations") else 201)


import os
from unittest.mock import patch
factual = AdapterResult(source="unjobs", adapter_version="adapter:v2", source_url="https://source.test/one",
    source_native_id="native-1", canonical_url="https://source.test/one", apply_url="https://source.test/one/apply", source_status=200)
with patch.dict(os.environ, {"CVITAE_SCRAPER_RUN_ID": "run-factual", "CVITAE_SOURCE_SCAN_REQUEST_ID": ""}, clear=False):
    session = Session()
    manifest = RunLineageWriter("https://db.test", "service", session).record([factual])
assert manifest["items"][0]["observation"] == {"state": "PERSISTED", "reason": "FACTUAL_OBSERVATION_WRITTEN"}
observation_posts = [payload for url, payload in session.posts if url.endswith("opportunity_source_observations")]
assert len(observation_posts) == 1 and observation_posts[0][0]["opportunity_id"] == "opportunity-factual"
assert observation_posts[0][0]["http_status"] == 200

without_fact = AdapterResult(source="unjobs", adapter_version="adapter:v2", source_url="https://source.test/two",
    apply_url="https://source.test/two/apply", source_status=200)
with patch.dict(os.environ, {"CVITAE_SCRAPER_RUN_ID": "run-missing", "CVITAE_SOURCE_SCAN_REQUEST_ID": ""}, clear=False):
    missing = RunLineageWriter("https://db.test", "service", Session()).record([without_fact])
assert missing["items"][0]["observation"] == {"state": "MISSING", "reason": "FACTUAL_ADAPTER_EVIDENCE_INSUFFICIENT"}

with patch.dict(os.environ, {"CVITAE_SCRAPER_RUN_ID": "run-observation-failed", "CVITAE_SOURCE_SCAN_REQUEST_ID": ""}, clear=False):
    failed_session = Session(observation_status=500)
    failed = RunLineageWriter("https://db.test", "service", failed_session).record([factual])
assert failed["items"][0]["observation"] == {"state": "WRITE_FAILED", "reason": "FACTUAL_OBSERVATION_WRITE_FAILED"}
assert "OBSERVATION_WRITE_FAILED" in failed["lineage_evidence"]["reason_codes"]

runner = (ROOT / "scripts" / "run_scraper_monitored.py").read_text(encoding="utf8")
workflow = (ROOT / ".github" / "workflows" / "scrapers.yml").read_text(encoding="utf8")
endpoint = (ROOT / "netlify" / "functions" / "admin-data.ts").read_text(encoding="utf8")
assert 'child_env["CVITAE_SCRAPER_RUN_ID"] = run_id' in runner
assert 'child_env["CVITAE_SOURCE_SCAN_REQUEST_ID"] = scan_request_id' in runner
assert 'CVITAE_SOURCE_SCAN_REQUEST_ID: ${{ inputs.scan_request_id }}' in workflow
assert 'unjobs: "unjobs_scraper"' in endpoint and 'himalayas: "himalayas_scraper"' in endpoint
assert 'talentcom: "talentcom_scraper"' in endpoint and 'weworkremotely: "weworkremotely_scraper"' in endpoint
assert 'GITHUB_ACTIONS_TOKEN' in endpoint and 'scan_request_id: requestId' in endpoint
assert 'POSSIBLE_SOURCE_DRIFT' in endpoint
assert 'status === "FAILED"' in endpoint and 'status, run, error' in endpoint

# The drift calculation compares durable run metrics only. A 60% coverage drop
# is the same threshold used by the admin projection and remains informative.
previous = {"found": 100, "parsed": 100, "coverage": {"description": 1.0, "source_url": 1.0}}
latest = {"found": 40, "parsed": 60, "coverage": {"description": 0.4, "source_url": 0.5}}
signals = [field for field in ("found", "parsed") if previous[field] > 0 and latest[field] < previous[field] * 0.5]
for field in ("description", "source_url"):
    if previous["coverage"][field] > 0 and latest["coverage"][field] < previous["coverage"][field] * 0.5:
        signals.append(f"{field}_coverage")
assert signals == ["found", "description_coverage"]
schema = (ROOT / "supabase" / "migrations" / "202609120002_opportunity_intelligence_v2_schema.sql").read_text(encoding="utf8")
writer = (ROOT / "scrapers" / "source_adapters.py").read_text(encoding="utf8")
for column in ("opportunity_id", "source", "adapter_version", "source_url", "canonical_url", "changed_fields", "before_fields", "after_fields", "evidence"):
    assert column in schema and f'"{column}"' in writer
print("PASS source scan lineage: isolated runs, durable identity, trigger correlation, allowlist, drift")
