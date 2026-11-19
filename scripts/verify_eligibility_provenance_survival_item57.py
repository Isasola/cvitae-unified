"""Offline E2E contract: adapter eligibility evidence reaches existing audit stores."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))

from himalayas_scraper import adapt_himalayas_job
from source_adapters import AdapterResult, RunLineageWriter, eligibility_evidence_payload
from talentcom_scraper import _talent_eligibility
from unjobs_scraper import _eligibility
from weworkremotely_scraper import _eligibility_from_restriction
from run_opportunity_enrichment_batch import observation_payload


BASE = {
    "guid": "https://himalayas.app/companies/acme/jobs/provenance-role",
    "applicationLink": "https://acme.test/jobs/provenance-role",
    "title": "Provenance role", "companyName": "Acme",
    "description": "A complete source description " * 10,
}


def result_for(source: str, countries: list[str], regions: list[str], requirements: str, evidence: dict) -> AdapterResult:
    return AdapterResult(
        source=source, adapter_version="fixture", source_url=f"https://{source}.test/source",
        source_native_id="fixture-id", canonical_url=f"https://{source}.test/source",
        apply_url=f"https://{source}.test/apply", title="Role", organization="Acme",
        description="A factual role description with sufficient detail.", remote=True,
        remote_scope="WORLDWIDE" if "GLOBAL" in regions else "UNKNOWN",
        applicant_location_requirements=requirements, eligible_countries=countries,
        eligible_regions=regions, extraction_method="fixture", source_status=200,
        evidence=evidence,
    )


# Himalayas explicit applicant-wide source field -> normalized GLOBAL + durable evidence.
himalayas_world = adapt_himalayas_job({**BASE, "locationRestrictions": ["Worldwide"]})
world_evidence = eligibility_evidence_payload(himalayas_world)["eligibility_evidence_v1"]
assert himalayas_world.eligible_regions == ["GLOBAL"]
assert world_evidence["evidence_kind"] == "EXPLICIT_STRUCTURED"
assert world_evidence["source_field"] == "locationRestrictions"
assert world_evidence["provenance"] == "EXPLICIT_APPLICANT_WORLDWIDE"

# Empty source restrictions stay UNKNOWN and record absence; they never become GLOBAL.
himalayas_empty = adapt_himalayas_job({**BASE, "locationRestrictions": [], "timezoneRestrictions": []})
empty_evidence = eligibility_evidence_payload(himalayas_empty)["eligibility_evidence_v1"]
assert himalayas_empty.eligible_regions == [] and himalayas_empty.remote_scope == "UNKNOWN"
assert empty_evidence["evidence_kind"] == "NO_EXPLICIT_ELIGIBILITY_EVIDENCE"
assert empty_evidence["provenance"] == "NO_RESTRICTIONS_DECLARED"

# The source-specific adapters' normalized result reaches the same contract.
wwr_countries, wwr_regions, wwr_scope = _eligibility_from_restriction("Open worldwide")
wwr = result_for("weworkremotely", wwr_countries, wwr_regions, "Open worldwide", {"rss_requirements": "Open worldwide"})
assert wwr_regions == ["GLOBAL"] and eligibility_evidence_payload(wwr)["eligibility_evidence_v1"]["source_field"] == "rss.requirements"

talent_countries, talent_regions, talent_scope = _talent_eligibility("Applicants may work from anywhere worldwide")
talent = result_for("talentcom", talent_countries, talent_regions, "Applicants may work from anywhere worldwide", {})
assert talent_regions == ["GLOBAL"] and eligibility_evidence_payload(talent)["eligibility_evidence_v1"]["evidence_kind"] == "EXPLICIT_STRUCTURED"

unjobs_countries, unjobs_regions, unjobs_raw = _eligibility("Open to candidates from: Latin America")
unjobs = result_for("unjobs", unjobs_countries, unjobs_regions, unjobs_raw or "", {"eligibility": {"countries": unjobs_countries, "regions": unjobs_regions, "evidence": unjobs_raw}})
assert unjobs_regions == ["LATAM"] and eligibility_evidence_payload(unjobs)["eligibility_evidence_v1"]["source_field"] == "detail_description"

# The no-patch observation path is the critical cable: it must retain source evidence.
observation = observation_payload({"id": "opp-1", "source": "himalayas"}, himalayas_world, type("Identity", (), {"status": "IDENTITY_CONFIRMED", "method": "fixture", "reason": "exact"})())
assert observation["evidence"]["location_restrictions"] == [{"alpha2": None, "name": "Worldwide"}]
assert observation["evidence"]["eligibility_evidence_v1"]["eligible_regions"] == ["GLOBAL"]


class Response:
    def raise_for_status(self):
        return None


class Session:
    def __init__(self):
        self.events = []

    def get(self, *_args, **_kwargs):
        class Lookup(Response):
            def json(self):
                return [{"id": "opp-new"}]
        return Lookup()

    def post(self, _url, **kwargs):
        self.events.extend(kwargs["json"])
        return Response()


# New rows go through OpportunitySink first, then this existing lineage writer.
# Its append-only enrichment event must preserve the same shared envelope.
session = Session()
RunLineageWriter("https://fixture.supabase.co", "fixture", session).record([himalayas_world])
assert session.events[0]["evidence"]["eligibility_evidence_v1"]["eligible_regions"] == ["GLOBAL"]
assert session.events[0]["evidence"]["location_restrictions"] == [{"alpha2": None, "name": "Worldwide"}]

print("verify_eligibility_provenance_survival_item57: PASS adapter -> observation/event -> normalized matcher fields")
