"""Fixtures for Source Intelligence — Eight Gates run evidence."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_adapters import AdapterResult
from source_evidence import eight_gates_run_evidence, runtime_telemetry


def detail(**values):
    base = dict(source="fixture", adapter_version="fixture:v1", source_url="https://source.test/1", apply_url="https://apply.test/1", title="Role", organization="Org", description="Useful role description " * 8, location="Asunción", country_code="PY", remote_scope="ONSITE", deadline="2026-12-31", employment_type="job", source_status=200)
    base.update(values)
    return AdapterResult(**base)


runtime = runtime_telemetry(provider_health="HEALTHY", coverage_complete=True, coverage_stop_reason=None, found=1, valid=1)
assert runtime["operational_health"]["status"] == "HEALTHY"


healthy = eight_gates_run_evidence(source="himalayas", adapter_version="fixture:v1", metrics={"found": 1, "detail_pages_success": 1, "parsed": 1, "coverage_complete": True}, details=[detail()], summary={"valid": 1, "rejected": 0})
assert healthy["gate_1"]["status"] == "PASS" and healthy["gate_2"]["status"] == "PASS"
assert healthy["gate_2"]["metrics"]["fields"]["description"]["state"] == "EXTRACTED"

# Runtime can be reachable while data is unusable: the detail gate warns rather
# than pretending a blank expected field was published by the provider.
data_bad = eight_gates_run_evidence(source="talentcom", adapter_version="fixture:v1", metrics={"found": 1, "detail_pages_success": 1, "parsed": 1}, details=[detail(description=None, source_url="")], summary={"valid": 1, "rejected": 0})
assert data_bad["gate_2"]["metrics"]["fields"]["description"]["state"] == "EXPECTED_BUT_NOT_EXTRACTED"
assert data_bad["gate_2"]["metrics"]["fields"]["salary"]["state"] == "UNKNOWN"

unreachable = eight_gates_run_evidence(source="unjobs", adapter_version="fixture:v1", metrics={"found": 2, "detail_pages_success": 0, "parsed": 0}, details=[detail(source_status=0), detail(source_status=0)], summary={"valid": 0, "rejected": 2})
assert unreachable["gate_1"]["reason_code"] == "PROVIDER_UNREACHABLE"
assert unreachable["gate_2"]["status"] == "FAIL"

filtered = eight_gates_run_evidence(source="wwr", adapter_version="fixture:v1", metrics={"found": 1, "detail_pages_success": 1, "parsed": 1}, details=[detail()], summary={"valid": 0, "rejected": 1})
assert filtered["gate_3"]["status"] == "WARNING" and filtered["gate_3"]["reason_code"] == "FILTERED_ROWS"
# Runtime telemetry stores coverage under coverage_state. A bounded listing is
# PARTIAL_COVERAGE (warning), not a provider failure.
bounded = eight_gates_run_evidence(source="unjobs", adapter_version="fixture:v1", metrics={"found": 1, "detail_pages_success": 1, "parsed": 1, "coverage_state": {"complete": False, "stop_reason": "configured_listing_pages"}}, details=[detail()], summary={"valid": 1, "rejected": 0})
assert bounded["gate_1"]["status"] == "WARNING" and bounded["gate_1"]["reason_code"] == "PARTIAL_COVERAGE"
print("PASS eight gates: healthy, data-gap, unknown-not-not-published, provider failure, filters")
