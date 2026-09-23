from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_adapters import build_rpc_patch, coverage, health
from himalayas_scraper import adapt_himalayas_job

BASE = {"guid":"https://himalayas.app/companies/acme/jobs/platform-engineer-123","applicationLink":"https://careers.acme.test/jobs/123","title":"Platform Engineer","companyName":"Acme","description":"<p>" + "A complete role description with responsibilities and requirements. " * 30 + "</p>","employmentType":"Full Time","pubDate":"2026-09-10T12:00:00Z","expiryDate":"2026-10-10T12:00:00Z","minSalary":100000,"maxSalary":150000,"currency":"USD","salaryPeriod":"year"}

world = adapt_himalayas_job({**BASE, "locationRestrictions":["Worldwide"]})
assert len(world.description or "") > 600 and world.remote_scope == "WORLDWIDE" and world.country_code is None and world.onsite_country is None
assert world.organization == "Acme" and world.source_native_id == "platform-engineer-123" and world.apply_url.endswith("/123")
assert world.employment_type == "Full Time" and world.applicant_location_requirements == "Worldwide"
us = adapt_himalayas_job({**BASE, "locationRestrictions":["United States"], "timezoneRestrictions":[-10,-9,-8,-7,-6,-5,14]})
assert us.location == "Remote" and us.country_code is None and us.onsite_country is None and us.eligible_countries == ["US"] and us.remote_scope == "COUNTRY_SPECIFIC"
assert "Timezone restrictions" in (us.applicant_location_requirements or "")
assert adapt_himalayas_job({**BASE, "locationRestrictions":[{"alpha2":"US", "name":"United States"}]}).eligible_countries == ["US"]
assert adapt_himalayas_job({**BASE, "locationRestrictions":["Mexico"]}).eligible_countries == ["MX"]
canada_us = adapt_himalayas_job({**BASE, "locationRestrictions":["Canada", "United States"]})
assert canada_us.eligible_countries == ["CA", "US"] and canada_us.remote_scope == "REGIONAL"
europe = adapt_himalayas_job({**BASE, "locationRestrictions":["Europe / EMEA"]})
assert europe.country_code is None and europe.remote_scope == "REGIONAL"
world_without_restrictions = adapt_himalayas_job({**BASE, "locationRestrictions":[], "timezoneRestrictions":[]})
assert world_without_restrictions.remote_scope == "WORLDWIDE" and world_without_restrictions.country_code is None
timezone_restricted = adapt_himalayas_job({**BASE, "locationRestrictions":[], "timezoneRestrictions":["UTC-5 to UTC+2"]})
assert timezone_restricted.remote_scope == "UNKNOWN" and "Timezone restrictions" in (timezone_restricted.applicant_location_requirements or "")
FULL_TZ = [-11,-10,-9.5,-9,-8,-7,-6,-5,-4,-3.5,-3,-2,-1,0,1,2,3,3.5,4,4.5,5,5.5,5.75,6,6.5,7,8,8.75,9,9.5,10,10.5,11,12,12.75,13,14]
assert adapt_himalayas_job({**BASE, "locationRestrictions":[], "timezoneRestrictions":FULL_TZ}).remote_scope == "WORLDWIDE"
assert adapt_himalayas_job({**BASE, "locationRestrictions":["Paraguay"], "timezoneRestrictions":FULL_TZ}).remote_scope == "COUNTRY_SPECIFIC"
multi = adapt_himalayas_job({**BASE, "locationRestrictions":["Australia", "Singapore", "South Korea", "Taiwan"]})
assert multi.location == "Remote" and multi.country_code is None and multi.onsite_country is None and multi.eligible_countries == ["AU", "KR", "SG", "TW"] and multi.remote_scope == "REGIONAL"
latam = adapt_himalayas_job({**BASE, "locationRestrictions":["Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Costa Rica", "Cuba", "Dominican Republic", "Ecuador", "El Salvador", "Guatemala", "Haiti", "Honduras", "Mexico", "Nicaragua", "Panama", "Paraguay", "Peru", "Uruguay", "Venezuela"]})
assert latam.eligible_countries == ["AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "HT", "MX", "NI", "PA", "PE", "PY", "SV", "UY", "VE"] and latam.remote_scope == "REGIONAL"
unknown_country = adapt_himalayas_job({**BASE, "locationRestrictions":["Moon Base"]})
assert unknown_country.eligible_countries == [] and unknown_country.recommendation == "HUMAN_REVIEW" and unknown_country.recommendation_reasons == ["eligibility_structure_mismatch"]
territories = adapt_himalayas_job({**BASE, "locationRestrictions":["Jamaica", "Puerto Rico", "Trinidad and Tobago", "Aruba", "Curaçao", "Belize", "Guyana", "Suriname", "Bonaire, Sint Eustatius and Saba", "British Virgin Islands", "U.S. Virgin Islands"]})
assert territories.eligible_countries == ["AW", "BQ", "BZ", "CW", "GY", "JM", "PR", "SR", "TT", "VG", "VI"] and territories.recommendation != "HUMAN_REVIEW"
assert adapt_himalayas_job({**BASE, "expiryDate":"2026-11-20T00:00:00Z"}).deadline == "2026-11-20"
legacy_geo_patch = build_rpc_patch(us, {"location": "Remote", "country_code": "WW", "onsite_country": "US", "remote": True, "remote_scope": None})
assert legacy_geo_patch["country_code"] is None and legacy_geo_patch["onsite_country"] is None and legacy_geo_patch["eligible_countries"] == ["US"]
patch = build_rpc_patch(world, {})
assert "type" not in patch and "employment_type" not in patch and patch["description"] == world.description
assert world.recommendation == "AUTO_PUBLISH"
assert coverage([])["description"] == 0.0
assert health({"found":20,"detail_pages_attempted":20,"detail_pages_success":20,"parsed":20,"coverage":{"description":.95}})[0] == "HEALTHY"
assert health({"found":300,"detail_pages_attempted":300,"detail_pages_success":8,"parsed":5,"coverage":{"description":.02}})[0] == "DEGRADED"
print("PASS himalayas adapter: API full description, restrictions, patch, metrics and health")
