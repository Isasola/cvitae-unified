"""Conservative, paginated adapter for Paraguay Concursa (official MEF portal)."""
from __future__ import annotations

import argparse
from datetime import date, datetime
import json
import os
import re
import sys
import unicodedata
from typing import Any
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

from latam_source_runtime import Cursor, DurableRunCursor, UnexpectedMarkup, UpstreamFailure, fetch_response

SOURCE_ID = "paraguayconcursa_mef"
RUNNER_ID = "paraguayconcursa_mef_scraper"
BASE_URL = "https://paraguayconcursa.mef.gov.py/"
ADAPTER_VERSION = "paraguayconcursa-mef:v1.0.0"
DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?")


def _text(node: Any) -> str:
    return " ".join(node.get_text(" ", strip=True).split()) if node else ""


def _fold(value: str) -> str:
    value = value.replace("\u2013", "-").replace("\u2014", "-")
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def _label_value(text: str, labels: tuple[str, ...]) -> str | None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    normalized_labels = {_fold(item).casefold() for item in labels}
    next_label = re.compile(r"(?i)^(institucion|cargo|vacantes?|cantidad de vacantes|numero de vacantes|ubicacion|lugar de trabajo|localidad|departamento|periodo de postulacion)\s*:")
    for index, line in enumerate(lines):
        label, sep, value = line.partition(":")
        if sep and _fold(label.strip()).casefold() in normalized_labels:
            if value.strip():
                return value.strip()
            if index + 1 < len(lines) and not next_label.match(_fold(lines[index + 1])):
                return lines[index + 1]
        if _fold(line.rstrip(":").strip()).casefold() in normalized_labels and index + 1 < len(lines):
            if not next_label.match(_fold(lines[index + 1])):
                return lines[index + 1]
    folded = _fold(" ".join(lines))
    for label in labels:
        match = re.search(
            rf"(?i)\b{re.escape(_fold(label))}\s*:\s*(.+?)(?=\s+(?:Institucion|Cargo|Vacantes?|Cantidad de vacantes|Numero de vacantes|Ubicacion|Lugar de trabajo|Localidad|Departamento|Periodo de postulacion)\s*:|$)",
            folded,
        )
        if match and match.group(1).strip():
            return match.group(1).strip()
    return None


class ParaguayConcursaCleaner:
    """Normalize source text without deriving missing geography or eligibility."""

    @staticmethod
    def clean(value: str | None, limit: int = 4000) -> str | None:
        if not value:
            return None
        normalized = " ".join(str(value).split())[:limit]
        return normalized or None


def _native_id(href: str) -> str | None:
    values = re.findall(r"/(\d+)/?", urlparse(href).path)
    return values[-1] if values else None


def _query_page(url: str, page: int) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    query["page"] = [str(page)]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


def _parse_result_total(text: str) -> int | None:
    match = re.search(r"(?i)resultados\s+(\d+)\s+concursos\s+encontrados", _fold(text))
    return int(match.group(1)) if match else None


def parse_listing_page(html: str, page_url: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("article.concurso-card")
    body_text = _text(soup)
    folded_body = _fold(body_text).casefold()
    if not cards and not any(phrase in folded_body for phrase in ("sin resultados", "no se encontraron concursos", "no hay concursos")):
        raise UnexpectedMarkup("listing_cards_missing_without_explicit_empty_state")

    items = []
    for card in cards:
        title = _text(card.select_one("h3.concurso-titulo"))
        anchor = next((item for item in card.select("a[href]")
                       if urlparse(urljoin(page_url, item.get("href", ""))).path.startswith("/publicaciones/info")), None)
        if not title or not anchor:
            raise UnexpectedMarkup("listing_card_missing_title_or_detail_link")
        detail_url = urljoin(page_url, anchor.get("href", ""))
        if urlparse(detail_url).netloc != "paraguayconcursa.mef.gov.py":
            raise UnexpectedMarkup("detail_link_left_official_host")
        items.append({
            "title": title,
            "institution": _label_value("\n".join(card.stripped_strings), ("Institucion",)),
            "native_id": _native_id(detail_url),
            "detail_url": detail_url,
            "source_url": detail_url,
            "card_text": "\n".join(card.stripped_strings),
        })

    current_qs = parse_qs(urlparse(page_url).query)
    current_page = int((current_qs.get("page") or ["1"])[0])
    page_numbers: list[int] = []
    for anchor in soup.select("a[href]"):
        href = urljoin(page_url, anchor.get("href", ""))
        if urlparse(href).netloc != "paraguayconcursa.mef.gov.py":
            continue
        page_numbers.extend(int(value) for value in parse_qs(urlparse(href).query).get("page", []) if value.isdigit())
    has_next_label = any(_fold(_text(anchor)).casefold() in {"siguiente", "next", ">", ">>"} for anchor in soup.select("a[href]"))
    max_page = max([current_page, *page_numbers])
    has_next = has_next_label or max_page > current_page
    return {
        "items": items,
        "current_page": current_page,
        "next_page": current_page + 1 if has_next else None,
        "page_count_observed": max_page,
        "source_reported_total": _parse_result_total(body_text),
    }


def _parse_period(text: str, today: date | None = None, now: datetime | None = None) -> dict[str, str | None]:
    timezone_py = ZoneInfo("America/Asuncion")
    if now is not None:
        local_now = now.astimezone(timezone_py)
    elif today is not None:
        local_now = datetime(today.year, today.month, today.day, 12, tzinfo=timezone_py)
    else:
        local_now = datetime.now(timezone_py)
    today = today or local_now.date()
    folded = _fold(text)
    match = re.search(
        r"(?i)periodo\s+de\s+postulacion\s*:?\s*[\s\S]{0,180}?" + DATE_RE.pattern +
        r"\s*(?:-|a)?\s*" + DATE_RE.pattern,
        folded,
    )
    if not match:
        return {"application_start": None, "deadline": None, "publication_status": "UNKNOWN"}

    def date_at(offset: int, *, deadline: bool = False) -> datetime:
        day, month, year, hour, minute = match.group(offset, offset + 1, offset + 2, offset + 3, offset + 4)
        default_hour = 23 if deadline else 0
        default_minute = 59 if deadline else 0
        return datetime(
            int(year), int(month), int(day),
            int(hour) if hour is not None else default_hour,
            int(minute) if minute is not None else default_minute,
            tzinfo=timezone_py,
        )

    try:
        start, end = date_at(1), date_at(6, deadline=True)
    except (TypeError, ValueError):
        return {"application_start": None, "deadline": None, "publication_status": "UNKNOWN"}
    status = "UPCOMING" if start > local_now else "CLOSED" if end < local_now else "OPEN"
    return {"application_start": start.isoformat(), "deadline": end.isoformat(), "publication_status": status}


def parse_detail(html: str, listing: dict[str, Any], *, today: date | None = None, now: datetime | None = None) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    text = "\n".join(soup.stripped_strings)
    folded_text = _fold(text).casefold()
    if not text or (not soup.select_one("h1, h2, h3, h4, h5") and "periodo de postulacion" not in folded_text):
        raise UnexpectedMarkup("detail_page_identity_missing")
    title = ParaguayConcursaCleaner.clean(_text(soup.select_one("h1, h2, h3, h4, h5")) or listing.get("title"), 240)
    institution = ParaguayConcursaCleaner.clean(_label_value(text, ("Institucion",)) or listing.get("institution"), 240)
    vacancy_text = _label_value(text, ("Vacantes", "Cantidad de vacantes", "Numero de vacantes"))
    vacancy_match = re.search(r"\d+", vacancy_text or "")
    vacancy_count = int(vacancy_match.group(0)) if vacancy_match else None
    location = ParaguayConcursaCleaner.clean(_label_value(text, ("Ubicacion", "Lugar de trabajo", "Localidad", "Departamento")), 240)
    application_anchor = next((anchor for anchor in soup.select("a[href]")
                               if re.search(r"(?i)\b(postular|iniciar postulacion|postulacion en linea|inscribirse)\b", _fold(_text(anchor)))), None)
    application_url = urljoin(listing["detail_url"], application_anchor.get("href", "")) if application_anchor else None
    period = _parse_period(text, today, now)
    # Preserve all visible announcement text; the factual fields below remain
    # independently nullable and UNKNOWN is never filled from the portal name.
    description = "\n".join(line for line in soup.stripped_strings if line)[:12000]
    native_id = listing.get("native_id")
    application_route_type = "APPLICATION" if application_url else "OFFICIAL_CALL_DETAIL"
    application_url = application_url or listing["detail_url"]
    return {
        **listing,
        "title": title,
        "institution": institution,
        "vacancy_count": vacancy_count,
        "location": location,
        **period,
        "description": description,
        "application_url": application_url,
        # An individual official call is still a valid source record when city,
        # vacancy count, or validity dates are absent. Their UNKNOWN state is
        # retained and the ingestion starts in review; it cannot become READY.
        "complete_for_sink": bool(title and native_id and listing.get("detail_url")),
        "source_url": listing["source_url"],
        "canonical_url": listing["detail_url"],
        "application_route_type": application_route_type,
    }


def bounded_detail_budget(requested: int, control_budget: int | str) -> int:
    """A source control can lower, but never exceed, the adapter detail cap."""
    return max(1, min(50, int(requested), int(control_budget)))


class ParaguayConcursaAdapter:
    def __init__(self, *, session: requests.Session | None = None, cursor: DurableRunCursor | None = None, audit: bool = False):
        self.session = session or requests.Session()
        self.cursor = cursor or DurableRunCursor(RUNNER_ID, session=self.session, audit=audit)
        self.audit = audit

    def fetch(self, url: str) -> str:
        response = fetch_response(self.session, url)
        if "text/html" not in response.headers.get("Content-Type", "text/html").casefold():
            raise UnexpectedMarkup("response_not_html")
        body = response.text
        if "\ufffd" in body:
            try:
                body = response.content.decode(response.apparent_encoding or "utf-8", errors="strict")
            except (LookupError, UnicodeDecodeError):
                raise UnexpectedMarkup("response_character_encoding_invalid")
        return body

    def run(self, *, max_pages: int, max_details: int, today: date | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        cursor = self.cursor.load()
        cursor_before = cursor.payload()
        cursor.continuation_pending = True
        items: list[dict[str, Any]] = []
        seen_native: set[str] = set()
        pages_fetched = details_fetched = detail_attempted = detail_http_success = listing_fetches = incomplete = duplicate_count = failed_details = parse_failures = 0
        total_seen: int | None = None
        page_count_seen = 0
        eof = False

        while pages_fetched < max_pages and details_fetched < max_details:
            page_url = _query_page(BASE_URL, cursor.page)
            page = parse_listing_page(self.fetch(page_url), page_url)
            pages_fetched += 1
            total_seen = page["source_reported_total"] or total_seen
            page_count_seen = max(page_count_seen, page["page_count_observed"])
            if not page["items"]:
                if page["next_page"]:
                    raise UnexpectedMarkup("empty_listing_page_has_next_page")
                eof = True
                cursor = Cursor()
                break

            start = cursor.card_offset if cursor.page == page["current_page"] else 0
            if start > len(page["items"]):
                raise UnexpectedMarkup("cursor_card_offset_exceeds_page_size")
            listing_fetches += len(page["items"]) - start
            for index in range(start, len(page["items"])):
                listing = page["items"][index]
                native_id = listing.get("native_id")
                cursor.page = page["current_page"]
                cursor.card_offset = index
                cursor.last_native_id = native_id
                cursor.continuation_pending = True
                if native_id and native_id in seen_native:
                    duplicate_count += 1
                    cursor.card_offset = index + 1
                    self.cursor.save(cursor, metrics={"duplicate_count": duplicate_count})
                    continue
                if native_id:
                    seen_native.add(native_id)
                if details_fetched >= max_details:
                    break
                detail_attempted += 1
                try:
                    detail_html = self.fetch(listing["detail_url"])
                    detail_http_success += 1
                except UpstreamFailure as exc:
                    if exc.kind == "HTTP_404":
                        failed_details += 1
                        cursor.card_offset = index + 1
                        self.cursor.save(cursor, metrics={"detail_404_count": failed_details})
                        continue
                    raise
                try:
                    detail = parse_detail(detail_html, listing, today=today)
                except UnexpectedMarkup:
                    # Isolate a malformed individual detail, retain the error
                    # count with its durable cursor, and keep scanning later
                    # announcements. Listing-page contract failures still stop.
                    parse_failures += 1
                    cursor.card_offset = index + 1
                    self.cursor.save(cursor, metrics={"detail_parse_failure_count": parse_failures, "last_parse_failed_native_id": native_id})
                    continue
                details_fetched += 1
                if detail["complete_for_sink"]:
                    items.append(detail)
                else:
                    incomplete += 1
                cursor.card_offset = index + 1
                self.cursor.save(cursor, metrics={"detail_incomplete_count": incomplete, "detail_404_count": failed_details, "last_native_id": native_id})

            if cursor.card_offset < len(page["items"]):
                cursor.continuation_pending = True
                break
            if page["next_page"]:
                cursor.page = page["next_page"]
                cursor.card_offset = 0
                cursor.continuation_pending = True
                self.cursor.save(cursor)
            else:
                eof = True
                cursor = Cursor()
                break

        self.cursor.save(cursor)
        metrics = {
            "found": listing_fetches,
            "complete_details": len(items),
            "incomplete_details": incomplete,
            "detail_attempted": detail_attempted,
            "detail_http_success": detail_http_success,
            "detail_parse_failure_count": parse_failures,
            "detail_404_count": failed_details,
            "duplicates": duplicate_count,
            "pages_fetched": pages_fetched,
            "details_fetched": details_fetched,
            "source_reported_total": total_seen,
            "page_count_observed": page_count_seen,
            "eof": eof,
            "cursor_progress": {
                "before_page": cursor_before["page"],
                "before_card_offset": cursor_before["card_offset"],
                "after_page": cursor.page,
                "after_card_offset": cursor.card_offset,
                "advanced": cursor.payload() != cursor_before or details_fetched > 0,
            },
            "health": {"status": "DEGRADED" if parse_failures else "OK", "reason": "INDIVIDUAL_DETAIL_PARSE_FAILURE" if parse_failures else None, "source": SOURCE_ID},
            "latam_cursor": cursor.payload(),
        }
        return items, metrics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit", action="store_true", help="Fetch and parse only; no database or opportunity writes")
    parser.add_argument("--max-pages", type=int, default=int(os.getenv("CVITAE_LATAM_MAX_PAGES", "3")))
    parser.add_argument("--max-details", type=int, default=int(os.getenv("CVITAE_LATAM_MAX_DETAILS", "20")))
    parser.add_argument("--cursor-file", help="Local cursor file for fixture/audit tests only")
    args = parser.parse_args()
    audit = args.audit or os.getenv("CVITAE_AUDIT_MODE", "0") == "1"
    if not audit and not os.getenv("CVITAE_SCRAPER_RUN_DB_ID"):
        print("PRODUCTION_RUN_ROW_REQUIRED_FOR_DURABLE_CURSOR", file=sys.stderr)
        return 2
    session = requests.Session()
    cursor = DurableRunCursor(RUNNER_ID, session=session, local_path=args.cursor_file, audit=audit)
    adapter = ParaguayConcursaAdapter(session=session, cursor=cursor, audit=audit)
    try:
        configured_budget = os.getenv("CVITAE_MAX_ITEMS", os.getenv("CVITAE_LATAM_MAX_DETAILS", "20"))
        rows, metrics = adapter.run(
            max_pages=max(1, min(args.max_pages, 3)),
            max_details=bounded_detail_budget(args.max_details, configured_budget),
        )
    except (UpstreamFailure, requests.RequestException, ValueError) as exc:
        kind = exc.kind if isinstance(exc, UpstreamFailure) else type(exc).__name__
        try:
            current_cursor = cursor.load().payload()
        except Exception:
            current_cursor = Cursor().payload()
        print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION, "extraction_metrics": {"health": {"status": "DEGRADED", "reason": kind}, "error_kind": kind, "latam_cursor": current_cursor}}, ensure_ascii=False, separators=(",", ":")))
        print(f"PARAGUAYCONCURSA_SOURCE_FAILURE={kind}", file=sys.stderr)
        return 1

    summary = {"found": metrics["found"], "valid": len(rows), "unique": len(rows), "inserted": 0, "updated": 0,
               "unchanged": 0, "duplicates_in_run": metrics["duplicates"], "rejected": metrics["incomplete_details"],
               "failed": metrics["detail_404_count"], "budget_skipped": 0, "technical_failure": False, "errors": []}
    if not audit and rows:
        from opportunity_sink import OpportunitySink
        from source_adapters import AdapterResult, RunLineageWriter
        opportunities = []
        lineage_details = []
        for row in rows:
            country_code = "PY" if row.get("location") and re.search(r"(?i)\bparaguay\b", row["location"]) else None
            reasons = [f"PUBLICATION_STATUS_{row['publication_status']}", "SOURCE_REVIEW_REQUIRED"]
            if not row.get("location"):
                reasons.append("LOCATION_UNKNOWN")
            if row.get("vacancy_count") is None:
                reasons.append("VACANCY_COUNT_UNKNOWN")
            if row.get("publication_status") == "UNKNOWN":
                reasons.append("VALIDITY_UNKNOWN")
            tags = ["paraguayconcursa", f"estado-{row['publication_status'].casefold()}"]
            if row.get("vacancy_count") is not None:
                tags.append(f"vacantes-{row['vacancy_count']}")
            opportunities.append({
                "title": row["title"], "organization": row["institution"], "description": row["description"],
                "location": row["location"], "deadline": row["deadline"], "application_url": row["application_url"],
                "source_url": row["source_url"], "original_source_url": row["source_url"], "source": SOURCE_ID,
                "source_authority": "original", "original_source_verified": True,
                "recruiter_vacancy_id": f"{SOURCE_ID}:{row['native_id']}",
                "country_code": country_code,
                "type": "job", "opportunity_kind": "concurso",
                "tags": tags,
                "is_active": False, "verification_status": "in_review",
                "verification_reasons": reasons,
            })
            lineage_details.append(AdapterResult(
                source=SOURCE_ID, adapter_version=ADAPTER_VERSION, source_url=row["source_url"],
                source_native_id=row["native_id"], canonical_url=row["canonical_url"], apply_url=row["application_url"],
                title=row["title"], organization=row["institution"], description=row["description"],
                location=row["location"], country_code=country_code, deadline=row["deadline"],
                extracted_fields=["title", "source_native_id", "application_url"]
                    + (["institution"] if row.get("institution") else [])
                    + (["vacancy_count"] if row.get("vacancy_count") is not None else [])
                    + (["location"] if row.get("location") else [])
                    + (["deadline"] if row.get("deadline") else []),
                source_status=200, confidence=0.95,
                evidence={"vacancy_count": row.get("vacancy_count"), "vacancy_count_state": "FACT" if row.get("vacancy_count") is not None else "UNKNOWN",
                    "job_location": row.get("location"), "job_location_state": "FACT" if row.get("location") else "UNKNOWN",
                    "publication_status": row["publication_status"], "source_native_id": row["native_id"], "application_route_type": row["application_route_type"]},
                recommendation="HUMAN_REVIEW", recommendation_reasons=reasons,
            ))
        sink_summary = OpportunitySink().upsert(opportunities, adapter_version=ADAPTER_VERSION, cleaner_id="ParaguayConcursaCleaner:v1")
        summary.update(sink_summary.to_dict())
        lineage = RunLineageWriter(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")).record(lineage_details)
        summary["scan_lineage"] = RunLineageWriter.lineage_summary(lineage)
        if summary["scan_lineage"].get("lineage_status") != "PASS":
            summary["technical_failure"] = True
            summary.setdefault("errors", []).append("SOURCE_LINEAGE_OR_OBSERVATION_WRITE_INCOMPLETE")

    print("CVITAE_INGESTION_SUMMARY=" + json.dumps(summary, ensure_ascii=False, separators=(",", ":")))
    print("CVITAE_ADAPTER_METRICS=" + json.dumps({"adapter_version": ADAPTER_VERSION, "extraction_metrics": metrics}, ensure_ascii=False, separators=(",", ":")))
    print("PARAGUAYCONCURSA_EVIDENCE=" + json.dumps({"country": "PY", "source": SOURCE_ID, **metrics}, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
