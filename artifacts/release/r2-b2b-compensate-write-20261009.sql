-- WRITE COMPENSATION / NOT AUTHORIZED BY DEFAULT.
-- Replace the digest marker with compensation_scope.mirror_digest from the
-- post-apply verifier. Removes only rows proven INSERTED (never UPDATED) by
-- this historical reconciliation and belonging to the exact verified set;
-- the 3 unresolved recruiter rows remain untouched.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.opportunities in share row exclusive mode;
lock table public.opportunity_ingestion_events in share mode;
do $guard$
declare v_count integer; v_digest text; v_future integer; v_historical_events integer; v_ambiguous integer;
begin
  if '__EXPECTED_HISTORICAL_MIRROR_DIGEST_FROM_POST_VERIFY__' like '\_\_%' escape '\' then
    raise exception 'replace_expected_historical_mirror_digest';
  end if;
  with candidates as (
    select distinct o.id
    from public.opportunities o
    join public.opportunity_ingestion_events e on e.opportunity_id=o.id
    where o.source='recruiter_b2b' and e.adapter_id='recruiter-vacancy-declared-fields'
      and e.reason='HISTORICAL_RECONCILIATION' and e.outcome='INSERTED'
      and e.evidence->>'historical_created_by_reconciliation'='true'
  )
  select count(*),md5(coalesce(string_agg(id::text,'|' order by id),'')) into v_count,v_digest from candidates;
  select count(*)::integer,
    count(*) filter(where outcome<>'INSERTED' or evidence->>'historical_created_by_reconciliation' is distinct from 'true')::integer
    into v_historical_events,v_ambiguous
  from public.opportunity_ingestion_events
  where adapter_id='recruiter-vacancy-declared-fields' and reason='HISTORICAL_RECONCILIATION';
  with candidates as (
    select distinct o.id
    from public.opportunities o
    join public.opportunity_ingestion_events e on e.opportunity_id=o.id
    where o.source='recruiter_b2b' and e.adapter_id='recruiter-vacancy-declared-fields'
      and e.reason='HISTORICAL_RECONCILIATION' and e.outcome='INSERTED'
      and e.evidence->>'historical_created_by_reconciliation'='true'
  )
  select count(distinct c.id) into v_future
  from candidates c
  join public.opportunity_ingestion_events e on e.opportunity_id=c.id
  where e.adapter_id='recruiter-vacancy-declared-fields'
    and e.reason in ('FUTURE_CREATE','FUTURE_UPDATE','CLOSE_RETRY','HISTORICAL_LIFECYCLE_COUNTRY_REPAIR');
  if v_count<>5 or v_historical_events<>5 or v_ambiguous<>0
    or v_digest<>'__EXPECTED_HISTORICAL_MIRROR_DIGEST_FROM_POST_VERIFY__' or v_future<>0 then
    raise exception 'compensation_scope_changed:candidates=%,events=%,ambiguous=%,digest=%,future_on_candidates=%',
      v_count,v_historical_events,v_ambiguous,v_digest,v_future;
  end if;
end $guard$;
with candidates as (
  select distinct o.id
  from public.opportunities o
  join public.opportunity_ingestion_events e on e.opportunity_id=o.id
  where o.source='recruiter_b2b' and e.adapter_id='recruiter-vacancy-declared-fields'
    and e.reason='HISTORICAL_RECONCILIATION' and e.outcome='INSERTED'
    and e.evidence->>'historical_created_by_reconciliation'='true'
)
delete from public.opportunities o using candidates c where o.id=c.id;
commit;
