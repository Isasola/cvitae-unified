-- Fix: opportunity_final_matching_universe ORDER BY created_at LIMIT 300 still
-- scanned all ~7125 READY rows to sort them.
-- Putting opportunities as the outer table lets Postgres drive via the existing
-- opportunities_created_idx (created_at DESC) and do a nested-loop index lookup
-- into opportunity_universe_state; with LIMIT 300 it stops after ~700 rows.

create or replace view public.opportunity_final_matching_universe
with (security_invoker = true) as
select o.*,
       u.lifecycle_state            as universe_lifecycle_state,
       u.matching_row_state         as universe_matching_row_state,
       u.source_matching_state      as universe_source_matching_state,
       u.final_matching_state       as universe_final_matching_state,
       u.alerts_state               as universe_alerts_state
from   public.opportunities o
join   public.opportunity_universe_state u on u.opportunity_id = o.id::text
where  u.final_matching_state = 'READY';

create or replace view public.opportunity_catalog_universe
with (security_invoker = true) as
select o.*,
       u.lifecycle_state as universe_lifecycle_state,
       u.catalog_state   as universe_catalog_state
from   public.opportunities o
join   public.opportunity_universe_state u on u.opportunity_id = o.id::text
where  u.catalog_state = 'READY';

create or replace view public.opportunity_alert_universe
with (security_invoker = true) as
select o.*,
       u.lifecycle_state          as universe_lifecycle_state,
       u.alerts_state             as universe_alerts_state,
       u.final_matching_state     as universe_final_matching_state
from   public.opportunities o
join   public.opportunity_universe_state u on u.opportunity_id = o.id::text
where  u.alerts_state = 'READY';

revoke all on public.opportunity_final_matching_universe,
              public.opportunity_catalog_universe,
              public.opportunity_alert_universe
  from public, anon, authenticated;
grant select on public.opportunity_final_matching_universe,
               public.opportunity_catalog_universe,
               public.opportunity_alert_universe
  to service_role;
