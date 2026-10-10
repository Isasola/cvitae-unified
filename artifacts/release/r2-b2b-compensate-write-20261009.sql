-- WRITE COMPENSATION / NOT AUTHORIZED BY DEFAULT.
-- Removes ONLY mirrors whose lineage proves this historical reconciliation.
-- Refuses to proceed if the candidate set is no longer exactly 8 or if any
-- candidate has subsequent non-historical recruiter bridge lineage.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $guard$
declare v_count integer; v_future integer;
begin
  select count(distinct o.id) into v_count
  from public.opportunities o join public.opportunity_ingestion_events e on e.opportunity_id=o.id
  where o.source='recruiter_b2b' and e.adapter_id='recruiter-vacancy-declared-fields'
    and e.reason='HISTORICAL_RECONCILIATION';
  select count(distinct o.id) into v_future
  from public.opportunities o join public.opportunity_ingestion_events e on e.opportunity_id=o.id
  where o.source='recruiter_b2b' and e.adapter_id='recruiter-vacancy-declared-fields'
    and e.reason in ('FUTURE_CREATE','FUTURE_UPDATE','CLOSE_RETRY');
  if v_count<>8 or v_future<>0 then raise exception 'compensation_scope_changed:historical=%,future=%',v_count,v_future; end if;
end $guard$;
delete from public.opportunities o
where o.source='recruiter_b2b' and exists(
  select 1 from public.opportunity_ingestion_events e where e.opportunity_id=o.id
    and e.adapter_id='recruiter-vacancy-declared-fields' and e.reason='HISTORICAL_RECONCILIATION');
commit;
