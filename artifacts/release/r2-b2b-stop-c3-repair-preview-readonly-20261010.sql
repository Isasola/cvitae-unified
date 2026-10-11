-- READ_ONLY / run before any write, then rerun after the corrective migration
-- and before authorizing the separate historical repair. No LIMIT is used.
with schema_contract as (
  select
    exists(select 1 from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid=t.tgrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='opportunities'
        and t.tgname='zzz_recruiter_declared_lifecycle_country' and not t.tgisinternal) trigger_installed,
    coalesce(pg_get_functiondef(to_regprocedure('public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)'))
      like '%PUBLISHER_DECLARED_OPEN_FACTUAL_PENDING%',false) reducer_correction_installed,
    coalesce(pg_get_functiondef(to_regprocedure('public.guard_recruiter_declared_lifecycle_country()'))
      like '%new.country_code:=null%',false) country_guard_installed
), policy as (
  select public.canonical_opportunity_source_policy('recruiter_b2b') value
), permissions as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'consumer',consumer,'permission_state',permission_state,'reason',reason,'provenance',provenance)
    order by consumer),'[]'::jsonb) value
  from public.opportunity_source_consumer_permissions
  where canonical_source='recruiter_b2b'
), policy_snapshot as (
  select jsonb_build_object(
    'web_catalog_allowed',policy.value->'web_catalog_allowed',
    'search_engine_indexing_allowed',policy.value->'search_engine_indexing_allowed',
    'google_jobs_distribution_allowed',policy.value->'google_jobs_distribution_allowed',
    'third_party_job_distribution_allowed',policy.value->'third_party_job_distribution_allowed',
    'consumer_permissions',permissions.value) value
  from policy,permissions
), historical_events as (
  select e.* from public.opportunity_ingestion_events e
  where e.adapter_id='recruiter-vacancy-declared-fields'
    and e.reason='HISTORICAL_RECONCILIATION'
), candidates as (
  select distinct o.id opportunity_id,o.recruiter_vacancy_id
  from public.opportunities o
  join historical_events e on e.opportunity_id=o.id
  where o.source='recruiter_b2b' and e.outcome='INSERTED'
    and e.evidence->>'historical_created_by_reconciliation'='true'
), rows as (
  select r.id vacancy_id,r.recruiter_token_id,r.is_active recruiter_active,
    t.id owner_id,t.is_active owner_active,t.verification_status owner_verification_status,
    c.opportunity_id,(select count(*) from public.opportunities x where x.recruiter_vacancy_id=r.id)::integer actual_mirror_count,
    o.is_active opportunity_active,o.country_code,o.verification_status,
    o.original_source_verified,u.lifecycle_state,u.lifecycle_reason,
    o.title is not distinct from r.title title_exact,
    o.organization is not distinct from r.company company_exact,
    o.description is not distinct from r.description description_exact,
    o.requirements is not distinct from case when nullif(trim(r.requirements),'') is null then null
      else jsonb_build_array(jsonb_build_object('text',r.requirements)) end requirements_exact,
    o.value is not distinct from nullif(trim(r.salary_range),'') compensation_exact,
    o.location is not distinct from r.location location_exact,
    o.type is not distinct from r.modality modality_exact,
    o.slug is not distinct from 'b2b-'||lower(r.slug) slug_exact,
    o.application_url is not distinct from 'https://cvitae.lat/vacante/'||r.slug application_url_exact
  from public.recruiter_vacancies r
  left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
  left join candidates c on c.recruiter_vacancy_id=r.id
  left join public.opportunities o on o.id=c.opportunity_id
  left join public.opportunity_universe_state u on u.opportunity_id=o.id
), target as (
  select * from rows where opportunity_id is not null
), counts as (
  select
    (select count(*) from rows)::integer total_vacancies,
    (select count(*) from target)::integer mirrors,
    (select sum(actual_mirror_count) from rows)::integer actual_mirrors,
    (select count(*) from rows where owner_id is null and actual_mirror_count=0)::integer owner_missing_without_mirror,
    (select count(*) from target where recruiter_active)::integer declared_open,
    (select count(*) from target where not recruiter_active)::integer declared_closed,
    (select count(*) from target where recruiter_active is distinct from opportunity_active)::integer activity_mismatch,
    (select count(*) from target where country_code is not null)::integer inferred_country,
    (select count(*) from target where lifecycle_state='INACTIVE_VALID')::integer currently_inactive_lifecycle,
    (select count(*) from (select o.recruiter_vacancy_id from public.opportunities o
      join public.recruiter_vacancies r on r.id=o.recruiter_vacancy_id
      group by o.recruiter_vacancy_id having count(*)>1) duplicate)::integer duplicate_groups,
    (select count(*) from historical_events)::integer historical_event_count,
    (select count(*) from target where owner_id is null or not coalesce(owner_active,false)
      or owner_verification_status is distinct from 'verified')::integer invalid_target_owner,
    (select count(*) from target where verification_status is distinct from 'pending'
      or original_source_verified is distinct from false)::integer factual_state_mismatch,
    (select count(*) from target where not(title_exact and company_exact and description_exact and requirements_exact
      and compensation_exact and location_exact and modality_exact and slug_exact and application_url_exact))::integer field_mismatch
), digests as (
  select md5(coalesce(string_agg(jsonb_build_array(
    vacancy_id::text,opportunity_id,recruiter_active,opportunity_active,country_code,
    verification_status,original_source_verified,lifecycle_state,lifecycle_reason,
    title_exact,company_exact,description_exact,requirements_exact,compensation_exact,
    location_exact,modality_exact,slug_exact,application_url_exact
  )::text,'|' order by vacancy_id),'')) repair_target_digest
  from target
)
select jsonb_build_object(
  'mode','READ_ONLY','operation','STOP_C3_RECRUITER_LIFECYCLE_COUNTRY_REPAIR',
  'schema_contract',to_jsonb(schema_contract),
  'counts',to_jsonb(counts),'repair_target_digest',digests.repair_target_digest,
  'permission_snapshot',policy_snapshot.value,
  'permission_digest',md5(policy_snapshot.value::text),
  'write_preconditions',jsonb_build_object(
    'denominator_8',counts.total_vacancies=8,
    'exactly_5_existing_mirrors',counts.mirrors=5,
    'no_mirrors_outside_lineage',counts.actual_mirrors=5,
    'owner_missing_3_preserved_without_mirror',counts.owner_missing_without_mirror=3,
    'declared_3_open_2_closed',counts.declared_open=3 and counts.declared_closed=2,
    'reproduces_activity_regression',counts.activity_mismatch=3,
    'reproduces_country_regression',counts.inferred_country=5,
    'reproduces_inactive_lifecycle_regression',counts.currently_inactive_lifecycle=5,
    'no_duplicates',coalesce(counts.duplicate_groups,0)=0,
    'lineage_exactly_5',counts.historical_event_count=5,
    'owners_valid_for_all_targets',counts.invalid_target_owner=0,
    'factual_verification_remains_pending',counts.factual_state_mismatch=0,
    'all_declared_fields_still_exact',counts.field_mismatch=0,
    'schema_ready_for_historical_repair',schema_contract.trigger_installed
      and schema_contract.reducer_correction_installed and schema_contract.country_guard_installed,
    'distribution_not_authorized',policy_snapshot.value->>'web_catalog_allowed'='false'
      and policy_snapshot.value->'search_engine_indexing_allowed'='null'::jsonb
      and policy_snapshot.value->>'google_jobs_distribution_allowed'='false'
      and policy_snapshot.value->>'third_party_job_distribution_allowed'='false'
      and not exists(select 1 from public.opportunity_source_consumer_permissions
        where canonical_source='recruiter_b2b' and permission_state='ALLOWED')),
  'targets',(select jsonb_agg(to_jsonb(target) order by vacancy_id) from target)
) from counts,digests,policy_snapshot,schema_contract;
