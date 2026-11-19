-- Local-only: minimal public/build policy projection.  It intentionally omits
-- maintenance, reviewers, notes and any mutation capability.
create or replace function public.get_source_distribution_policy()
returns table (
  source text,
  is_enabled boolean,
  catalog_enabled boolean,
  matching_enabled boolean,
  alerts_enabled boolean,
  seo_enabled boolean,
  registry_certified boolean,
  registry_adapter_version text,
  registry_policy_hash text,
  registry_synced_at timestamptz,
  web_catalog_allowed boolean,
  search_engine_indexing_allowed boolean,
  google_jobs_distribution_allowed boolean,
  third_party_job_distribution_allowed boolean,
  source_attribution_required boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    os.source, os.is_enabled, os.catalog_enabled, os.matching_enabled,
    os.alerts_enabled, os.seo_enabled, os.registry_certified,
    os.registry_adapter_version, os.registry_policy_hash, os.registry_synced_at,
    os.web_catalog_allowed, os.search_engine_indexing_allowed,
    os.google_jobs_distribution_allowed, os.third_party_job_distribution_allowed,
    os.source_attribution_required
  from public.opportunity_sources os
$$;

revoke all on function public.get_source_distribution_policy() from public;
grant execute on function public.get_source_distribution_policy() to anon, authenticated;
