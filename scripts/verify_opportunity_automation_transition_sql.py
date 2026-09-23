"""Static fail-closed contract checks for the local atomic transition migration."""
from pathlib import Path

sql=(Path(__file__).resolve().parents[1]/"supabase/migrations/202609140001_opportunity_automation_transition.sql").read_text(encoding="utf-8").lower()
for token in (
    "registry_certified", "registry_auto_enabled", "registry_policy_hash",
    "registry_freshness_ttl_hours", "registry_health_ttl_hours", "registry_projection_ttl_hours",
    "registry_automation_policy_version", "opportunity_automation_events",
    "create or replace function public.apply_opportunity_automation_transition",
    "for update", "registry_projection_stale", "source_auto_not_enabled",
    "runtime_health_unavailable", "freshness_unavailable", "idempotency_conflict", "factory_not_ready",
    "google_jobs_forbidden", "third_party_distribution_forbidden",
    "alerts_forbidden", "source_attribution_missing", "automation_policy_version_mismatch",
    "downstream_requires_verified_active", "pg_advisory_xact_lock", "enable row level security",
    "insert into public.opportunity_automation_events", "security definer",
):
    assert token in sql, token
assert "patch " not in sql
assert "jsonb_typeof(a.value) <> 'boolean'" in sql
assert "unknown_allowed_action" in sql
assert "p_allowed_actions ? 'catalog'" not in sql
assert "seo_status=case when v_organic_seo then 'eligible'" in sql
print("opportunity automation transition SQL verifier: PASS")
