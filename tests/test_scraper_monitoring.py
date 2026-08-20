from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


runner = load("run_scraper_monitored", ROOT / "scripts" / "run_scraper_monitored.py")
summary = load("summarize_scraper_run", ROOT / "scripts" / "summarize_scraper_run.py")


class ScraperMonitoringTest(unittest.TestCase):
    def test_existing_db_constraint_mapping(self):
        self.assertEqual(runner.db_status("success"), "healthy")
        self.assertEqual(runner.db_status("partial_success"), "warning")
        self.assertEqual(runner.db_status("skipped"), "warning")
        self.assertEqual(runner.db_status("blocked"), "warning")
        self.assertEqual(runner.db_status("failed"), "failed")

    def test_summary_passes_non_failing_states(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
            for index, status in enumerate(("success", "partial_success", "skipped", "blocked")):
                Path(directory, f"cvitae-{index}.json").write_text(json.dumps({"scraper_id": str(index), "status": status}), encoding="utf-8")
            self.assertEqual(summary.main(), 0)

    def test_summary_fails_real_and_telemetry_failures(self):
        for status in ("failed", "telemetry_failed"):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
                Path(directory, "cvitae-one.json").write_text(json.dumps({"scraper_id": "one", "status": status}), encoding="utf-8")
                self.assertEqual(summary.main(), 1)

    def test_summary_fails_without_telemetry(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
            self.assertEqual(summary.main(), 1)


if __name__ == "__main__":
    unittest.main()
