-- Fix: opportunity_final_matching_universe and related views called
-- opportunity_deadline_state(o.deadline) for every READY row.
-- With 7000+ READY rows and the function being stable plpgsql (not inlined),
-- this added ~2s per query causing match-batch HTTP 500 timeouts.
--
-- The deadline check in the view is redundant because:
--   final_matching_state='READY' implies lifecycle_state='ACTIVE_VALID' which
--   means the universe reducer has already verified the deadline was not expired
--   at the last refresh cycle. The hourly maintenance cron expires stale rows.
--   An at-most-1h window is acceptable for matching staleness.
--
-- Similarly for catalog and alerts universe views.

-- Matching universe: drop deadline function call, drive from universe_state
create or replace view public.opportunity_final_matching_universe
with (security_invoker = true) as
select o.*,
       u.lifecycle_state            as universe_lifecycle_state,
       u.matching_row_state         as universe_matching_row_state,
       u.source_matching_state      as universe_source_matching_state,
       u.final_matching_state       as universe_final_matching_state,
       u.alerts_state               as universe_alerts_state
from   public.opportunity_universe_state u
join   public.opportunities o on o.id::text = u.opportunity_id
where  u.final_matching_state = 'READY';

-- Catalog universe
create or replace view public.opportunity_catalog_universe
with (security_invoker = true) as
select o.*,
       u.lifecycle_state as universe_lifecycle_state,
       u.catalog_state   as universe_catalog_state
from   public.opportunity_universe_state u
join   public.opportunities o on o.id::text = u.opportunity_id
where  u.catalog_state = 'READY';

-- Alerts universe
create or replace view public.opportunity_alert_universe
with (security_invoker = true) as
select o.*,
       u.lifecycle_state          as universe_lifecycle_state,
       u.alerts_state             as universe_alerts_state,
       u.final_matching_state     as universe_final_matching_state
from   public.opportunity_universe_state u
join   public.opportunities o on o.id::text = u.opportunity_id
where  u.alerts_state = 'READY';

-- Partial index to speed up the most common query pattern:
-- match-batch queries with ORDER BY created_at DESC LIMIT 300
-- The index on opportunity_universe_state lets Postgres resolve READY rows
-- in one index scan; the join to opportunities uses the PK (fast lookup).
-- Since created_at is in opportunities not universe_state, the sort is still
-- needed, but the scan is now O(READY_COUNT) not O(ALL_ROWS).
create index if not exists opportunity_universe_matching_ready_idx
  on public.opportunity_universe_state (opportunity_id)
  where final_matching_state = 'READY';

create index if not exists opportunity_universe_alerts_ready_idx
  on public.opportunity_universe_state (opportunity_id)
  where alerts_state = 'READY';

create index if not exists opportunity_universe_catalog_ready_idx
  on public.opportunity_universe_state (opportunity_id)
  where catalog_state = 'READY';

-- Restore grants (views were replaced above)
revoke all on public.opportunity_final_matching_universe,
              public.opportunity_catalog_universe,
              public.opportunity_alert_universe
  from public, anon, authenticated;
grant select on public.opportunity_final_matching_universe,
               public.opportunity_catalog_universe,
               public.opportunity_alert_universe
  to service_role;
