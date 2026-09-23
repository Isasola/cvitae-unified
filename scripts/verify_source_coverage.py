"""Offline contract validator: every registered source has explicit V2 state."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
from source_cleaners import PROFILES, SourceProfile
from source_registry_v2 import certification, discover_static_emitters, resolve_emitted_source, validate_registry

validation = validate_registry()
assert validation["valid"], validation
assert resolve_emitted_source("automotriz_py").source == "automotriz"
assert resolve_emitted_source("cc_atento").source == "callcenters"
assert resolve_emitted_source("ong_giz_py").source == "ongs"
for emitted, canonical in {
    "banco_atlas": "bancos", "const_cpi": "constructoras",
    "coop_universitaria": "cooperativas", "hosp_bautista": "hospitales",
    "ong_oas_py": "ongs", "retail_stock": "supermercados",
    "seguros_unimedica": "seguros", "tech_local_vendor": "tech_local",
    "univ_nacional": "universidades",
}.items():
    assert resolve_emitted_source(emitted).source == canonical, emitted
assert resolve_emitted_source("retail_malls").source == "retail_malls"
assert resolve_emitted_source("retail_malls_py").source == "retail_malls"
try: resolve_emitted_source("unknown_emitted_source")
except ValueError as exc: assert str(exc) == "unresolved_emitted_source"
else: raise AssertionError("unresolved emitter accepted")
for profile in PROFILES.values():
    assert profile.source_family != "", profile.source
    assert profile.semantic_version, profile.source
    assert profile.opportunity_kinds or profile.adapter is None, profile.source
    if profile.auto_enabled:
        assert certification(profile)["certified"], profile.source
    # Distribution is opt-in.  Diagnosis-only / unvalidated profiles cannot
    # grant catalog, Google Jobs, or third-party publication by projection.
    if profile.adapter is None or profile.adapter_version == "unvalidated":
        assert profile.web_catalog_allowed is False, profile.source
        assert profile.google_jobs_distribution_allowed is False, profile.source
        assert profile.third_party_job_distribution_allowed is False, profile.source

# The only presently explicit distribution contract remains intentionally
# narrow: organic catalog with attribution, but no Google/third-party feed.
himalayas = PROFILES["himalayas"]
assert himalayas.web_catalog_allowed is True
assert himalayas.source_attribution_required is True
assert himalayas.google_jobs_distribution_allowed is False
assert himalayas.third_party_job_distribution_allowed is False
emitters = discover_static_emitters(ROOT)
unresolved = []
for emitted in emitters:
    try: resolve_emitted_source(emitted)
    except ValueError: unresolved.append(emitted)
assert not unresolved, f"unresolved static emitters: {sorted(unresolved)}"

# Negative fixtures protect the resolver from future registry drift.
base = dict(adapter_version="fixture", auto_enabled=False, expected_description_coverage=0, source_family="fixture", opportunity_kinds=("job",))
assert not validate_registry([SourceProfile(source="one", emitted_aliases=("shared",), **base), SourceProfile(source="two", emitted_aliases=("shared",), **base)])["valid"]
assert not validate_registry([SourceProfile(source="one", emitted_patterns=(r"^same_[a-z]+$",), **base), SourceProfile(source="two", emitted_patterns=(r"^same_[a-z]+$",), **base)])["valid"]
assert not validate_registry([SourceProfile(source="one", emitted_aliases=("family_member",), **base), SourceProfile(source="two", emitted_patterns=(r"^family_[a-z]+$",), **base)])["valid"]
print(f"PASS source coverage: {len(PROFILES)} profiles, {len(validation['aliases'])} aliases, {len(emitters)} static emitters, no collisions")
