"""Offline safety contract for the bounded observation recovery planner."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scrapers"))
sys.path.insert(0, str(ROOT / "scripts"))
from source_cleaners import PROFILES
from source_registry_v2 import certification
from run_observation_coverage_recovery import capability

runner = (ROOT / "scripts/run_observation_coverage_recovery.py").read_text(encoding="utf-8")
maintenance = (ROOT / "scripts/run_source_maintenance.py").read_text(encoding="utf-8")
universe = (ROOT / "supabase/migrations/202609280001_opportunity_universe.sql").read_text(encoding="utf-8")

assert 'parser.add_argument("--apply", action="store_true"' in runner  # dry-run is default
assert "--max-items-per-source debe estar entre 1 y 250" in runner
assert '"enumeration_completeness_proven": False' in runner
assert "observation_state" not in runner or "DEAD" not in runner
assert '"run_source_maintenance.py"' in runner and '"--observations-only"' in runner
assert "persist_observations(plans, run_id=summary[\"telemetry_run_id\"])" in maintenance
assert "if observations_only:" in maintenance and "continue" in maintenance
assert "policy_candidates = [] if observations_only" in maintenance
assert "opportunity_observation_refresh_universe" in universe and "refresh_opportunity_universe(new.opportunity_id::text,true)" in universe
assert "if source == 'himalayas'" not in runner and 'source == "himalayas"' not in runner
assert all(capability(profile) in {"API_ENUMERATION", "DETAIL_REFRESH", "CERTIFIED_MAINTENANCE", "NO_REFRESH_CAPABILITY"} for profile in PROFILES.values())
assert all(certification(profile)["certified"] or not profile.auto_enabled for profile in PROFILES.values())
assert "cursor-file" in runner and "last_completed_source" in runner and "STOP_ON_ERROR" in runner
print(f"verify_observation_coverage_recovery: PASS profiles={len(PROFILES)} dry_run_default=1 max_page=250 no_absence_dead=1")
