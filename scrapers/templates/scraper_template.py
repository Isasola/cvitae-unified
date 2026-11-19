"""CVitae scraper template. Keep extraction separate from persistence."""
from __future__ import annotations

import os
import requests
from opportunity_sink import OpportunitySink

SOURCE_ID = "__SOURCE_ID__"
START_URL = "__START_URL__"


def extract() -> list[dict]:
    response = requests.get(START_URL, timeout=30, headers={"User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)"})
    response.raise_for_status()
    # Parse only concrete opportunity detail links. Never emit career homepages.
    return []


def main() -> None:
    rows = extract()
    summary = OpportunitySink().upsert(rows)
    print(f"{SOURCE_ID}: {summary.to_dict()}")


if __name__ == "__main__":
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    main()
