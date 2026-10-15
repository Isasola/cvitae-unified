"""Static safety check for the closed, additive Paraguay Concursa migration."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/202610140001_paraguayconcursa_source_operation.sql"


def main() -> int:
    sql = MIGRATION.read_text(encoding="utf-8").casefold()
    assert "insert into public.opportunity_sources" in sql
    assert "'paraguayconcursa_mef', 'paraguay concursa mef', 'py', 'review', false" in sql
    assert "false, false, false, false, false" in sql
    assert "on conflict (source) do nothing" in sql
    assert "for update" in sql
    assert "public.admin_update_source_policy_atomic(" in sql
    assert "'is_enabled', false" in sql
    assert "'catalog_enabled', false" in sql
    assert "'matching_enabled', false" in sql
    assert "'alerts_enabled', false" in sql
    assert "'seo_enabled', false" in sql
    assert "paraguayconcursa_existing_policy_requires_admin_review" in sql
    assert "pg_get_functiondef('public.canonical_opportunity_source_policy(text)'::regprocedure)" in sql
    assert "quote_literal('oya') || ',' || quote_literal('personal')" in sql
    assert "quote_literal('paraguayconcursa_mef')" in sql
    assert "public.admin_policy_events" in sql
    assert "paraguayconcursa_closed_source_policy_event_required" in sql
    assert "canonical_source_policy_insertion_anchor_missing" in sql
    assert "insert into public.scraper_controls" in sql
    assert "'paraguayconcursa_mef_scraper'" in sql
    assert "'scrapers/paraguayconcursa_mef_scraper.py'" in sql
    assert "20, 900, 2, true, true, array['py']::text[]" in sql
    assert "on conflict (scraper_id) do nothing" in sql
    assert "insert into public.admin_policy_events" not in sql, "audit must be written by the existing admin RPC"
    assert "update public.opportunity_sources" not in sql
    assert "update public.scraper_controls" not in sql
    assert "update public.opportunities" not in sql
    print("verify_paraguayconcursa_source_policy_migration: PASS closed bootstrap, administrative audit authority, and no conflict overwrite")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
