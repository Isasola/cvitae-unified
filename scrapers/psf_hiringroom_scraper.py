"""Review-gated adapter for the employer-owned PSF HiringRoom board.

The public HTML is useful for source discovery, but HiringRoom's documented
integration API requires customer credentials and a public page is not a
redistribution grant. Production fetches therefore require an explicit
operator-managed feed authorization in addition to the monitored source gate.
Until a written feed/use agreement is recorded, the runner remains disabled.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
import re
import sys
import unicodedata
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from latam_source_runtime import Cursor, DurableRunCursor, UnexpectedMarkup, UpstreamFailure, fetch_response

SOURCE_ID = "psf_hiringroom"
RUNNER_ID = "psf_hiringroom_scraper"
TENANT = "psf"
BASE_URL = "https://psf.hiringroom.com"
LISTING_URL = f"{BASE_URL}/jobs"
ADAPTER_VERSION = "psf-hiringroom:v1.0.0"
MAX_LISTING_AGE_DAYS = 45
NATIVE_ID_RE = re.compile(r"^/jobs/get_vacancy/([a-f0-9]{24})/?$", re.I)
RELATIVE_AGE_RE = re.compile(r"(?i)hace\s+(\d+)\s*(minutos?|horas?|d[ií]as?|semanas?|mes(?:es)?|a[nñ]os?)")
EMPTY_MARKERS = ("no se encontraron vacantes", "no hay vacantes publicadas", "no hay vacantes disponibles")


def _text(value: Any) -> str:
    return " ".join(str(value or "").split())


def _fold(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").casefold()


def _same_host(url: str, expected_host: str = "psf.hiringroom.com") -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname == expected_host


def parse_relative_age(text: str) -> int | None:
    """Convert the board's relative label to a conservative age estimate.

    This is an observed age band, not an exact publication timestamp, and is
    never copied into ``published_at``.
    """
    value = _fold(text)
    match = RELATIVE_AGE_RE.search(value)
    if not match:
        return None
    amount = int(match.group(1))
    unit = match.group(2)
    if unit.startswith("minuto") or unit.startswith("hora"):
        return 0
    if unit.startswith("dia"):
        return amount
    if unit.startswith("semana"):
        return amount * 7
    if unit.startswith("mes"):
        return amount * 30
    if unit.startswith("ano"):
        return amount * 365
    return None


def _listing_total(text: str) -> tuple[int | None, int | None, int | None]:
    range_match = re.search(r"(?i)(\d+)\s*[-–]\s*(\d+)\s+de\s+(\d+)\s+vacantes", text)
    if range_match:
        return int(range_match.group(3)), int(range_match.group(1)), int(range_match.group(2))
    count_match = re.search(r"(?i)(?:ver\s+)?(\d+)\s+vacantes", text)
    return (int(count_match.group(1)), None, None) if count_match else (None, None, None)


def parse_listing_page(html: str, page_url: str = LISTING_URL) -> dict[str, Any]:
    if not _same_host(page_url):
        raise UnexpectedMarkup("listing_url_left_certified_tenant")
    soup = BeautifulSoup(html, "html.parser")
    body_text = _text(soup.get_text(" ", strip=True))
    folded = _fold(body_text)
    links = []
    seen: set[str] = set()
    anchors = soup.select("div.vacancyDataContainer a[href]")
    if not anchors:
        anchors = soup.find_all("a", href=True)
    duplicates = 0
    for anchor in anchors:
        absolute = urljoin(page_url, anchor.get("href", ""))
        parsed = urlparse(absolute)
        match = NATIVE_ID_RE.fullmatch(parsed.path)
        if not match or parsed.hostname != "psf.hiringroom.com":
            # Generic CV intake uses the same HiringRoom route family but is
            # not a concrete posting; its /candidates/new suffix is excluded.
            continue
        native_id = match.group(1).lower()
        if native_id in seen:
            duplicates += 1
            continue
        title_node = anchor.select_one(".name__vacancy, h4")
        title = _text(title_node.get_text(" ", strip=True) if title_node else "")
        if not title:
            raise UnexpectedMarkup("vacancy_card_title_missing")
        location = None
        location_icon = anchor.select_one("i[class*='hr-Location-pin']")
        if location_icon:
            location_node = location_icon.find_parent("p")
            location = _text(location_node.get_text(" ", strip=True) if location_node else "")
        age_node = anchor.select_one(".vacancy-time")
        age_text = _text(age_node.get_text(" ", strip=True) if age_node else "") or None
        arrangement = None
        employment_type = None
        tags = [_text(node.get_text(" ", strip=True)) for node in anchor.select(".tag-vacancy")]
        for tag in tags:
            folded_tag = _fold(tag)
            if folded_tag in {"presencial", "remoto", "hibrido"}:
                arrangement = folded_tag
            elif folded_tag in {"full-time", "part-time", "contract", "freelance", "temporal"}:
                employment_type = tag
        seen.add(native_id)
        canonical_url = f"{BASE_URL}/jobs/get_vacancy/{native_id}"
        links.append({
            "native_id": native_id,
            "title": title,
            "location": location,
            "relative_age_text": age_text,
            "age_days_estimate": parse_relative_age(age_text or ""),
            "work_arrangement": arrangement,
            "employment_type": employment_type,
            "detail_url": canonical_url,
            "canonical_url": canonical_url,
        })

    total, range_start, range_end = _listing_total(body_text)
    next_url = None
    next_page = None
    for anchor in soup.find_all("a", href=True):
        label = _fold(_text(anchor.get_text(" ", strip=True)))
        href = urljoin(page_url, anchor.get("href", ""))
        if "siguiente" not in label and "next" not in label:
            continue
        parsed = urlparse(href)
        page_values = parse_qs(parsed.query).get("page") or []
        if parsed.hostname == "psf.hiringroom.com" and parsed.path.rstrip("/") == "/jobs" and page_values:
            try:
                next_page = int(page_values[0])
            except ValueError:
                raise UnexpectedMarkup("pagination_page_not_numeric")
            next_url = href
            break

    explicit_empty = not links and any(marker in folded for marker in EMPTY_MARKERS)
    if not links and not explicit_empty:
        raise UnexpectedMarkup("listing_cards_missing_without_explicit_empty_state")
    page_count_matches_range = (
        range_start is not None and range_end is not None
        and len(links) == max(0, range_end - range_start + 1)
    )
    eof = explicit_empty or (
        next_url is None and total is not None and (
            len(links) == total if range_end is None else range_end == total and page_count_matches_range
        )
    )
    return {
        "items": links,
        "duplicates": duplicates,
        "reported_total": total,
        "reported_range_start": range_start,
        "reported_range_end": range_end,
        "next_page": next_page,
        "next_url": next_url,
        "explicit_empty": explicit_empty,
        "eof": eof,
        "page_url": page_url,
    }


def parse_detail(html: str, detail_url: str, listing_item: dict[str, Any]) -> dict[str, Any]:
    parsed_url = urlparse(detail_url)
    path_match = NATIVE_ID_RE.fullmatch(parsed_url.path)
    if parsed_url.hostname != "psf.hiringroom.com" or not path_match:
        raise UnexpectedMarkup("detail_url_identity_invalid")
    native_id = path_match.group(1).lower()
    if native_id != str(listing_item.get("native_id", "")).lower():
        raise UpstreamFailure("IDENTITY_MISMATCH", "detail_native_id_differs_from_listing")
    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one(".hero__title h2")
    title = _text(title_node.get_text(" ", strip=True) if title_node else "")
    if not title or _fold(title) != _fold(str(listing_item.get("title") or "")):
        raise UpstreamFailure("IDENTITY_MISMATCH", "detail_title_differs_from_listing")

    location = None
    for node in soup.select(".hero__area-ubication p"):
        candidate = _text(node.get_text(" ", strip=True))
        if "paraguay" in _fold(candidate):
            location = candidate
            break
    if not location:
        raise UnexpectedMarkup("explicit_py_job_location_missing")

    tags = [_text(node.get_text(" ", strip=True)) for node in soup.select(".hero__container-tags .hero__tag")]
    folded_tags = {_fold(tag) for tag in tags}
    if "remoto" in folded_tags:
        remote: bool | None = True
        arrangement = "remote"
    elif "presencial" in folded_tags:
        remote = False
        arrangement = "onsite"
    elif "hibrido" in folded_tags:
        remote = None
        arrangement = "hybrid"
    else:
        remote = None
        arrangement = "unknown"

    description_parts = [_text(node.get_text(" ", strip=True)) for node in soup.select(".main__description .job-description-content")]
    description = "\n\n".join(part for part in description_parts if part) or None
    apply_link = None
    for anchor in soup.find_all("a", href=True):
        if "postularse" not in _fold(_text(anchor.get_text(" ", strip=True))):
            continue
        candidate = urljoin(detail_url, anchor.get("href", ""))
        candidate_url = urlparse(candidate)
        if candidate_url.hostname == "hiringroom.com" and f"/jobs/get_vacancy/{native_id}/candidates/new" in candidate_url.path:
            apply_link = candidate
            break
    if not apply_link:
        raise UnexpectedMarkup("candidate_apply_link_missing")

    age_node = soup.select_one(".hero__time--tablet")
    relative_age_text = _text(age_node.get_text(" ", strip=True) if age_node else "") or listing_item.get("relative_age_text")
    return {
        "native_id": native_id,
        "title": title,
        "organization": "PSF",
        "location": location,
        "country_code": "PY",
        "remote": remote,
        "work_arrangement": arrangement,
        "employment_type": next((tag for tag in tags if _fold(tag) in {"full-time", "part-time", "contract", "freelance", "temporal"}), None),
        "description": description,
        "source_url": detail_url,
        "canonical_url": detail_url,
        "application_url": detail_url,
        "apply_url": apply_link,
        "relative_age_text": relative_age_text,
        "age_days_estimate": parse_relative_age(relative_age_text or ""),
        "publication_status": "LISTED_ACTIVE_UNCONFIRMED",
    }


class HiringRoomPsfAdapter:
    def __init__(self, *, session: requests.Session | None = None, cursor: DurableRunCursor | None = None):
        self.session = session or requests.Session()
        self.cursor = cursor or DurableRunCursor(RUNNER_ID, session=self.session)

    @staticmethod
    def _listing_url(page: int) -> str:
        return LISTING_URL if page == 1 else f"{LISTING_URL}?page={page}"

    def run(self, *, max_details: int = 20, now: datetime | None = None) -> tuple[list[dict[str, Any]], list[Any], dict[str, Any]]:
        now = now or datetime.now(timezone.utc)
        max_details = max(1, min(int(max_details), 20))
        cursor = self.cursor.load()
        cursor_before = cursor.payload()
        page_url = self._listing_url(cursor.page)
        listing_response = fetch_response(self.session, page_url, attempts=3)
        if not _same_host(listing_response.url or page_url):
            raise UpstreamFailure("IDENTITY_MISMATCH", "listing_redirected_outside_tenant")
        listing = parse_listing_page(listing_response.text, page_url)
        items = listing["items"]

        if cursor.continuation_pending and cursor.last_native_id:
            anchor_index = next((index for index, item in enumerate(items) if item["native_id"] == cursor.last_native_id), None)
            if anchor_index is None:
                raise UpstreamFailure("CURSOR_IDENTITY_MISMATCH", "continuation_anchor_missing_from_listing")
            start_index = anchor_index + 1
        else:
            start_index = min(cursor.card_offset, len(items))

        rows: list[dict[str, Any]] = []
        lineage: list[Any] = []
        detail_attempted = detail_404 = detail_incomplete = stale_skipped = 0
        last_processed = start_index - 1
        for index in range(start_index, len(items)):
            item = items[index]
            age_days = item.get("age_days_estimate")
            if isinstance(age_days, int) and age_days > MAX_LISTING_AGE_DAYS:
                stale_skipped += 1
                last_processed = index
                cursor.card_offset = index + 1
                cursor.last_native_id = item["native_id"]
                cursor.continuation_pending = True
                self.cursor.save(cursor)
                continue
            if detail_attempted >= max_details:
                break
            detail_attempted += 1
            try:
                response = fetch_response(self.session, item["detail_url"], attempts=3)
            except UpstreamFailure as exc:
                if exc.kind == "HTTP_404":
                    detail_404 += 1
                    last_processed = index
                    cursor.card_offset = index + 1
                    cursor.last_native_id = item["native_id"]
                    cursor.continuation_pending = True
                    self.cursor.save(cursor)
                    continue
                raise
            if not _same_host(response.url or item["detail_url"]):
                raise UpstreamFailure("IDENTITY_MISMATCH", "detail_redirected_outside_tenant")
            try:
                detail = parse_detail(response.text, item["detail_url"], item)
            except UnexpectedMarkup:
                detail_incomplete += 1
                last_processed = index
                cursor.card_offset = index + 1
                cursor.last_native_id = item["native_id"]
                cursor.continuation_pending = True
                self.cursor.save(cursor)
                continue

            reasons = ["SOURCE_FEED_RIGHTS_REVIEW", "EXACT_PUBLICATION_DATE_UNVERIFIED", "DEADLINE_NOT_PUBLISHED"]
            if detail.get("age_days_estimate") is None:
                reasons.append("PUBLICATION_AGE_UNKNOWN")
            detail["sink_row"] = {
                "title": detail["title"],
                "organization": detail["organization"],
                "description": detail["description"],
                "location": detail["location"],
                "application_url": detail["application_url"],
                "source_url": detail["source_url"],
                "original_source_url": detail["source_url"],
                "source": SOURCE_ID,
                "source_authority": "original",
                "original_source_verified": True,
                "recruiter_vacancy_id": f"{SOURCE_ID}:{TENANT}:{detail['native_id']}",
                "country_code": "PY",
                "remote": detail["remote"],
                "type": "job",
                "opportunity_kind": "empleo",
                "tags": ["paraguay", "psf", "hiringroom", f"modalidad-{detail['work_arrangement']}"],
                "is_active": False,
                "verification_status": "in_review",
                "verification_reasons": reasons,
            }
            from source_adapters import AdapterResult
            lineage.append(AdapterResult(
                source=SOURCE_ID, adapter_version=ADAPTER_VERSION,
                source_url=detail["source_url"], canonical_url=detail["canonical_url"],
                apply_url=detail["apply_url"], source_native_id=detail["native_id"],
                title=detail["title"], organization=detail["organization"], description=detail["description"],
                location=detail["location"], country_code="PY", remote=detail["remote"],
                employment_type=detail["employment_type"], source_status=200, confidence=0.95,
                extracted_fields=["source_native_id", "title", "organization", "location", "country_code", "work_arrangement", "apply_url"]
                    + (["description"] if detail["description"] else []),
                evidence={"tenant": TENANT, "job_location": detail["location"], "candidate_eligibility": "UNKNOWN",
                    "relative_age_text": detail["relative_age_text"], "age_days_estimate": detail["age_days_estimate"],
                    "publication_status": detail["publication_status"], "source_feed_rights": "REVIEW_REQUIRED"},
                recommendation="HUMAN_REVIEW", recommendation_reasons=reasons,
            ))
            rows.append(detail["sink_row"])
            last_processed = index
            cursor.card_offset = index + 1
            cursor.last_native_id = item["native_id"]
            cursor.continuation_pending = True
            self.cursor.save(cursor)

        has_more_cards = last_processed + 1 < len(items)
        if has_more_cards:
            cursor.card_offset = max(cursor.card_offset, last_processed + 1)
            cursor.continuation_pending = True
        elif listing.get("next_page"):
            cursor.page = int(listing["next_page"])
            cursor.card_offset = 0
            cursor.last_native_id = None
            cursor.continuation_pending = True
        elif listing["eof"]:
            cursor = Cursor()
        else:
            raise UpstreamFailure("EOF_UNCONFIRMED", "listing_has_no_verified_eof_or_page_link")
        self.cursor.save(cursor)

        metrics = {
            "adapter_version": ADAPTER_VERSION,
            "found": len(items), "discovered_unique": len(items),
            "detail_attempted": detail_attempted, "complete_details": len(rows),
            "detail_404_count": detail_404, "detail_incomplete_count": detail_incomplete,
            "stale_listings_skipped": stale_skipped, "duplicates": listing["duplicates"],
            "pages_fetched": 1, "reported_total": listing["reported_total"],
            "eof": listing["eof"] and not cursor.continuation_pending,
            "continuation_pending": cursor.continuation_pending,
            "budget_exhausted": detail_attempted >= max_details and cursor.continuation_pending,
            "cursor_progress": {"before": cursor_before, "after": cursor.payload(),
                "advanced": cursor.payload() != cursor_before or detail_attempted > 0 or stale_skipped > 0},
            "latam_cursor": cursor.payload(),
            "permission_status": "REVIEW_REQUIRED",
        }
        return rows, lineage, metrics


def _authorization_error() -> int:
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found": 0, "valid": 0, "inserted": 0, "failed": 0,
        "technical_failure": True, "errors": ["FEED_AUTHORIZATION_REQUIRED"], "continuation_pending": False}, separators=(",", ":")))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION,
        "extraction_metrics": {"health": {"status": "ERROR", "reason": "FEED_AUTHORIZATION_REQUIRED"}, "http_requests": 0}}, separators=(",", ":")))
    return 2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-details", type=int, default=int(os.getenv("CVITAE_LATAM_MAX_DETAILS", "20")))
    parser.add_argument("--cursor-file", help="Local continuation file for fixture verification only")
    args = parser.parse_args()
    if os.getenv("CVITAE_PSF_HIRINGROOM_FEED_AUTHORIZED", "false").casefold() != "true":
        return _authorization_error()
    if not os.getenv("CVITAE_SCRAPER_RUN_DB_ID"):
        print("PRODUCTION_RUN_ROW_REQUIRED_FOR_DURABLE_CURSOR", file=sys.stderr)
        return 2

    os.environ["CVITAE_REQUIRE_REVIEW"] = "1"
    session = requests.Session()
    cursor = DurableRunCursor(RUNNER_ID, session=session, local_path=args.cursor_file)
    adapter = HiringRoomPsfAdapter(session=session, cursor=cursor)
    try:
        rows, lineage, metrics = adapter.run(max_details=args.max_details)
    except (UpstreamFailure, requests.RequestException, ValueError) as exc:
        error = exc.kind if isinstance(exc, UpstreamFailure) else type(exc).__name__
        try:
            current_cursor = cursor.load().payload()
        except Exception:
            current_cursor = Cursor().payload()
        print("CVITAE_INGESTION_SUMMARY=" + json.dumps({"found": 0, "valid": 0, "inserted": 0, "failed": 1,
            "technical_failure": True, "errors": [error]}, separators=(",", ":")))
        print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION,
            "extraction_metrics": {"health": {"status": "DEGRADED", "reason": error}, "error_kind": error,
                "latam_cursor": current_cursor}}, separators=(",", ":")))
        return 1

    summary = {"found": len(rows), "valid": len(rows), "unique": len(rows), "inserted": 0, "updated": 0,
        "unchanged": 0, "duplicates_in_run": metrics["duplicates"], "rejected": metrics["detail_incomplete_count"],
        "failed": metrics["detail_404_count"], "budget_skipped": 0, "technical_failure": False, "errors": []}
    if rows:
        from opportunity_sink import OpportunitySink
        from source_adapters import RunLineageWriter
        sink_summary = OpportunitySink().upsert(rows,
            adapter_version=ADAPTER_VERSION, cleaner_id="PsfHiringRoomCleaner:v1")
        summary.update(sink_summary.to_dict())
        lineage_summary = RunLineageWriter(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")).record(lineage)
        summary["scan_lineage"] = lineage_summary
        if (summary["scan_lineage"].get("lineage_evidence") or {}).get("status") != "PASS":
            summary["technical_failure"] = True
            summary.setdefault("errors", []).append("SOURCE_LINEAGE_OR_OBSERVATION_WRITE_INCOMPLETE")
    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary, ensure_ascii=False, separators=(",", ":")))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION, "extraction_metrics": metrics}, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
