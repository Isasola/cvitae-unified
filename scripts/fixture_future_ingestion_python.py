"""In-memory future-row transport fixture used by the TS E2E verifier.

It deliberately exercises OpportunitySink and FactoryClient methods; only the
Supabase HTTP transport is replaced with an in-memory response boundary.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scrapers"))

from scrapers.opportunity_sink import OpportunitySink
from scripts.opportunity_factory import FactoryClient, seal, should_generate_embedding
from scrapers.source_adapters import RunLineageWriter
from himalayas_scraper import adapt_himalayas_job


class Response:
    status_code = 201
    text = ""

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return [{"id": "future-himalayas-factual"}]


class SinkSession:
    def __init__(self) -> None:
        self.posts: list[list[dict[str, Any]]] = []

    def post(self, _url: str, **kwargs: Any) -> Response:
        self.posts.append(kwargs["json"])
        return Response()


class FactorySession:
    def __init__(self, row: dict[str, Any]) -> None:
        self.row = row
        self.posts: list[dict[str, Any]] = []

    def get(self, _url: str, **_kwargs: Any):
        row = self.row
        return type("GetResponse", (), {"raise_for_status": lambda self: None, "json": lambda self: [row]})()

    def post(self, _url: str, **kwargs: Any) -> Response:
        self.posts.append(kwargs["json"])
        return Response()


def main() -> int:
    os.environ.pop("CVITAE_AUDIT_MODE", None)
    os.environ["CVITAE_MAX_ITEMS"] = "1000"
    raw = {
        "id": "future-oya-1",
        "title": "Programme Delivery Officer",
        "organization": "Fixture Development Organization",
        "description": "Coordinate programme delivery, stakeholder engagement, monitoring, reporting and grant requirements. " * 3,
        "application_url": "https://fixture.example/opportunities/programme-delivery-officer",
        "source_url": "https://fixture.example/source/programme-delivery-officer",
        "source": "computrabajo",
        "source_authority": "original",
        "original_source_verified": True,
        "is_active": True,
        "verification_status": "verified",
        "country_code": "PY",
        "location": "Asuncion, Paraguay",
        "eligible_countries": ["PY"],
        "eligible_regions": [],
        "remote": True,
        "remote_scope": "LATAM",
        "opportunity_type": "job",
        "opportunity_kind": "empleo",
        "tags": ["programme management", "monitoring", "stakeholder engagement"],
    }
    sink = OpportunitySink("https://fixture.supabase.co", "fixture-key")
    sink_session = SinkSession()
    sink.session = sink_session  # type: ignore[assignment]
    sink._existing_urls = lambda _urls: {}  # type: ignore[method-assign]
    # A duplicate in the incoming batch exercises the shared dedupe identity;
    # only one normalized row may cross the persistence transport.
    summary = sink.upsert([raw, dict(raw)])
    assert summary.found == 2 and summary.valid == 2 and summary.unique == 1
    assert summary.duplicates_in_run == 1 and summary.inserted == 1
    persisted = sink_session.posts[0][0]
    assert persisted["factory_status"] == "pending"
    assert persisted["content_fingerprint"] and persisted["semantic_fingerprint"]
    # Scrapers never submit consumer gates. The local-only DB trigger migration
    # derives them from the same intrinsic contract after this transport; the
    # test keeps the raw Sink payload intact to prove there is no scraper-side
    # promotion or reconciliation call.
    assert not any(key in persisted for key in ("catalog_eligible", "match_eligible", "alerts_eligible", "seo_eligible"))

    factory_session = FactorySession(persisted)
    factory = FactoryClient.__new__(FactoryClient)
    factory.base = "https://fixture.supabase.co/rest/v1"
    factory.headers = {"apikey": "fixture"}
    factory.session = factory_session
    selected = factory.candidates(1)
    assert selected == [persisted]
    status, stamps, evidence = seal(selected[0], datetime.now(timezone.utc))
    assert status == "ready"
    assert should_generate_embedding(selected[0], status, dry_run=False) is False
    snapshot = {
        "content_fingerprint": persisted["content_fingerprint"],
        "semantic_fingerprint": persisted["semantic_fingerprint"],
        "pipeline_version": "fixture", "rules_version": "fixture", "status": status,
        "stamps": stamps, "evidence": evidence, "embedding_model": None,
        "embedding_status": "pending", "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    factory.commit(selected[0], snapshot, None)
    assert factory_session.posts and factory_session.posts[0]["p_status"] == "ready"
    # Same Sink and factual adapter boundary; no source permission is an
    # ingestion kill. All transports below are in-memory, never HTTP requests.
    adapter = adapt_himalayas_job({"guid": "https://himalayas.app/jobs/fixture-factual-native-1",
        "applicationLink": raw["application_url"], "title": raw["title"], "companyName": raw["organization"],
        "description": raw["description"], "locationRestrictions": [{"alpha2":"PY", "name":"Paraguay"}]}, source_status=200)
    factual_row = {**raw, "id": "future-himalayas-factual", "source": adapter.source,
        "title": adapter.title, "organization": adapter.organization, "description": adapter.description,
        "location": adapter.location, "country_code": adapter.country_code,
        "remote_scope": adapter.remote_scope, "eligible_countries": adapter.eligible_countries,
        "eligible_regions": adapter.eligible_regions, "source_url": adapter.source_url, "application_url": adapter.apply_url}
    factual_sink = OpportunitySink("https://fixture.supabase.co", "fixture-key")
    factual_transport = SinkSession()
    factual_sink.session = factual_transport
    os.environ["CVITAE_SCRAPER_RUN_ID"] = "fixture-factual-run"
    os.environ["CVITAE_SCRAPER_ID"] = "fixture-factual-producer"
    os.environ["CVITAE_SOURCE_SCAN_REQUEST_ID"] = ""
    factual_sink._existing_urls = lambda urls: {url: {**factual_transport.posts[0][0], "id": "future-himalayas-factual"} for url in urls} if factual_transport.posts else {}
    factual_summary = factual_sink.upsert([factual_row], adapter_version=adapter.adapter_version, cleaner_id="source_adapters.clean")
    assert factual_summary.inserted == 1
    assert factual_summary.lineage_traced == 1 and factual_summary.lineage_failed == 0
    ingestion_event = factual_transport.posts[1][0]
    assert ingestion_event["trace_state"] == "TRACED" and ingestion_event["opportunity_id"] == "future-himalayas-factual"
    class LineageSession:
        def __init__(self): self.posts = []
        def get(self, *_args, **_kwargs): return Response()
        def post(self, url, **kwargs):
            self.posts.append((url, kwargs["json"]))
            return Response()
    transport = LineageSession()
    os.environ["CVITAE_SCRAPER_RUN_ID"] = "fixture-factual-run"
    os.environ["CVITAE_SOURCE_SCAN_REQUEST_ID"] = ""
    lineage = RunLineageWriter("https://fixture.supabase.co", "fixture-key", transport).record([adapter])
    observations = [payload[0] for url, payload in transport.posts if url.endswith("opportunity_source_observations")]
    assert lineage["items"][0]["observation"]["state"] == "PERSISTED" and len(observations) == 1
    print(json.dumps({
        "row": persisted,
        "active_flow": {"row": factual_transport.posts[0][0], "ingestion_event": ingestion_event, "observation": observations[0], "lineage": lineage["items"][0]},
        "sink": {"found": summary.found, "valid": summary.valid, "unique": summary.unique, "duplicates_in_run": summary.duplicates_in_run, "inserted": summary.inserted},
        "factory": {"selected": len(selected), "status": status, "embedding_state": "NOT_REQUIRED_PRE_TRIGGER", "commit_called": len(factory_session.posts), "db_policy_trigger_simulated": False},
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
