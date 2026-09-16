"""Cheap stdlib-only preflight for the local embedding workflow."""
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def main() -> int:
    base = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    auth_headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def has_candidates(params: dict) -> bool:
        q = urlencode({"select": "id", "limit": "1", **params})
        req = Request(f"{base}/rest/v1/opportunities?{q}", headers=auth_headers)
        with urlopen(req, timeout=30) as response:
            rows = json.loads(response.read().decode("utf-8"))
        return bool(rows)

    # Class A: structural sealing needed
    class_a = has_candidates({
        "factory_status": "in.(pending,failed)",
        "verification_status": "in.(pending,in_review,verified)",
        "deleted_at": "is.null",
        "archived_at": "is.null",
    })
    # Class B: embedding missing for verified active match candidates
    class_b = has_candidates({
        "match_eligible": "eq.true",
        "embedding": "is.null",
        "verification_status": "eq.verified",
        "is_active": "eq.true",
        "factory_status": "eq.ready",
        "deleted_at": "is.null",
        "archived_at": "is.null",
    })
    pending = class_a or class_b
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a", encoding="utf-8") as handle:
            handle.write(f"pending={'true' if pending else 'false'}\n")
    print("CVITAE_FACTORY_QUEUE=" + ("pending" if pending else "empty"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
