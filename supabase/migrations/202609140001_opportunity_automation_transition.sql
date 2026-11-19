-- LOCAL ONLY until explicitly reviewed/applied. Registry V2 is authoritative;
-- opportunity_sources is the durable, fail-closed mutation-time projection.
alter table public.opportunity_sources
  add column if not exists registry_certified boolean not null default false,
  add column if not exists registry_auto_enabled boolean not null default false,
  add column if not exists registry_automation_enabled boolean not null default false,
  add column if not exists registry_semantic_version text,
  add column if not exists registry_adapter_version text,
  add column if not exists registry_automation_policy_version text,
  add column if not exists registry_policy_hash text,
  add column if not exists registry_synced_at timestamptz,
  add column if not exists registry_projection_ttl_hours integer not null default 168 check (registry_projection_ttl_hours > 0),
  add column if not exists registry_health_ttl_hours integer not null default 24 check (registry_health_ttl_hours > 0),
  add column if not exists registry_freshness_ttl_hours integer not null default 24 check (registry_freshness_ttl_hours > 0),
  add column if not exists web_catalog_allowed boolean not null default false,
  add column if not exists source_attribution_required boolean not null default false,
  add column if not exists google_jobs_distribution_allowed boolean not null default false,
  add column if not exists third_party_job_distribution_allowed boolean not null default false;

-- Google Jobs and third-party actions are policy assertions, not invented
-- per-row state: requests may assert them, but policy can always reject them.
create table if not exists public.opportunity_automation_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text not null references public.opportunities(id) on delete cascade,
  source text not null references public.opportunity_sources(source),
  execution_id text not null, idempotency_key text not null unique, request_hash text not null,
  decision text not null check (decision = 'AUTO_PROMOTE'), reason_codes jsonb not null default '[]'::jsonb,
  policy_version text not null, semantic_version text not null, registry_policy_hash text not null,
  runtime_run_id text not null, freshness_observation_id uuid references public.opportunity_source_observations(id),
  before_state jsonb not null, after_state jsonb not null, created_at timestamptz not null default now()
);
create index if not exists opportunity_automation_events_opportunity_created_idx on public.opportunity_automation_events(opportunity_id, created_at desc);
alter table public.opportunity_automation_events enable row level security;
revoke all on table public.opportunity_automation_events from public, anon, authenticated;
grant select, insert on table public.opportunity_automation_events to service_role;

create or replace function public.apply_opportunity_automation_transition(
  p_opportunity_id text, p_expected_updated_at timestamptz, p_expected_registry_hash text,
  p_expected_semantic_version text, p_policy_version text, p_decision text, p_reason_codes jsonb,
  p_allowed_actions jsonb, p_idempotency_key text, p_execution_id text, p_runtime_run_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.opportunities%rowtype; s public.opportunity_sources%rowtype; e public.opportunity_automation_events%rowtype;
  rr public.scraper_runs%rowtype; ob public.opportunity_source_observations%rowtype;
  before_state jsonb; after_state jsonb; request_hash text; unknown_actions text[];
  v_verification boolean := false; v_activation boolean := false; v_catalog boolean := false;
  v_matching boolean := false; v_alerts boolean := false; v_organic_seo boolean := false;
  v_google_jobs boolean := false; v_third_party boolean := false;
  final_verified boolean; final_active boolean; final_catalog boolean;
begin
  if p_decision <> 'AUTO_PROMOTE' or coalesce(p_idempotency_key,'')='' or coalesce(p_execution_id,'')='' or coalesce(p_runtime_run_id,'')='' then raise exception 'invalid_automation_request'; end if;
  if jsonb_typeof(p_reason_codes) <> 'array' or jsonb_typeof(p_allowed_actions) <> 'object' then raise exception 'invalid_automation_payload'; end if;
  select array_agg(key order by key) into unknown_actions from jsonb_object_keys(p_allowed_actions) as key where key not in ('verification','activation','catalog','matching','alerts','organic_seo','google_jobs','third_party_distribution');
  if unknown_actions is not null then raise exception 'unknown_allowed_action:%', array_to_string(unknown_actions, ','); end if;
  if exists(select 1 from jsonb_each(p_allowed_actions) a(key,value) where jsonb_typeof(a.value) <> 'boolean') then raise exception 'malformed_allowed_action'; end if;
  v_verification:=coalesce((p_allowed_actions->>'verification')::boolean,false); v_activation:=coalesce((p_allowed_actions->>'activation')::boolean,false); v_catalog:=coalesce((p_allowed_actions->>'catalog')::boolean,false); v_matching:=coalesce((p_allowed_actions->>'matching')::boolean,false); v_alerts:=coalesce((p_allowed_actions->>'alerts')::boolean,false); v_organic_seo:=coalesce((p_allowed_actions->>'organic_seo')::boolean,false); v_google_jobs:=coalesce((p_allowed_actions->>'google_jobs')::boolean,false); v_third_party:=coalesce((p_allowed_actions->>'third_party_distribution')::boolean,false);
  if not(v_verification or v_activation or v_catalog or v_matching or v_alerts or v_organic_seo or v_google_jobs or v_third_party) then raise exception 'no_allowed_action_requested'; end if;
  request_hash:=md5(jsonb_build_object('opportunity_id',p_opportunity_id,'expected_updated_at',p_expected_updated_at,'expected_registry_hash',p_expected_registry_hash,'expected_semantic_version',p_expected_semantic_version,'policy_version',p_policy_version,'decision',p_decision,'reason_codes',p_reason_codes,'allowed_actions',p_allowed_actions,'execution_id',p_execution_id,'runtime_run_id',p_runtime_run_id)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  select * into e from public.opportunity_automation_events where idempotency_key=p_idempotency_key;
  if found then if e.request_hash<>request_hash then raise exception 'idempotency_conflict'; end if; return jsonb_build_object('changed',false,'idempotent_replay',true,'opportunity_id',e.opportunity_id,'after_state',e.after_state); end if;
  select * into o from public.opportunities where id=p_opportunity_id for update; if not found then raise exception 'opportunity_not_found'; end if;
  select * into s from public.opportunity_sources where source=o.source for update; if not found then raise exception 'registry_projection_missing'; end if;
  if s.registry_synced_at is null or s.registry_synced_at<now()-make_interval(hours=>s.registry_projection_ttl_hours) then raise exception 'registry_projection_stale'; end if;
  if not s.is_enabled then raise exception 'source_disabled'; end if; if not s.registry_certified then raise exception 'source_not_certified'; end if; if not s.registry_auto_enabled or not s.registry_automation_enabled then raise exception 'source_auto_not_enabled'; end if;
  if s.registry_policy_hash is distinct from p_expected_registry_hash then raise exception 'registry_projection_mismatch'; end if; if s.registry_semantic_version is distinct from p_expected_semantic_version then raise exception 'semantic_version_mismatch'; end if; if s.registry_automation_policy_version is distinct from p_policy_version then raise exception 'automation_policy_version_mismatch'; end if;
  if o.updated_at is distinct from p_expected_updated_at then raise exception 'stale_opportunity'; end if; if o.deleted_at is not null or o.archived_at is not null or o.verification_status not in ('pending','in_review') then raise exception 'opportunity_state_not_promotable'; end if; if o.factory_status is distinct from 'ready' then raise exception 'factory_not_ready'; end if;
  select * into rr from public.scraper_runs where run_id=p_runtime_run_id and scraper_id in (o.source,o.source||'_scraper',o.source||'_scrapper') and extraction_metrics->>'runtime_evidence_version'='source-evidence:v1' and extraction_metrics->'operational_health'->>'status'='HEALTHY' and finished_at>=now()-make_interval(hours=>s.registry_health_ttl_hours) order by finished_at desc limit 1; if not found then raise exception 'runtime_health_unavailable'; end if;
  select * into ob from public.opportunity_source_observations where opportunity_id=o.id and source=o.source order by observed_at desc,id desc limit 1;
  if found and ob.identity_status in ('DEAD','REMOVED') and ob.http_status in (404,410) then raise exception 'hard_dead'; end if;
  if (o.deadline is null or o.deadline::date<current_date) and (not found or ob.identity_status<>'IDENTITY_CONFIRMED' or ob.http_status<>200 or ob.observed_at<now()-make_interval(hours=>s.registry_freshness_ttl_hours)) then raise exception 'freshness_unavailable'; end if;
  if v_catalog and(not s.web_catalog_allowed or not s.catalog_enabled) then raise exception 'catalog_forbidden'; end if; if v_matching and not s.matching_enabled then raise exception 'matching_forbidden'; end if; if v_alerts and not s.alerts_enabled then raise exception 'alerts_forbidden'; end if; if v_organic_seo and not s.seo_enabled then raise exception 'organic_seo_forbidden'; end if; if v_google_jobs and not s.google_jobs_distribution_allowed then raise exception 'google_jobs_forbidden'; end if; if v_third_party and not s.third_party_job_distribution_allowed then raise exception 'third_party_distribution_forbidden'; end if;
  if s.source_attribution_required and(v_catalog or v_organic_seo) and coalesce(o.source_url,'')!~*'^https?://[^[:space:]]+$' then raise exception 'source_attribution_missing'; end if;
  final_verified:=v_verification or o.verification_status='verified'; final_active:=v_activation or o.is_active; final_catalog:=v_catalog or o.catalog_eligible;
  if(v_catalog or v_matching or v_alerts or v_organic_seo) and(not final_verified or not final_active) then raise exception 'downstream_requires_verified_active'; end if; if v_organic_seo and not final_catalog then raise exception 'organic_seo_requires_catalog'; end if;
  before_state:=jsonb_build_object('verification_status',o.verification_status,'is_active',o.is_active,'catalog_eligible',o.catalog_eligible,'match_eligible',o.match_eligible,'alerts_eligible',o.alerts_eligible,'seo_eligible',o.seo_eligible,'seo_status',o.seo_status,'factory_status',o.factory_status);
  update public.opportunities set verification_status=case when v_verification then 'verified' else verification_status end,is_active=case when v_activation then true else is_active end,catalog_eligible=case when v_catalog then true else catalog_eligible end,match_eligible=case when v_matching then true else match_eligible end,alerts_eligible=case when v_alerts then true else alerts_eligible end,seo_eligible=case when v_organic_seo then true else seo_eligible end,seo_status=case when v_organic_seo then 'eligible' else seo_status end where id=o.id returning * into o;
  after_state:=jsonb_build_object('verification_status',o.verification_status,'is_active',o.is_active,'catalog_eligible',o.catalog_eligible,'match_eligible',o.match_eligible,'alerts_eligible',o.alerts_eligible,'seo_eligible',o.seo_eligible,'seo_status',o.seo_status,'factory_status',o.factory_status);
  insert into public.opportunity_automation_events(opportunity_id,source,execution_id,idempotency_key,request_hash,decision,reason_codes,policy_version,semantic_version,registry_policy_hash,runtime_run_id,freshness_observation_id,before_state,after_state) values(o.id,o.source,p_execution_id,p_idempotency_key,request_hash,p_decision,p_reason_codes,p_policy_version,p_expected_semantic_version,p_expected_registry_hash,p_runtime_run_id,ob.id,before_state,after_state);
  return jsonb_build_object('changed',true,'idempotent_replay',false,'opportunity_id',o.id,'after_state',after_state);
end; $$;
revoke all on function public.apply_opportunity_automation_transition(text,timestamptz,text,text,text,text,jsonb,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.apply_opportunity_automation_transition(text,timestamptz,text,text,text,text,jsonb,jsonb,text,text,text) to service_role;
