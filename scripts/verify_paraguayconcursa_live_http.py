"""Bounded, read-only source HTTP check: exactly two list pages and one detail."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

import requests

from latam_source_runtime import UnexpectedMarkup, fetch_response
from paraguayconcursa_mef_scraper import BASE_URL, parse_detail, parse_listing_page


def main() -> int:
    session = requests.Session()
    pages = []
    first_listing = []
    for page_number, url in ((1, BASE_URL), (2, BASE_URL + "?page=2")):
        response = fetch_response(session, url, timeout=(5, 20), attempts=2, max_retry_after_seconds=10)
        parsed = parse_listing_page(response.text, url)
        if page_number == 1:
            first_listing = parsed["items"]
        pages.append({"page": page_number, "http_status": response.status_code, "cards": len(parsed["items"]), "next_page": parsed["next_page"], "source_reported_total": parsed["source_reported_total"]})
    detail_result = None
    if first_listing:
        response = fetch_response(session, first_listing[0]["detail_url"], timeout=(5, 20), attempts=2, max_retry_after_seconds=10)
        try:
            parsed_detail = parse_detail(response.text, first_listing[0])
            detail_result = {
                "http_status": response.status_code,
                "native_id": parsed_detail["native_id"],
                "title_present": bool(parsed_detail["title"]),
                "institution_present": bool(parsed_detail["institution"]),
                "location_present": bool(parsed_detail["location"]),
                "vacancies_present": parsed_detail["vacancy_count"] is not None,
                "deadline_present": bool(parsed_detail["deadline"]),
                "publication_status": parsed_detail["publication_status"],
                "complete_for_sink": parsed_detail["complete_for_sink"],
            }
        except UnexpectedMarkup as exc:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, "html.parser")
            preview = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))[:350]
            detail_result = {
                "http_status": response.status_code,
                "content_type": response.headers.get("Content-Type"),
                "page_title": soup.title.get_text(" ", strip=True) if soup.title else None,
                "parser_state": exc.kind,
                "body_preview": preview,
                "complete_for_sink": False,
            }
    print("PARAGUAYCONCURSA_LIVE_HTTP=" + json.dumps({"requests": 3, "pages": pages, "detail": detail_result, "writes": 0}, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
