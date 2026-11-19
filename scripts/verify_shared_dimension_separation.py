"""Adversarial contract for workplace geo, work arrangement and eligibility."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))

from source_adapters import AdapterResult, has_positive_job_geo_evidence, parse_applicant_eligibility, parse_job_geography
from eligibility_truth import CANONICAL_ELIGIBILITY_REGIONS, geo_decision_ready, normalize_eligibility_region, work_arrangement_state


def result(**values):
    return AdapterResult(source="fixture", adapter_version="v1", source_url="https://example.test/job", **values)


# A: arrangement is known, both factual dimensions remain unknown.
assert parse_job_geography(None, True) == (None, "UNKNOWN", None)
assert not has_positive_job_geo_evidence(result(remote=True))
assert not geo_decision_ready({"remote": True, "eligible_countries": [], "eligible_regions": []})

# B: explicit applicant restriction cannot manufacture workplace geo.
countries, regions, scope = parse_applicant_eligibility("United States only")
assert (countries, regions, scope) == (["US"], [], "COUNTRY_SPECIFIC")
assert not has_positive_job_geo_evidence(result(eligible_countries=countries, remote_scope=scope))
assert geo_decision_ready({"remote": True, "eligible_countries": countries, "eligible_regions": regions})

# C: explicit physical job location does not establish applicant eligibility.
country, _scope, onsite = parse_job_geography("Berlin, Germany", None)
assert (country, onsite) == ("DE", "DE")
assert has_positive_job_geo_evidence(result(location="Berlin, Germany", country_code=country, onsite_country=onsite))
assert not geo_decision_ready({"location": "Berlin, Germany", "country_code": country, "onsite_country": onsite}), "known job geo cannot substitute for unknown arrangement"
assert geo_decision_ready({"location": "Berlin, Germany", "country_code": country, "onsite_country": onsite, "remote_scope": "ONSITE"})

# D: explicit global applicant scope remains non-geo.
countries, regions, scope = parse_applicant_eligibility("Worldwide")
assert (countries, regions, scope) == ([], ["GLOBAL"], "WORLDWIDE")
assert not has_positive_job_geo_evidence(result(eligible_regions=regions, remote_scope=scope))
assert geo_decision_ready({"remote": True, "eligible_countries": countries, "eligible_regions": regions})

# E/F: placeholders are neither physical workplace geo nor applicant eligibility.
for placeholder in ("Remote", "Global", "Worldwide"):
    assert parse_job_geography(placeholder, True) == (None, "UNKNOWN", None), placeholder
    assert not has_positive_job_geo_evidence(result(location=placeholder, remote=True)), placeholder

expected_regions = {"Worldwide":"GLOBAL", "Europe Only":"EUROPE", "EMEA Only":"EMEA", "LATAM":"LATAM", "North America":"NORTH_AMERICA", "Americas":"AMERICAS", "Asia":"ASIA", "Africa":"AFRICA", "Oceania":"OCEANIA"}
assert set(expected_regions.values()) == CANONICAL_ELIGIBILITY_REGIONS
for label, expected in expected_regions.items(): assert normalize_eligibility_region(label) == expected
assert normalize_eligibility_region("Europe Only") != normalize_eligibility_region("EMEA Only")
assert normalize_eligibility_region("Other / unspecified") is None
assert work_arrangement_state({"remote": False}) == "UNKNOWN"
assert work_arrangement_state({"remote": True}) == "REMOTE"
assert work_arrangement_state({"remote_scope": "ONSITE"}) == "ONSITE"

print("PASS verify_shared_dimension_separation: explicit, missing, applicant-only, global, and placeholder branches")
