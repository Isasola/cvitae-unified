from pathlib import Path
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_adapters import build_rpc_patch, coverage, health
import weworkremotely_scraper as wwr

HTML = '''<html><head><link rel="canonical" href="https://weworkremotely.com/remote-jobs/acme-platform-engineer"/></head><body><main><h1>Platform Engineer</h1><div class="company">Acme</div><section id="job-description"><p>Build reliable systems and collaborate with distributed engineers across product teams using clear written communication and strong operational practices.</p><p>This detailed description replaces the short RSS summary with requirements and role context.</p><p>Location: Anywhere in the World</p></section><a href="https://careers.acme.test/apply">Apply now</a></main></body></html>'''
US_HTML = HTML.replace("Anywhere in the World", "United States only")
EU_HTML = HTML.replace("Anywhere in the World", "Europe / EMEA")
LATAM_HTML = HTML.replace("Anywhere in the World", "LATAM")
LIST_HTML = HTML.replace("Anywhere in the World", "United States, Canada")
MISMATCH_HTML = HTML.replace("Platform Engineer", "The largest job board for remote jobs")
class Response:
    def __init__(self, html): self.ok=True; self.status_code=200; self.text=html
rss = {"title":"Platform Engineer","company":"RSS Acme","summary":"short rss summary","requirements":None,"employment_type":"Full-time","published_at":"2026-09-10","deadline":"2026-10-10"}
with patch.object(wwr.requests, "get", return_value=Response(HTML)):
    world = wwr.parse_wwr_detail("https://weworkremotely.com/remote-jobs/acme-platform-engineer", rss)
assert world.organization == "Acme" and len(world.description or "") > len(rss["summary"])
assert world.source_native_id == "acme-platform-engineer" and world.canonical_url.endswith("acme-platform-engineer") and world.apply_url.endswith("/apply")
assert world.employment_type == "Full-time"
assert world.remote_scope == "WORLDWIDE" and world.country_code is None and world.onsite_country is None and world.recommendation == "AUTO_PUBLISH"
for html, expected_scope, expected_countries in ((US_HTML,"COUNTRY_SPECIFIC",["US"]),(EU_HTML,"REGIONAL",[]),(LATAM_HTML,"REGIONAL",[]),(LIST_HTML,"REGIONAL",["CA","US"])):
    with patch.object(wwr.requests, "get", return_value=Response(html)):
        parsed = wwr.parse_wwr_detail("https://weworkremotely.com/remote-jobs/acme-platform-engineer", rss)
    assert parsed.remote_scope == expected_scope and parsed.country_code is None and parsed.onsite_country is None and parsed.eligible_countries == expected_countries, (parsed.remote_scope, parsed.eligible_countries, parsed.applicant_location_requirements)
with patch.object(wwr.requests, "get", return_value=Response(MISMATCH_HTML)):
    mismatch = wwr.parse_wwr_detail("https://weworkremotely.com/remote-jobs/expired-platform-engineer", rss)
assert mismatch.evidence["detail_match"] is False and mismatch.recommendation == "HUMAN_REVIEW"
patch_data = build_rpc_patch(world, {})
assert "type" not in patch_data and "employment_type" not in patch_data
assert build_rpc_patch(mismatch, {"description": "historical evidence"}) == {}
assert coverage([])["geo"] == 0.0
assert health({"found":10,"detail_pages_attempted":10,"detail_pages_success":10,"parsed":10,"coverage":{"description":.9}})[0] == "HEALTHY"
assert health({"found":500,"detail_pages_attempted":500,"detail_pages_success":5,"parsed":4,"coverage":{"description":.01}})[0] == "DEGRADED"
print("PASS wwr adapter: RSS-to-detail, description, geo restrictions, patch and health")
