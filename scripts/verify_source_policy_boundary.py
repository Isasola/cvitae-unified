"""Static contract for the local-only, least-privilege policy RPC."""
from pathlib import Path

sql = (Path(__file__).resolve().parents[1] / 'supabase/migrations/202609200002_safe_source_distribution_policy.sql').read_text(encoding='utf-8').lower()
required = ('get_source_distribution_policy', 'security definer', 'set search_path = pg_catalog, public', 'language sql', 'stable', 'revoke all', 'grant execute', 'from public.opportunity_sources')
for value in required:
    assert value in sql, value
body = sql.split('as $$', 1)[1].split('$$', 1)[0]
for forbidden in ('notes', 'updated_by', 'verification_criteria', 'insert ', 'update ', 'delete '):
    # GRANT EXECUTE is the only permitted occurrence.
    assert forbidden not in body, forbidden
assert sql.count('grant execute') == 1
assert 'search_engine_indexing_allowed boolean' in sql
print('verify_source_policy_boundary: PASS')
