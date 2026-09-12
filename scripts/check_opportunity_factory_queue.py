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
    query = urlencode({
        "select": "id",
        "factory_status": "in.(pending,failed)",
        "verification_status": "in.(pending,in_review,verified)",
        "deleted_at": "is.null",
        "archived_at": "is.null",
        "limit": "1",
    })
    request = Request(
        f"{base}/rest/v1/opportunities?{query}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urlopen(request, timeout=30) as response:
        rows = json.loads(response.read().decode("utf-8"))
    pending = bool(rows)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a", encoding="utf-8") as handle:
            handle.write(f"pending={'true' if pending else 'false'}\n")
    print("CVITAE_FACTORY_QUEUE=" + ("pending" if pending else "empty"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
