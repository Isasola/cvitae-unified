"""Offline contract tests for the review-gated PSF HiringRoom adapter."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from latam_source_runtime import Cursor, DurableRunCursor, RetryDeferred, UnexpectedMarkup, UpstreamFailure
from opportunity_sink import OpportunitySink
from observation_writer import validate, write as write_observations
from psf_hiringroom_scraper import (
    ADAPTER_VERSION, BASE_URL, LISTING_URL, RUNNER_ID, SOURCE_ID, HiringRoomPsfAdapter,
    _authorization_error, main, parse_detail, parse_listing_page, parse_relative_age,
)
from source_adapters import factual_observation_candidate
from source_registry_v2 import certification, registry_snapshot, resolve_emitted_source


FIXTURES = ROOT / "scripts/fixtures/psf_hiringroom"
LISTING_HTML = (FIXTURES / "listing.html").read_text(encoding="utf-8")
DETAIL_HTML = (FIXTURES / "detail.html").read_text(encoding="utf-8")
ID1 = "6ac7b54848d84e58dbd9fa7e"
ID2 = "6acfdd471c677c42c9133601"


class Response:
    def __init__(self, status: int, text: str = "", url: str = LISTING_URL, headers: dict | None = None):
        self.status_code = status
        self.text = text
        self.content = text.encode("utf-8")
        self.url = url
        self.headers = headers or {"Content-Type": "text/html; charset=utf-8"}


class Session:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(url)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class MemorySession:
    def __init__(self, store):
        self.store = store

    def post(self, url, **kwargs):
        for row in kwargs.get("json", []):
            self.store[row["application_url"]] = dict(row)
        return Response(201, "[]", url)


class MemorySink(OpportunitySink):
    """Exercise the canonical sink's idempotence without network or DB writes."""
    def __init__(self):
        super().__init__("https://sink.fixture", "fixture")
        self.store = {}
        self.session = MemorySession(self.store)

    def _existing_urls(self, urls, chunk_size=40):
        return {url: dict(self.store[url]) for url in urls if url in self.store}

    def _persist_ingestion_lineage(self, accepted, rejected, existing):
        self._lineage_pending_events = []

    def _flush_ingestion_lineage(self):
        return 0, 0


def _listing(*, total: int = 2, page_range: str = "1-2 de 2", next_page: int | None = None) -> str:
    html = LISTING_HTML.replace("1-2 de 2", page_range)
    if total != 2:
        html = html.replace("1-2 de 2", f"Ver {total} vacantes")
    if next_page:
        html = html.replace("</body>", f'<a href="/jobs?page={next_page}">Siguiente</a></body>')
    return html


def _page_two() -> str:
    return f'''<html><body><p>2-2 de 2 vacantes</p><div class="vacancyDataContainer">
    <a href="/jobs/get_vacancy/{ID2}"><h4 class="name__vacancy">Analista de Organización y Métodos</h4>
    <p><i class="hr-Location-pin"></i> Asunción, Paraguay</p><p class="vacancy-time">Hace 5 horas</p></a>
    </div></body></html>'''


def run() -> None:
    listing = parse_listing_page(LISTING_HTML)
    assert listing["reported_total"] == 2 and listing["eof"] is True
    assert len(listing["items"]) == 2 and listing["duplicates"] == 1
    assert all("candidates/new" not in item["detail_url"] for item in listing["items"])
    assert listing["items"][0]["native_id"] == ID1
    assert listing["items"][0]["location"] == "Asunción, Asuncion, Paraguay"
    assert listing["items"][0]["work_arrangement"] == "presencial"
    assert parse_relative_age("Nuevo Hace 6 días") == 6
    assert parse_relative_age("Hace 4 meses") == 120
    assert parse_relative_age("Publicado recientemente") is None

    detail = parse_detail(DETAIL_HTML, listing["items"][0]["detail_url"], listing["items"][0])
    assert detail["native_id"] == ID1 and detail["country_code"] == "PY"
    assert detail["location"] == "Asunción, Asuncion, Paraguay"
    assert detail["remote"] is False and detail["work_arrangement"] == "onsite"
    assert detail["application_url"] == detail["source_url"]
    assert detail["apply_url"].endswith(f"/{ID1}/candidates/new")
    assert detail["publication_status"] == "LISTED_ACTIVE_UNCONFIRMED"
    assert detail["age_days_estimate"] == 6

    generic_html = DETAIL_HTML.replace("<h2>Técnico de Seguridad y Salud Ocupacional</h2>", "<h2>Base general</h2>")
    try:
        parse_detail(generic_html, listing["items"][0]["detail_url"], listing["items"][0])
        raise AssertionError("generic intake page must not become a job detail")
    except UpstreamFailure as exc:
        assert exc.kind == "IDENTITY_MISMATCH"
    try:
        parse_listing_page("<html><body>Acceso denegado</body></html>")
        raise AssertionError("unexpected HTTP 200 body must not become EOF")
    except UnexpectedMarkup:
        pass

    page_one = parse_listing_page(_listing(page_range="1-1 de 2", next_page=2))
    assert page_one["next_page"] == 2 and page_one["eof"] is False
    page_two = parse_listing_page(_page_two(), f"{LISTING_URL}?page=2")
    assert page_two["reported_range_start"] == 2 and page_two["eof"] is True
    unlinked_remainder = parse_listing_page(_listing(page_range="1-2 de 3"))
    assert unlinked_remainder["eof"] is False and unlinked_remainder["next_page"] is None

    with tempfile.TemporaryDirectory() as temp:
        cursor_path = str(Path(temp) / "psf-cursor.json")
        first_session = Session([
            Response(200, LISTING_HTML),
            Response(200, DETAIL_HTML, f"{BASE_URL}/jobs/get_vacancy/{ID1}"),
        ])
        first_adapter = HiringRoomPsfAdapter(
            session=first_session,
            cursor=DurableRunCursor(RUNNER_ID, session=first_session, local_path=cursor_path, audit=True),
        )
        first_rows, first_lineage, first_metrics = first_adapter.run(max_details=1)
        assert len(first_rows) == 1 and len(first_lineage) == 1
        assert first_metrics["budget_exhausted"] is True and first_metrics["eof"] is False
        saved = json.loads(Path(cursor_path).read_text(encoding="utf-8"))
        assert saved["card_offset"] == 1 and saved["last_native_id"] == ID1

        second_session = Session([
            Response(200, LISTING_HTML),
            Response(200, DETAIL_HTML.replace(ID1, ID2).replace("Técnico de Seguridad y Salud Ocupacional", "Analista de Organización y Métodos"), f"{BASE_URL}/jobs/get_vacancy/{ID2}"),
        ])
        second_adapter = HiringRoomPsfAdapter(
            session=second_session,
            cursor=DurableRunCursor(RUNNER_ID, session=second_session, local_path=cursor_path, audit=True),
        )
        second_rows, second_lineage, second_metrics = second_adapter.run(max_details=1)
        assert len(second_rows) == 1 and second_lineage[0].source_native_id == ID2
        assert second_session.calls == [LISTING_URL, f"{BASE_URL}/jobs/get_vacancy/{ID2}"]
        assert second_metrics["eof"] is True and second_metrics["continuation_pending"] is False
        assert json.loads(Path(cursor_path).read_text(encoding="utf-8"))["card_offset"] == 0

        empty_session = Session([Response(200, "<html><body>No hay vacantes publicadas</body></html>")])
        empty_adapter = HiringRoomPsfAdapter(session=empty_session,
            cursor=DurableRunCursor(RUNNER_ID, session=empty_session, local_path=str(Path(temp) / "empty.json"), audit=True))
        empty_rows, _, empty_metrics = empty_adapter.run(max_details=1)
        assert empty_rows == [] and empty_metrics["found"] == 0 and empty_metrics["eof"] is True

        one_listing = f'''<html><body><p>1-1 de 1 vacantes</p><div class="vacancyDataContainer">
        <a href="/jobs/get_vacancy/{ID1}"><h4 class="name__vacancy">Técnico de Seguridad y Salud Ocupacional</h4>
        <p><i class="hr-Location-pin"></i> Asunción, Paraguay</p><p class="vacancy-time">Hace 6 días</p></a>
        </div></body></html>'''
        missing_session = Session([
            Response(200, one_listing), Response(404, "missing", f"{BASE_URL}/jobs/get_vacancy/{ID1}")
        ])
        missing_adapter = HiringRoomPsfAdapter(session=missing_session,
            cursor=DurableRunCursor(RUNNER_ID, session=missing_session, local_path=str(Path(temp) / "missing.json"), audit=True))
        missing_rows, _, missing_metrics = missing_adapter.run(max_details=1)
        assert missing_rows == [] and missing_metrics["detail_404_count"] == 1 and missing_metrics["eof"] is True

        deferred_session = Session([
            Response(200, LISTING_HTML), Response(429, "busy", headers={"Retry-After": "45"})
        ])
        deferred_path = str(Path(temp) / "deferred.json")
        deferred_adapter = HiringRoomPsfAdapter(session=deferred_session,
            cursor=DurableRunCursor(RUNNER_ID, session=deferred_session, local_path=deferred_path, audit=True))
        try:
            deferred_adapter.run(max_details=1)
            raise AssertionError("429 must not be interpreted as empty or EOF")
        except RetryDeferred:
            assert not Path(deferred_path).exists() or Cursor.from_payload(json.loads(Path(deferred_path).read_text())) == Cursor()

    with patch.dict(os.environ, {"CVITAE_PSF_HIRINGROOM_FEED_AUTHORIZED": "false"}), patch("requests.Session", side_effect=AssertionError("authorization gate must precede HTTP")), patch.object(sys, "argv", ["psf_hiringroom_scraper"]):
        assert main() == 2

    row = first_rows[0]
    assert row["is_active"] is False and row["verification_status"] == "in_review"
    assert row["verification_reasons"] == ["SOURCE_FEED_RIGHTS_REVIEW", "EXACT_PUBLICATION_DATE_UNVERIFIED", "DEADLINE_NOT_PUBLISHED"]
    assert row["source"] == SOURCE_ID and row["country_code"] == "PY"
    assert "eligible_countries" not in row, "job location must not fabricate candidate eligibility"
    observation = factual_observation_candidate(first_lineage[0], "fixture-opportunity-id", "fixture-run", "2026-10-14T12:00:00+00:00")
    assert observation is not None and observation.identity_status == "IDENTITY_CONFIRMED"
    validate(observation)
    assert write_observations([observation], base_url="https://fixture.invalid/rest/v1", headers={}, apply=False)["commit"] is False

    with tempfile.TemporaryDirectory() as audit_dir:
        audit_path = Path(audit_dir) / "sink-audit.json"
        with patch.dict(os.environ, {"CVITAE_AUDIT_MODE": "1", "CVITAE_AUDIT_OUTPUT": str(audit_path), "CVITAE_REQUIRE_REVIEW": "1"}):
            sink_summary = OpportunitySink().upsert([row], adapter_version=ADAPTER_VERSION, cleaner_id="PsfHiringRoomCleaner:v1")
        assert sink_summary.found == 1 and sink_summary.valid == 1 and sink_summary.inserted == 0
        audit = json.loads(audit_path.read_text(encoding="utf-8"))
        assert audit["sample"][0]["is_active"] is False and audit["sample"][0]["verification_status"] == "in_review"

    with patch.dict(os.environ, {"CVITAE_REQUIRE_REVIEW": "1", "CVITAE_AUDIT_MODE": "0"}):
        memory_sink = MemorySink()
        once = memory_sink.upsert([row], adapter_version=ADAPTER_VERSION, cleaner_id="PsfHiringRoomCleaner:v1")
        twice = memory_sink.upsert([row], adapter_version=ADAPTER_VERSION, cleaner_id="PsfHiringRoomCleaner:v1")
    assert once.inserted == 1 and once.updated == 0
    assert twice.unchanged == 1 and twice.inserted == 0 and twice.updated == 0

    assert resolve_emitted_source("psf_hiringroom_scraper").source == SOURCE_ID
    snapshot = registry_snapshot()
    source = next(item for item in snapshot["sources"] if item["canonical_source"] == SOURCE_ID)
    assert source["auto_enabled"] is False
    assert source["producer_execution"]["entrypoints"] == ["scrapers/psf_hiringroom_scraper.py"]
    assert certification(resolve_emitted_source(SOURCE_ID))["certified"] is False
    print("verify_psf_hiringroom_adapter: PASS fixtures, durable budget continuation, EOF/404/429, canonical sink idempotence; no PROD writes")


if __name__ == "__main__":
    run()
