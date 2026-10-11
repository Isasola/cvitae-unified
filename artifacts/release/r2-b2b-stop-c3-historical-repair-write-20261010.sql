-- WRITE / NOT AUTHORIZED BY DEFAULT.
-- Run only after 202610100001 and a fresh PASS from the STOP C3 READ_ONLY preview.
-- This updates the five proven mirrors; it creates no opportunity and touches no
-- OWNER_MISSING vacancy. Five append-only correction lineage events are expected.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.recruiter_vacancies in share row exclusive mode;
lock table public.opportunities in share row exclusive mode;
lock table public.opportunity_ingestion_events in share row exclusive mode;

do $guard$
declare v_total integer; v_candidates integer; v_linked_total integer; v_pending integer; v_open integer; v_closed integer;
  v_duplicates integer; v_invalid_owner integer; v_fields integer; v_lineage integer;
  v_activity_mismatch integer; v_country_nonnull integer; v_digest text; v_permission_digest text;
begin
  if '__EXPECTED_REPAIR_TARGET_DIGEST_FROM_STOP_C3_PREVIEW__' like '\_\_%' escape '\'
    or '__EXPECTED_PERMISSION_DIGEST_FROM_STOP_C3_PREVIEW__' like '\_\_%' escape '\' then
    raise exception 'replace_stop_c3_preview_digests';
  end if;
  with historical_events as (
    select e.* from public.opportunity_ingestion_events e
    where e.adapter_id='recruiter-vacancy-declared-fields' and e.reason='HISTORICAL_RECONCILIATION'
  ), candidates as (
    select distinct o.id opportunity_id,o.recruiter_vacancy_id
    from public.opportunities o join historical_events e on e.opportunity_id=o.id
    where o.source='recruiter_b2b' and e.outcome='INSERTED'
      and e.evidence->>'historical_created_by_reconciliation'='true'
  ), target as (
    select r.*,t.id owner_id,t.is_active owner_active,t.verification_status owner_verification_status,
      o.id opportunity_id,o.is_active opportunity_active,o.country_code,o.verification_status opportunity_verification_status,
      o.original_source_verified,u.lifecycle_state,u.lifecycle_reason,
      o.title is not distinct from r.title title_exact,o.organization is not distinct from r.company company_exact,
      o.description is not distinct from r.description description_exact,
      o.requirements is not distinct from case when nullif(trim(r.requirements),'') is null then null else jsonb_build_array(jsonb_build_object('text',r.requirements)) end requirements_exact,
      o.value is not distinct from nullif(trim(r.salary_range),'') compensation_exact,
      o.location is not distinct from r.location location_exact,o.type is not distinct from r.modality modality_exact,
      o.slug is not distinct from 'b2b-'||lower(r.slug) slug_exact,
      o.application_url is not distinct from 'https://cvitae.lat/vacante/'||r.slug application_url_exact
    from candidates c join public.recruiter_vacancies r on r.id=c.recruiter_vacancy_id
    join public.opportunities o on o.id=c.opportunity_id
    left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
    left join public.opportunity_universe_state u on u.opportunity_id=o.id
  )
  select count(*),count(*) filter(where is_active),count(*) filter(where not is_active),
    count(*) filter(where is_active is distinct from opportunity_active),count(*) filter(where country_code is not null),
    count(*) filter(where owner_id is null or not coalesce(owner_active,false) or owner_verification_status is distinct from 'verified'),
    count(*) filter(where not(title_exact and company_exact and description_exact and requirements_exact and compensation_exact
      and location_exact and modality_exact and slug_exact and application_url_exact)
      or opportunity_verification_status is distinct from 'pending' or original_source_verified is distinct from false),
    md5(coalesce(string_agg(jsonb_build_array(
      id::text,opportunity_id,is_active,opportunity_active,country_code,opportunity_verification_status,
      original_source_verified,lifecycle_state,lifecycle_reason,title_exact,company_exact,description_exact,
      requirements_exact,compensation_exact,location_exact,modality_exact,slug_exact,application_url_exact
    )::text,'|' order by id),''))
    into v_candidates,v_open,v_closed,v_activity_mismatch,v_country_nonnull,v_invalid_owner,v_fields,v_digest
  from target;
  select count(*)::integer into v_total from public.recruiter_vacancies;
  select count(*)::integer into v_linked_total from public.opportunities o
    where exists(select 1 from public.recruiter_vacancies r where r.id=o.recruiter_vacancy_id);
  select count(*)::integer into v_pending from public.recruiter_vacancies r
    left join public.opportunities o on o.recruiter_vacancy_id=r.id
    left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
    where t.id is null and o.id is null;
  select count(*)::integer into v_duplicates from (
    select recruiter_vacancy_id from public.opportunities where recruiter_vacancy_id is not null
    group by recruiter_vacancy_id having count(*)>1) duplicate;
  select count(*)::integer into v_lineage from public.opportunity_ingestion_events
    where adapter_id='recruiter-vacancy-declared-fields' and reason='HISTORICAL_RECONCILIATION';
  select md5(jsonb_build_object(
    'web_catalog_allowed',p->'web_catalog_allowed',
    'search_engine_indexing_allowed',p->'search_engine_indexing_allowed',
    'google_jobs_distribution_allowed',p->'google_jobs_distribution_allowed',
    'third_party_job_distribution_allowed',p->'third_party_job_distribution_allowed',
    'consumer_permissions',coalesce((select jsonb_agg(jsonb_build_object(
      'consumer',consumer,'permission_state',permission_state,'reason',reason,'provenance',provenance) order by consumer)
      from public.opportunity_source_consumer_permissions where canonical_source='recruiter_b2b'),'[]'::jsonb))::text)
    into v_permission_digest from (select public.canonical_opportunity_source_policy('recruiter_b2b') p) policy;
  if v_total<>8 or v_candidates<>5 or v_linked_total<>5 or v_pending<>3 or v_open<>3 or v_closed<>2
    or v_duplicates<>0 or v_invalid_owner<>0 or v_fields<>0 or v_lineage<>5
    or (v_activity_mismatch,v_country_nonnull) not in ((3,5),(0,0))
    or v_digest<>'__EXPECTED_REPAIR_TARGET_DIGEST_FROM_STOP_C3_PREVIEW__'
    or v_permission_digest<>'__EXPECTED_PERMISSION_DIGEST_FROM_STOP_C3_PREVIEW__' then
    raise exception 'stop_c3_repair_scope_changed:total=%,targets=%,linked_total=%,pending=%,open=%,closed=%,duplicates=%,invalid_owner=%,fields=%,lineage=%,activity_mismatch=%,country_nonnull=%,digest=%,permission_digest=%',
      v_total,v_candidates,v_linked_total,v_pending,v_open,v_closed,v_duplicates,v_invalid_owner,v_fields,v_lineage,
      v_activity_mismatch,v_country_nonnull,v_digest,v_permission_digest;
  end if;
end $guard$;

with candidates as (
  select distinct o.id opportunity_id,o.recruiter_vacancy_id
  from public.opportunities o
  join public.opportunity_ingestion_events e on e.opportunity_id=o.id
  where o.source='recruiter_b2b' and e.adapter_id='recruiter-vacancy-declared-fields'
    and e.reason='HISTORICAL_RECONCILIATION' and e.outcome='INSERTED'
    and e.evidence->>'historical_created_by_reconciliation'='true'
), target as (
  select o.id opportunity_id,r.id vacancy_id,r.is_active recruiter_active,
    o.is_active prior_opportunity_active,o.country_code prior_country_code
  from candidates c join public.recruiter_vacancies r on r.id=c.recruiter_vacancy_id
  join public.opportunities o on o.id=c.opportunity_id
)
insert into public.opportunity_ingestion_events(
  event_key,opportunity_id,emitted_source,canonical_source,producer_id,adapter_id,normalizer_version,
  normalized_fields,run_id,outcome,trace_state,trace_contract_version,identity_factual,trace_reason,reason,identity_sha256,evidence
)
select 'recruiter-lifecycle-country-repair:20261010:'||opportunity_id,opportunity_id,
  'recruiter_b2b','recruiter_b2b','recruiter-vacancy-rpc','recruiter-vacancy-declared-fields',
  'recruiter-lifecycle-country:v1',array['is_active','country_code'],
  'manual:recruiter-lifecycle-country:20261010',
  case when prior_opportunity_active is distinct from recruiter_active or prior_country_code is not null then 'UPDATED' else 'UNCHANGED' end,
  'TRACED','v2',true,'EXACT_RECRUITER_VACANCY_ID','HISTORICAL_LIFECYCLE_COUNTRY_REPAIR',
  encode(extensions.digest(convert_to('recruiter_b2b:'||vacancy_id::text,'UTF8'),'sha256'),'hex'),
  jsonb_build_object('vacancy_id',vacancy_id,'publisher_declared_active',recruiter_active,
    'before',jsonb_build_object('is_active',prior_opportunity_active,'country_code',prior_country_code),
    'after',jsonb_build_object('is_active',recruiter_active,'country_code',null),
    'factual_verification','PENDING','country_evidence','NOT_PROVIDED',
    'publication_authorized',false,'correction_migration','202610100001')
from target on conflict(event_key) do nothing;

with candidates as (
  select distinct o.id opportunity_id,o.recruiter_vacancy_id
  from public.opportunities o
  join public.opportunity_ingestion_events e on e.opportunity_id=o.id
  where o.source='recruiter_b2b' and e.adapter_id='recruiter-vacancy-declared-fields'
    and e.reason='HISTORICAL_RECONCILIATION' and e.outcome='INSERTED'
    and e.evidence->>'historical_created_by_reconciliation'='true'
)
update public.opportunities o set is_active=r.is_active,country_code=null,updated_at=now()
from candidates c join public.recruiter_vacancies r on r.id=c.recruiter_vacancy_id
where o.id=c.opportunity_id
  and (o.is_active is distinct from r.is_active or o.country_code is not null);

do $refresh_and_verify$
declare v_id text; v_open integer; v_closed integer; v_country integer; v_bad integer; v_events integer;
begin
  for v_id in
    select distinct o.id from public.opportunities o
    join public.opportunity_ingestion_events e on e.opportunity_id=o.id
    where o.source='recruiter_b2b' and e.adapter_id='recruiter-vacancy-declared-fields'
      and e.reason='HISTORICAL_RECONCILIATION' and e.outcome='INSERTED'
      and e.evidence->>'historical_created_by_reconciliation'='true'
  loop perform public.refresh_opportunity_universe(v_id,false); end loop;

  select count(*) filter(where r.is_active and o.is_active and u.lifecycle_state='ACTIVE_VALID'
      and u.lifecycle_reason='PUBLISHER_DECLARED_OPEN_FACTUAL_PENDING'),
    count(*) filter(where not r.is_active and not o.is_active and u.lifecycle_state='INACTIVE_VALID'
      and u.lifecycle_reason='PUBLISHER_CLOSED'),
    count(*) filter(where o.country_code is not null),
    count(*) filter(where o.verification_status is distinct from 'pending' or o.original_source_verified is distinct from false)
    into v_open,v_closed,v_country,v_bad
  from public.opportunities o join public.recruiter_vacancies r on r.id=o.recruiter_vacancy_id
  join public.opportunity_universe_state u on u.opportunity_id=o.id
  where exists(select 1 from public.opportunity_ingestion_events e where e.opportunity_id=o.id
    and e.reason='HISTORICAL_RECONCILIATION' and e.outcome='INSERTED'
    and e.evidence->>'historical_created_by_reconciliation'='true');
  select count(*)::integer into v_events from public.opportunity_ingestion_events
    where reason='HISTORICAL_LIFECYCLE_COUNTRY_REPAIR';
  if v_open<>3 or v_closed<>2 or v_country<>0 or v_bad<>0 or v_events<>5 then
    raise exception 'stop_c3_post_repair_failed:open=%,closed=%,country=%,factual=%,events=%',
      v_open,v_closed,v_country,v_bad,v_events;
  end if;
end $refresh_and_verify$;
commit;
