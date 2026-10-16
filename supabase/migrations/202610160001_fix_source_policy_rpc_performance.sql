-- Fix: get_source_distribution_policy() called canonical_opportunity_source_policy()
-- once per source via LATERAL join (120+ sources × ~24ms = ~2.8s total).
-- match-batch calls this RPC on every request, causing HTTP 500 timeouts.
-- Fix: read boolean columns directly from opportunity_sources — these ARE the
-- canonical values; canonical_opportunity_source_policy() was just re-reading them.
-- Also fix: opportunity_seo_universe view has the same MATERIALIZED CTE pattern.

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
  source_attribution_required boolean,
  consumer_switch_overrides jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    os.source,
    os.is_enabled,
    os.catalog_enabled,
    os.matching_enabled,
    os.alerts_enabled,
    os.seo_enabled,
    os.registry_certified,
    os.registry_adapter_version,
    os.registry_policy_hash,
    os.registry_synced_at,
    os.web_catalog_allowed,
    os.search_engine_indexing_allowed,
    os.google_jobs_distribution_allowed,
    os.third_party_job_distribution_allowed,
    os.source_attribution_required,
    null::jsonb as consumer_switch_overrides
  from public.opportunity_sources os
$$;

revoke all on function public.get_source_distribution_policy() from public;
grant execute on function public.get_source_distribution_policy() to anon, authenticated, service_role;

-- Also fix opportunity_seo_universe: replace the MATERIALIZED CTE (which calls
-- canonical_opportunity_source_policy for every source) with a direct JOIN on
-- opportunity_sources boolean columns. SEO permission denials are enforced by
-- the enforce_explicit_consumer_denials trigger on opportunity_universe_state,
-- so the view just needs to check os.seo_enabled and source_seo_explicitly_denied().

do $migration$
declare opportunity_columns text;
begin
  if (select atttypid from pg_attribute where attrelid='public.opportunities'::regclass and attname='id' and not attisdropped) <> 'text'::regtype then
    raise exception 'SEO read path expects the existing opportunities.id text contract';
  end if;
  select string_agg(case when attname='id' then 'u.opportunity_id as id'
    else format('o.%I',attname) end, ', ' order by attnum)
  into opportunity_columns
  from pg_attribute
  where attrelid='public.opportunities'::regclass and attnum>0 and not attisdropped;
  execute format($view$
create or replace view public.opportunity_seo_universe
with (security_invoker = true) as
select %s, u.lifecycle_state as universe_lifecycle_state,
  u.seo_state as universe_seo_state
from public.opportunity_universe_state u
join lateral (
  select candidate.*
  from public.opportunities candidate
  where candidate.id = u.opportunity_id
    and public.opportunity_deadline_state(candidate.deadline) in ('OPEN', 'UNKNOWN')
  limit 1
) o on o.id = u.opportunity_id
left join public.opportunity_source_identity_aliases a
  on a.emitted_source = lower(trim(o.source))
join public.opportunity_sources os
  on os.source = coalesce(a.canonical_source, lower(trim(o.source)))
where u.seo_state = 'READY'
  and os.is_enabled = true
  and os.seo_enabled = true
  and not public.source_seo_explicitly_denied(coalesce(a.canonical_source, lower(trim(o.source))))
order by u.opportunity_id
$view$, opportunity_columns);
end $migration$;

revoke all on public.opportunity_seo_universe from public, anon, authenticated;
grant select on public.opportunity_seo_universe to service_role;
