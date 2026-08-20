"""Summarize monitored scraper statuses and set the GitHub job conclusion."""
from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path


def main() -> int:
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
    for status in ("success", "partial_success", "skipped", "blocked", "failed", "telemetry_failed"):
        print(f"  {status}: {counts.get(status, 0)}")

    for row in rows:
        status = row.get("status")
        scraper_id = row.get("scraper_id", "unknown")
        if status in {"failed", "telemetry_failed"}:
            print(f"::error title=Scraper {status}::{scraper_id}")
        elif status in {"partial_success", "blocked"}:
            print(f"::warning title=Scraper {status}::{scraper_id}")

    return 1 if counts["failed"] or counts["telemetry_failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
