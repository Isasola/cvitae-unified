"""Offline contract: every scraper_runs writer sends an integer duration."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    maintenance = (ROOT / "scripts" / "run_source_maintenance.py").read_text(encoding="utf-8")
    monitored = (ROOT / "scripts" / "run_scraper_monitored.py").read_text(encoding="utf-8")
    enrichment = (ROOT / "scripts" / "run_opportunity_enrichment_batch.py").read_text(encoding="utf-8")
    probe = (ROOT / "scripts" / "run_himalayas_health_probe.py").read_text(encoding="utf-8")
    assert "def scraper_run_duration_seconds" in maintenance
    assert '"duration_seconds": scraper_run_duration_seconds(' in maintenance
    assert "duration = max(0, round(" in monitored
    assert '"duration_seconds": duration' in monitored
    assert '"duration_seconds": max(0, round(' in enrichment
    assert '"duration_seconds":0' in probe.replace(" ", "")
    print("verify_scraper_run_duration_contract: PASS maintenance=integer monitored=integer enrichment=integer probe=integer")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
