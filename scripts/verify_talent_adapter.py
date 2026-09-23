from pathlib import Path
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_adapters import AdapterResult, AtomicEnricher, build_rpc_patch, coverage, geo_from_detail, health, recommend
import talentcom_scraper

HTML = '''<html><head><link rel="canonical" href="https://www.talent.com/view?id=fixture"><script type="application/ld+json">{"@type":"JobPosting","title":"Data Engineer","description":"Build reliable data platforms for an international product team with Python and SQL.","hiringOrganization":{"name":"Acme"},"jobLocationType":"TELECOMMUTE","applicantLocationRequirements":"United States only","employmentType":"FULL_TIME","datePosted":"2026-09-01","validThrough":"2026-10-15"}</script></head><body><h1>Data Engineer</h1></body></html>'''
class Response:
    ok=True; status_code=200; text=HTML
with patch.object(talentcom_scraper.requests, "get", return_value=Response()):
    result = talentcom_scraper.parse_talent_detail("https://www.talent.com/view?id=fixture")
assert result.description and len(result.description) > 80 and result.organization == "Acme"
assert result.source_native_id == "fixture" and result.canonical_url.endswith("id=fixture")
assert result.country_code is None and result.onsite_country is None and result.eligible_countries == ["US"] and result.remote_scope == "COUNTRY_SPECIFIC"
assert result.employment_type == "FULL_TIME" and result.recommendation != "AUTO_BLOCK"
patch_data = build_rpc_patch(result, {"country_code":"PY", "location":"Paraguay"})
assert "type" not in patch_data and "employment_type" not in patch_data and "country_code" not in patch_data
unknown = AdapterResult(source="talentcom", adapter_version="talent:v2.0.0", source_url="x", remote=True)
unknown.country_code, unknown.remote_scope, unknown.onsite_country = geo_from_detail(None, None, True)
assert unknown.country_code is None and unknown.remote_scope == "UNKNOWN"
false_geo = AdapterResult(source="talentcom", adapter_version="talent:v2.0.0", source_url="x", evidence={"clear_inherited_geo": True})
clear_patch = build_rpc_patch(false_geo, {"country_code":"PY", "location":"Paraguay"})
assert clear_patch["country_code"] is None and clear_patch["location"] is None
assert coverage([])["description"] == 0.0
metrics = {"found": 300, "detail_pages_attempted": 300, "detail_pages_success": 8, "parsed": 5, "coverage": {"description": .02}}
assert health(metrics)[0] == "DEGRADED"
assert health({"found": 10, "detail_pages_attempted": 10, "detail_pages_success": 10, "parsed": 10, "coverage": {"description": .95}})[0] == "HEALTHY"
assert health({"found": 10, "detail_pages_attempted": 10, "detail_pages_success": 6, "parsed": 10, "coverage": {"description": .8}})[0] == "WARNING"
assert health({"found": 0, "detail_pages_attempted": 0, "detail_pages_success": 0, "parsed": 0, "coverage": {}})[0] == "UNKNOWN"
assert health({"found": 10, "detail_pages_attempted": 10, "detail_pages_success": 10, "parsed": 10, "coverage": {"description": .2}}, {"coverage": {"description": .9}})[0] == "DEGRADED"
assert result.recommendation == "AUTO_PUBLISH"  # aggregator provenance does not force a block.
assert recommend(AdapterResult(source="talentcom", adapter_version="talent:v2.0.0", source_url="x"), "DEGRADED").recommendation == "HUMAN_REVIEW"

class RpcResponse:
    def __init__(self, ok, body): self.ok, self.body, self.text = ok, body, str(body)
    def json(self): return self.body
    def raise_for_status(self):
        if not self.ok: raise RuntimeError(self.text)
class Session:
    def __init__(self): self.post_calls = 0
    def post(self, *args, **kwargs):
        self.post_calls += 1
        return RpcResponse(False, {"message":"stale_opportunity"}) if self.post_calls == 1 else RpcResponse(True, {"changed":True,"changed_fields":["description"]})
    def get(self, *args, **kwargs):
        return RpcResponse(True, [{"id":"fixture","updated_at":"2026-09-12T00:00:00+00:00","description":"old"}])
session = Session()
outcome = AtomicEnricher("https://fixture.supabase.co", "key", session).enrich_existing(result, {"id":"fixture","updated_at":"2026-09-12T00:00:00+00:00"})
assert outcome.status == "changed" and outcome.retries == 1 and session.post_calls == 2
print("PASS talent adapter: detail parsing, geo isolation, RPC whitelist/stale retry, coverage and degradation")
