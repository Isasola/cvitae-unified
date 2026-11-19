"""Offline assertions for the read-only Himalayas observation planner."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers")); sys.path.insert(0, str(ROOT / "scripts"))

from himalayas_scraper import HimalayasInventory
import run_himalayas_observation_reconciliation as planner


def job(slug: str) -> dict:
    url = f"https://himalayas.app/companies/acme/jobs/{slug}"
    return {"guid": url, "applicationLink": url}


rows = [
    {"id": "matched", "source_url": None, "application_url": job("live")["guid"]},
    {"id": "historic", "source_url": None, "application_url": "https://himalayas.app/companies/acme/jobs/historic"},
]
inventory = HimalayasInventory((job("live"), job("new")), 2, 2, (200, 200), False, "page_budget_reached")
with patch.object(planner, "himalayas_db_inventory", return_value=rows), \
     patch.object(planner, "fetch_api_inventory", return_value=inventory), \
     patch.object(planner, "_latest_observations", return_value={}):
    result = planner.plan(max_pages=2, max_candidates=10, run_id="test-run", session=object())
assert result["writes"] == 0 and result["exact_matches"] == 1
assert result["observation_candidates"] == 1 and result["db_only"] is None
assert result["coverage_stop_reason"] == "page_budget_reached"

with patch.object(planner, "himalayas_db_inventory", return_value=rows), \
     patch.object(planner, "fetch_api_inventory", return_value=HimalayasInventory((job("live"),), 1, 1, (200,), True)), \
     patch.object(planner, "_latest_observations", return_value={"matched": {"identity_status": "IDENTITY_CONFIRMED", "http_status": 200, "observed_at": "2999-01-01T00:00:00+00:00"}}):
    fresh = planner.plan(max_pages=1, max_candidates=10, run_id="test-run", session=object())
assert fresh["already_fresh"] == 1 and fresh["observation_candidates"] == 0

# The write summary must expose the writer's persisted count, not planner zero.
assert planner.apply_summary({"writes": 0}, {"persisted": 100}, 3)["writes"] == 100
print("verify_himalayas_observation_reconciliation: PASS")
