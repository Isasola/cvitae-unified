-- READ_ONLY / run after separately authorized schema + reconciliation writes.
-- Counts inventory and independent consumer decisions; equality is not expected.
with base as (
  select r.id,r.is_active recruiter_active,o.id opportunity_id,o.is_active opportunity_active,
    o.source,o.country_code,o.requirements,o.value,o.slug,u.lifecycle_state,u.catalog_state,
    u.final_matching_state,u.alerts_state,u.seo_state,u.provenance
  from public.recruiter_vacancies r
  left join public.opportunities o on o.recruiter_vacancy_id=r.id
  left join public.opportunity_universe_state u on u.opportunity_id=o.id
), counts as (
  select count(*) total_vacancies,count(*) filter(where recruiter_active) active_vacancies,
    count(*) filter(where not recruiter_active) inactive_vacancies,
    count(*) filter(where opportunity_id is not null) mirrors,
    count(*) filter(where opportunity_id is null) missing_mirror,
    count(*)-count(distinct opportunity_id) duplicate_mirrors,
    count(*) filter(where recruiter_active is distinct from opportunity_active) lifecycle_mismatch,
    count(*) filter(where not recruiter_active and ('READY' in (catalog_state,final_matching_state,alerts_state,seo_state))) closed_ready_anywhere,
    count(*) filter(where country_code is not null) country_inferred,
    count(*) filter(where catalog_state='READY') catalog_ready,
    count(*) filter(where final_matching_state='READY') matching_ready,
    count(*) filter(where alerts_state='READY') alerts_ready,
    count(*) filter(where seo_state='READY') seo_ready
  from base
), field_survival as (
  select count(*) filter(where r.requirements is not null and o.requirements=jsonb_build_array(jsonb_build_object('text',r.requirements))) requirements_exact,
    count(*) filter(where nullif(trim(r.salary_range),'') is not null and o.value=nullif(trim(r.salary_range),'')) compensation_text_exact,
    count(*) filter(where o.slug='b2b-'||lower(r.slug)) slug_exact
  from public.recruiter_vacancies r join public.opportunities o on o.recruiter_vacancy_id=r.id
)
select jsonb_build_object(
  'mode','READ_ONLY','counts',to_jsonb(counts),'field_survival',to_jsonb(field_survival),
  'acceptance',jsonb_build_object(
    'denominator_8',counts.total_vacancies=8,'active_6',counts.active_vacancies=6,'inactive_2',counts.inactive_vacancies=2,
    'one_mirror_each',counts.mirrors=8 and counts.missing_mirror=0 and counts.duplicate_mirrors=0,
    'lifecycle_aligned',counts.lifecycle_mismatch=0,'closed_not_ready',counts.closed_ready_anywhere=0,
    'no_country_invented',counts.country_inferred=0,'permissions_not_assumed',not exists(
      select 1 from public.opportunity_source_consumer_permissions where canonical_source='recruiter_b2b' and permission_state='ALLOWED')),
  'rows',(select jsonb_agg(to_jsonb(base) order by id) from base)
) from counts,field_survival;
