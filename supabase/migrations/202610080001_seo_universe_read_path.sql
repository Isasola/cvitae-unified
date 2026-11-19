-- Same canonical SEO truth; change only the access path for exhaustive id pages.
-- Building the partial index reads universe_state once and consumes IO. Apply
-- only in an authorized release window; no reconciliation/refresh is required.
begin;

create index if not exists opportunity_universe_seo_ready_id_idx
  on public.opportunity_universe_state (opportunity_id)
  where seo_state = 'READY';

-- Expose the READY relation's id as the view's id. Otherwise a later-page
-- predicate can stop at the correlated opportunity subquery and re-read all
-- preceding READY IDs. Generate the remaining o.* projection from the catalog
-- to retain every existing opportunity column and its original ordinal.
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
with (security_invoker=true) as
with effective_policies as materialized (
  select distinct public.canonical_opportunity_source_policy(s.source) policy
  from public.opportunity_sources s
)
select %s, u.lifecycle_state as universe_lifecycle_state,
  u.seo_state as universe_seo_state
from public.opportunity_universe_state u
-- The correlated, at-most-one PK lookup prevents flattening back into a full
-- opportunities scan followed by one universe lookup per inventory row.
-- LIMIT 1 bounds this UNIQUE-ID lookup, never the universe or page coverage.
join lateral (
  select candidate.*
  from public.opportunities candidate
  where candidate.id = u.opportunity_id
    and public.opportunity_deadline_state(candidate.deadline) in ('OPEN','UNKNOWN')
  limit 1
) o on o.id = u.opportunity_id
-- Keep the equality above visible to the outer id > cursor / ORDER BY id query.
left join public.opportunity_source_identity_aliases a
  on a.emitted_source=lower(trim(o.source))
join lateral (
  select p.policy
  from effective_policies p
  where p.policy->>'canonical_source'=coalesce(a.canonical_source,lower(trim(o.source)))
    and p.policy->>'is_enabled'='true'
    and p.policy->>'seo_enabled' is distinct from 'false'
  -- Unlimited correlated lookup retains all policy matches while preventing
  -- policies from becoming the outer driver and repeating the READY walk.
  limit all
) p on true
where u.seo_state='READY'
order by u.opportunity_id
$view$, opportunity_columns);
end $migration$;

-- CREATE OR REPLACE preserves the existing columns, owner and ACL. No grants,
-- policies, reducers, producer configuration or other consumer views change.
commit;
