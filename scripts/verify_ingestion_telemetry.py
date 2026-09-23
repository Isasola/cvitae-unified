"""Offline contract for discovery/enrichment/sink telemetry accounting."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from source_evidence import ingestion_accounting_telemetry


def verify_unjobs() -> None:
    """Production-observed accounting: discovery must not become new rows."""
    output = ingestion_accounting_telemetry(
        discovered=482,
        detail_attempted=482,
        parsed=482,
        existing_enrichment={"attempted": 273, "changed": 5, "noop": 268, "stale": 0, "failed": 0},
        new_rows_submitted_to_sink=209,
        sink_summary={"found": 209, "valid": 209, "unique": 209, "inserted": 209, "updated": 0, "unchanged": 0, "rejected": 0, "failed": 0},
    )
    accounting = output["ingestion_accounting"]
    assert output["found"] == 482
    assert accounting["new_rows_submitted_to_sink"] == 209
    assert (output["inserted"], output["updated"], output["unchanged"]) == (209, 5, 268)
    assert accounting["terminal_outcomes"] == 482 and accounting["unaccounted"] == 0


def verify_talent_enrichment() -> None:
    output = ingestion_accounting_telemetry(
        discovered=20,
        detail_attempted=20,
        parsed=20,
        existing_enrichment={"attempted": 12, "changed": 2, "noop": 9, "stale": 1, "failed": 0},
        new_rows_submitted_to_sink=8,
        sink_summary={"found": 8, "valid": 8, "unique": 8, "inserted": 8, "updated": 0, "unchanged": 0, "rejected": 0, "failed": 0},
    )
    accounting = output["ingestion_accounting"]
    assert output["found"] == accounting["discovered"] == 20
    assert accounting["new_rows_submitted_to_sink"] == 8
    assert output["updated"] == 2 and output["unchanged"] == 10 and output["inserted"] == 8
    assert accounting["unaccounted"] == 0


def main() -> int:
    verify_unjobs()
    verify_talent_enrichment()
    # The monitored runner still reads the legacy fields, now with correct
    # discovery semantics; detailed accounting remains in JSON telemetry.
    monitor = (ROOT / "scripts" / "run_scraper_monitored.py").read_text(encoding="utf-8")
    assert '"found_count": summary.get("found")' in monitor
    for scraper in ("unjobs_scraper.py", "talentcom_scraper.py"):
        text = (ROOT / "scrapers" / scraper).read_text(encoding="utf-8")
        assert "ingestion_accounting_telemetry" in text
        assert 'print("CVITAE_INGESTION_SUMMARY=" + json.dumps(ingestion_summary' in text
    print("verify_ingestion_telemetry: PASS unjobs_discovered=482 new_rows=209 talent_discovered=20")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
