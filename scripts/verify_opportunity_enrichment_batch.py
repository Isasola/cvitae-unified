from pathlib import Path
from unittest.mock import patch
import os
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts")); sys.path.insert(0, str(ROOT / "scrapers"))
import run_opportunity_enrichment_batch as batch
from source_adapters import AdapterResult, EnrichmentOutcome
from source_identity import confirm_identity, native_id, normalize_url

row = {"id":"fixture-1","source":"talentcom","updated_at":"2026-09-12T00:00:00+00:00","title":"Old title","organization":"No especificada","description":"","location":None,"country_code":None,"onsite_country":None,"remote":None,"remote_scope":None,"value":None,"currency":None,"published_at":None,"deadline":None,"application_url":"https://example.test/job","source_url":"https://example.test/job","verification_status":"in_review","embedding":None,"deleted_at":None,"archived_at":None}
result = AdapterResult(source="talentcom", adapter_version="talent:v2.0.0", source_url=row["source_url"], apply_url=row["application_url"], title="New title", organization="Acme", description="A complete and deterministic description that is safely longer than the quality threshold for automatic recommendation.", remote=True, remote_scope="UNKNOWN", source_status=200, extraction_method="fixture", recommendation="HUMAN_REVIEW", recommendation_reasons=["unknown_scope"])

assert batch.canonical_source("talent.com") == "talentcom" and batch.canonical_source("WWR") == "weworkremotely"
try: batch.canonical_source("nope"); raise AssertionError("unsupported source accepted")
except ValueError: pass
assert not batch.is_candidate({"deleted_at":"x","application_url":"https://x"})
assert batch.priority(row)[0] < batch.priority({**row,"description":"x" * 300,"organization":"Acme","country_code":"US","remote_scope":"REGIONAL","verification_status":"verified","source_url":"https://x"})[0]
assert normalize_url("HTTPS://Example.TEST/job/?utm_source=x&keep=1#part") == "https://example.test/job?keep=1"
assert native_id("talentcom", "https://www.talent.com/view?utm_source=x&id=600243372443443301") == "600243372443443301"
assert native_id("unjobs", "https://unjobs.org/vacancies/1784313712011/") == "1784313712011"
assert native_id("himalayas", "https://himalayas.app/companies/acme/jobs/role?gclid=x") == "role"
assert native_id("weworkremotely", "https://weworkremotely.com/remote-jobs/acme-role/") == "acme-role"
assert confirm_identity("talentcom", {**row, "application_url":"https://www.talent.com/view?id=7"}, AdapterResult(source="talentcom", adapter_version="v", source_url="https://www.talent.com/view?utm_source=x&id=7", source_native_id="7", source_status=200)).status == "IDENTITY_CONFIRMED"
assert confirm_identity("unjobs", {**row, "application_url":"https://unjobs.org/vacancies/7"}, AdapterResult(source="unjobs", adapter_version="v", source_url="https://unjobs.org/vacancies/7", source_status=410)).status == "REMOVED"
assert confirm_identity("wwr", {**row, "application_url":"https://weworkremotely.com/remote-jobs/acme-role"}, AdapterResult(source="wwr", adapter_version="v", source_url="https://weworkremotely.com/remote-jobs/acme-role", source_status=200, evidence={"detail_match":False})).status == "IDENTITY_MISMATCH"
unresolved = confirm_identity("himalayas", {**row, "application_url":"https://himalayas.app/companies/acme/jobs/old"}, AdapterResult(source="himalayas", adapter_version="v", source_url="https://himalayas.app/companies/acme/jobs/new", source_native_id="new", source_status=200))
assert unresolved.status == "IDENTITY_UNRESOLVED" and batch.changed_patch(result, row, unresolved) == {}

with patch.object(batch, "fetch_rows", return_value=[row]), patch.object(batch, "recent_enrichments", return_value={}), patch.object(batch, "recent_observations", return_value=({}, True)), patch.object(batch, "adapt", return_value=result), patch.object(batch, "AtomicEnricher", side_effect=AssertionError("dry-run must not instantiate RPC client")), patch.object(batch, "persist_observations", side_effect=AssertionError("dry-run must not persist observations")):
    output, metrics = batch.run("talentcom", 1, False)
assert output[0]["patch"]["description"] == {"description_length": len(result.description or "")} and metrics["enrichment"]["changed"] == 0
assert batch.changed_patch(result, row)["description"] == result.description
assert set(output[0]["patch"]).issubset({"title","organization","description","location","country_code","onsite_country","remote_scope","remote","value","currency","published_at","deadline","application_url","source_url"})

class FakeEnricher:
    calls = 0
    def __init__(self, *_): pass
    def enrich_existing(self, *_): self.__class__.calls += 1; return EnrichmentOutcome("changed", changed_fields=["description"])
os.environ["SUPABASE_URL"] = "https://fixture.supabase.co"; os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "fixture"
with patch.object(batch, "fetch_rows", return_value=[row]), patch.object(batch, "recent_enrichments", return_value={}), patch.object(batch, "recent_observations", return_value=({}, True)), patch.object(batch, "adapt", return_value=result), patch.object(batch, "AtomicEnricher", FakeEnricher), patch.object(batch, "persist_observations", return_value=1) as observed, patch.object(batch, "persist_run") as persisted:
    _, applied = batch.run("talentcom", 1, True)
assert FakeEnricher.calls == 1 and applied["enrichment"]["changed"] == 1 and persisted.called and observed.called
os.environ["SUPABASE_URL"] = "http://127.0.0.1:54321"
try: batch.assert_apply_target(); raise AssertionError("local apply target accepted")
except RuntimeError as exc: assert str(exc) == "apply_requires_nonlocal_supabase_target"
os.environ["SUPABASE_URL"] = "https://fixture.supabase.co"

noop = AdapterResult(source="talentcom", adapter_version="talent:v2.0.0", source_url=row["source_url"], apply_url=row["application_url"], title=row["title"], organization=row["organization"], description=row["description"], source_status=200, recommendation="HUMAN_REVIEW")
with patch.object(batch, "fetch_rows", return_value=[row]), patch.object(batch, "recent_enrichments", return_value={}), patch.object(batch, "recent_observations", return_value=({}, True)), patch.object(batch, "adapt", return_value=noop), patch.object(batch, "AtomicEnricher", side_effect=AssertionError("no-op must not call RPC")), patch.object(batch, "persist_observations", return_value=1), patch.object(batch, "persist_run"):
    _, idempotent = batch.run("talentcom", 1, True)
assert idempotent["enrichment"]["noop"] == 1
assert batch.MAX_LIMIT == 50
assert batch.health({"found":5,"detail_pages_attempted":5,"detail_pages_success":0,"parsed":0,"coverage":{}})[0] == "DEGRADED"
live = [AdapterResult(source="unjobs", adapter_version="fixture", source_url=f"https://unjobs.org/vacancies/{index}", source_status=200, title=f"Role {index}", organization="UN Agency", description="Complete detail", country_code="BO", onsite_country="BO", apply_url="https://apply.example") for index in range(3)]
removed = [AdapterResult(source="unjobs", adapter_version="fixture", source_url=f"https://unjobs.org/vacancies/{index}", source_status=410, title="Removed") for index in range(3, 5)]
plans = [(row, result, {}, confirm_identity("unjobs", {**row, "application_url": result.source_url}, result)) for result in live + removed]
metrics = batch.metrics_for(plans, 5)
assert metrics["live"] == 3 and metrics["removed_or_dead"] == 2 and metrics["dead_rate"] == .4
assert metrics["live_detail_attempted"] == 3 and metrics["live_detail_success"] == 3 and metrics["parsed_live"] == 3
assert metrics["coverage_live"] == {"description": 1.0, "organization": 1.0, "geo": 1.0, "apply_url": 1.0, "deadline": 0.0}
assert metrics["health"]["status"] == "WARNING" and metrics["health"]["reasons"] == ["dead_rate_high"]
parser_failure = [AdapterResult(source="unjobs", adapter_version="fixture", source_url="https://unjobs.org/vacancies/99", source_status=200, title=None)]
failed_metrics = batch.metrics_for([(row, parser_failure[0], {}, confirm_identity("unjobs", {**row, "application_url": parser_failure[0].source_url}, parser_failure[0]))], 1)
assert failed_metrics["health"]["status"] == "DEGRADED" and failed_metrics["health"]["reasons"] == ["detail_or_parse_failure"]
print("PASS enrichment batch: dry-run, aliases, prioritization, apply/RPC, no-op, limits and health")
