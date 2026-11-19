"""Cheap, source-specific inventory evidence used before detail requests.

Absence from a scout is never death evidence. Scouts report only current
public IDs/URLs; adapters retain detail identity and semantic ownership.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


@dataclass(frozen=True)
class ScoutSnapshot:
    source: str
    strategy: str
    native_ids: frozenset[str] = frozenset()
    urls: frozenset[str] = frozenset()
    metadata: dict[str, Any] = field(default_factory=dict)


def empty_snapshot(source: str, strategy: str, *, error: str | None = None) -> ScoutSnapshot:
    metadata: dict[str, Any] = {"absence_is_not_death": True}
    if error:
        metadata["error"] = error
    return ScoutSnapshot(source=source, strategy=strategy, metadata=metadata)


def _get(session: requests.Session | None, url: str, **kwargs: Any) -> requests.Response:
    return (session or requests).get(url, timeout=(5, 20), **kwargs)


def scout_himalayas(*, limit: int = 100, full: bool = False, session: requests.Session | None = None) -> ScoutSnapshot:
    """Shared paginated API inventory; a sample is never presented as full."""
    from himalayas_scraper import fetch_api_inventory, job_identity_urls
    inventory = fetch_api_inventory(page_size=100, max_records=None if full else min(max(limit, 1), 100), session=session)
    urls = {url for job in inventory.jobs for url in job_identity_urls(job)}
    if inventory.error and not urls:
        return empty_snapshot("himalayas", "himalayas_api", error=inventory.error)
    return ScoutSnapshot("himalayas", "himalayas_api", frozenset(url.rstrip("/").split("/")[-1] for url in urls), frozenset(urls), {"records": inventory.records_seen, "unique_records": inventory.records_seen, "duplicate_records": inventory.duplicate_records, "pages_seen": inventory.pages_seen, "complete": inventory.complete, "error": inventory.error, "reported_total_count": inventory.reported_total_count, "last_cursor_present": inventory.last_cursor_present, "absence_is_not_death": True})


def scout_unjobs(*, max_pages: int = 3, session: requests.Session | None = None) -> ScoutSnapshot:
    """Listing links are cheap evidence of current UNJobs inventory."""
    from unjobs_scraper import FETCH_HEADERS, PAGES
    urls: set[str] = set(); statuses: list[int] = []
    try:
        for page in PAGES[:max(1, max_pages)]:
            response = _get(session, page, headers=FETCH_HEADERS); statuses.append(response.status_code)
            if not response.ok:
                continue
            for node in BeautifulSoup(response.text, "html.parser").select("a[href*='/vacancies/']"):
                href = urljoin(page, str(node.get("href") or ""))
                if re.search(r"/vacancies/\d+", href):
                    urls.add(href.split("#", 1)[0])
    except requests.RequestException as exc:
        return empty_snapshot("unjobs", "unjobs_listing", error=type(exc).__name__)
    ids = {match.group(1) for url in urls if (match := re.search(r"/vacancies/(\d+)", url))}
    return ScoutSnapshot("unjobs", "unjobs_listing", frozenset(ids), frozenset(urls), {"pages": len(statuses), "http_statuses": statuses, "absence_is_not_death": True})


def scout_wwr(*, limit: int = 100, session: requests.Session | None = None) -> ScoutSnapshot:
    """RSS is WWR discovery evidence; every eventual detail still validates."""
    from xml.etree import ElementTree as ET
    from weworkremotely_scraper import BASE_RSS, CATEGORIES, HEADERS
    urls: set[str] = set(); feeds = 0
    try:
        for slug, _ in CATEGORIES:
            if len(urls) >= limit:
                break
            response = _get(session, BASE_RSS.format(slug), headers=HEADERS); feeds += 1
            if not response.ok:
                continue
            for item in ET.fromstring(response.content).findall(".//item"):
                url = (item.findtext("link") or item.findtext("guid") or "").strip()
                if url: urls.add(url)
                if len(urls) >= limit: break
    except (requests.RequestException, ET.ParseError) as exc:
        return empty_snapshot("weworkremotely", "wwr_rss", error=type(exc).__name__)
    return ScoutSnapshot("weworkremotely", "wwr_rss", frozenset(url.rstrip("/").split("/")[-1] for url in urls), frozenset(urls), {"feeds": feeds, "detail_required": True, "absence_is_not_death": True})


def scout_talentcom(*, max_searches: int = 3, session: requests.Session | None = None) -> ScoutSnapshot:
    """Talent search listings yield leads only; their search geo is not job geo."""
    from talentcom_scraper import BASE_URL, HEADERS_FETCH, SEARCHES
    urls: set[str] = set(); statuses: list[int] = []
    try:
        for keywords, location, _ in SEARCHES[:max(1, max_searches)]:
            response = _get(session, f"{BASE_URL}/jobs", params={"k": keywords, "l": location, "p": 1}, headers=HEADERS_FETCH); statuses.append(response.status_code)
            if not response.ok: continue
            for node in BeautifulSoup(response.text, "html.parser").select("a[href*='/view']"):
                href = urljoin(BASE_URL, str(node.get("href") or ""))
                if "/view" in href: urls.add(href.split("#", 1)[0])
    except requests.RequestException as exc:
        return empty_snapshot("talentcom", "talent_listing", error=type(exc).__name__)
    ids = {match.group(1) for url in urls if (match := re.search(r"[?&]id=(\d+)", url))}
    return ScoutSnapshot("talentcom", "talent_listing", frozenset(ids), frozenset(urls), {"searches": len(statuses), "http_statuses": statuses, "search_geo_is_not_job_geo": True, "absence_is_not_death": True})


def scout_source(source: str, strategy: str, *, session: requests.Session | None = None) -> ScoutSnapshot:
    dispatch = {"himalayas": scout_himalayas, "unjobs": scout_unjobs, "weworkremotely": scout_wwr, "talentcom": scout_talentcom}
    scout = dispatch.get(source)
    return scout(full=True, session=session) if source == "himalayas" else (scout(session=session) if scout else empty_snapshot(source, strategy))


def scout_hint(source: str, strategy: str) -> ScoutSnapshot:
    """Compatibility no-network baseline for explicit callers."""
    return empty_snapshot(source, strategy)
