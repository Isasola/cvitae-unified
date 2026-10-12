"""Greenhouse Job Board connector. Explicit boards only; review-only."""
from __future__ import annotations
import html, json, os, re, time
from pathlib import Path
from typing import Any
import requests
from opportunity_sink import OpportunitySink

SOURCE_ID = "greenhouse"
API = "https://boards-api.greenhouse.io/v1/boards/{board}/jobs"
CONFIG = Path(__file__).with_name("ats_boards.json")

def clean_html(value: Any) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html.unescape(str(value or ""))).split())[:12000]

def adapt_job(board: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    token, employer = board["token"], board["employer"]
    url = str(raw.get("absolute_url") or "").strip()
    location = str((raw.get("location") or {}).get("name") or "").strip()
    return {
        "title": str(raw.get("title") or "").strip(), "organization": employer,
        "description": clean_html(raw.get("content")), "location": location,
        "country_code": None, "remote": None, "remote_scope": "UNKNOWN",
        "eligible_countries": [], "eligible_regions": [],
        "application_url": url, "source_url": url, "original_source_url": url,
        "source": SOURCE_ID, "source_authority": "original", "original_source_verified": False,
        "opportunity_type": "job", "published_at": raw.get("first_published"),
        "deadline": raw.get("application_deadline"),
        "source_native_id": f"greenhouse:{token}:{raw.get('id')}",
        "tags": ["Greenhouse", employer, *[str(x.get("name")) for x in raw.get("departments") or [] if x.get("name")]][:10],
        "verification_status": "in_review", "is_active": False,
        "catalog_eligible": False, "match_eligible": False, "alerts_eligible": False, "seo_eligible": False,
    }

def fetch_board(board: dict[str, Any], session: requests.Session | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    client = session or requests.Session(); token = str(board["token"])
    response = client.get(API.format(board=token), params={"content": "true"}, headers={"Accept": "application/json", "User-Agent": "CVitaeBot/1.0 (+https://cvitae.lat)"}, timeout=(5, 25))
    if response.status_code == 429: raise RuntimeError("greenhouse_rate_limited")
    response.raise_for_status(); payload = response.json(); jobs = payload.get("jobs") or []
    expected = int((payload.get("meta") or {}).get("total", len(jobs)))
    identities = [str(job.get("id")) for job in jobs if job.get("id") is not None]
    if len(identities) != len(set(identities)): raise RuntimeError("greenhouse_duplicate_job_ids")
    # Official list endpoint returns the board's whole published list; meta.total
    # is the coverage contract rather than an invented page count.
    if expected != len(jobs): raise RuntimeError(f"greenhouse_incomplete_inventory:{len(jobs)}/{expected}")
    return [adapt_job(board, job) for job in jobs], {"expected": expected, "received": len(jobs), "complete": True}

def configured_boards() -> list[dict[str, Any]]:
    data = json.loads(CONFIG.read_text(encoding="utf-8")); boards = data.get("greenhouse") or []
    return [x for x in boards if x.get("enabled") is True and x.get("permission_state") == "REVIEW_APPROVED" and x.get("token") and x.get("employer")]

def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1")
    rows=[]
    for board in configured_boards():
        found, coverage = fetch_board(board); rows.extend(found); print(json.dumps({"provider": SOURCE_ID, "board": board["token"], **coverage}))
        time.sleep(float(board.get("delay_seconds", .5)))
    summary=OpportunitySink().upsert(rows, adapter_version="greenhouse:v1.0.0") if rows else None
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict() if summary else {"found": 0, "reason": "NO_APPROVED_BOARDS"}))

if __name__ == "__main__": main()
