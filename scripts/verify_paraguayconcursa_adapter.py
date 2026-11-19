"""Local fixture checks for the bounded Paraguay Concursa adapter contract."""
from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
import json
import os
import sys
import tempfile
from unittest.mock import patch
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from latam_source_runtime import Cursor, DurableRunCursor, RetryDeferred, UnexpectedMarkup, UpstreamFailure, fetch_response
from paraguayconcursa_mef_scraper import ADAPTER_VERSION, ParaguayConcursaAdapter, bounded_detail_budget, parse_detail, parse_listing_page
from opportunity_sink import OpportunitySink
from source_adapters import AdapterResult, factual_observation_candidate
from observation_writer import validate, write as write_observations
from source_registry_v2 import resolve_emitted_source, registry_snapshot


class FakeResponse:
    def __init__(self, status: int, body: str = "", headers: dict | None = None):
        self.status_code = status
        self.text = body
        self.content = body.encode("utf-8")
        self.headers = headers or {"Content-Type": "text/html; charset=utf-8"}


class FakeSession:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        value = self.outcomes.pop(0)
        if isinstance(value, BaseException):
            raise value
        return value


def listing_html(page: int, *, cards: tuple[tuple[str, str], ...] = (("4685", "Electricista IV"),), next_page: int | None = None) -> str:
    articles = "".join(
        f'''<article class="concurso-card"><h3 class="concurso-titulo">{title}</h3>
        <div class="concurso-id">CPI 06-2026</div><div>Institución:</div><div>ANDE</div>
        <a href="/publicaciones/info12559/{native_id}/">Ver proceso</a></article>'''
        for native_id, title in cards
    )
    paging = f'<a href="/?page={next_page}">Siguiente</a>' if next_page else f'<a href="/?page={page}">{page}</a>'
    return f'<html><body><h1>Paraguay Concursa</h1><p>Resultados 221 concursos encontrados</p>{articles}{paging}</body></html>'


def detail_html(*, period: str = "20/10/2026 08:00 – 26/10/2026 15:00", location: str | None = None, vacancies: str | None = None, application: bool = False) -> str:
    extra = f"<div>Ubicación:</div><div>{location}</div>" if location else ""
    extra += f"<div>Vacantes:</div><div>{vacancies}</div>" if vacancies else ""
    extra += '<a href="https://postulaciones.mef.gov.py/4685">Postular</a>' if application else ""
    return f'''<html><body><h1>ELECTRICISTA DE DISTRIBUCIÓN IV - BOQUERON</h1>
    <div>Institución:</div><div>ADMINISTRACION NACIONAL DE ELECTRICIDAD</div>
    <div>Periodo de Postulación</div><div>{period}</div>{extra}</body></html>'''


def run() -> None:
    assert bounded_detail_budget(20, 1) == 1
    assert bounded_detail_budget(1, 20) == 1
    assert bounded_detail_budget(99, 999) == 50

    first = parse_listing_page(listing_html(1, next_page=2), "https://paraguayconcursa.mef.gov.py/")
    second = parse_listing_page(listing_html(2, cards=(("4690", "Técnico de Obras"),), next_page=3), "https://paraguayconcursa.mef.gov.py/?page=2")
    assert len(first["items"]) == 1 and first["next_page"] == 2 and first["source_reported_total"] == 221
    assert len(second["items"]) == 1 and second["items"][0]["native_id"] == "4690" and second["next_page"] == 3
    assert parse_listing_page("<h1>Paraguay Concursa</h1><p>Sin resultados</p>", "https://paraguayconcursa.mef.gov.py/?page=99")["items"] == []
    try:
        parse_listing_page("<html><body>Acceso denegado</body></html>", "https://paraguayconcursa.mef.gov.py/")
        raise AssertionError("unexpected HTML must not become EOF")
    except UnexpectedMarkup:
        pass

    listing = first["items"][0]
    sample = parse_detail(detail_html(), listing, today=date(2026, 10, 14))
    assert sample["publication_status"] == "UPCOMING"
    assert sample["vacancy_count"] is None and sample["location"] is None
    assert sample["complete_for_sink"], "an individual official call remains ingestible with UNKNOWN vacancy count/location"
    assert sample["application_url"] == listing["detail_url"]
    assert sample["application_route_type"] == "OFFICIAL_CALL_DETAIL"
    assert "ADMINISTRACION NACIONAL DE ELECTRICIDAD" in sample["description"]
    missing_validity = parse_detail(detail_html(period="sin fecha publicada"), listing, today=date(2026, 10, 14))
    assert missing_validity["complete_for_sink"] and missing_validity["publication_status"] == "UNKNOWN"
    complete = parse_detail(detail_html(location="Boquerón, Paraguay", vacancies="2", application=True), listing, today=date(2026, 10, 22))
    assert complete["publication_status"] == "OPEN"
    assert complete["location"] == "Boquerón, Paraguay" and complete["vacancy_count"] == 2
    assert complete["application_url"] == "https://postulaciones.mef.gov.py/4685" and complete["complete_for_sink"]
    assert complete["deadline"].endswith("-03:00")
    deadline_today = detail_html(period="01/10/2026 08:00 – 14/10/2026 15:00")
    before_deadline = parse_detail(deadline_today, listing, now=datetime(2026, 10, 14, 14, tzinfo=ZoneInfo("America/Asuncion")))
    after_deadline = parse_detail(deadline_today, listing, now=datetime(2026, 10, 14, 16, tzinfo=ZoneInfo("America/Asuncion")))
    assert before_deadline["publication_status"] == "OPEN"
    assert after_deadline["publication_status"] == "CLOSED"
    closed = parse_detail(detail_html(period="01/10/2026 08:00 – 10/10/2026 15:00"), listing, today=date(2026, 10, 14))
    unknown = missing_validity
    assert closed["publication_status"] == "CLOSED" and unknown["publication_status"] == "UNKNOWN"

    delays = []
    session = FakeSession([FakeResponse(429, "busy", {"Retry-After": "1"}), FakeResponse(200, "<html>ok</html>")])
    response = fetch_response(session, "https://fixture.invalid", sleep=delays.append)
    assert response.status_code == 200 and delays == [1] and len(session.calls) == 2
    deferred = FakeSession([FakeResponse(429, "busy", {"Retry-After": "45"})])
    try:
        fetch_response(deferred, "https://fixture.invalid", sleep=lambda _: None)
        raise AssertionError("large Retry-After must defer instead of being shortened")
    except RetryDeferred as exc:
        assert exc.retry_after_seconds == 45
    retried_5xx = FakeSession([FakeResponse(503), FakeResponse(200, "ok")])
    assert fetch_response(retried_5xx, "https://fixture.invalid", sleep=lambda _: None).status_code == 200
    for response_value, expected in ((FakeResponse(404), "HTTP_404"), (FakeResponse(503), "HTTP_ERROR"), (requests.Timeout(), "TIMEOUT")):
        outcomes = [response_value] if not isinstance(response_value, BaseException) else [response_value]
        if expected == "HTTP_ERROR":
            outcomes = [response_value, response_value, response_value]
        if expected == "TIMEOUT":
            outcomes = [response_value, response_value, response_value]
        try:
            fetch_response(FakeSession(outcomes), "https://fixture.invalid", sleep=lambda _: None)
            raise AssertionError(f"{expected} must remain a transport outcome, never EOF")
        except UpstreamFailure as exc:
            assert exc.kind == expected

    with tempfile.TemporaryDirectory() as temp:
        path = str(Path(temp) / "cursor.json")
        cursor_store = DurableRunCursor("source_one", local_path=path, audit=True)
        cursor_store.save(Cursor(page=3, card_offset=2, continuation_pending=True, last_native_id="4685"))
        assert cursor_store.load().payload()["page"] == 3
        other_store = DurableRunCursor("source_two", local_path=str(Path(temp) / "other.json"), audit=True)
        assert other_store.load().page == 1

        page_one_session = FakeSession([
            FakeResponse(200, listing_html(1, next_page=2)),
            FakeResponse(200, detail_html()),
        ])
        continuation_path = str(Path(temp) / "paraguayconcursa-cursor.json")
        page_one_cursor = DurableRunCursor("paraguayconcursa_mef_scraper", session=page_one_session, local_path=continuation_path, audit=True)
        page_one_adapter = ParaguayConcursaAdapter(session=page_one_session, cursor=page_one_cursor, audit=True)
        page_one_rows, page_one_metrics = page_one_adapter.run(max_pages=1, max_details=5, today=date(2026, 10, 14))
        assert len(page_one_rows) == 1 and page_one_metrics["latam_cursor"]["page"] == 2
        assert page_one_metrics["latam_cursor"]["continuation_pending"] is True
        assert page_one_metrics["cursor_progress"]["advanced"] is True

        # A new process/session resumes the persisted cursor at page two after
        # interruption; it does not rescan page one or mistake the budget for EOF.
        page_two_session = FakeSession([
            FakeResponse(200, listing_html(2, cards=(("4690", "Técnico de Obras"),))),
            FakeResponse(200, detail_html(location="Boquerón, Paraguay", vacancies="1")),
        ])
        page_two_adapter = ParaguayConcursaAdapter(
            session=page_two_session,
            cursor=DurableRunCursor("paraguayconcursa_mef_scraper", session=page_two_session, local_path=continuation_path, audit=True),
            audit=True,
        )
        page_two_rows, page_two_metrics = page_two_adapter.run(max_pages=3, max_details=5, today=date(2026, 10, 14))
        assert len(page_two_rows) == 1 and page_two_rows[0]["native_id"] == "4690"
        assert len(page_two_session.calls) == 2, "resume uses only page two and its detail"
        assert page_two_metrics["eof"] and page_two_metrics["latam_cursor"]["continuation_pending"] is False
        assert page_two_metrics["cursor_progress"]["advanced"] is True

        complete_result = AdapterResult(
            source="paraguayconcursa_mef", adapter_version=ADAPTER_VERSION,
            source_url=complete["source_url"], canonical_url=complete["canonical_url"],
            apply_url=complete["application_url"], source_native_id=complete["native_id"],
            title=complete["title"], organization=complete["institution"], description=complete["description"],
            location=complete["location"], source_status=200, confidence=0.95,
            extracted_fields=["title", "institution", "vacancy_count", "location", "deadline", "application_url"],
            evidence={"vacancy_count": complete["vacancy_count"], "publication_status": complete["publication_status"]},
        )
        observation = factual_observation_candidate(complete_result, "fixture-opportunity-id", "fixture-run", "2026-10-14T12:00:00+00:00")
        assert observation is not None and observation.identity_status == "IDENTITY_CONFIRMED"
        validate(observation)
        assert write_observations([observation], base_url="https://fixture.invalid/rest/v1", headers={}, apply=False)["commit"] is False

        audit_path = str(Path(temp) / "sink-audit.json")
        sink_input = {
            "title": complete["title"], "organization": complete["institution"], "description": complete["description"],
            "location": complete["location"], "deadline": complete["deadline"], "application_url": complete["application_url"],
            "source_url": complete["source_url"], "original_source_url": complete["source_url"],
            "source": "paraguayconcursa_mef", "source_authority": "original", "original_source_verified": True,
            "country_code": "PY", "type": "job", "opportunity_kind": "concurso", "is_active": False,
            "verification_status": "in_review", "verification_reasons": ["SOURCE_REVIEW_REQUIRED"],
        }
        with patch.dict(os.environ, {"CVITAE_AUDIT_MODE": "1", "CVITAE_AUDIT_OUTPUT": audit_path, "CVITAE_REQUIRE_REVIEW": "1"}):
            sink_summary = OpportunitySink().upsert([sink_input], adapter_version=ADAPTER_VERSION, cleaner_id="ParaguayConcursaCleaner:v1")
        audit_payload = json.loads(Path(audit_path).read_text(encoding="utf-8"))
        assert sink_summary.found == 1 and sink_summary.valid == 1 and sink_summary.inserted == 0
        assert audit_payload["sample"][0]["source"] == "paraguayconcursa_mef"
        assert audit_payload["sample"][0]["verification_status"] == "in_review"
        assert audit_payload["sample"][0]["is_active"] is False

    assert resolve_emitted_source("paraguayconcursa_mef_scraper").source == "paraguayconcursa_mef"
    snapshot = registry_snapshot()
    source = next(row for row in snapshot["sources"] if row["canonical_source"] == "paraguayconcursa_mef")
    assert source["auto_enabled"] is False
    assert source["producer_execution"]["entrypoints"] == ["scrapers/paraguayconcursa_mef_scraper.py"]
    assert source["producer_execution"]["state"] == "EXECUTABLE_PRODUCER"
    print("verify_paraguayconcursa_adapter: PASS (fixture contract; no database writes)")


if __name__ == "__main__":
    run()
