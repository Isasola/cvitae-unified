-- Read-only whole-inventory pipeline accounting. Run after the pipeline-ledger migration.
with p as materialized (
  select * from public.opportunity_pipeline_status
), totals as (
  select count(*) total_inventory,
    count(*) filter(where ingestion_state='TRACED') ingestion_traced,
    count(*) filter(where ingestion_state='HISTORICAL_DB_PRESENCE') ingestion_historical_untraced,
    count(*) filter(where observation_state='MISSING') observation_missing,
    count(*) filter(where observation_state<>'MISSING') observation_present,
    count(*) filter(where factory_status='ready') factory_ready,
    count(*) filter(where factory_status='review') factory_review,
    count(*) filter(where factory_status='pending') factory_pending,
    count(*) filter(where factory_status='blocked') factory_blocked,
    count(*) filter(where factory_status='failed') factory_failed,
    count(*) filter(where verification_status='verified') verification_verified,
    count(*) filter(where verification_status='in_review') verification_in_review,
    count(*) filter(where lifecycle_state='ACTIVE_VALID') lifecycle_active_valid,
    count(*) filter(where lifecycle_state='LIFECYCLE_UNKNOWN') lifecycle_unknown,
    count(*) filter(where catalog_state='READY') catalog_ready,
    count(*) filter(where final_matching_state='READY') matching_ready,
    count(*) filter(where alerts_state='READY') alerts_ready,
    count(*) filter(where seo_state='READY') seo_ready,
    count(*) filter(where next_action_reason is null or btrim(next_action_reason)='') no_reason_rows
  from p
), source_rows as (
  select canonical_source source, count(*) inventory,
    count(*) filter(where created_at>=now()-interval '24 hours') new_24h,
    count(*) filter(where created_at>=now()-interval '7 days') new_7d,
    count(*) filter(where ingestion_state='TRACED') ingestion_traced,
    count(*) filter(where observation_state='MISSING') observation_missing,
    count(*) filter(where factory_status='ready') factory_ready,
    count(*) filter(where factory_status='review') factory_review,
    count(*) filter(where factory_status='pending') factory_pending,
    count(*) filter(where factory_status='blocked') factory_blocked,
    count(*) filter(where factory_status='failed') factory_failed,
    count(*) filter(where verification_status='verified') verified,
    count(*) filter(where verification_status='in_review') in_review,
    count(*) filter(where lifecycle_state='ACTIVE_VALID') lifecycle_active_valid,
    count(*) filter(where lifecycle_state='LIFECYCLE_UNKNOWN') lifecycle_unknown,
    count(*) filter(where catalog_state='READY') catalog_ready,
    count(*) filter(where final_matching_state='READY') matching_ready,
    count(*) filter(where alerts_state='READY') alerts_ready,
    count(*) filter(where seo_state='READY') seo_ready,
    min(updated_at) filter(where next_action<>'NO_ACTION') oldest_unresolved,
    max(ingestion_received_at) last_ingestion_trace_at,
    (array_agg(run_id order by ingestion_received_at desc) filter(where run_id is not null))[1] latest_run_id,
    mode() within group(order by next_action) dominant_next_action
  from p group by canonical_source
), reasons as (
  select count(*) filter(where ingestion_reason is null or btrim(ingestion_reason)=''
      or observation_reason is null or btrim(observation_reason)=''
      or verification_reason is null or btrim(verification_reason)=''
      or lifecycle_reason is null or btrim(lifecycle_reason)=''
      or factory_reason is null or btrim(factory_reason)=''
      or source_operational_reason is null or btrim(source_operational_reason)=''
      or catalog_reason is null or btrim(catalog_reason)=''
      or matching_reason is null or btrim(matching_reason)=''
      or alerts_reason is null or btrim(alerts_reason)=''
      or seo_reason is null or btrim(seo_reason)=''
      or next_action is null or btrim(next_action)=''
      or next_action_reason is null or btrim(next_action_reason)='') unexplained_rows
  from p
)
select jsonb_build_object(
  'TOTAL_INVENTORY',(select total_inventory from totals),
  'PIPELINE_ROWS',(select count(*) from p),
  'PIPELINE_DUPLICATES',(select count(*)-count(distinct opportunity_id) from p),
  'ROWS_WITHOUT_PIPELINE_STATUS',(select count(*) from public.opportunities o where not exists(select 1 from p where p.opportunity_id=o.id)),
  'INGESTION',jsonb_build_object('TRACED',(select ingestion_traced from totals),'HISTORICAL_DB_PRESENCE',(select ingestion_historical_untraced from totals)),
  'OBSERVATION',jsonb_build_object('MISSING',(select observation_missing from totals),'PRESENT',(select observation_present from totals)),
  'FACTORY',jsonb_build_object('READY',(select factory_ready from totals),'REVIEW',(select factory_review from totals),'PENDING',(select factory_pending from totals),'BLOCKED',(select factory_blocked from totals),'FAILED',(select factory_failed from totals)),
  'VERIFICATION',jsonb_build_object('VERIFIED',(select verification_verified from totals),'IN_REVIEW',(select verification_in_review from totals)),
  'LIFECYCLE',jsonb_build_object('ACTIVE_VALID',(select lifecycle_active_valid from totals),'UNKNOWN',(select lifecycle_unknown from totals)),
  'ROUTING',jsonb_build_object('CATALOG_READY',(select catalog_ready from totals),'MATCHING_READY',(select matching_ready from totals),'ALERTS_READY',(select alerts_ready from totals),'SEO_READY',(select seo_ready from totals)),
  'NO_REASON_COUNTS',jsonb_build_object(
    'ingestion', (select count(*) from p where ingestion_reason is null or btrim(ingestion_reason)=''),
    'observation', (select count(*) from p where observation_reason is null or btrim(observation_reason)=''),
    'verification', (select count(*) from p where verification_reason is null or btrim(verification_reason)=''),
    'lifecycle', (select count(*) from p where lifecycle_reason is null or btrim(lifecycle_reason)=''),
    'factory', (select count(*) from p where factory_reason is null or btrim(factory_reason)=''),
    'source_operational', (select count(*) from p where source_operational_reason is null or btrim(source_operational_reason)=''),
    'catalog', (select count(*) from p where catalog_reason is null or btrim(catalog_reason)=''),
    'matching', (select count(*) from p where matching_reason is null or btrim(matching_reason)=''),
    'alerts', (select count(*) from p where alerts_reason is null or btrim(alerts_reason)=''),
    'seo', (select count(*) from p where seo_reason is null or btrim(seo_reason)=''),
    'next_action', (select no_reason_rows from totals)
  ),
  'UNEXPLAINED_ROWS',(select unexplained_rows from reasons),
  'PER_SOURCE',coalesce((select jsonb_agg(to_jsonb(source_rows) order by inventory desc,source) from source_rows),'[]'::jsonb),
  'NEXT_ACTION_COUNTS',(select coalesce(jsonb_object_agg(next_action,n),'{}'::jsonb) from (select next_action,count(*) n from p group by next_action) x)
) as opportunity_pipeline_verification;
