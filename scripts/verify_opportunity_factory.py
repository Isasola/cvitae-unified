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
from scripts.opportunity_factory import MODEL_ID, embedding_text, seal


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
assert ready_status == "ready" and set(ready_stamps.values()) == {"pass"}
assert MODEL_ID == "Supabase/gte-small"
assert "Backend Engineer" in embedding_text(first)

review_status, _, _ = seal({**first, "country_code": None, "location": None, "eligible_countries": [], "eligible_regions": [], "remote": False}, now)
assert review_status == "review"
blocked_status, _, _ = seal({**first, "application_url": "http://unsafe.example.org/job"}, now)
assert blocked_status == "blocked"


class Response:
    status_code = 201
    text = ""


class Session:
    def __init__(self) -> None:
        self.posts: list[list[dict[str, Any]]] = []

    def post(self, _url: str, **kwargs: Any) -> Response:
        self.posts.append(kwargs["json"])
        return Response()


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
assert unchanged_summary.unchanged == 1 and not unchanged_session.posts

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

workflow = (ROOT / ".github/workflows/refresh_embeddings.yml").read_text(encoding="utf-8")
migration = (ROOT / "supabase/migrations/202609100001_admin_atomic_factory_foundation.sql").read_text(encoding="utf-8")
assert "scripts/opportunity_factory.py" in workflow and "actions/cache@v4" in workflow
assert "check_opportunity_factory_queue.py" in workflow and "steps.queue.outputs.pending == 'true'" in workflow
assert "functions/v1/embed-opportunities" not in workflow and "curl" not in workflow
assert "workflow_run.conclusion == 'success'" in workflow
assert "opportunity_factory_commit_atomic" in migration and "for update" in migration.casefold()
assert "revoke all on table public.opportunity_factory_snapshots from anon, authenticated" in migration.casefold()

print("PASS verify_opportunity_factory: stable fingerprints, delta invalidation, seals, safe scraper updates, local cached workflow, atomic private commit")
