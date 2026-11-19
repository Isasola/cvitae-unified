"""Static contract for the local migration; no database connection required."""
from pathlib import Path


def main() -> int:
    migration = (Path(__file__).resolve().parents[1] / 'supabase/migrations/202609200001_source_permission_row_readiness.sql').read_text(encoding='utf-8')
    assert "matching_enabled')::boolean is false" in migration
    assert 'set match_eligible = false' in migration
    assert 'case when p_changes ? \'matching_enabled\' then (p_changes->>\'matching_enabled\')::boolean else match_eligible end' not in migration
    print('verify_source_permission_row_readiness: PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
