from pathlib import Path
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_adapters import build_rpc_patch, coverage, health
import unjobs_scraper

HTML = '''<html><head><link rel="canonical" href="https://unjobs.org/vacancies/1786913589727"/></head><body>
<article><h1>Programme Specialist</h1><div>Organization: UNDP - United Nations Development Programme Country: Paraguay City: Asunción Office: UNDP in Asuncion, Paraguay</div>
<p>Duty Station(s): Asunción, Paraguay</p>
<p>Posting Start Date: 01-Sep-2026</p><p>Posting End Date: 30-Sep-2026</p><p>Contract Type: International Consultant</p>
<section class="job-description"><p>Lead programme delivery with public institutions and local partners, oversee reporting, and ensure that activities meet established quality standards. Candidates must be currently based and authorized to work in one of the following countries to be eligible for this position: Bolivia, Chile, Ecuador, Guatemala, Belize, Honduras, Mexico, Paraguay, Peru, Suriname, or Guyana.</p><p>Applicants must be legally authorized to work in the job's location. Required qualifications include strong coordination experience and professional Spanish communication.</p></section>
<a href="https://jobs.undp.org/apply/fixture">Apply now</a></article></body></html>'''
REMOTE = '''<html><body><article><h1>Remote Research Consultant</h1><p>Organization: UNICEF</p><p>Duty Station: Home-based</p><p>Contract Type: Consultancy</p><section class="job-description"><p>Support research synthesis and evidence review for programme teams across several workstreams with documented outputs and quality review.</p></section></article></body></html>'''
FIELD_LOCATION = '''<html><body><article><h1>Programme Officer</h1><div>Organization: UN Women Country: Bolivia Field location: Tarija Office: UN Women Bolivia</div><section class="job-description"><p>Lead programme coordination with local partners, prepare operational reports, and support documented delivery against approved work plans.</p></section></article></body></html>'''

class Response:
    def __init__(self, text): self.ok = True; self.status_code = 200; self.text = text

with patch.object(unjobs_scraper.requests, "get", return_value=Response(HTML)):
    result = unjobs_scraper.parse_unjobs_detail("https://unjobs.org/vacancies/1786913589727")
assert result.source_native_id == "1786913589727" and result.canonical_url.endswith("1786913589727")
assert result.organization.startswith("UNDP") and result.location == "Asunción, Paraguay" and result.country_code == "PY" and result.onsite_country == "PY"
assert result.description and len(result.description) > 100 and result.deadline == "2026-09-30"
assert result.date_posted == "2026-09-01" and result.apply_url == "https://jobs.undp.org/apply/fixture"
assert result.employment_type == "International Consultant" and result.recommendation == "AUTO_PUBLISH"
assert result.eligible_countries == ["BO", "BZ", "CL", "EC", "GT", "GY", "HN", "MX", "PE", "PY", "SR"] and result.eligible_regions == []
assert result.remote is None and result.remote_scope is None
current = {"id":"fixture", "updated_at":"2026-09-12T00:00:00+00:00", "location":"Paraguay", "country_code":"PY", "onsite_country":"PY", "remote":None, "remote_scope":"ONSITE", "eligible_countries":[]}
patch_data = build_rpc_patch(result, current)
assert "type" not in patch_data and "employment_type" not in patch_data and "country_code" not in patch_data and patch_data["eligible_countries"] == result.eligible_countries
assert patch_data["location"] == "Asunción, Paraguay" and patch_data["remote_scope"] is None and "remote" not in patch_data
assert "onsite_country" not in patch_data
assert "onsite_country" in result.extracted_fields and result.evidence["clear_inherited_work_arrangement"] is True
assert "remote_scope" not in build_rpc_patch(result, {**current, "remote_scope":None})
explicit_scope = unjobs_scraper.AdapterResult(source="unjobs", adapter_version="fixture", source_url="https://unjobs.org/vacancies/9", remote=True, remote_scope="COUNTRY_SPECIFIC", evidence={"clear_inherited_work_arrangement":True})
assert build_rpc_patch(explicit_scope, {"remote":None, "remote_scope":"ONSITE"})["remote_scope"] == "COUNTRY_SPECIFIC"
no_flag = unjobs_scraper.AdapterResult(source="unjobs", adapter_version="fixture", source_url="https://unjobs.org/vacancies/10")
assert "remote_scope" not in build_rpc_patch(no_flag, {"remote_scope":"ONSITE"})

with patch.object(unjobs_scraper.requests, "get", return_value=Response(REMOTE)):
    remote = unjobs_scraper.parse_unjobs_detail("https://unjobs.org/vacancies/1786913589728")
assert remote.remote is True and remote.remote_scope == "UNKNOWN" and remote.country_code is None
assert remote.apply_url.endswith("1786913589728")  # no inequívoco original URL: safe detail fallback
assert remote.recommendation == "HUMAN_REVIEW"

with patch.object(unjobs_scraper.requests, "get", return_value=Response(FIELD_LOCATION)):
    field_location = unjobs_scraper.parse_unjobs_detail("https://unjobs.org/vacancies/1786913589729")
assert field_location.location == "Tarija, Bolivia"
assert field_location.country_code == "BO" and field_location.onsite_country == "BO"
assert "Field location:" not in field_location.location

no_geo = unjobs_scraper.AdapterResult(source="unjobs", adapter_version="fixture", source_url="https://unjobs.org/vacancies/1", source_status=200, title="Valid role", organization="UN Agency", description="A sufficiently detailed role description with independently useful responsibilities and qualifications for testing only." * 2)
assert unjobs_scraper.recommend(no_geo).recommendation == "HUMAN_REVIEW"
dead = unjobs_scraper.AdapterResult(source="unjobs", adapter_version="fixture", source_url="https://unjobs.org/vacancies/2", source_status=410, title="Old role")
assert unjobs_scraper.recommend(dead).recommendation == "AUTO_BLOCK"

assert coverage([]) == {"description": 0.0, "organization": 0.0, "geo": 0.0, "apply_url": 0.0, "deadline": 0.0}
assert health({"found": 10, "detail_pages_attempted": 10, "detail_pages_success": 10, "parsed": 10, "coverage": {"description": .9}})[0] == "HEALTHY"
assert health({"found": 600, "detail_pages_attempted": 600, "detail_pages_success": 12, "parsed": 15, "coverage": {"description": .1}})[0] == "DEGRADED"
print("PASS unjobs adapter: detail fields, duty-station geo, deadline, provenance, common patch/health")
