"""Lever Postings connector with bounded skip/limit continuation."""
from __future__ import annotations
import json, os, time
from pathlib import Path
from typing import Any
import requests
from opportunity_sink import OpportunitySink
from greenhouse_scraper import clean_html

SOURCE_ID = "lever"; CONFIG = Path(__file__).with_name("ats_boards.json")
BASES = {"global": "https://api.lever.co/v0/postings/{site}", "eu": "https://api.eu.lever.co/v0/postings/{site}"}

def adapt_posting(site: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    categories=raw.get("categories") or {}; hosted=str(raw.get("hostedUrl") or "").strip(); apply=str(raw.get("applyUrl") or hosted).strip()
    workplace=str(raw.get("workplaceType") or "unspecified").casefold(); country=str(raw.get("country") or "").upper()
    return {
        "title": str(raw.get("text") or "").strip(), "organization": site["employer"],
        "description": str(raw.get("descriptionPlain") or clean_html(raw.get("description")))[:12000],
        "location": str(categories.get("location") or "").strip(), "country_code": country or None,
        "remote": True if workplace == "remote" else False if workplace == "on-site" else None,
        "remote_scope": "UNKNOWN", "eligible_countries": [], "eligible_regions": [],
        "application_url": apply, "source_url": hosted, "original_source_url": hosted,
        "source": SOURCE_ID, "source_authority": "original", "original_source_verified": False,
        "opportunity_type": "job", "type": categories.get("commitment"),
        "source_native_id": f"lever:{site['site']}:{raw.get('id')}",
        "tags": ["Lever", site["employer"], categories.get("team"), categories.get("department")],
        "verification_status": "in_review", "is_active": False,
        "catalog_eligible": False, "match_eligible": False, "alerts_eligible": False, "seo_eligible": False,
    }

def fetch_site(site: dict[str, Any], session: requests.Session | None = None, page_size: int = 100, max_pages: int = 100) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    client=session or requests.Session(); base=BASES.get(site.get("region", "global"), BASES["global"]).format(site=site["site"])
    rows=[]; seen=set(); pages=0
    while pages < max_pages:
        response=client.get(base, params={"mode":"json","skip":len(rows),"limit":page_size}, headers={"Accept":"application/json","User-Agent":"CVitaeBot/1.0 (+https://cvitae.lat)"}, timeout=(5,25))
        if response.status_code == 429: raise RuntimeError("lever_rate_limited")
        response.raise_for_status(); page=response.json()
        if not isinstance(page,list): raise RuntimeError("lever_invalid_payload")
        pages += 1
        ids=[str(item.get("id")) for item in page if item.get("id")]
        if ids and all(i in seen for i in ids): raise RuntimeError("lever_repeated_page")
        for item in page:
            identity=str(item.get("id") or "")
            if not identity or identity in seen: continue
            seen.add(identity); rows.append(item)
        if len(page) < page_size: break
        time.sleep(float(site.get("delay_seconds", .25)))
    else: raise RuntimeError("lever_continuation_budget_exhausted")
    return [adapt_posting(site, row) for row in rows], {"pages":pages,"received":len(rows),"complete":True}

def configured_sites() -> list[dict[str, Any]]:
    data=json.loads(CONFIG.read_text(encoding="utf-8")); sites=data.get("lever") or []
    return [x for x in sites if x.get("enabled") is True and x.get("permission_state") == "REVIEW_APPROVED" and x.get("site") and x.get("employer")]

def main() -> None:
    os.environ.setdefault("CVITAE_REQUIRE_REVIEW", "1"); rows=[]
    for site in configured_sites():
        found,coverage=fetch_site(site); rows.extend(found); print(json.dumps({"provider":SOURCE_ID,"site":site["site"],**coverage}))
    summary=OpportunitySink().upsert(rows, adapter_version="lever:v1.0.0") if rows else None
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary.to_dict() if summary else {"found":0,"reason":"NO_APPROVED_SITES"}))

if __name__ == "__main__": main()
