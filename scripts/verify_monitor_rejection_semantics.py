"""Offline regression: valid rejection is not a technical scraper error."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from run_scraper_monitored import execution_outcome


def main() -> int:
    rejected_summary = {"rejected": 3, "errors": []}
    lines, warnings, errors, status = execution_outcome(0, "CVITAE_INGESTION_SUMMARY={}", rejected_summary)
    assert lines == [] and warnings == 0 and errors == 0 and status == "success"

    lines, warnings, errors, status = execution_outcome(0, "warning: provider coverage partial", {"rejected": 0, "errors": []})
    assert warnings == 1 and errors == 0 and status == "partial_success"

    lines, warnings, errors, status = execution_outcome(1, "normal output", {"rejected": 0, "errors": []})
    assert errors == 1 and status == "failed" and lines

    lines, warnings, errors, status = execution_outcome(0, "CVITAE_INGESTION_SUMMARY={}", {
        "rejected": 3, "budget_skipped": 4, "unchanged": 2, "errors": [], "technical_failure": False,
    })
    assert status == "success" and errors == 0

    lines, warnings, errors, status = execution_outcome(0, "CVITAE_INGESTION_SUMMARY={}", {
        "inserted": 2, "errors": [], "technical_failure": True, "lineage_failed": 1,
    })
    assert status == "failed" and errors >= 1 and "INGESTION_TECHNICAL_FAILURE" in lines

    adapter_output = 'CVITAE_ADAPTER_METRICS={"extraction_metrics":{"scan_lineage":{"counts":{"PERSISTED":1},"lineage_evidence":{"status":"WARNING","reason_codes":["LINEAGE_EVENT_WRITE_FAILED"]}}}}'
    lines, warnings, errors, status = execution_outcome(0, adapter_output, {"errors": []})
    assert status == "failed" and "LINEAGE_EVENT_WRITE_FAILED" in lines
    print("verify_monitor_rejection_semantics: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
