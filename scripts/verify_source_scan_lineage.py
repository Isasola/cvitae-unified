"""Deterministic checks for scan lineage; no provider or Supabase access."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from source_adapters import AdapterResult, build_scan_lineage


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

runner = (ROOT / "scripts" / "run_scraper_monitored.py").read_text(encoding="utf8")
workflow = (ROOT / ".github" / "workflows" / "scrapers.yml").read_text(encoding="utf8")
endpoint = (ROOT / "netlify" / "functions" / "admin-data.ts").read_text(encoding="utf8")
assert 'child_env["CVITAE_SCRAPER_RUN_ID"] = run_id' in runner
assert 'child_env["CVITAE_SOURCE_SCAN_REQUEST_ID"] = scan_request_id' in runner
assert 'CVITAE_SOURCE_SCAN_REQUEST_ID: ${{ inputs.scan_request_id }}' in workflow
assert 'unjobs: "unjobs_scraper"' in endpoint and 'himalayas: "himalayas_scraper"' in endpoint
assert 'talentcom: "talentcom_scraper"' in endpoint and 'weworkremotely: "weworkremotely_scraper"' in endpoint
assert 'GITHUB_ACTIONS_TOKEN' in endpoint and 'scan:${requestId}' in endpoint
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
print("PASS source scan lineage: isolated runs, durable identity, trigger correlation, allowlist, drift")
