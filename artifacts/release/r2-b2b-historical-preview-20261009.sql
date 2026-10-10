-- READ_ONLY PREVIEW / DO NOT MODIFY DATA.
-- Run after schema migration 202610090001/2 only if STOP C schema apply was
-- separately approved. Returns the complete recruiter denominator (no LIMIT),
-- no CV/application content and no credentials.
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
    md5(coalesce(string_agg(to_jsonb(r)::text,'|' order by r.id),'')) row_digest
  from public.recruiter_vacancies r
), rows as (
  select r.id,r.is_active,
    (t.id is not null) owner_exists,
    coalesce(t.is_active,false) owner_active,
    (t.verification_status='verified') publisher_identity_verified,
    (nullif(trim(r.title),'') is not null) has_title,
    (nullif(trim(r.description),'') is not null) has_description,
    (nullif(trim(r.requirements),'') is not null) has_requirements,
    (nullif(trim(r.location),'') is not null) has_location,
    (nullif(trim(r.modality),'') is not null) has_work_arrangement,
    (nullif(trim(r.salary_range),'') is not null) has_compensation_text,
    (r.slug ~ '^[A-Za-z0-9-]{3,80}$') slug_valid,
    count(distinct o.id)::integer mirror_count,
    count(distinct o.id) filter(where o.source<>'recruiter_b2b')::integer mirror_source_conflicts,
    count(distinct c.id)::integer expected_slug_collisions,
    count(distinct u.id)::integer application_url_collisions,
    case
      when t.id is null then 'OWNER_MISSING'
      when not coalesce(t.is_active,false) then 'PUBLISHER_INACTIVE'
      when t.verification_status<>'verified' then 'PUBLISHER_IDENTITY_NOT_VERIFIED'
      when r.slug !~ '^[A-Za-z0-9-]{3,80}$' then 'INVALID_SLUG'
      when count(distinct o.id)>1 then 'DUPLICATE_MIRROR'
      when count(distinct o.id) filter(where o.source<>'recruiter_b2b')>0 then 'MIRROR_SOURCE_CONFLICT'
      when count(distinct c.id)>0 then 'EXPECTED_SLUG_COLLISION'
      when count(distinct u.id)>0 then 'APPLICATION_URL_COLLISION'
      when nullif(trim(r.title),'') is null or nullif(trim(r.description),'') is null
        or nullif(trim(r.requirements),'') is null or nullif(trim(r.location),'') is null
        or nullif(trim(r.modality),'') is null then 'QUALITY_MISSING'
      else 'INVENTORY_RECONCILABLE'
    end inventory_gate,
    case when not r.is_active then 'PUBLISHER_CLOSED'
      when (select value->>'web_catalog_allowed' from policy)='false' then 'WEB_CATALOG_DENIED'
      when coalesce((select value->>'catalog' from permissions),'UNKNOWN')<>'ALLOWED' then 'CATALOG_PERMISSION_UNKNOWN'
      else 'ROW_QUALITY_AND_UNIVERSE_STILL_REQUIRED'
    end catalog_gate,
    case when coalesce((select value->>'matching' from permissions),'UNKNOWN')<>'ALLOWED' then 'MATCHING_PERMISSION_UNKNOWN' else 'ROW_QUALITY_AND_UNIVERSE_STILL_REQUIRED' end matching_gate,
    case when coalesce((select value->>'alerts' from permissions),'UNKNOWN')<>'ALLOWED' then 'ALERTS_PERMISSION_UNKNOWN' else 'ROW_QUALITY_AND_UNIVERSE_STILL_REQUIRED' end alerts_gate,
    case when (select value->>'search_engine_indexing_allowed' from policy) is null then 'SEO_PERMISSION_UNKNOWN'
      when (select value->>'search_engine_indexing_allowed' from policy)='false' then 'SEO_PERMISSION_DENIED'
      else 'ROW_QUALITY_AND_UNIVERSE_STILL_REQUIRED' end seo_gate,
    case when (select value->>'google_jobs_distribution_allowed' from policy)='false' then 'GOOGLE_JOBS_DENIED' else 'GOOGLE_JOBS_PERMISSION_UNKNOWN' end google_jobs_gate,
    case when (select value->>'third_party_job_distribution_allowed' from policy)='false' then 'THIRD_PARTY_DENIED' else 'THIRD_PARTY_PERMISSION_UNKNOWN' end third_party_gate
  from public.recruiter_vacancies r
  left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
  left join public.opportunities o on o.recruiter_vacancy_id=r.id
  left join public.opportunities c on c.slug='b2b-'||lower(r.slug) and c.recruiter_vacancy_id is distinct from r.id
  left join public.opportunities u on u.application_url='https://cvitae.lat/vacante/'||r.slug and u.recruiter_vacancy_id is distinct from r.id
  group by r.id,r.is_active,t.id,t.is_active,t.verification_status,r.title,r.description,r.requirements,r.location,r.modality,r.salary_range,r.slug
)
select jsonb_build_object(
  'mode','READ_ONLY','expected_from_operator',jsonb_build_object('total',8,'active',6,'inactive',2),
  'denominator',to_jsonb(digest),
  'denominator_matches_evidence',(digest.total,digest.active,digest.inactive)=(8,6,2),
  'policy',(select value from policy),'permissions',(select value from permissions),
  'public_distribution_authorized',false,
  'rows',coalesce((select jsonb_agg(to_jsonb(rows) order by id) from rows),'[]'::jsonb)
) from digest;
