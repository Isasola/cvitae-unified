"""Cheap stdlib-only preflight for the local embedding workflow."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def main() -> int:
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    auth_headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def lane_count(params: dict) -> int | None:
        q = urlencode({"select": "id", "limit": "1", **params})
        req = Request(
            f"{base}/rest/v1/opportunities?{q}",
            headers={**auth_headers, "Prefer": "count=exact"},
        )
        try:
            with urlopen(req, timeout=30) as response:
                # PostgREST reports an exact total in Content-Range when
                # requested. Missing telemetry remains UNKNOWN, never empty.
                content_range = response.headers.get("Content-Range", "")
                total = content_range.rsplit("/", 1)[-1] if "/" in content_range else ""
                return int(total) if total.isdigit() else None
        except Exception:
            return None

    try:
        configured_hours = int(os.environ.get("FACTORY_FRESH_WINDOW_HOURS", "48"))
    except ValueError:
        configured_hours = 48
    fresh_hours = max(1, min(configured_hours, 24 * 14))
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=fresh_hours)).isoformat()

    # Class A: structural sealing needed
    fresh = lane_count({
        "factory_status": "in.(pending,failed)",
        "verification_status": "in.(pending,in_review,verified)",
        "deleted_at": "is.null",
        "archived_at": "is.null",
        "updated_at": f"gte.{cutoff}",
    })
    backlog = lane_count({
        "factory_status": "in.(pending,failed)",
        "verification_status": "in.(pending,in_review,verified)",
        "deleted_at": "is.null",
        "archived_at": "is.null",
        "or": f"(updated_at.lt.{cutoff},updated_at.is.null)",
    })
    # Class B: embedding missing for verified active match candidates
    embedding = lane_count({
        "match_eligible": "eq.true",
        "embedding": "is.null",
        "verification_status": "eq.verified",
        "is_active": "eq.true",
        "factory_status": "eq.ready",
        "deleted_at": "is.null",
        "archived_at": "is.null",
    })
    counts = {
        "structural_fresh_pending": fresh,
        "structural_backlog_pending": backlog,
        "embedding_pending": embedding,
    }
    pending = any(value is None or value > 0 for value in counts.values())
    queue_state = "unknown" if any(value is None for value in counts.values()) else "pending" if pending else "empty"
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a", encoding="utf-8") as handle:
            handle.write(f"pending={'true' if pending else 'false'}\n")
            for key, value in counts.items():
                handle.write(f"{key}={value if value is not None else 'unknown'}\n")
    print("CVITAE_FACTORY_QUEUE=" + queue_state)
    print("CVITAE_FACTORY_QUEUE_COUNTS=" + json.dumps(counts, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
