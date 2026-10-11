-- READ_ONLY PREVIEW / DO NOT MODIFY DATA.
-- Complete historical denominator, no LIMIT, CV/application content or credentials.
-- Run again immediately before the separately authorized reconciliation WRITE.
with policy as (
  select public.canonical_opportunity_source_policy('recruiter_b2b') value
), permissions as (
  select coalesce(jsonb_object_agg(consumer,permission_state),'{}'::jsonb) value
  from public.opportunity_source_consumer_permissions
  where canonical_source='recruiter_b2b'
), digest as (
  select count(*)::integer total,
    count(*) filter(where is_active)::integer active,
    count(*) filter(where not is_active)::integer inactive,
    md5(coalesce(string_agg(jsonb_build_array(
      r.id::text,r.title,r.description,r.requirements,r.location,r.modality,r.salary_range,
      r.company,r.slug,r.recruiter_token_id::text,r.is_active,r.created_at
    )::text,'|' order by r.id),'')) row_digest
  from public.recruiter_vacancies r
), facts as (
  select r.*,t.id owner_id,t.is_active owner_active,t.verification_status owner_verification_status,
    (select count(*) from public.opportunities o where o.recruiter_vacancy_id=r.id)::integer mirror_count,
    (select count(*) from public.opportunities o where o.recruiter_vacancy_id=r.id and o.source<>'recruiter_b2b')::integer mirror_source_conflicts,
    (select count(*) from public.opportunities o where o.slug='b2b-'||lower(r.slug) and o.recruiter_vacancy_id is distinct from r.id)::integer expected_slug_collisions,
    (select count(*) from public.opportunities o where o.application_url='https://cvitae.lat/vacante/'||r.slug and o.recruiter_vacancy_id is distinct from r.id)::integer application_url_collisions
  from public.recruiter_vacancies r
  left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
), classified as (
  select f.*,
    case
      when owner_id is null then 'OWNER_MISSING'
      when not coalesce(owner_active,false) then 'PUBLISHER_INACTIVE'
      when owner_verification_status is distinct from 'verified' then 'PUBLISHER_IDENTITY_NOT_VERIFIED'
      when slug is null or slug !~ '^[A-Za-z0-9-]{3,80}$' then 'INVALID_SLUG'
      when mirror_count>1 then 'DUPLICATE_MIRROR'
      when mirror_source_conflicts>0 then 'MIRROR_SOURCE_CONFLICT'
      when expected_slug_collisions>0 then 'EXPECTED_SLUG_COLLISION'
      when application_url_collisions>0 then 'APPLICATION_URL_COLLISION'
      when nullif(trim(title),'') is null or nullif(trim(description),'') is null
        or nullif(trim(requirements),'') is null or nullif(trim(location),'') is null
        or nullif(trim(modality),'') is null then 'QUALITY_MISSING'
      else 'INVENTORY_RECONCILABLE'
    end inventory_gate
  from facts f
), rows as (
  select id,is_active,(owner_id is not null) owner_exists,coalesce(owner_active,false) owner_active,
    (owner_verification_status='verified') publisher_identity_verified,
    (nullif(trim(title),'') is not null) has_title,
    (nullif(trim(description),'') is not null) has_description,
    (nullif(trim(requirements),'') is not null) has_requirements,
    (nullif(trim(location),'') is not null) has_location,
    (nullif(trim(modality),'') is not null) has_work_arrangement,
    (nullif(trim(salary_range),'') is not null) has_compensation_text,
    (slug ~ '^[A-Za-z0-9-]{3,80}$') slug_valid,mirror_count,mirror_source_conflicts,
    expected_slug_collisions,application_url_collisions,inventory_gate,
    case when inventory_gate='INVENTORY_RECONCILABLE' then 'ELIGIBLE'
      else 'HISTORICAL_UNRESOLVED' end reconciliation_state,
    case when not is_active then 'PUBLISHER_CLOSED'
      when (select value->>'web_catalog_allowed' from policy)='false' then 'WEB_CATALOG_DENIED'
      when coalesce((select value->>'catalog' from permissions),'UNKNOWN')<>'ALLOWED' then 'CATALOG_PERMISSION_UNKNOWN'
      else 'ROW_QUALITY_AND_UNIVERSE_STILL_REQUIRED' end catalog_gate,
    case when coalesce((select value->>'matching' from permissions),'UNKNOWN')<>'ALLOWED'
      then 'MATCHING_PERMISSION_UNKNOWN' else 'ROW_QUALITY_AND_UNIVERSE_STILL_REQUIRED' end matching_gate,
    case when coalesce((select value->>'alerts' from permissions),'UNKNOWN')<>'ALLOWED'
      then 'ALERTS_PERMISSION_UNKNOWN' else 'ROW_QUALITY_AND_UNIVERSE_STILL_REQUIRED' end alerts_gate,
    case when (select value->>'search_engine_indexing_allowed' from policy) is null then 'SEO_PERMISSION_UNKNOWN'
      when (select value->>'search_engine_indexing_allowed' from policy)='false' then 'SEO_PERMISSION_DENIED'
      else 'ROW_QUALITY_AND_UNIVERSE_STILL_REQUIRED' end seo_gate,
    case when (select value->>'google_jobs_distribution_allowed' from policy)='false'
      then 'GOOGLE_JOBS_DENIED' else 'GOOGLE_JOBS_PERMISSION_UNKNOWN' end google_jobs_gate,
    case when (select value->>'third_party_job_distribution_allowed' from policy)='false'
      then 'THIRD_PARTY_DENIED' else 'THIRD_PARTY_PERMISSION_UNKNOWN' end third_party_gate
  from classified
), accounting as (
  select count(*) filter(where reconciliation_state='ELIGIBLE')::integer reconcilable,
    count(*) filter(where reconciliation_state='HISTORICAL_UNRESOLVED')::integer pending,
    count(*) filter(where inventory_gate='OWNER_MISSING')::integer owner_missing
  from rows
), pending_by_reason as (
  select coalesce(jsonb_object_agg(inventory_gate,n),'{}'::jsonb) value
  from (select inventory_gate,count(*) n from rows where reconciliation_state='HISTORICAL_UNRESOLVED' group by inventory_gate) q
)
select jsonb_build_object(
  'mode','READ_ONLY','expected_from_stop_c1',jsonb_build_object('total',8,'active',6,'inactive',2,'reconcilable',5,'pending',3,'owner_missing',3),
  'denominator',to_jsonb(digest)||jsonb_build_object('row_digest_contract','RECRUITER_VACANCY_V1'),
  'accounting',to_jsonb(accounting)||jsonb_build_object('accounted',accounting.reconcilable+accounting.pending,'pending_by_reason',(select value from pending_by_reason)),
  'evidence_matches_stop_c1',(digest.total,digest.active,digest.inactive,accounting.reconcilable,accounting.pending,accounting.owner_missing)=(8,6,2,5,3,3),
  'policy',(select value from policy),'permissions',(select value from permissions),
  'public_distribution_authorized',false,
  'rows',coalesce((select jsonb_agg(to_jsonb(rows) order by id) from rows),'[]'::jsonb)
) from digest,accounting;
