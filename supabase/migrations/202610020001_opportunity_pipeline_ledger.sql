-- Canonical diagnostic projection over existing Opportunity, Factory,
-- Observation, Source Policy, and Opportunity Universe authorities.
-- This migration is local-only until separately reviewed/applied.

create table if not exists public.opportunity_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  opportunity_id text references public.opportunities(id) on delete set null,
  emitted_source text,
  canonical_source text,
  producer_id text,
  adapter_id text,
  cleaner_id text,
  normalizer_version text not null default 'opportunity-sink:v1',
  normalized_fields text[] not null default '{}',
  run_id text,
  scraper_run_id uuid references public.scraper_runs(id) on delete set null,
  scan_request_id text,
  outcome text not null check (outcome in ('INSERTED','UPDATED','UNCHANGED','DUPLICATE_IN_RUN','BUDGET_SKIPPED','REJECTED','PERSISTENCE_FAILED')),
  trace_state text not null check (trace_state in ('TRACED','INCOMPLETE')),
  reason text,
  identity_sha256 text not null,
  content_fingerprint text,
  semantic_fingerprint text,
  evidence jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  check ((trace_state = 'TRACED' and canonical_source is not null and producer_id is not null and run_id is not null)
      or trace_state = 'INCOMPLETE')
);

create index if not exists opportunity_ingestion_events_opportunity_received_idx
  on public.opportunity_ingestion_events (opportunity_id, received_at desc, id desc);
create index if not exists opportunity_ingestion_events_source_received_idx
  on public.opportunity_ingestion_events (canonical_source, received_at desc);
alter table public.opportunity_ingestion_events enable row level security;
revoke all on table public.opportunity_ingestion_events from public, anon, authenticated;
grant select, insert on table public.opportunity_ingestion_events to service_role;

create or replace view public.opportunity_pipeline_status
with (security_invoker = true)
as
with latest_ingestion as (
  select distinct on (e.opportunity_id)
    e.opportunity_id, e.id, e.emitted_source, e.canonical_source, e.producer_id,
    e.adapter_id, e.cleaner_id, e.normalizer_version, e.normalized_fields,
    e.run_id, e.scraper_run_id, e.scan_request_id, e.outcome, e.trace_state,
    e.reason, e.received_at
  from public.opportunity_ingestion_events e
  where e.opportunity_id is not null
  order by e.opportunity_id, e.received_at desc, e.id desc
), latest_observation as (
  select distinct on (o.opportunity_id)
    o.opportunity_id, o.id, o.source, o.identity_status, o.identity_method,
    o.identity_reason, o.http_status, o.observed_at, o.run_id, o.evidence
  from public.opportunity_source_observations o
  order by o.opportunity_id, o.observed_at desc, o.id desc
)
select
  o.id as opportunity_id,
  coalesce(li.canonical_source, alias.canonical_source, lower(o.source), 'UNKNOWN') as canonical_source,
  li.emitted_source,
  li.producer_id as producer,
  li.adapter_id,
  li.cleaner_id,
  li.normalizer_version,
  li.normalized_fields,
  case when li.id is null then 'UNKNOWN_HISTORICAL'
       when li.adapter_id is not null and li.cleaner_id is not null then 'CONFIRMED'
       else 'ADAPTER_OR_CLEANER_NOT_REPORTED' end as adapter_lineage_state,
  li.run_id,
  li.scraper_run_id as latest_scraper_run_id,
  li.scan_request_id,
  li.received_at as ingestion_received_at,
  o.created_at,
  o.updated_at,
  case when li.id is not null then 'TRACED' else 'HISTORICAL_DB_PRESENCE' end as ingestion_state,
  coalesce(li.reason, case when li.id is null then 'HISTORICAL_LINEAGE_NOT_RECONSTRUCTED' else 'INGESTION_RECEIPT_RECORDED' end) as ingestion_reason,
  case when li.id is null then 'RECONSTRUCTED' else 'FACTUAL_RUN_LINKED' end as provenance_certainty,
  jsonb_build_object('title',to_jsonb(o)->>'title','organization',to_jsonb(o)->>'organization','location',to_jsonb(o)->>'location','country_code',to_jsonb(o)->>'country_code','description_length',length(coalesce(to_jsonb(o)->>'description','')),'application_url_present',nullif(to_jsonb(o)->>'application_url','') is not null) as normalized_fields_snapshot,
  coalesce(fs.status, o.factory_status, 'UNKNOWN') as factory_status,
  fs.pipeline_version as factory_pipeline_version,
  fs.rules_version as factory_rules_version,
  coalesce(fs.stamps, '{}'::jsonb) as factory_stamps,
  coalesce(fs.evidence, '{}'::jsonb) as factory_evidence,
  case when fs.opportunity_id is null then 'FACTORY_SNAPSHOT_NOT_PRESENT'
       when fs.status='ready' then 'FACTORY_READY'
       else coalesce(nullif(fs.evidence->>'reason',''), 'FACTORY_STATUS_' || upper(fs.status)) end as factory_reason,
  coalesce(fs.content_fingerprint, o.content_fingerprint) as content_fingerprint,
  coalesce(fs.semantic_fingerprint, o.semantic_fingerprint) as semantic_fingerprint,
  case when o.embedding is not null then 'READY'
       when coalesce(fs.embedding_status, 'missing') = 'failed' then 'FAILED'
       when coalesce(fs.embedding_status, 'missing') = 'not_applicable' then 'NOT_APPLICABLE'
       else upper(coalesce(fs.embedding_status, 'missing')) end as embedding_status,
  coalesce(fs.embedding_model, o.embedding_model) as embedding_model,
  case when o.embedding is null then null else public.vector_dims(o.embedding) end as embedding_dimension,
  case when lo.id is null then 'MISSING' else lo.identity_status end as observation_state,
  lo.id as latest_observation_id,
  lo.observed_at as latest_observation_at,
  case when lo.id is null then 'UNKNOWN' else lo.identity_status end as identity_status,
  lo.http_status,
  case when lo.id is null then 'NO_FACTUAL_OBSERVATION_FROM_PRODUCER' else coalesce(lo.identity_reason, 'OBSERVATION_RECORDED') end as observation_reason,
  o.verification_status,
  coalesce(nullif(to_jsonb(o)->>'verification_reasons',''),
           case when o.verification_status = 'verified' then 'VERIFICATION_CONFIRMED' else 'VERIFICATION_REVIEW_REQUIRED' end) as verification_reason,
  coalesce(u.lifecycle_state, 'LIFECYCLE_UNKNOWN') as lifecycle_state,
  coalesce(u.lifecycle_reason, 'UNIVERSE_STATE_NOT_RECONCILED') as lifecycle_reason,
  coalesce(u.source_operational_state, 'UNKNOWN') as source_operational_state,
  coalesce(u.source_operational_reason, 'SOURCE_STATE_NOT_EVALUATED') as source_operational_reason,
  coalesce(u.provenance, '{}'::jsonb) as universe_provenance,
  coalesce(u.provenance->'consumer_permission_states', '{}'::jsonb) as source_permission_states,
  coalesce(u.provenance->'consumer_switch_states', '{}'::jsonb) as consumer_switch_states,
  coalesce(u.catalog_row_state, 'UNKNOWN') as catalog_row_state,
  coalesce(u.catalog_state, 'UNKNOWN') as catalog_state,
  case when u.opportunity_id is null then 'UNIVERSE_STATE_NOT_RECONCILED'
       when u.catalog_state = 'READY' then 'READY'
       when u.lifecycle_state <> 'ACTIVE_VALID' then u.lifecycle_reason
       when u.catalog_row_state <> 'READY' then 'CATALOG_ROW_' || u.catalog_row_state
       when u.source_operational_state <> 'ENABLED' then coalesce(u.source_operational_reason, 'SOURCE_STATE_' || u.source_operational_state)
       when u.provenance->'consumer_switch_states'->>'catalog' <> 'ALLOWED' then 'CATALOG_SWITCH_NOT_ALLOWED'
       when u.provenance->'consumer_permission_states'->>'catalog' <> 'ALLOWED' then 'CATALOG_PERMISSION_NOT_ALLOWED'
       else 'CATALOG_EFFECTIVE_STATE_NOT_READY' end as catalog_reason,
  coalesce(u.matching_row_state, 'UNKNOWN') as matching_row_state,
  coalesce(u.matching_row_reason, 'UNIVERSE_STATE_NOT_RECONCILED') as matching_row_reason,
  coalesce(u.source_matching_state, 'UNKNOWN') as source_matching_state,
  coalesce(u.source_matching_operational_state, 'UNKNOWN') as source_matching_operational_state,
  coalesce(u.final_matching_state, 'UNKNOWN') as final_matching_state,
  case when u.opportunity_id is null then 'UNIVERSE_STATE_NOT_RECONCILED'
       when u.final_matching_state = 'READY' then 'READY'
       when u.matching_row_state <> 'READY' then coalesce(u.matching_row_reason, 'MATCHING_ROW_' || u.matching_row_state)
       when u.source_operational_state <> 'ENABLED' then coalesce(u.source_operational_reason, 'SOURCE_STATE_' || u.source_operational_state)
       when u.source_matching_operational_state <> 'ALLOWED' then coalesce(u.source_matching_operational_reason, 'MATCHING_SWITCH_NOT_ALLOWED')
       when u.source_matching_state <> 'ALLOWED' then coalesce(u.source_matching_reason, 'MATCHING_PERMISSION_NOT_ALLOWED')
       else 'FINAL_MATCHING_NOT_READY' end as matching_reason,
  coalesce(u.alerts_row_state, 'UNKNOWN') as alerts_row_state,
  coalesce(u.alerts_state, 'UNKNOWN') as alerts_state,
  case when u.opportunity_id is null then 'UNIVERSE_STATE_NOT_RECONCILED'
       when u.alerts_state = 'READY' then 'READY'
       when u.alerts_row_state <> 'READY' then 'ALERT_ROW_' || u.alerts_row_state
       when u.source_operational_state <> 'ENABLED' then coalesce(u.source_operational_reason, 'SOURCE_STATE_' || u.source_operational_state)
       when u.provenance->'consumer_switch_states'->>'alerts' <> 'ALLOWED' then 'ALERTS_SWITCH_NOT_ALLOWED'
       when u.provenance->'consumer_permission_states'->>'alerts' <> 'ALLOWED' then 'ALERTS_PERMISSION_NOT_ALLOWED'
       else 'ALERTS_EFFECTIVE_STATE_NOT_READY' end as alerts_reason,
  coalesce(u.seo_row_state, 'UNKNOWN') as seo_row_state,
  coalesce(u.seo_row_reason, 'UNIVERSE_STATE_NOT_RECONCILED') as seo_row_reason,
  coalesce(u.seo_state, 'UNKNOWN') as seo_state,
  coalesce(u.seo_effective_reason, 'UNIVERSE_STATE_NOT_RECONCILED') as seo_reason,
  coalesce(u.unresolved_dimensions, array['UNIVERSE_STATE_NOT_RECONCILED']::text[]) as unresolved_dimensions,
  coalesce(u.source_permission_unknown_dimensions, '{}'::text[]) as permission_unknown_dimensions,
  now() - coalesce(fs.checked_at, o.updated_at, o.created_at) as factory_age,
  case when coalesce(fs.status, o.factory_status) = 'failed' then 'PROCESSING_ERROR'
       when coalesce(fs.status, o.factory_status) = 'pending' and now() - coalesce(fs.checked_at, o.updated_at, o.created_at) > interval '24 hours' then 'PENDING_OVERDUE'
       when coalesce(fs.status, o.factory_status) = 'pending' then 'PENDING_FRESH'
       else 'NOT_PENDING' end as factory_sla_state,
  case when li.id is null then 'TRACE_INCOMPLETE'
       when lo.id is null then 'OBSERVATION_MISSING'
       when u.opportunity_id is null then 'CLASSIFICATION_PENDING'
       when u.catalog_state='READY' and u.final_matching_state='READY' and u.alerts_state='READY' and u.seo_state='READY' then 'ROUTED'
       else 'ROUTED_WITH_EXCLUSIONS' end as pipeline_health,
  array_remove(array[
    case when li.id is null then 'INGESTION_LINEAGE' end,
    case when lo.id is null then 'OBSERVATION' end,
    case when coalesce(fs.status, o.factory_status) not in ('ready','review','blocked') then 'FACTORY' end,
    case when u.opportunity_id is null then 'UNIVERSE' end,
    case when u.catalog_state is distinct from 'READY' then 'CATALOG' end,
    case when u.final_matching_state is distinct from 'READY' then 'MATCHING' end,
    case when u.alerts_state is distinct from 'READY' then 'ALERTS' end,
    case when u.seo_state is distinct from 'READY' then 'SEO' end
  ], null) as blocking_phases,
  case when u.opportunity_id is null then 'RUN_UNIVERSE_RECONCILIATION'
       when lo.id is null then 'SOURCE_REFRESH'
       when coalesce(fs.status, o.factory_status) in ('pending','failed') then 'FACTORY_DRAIN'
       when u.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'REVIEW_LIFECYCLE_EVIDENCE'
       when o.verification_status in ('pending','in_review') then 'EXISTING_VERIFICATION_AUTOMATION_OR_REVIEW'
       when o.verification_status in ('pending','in_review') then 'EXISTING_VERIFICATION_AUTOMATION_OR_REVIEW'
       when u.catalog_state <> 'READY' or u.final_matching_state <> 'READY' or u.alerts_state <> 'READY' or u.seo_state <> 'READY' then 'INSPECT_CONSUMER_REASON'
       else 'NO_ACTION' end as next_action,
  case when u.opportunity_id is null then 'UNIVERSE_STATE_NOT_RECONCILED'
       when lo.id is null then 'NO_FACTUAL_OBSERVATION_FROM_PRODUCER'
       when coalesce(fs.status, o.factory_status) in ('pending','failed') then 'FACTORY_' || upper(coalesce(fs.status, o.factory_status))
       when u.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then u.lifecycle_reason
       when o.verification_status in ('pending','in_review') then 'VERIFICATION_' || upper(o.verification_status) || ': EXISTING_AUTOMATION_CORE_OR_FACTUAL_REVIEW_REQUIRED'
       when u.catalog_state <> 'READY' then 'CATALOG: ' || case
         when u.lifecycle_state <> 'ACTIVE_VALID' then u.lifecycle_reason
         when u.catalog_row_state <> 'READY' then 'CATALOG_ROW_' || u.catalog_row_state
         when u.source_operational_state <> 'ENABLED' then u.source_operational_reason
         when u.provenance->'consumer_switch_states'->>'catalog' <> 'ALLOWED' then 'CATALOG_SWITCH_NOT_ALLOWED'
         when u.provenance->'consumer_permission_states'->>'catalog' <> 'ALLOWED' then 'CATALOG_PERMISSION_NOT_ALLOWED'
         else 'CATALOG_EFFECTIVE_STATE_NOT_READY' end
       when u.final_matching_state <> 'READY' then 'MATCHING: ' || coalesce(u.matching_row_reason, u.source_matching_reason)
       when u.alerts_state <> 'READY' then 'ALERTS: ' || coalesce(u.lifecycle_reason, 'ALERTS_NOT_READY')
       when u.seo_state <> 'READY' then 'SEO: ' || coalesce(u.seo_effective_reason, u.seo_row_reason)
       else 'ALL_ROUTING_STATES_READY' end as next_action_reason,
  jsonb_build_object(
    'INGESTION',jsonb_build_object('state',case when li.id is null then 'HISTORICAL_DB_PRESENCE' else li.trace_state end,'reason',coalesce(li.reason,'HISTORICAL_LINEAGE_NOT_RECONSTRUCTED'),'next_action',case when li.id is null then 'NO_RUN_RECONSTRUCTION_WITHOUT_EVIDENCE' else 'NONE' end),
    'NORMALIZATION',jsonb_build_object('state',case when li.id is null then 'UNKNOWN' when li.adapter_id is null or li.cleaner_id is null then 'PARTIAL_LINEAGE' else 'RECORDED' end,'reason',case when li.id is null then 'NO_FUTURE_INGESTION_EVENT' when li.adapter_id is null or li.cleaner_id is null then 'ADAPTER_OR_CLEANER_NOT_REPORTED' else 'NORMALIZER_AND_ADAPTER_RECORDED' end,'next_action',case when li.id is not null and (li.adapter_id is null or li.cleaner_id is null) then 'REPORT_ADAPTER_CLEANER_VERSION' else 'NONE' end),
    'FACTORY',jsonb_build_object('state',coalesce(fs.status,o.factory_status,'UNKNOWN'),'reason',case when fs.opportunity_id is null then 'FACTORY_SNAPSHOT_NOT_PRESENT' when fs.status='ready' then 'FACTORY_READY' else coalesce(nullif(fs.evidence->>'reason',''),'FACTORY_STATUS_'||upper(fs.status)) end,'next_action',case when coalesce(fs.status,o.factory_status) in ('pending','failed') then 'FACTORY_DRAIN' else 'NONE' end),
    'OBSERVATION',jsonb_build_object('state',case when lo.id is null then 'MISSING' else lo.identity_status end,'reason',case when lo.id is null then 'NO_FACTUAL_OBSERVATION_FROM_PRODUCER' else coalesce(lo.identity_reason,'OBSERVATION_RECORDED') end,'next_action',case when lo.id is null then 'SOURCE_REFRESH' else 'NONE' end),
    'VERIFICATION',jsonb_build_object('state',o.verification_status,'reason',coalesce(nullif(to_jsonb(o)->>'verification_reasons',''),case when o.verification_status='verified' then 'VERIFICATION_CONFIRMED' else 'VERIFICATION_REVIEW_REQUIRED' end),'next_action',case when o.verification_status in ('pending','in_review') then 'EXISTING_AUTOMATION_CORE_OR_FACTUAL_REVIEW' else 'NONE' end),
    'LIFECYCLE',jsonb_build_object('state',coalesce(u.lifecycle_state,'LIFECYCLE_UNKNOWN'),'reason',coalesce(u.lifecycle_reason,'UNIVERSE_STATE_NOT_RECONCILED'),'next_action',case when coalesce(u.lifecycle_state,'LIFECYCLE_UNKNOWN') in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then case when lo.id is null then 'SOURCE_REFRESH' else 'REVIEW_LIFECYCLE_EVIDENCE' end else 'NONE' end),
    'CATALOG',jsonb_build_object('state',coalesce(u.catalog_state,'UNKNOWN'),'reason',case when u.catalog_state='READY' then 'READY' else 'CATALOG_NOT_READY:'||coalesce(u.lifecycle_reason,'UNIVERSE_STATE_NOT_RECONCILED') end,'next_action',case when u.catalog_state='READY' then 'NONE' else 'INSPECT_CATALOG_REASON' end),
    'MATCHING',jsonb_build_object('state',coalesce(u.final_matching_state,'UNKNOWN'),'reason',case when u.final_matching_state='READY' then 'READY' else coalesce(u.matching_row_reason,u.source_matching_reason,'MATCHING_NOT_READY') end,'next_action',case when u.final_matching_state='READY' then 'NONE' else 'INSPECT_MATCHING_REASON' end),
    'ALERTS',jsonb_build_object('state',coalesce(u.alerts_state,'UNKNOWN'),'reason',case when u.alerts_state='READY' then 'READY' else 'ALERTS_NOT_READY:'||coalesce(u.lifecycle_reason,'UNIVERSE_STATE_NOT_RECONCILED') end,'next_action',case when u.alerts_state='READY' then 'NONE' else 'INSPECT_ALERTS_REASON' end),
    'SEO',jsonb_build_object('state',coalesce(u.seo_state,'UNKNOWN'),'reason',coalesce(u.seo_effective_reason,u.seo_row_reason,'UNIVERSE_STATE_NOT_RECONCILED'),'next_action',case when u.seo_state='READY' then 'NONE' else 'INSPECT_SEO_REASON' end)
  ) as next_actions,
  u.evaluated_at as routing_updated_at,
  lo.evidence as observation_evidence
  from public.opportunities o
left join latest_ingestion li on li.opportunity_id = o.id
left join latest_observation lo on lo.opportunity_id = o.id
left join public.opportunity_factory_snapshots fs on fs.opportunity_id = o.id
left join public.opportunity_universe_state u on u.opportunity_id = o.id
left join public.opportunity_source_identity_aliases alias on alias.emitted_source = lower(o.source);

revoke all on public.opportunity_pipeline_status from public, anon, authenticated;
grant select on public.opportunity_pipeline_status to service_role;

create or replace function public.admin_opportunity_pipeline_ledger()
returns jsonb language sql stable security definer set search_path = '' as $$
  with p as materialized (select * from public.opportunity_pipeline_status),
  totals as (
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
  ), per_source as (
    select canonical_source source, count(*) inventory,
      count(*) filter(where created_at>=now()-interval '24 hours') new_24h,
      count(*) filter(where created_at>=now()-interval '7 days') new_7d,
      count(*) filter(where ingestion_state='TRACED') ingestion_traced,
      count(*) filter(where observation_state='MISSING') observation_missing,
      count(*) filter(where factory_status='ready') factory_ready,
      count(*) filter(where factory_status='review') factory_review,
      count(*) filter(where factory_status='pending') factory_pending,
      count(*) filter(where factory_status='blocked') factory_blocked,
      count(*) filter(where verification_status='verified') verified,
      count(*) filter(where verification_status='in_review') in_review,
      count(*) filter(where lifecycle_state='ACTIVE_VALID') lifecycle_active_valid,
      count(*) filter(where lifecycle_state='LIFECYCLE_UNKNOWN') lifecycle_unknown,
      count(*) filter(where catalog_state='READY') catalog_ready,
      count(*) filter(where final_matching_state='READY') matching_ready,
      count(*) filter(where alerts_state='READY') alerts_ready,
      count(*) filter(where seo_state='READY') seo_ready,
      min(updated_at) filter(where next_action<>'NO_ACTION') oldest_unresolved,
      mode() within group(order by next_action) dominant_next_action
    from p group by canonical_source
  )
  select jsonb_build_object(
    'counts',(select to_jsonb(totals) from totals),
    'sources',coalesce((select jsonb_agg(to_jsonb(per_source) order by inventory desc,source) from per_source),'[]'::jsonb),
    'next_actions',(select coalesce(jsonb_object_agg(next_action,n),'{}'::jsonb) from (select next_action,count(*) n from p group by next_action) x)
  );
$$;
revoke all on function public.admin_opportunity_pipeline_ledger() from public, anon, authenticated;
grant execute on function public.admin_opportunity_pipeline_ledger() to service_role;
