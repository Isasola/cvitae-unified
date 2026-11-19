-- Read-only operational aggregates. No backfill and no data mutation.
create or replace function public.admin_opportunity_pipeline_dashboard()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with rows as materialized (
    select verification_status, is_active, catalog_eligible, match_eligible, seo_eligible,
           seo_status, country_code, source, opportunity_kind, description, embedding,
           embedding_model, created_at, updated_at
    from public.opportunities
    where deleted_at is null
      and archived_at is null
  ), totals as (
    select count(*) as total,
      count(*) filter (where verification_status = 'pending') as pending,
      count(*) filter (where verification_status = 'in_review') as in_review,
      count(*) filter (where verification_status = 'verified') as verified,
      count(*) filter (where verification_status = 'rejected') as rejected,
      count(*) filter (where verification_status = 'quarantined') as quarantined,
      count(*) filter (where verification_status = 'verified' and is_active and catalog_eligible) as published,
      count(*) filter (where verification_status = 'verified' and is_active and match_eligible) as matching,
      count(*) filter (where seo_eligible) as seo_flag_true,
      count(*) filter (where seo_status = 'eligible') as seo_status_eligible,
      count(*) filter (where seo_status = 'review') as seo_review,
      count(*) filter (where seo_status = 'blocked') as seo_blocked,
      count(*) filter (where seo_status is null and verification_status = 'verified' and is_active and catalog_eligible) as seo_unevaluated,
      count(*) filter (where seo_eligible and coalesce(seo_status, '') <> 'eligible') as seo_drift_flag_without_status,
      count(*) filter (where seo_status = 'eligible' and not coalesce(seo_eligible, false)) as seo_drift_status_without_flag,
      count(*) filter (where (seo_eligible and coalesce(seo_status, '') <> 'eligible') or (seo_status = 'eligible' and not coalesce(seo_eligible, false))) as seo_drift_total,
      count(*) filter (where verification_status = 'verified' and is_active and match_eligible and embedding is not null) as embedding_ready,
      count(*) filter (where verification_status = 'verified' and is_active and match_eligible and embedding is not null) as embedding_vector_ready,
      count(*) filter (where verification_status = 'verified' and is_active and match_eligible and embedding_model is not null) as embedding_model_tagged,
      count(*) filter (where verification_status = 'verified' and is_active and match_eligible and embedding is not null and embedding_model is null) as embedding_vector_without_model,
      count(*) filter (where verification_status = 'verified' and is_active and match_eligible) as embedding_pool
    from rows
  ), countries as (select coalesce(nullif(country_code,''),'UNKNOWN') as key, count(*) as value from rows group by 1),
  kinds as (select coalesce(nullif(opportunity_kind,''),'sin_tipo') as key, count(*) as value from rows group by 1),
  sources as (
    select source, jsonb_build_object('total',count(*),'new_24h',count(*) filter(where created_at >= now()-interval '24 hours'),'new_7d',count(*) filter(where created_at >= now()-interval '7 days'),'verified',count(*) filter(where verification_status='verified'),'review',count(*) filter(where verification_status in ('pending','in_review')),'catalog',count(*) filter(where verification_status='verified' and is_active and catalog_eligible),'matching',count(*) filter(where verification_status='verified' and is_active and match_eligible),'seo',count(*) filter(where verification_status='verified' and is_active and catalog_eligible and seo_status='eligible'),'thin_description',count(*) filter(where length(coalesce(description,'')) < 80),'missing_country',count(*) filter(where country_code is null or country_code='' or country_code='UNKNOWN'),'last_seen',max(updated_at)) as value from rows group by source
  )
  select jsonb_build_object('counts',(select to_jsonb(totals) from totals),'countries',(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from countries),'types',(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from kinds),'sources',(select coalesce(jsonb_object_agg(coalesce(source,'unknown'),value),'{}'::jsonb) from sources));
$$;
revoke all on function public.admin_opportunity_pipeline_dashboard() from public, anon, authenticated;
grant execute on function public.admin_opportunity_pipeline_dashboard() to service_role;
