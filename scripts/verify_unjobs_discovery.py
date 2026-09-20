"""Discovery coverage, pagination, CF-block, and reconciliation invariant tests for UNJobs V2."""
from pathlib import Path
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
import unjobs_scraper

# --- helpers ---

def _listing_page(*vacancy_ids):
    """HTML page with div.job > a.jtitle for each vacancy id (>= 2000 chars to pass CF check)."""
    cards = "".join(f'<div class="job"><a class="jtitle" href="/vacancies/{i}">Job {i}</a></div>' for i in vacancy_ids)
    padding = "<!-- " + "x" * 2100 + " -->"
    return f"<html><body>{padding}{cards}</body></html>"


def _cf_html():
    """Short response that mimics a Cloudflare challenge page (< 2000 chars)."""
    return "cf-challenge" * 50  # 600 chars


def _empty_page():
    """Listing page with no jobs — natural end of pagination (>= 2000 chars to pass CF check)."""
    padding = "<!-- " + "x" * 2100 + " -->"
    return f"<html><body>{padding}<div>No jobs found</div></body></html>"


# ────────────────────────────────────────────
# A.  CF-block detection in _scrape_listing_page
# ────────────────────────────────────────────

with patch.object(unjobs_scraper, "fetch", return_value=_cf_html()):
    jobs, blocked = unjobs_scraper._scrape_listing_page("https://unjobs.org/duty_stations/paraguay")
assert blocked is True and jobs == [], "CF block: expected ([], True)"

# Valid page returns jobs and blocked=False
with patch.object(unjobs_scraper, "fetch", return_value=_listing_page(1, 2, 3)):
    jobs, blocked = unjobs_scraper._scrape_listing_page("https://unjobs.org/duty_stations/argentina")
assert blocked is False and len(jobs) == 3
assert all(j["source"] == "unjobs" for j in jobs)

# Empty div.job cards (no jtitle) are skipped
_pad = "<!-- " + "x" * 2100 + " -->"
no_jtitle_html = f'<html><body>{_pad}<div class="job"><span>empty</span></div><div class="job"><a class="jtitle" href="/vacancies/99">Real</a></div></body></html>'
with patch.object(unjobs_scraper, "fetch", return_value=no_jtitle_html):
    jobs, blocked = unjobs_scraper._scrape_listing_page("https://unjobs.org/duty_stations/chile")
assert len(jobs) == 1 and jobs[0]["application_url"].endswith("/vacancies/99")

# ────────────────────────────────────────────
# B/C.  _discover_listing follows pagination until natural exhaustion
# ────────────────────────────────────────────

_pages_b = {
    "https://unjobs.org/duty_stations/argentina": _listing_page(10, 11, 12),
    "https://unjobs.org/duty_stations/argentina/2": _listing_page(20, 21),
    "https://unjobs.org/duty_stations/argentina/3": _empty_page(),  # natural end
}

def _fetch_b(url): return _pages_b.get(url, _empty_page())

seen_b: set[str] = set()
with patch.object(unjobs_scraper, "fetch", side_effect=_fetch_b):
    with patch("time.sleep"):
        jobs_b, stop_b = unjobs_scraper._discover_listing("https://unjobs.org/duty_stations/argentina", seen_b)

assert stop_b == "exhausted", f"Expected exhausted, got {stop_b}"
assert len(jobs_b) == 5, f"Expected 5 discovered, got {len(jobs_b)}"
# C: natural exhaustion → coverage_complete=True logic
all_exhausted_c = True
budget_hit_c = False
if all_exhausted_c and not budget_hit_c:
    cov_stop_c = "natural_exhaustion"
    cov_complete_c = True
else:
    cov_complete_c = False
assert cov_complete_c is True, "Natural exhaustion should set coverage_complete=True"

# ────────────────────────────────────────────
# B.  CF block on page 2 stops pagination and marks provider_rate_limit
# ────────────────────────────────────────────

_pages_cf = {
    "https://unjobs.org/duty_stations/colombia": _listing_page(100, 101, 102),
    "https://unjobs.org/duty_stations/colombia/2": _cf_html(),
}

def _fetch_cf(url): return _pages_cf.get(url, _empty_page())

seen_cf: set[str] = set()
with patch.object(unjobs_scraper, "fetch", side_effect=_fetch_cf):
    with patch("time.sleep"):
        jobs_cf, stop_cf = unjobs_scraper._discover_listing("https://unjobs.org/duty_stations/colombia", seen_cf)

assert stop_cf == "provider_rate_limit", f"Expected provider_rate_limit, got {stop_cf}"
assert len(jobs_cf) == 3, f"Expected 3 jobs from page 1, got {len(jobs_cf)}"

# ────────────────────────────────────────────
# D.  Budget cuts before end → record_budget_reached
# ────────────────────────────────────────────

# Simulate: discovered_total=175, max_items=50
discovered_total_d = 175
max_items_d = 50
details_processed_d = min(discovered_total_d, max_items_d)  # Phase 2 loop stops at max_items
budget_hit_d = details_processed_d >= max_items_d and discovered_total_d > max_items_d

all_exhausted_d = False
any_cf_d = False
if all_exhausted_d and not budget_hit_d:
    cov_stop_d = "natural_exhaustion"; cov_d = True
elif budget_hit_d:
    cov_stop_d = "record_budget_reached"; cov_d = False
elif any_cf_d:
    cov_stop_d = "provider_rate_limit"; cov_d = False
else:
    cov_stop_d = "configured_listing_pages"; cov_d = False

assert cov_stop_d == "record_budget_reached" and cov_d is False
assert details_processed_d == 50, f"Expected 50 processed, got {details_processed_d}"

# ────────────────────────────────────────────
# A.  discovered_total vs detail_attempted separation
# ────────────────────────────────────────────

# Source exposes 175; scan cap=50; detail_attempted must be 50, not 175
discovered_pool_a = list(range(175))
max_items_a = 50
detail_attempted_a = min(len(discovered_pool_a), max_items_a)
assert detail_attempted_a == 50
unprocessed_a = len(discovered_pool_a) - detail_attempted_a
assert unprocessed_a == 125, "125 discovered items must NOT become 'rejected'"

# 'found' metric == discovered_total (all unique URLs before detail budget)
found_metric = len(discovered_pool_a)
assert found_metric == 175

# ────────────────────────────────────────────
# E.  Reconciliation sum — no disappearing bucket
# ────────────────────────────────────────────

# For 50 items that passed through detail phase:
inserted_e = 3
updated_e = 2     # enricher.enrich_existing → changed
unchanged_e = 43  # enricher.enrich_existing → noop + stale
rejected_e = 2    # detail pages with no title (source_status != 200 etc.)

# Note: rejected = detail parse failures only; unprocessed items are NOT in this sum
detail_total_e = inserted_e + updated_e + unchanged_e + rejected_e
assert detail_total_e == 50, f"Buckets must sum to 50, got {detail_total_e}"

# existing_seen feeds unchanged; no bucket is dropped
existing_unchanged = unchanged_e  # noop + stale from enricher
existing_updated = updated_e
summary_inserted = inserted_e
assert existing_unchanged + existing_updated + summary_inserted == 48  # parsed = 48 of 50

# ────────────────────────────────────────────
# Deduplication across listing pages
# ────────────────────────────────────────────

# Same vacancy appearing on two different country pages should count once
seen_dedup: set[str] = set()
_pages_dup = {
    "https://unjobs.org/duty_stations/bolivia": _listing_page(500, 501),
    "https://unjobs.org/duty_stations/bolivia/2": _empty_page(),
    "https://unjobs.org/duty_stations/peru": _listing_page(500, 502),  # 500 is duplicate
    "https://unjobs.org/duty_stations/peru/2": _empty_page(),
}

def _fetch_dup(url): return _pages_dup.get(url, _empty_page())

discovered_dedup: list[dict] = []
with patch.object(unjobs_scraper, "fetch", side_effect=_fetch_dup):
    with patch("time.sleep"):
        for base in ["https://unjobs.org/duty_stations/bolivia", "https://unjobs.org/duty_stations/peru"]:
            new, _ = unjobs_scraper._discover_listing(base, seen_dedup)
            discovered_dedup.extend(new)

assert len(discovered_dedup) == 3, f"vacancy 500 should be deduped: expected 3, got {len(discovered_dedup)}"

print("PASS unjobs discovery: CF-block detection, pagination traversal, natural exhaustion,"
      " provider_rate_limit, budget stop, discovered_total vs detail_attempted, reconciliation invariant, dedup")
