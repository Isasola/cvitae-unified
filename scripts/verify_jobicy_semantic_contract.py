"""Discriminating Jobicy API dimension and persistence contract."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT / "scrapers"))
from opportunity_sink import normalize_opportunity
from source_adapters import build_rpc_patch, eligibility_evidence_payload
import jobicy_scraper as jobicy

raw={"id":7,"url":"https://jobicy.test/7","jobTitle":"Data Engineer","companyName":"Acme","jobGeo":"Europe Only","jobDescription":"Build reliable systems with data pipelines and clear operational ownership. " * 3,"pubDate":"2026-09-27"}
detail=jobicy.adapt_jobicy_job(raw)
assert detail.location is None and detail.country_code is None and detail.onsite_country is None
assert detail.remote is True and detail.eligible_countries == [] and detail.eligible_regions == ["EUROPE"]
assert detail.recommendation == "AUTO_PUBLISH"
emea=jobicy.adapt_jobicy_job({**raw,"jobGeo":"EMEA Only"})
assert emea.eligible_regions == ["EMEA"] and detail.eligible_regions != emea.eligible_regions
us=jobicy.adapt_jobicy_job({**raw,"jobGeo":"United States only"})
assert us.eligible_countries == ["US"] and us.location is None and us.recommendation == "AUTO_PUBLISH"
envelope=eligibility_evidence_payload(us)["eligibility_evidence_v1"]
assert envelope["eligible_countries"] == ["US"] and envelope["source_field"] == "applicant_location_requirements"
created=jobicy.new_row_from_detail(us,"Tecnología e IT",[]); normalized,error=normalize_opportunity(created)
assert error is None and normalized and normalized.get("location") in (None,"") and normalized["eligible_countries"] == ["US"]
persisted=build_rpc_patch(us,{})
assert build_rpc_patch(us,persisted) == {}
source=(ROOT / "scrapers" / "jobicy_scraper.py").read_text(encoding="utf-8")
assert "OpportunitySink().upsert(rows)" in source and "requests.post(" not in source
print("PASS verify_jobicy_semantic_contract: jobGeo eligibility, create/update/no-op/provenance/direct sink")
