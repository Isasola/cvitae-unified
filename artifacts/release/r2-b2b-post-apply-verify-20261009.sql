-- READ_ONLY / run after separately authorized schema + reconciliation writes.
-- The expected historical result is 5 linked mirrors plus 3 preserved,
-- explicitly diagnosed rows. Consumer decisions remain independent.
with policy as (
  select public.canonical_opportunity_source_policy('recruiter_b2b') value
), facts as (
  select r.*,t.id owner_id,t.is_active owner_active,t.verification_status owner_verification_status,
    (select count(*) from public.opportunities x where x.recruiter_vacancy_id=r.id)::integer mirror_count,
    (select x.id from public.opportunities x where x.recruiter_vacancy_id=r.id order by x.id limit 1) opportunity_id,
    (select count(*) from public.opportunities x where x.recruiter_vacancy_id=r.id and x.source<>'recruiter_b2b')::integer mirror_source_conflicts,
    (select count(*) from public.opportunities x where x.slug='b2b-'||lower(r.slug) and x.recruiter_vacancy_id is distinct from r.id)::integer expected_slug_collisions,
    (select count(*) from public.opportunities x where x.application_url='https://cvitae.lat/vacante/'||r.slug and x.recruiter_vacancy_id is distinct from r.id)::integer application_url_collisions
  from public.recruiter_vacancies r
  left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
), classified as (
  select f.*,case
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
  end inventory_gate from facts f
), base as (
  select c.id,c.is_active recruiter_active,c.inventory_gate,
    case when c.inventory_gate='INVENTORY_RECONCILABLE' then 'ELIGIBLE' else 'HISTORICAL_UNRESOLVED' end reconciliation_state,
    c.mirror_count,o.id opportunity_id,o.is_active opportunity_active,o.source,o.country_code,
    o.requirements,o.value,o.slug,o.application_url,u.lifecycle_state,u.catalog_state,
    u.final_matching_state,u.alerts_state,u.seo_state,u.provenance
  from classified c
  left join public.opportunities o on o.id=c.opportunity_id
  left join public.opportunity_universe_state u on u.opportunity_id=o.id
), counts as (
  select count(*)::integer total_vacancies,
    count(*) filter(where recruiter_active)::integer active_vacancies,
    count(*) filter(where not recruiter_active)::integer inactive_vacancies,
    count(*) filter(where reconciliation_state='ELIGIBLE')::integer reconcilable,
    count(*) filter(where reconciliation_state='HISTORICAL_UNRESOLVED')::integer pending,
    count(*) filter(where inventory_gate='OWNER_MISSING')::integer owner_missing,
    count(*) filter(where mirror_count=1)::integer mirrors,
    count(*) filter(where mirror_count=0)::integer missing_mirror,
    count(*) filter(where mirror_count>1)::integer duplicate_mirrors,
    count(*) filter(where reconciliation_state='ELIGIBLE' and mirror_count<>1)::integer eligible_without_one_mirror,
    count(*) filter(where reconciliation_state='HISTORICAL_UNRESOLVED' and mirror_count<>0)::integer unresolved_with_mirror,
    count(*) filter(where mirror_count=1 and recruiter_active is distinct from opportunity_active)::integer lifecycle_mismatch,
    count(*) filter(where mirror_count=1 and opportunity_id is not null and lifecycle_state is null)::integer missing_universe_state,
    count(*) filter(where mirror_count=1 and (
      (recruiter_active and lifecycle_state in ('EXPIRED','DELETED','ARCHIVED','HARD_DEAD','INACTIVE_VALID'))
      or (not recruiter_active and lifecycle_state='ACTIVE_VALID')))::integer lifecycle_state_contradictions,
    count(*) filter(where mirror_count=1 and not recruiter_active and ('READY' in (catalog_state,final_matching_state,alerts_state,seo_state)))::integer closed_ready_anywhere,
    count(*) filter(where mirror_count=1 and country_code is not null)::integer country_inferred,
    count(*) filter(where catalog_state='READY')::integer catalog_ready,
    count(*) filter(where final_matching_state='READY')::integer matching_ready,
    count(*) filter(where alerts_state='READY')::integer alerts_ready,
    count(*) filter(where seo_state='READY')::integer seo_ready
  from base
), field_survival as (
  select count(*)::integer linked,
    count(*) filter(where o.title is not distinct from r.title)::integer title_exact,
    count(*) filter(where o.organization is not distinct from r.company)::integer company_exact,
    count(*) filter(where o.description is not distinct from r.description)::integer description_exact,
    count(*) filter(where o.requirements is not distinct from case when nullif(trim(r.requirements),'') is null then null else jsonb_build_array(jsonb_build_object('text',r.requirements)) end)::integer requirements_exact,
    count(*) filter(where o.value is not distinct from nullif(trim(r.salary_range),''))::integer compensation_text_exact,
    count(*) filter(where o.location is not distinct from r.location)::integer location_exact,
    count(*) filter(where o.type is not distinct from r.modality)::integer modality_exact,
    count(*) filter(where o.slug='b2b-'||lower(r.slug))::integer slug_exact,
    count(*) filter(where o.application_url='https://cvitae.lat/vacante/'||r.slug)::integer application_url_exact,
    count(*) filter(where o.source='recruiter_b2b')::integer source_exact,
    count(*) filter(where o.is_active is not distinct from r.is_active)::integer lifecycle_flag_exact
  from public.recruiter_vacancies r
  join public.opportunities o on o.recruiter_vacancy_id=r.id
), historical_events as (
  select e.*
  from public.opportunity_ingestion_events e
  where e.adapter_id='recruiter-vacancy-declared-fields' and e.reason='HISTORICAL_RECONCILIATION'
), historical_candidates as (
  select distinct o.id
  from public.opportunities o
  join historical_events e on e.opportunity_id=o.id
  where o.source='recruiter_b2b' and e.outcome='INSERTED'
    and e.evidence->>'historical_created_by_reconciliation'='true'
), historical_event_summary as (
  select count(*)::integer historical_event_count,
    count(*) filter(where outcome='INSERTED' and evidence->>'historical_created_by_reconciliation'='true')::integer exact_created_event_count,
    count(*) filter(where outcome<>'INSERTED' or evidence->>'historical_created_by_reconciliation' is distinct from 'true')::integer ambiguous_historical_event_count
  from historical_events
), historical_summary as (
  select count(*)::integer compensable_mirror_count,
    md5(coalesce(string_agg(id::text,'|' order by id),'')) mirror_digest,
    count(*) filter(where not exists(
      select 1 from base b where b.opportunity_id=historical_candidates.id
        and b.reconciliation_state='ELIGIBLE' and b.mirror_count=1))::integer candidates_outside_linked_set
  from historical_candidates
)
select jsonb_build_object(
  'mode','READ_ONLY','counts',to_jsonb(counts),'field_survival',to_jsonb(field_survival),
  'compensation_scope',to_jsonb(historical_summary)||to_jsonb(historical_event_summary),
  'acceptance',jsonb_build_object(
    'denominator_8',counts.total_vacancies=8,'active_6',counts.active_vacancies=6,'inactive_2',counts.inactive_vacancies=2,
    'accounted_5_plus_3',counts.reconcilable=5 and counts.pending=3 and counts.reconcilable+counts.pending=8,
    'owner_missing_3',counts.owner_missing=3,
    'all_reconcilable_linked',counts.eligible_without_one_mirror=0 and counts.mirrors=5,
    'all_pending_preserved_unlinked',counts.unresolved_with_mirror=0 and counts.missing_mirror=3,
    'no_duplicate_mirrors',counts.duplicate_mirrors=0,
    'lifecycle_aligned',counts.lifecycle_mismatch=0,'universe_state_present_for_linked',counts.missing_universe_state=0,
    'universe_lifecycle_not_contradictory',counts.lifecycle_state_contradictions=0,
    'closed_not_ready',counts.closed_ready_anywhere=0,'no_country_invented',counts.country_inferred=0,
    'all_declared_fields_survive',field_survival.linked=5 and field_survival.title_exact=5
      and field_survival.company_exact=5 and field_survival.description_exact=5
      and field_survival.requirements_exact=5 and field_survival.compensation_text_exact=5
      and field_survival.location_exact=5 and field_survival.modality_exact=5
      and field_survival.slug_exact=5 and field_survival.application_url_exact=5,
    'source_and_lifecycle_survive',field_survival.source_exact=5 and field_survival.lifecycle_flag_exact=5,
    'historical_lineage_exactly_five_new_inserts',historical_event_summary.historical_event_count=5
      and historical_event_summary.exact_created_event_count=5 and historical_event_summary.ambiguous_historical_event_count=0,
    'historical_compensation_scope_is_linked_set',historical_summary.compensable_mirror_count=counts.mirrors
      and historical_summary.candidates_outside_linked_set=0 and not exists(
        select 1 from base b where b.reconciliation_state='ELIGIBLE' and b.mirror_count=1
          and not exists(select 1 from historical_candidates h where h.id=b.opportunity_id)),
    'web_catalog_still_denied',(policy.value->>'web_catalog_allowed')='false',
    'seo_permission_still_unknown',(policy.value->>'search_engine_indexing_allowed') is null,
    'google_jobs_still_denied',(policy.value->>'google_jobs_distribution_allowed')='false',
    'third_party_still_denied',(policy.value->>'third_party_job_distribution_allowed')='false',
    'permissions_not_assumed',not exists(
      select 1 from public.opportunity_source_consumer_permissions
      where canonical_source='recruiter_b2b' and permission_state='ALLOWED')),
  'rows',(select jsonb_agg(to_jsonb(base) order by id) from base)
) from counts,field_survival,historical_summary,historical_event_summary,policy;
