"""Summarize monitored scraper statuses and set the GitHub job conclusion."""
from __future__ import annotations

import json
import os
import argparse
from collections import Counter
from pathlib import Path


EOF_METRICS = ("discovered", "detail_attempted", "normalized", "unique", "submitted", "inserted", "updated", "unchanged", "duplicate", "rejected_by_gate", "failed", "budget_skipped")


def confirmed_empty_eof(row: dict) -> bool:
    return (row.get("eof_confirmed") is True and row.get("http_status") == 200
            and row.get("continuation_pending") is False and row.get("budget_skipped") == 0
            and row.get("failed") == 0 and all(isinstance(row.get(key), int) and not isinstance(row.get(key), bool) for key in EOF_METRICS)
            and row.get("discovered") == 0 and row.get("inserted") == 0)


def confirmed_resumable(row: dict) -> bool:
    return (row.get("continuation_pending") is True and row.get("cursor_advanced") is True
            and isinstance(row.get("budget_skipped"), int) and row["budget_skipped"] > 0
            and row.get("transport_error") is not True and row.get("cursor_circular") is not True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-progress", action="store_true", help="Fail if a source neither persists/reconciles rows nor advances its durable cursor")
    args = parser.parse_args(argv)
    root = Path(os.getenv("RUNNER_TEMP") or (Path.cwd() / ".cvitae-run-status"))
    rows = []
    for path in sorted(root.glob("cvitae-*.json")) if root.exists() else []:
        try:
            rows.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            rows.append({"scraper_id": path.stem, "status": "telemetry_failed"})

    if not rows:
        print("::error::No monitored scraper status was produced.")
        return 1

    counts = Counter(str(row.get("status") or "telemetry_failed") for row in rows)
    print("CVITAE SCRAPER RUN SUMMARY")
    for status in ("success", "empty_eof_confirmed", "resumable", "stalled", "executed_unmeasured", "partial_success", "skipped", "blocked", "failed", "telemetry_failed"):
        print(f"  {status}: {counts.get(status, 0)}")

    for row in rows:
        status = row.get("status")
        scraper_id = row.get("scraper_id", "unknown")
        persisted_progress = sum(int(row.get(key) or 0) for key in ("inserted", "updated", "unchanged"))
        cursor_advanced = row.get("cursor_advanced") is True
        print(f"  evidence {scraper_id}: outcome={status} discovered={row.get('discovered')} detail_attempted={row.get('detail_attempted')} normalized={row.get('normalized')} unique={row.get('unique')} submitted={row.get('submitted')} inserted={row.get('inserted')} updated={row.get('updated')} unchanged={row.get('unchanged')} duplicate={row.get('duplicate')} rejected={row.get('rejected_by_gate')} failed={row.get('failed')} budget_skipped={row.get('budget_skipped')} continuation_pending={row.get('continuation_pending')} cursor_advanced={row.get('cursor_advanced')} eof_confirmed={row.get('eof_confirmed')} http_status={row.get('http_status')}")
        empty_eof = status == "empty_eof_confirmed" and confirmed_empty_eof(row)
        resumable = status == "resumable" and confirmed_resumable(row)
        if status == "empty_eof_confirmed" and not empty_eof:
            print(f"::error title=Invalid empty EOF evidence::{scraper_id} lacks complete HTTP/EOF/accounting evidence")
        if status == "resumable" and not resumable:
            print(f"::error title=Invalid continuation evidence::{scraper_id} lacks an advanced cursor, exhausted budget, or safe continuation")
        if args.require_progress and not persisted_progress and not cursor_advanced and not empty_eof and not resumable:
            print(f"::error title=Source made no durable progress::{scraper_id} had no inserted/updated/unchanged row and did not advance its cursor")
        if status in {"failed", "telemetry_failed", "stalled"} or (status == "empty_eof_confirmed" and not empty_eof) or (status == "resumable" and not resumable):
            print(f"::error title=Scraper {status}::{scraper_id}")
        elif status in {"partial_success", "blocked", "resumable", "executed_unmeasured", "skipped"}:
            print(f"::warning title=Scraper {status}::{scraper_id}")

    # Missing stage counts cannot silently pass an automated source job as
    # healthy. A measured zero remains a distinct, reviewable outcome.
    invalid_evidence = any((row.get("status") == "empty_eof_confirmed" and not confirmed_empty_eof(row)) or (row.get("status") == "resumable" and not confirmed_resumable(row)) for row in rows)
    no_progress = args.require_progress and any(
        not sum(int(row.get(key) or 0) for key in ("inserted", "updated", "unchanged"))
        and row.get("cursor_advanced") is not True
        and not confirmed_empty_eof(row)
        and not confirmed_resumable(row)
        for row in rows
    )
    red = any(row.get("status") in {"failed", "telemetry_failed", "stalled", "executed_unmeasured"} for row in rows)
    return 1 if red or invalid_evidence or no_progress else 0


if __name__ == "__main__":
    raise SystemExit(main())
