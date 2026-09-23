"""Offline contract for source-aware enrichment selection and observations."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts")); sys.path.insert(0, str(ROOT / "scrapers"))
import run_opportunity_enrichment_batch as batch
from source_adapters import AdapterResult
from source_identity import IdentityResult

NOW = datetime(2026, 9, 13, tzinfo=timezone.utc)

def row(identifier: str, **values):
    base = {"id": identifier, "source": "unjobs", "updated_at": "2026-09-01T00:00:00+00:00", "organization": "UN Agency", "description": "", "location": "", "country_code": None, "onsite_country": None, "remote_scope": None, "source_url": None, "application_url": f"https://unjobs.org/vacancies/{identifier}", "verification_status": "verified", "catalog_eligible": False, "match_eligible": False, "deleted_at": None, "archived_at": None}
    return {**base, **values}

p0 = row("p0", match_eligible=True, country_code="WW")
p1 = row("p1", catalog_eligible=True)
p2 = row("p2", verification_status="in_review")
complete = row("complete", description="x" * 100, location="La Paz, Bolivia", country_code="BO", source_url="https://unjobs.org/vacancies/complete")
selected, summary, details = batch.select_candidates([p2, complete, p1, p0], 4, now=NOW)
assert [item["id"] for item in selected] == ["p0", "p1", "p2"]
assert details["p0"]["priority"] == "P0" and summary["p0"] == 1 and summary["p1"] == 1 and summary["p2"] == 1
assert summary["excluded"]["not_degraded"] == 1
assert batch.priority({**p1, "description": "x" * 100}) < batch.priority({**p2, "country_code": "WW", "source_url": None})

selected, summary, _ = batch.select_candidates([p0], 1, enrichments={"p0": NOW - timedelta(days=1)}, now=NOW)
assert not selected and summary["excluded"]["recent_enrichment"] == 1

removed = {"p0": {"identity_status": "REMOVED", "http_status": 410, "observed_at": (NOW - timedelta(days=1)).isoformat()}}
selected, summary, _ = batch.select_candidates([p0], 1, observations=removed, now=NOW)
assert not selected and summary["excluded"]["recent_removed"] == 1
old_removed = {"p0": {**removed["p0"], "observed_at": (NOW - timedelta(days=8)).isoformat()}}
assert batch.select_candidates([p0], 1, observations=old_removed, now=NOW)[0][0]["id"] == "p0"

network = {"p0": {"identity_status": "IDENTITY_CONFIRMED", "http_status": 0, "observed_at": (NOW - timedelta(minutes=10)).isoformat()}}
assert batch.select_candidates([p0], 1, observations=network, now=NOW)[1]["excluded"]["recent_network_failure"] == 1
network["p0"]["observed_at"] = (NOW - timedelta(hours=1)).isoformat()
assert batch.select_candidates([p0], 1, observations=network, now=NOW)[0][0]["id"] == "p0"

directed, _, directed_details = batch.select_candidates([p0], 1, opportunity_id="p0", enrichments={"p0": NOW}, observations=removed, now=NOW)
assert directed[0]["id"] == "p0" and directed_details["p0"]["priority"] == "DIRECTED"

identity = IdentityResult("IDENTITY_CONFIRMED", "native_id_exact", 1.0, "p0", "p0", p0["application_url"], p0["application_url"], "fixture")
network_result = AdapterResult(source="unjobs", adapter_version="fixture", source_url=p0["application_url"], source_status=0)
payload = batch.observation_payload(p0, network_result, identity)
assert payload["http_status"] == 0 and payload["identity_status"] == "IDENTITY_CONFIRMED"

migration = (ROOT / "supabase" / "migrations" / "202609130001_opportunity_source_observations.sql").read_text(encoding="utf-8").lower()
assert "create table if not exists public.opportunity_source_observations" in migration
assert "enable row level security" in migration and "grant select, insert on table public.opportunity_source_observations to service_role" in migration
assert "revoke all on table public.opportunity_source_observations from public, anon, authenticated, service_role" in migration
print("PASS source observation queue: priority, TTLs, directed diagnostics, status-0 and local append-only schema")
