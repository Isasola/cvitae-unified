"""Offline contract for paginated Himalayas API reconciliation."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers")); sys.path.insert(0, str(ROOT / "scripts"))

from himalayas_scraper import HimalayasInventory, canonical_himalayas_url, fetch_api_inventory, fetch_search_inventory
from source_identity import confirm_identity
from run_opportunity_enrichment_batch import changed_patch, himalayas_current_rows, himalayas_new_candidates


def api_job(slug: str) -> dict:
    url = f"https://himalayas.app/companies/acme/jobs/{slug}"
    return {"guid": url, "applicationLink": url, "title": "Role", "companyName": "Acme", "description": "x" * 150, "locationRestrictions": ["United States only"]}


pages = [([api_job("one"), api_job("duplicate")], "cursor-2", 3, 200), ([api_job("duplicate"), api_job("two")], None, 3, 200)]
seen_cursors: list[str | None] = []
def cursor_page(cursor=None, limit=100, session=None):
    seen_cursors.append(cursor)
    return pages[len(seen_cursors) - 1]
with patch("himalayas_scraper.fetch_page", side_effect=cursor_page):
    inventory = fetch_api_inventory(page_size=100, max_pages=10)
assert inventory.complete and inventory.pages_seen == 2 and inventory.records_seen == 3
assert seen_cursors == [None, "cursor-2"] and inventory.reported_total_count == 3 and inventory.duplicate_records == 1

# A bounded deep walk retains the opaque next cursor for the next run; it
# never tries to synthesize offsets or interpret a partial walk as absence.
with patch("himalayas_scraper.fetch_page", return_value=([api_job("resume")], "cursor-next", 100, 200)):
    checkpoint = fetch_api_inventory(page_size=100, max_pages=1, start_cursor="cursor-saved")
assert not checkpoint.complete and checkpoint.error == "page_budget_reached"
assert checkpoint.resume_cursor_used and checkpoint.next_cursor == "cursor-next"

# The API can cap an announced 100-record page at 20: cursor progression, not
# the processing limit, controls discovery.
cap_cursors: list[str | None] = []
def capped_page(cursor=None, limit=100, session=None):
    cap_cursors.append(cursor)
    return ([api_job(f"capped-{len(cap_cursors)}")], "next" if len(cap_cursors) == 1 else None, 2, 200)
with patch("himalayas_scraper.fetch_page", side_effect=capped_page):
    capped = fetch_api_inventory(page_size=100, max_pages=10)
assert capped.complete and capped.records_seen == 2 and cap_cursors == [None, "next"]

with patch("himalayas_scraper.fetch_page", side_effect=[([api_job("one")], "again", 2, 200), ([api_job("two")], "again", 2, 200)]):
    repeated = fetch_api_inventory(page_size=100, max_pages=10)
assert not repeated.complete and repeated.error == "repeated_cursor"

with patch("himalayas_scraper.fetch_page", side_effect=[([api_job("one")], "next", 2, 200), ([], None, None, 503)]):
    transient_page = fetch_api_inventory(page_size=100, max_pages=10)
assert not transient_page.complete and transient_page.error == "http_503"
with patch("himalayas_scraper.fetch_page", side_effect=[([api_job("one")], "next", 2, 200), requests.ConnectionError()]):
    timeout_page = fetch_api_inventory(page_size=100, max_pages=10)
assert not timeout_page.complete and timeout_page.error == "ConnectionError"
assert canonical_himalayas_url("https://WWW.HIMALAYAS.APP/companies/acme/jobs/one/?utm_source=x") == "https://himalayas.app/companies/acme/jobs/one"

rows = [
    {"id": "app", "source": "himalayas", "updated_at": "2026-09-01T00:00:00+00:00", "application_url": "https://himalayas.app/companies/acme/jobs/one", "source_url": None, "description": "", "organization": None, "location": None, "country_code": None, "onsite_country": None, "remote": None, "remote_scope": None, "eligible_countries": [], "eligible_regions": [], "value": None, "currency": None, "published_at": None, "deadline": None, "verification_status": "in_review", "catalog_eligible": False, "match_eligible": False, "embedding": None, "deleted_at": None, "archived_at": None},
    {"id": "source", "source": "himalayas", "updated_at": "2026-09-02T00:00:00+00:00", "application_url": None, "source_url": "https://himalayas.app/companies/acme/jobs/two/", "description": "", "organization": None, "location": None, "country_code": None, "onsite_country": None, "remote": None, "remote_scope": None, "eligible_countries": [], "eligible_regions": [], "value": None, "currency": None, "published_at": None, "deadline": None, "verification_status": "in_review", "catalog_eligible": False, "match_eligible": False, "embedding": None, "deleted_at": None, "archived_at": None},
    {"id": "historical", "source": "himalayas", "updated_at": "2026-09-03T00:00:00+00:00", "application_url": "https://himalayas.app/companies/old/jobs/gone", "source_url": None, "description": "", "organization": None, "location": None, "country_code": None, "onsite_country": None, "remote": None, "remote_scope": None, "eligible_countries": [], "eligible_regions": [], "value": None, "currency": None, "published_at": None, "deadline": None, "verification_status": "in_review", "catalog_eligible": False, "match_eligible": False, "embedding": None, "deleted_at": None, "archived_at": None},
]
current = HimalayasInventory(tuple([api_job("one"), api_job("two")]), 2, 2, (200, 200), True)
with patch("run_opportunity_enrichment_batch.himalayas_db_inventory", return_value=rows), patch("run_opportunity_enrichment_batch.fetch_api_inventory", return_value=current):
    pairs, metrics = himalayas_current_rows(1)
assert len(pairs) == 2, "limit must not truncate API discovery or exact matches"
assert metrics["db_inventory"] == 3 and metrics["db_rows_exactly_matched"] == 2
assert metrics["historical_not_in_current_api"] == 1 and metrics["api_records_seen"] == 2
assert metrics["api_existing_exact_matches"] == 2 and metrics["api_new_not_in_db"] == 0

row, raw = next(pair for pair in pairs if pair[0]["id"] == "app")
from himalayas_scraper import adapt_himalayas_job
result = adapt_himalayas_job(raw); identity = confirm_identity("himalayas", row, result); patch_data = changed_patch(result, row, identity)
assert identity.status == "IDENTITY_CONFIRMED" and patch_data["source_url"] == raw["guid"], "canonical application_url is safe source_url backfill evidence"
assert "DEAD" not in str(metrics), "absence from the API is never death evidence"

transient = HimalayasInventory((), 1, 0, (0,), False, "ConnectionError")
with patch("run_opportunity_enrichment_batch.himalayas_db_inventory", return_value=rows), patch("run_opportunity_enrichment_batch.fetch_api_inventory", return_value=transient):
    pairs, metrics = himalayas_current_rows(20)
assert not pairs and metrics["api_error"] == "ConnectionError" and metrics["historical_not_in_current_api"] is None

new_inventory = HimalayasInventory((api_job("one"), api_job("new")), 1, 2, (200,), True)
with patch("run_opportunity_enrichment_batch.himalayas_db_inventory", return_value=[rows[0]]), patch("run_opportunity_enrichment_batch.fetch_api_inventory", return_value=new_inventory):
    pairs, metrics = himalayas_current_rows(20)
assert len(pairs) == 1 and metrics["api_new_not_in_db"] == 1 and metrics["selected_new_for_ingestion"] == 0

def new_job(slug: str, restrictions, expiry="2026-12-31") -> dict:
    job = api_job(slug)
    job.update({"description": "A complete normalized Himalayas role. " * 8, "locationRestrictions": restrictions, "expiryDate": expiry})
    return job

new_jobs = [
    new_job("other", ["Japan"]),
    new_job("world", []),
    new_job("latam", ["Mexico"]),
    new_job("py", ["Paraguay"]),
    new_job("expired", ["United States"], "2020-01-01"),
]
new_current = HimalayasInventory(tuple(new_jobs), 1, len(new_jobs), (200,), True, reported_total_count=5)
py_current = HimalayasInventory((new_jobs[3],), 1, 1, (200,), True)
world_current = HimalayasInventory((new_jobs[1],), 1, 1, (200,), True)
with patch("run_opportunity_enrichment_batch.himalayas_db_inventory", return_value=[]), patch("run_opportunity_enrichment_batch.fetch_api_inventory", return_value=new_current), patch("run_opportunity_enrichment_batch.fetch_search_inventory", side_effect=[py_current, world_current]):
    candidates, new_metrics = himalayas_new_candidates(20)
assert [item["priority_segment"] for item in candidates[:4]] == ["PY_EXPLICIT", "WORLDWIDE", "LATAM_EXPLICIT", "OTHER_COUNTRY_SPECIFIC"]
assert candidates[0]["eligible_countries"] == ["PY"] and candidates[0]["py_explicit"]
assert candidates[1]["worldwide"] and candidates[1]["py_eligible"] and not candidates[1]["py_explicit"]
assert candidates[2]["latam_explicit"] and candidates[2]["latam_eligible"]
assert next(item for item in candidates if item["canonical_url"].endswith("expired"))["decision"] == "BLOCKED"
assert new_metrics["api_new_not_in_db"] == 5 and new_metrics["no_insert"] and new_metrics["no_embeddings"]
assert new_metrics["cross_lane_duplicates_deduped"] == 2 and "PY_EXPLICIT" in candidates[0]["lane_memberships"]

search_pages: list[int] = []
def search_page_get(url, params, **kwargs):
    search_pages.append(params["page"])
    class Response:
        status_code = 200; headers = {}
        def json(self): return {"jobs": [api_job("search-one")] if params["page"] == 1 else [], "totalCount": 1}
    return Response()
class SearchSession:
    get = staticmethod(search_page_get)
search = fetch_search_inventory(filters={"country": "PY", "exclude_worldwide": "true"}, session=SearchSession())
assert search.complete and search_pages == [1] and not any("cursor" in str(page) for page in search_pages)
print("PASS Himalayas inventory reconciliation: pagination, canonical identity, safe source_url backfill, no-feed-absence death")
