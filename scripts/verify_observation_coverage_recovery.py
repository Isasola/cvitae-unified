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
assert 'parser.add_argument("--max-sources", type=int, default=10)' in runner
assert 'parser.add_argument("--page-size", type=int, default=100)' in runner
assert 'parser.add_argument("--max-runtime-seconds", type=int, default=1800)' in runner
assert 'def fetch_page(' in runner and 'query["id"] = f"gt.{after_id}"' in runner
assert '"source_cursors"' in runner and '"next_after_id"' in runner
assert '}/rpc/latest_opportunity_universe_observations' in runner
assert '"p_opportunity_ids": ids' in runner
assert '"--opportunity-id", opportunity_id' in runner and '"--max-items", "1"' in runner
assert 'parser.add_argument("--id", "--opportunity-id", dest="opportunity_id")' in maintenance, 'recovery calls a flag the existing maintenance CLI actually accepts'
assert "def pages(" not in runner and '"offset": str(offset)' not in runner
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
print(f"verify_observation_coverage_recovery: PASS profiles={len(PROFILES)} dry_run_default=1 max_page=100 max_sources=10 resumable_keyset=1 exact_id_recovery=1 no_absence_dead=1")

# Run the actual planner/main across three invocations; only HTTP and external
# maintenance are mocked. Checkpoint, page selection and cursor logic are real.
import json
from types import SimpleNamespace
from unittest.mock import patch
import run_observation_coverage_recovery as recovery

checkpoint_path = ROOT / '.cvitae-state' / 'cable-recovery-test.json'
inventory = [{'id': f'{index:05}', 'match_eligible': False, 'seo_eligible': False} for index in range(251)]
observed = set()
scopes = []
def fake_get(url, *, headers, params, timeout):
    after = params.get('id', 'gt.').removeprefix('gt.')
    selected = [row for row in inventory if row['id'] > after][:int(params['limit'])]
    scopes.append((after, len(selected)))
    return SimpleNamespace(raise_for_status=lambda: None, json=lambda: selected)
def fake_post(url, *, headers, json, timeout):
    ids = json['p_opportunity_ids']
    assert len(ids) <= 100
    return SimpleNamespace(raise_for_status=lambda: None, json=lambda: [{'opportunity_id': value} for value in ids if value in observed])
def fake_run(command, **kwargs):
    observed.add(command[command.index('--opportunity-id') + 1])
    return SimpleNamespace(returncode=0)
profile = SimpleNamespace(discovery_strategy='public_api', detail_strategy='api_bulk', adapter='existing_fixture_adapter',
    auto_enabled=True, max_detail_fetches_per_run=100, scout='fixture')
try:
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    if checkpoint_path.exists(): checkpoint_path.unlink()
    with patch.object(recovery, 'PROFILES', {'fixture': profile}), \
         patch.object(recovery, 'certification', lambda _: {'certified': True}), \
         patch.object(recovery, 'emitted_ids_for', lambda _: ['fixture']), \
         patch.object(recovery, 'api_headers', lambda: {}), \
         patch.object(recovery, 'api_base', lambda: 'https://offline.invalid'), \
         patch.object(recovery.requests, 'get', fake_get), patch.object(recovery.requests, 'post', fake_post), \
         patch.object(recovery.subprocess, 'run', fake_run), \
         patch.object(sys, 'argv', ['recovery', '--apply', '--max-sources', '1', '--page-size', '100', '--cursor-file', str(checkpoint_path)]):
        for _ in range(3): assert recovery.main() == 0
        assert recovery.main() == 0
    checkpoint = json.loads(checkpoint_path.read_text(encoding='utf-8'))
    assert checkpoint['completed_sources'] == ['fixture']
    assert observed == {row['id'] for row in inventory}
    assert scopes == [('',100),('00099',100),('00199',51)]
    print('CASE_11_RECOVERY_EVENTUAL_FULL_COVERAGE: PASS rows=251 pages=3 resumable=1 no_http=1')
finally:
    if checkpoint_path.exists(): checkpoint_path.unlink()
