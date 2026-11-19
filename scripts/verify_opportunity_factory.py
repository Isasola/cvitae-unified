"""Fast safety checks for the incremental opportunity factory."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scrapers.opportunity_sink import OpportunitySink, normalize_opportunity
from scripts.opportunity_factory import MODEL_ID, FactoryClient, embedding_text, lane_quotas, seal, should_generate_embedding, should_generate_embedding_in_run, structural_lane_minimums


BASE: dict[str, Any] = {
    "title": "Backend Engineer",
    "organization": "CVitae Fixture",
    "description": "Python SQL APIs cloud testing observability and distributed systems. " * 3,
    "application_url": "https://jobs.example.org/backend-1",
    "source": "official_fixture",
    "source_authority": "original",
    "original_source_verified": True,
    "country_code": "PY",
    "location": "Asuncion, Paraguay",
    "opportunity_type": "job",
    "opportunity_kind": "empleo",
    "tags": ["Python", "SQL"],
}


def normalized(raw: dict[str, Any]) -> dict[str, Any]:
    item, error = normalize_opportunity(raw)
    assert error is None and item is not None, error
    return item


first = normalized(BASE)
same = normalized({**BASE, "title": "  Backend   Engineer  ", "tags": ["SQL", "Python", "SQL"]})
assert first["content_fingerprint"] == same["content_fingerprint"]
assert first["semantic_fingerprint"] == same["semantic_fingerprint"]
assert first["factory_status"] == "pending"

deadline_change = normalized({**BASE, "deadline": "2027-01-01T00:00:00Z"})
assert deadline_change["content_fingerprint"] != first["content_fingerprint"]
assert deadline_change["semantic_fingerprint"] == first["semantic_fingerprint"]

description_change = normalized({**BASE, "description": BASE["description"] + " Kubernetes"})
assert description_change["semantic_fingerprint"] != first["semantic_fingerprint"]

now = datetime(2026, 9, 10, tzinfo=timezone.utc)
ready_status, ready_stamps, _ = seal(first, now)
assert ready_status == "review" and ready_stamps["job_geo"] == "pass" and ready_stamps["work_arrangement"] == "review" and ready_stamps["geo_decision"] == "review"
onsite_status, onsite_stamps, _ = seal({**first, "remote_scope": "ONSITE"}, now)
assert onsite_status == "ready" and onsite_stamps["geo_decision"] == "pass"
assert MODEL_ID == "Supabase/gte-small"
assert "Backend Engineer" in embedding_text(first)
assert not should_generate_embedding({**first, "match_eligible": False}, "ready", dry_run=False)
assert not should_generate_embedding({**first, "match_eligible": True}, "ready", dry_run=True)
assert should_generate_embedding({**first, "match_eligible": True}, "ready", dry_run=False)
assert not should_generate_embedding_in_run({**first, "id": "structural", "match_eligible": True}, "ready", dry_run=False, embedding_lane_ids=set())
assert should_generate_embedding_in_run({**first, "id": "embed", "match_eligible": True}, "ready", dry_run=False, embedding_lane_ids={"embed"})
assert structural_lane_minimums(100) == {"fresh": 25, "backlog": 25, "embedding": 0}
assert lane_quotas(50) == {"fresh": 20, "backlog": 20, "embedding": 10}

# Exact sealing is intentionally independent from matching; it must not create
# a vector merely because a structurally-ready hidden row is sealed.
assert not should_generate_embedding({**first, "match_eligible": False}, "ready", dry_run=False)

review_status, _, _ = seal({**first, "country_code": None, "location": None, "eligible_countries": [], "eligible_regions": [], "remote": False}, now)
assert review_status == "review"
# Candidate scope and remote modality are not physical workplace geography.
remote_only_status, remote_only_stamps, _ = seal({**first, "country_code": None, "location": "Remote", "onsite_country": None, "eligible_countries": ["US"], "remote": True}, now)
assert remote_only_status == "ready" and remote_only_stamps["job_geo"] == "review" and remote_only_stamps["geo_decision"] == "pass"
blocked_status, _, _ = seal({**first, "application_url": "http://unsafe.example.org/job"}, now)
assert blocked_status == "blocked"


class Response:
    status_code = 201
    text = ""
    def raise_for_status(self) -> None:
        return None


class Session:
    def __init__(self) -> None:
        self.posts: list[list[dict[str, Any]]] = []

    def post(self, _url: str, **kwargs: Any) -> Response:
        self.posts.append(kwargs["json"])
        return Response()

class LineageSession(Session):
    def __init__(self) -> None:
        super().__init__()
        self.get_calls = 0
    def get(self, _url: str, **kwargs: Any) -> Response:
        self.get_calls += 1
        response = Response()
        response.json = lambda: [] if self.get_calls == 1 else [{"id": "opportunity-1", "application_url": BASE["application_url"], "source": "unjobs"}]
        return response


def sink_with_existing(existing: dict[str, Any]) -> tuple[OpportunitySink, Session]:
    sink = OpportunitySink("https://fixture.supabase.co", "fixture-key")
    session = Session()
    sink.session = session  # type: ignore[assignment]
    sink._existing_urls = lambda _urls: {BASE["application_url"]: existing}  # type: ignore[method-assign]
    return sink, session


os.environ.pop("CVITAE_AUDIT_MODE", None)
os.environ["CVITAE_MAX_ITEMS"] = "1000"

unchanged_sink, unchanged_session = sink_with_existing({
    "application_url": BASE["application_url"], "slug": first["slug"],
    "content_fingerprint": first["content_fingerprint"], "verification_status": "verified",
})
unchanged_summary = unchanged_sink.upsert([BASE])
assert unchanged_summary.unchanged == 1 and len(unchanged_session.posts) == 1
assert unchanged_session.posts[0][0]["outcome"] == "UNCHANGED"

changed_sink, changed_session = sink_with_existing({
    "application_url": BASE["application_url"], "slug": first["slug"],
    "content_fingerprint": first["content_fingerprint"], "verification_status": "verified",
    "is_active": True, "catalog_eligible": True, "match_eligible": True,
    "alerts_eligible": True, "seo_eligible": True,
})
changed_summary = changed_sink.upsert([{**BASE, "description": BASE["description"] + " changed"}])
changed_row = changed_session.posts[0][0]
assert changed_summary.updated == 1
assert changed_row["verification_status"] == "in_review" and changed_row["is_active"] is False
assert all(changed_row[key] is False for key in ("catalog_eligible", "match_eligible", "alerts_eligible", "seo_eligible"))

bootstrap_sink, bootstrap_session = sink_with_existing({
    "application_url": BASE["application_url"], "slug": first["slug"],
    "content_fingerprint": None, "verification_status": "verified", "is_active": True,
    "catalog_eligible": True, "match_eligible": True, "alerts_eligible": False, "seo_eligible": True,
})
bootstrap_summary = bootstrap_sink.upsert([BASE])
bootstrap_row = bootstrap_session.posts[0][0]
assert bootstrap_summary.updated == 1 and bootstrap_row["verification_status"] == "verified"
assert bootstrap_row["is_active"] is True and bootstrap_row["alerts_eligible"] is False

# A successful insert leaves durable producer/run lineage, never a fabricated
# HTTP/identity observation.
lineage_sink = OpportunitySink("https://fixture.supabase.co", "fixture-key")
lineage_session = LineageSession()
lineage_sink.session = lineage_session  # type: ignore[assignment]
from unittest.mock import patch
with patch.dict(os.environ, {
    "CVITAE_SCRAPER_ID": "unjobs_scraper", "CVITAE_SCRAPER_RUN_ID": "run-fixture",
    "CVITAE_SCRAPER_RUN_DB_ID": "00000000-0000-0000-0000-000000000001",
}):
    lineage_summary = lineage_sink.upsert([{**BASE, "source": "unjobs"}])
assert lineage_summary.inserted == 1 and lineage_summary.lineage_written == 1
lineage_event = lineage_session.posts[-1][0]
assert lineage_event["opportunity_id"] == "opportunity-1"
assert lineage_event["canonical_source"] == "unjobs" and lineage_event["producer_id"] == "unjobs_scraper"
assert lineage_event["run_id"] == "run-fixture" and lineage_event["trace_state"] == "TRACED", lineage_event
assert lineage_event["evidence"]["is_source_observation"] is False

unattributed_sink = OpportunitySink("https://fixture.supabase.co", "fixture-key")
unattributed_session = LineageSession()
unattributed_sink.session = unattributed_session  # type: ignore[assignment]
with patch.dict(os.environ, {"CVITAE_SCRAPER_ID": "", "CVITAE_SCRAPER_RUN_ID": "", "CVITAE_SCRAPER_RUN_DB_ID": ""}):
    unattributed_sink.upsert([{**BASE, "source": "unjobs"}])
unattributed_event = unattributed_session.posts[-1][0]
assert unattributed_event["opportunity_id"] == "opportunity-1"
assert unattributed_event["trace_state"] == "INCOMPLETE"
assert "SCRAPER_IDENTITY_NOT_SUPPLIED" in unattributed_event["trace_reason"] or "SCRAPER_RUN_ID_NOT_SUPPLIED" in unattributed_event["trace_reason"]
assert unattributed_event["reason"] is None, "trace incompleteness is separate from business outcome reason"

workflow = (ROOT / ".github/workflows/refresh_embeddings.yml").read_text(encoding="utf-8")
migration = (ROOT / "supabase/migrations/202609100001_admin_atomic_factory_foundation.sql").read_text(encoding="utf-8")
queue_preflight = (ROOT / "scripts/check_opportunity_factory_queue.py").read_text(encoding="utf-8")
assert "scripts/opportunity_factory.py" in workflow and "actions/cache@v4" in workflow
assert "check_opportunity_factory_queue.py" in workflow and "steps.queue.outputs.pending == 'true'" in workflow
assert "functions/v1/embed-opportunities" not in workflow and "curl" not in workflow
assert "workflow_run.conclusion == 'success'" in workflow
assert "opportunity_factory_commit_atomic" in migration and "for update" in migration.casefold()
assert "revoke all on table public.opportunity_factory_snapshots from anon, authenticated" in migration.casefold()
assert "structural_fresh_pending" in queue_preflight and "embedding_pending" in queue_preflight
assert "count=exact" in queue_preflight and "unknown" in queue_preflight
assert "FACTORY_STRUCTURAL_LIMIT" in workflow and "FACTORY_EMBEDDING_LIMIT" in workflow
assert "cron: '0 * * * *'" in workflow and "default: '250'" in workflow

print("PASS verify_opportunity_factory: stable fingerprints, delta invalidation, seals, safe scraper updates, local cached workflow, atomic private commit")
