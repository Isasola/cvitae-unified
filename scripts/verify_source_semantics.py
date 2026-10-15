"""Golden semantic fixtures: source evidence must preserve the three geo axes."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_adapters import AdapterResult, parse_applicant_eligibility, parse_job_geography
from opportunity_quality import quality_signals_for
from himalayas_scraper import adapt_himalayas_job

def result(source, location, requirements, remote, kind="job"):
    country, scope, onsite = parse_job_geography(location, remote)
    eligible_countries, eligible_regions, _ = parse_applicant_eligibility(requirements)
    return AdapterResult(source=source, adapter_version="fixture", source_url="https://example.test/detail", title="Opportunity", organization="Org", description="x" * 120, apply_url="https://example.test/apply", location=location, country_code=country, onsite_country=onsite, remote=remote, remote_scope=scope, eligible_countries=eligible_countries, eligible_regions=eligible_regions)

# Himalayas fixtures exercise the production API adapter rather than a
# duplicate test-only geo parser.
h_us = adapt_himalayas_job({"guid": "https://himalayas.app/companies/org/jobs/us-only", "title": "US", "companyName": "Org", "description": "x" * 120, "locationRestrictions": [{"alpha2": "US", "name": "United States"}], "employmentType": "Full time"}); assert h_us.country_code is None and h_us.onsite_country is None and h_us.eligible_countries == ["US"] and h_us.remote_scope == "COUNTRY_SPECIFIC"
h_world = adapt_himalayas_job({"guid": "https://himalayas.app/companies/org/jobs/world", "title": "World", "companyName": "Org", "description": "x" * 120, "locationRestrictions": "Work from anywhere worldwide", "employmentType": "Full time"}); assert h_world.country_code is None and h_world.eligible_countries == [] and h_world.eligible_regions == ["GLOBAL"] and h_world.remote_scope == "WORLDWIDE"
w_world = result("weworkremotely", None, "Anywhere in the World", True); assert w_world.remote_scope == "UNKNOWN" and w_world.eligible_regions == ["GLOBAL"]
w_unknown = result("weworkremotely", None, None, True); assert w_unknown.remote_scope == "UNKNOWN" and not w_unknown.eligible_regions
jobicy = result("jobicy", None, "LATAM", True); assert jobicy.remote_scope == "UNKNOWN" and jobicy.eligible_regions == ["LATAM"]
remotive = result("remotive", None, "Europe / EMEA", True); assert remotive.remote_scope == "UNKNOWN" and not remotive.eligible_regions
unjobs = result("unjobs", "Bogota, Colombia", None, None); assert unjobs.country_code == "CO" and unjobs.remote is None
mef = {"opportunity_type": "scholarship", "organization": "MEF", "description": "x" * 120, "application_url": "https://example.test", "location": "Argentina", "country_code": "AR", "eligible_countries": ["PY"]}; assert "bad_country" not in quality_signals_for(mef)
eu = result("eu_delegation_paraguay", None, None, None); assert eu.country_code is None and eu.remote_scope in {None, "UNKNOWN"}
desk = {"opportunity_type": "grant", "organization": "Opportunity Desk", "description": "x" * 120, "application_url": "https://example.test", "location": None, "country_code": None}; assert "bad_country" not in quality_signals_for(desk)
comp = result("computrabajo", "Asuncion, Paraguay", None, False); assert comp.country_code == "PY" and comp.onsite_country == "PY"
print("PASS source semantics: golden geo, eligibility and kind-quality fixtures")
