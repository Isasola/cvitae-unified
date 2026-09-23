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
    print("verify_monitor_rejection_semantics: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
