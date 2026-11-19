from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[1]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    # dataclasses resolves annotations through sys.modules during class setup.
    # Register the module before executing it, as normal imports do.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


runner = load("run_scraper_monitored", ROOT / "scripts" / "run_scraper_monitored.py")
summary = load("summarize_scraper_run", ROOT / "scripts" / "summarize_scraper_run.py")
sink = load("opportunity_sink", ROOT / "scrapers" / "opportunity_sink.py")


class ScraperMonitoringTest(unittest.TestCase):
    def test_existing_db_constraint_mapping(self):
        self.assertEqual(runner.db_status("success"), "healthy")
        self.assertEqual(runner.db_status("partial_success"), "warning")
        self.assertEqual(runner.db_status("skipped"), "warning")
        self.assertEqual(runner.db_status("blocked"), "warning")
        self.assertEqual(runner.db_status("failed"), "failed")
        self.assertEqual(runner.db_status("executed_unmeasured"), "warning")
        self.assertEqual(runner.db_status("success_zero_confirmed"), "warning")
        self.assertEqual(runner.db_status("empty_eof_confirmed"), "warning")
        self.assertEqual(runner.db_status("resumable"), "warning")
        self.assertEqual(runner.db_status("stalled"), "warning")

    def test_workflow_budget_can_only_lower_source_control_budget(self):
        control = {"max_items_per_run": 250, "scan_max_items": 50, "schedule_max_items": 5000}
        self.assertEqual(runner.configured_item_budget(control, "manual", 20), 20)
        self.assertEqual(runner.configured_item_budget(control, "manual", 500), 250)
        self.assertEqual(runner.configured_item_budget(control, "scan", 20), 20)
        self.assertEqual(runner.configured_item_budget(control, "schedule", 20), 20)
        self.assertEqual(runner.configured_item_budget(control, "manual"), 250)

    def test_unmeasured_execution_is_not_reported_as_success_or_zero(self):
        metrics = runner.execution_metrics(None, None, "scraper finished")
        self.assertEqual(runner.measured_execution_status("success", metrics), "executed_unmeasured")
        self.assertIsNone(metrics["discovered"])
        self.assertIsNone(metrics["inserted"])

    def test_confirmed_empty_eof_and_resume_have_separate_statuses(self):
        zero = runner.execution_metrics({"found": 0, "inserted": 0, "detail_attempted": 0, "valid": 0, "unique": 0,
            "submitted": 0, "updated": 0, "unchanged": 0, "duplicates_in_run": 0, "rejected": 0,
            "failed": 0, "budget_skipped": 0}, {"extraction_metrics": {"eof_confirmed": True, "http_status": 200}})
        self.assertEqual(runner.measured_execution_status("success", zero), "empty_eof_confirmed")
        unconfirmed = runner.execution_metrics({"found": 0, "inserted": 0}, None)
        self.assertEqual(runner.measured_execution_status("success", unconfirmed), "executed_unmeasured")
        resumed = runner.execution_metrics(
            {"found": 30, "inserted": 4, "valid": 20, "unique": 18, "submitted": 10,
             "updated": 2, "unchanged": 1, "duplicates_in_run": 2, "rejected": 2,
             "failed": 0, "budget_skipped": 8},
            {"extraction_metrics": {"details_fetched": 12, "latam_cursor": {"continuation_pending": True}, "cursor_progress": {"advanced": True}}},
        )
        self.assertEqual(runner.measured_execution_status("success", resumed), "resumable")
        self.assertEqual(resumed["discovered"], 30)
        self.assertEqual(resumed["detail_attempted"], 12)
        self.assertEqual(resumed["submitted"], 10)
        self.assertEqual(resumed["duplicate"], 2)
        self.assertEqual(resumed["rejected_by_gate"], 2)

    def test_transient_http_and_nonadvancing_continuation_are_red(self):
        for http_status in (404, 429, 503):
            metrics = runner.execution_metrics({"found": 0, "inserted": 0}, {"extraction_metrics": {"http_status": http_status, "eof_confirmed": False}})
            self.assertEqual(runner.measured_execution_status("success", metrics), "failed")
        no_cursor_advance = runner.execution_metrics({"found": 5, "inserted": 0, "budget_skipped": 5}, {
            "extraction_metrics": {"latam_cursor": {"continuation_pending": True}, "cursor_progress": {"advanced": False}},
        })
        self.assertEqual(runner.measured_execution_status("success", no_cursor_advance), "stalled")
        timed_out = runner.execution_metrics({"found": 0, "inserted": 0}, {
            "extraction_metrics": {"transport_error": True, "transport_error_type": "timeout", "http_status": None},
        })
        self.assertEqual(runner.measured_execution_status("success", timed_out), "failed", "a timeout is technical failure, never confirmed empty")

    def test_explicit_null_reasons_are_omitted_and_real_reasons_survive(self):
        raw = {"title": "Analista de datos", "application_url": "https://example.org/job/1",
               "source": "paraguayconcursa_mef", "verification_reasons": None}
        normalized, error = sink.normalize_opportunity(raw)
        self.assertIsNone(error)
        self.assertNotIn("verification_reasons", normalized)
        raw["verification_reasons"] = ["SOURCE_STATUS_UNKNOWN", "REQUIRES_REVIEW"]
        normalized, error = sink.normalize_opportunity(raw)
        self.assertIsNone(error)
        self.assertEqual(normalized["verification_reasons"], ["SOURCE_STATUS_UNKNOWN", "REQUIRES_REVIEW"])

    def test_postgrest_payload_omits_null_reasons_without_erasing_real_reasons(self):
        writer = sink.OpportunitySink("https://fixture.invalid", "fixture-key")
        writer._existing_urls = lambda urls: {}
        with patch.object(writer.session, "post", return_value=Mock(status_code=204)) as post, \
             patch.object(writer, "_persist_ingestion_lineage"), \
             patch.object(writer, "_summarize_lineage"), \
             patch.object(writer, "_flush_ingestion_lineage", return_value=(0, None)):
            result = writer.upsert([
                {"title": "Vacante sin motivos explícitos", "application_url": "https://example.org/jobs/one",
                 "source": "himalayas", "verification_reasons": None},
                {"title": "Vacante con razones", "application_url": "https://example.org/jobs/two",
                 "source": "himalayas", "verification_reasons": ["REQUIRES_REVIEW"]},
            ])
        payloads = [call.kwargs["json"] for call in post.call_args_list]
        assert result.inserted == 2
        self.assertEqual(len(payloads), 2, "heterogeneous JSON fields use separate homogeneous PostgREST requests")
        self.assertNotIn("verification_reasons", payloads[0][0])
        self.assertEqual(payloads[1][0]["verification_reasons"], ["REQUIRES_REVIEW"])

    def test_summary_passes_non_failing_states(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
            for index, status in enumerate(("success", "partial_success", "skipped", "blocked")):
                Path(directory, f"cvitae-{index}.json").write_text(json.dumps({"scraper_id": str(index), "status": status}), encoding="utf-8")
            self.assertEqual(summary.main([]), 0)

    def test_summary_fails_real_and_telemetry_failures(self):
        for status in ("failed", "telemetry_failed"):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
                Path(directory, "cvitae-one.json").write_text(json.dumps({"scraper_id": "one", "status": status}), encoding="utf-8")
                self.assertEqual(summary.main([]), 1)

    def test_summary_fails_without_telemetry(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
            self.assertEqual(summary.main([]), 1)

    def test_summary_fails_unmeasured_runs_but_accepts_confirmed_zero(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
            Path(directory, "cvitae-unmeasured.json").write_text(json.dumps({"scraper_id": "unmeasured", "status": "executed_unmeasured"}), encoding="utf-8")
            self.assertEqual(summary.main([]), 1)
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
            Path(directory, "cvitae-zero.json").write_text(json.dumps({
                "scraper_id": "zero", "status": "empty_eof_confirmed", "discovered": 0, "detail_attempted": 0,
                "normalized": 0, "unique": 0, "submitted": 0, "inserted": 0, "updated": 0, "unchanged": 0,
                "duplicate": 0, "rejected_by_gate": 0, "failed": 0, "budget_skipped": 0,
                "continuation_pending": False, "eof_confirmed": True, "http_status": 200,
            }), encoding="utf-8")
            self.assertEqual(summary.main([]), 0)

    def test_require_progress_accepts_only_complete_empty_eof_or_durable_continuation(self):
        row = {
            "scraper_id": "zero", "status": "empty_eof_confirmed", "discovered": 0, "detail_attempted": 0,
            "normalized": 0, "unique": 0, "submitted": 0, "inserted": 0, "updated": 0, "unchanged": 0,
            "duplicate": 0, "rejected_by_gate": 0, "failed": 0, "budget_skipped": 0,
            "continuation_pending": False, "eof_confirmed": True, "http_status": 200,
        }
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}), patch.object(sys, "argv", ["summarize_scraper_run.py", "--require-progress"]):
            Path(directory, "cvitae-zero.json").write_text(json.dumps(row), encoding="utf-8")
            self.assertEqual(summary.main(["--require-progress"]), 0)
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}), patch.object(sys, "argv", ["summarize_scraper_run.py", "--require-progress"]):
            row["http_status"] = 429
            Path(directory, "cvitae-zero.json").write_text(json.dumps(row), encoding="utf-8")
            self.assertEqual(summary.main(["--require-progress"]), 1)

    def test_require_progress_accepts_durable_resumable_cursor_only(self):
        row = {"scraper_id": "resume", "status": "resumable", "discovered": 3, "inserted": 0,
               "budget_skipped": 2, "continuation_pending": True, "cursor_advanced": True}
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
            Path(directory, "cvitae-resume.json").write_text(json.dumps(row), encoding="utf-8")
            self.assertEqual(summary.main(["--require-progress"]), 0)
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RUNNER_TEMP": directory}):
            row["cursor_advanced"] = False
            Path(directory, "cvitae-resume.json").write_text(json.dumps(row), encoding="utf-8")
            self.assertEqual(summary.main(["--require-progress"]), 1)


if __name__ == "__main__":
    unittest.main()
