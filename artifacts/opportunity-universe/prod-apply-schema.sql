-- STAGE A: additive schema, canonical reducer, permission seed and independent operational controls only.
-- Does not run full historical reconciliation and does not apply Retrieval schema.
-- Additive Opportunity Universe contract. LOCAL ONLY; not applied.
-- This table is decision/provenance state, not candidate truth or match scores.
create table if not exists public.opportunity_source_identity_aliases (
  emitted_source text primary key,
  canonical_source text not null
);

create table if not exists public.opportunity_source_consumer_permissions (
  canonical_source text not null,
  consumer text not null check (consumer in ('collect','detail_fetch','catalog','matching','alerts','seo_index','google_jobs','third_party_distribution','application_routing','attribution_requirement')),
  permission_state text not null check (permission_state in ('ALLOWED','DENIED','UNKNOWN','NOT_APPLICABLE')),
  reason text not null,
  provenance text not null,
  evidence_type text not null default 'REPOSITORY_REVIEW',
  evidence_reference text not null default 'docs/source-permission-matrix.md',
  verified_at date not null default current_date,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (canonical_source, consumer)
);

create table if not exists public.opportunity_universe_dirty_sources (
  canonical_source text primary key,
  queued_at timestamptz not null default now(),
  reason text not null
);

create table if not exists public.opportunity_lifecycle_repair_audit (
  id bigint generated always as identity primary key,
  opportunity_id text not null,
  prior_is_active boolean,
  repaired_is_active boolean not null,
  reason text not null,
  observation_id uuid,
  observation_status text,
  observation_http_status integer,
  observation_at timestamptz,
  repaired_at timestamptz not null default now()
);

create table if not exists public.opportunity_universe_state (
  opportunity_id text primary key references public.opportunities(id) on delete cascade,
  inventory_state text not null default 'PRESENT',
  lifecycle_state text not null,
  lifecycle_reason text not null,
  lifecycle_repair jsonb,
  professional_readiness text not null,
  professional_reason text not null,
  catalog_row_state text not null,
  catalog_state text not null,
  alerts_row_state text not null,
  matching_row_state text not null,
  matching_row_reason text not null,
  source_matching_state text not null,
  source_matching_reason text not null,
  source_matching_provenance text not null,
  source_matching_operational_state text not null,
  source_matching_operational_reason text not null,
  source_operational_state text not null,
  source_operational_reason text not null,
  final_matching_state text not null,
  seo_row_state text not null,
  seo_row_reason text not null,
  seo_effective_reason text not null,
  seo_state text not null,
  alerts_state text not null,
  unresolved_dimensions text[] not null default '{}',
  source_permission_unknown_dimensions text[] not null default '{}',
  provenance jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now()
);
create index if not exists opportunity_universe_final_matching_idx
  on public.opportunity_universe_state(final_matching_state, opportunity_id);
create index if not exists opportunity_universe_source_state_idx
  on public.opportunity_universe_state(source_matching_state, source_operational_state);
alter table public.opportunity_universe_state enable row level security;
alter table public.opportunity_source_identity_aliases enable row level security;
alter table public.opportunity_source_consumer_permissions enable row level security;
alter table public.opportunity_universe_dirty_sources enable row level security;
alter table public.opportunity_lifecycle_repair_audit enable row level security;
revoke all on public.opportunity_universe_state, public.opportunity_source_identity_aliases, public.opportunity_source_consumer_permissions, public.opportunity_universe_dirty_sources, public.opportunity_lifecycle_repair_audit from public, anon, authenticated;
grant select, insert, update, delete on public.opportunity_universe_state, public.opportunity_source_identity_aliases, public.opportunity_source_consumer_permissions, public.opportunity_universe_dirty_sources, public.opportunity_lifecycle_repair_audit to service_role;
drop policy if exists opportunity_universe_state_service_role on public.opportunity_universe_state;
create policy opportunity_universe_state_service_role on public.opportunity_universe_state for all to service_role using (auth.role()='service_role') with check (auth.role()='service_role');
drop policy if exists opportunity_source_identity_aliases_service_role on public.opportunity_source_identity_aliases;
create policy opportunity_source_identity_aliases_service_role on public.opportunity_source_identity_aliases for all to service_role using (auth.role()='service_role') with check (auth.role()='service_role');
drop policy if exists opportunity_source_permissions_service_role on public.opportunity_source_consumer_permissions;
create policy opportunity_source_permissions_service_role on public.opportunity_source_consumer_permissions for all to service_role using (auth.role()='service_role') with check (auth.role()='service_role');
drop policy if exists opportunity_universe_dirty_sources_service_role on public.opportunity_universe_dirty_sources;
create policy opportunity_universe_dirty_sources_service_role on public.opportunity_universe_dirty_sources for all to service_role using (auth.role()='service_role') with check (auth.role()='service_role');
drop policy if exists opportunity_lifecycle_repair_audit_service_role on public.opportunity_lifecycle_repair_audit;
create policy opportunity_lifecycle_repair_audit_service_role on public.opportunity_lifecycle_repair_audit for all to service_role using (auth.role()='service_role') with check (auth.role()='service_role');

create or replace function public.canonical_opportunity_source_policy(p_raw_source text)
returns jsonb language plpgsql stable set search_path=public as $$
declare v_source text:=lower(trim(coalesce(p_raw_source,''))); v_canonical text; v_total integer; v_distinct integer; v_matching_distinct integer; v_enabled_states integer; v_matching_states integer; v_catalog_states integer; v_alerts_states integer; v_seo_states integer; v_unknown integer; v_matching_unknown integer; v_enabled boolean; v_matching_enabled boolean; v_catalog boolean; v_alerts boolean; v_seo boolean;
begin
  select canonical_source into v_canonical from public.opportunity_source_identity_aliases where emitted_source=v_source;
  v_canonical:=coalesce(v_canonical,v_source);
  select count(*),count(distinct s.is_enabled),count(distinct s.matching_enabled),count(distinct coalesce(s.is_enabled::text,'UNKNOWN')),count(distinct coalesce(s.matching_enabled::text,'UNKNOWN')),count(distinct coalesce(s.catalog_enabled::text,'UNKNOWN')),count(distinct coalesce(s.alerts_enabled::text,'UNKNOWN')),count(distinct coalesce(s.seo_enabled::text,'UNKNOWN')),count(*) filter(where s.is_enabled is null),count(*) filter(where s.matching_enabled is null),bool_and(s.is_enabled),bool_and(s.matching_enabled),bool_and(s.catalog_enabled),bool_and(s.alerts_enabled),bool_and(s.seo_enabled)
    into v_total,v_distinct,v_matching_distinct,v_enabled_states,v_matching_states,v_catalog_states,v_alerts_states,v_seo_states,v_unknown,v_matching_unknown,v_enabled,v_matching_enabled,v_catalog,v_alerts,v_seo from public.opportunity_sources s
    where lower(s.source)=v_canonical or lower(s.source) in (select emitted_source from public.opportunity_source_identity_aliases where canonical_source=v_canonical);
  return jsonb_build_object('canonical_source',v_canonical,'is_enabled',case when v_total=0 or v_unknown>0 or v_distinct>1 then null else to_jsonb(v_enabled) end,'matching_enabled',case when v_total=0 or v_matching_unknown>0 or v_matching_distinct>1 then null else to_jsonb(v_matching_enabled) end,'catalog_enabled',case when v_total=0 or v_catalog_states>1 then null else to_jsonb(v_catalog) end,'alerts_enabled',case when v_total=0 or v_alerts_states>1 then null else to_jsonb(v_alerts) end,'seo_enabled',case when v_total=0 or v_seo_states>1 then null else to_jsonb(v_seo) end,
    'is_enabled_alias_conflict',v_enabled_states>1,'matching_enabled_alias_conflict',v_matching_states>1,'catalog_enabled_alias_conflict',v_catalog_states>1,'alerts_enabled_alias_conflict',v_alerts_states>1,'seo_enabled_alias_conflict',v_seo_states>1,
    'alias_conflict',v_enabled_states>1 or v_matching_states>1 or v_catalog_states>1 or v_alerts_states>1 or v_seo_states>1,
    'policy_rows',coalesce((select jsonb_agg(lower(s.source) order by lower(s.source)) from public.opportunity_sources s where lower(s.source)=v_canonical or lower(s.source) in (select emitted_source from public.opportunity_source_identity_aliases where canonical_source=v_canonical)),'[]'::jsonb));
end $$;

create or replace function public.opportunity_deadline_state(p_deadline text)
returns text language plpgsql stable set search_path=public as $$
declare v_deadline text:=trim(coalesce(p_deadline,'')); v_date date;
begin
  if v_deadline='' then return 'UNKNOWN'; end if;
  if v_deadline ~ '^\d{4}-\d{2}-\d{2}$' then
    begin v_date:=v_deadline::date; if to_char(v_date,'YYYY-MM-DD')<>v_deadline then return 'INVALID'; end if; return case when v_date<current_date then 'EXPIRED' else 'OPEN' end; exception when others then return 'INVALID'; end;
  elsif v_deadline ~ '(Z|[+-]\d\d:\d\d)$' then
    begin return case when v_deadline::timestamptz<now() then 'EXPIRED' else 'OPEN' end; exception when others then return 'INVALID'; end;
  end if;
  return 'INVALID';
end $$;

create or replace function public.opportunity_requirements_text(p_requirements jsonb)
returns text language sql immutable parallel safe set search_path=public as $$
  select case jsonb_typeof(p_requirements)
    when 'string' then trim(coalesce(p_requirements #>> '{}',''))
    when 'array' then coalesce((
      select string_agg(trim(extracted.text_value),' ' order by extracted.ordinality)
      from (
        select case jsonb_typeof(item.value)
          when 'string' then item.value #>> '{}'
          when 'object' then case when jsonb_typeof(item.value->'text')='string' then item.value->>'text' else null end
          else null end text_value,item.ordinality
        from jsonb_array_elements(p_requirements) with ordinality as item(value,ordinality)
      ) extracted where nullif(trim(extracted.text_value),'') is not null
    ),'')
    else '' end
$$;

create or replace function public.opportunity_universe_decision(p_row jsonb, p_observation jsonb, p_source_policy jsonb, p_prior_state jsonb default null)
returns jsonb language plpgsql stable set search_path = public, extensions as $$
declare
  v_source text := lower(trim(coalesce(p_row->>'source','')));
  v_canonical text;
  v_permission text;
  v_permission_reason text;
  v_permission_provenance text;
  v_source_enabled text;
  v_matching_enabled text;
  v_source_operational_reason text;
  v_matching_operational_reason text;
  v_policy_conflict boolean;
  v_deadline text := trim(coalesce(p_row->>'deadline',''));
  v_deadline_status text;
  v_lifecycle text;
  v_lifecycle_reason text;
  v_repair jsonb := null;
  v_professional boolean;
  v_lifecycle_ready boolean;
  v_matching_row text;
  v_matching_reason text;
  v_professional_state text;
  v_professional_reason text;
  v_catalog text;
  v_catalog_row text;
  v_seo text;
  v_seo_row text;
  v_seo_row_reason text;
  v_seo_effective_reason text;
  v_temp_legacy_seo_exception_state text;
  v_temp_legacy_seo_exception_applied boolean := false;
  v_alerts text;
  v_alerts_row text;
  v_final text;
  v_unresolved text[] := '{}';
  v_permission_unknown_dimensions text[] := '{}';
  v_observed_at timestamptz;
  v_updated_at timestamptz;
  v_newer boolean := false;
  v_prior_observation_accepted boolean := false;
  v_hard_dead boolean := false;
  v_live boolean := false;
  v_title text := trim(coalesce(p_row->>'title',''));
  v_description text := trim(coalesce(p_row->>'description',''));
  v_requirements text := public.opportunity_requirements_text(p_row->'requirements');
  v_family text := trim(coalesce(p_row->>'professional_family',''));
  v_permission_state text;
  v_catalog_permission text;
  v_seo_permission text;
  v_alert_permission text;
  v_count_key text;
  v_observation_source text;
  v_seo_content_reason text;
  v_lifecycle_unresolved_reason text;
  v_lifecycle_recovery_class text;
begin
  select canonical_source into v_canonical from public.opportunity_source_identity_aliases where emitted_source = v_source;
  v_canonical := coalesce(v_canonical, v_source);
  select permission_state, reason, provenance into v_permission, v_permission_reason, v_permission_provenance
    from public.opportunity_source_consumer_permissions where canonical_source = v_canonical and consumer = 'matching';
  v_permission := coalesce(v_permission, 'UNKNOWN');
  v_permission_reason := coalesce(v_permission_reason, 'SOURCE_PERMISSION_NOT_EVIDENCED');
  v_permission_provenance := coalesce(v_permission_provenance, 'NO_CANONICAL_PERMISSION_EVIDENCE');
  v_policy_conflict := coalesce((p_source_policy->>'is_enabled_alias_conflict')::boolean,false);
  v_source_enabled := case when v_policy_conflict then 'UNKNOWN' else coalesce(p_source_policy->>'is_enabled','UNKNOWN') end;
  v_source_operational_reason := case when v_policy_conflict then 'SOURCE_POLICY_ALIAS_CONFLICT' when v_source_enabled='UNKNOWN' then 'SOURCE_POLICY_STATE_UNKNOWN' when v_source_enabled='true' then 'SOURCE_OPERATIONALLY_ENABLED' else 'SOURCE_DISABLED' end;
  v_matching_enabled := case when v_policy_conflict or coalesce((p_source_policy->>'matching_enabled_alias_conflict')::boolean,false) then 'UNKNOWN' else coalesce(p_source_policy->>'matching_enabled','UNKNOWN') end;
  v_matching_operational_reason := case when v_policy_conflict or coalesce((p_source_policy->>'matching_enabled_alias_conflict')::boolean,false) then 'SOURCE_POLICY_ALIAS_CONFLICT' when v_matching_enabled='UNKNOWN' then 'SOURCE_MATCHING_SWITCH_UNKNOWN' when v_matching_enabled='true' then 'SOURCE_MATCHING_ENABLED' else 'SOURCE_MATCHING_DISABLED' end;
  v_deadline_status:=public.opportunity_deadline_state(v_deadline);

  begin v_observed_at := nullif(p_observation->>'observed_at','')::timestamptz; exception when others then v_observed_at := null; end;
  begin v_updated_at := nullif(p_row->>'updated_at','')::timestamptz; exception when others then v_updated_at := null; end;
  v_prior_observation_accepted := coalesce((p_observation->>'id' is not null and p_prior_state->'provenance'->>'observation_id'=p_observation->>'id'
    and p_prior_state->>'lifecycle_reason' in ('LATEST_HARD_DEAD_OBSERVATION','LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE','LATEST_LIVE_OBSERVATION_RESOLVES_UNKNOWN_ACTIVE')),false);
  v_newer := v_prior_observation_accepted or (v_observed_at is not null and (v_updated_at is null or v_observed_at > v_updated_at));
  v_hard_dead := v_newer and p_observation->>'identity_status' in ('DEAD','REMOVED') and p_observation->>'http_status' in ('404','410');
  v_live := v_newer and p_observation->>'identity_status' = 'IDENTITY_CONFIRMED' and p_observation->>'http_status' = '200';

  if coalesce(p_row->>'deleted_at','') <> '' then v_lifecycle := 'DELETED'; v_lifecycle_reason := 'ROW_DELETED';
  elsif coalesce(p_row->>'archived_at','') <> '' then v_lifecycle := 'ARCHIVED'; v_lifecycle_reason := 'ROW_ARCHIVED';
  elsif v_deadline_status='EXPIRED' then v_lifecycle:='EXPIRED'; v_lifecycle_reason:='DEADLINE_EXPIRED';
  elsif v_deadline_status='INVALID' then v_lifecycle:='LIFECYCLE_UNKNOWN'; v_lifecycle_reason:='DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN'; end if;
  if v_lifecycle is null and v_hard_dead then v_lifecycle := 'HARD_DEAD'; v_lifecycle_reason := 'LATEST_HARD_DEAD_OBSERVATION';
    if coalesce(p_row->>'is_active','false') = 'true' then v_repair := '{"is_active":false}'::jsonb; end if;
  elsif v_lifecycle is null and coalesce(p_row->>'is_active','') <> 'true' and v_live then
    v_lifecycle := 'STALE_DERIVED_STATE'; v_lifecycle_reason := case when p_row->>'is_active'='false' then 'LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE' else 'LATEST_LIVE_OBSERVATION_RESOLVES_UNKNOWN_ACTIVE' end;
    if p_row->>'verification_status' = 'verified' then v_repair := '{"is_active":true}'::jsonb; end if;
  elsif v_lifecycle is null and coalesce(p_row->>'is_active','') = 'true' and p_row->>'verification_status' = 'verified' then
    v_lifecycle := 'ACTIVE_VALID'; v_lifecycle_reason := case when v_deadline_status='UNKNOWN' then 'ACTIVE_VERIFIED_NO_DEADLINE' else 'ACTIVE_VERIFIED_DEADLINE_OPEN' end;
  elsif v_lifecycle is null and coalesce(p_row->>'is_active','') = 'false' and p_row->>'verification_status' in ('rejected','quarantined') then
    v_lifecycle := 'INACTIVE_VALID'; v_lifecycle_reason := 'VERIFICATION_' || upper(p_row->>'verification_status');
  elsif v_lifecycle is null then v_lifecycle := 'LIFECYCLE_UNKNOWN'; v_lifecycle_reason := 'INSUFFICIENT_LIFECYCLE_EVIDENCE'; end if;

  v_seo_content_reason := case when v_title='' then 'MISSING_TITLE'
    when nullif(trim(coalesce(p_row->>'slug','')),'') is null then 'MISSING_CANONICAL_IDENTITY'
    when length(v_description)<100 then 'THIN_CONTENT'
    when nullif(trim(coalesce(p_row->>'organization','')),'') is null then 'MISSING_ORGANIZATION'
    else 'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' end;
  if v_lifecycle in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then
    v_observation_source := lower(trim(coalesce(p_observation->>'source','')));
    select canonical_source into v_observation_source from public.opportunity_source_identity_aliases where emitted_source=v_observation_source;
    v_observation_source := coalesce(v_observation_source,lower(trim(coalesce(p_observation->>'source',''))));
    v_lifecycle_unresolved_reason := case
      when v_lifecycle='STALE_DERIVED_STATE' then v_lifecycle_reason
      when v_deadline_status='INVALID' then 'DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN'
      when p_observation->>'id' is null then 'NO_OBSERVATION'
      when v_observation_source<>'' and v_observation_source<>v_canonical then 'OBSERVATION_SOURCE_MISMATCH'
      when p_observation->>'identity_status'='IDENTITY_UNRESOLVED' then 'IDENTITY_UNRESOLVED'
      when p_observation->>'identity_status'='IDENTITY_MISMATCH' then 'IDENTITY_MISMATCH'
      when p_observation->>'http_status' in ('0','429') or coalesce(nullif(p_observation->>'http_status','')::integer,0)>=500 then 'TRANSIENT_HTTP_EVIDENCE'
      when p_observation->>'identity_status'='IDENTITY_CONFIRMED' and p_observation->>'http_status'='200' then 'OBSERVATION_NOT_NEWER_THAN_ROW_UPDATE'
      when p_observation->>'http_status' is null then 'HTTP_STATUS_UNKNOWN'
      else 'LIFECYCLE_EVIDENCE_INSUFFICIENT' end;
    v_lifecycle_recovery_class := case
      when v_repair is not null then 'RECOVERABLE_NOW'
      when v_seo_content_reason<>'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' then 'CONTENT_NOT_READY'
      when v_lifecycle_unresolved_reason='OBSERVATION_SOURCE_MISMATCH' then 'SYSTEM_ERROR'
      else 'REFRESH_REQUIRED' end;
  else
    v_lifecycle_unresolved_reason := null;
    v_lifecycle_recovery_class := case when v_lifecycle in ('EXPIRED','DELETED','ARCHIVED','HARD_DEAD','INACTIVE_VALID') then 'EXPLICITLY_INACTIVE' else 'NOT_UNRESOLVED' end;
  end if;

  v_lifecycle_ready := v_lifecycle = 'ACTIVE_VALID';
  v_professional := cardinality(regexp_split_to_array(v_title, '\s+')) >= 2 and (length(v_description) >= 100 or length(v_requirements) >= 60 or coalesce(p_row->>'professional_family','') <> '');
  v_professional_state := case when not v_lifecycle_ready then 'PROFESSIONAL_UNKNOWN' when v_professional then 'PROFESSIONAL_READY' else 'PROFESSIONAL_THIN' end;
  v_professional_reason := case when not v_lifecycle_ready then 'LIFECYCLE_NOT_READY' when v_professional then 'PROFESSIONAL_EVIDENCE_SUFFICIENT' else 'INSUFFICIENT_PROFESSIONAL_EVIDENCE' end;
  if not v_lifecycle_ready then v_matching_row := case when v_lifecycle in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end; v_matching_reason := v_lifecycle_reason;
  elsif v_professional then v_matching_row := 'READY'; v_matching_reason := 'PROFESSIONAL_EVIDENCE_SUFFICIENT';
  else v_matching_row := 'NOT_READY'; v_matching_reason := 'INSUFFICIENT_PROFESSIONAL_EVIDENCE'; end if;
  v_catalog_row := case when not v_lifecycle_ready then case when v_lifecycle in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end
    when v_title = '' or coalesce(p_row->>'slug','') = '' then 'NOT_READY' else 'READY' end;
  -- Catalog/SEO/Alerts permissions are resolved independently below by reading each consumer row.
  select permission_state into v_permission_state from public.opportunity_source_consumer_permissions where canonical_source = v_canonical and consumer = 'catalog';
  v_catalog_permission:=coalesce(v_permission_state,'UNKNOWN');
  v_catalog := case when v_catalog_row <> 'READY' then v_catalog_row when v_source_enabled='UNKNOWN' or coalesce((p_source_policy->>'catalog_enabled_alias_conflict')::boolean,false) or coalesce(p_source_policy->>'catalog_enabled','UNKNOWN')='UNKNOWN' or coalesce(v_permission_state,'UNKNOWN')='UNKNOWN' then 'UNKNOWN' when v_source_enabled='false' or coalesce(p_source_policy->>'catalog_enabled','UNKNOWN')='false' or v_permission_state='DENIED' then 'NOT_READY' else 'READY' end;
  select permission_state into v_permission_state from public.opportunity_source_consumer_permissions where canonical_source = v_canonical and consumer = 'seo_index';
  v_seo_permission:=coalesce(v_permission_state,'UNKNOWN');
  v_seo_row := case when not v_lifecycle_ready then case when v_lifecycle in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end
    when v_title='' or nullif(trim(coalesce(p_row->>'slug','')),'') is null then 'NOT_READY'
    when length(v_description) < 100 then 'NOT_READY'
    when nullif(trim(coalesce(p_row->>'organization','')),'') is null then 'NOT_READY' else 'READY' end;
  v_seo_row_reason := case when not v_lifecycle_ready then v_lifecycle_reason
    when v_title='' then 'MISSING_TITLE'
    when nullif(trim(coalesce(p_row->>'slug','')),'') is null then 'MISSING_CANONICAL_IDENTITY'
    when length(v_description)<100 then 'THIN_CONTENT'
    when nullif(trim(coalesce(p_row->>'organization','')),'') is null then 'MISSING_ORGANIZATION'
    else 'SEO_ROW_READY' end;
  v_temp_legacy_seo_exception_state := case when v_canonical <> 'computrabajo' then 'NOT_APPLICABLE' when current_date <= date '2026-10-09' then 'ACTIVE' else 'EXPIRED' end;
  v_temp_legacy_seo_exception_applied := v_temp_legacy_seo_exception_state='ACTIVE' and v_seo_permission='DENIED'
    and p_row->>'seo_eligible'='true' and p_row->>'seo_status'='eligible' and v_seo_row='READY' and v_source_enabled='true';
  v_seo := case when v_seo_row <> 'READY' then v_seo_row
    when v_source_enabled='UNKNOWN' then 'UNKNOWN'
    when v_source_enabled='false' then 'NOT_READY' else 'READY' end;
  v_seo_effective_reason := case when v_seo_row<>'READY' then v_seo_row_reason
    when v_source_enabled='UNKNOWN' then case when v_policy_conflict then 'SOURCE_POLICY_ALIAS_CONFLICT' else 'SOURCE_OPERATIONAL_STATE_UNKNOWN' end
    when v_source_enabled='false' then 'SOURCE_DISABLED'
    else 'SEO_EFFECTIVE_READY' end;
  select permission_state into v_permission_state from public.opportunity_source_consumer_permissions where canonical_source = v_canonical and consumer = 'alerts';
  v_alert_permission:=coalesce(v_permission_state,'UNKNOWN');
  v_alerts_row := case when not v_lifecycle_ready then case when v_lifecycle in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end when not v_professional then 'NOT_READY' else 'READY' end;
  v_alerts := case when v_alerts_row <> 'READY' then v_alerts_row when v_source_enabled='UNKNOWN' or coalesce((p_source_policy->>'alerts_enabled_alias_conflict')::boolean,false) or coalesce(p_source_policy->>'alerts_enabled','UNKNOWN')='UNKNOWN' or coalesce(v_permission_state,'UNKNOWN')='UNKNOWN' then 'UNKNOWN' when v_source_enabled='false' or coalesce(p_source_policy->>'alerts_enabled','UNKNOWN')='false' or v_permission_state='DENIED' then 'NOT_READY' else 'READY' end;
  select coalesce(array_agg(consumer order by consumer),'{}') into v_permission_unknown_dimensions
    from public.opportunity_source_consumer_permissions
    where canonical_source=v_canonical and permission_state='UNKNOWN';
  v_final := case when v_matching_row <> 'READY' then v_matching_row when v_permission = 'DENIED' or v_source_enabled = 'false' or v_matching_enabled = 'false' then 'NOT_READY'
    when v_permission <> 'ALLOWED' or v_source_enabled = 'UNKNOWN' or v_matching_enabled = 'UNKNOWN' then 'UNKNOWN' else 'READY' end;
  if v_lifecycle in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then v_unresolved := array_append(v_unresolved,'LIFECYCLE'); end if;
  if v_matching_row = 'UNKNOWN' then v_unresolved := array_append(v_unresolved,'ROW_MATCH_READINESS'); end if;
  if v_permission = 'UNKNOWN' then v_unresolved := array_append(v_unresolved,'SOURCE_MATCH_PERMISSION'); end if;
  if v_source_enabled = 'UNKNOWN' then v_unresolved := array_append(v_unresolved,case when v_policy_conflict then 'SOURCE_POLICY_ALIAS_CONFLICT:is_enabled' else 'SOURCE_OPERATIONAL_STATE' end); end if;
  if v_matching_enabled = 'UNKNOWN' and coalesce((p_source_policy->>'matching_enabled_alias_conflict')::boolean,false) then v_unresolved := array_append(v_unresolved,'SOURCE_POLICY_ALIAS_CONFLICT:matching_enabled'); end if;
  if v_matching_enabled = 'UNKNOWN' then v_unresolved := array_append(v_unresolved,'SOURCE_MATCHING_SWITCH'); end if;
  if v_lifecycle_ready and v_catalog_row='READY' and v_catalog_permission='UNKNOWN' then v_unresolved := array_append(v_unresolved,'CATALOG_PERMISSION'); end if;
  if v_lifecycle_ready and v_catalog_row='READY' and (coalesce((p_source_policy->>'catalog_enabled_alias_conflict')::boolean,false) or coalesce(p_source_policy->>'catalog_enabled','UNKNOWN')='UNKNOWN') then v_unresolved := array_append(v_unresolved,case when coalesce((p_source_policy->>'catalog_enabled_alias_conflict')::boolean,false) then 'SOURCE_POLICY_ALIAS_CONFLICT:catalog_enabled' else 'CATALOG_SWITCH_UNKNOWN' end); end if;
  if v_lifecycle_ready and v_alerts_row='READY' and v_alert_permission='UNKNOWN' then v_unresolved := array_append(v_unresolved,'ALERT_PERMISSION'); end if;
  if v_lifecycle_ready and v_alerts_row='READY' and (coalesce((p_source_policy->>'alerts_enabled_alias_conflict')::boolean,false) or coalesce(p_source_policy->>'alerts_enabled','UNKNOWN')='UNKNOWN') then v_unresolved := array_append(v_unresolved,case when coalesce((p_source_policy->>'alerts_enabled_alias_conflict')::boolean,false) then 'SOURCE_POLICY_ALIAS_CONFLICT:alerts_enabled' else 'ALERT_SWITCH_UNKNOWN' end); end if;
  return jsonb_build_object(
    'inventory_state','PRESENT','lifecycle_state',v_lifecycle,'lifecycle_reason',v_lifecycle_reason,'lifecycle_repair',v_repair,
    'professional_readiness',v_professional_state,'professional_reason',v_professional_reason,'catalog_row_state',v_catalog_row,'catalog_state',v_catalog,'alerts_row_state',v_alerts_row,
    'matching_row_state',v_matching_row,'matching_row_reason',v_matching_reason,'source_matching_state',v_permission,
    'source_matching_reason',v_permission_reason,'source_matching_provenance',v_permission_provenance,'source_matching_operational_state',case when v_matching_enabled='true' then 'ALLOWED' when v_matching_enabled='false' then 'DENIED' else 'UNKNOWN' end,'source_matching_operational_reason',v_matching_operational_reason,'source_operational_state',case when v_policy_conflict then 'CONFLICT' when v_source_enabled='true' then 'ENABLED' when v_source_enabled='false' then 'DISABLED' else 'UNKNOWN' end,'source_operational_reason',v_source_operational_reason,
    'final_matching_state',v_final,'seo_row_state',v_seo_row,'seo_row_reason',v_seo_row_reason,'seo_effective_reason',v_seo_effective_reason,'seo_state',v_seo,'alerts_state',v_alerts,'catalog_operational_state',case when p_source_policy->>'catalog_enabled'='true' then 'ALLOWED' when p_source_policy->>'catalog_enabled'='false' then 'DENIED' else 'UNKNOWN' end,'alerts_operational_state',case when p_source_policy->>'alerts_enabled'='true' then 'ALLOWED' when p_source_policy->>'alerts_enabled'='false' then 'DENIED' else 'UNKNOWN' end,'seo_operational_state',case when p_source_policy->>'seo_enabled'='true' then 'ALLOWED' when p_source_policy->>'seo_enabled'='false' then 'DENIED' else 'UNKNOWN' end,'unresolved_dimensions',to_jsonb(v_unresolved),'source_permission_unknown_dimensions',to_jsonb(v_permission_unknown_dimensions),
    'provenance',jsonb_build_object('source',v_canonical,'observation_id',p_observation->>'id','observation_status',p_observation->>'identity_status','observation_http_status',p_observation->>'http_status','observation_at',p_observation->>'observed_at','source_policy_rows',p_source_policy->'policy_rows','source_policy_alias_conflicts',jsonb_build_array(case when coalesce((p_source_policy->>'is_enabled_alias_conflict')::boolean,false) then 'is_enabled' end,case when coalesce((p_source_policy->>'matching_enabled_alias_conflict')::boolean,false) then 'matching_enabled' end,case when coalesce((p_source_policy->>'catalog_enabled_alias_conflict')::boolean,false) then 'catalog_enabled' end,case when coalesce((p_source_policy->>'alerts_enabled_alias_conflict')::boolean,false) then 'alerts_enabled' end,case when coalesce((p_source_policy->>'seo_enabled_alias_conflict')::boolean,false) then 'seo_enabled' end),'consumer_permission_states',jsonb_build_object('catalog',v_catalog_permission,'matching',v_permission,'alerts',v_alert_permission,'seo',v_seo_permission),'consumer_switch_states',jsonb_build_object('catalog',case when p_source_policy->>'catalog_enabled'='true' and not coalesce((p_source_policy->>'catalog_enabled_alias_conflict')::boolean,false) then 'ALLOWED' when p_source_policy->>'catalog_enabled'='false' and not coalesce((p_source_policy->>'catalog_enabled_alias_conflict')::boolean,false) then 'DENIED' else 'UNKNOWN' end,'matching',case when v_matching_enabled='true' then 'ALLOWED' when v_matching_enabled='false' then 'DENIED' else 'UNKNOWN' end,'alerts',case when p_source_policy->>'alerts_enabled'='true' and not coalesce((p_source_policy->>'alerts_enabled_alias_conflict')::boolean,false) then 'ALLOWED' when p_source_policy->>'alerts_enabled'='false' and not coalesce((p_source_policy->>'alerts_enabled_alias_conflict')::boolean,false) then 'DENIED' else 'UNKNOWN' end,'seo',case when p_source_policy->>'seo_enabled'='true' and not coalesce((p_source_policy->>'seo_enabled_alias_conflict')::boolean,false) then 'ALLOWED' when p_source_policy->>'seo_enabled'='false' and not coalesce((p_source_policy->>'seo_enabled_alias_conflict')::boolean,false) then 'DENIED' else 'UNKNOWN' end),'temporary_legacy_seo_exception',case when v_canonical='computrabajo' then jsonb_build_object('name','TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09','state',v_temp_legacy_seo_exception_state,'expires_on','2026-10-09','applied',v_temp_legacy_seo_exception_applied,'permission_state',v_seo_permission,'reason','Preserve qualifying SEO-ready first-party rows during the live observation window; no permission or other consumer is granted.') else null end,'permission_source',v_permission_provenance,'seo_content_readiness_independent_of_lifecycle',case when v_seo_content_reason='SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' then 'READY' else 'NOT_READY' end,'seo_content_reason',v_seo_content_reason,'lifecycle_unresolved_reason',v_lifecycle_unresolved_reason,'lifecycle_recovery_class',v_lifecycle_recovery_class)
  );
end $$;

create or replace function public.refresh_opportunity_universe(p_opportunity_id text,p_apply_lifecycle_repair boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_observation jsonb; v_policy jsonb; v_decision jsonb; v_prior_state jsonb; v_source text; v_canonical text; v_lifecycle_changed boolean:=false;
begin
  select to_jsonb(o) into v_row from public.opportunities o where o.id::text = p_opportunity_id;
  if v_row is null then delete from public.opportunity_universe_state where opportunity_id=p_opportunity_id; return null; end if;
  select to_jsonb(u) into v_prior_state from public.opportunity_universe_state u where u.opportunity_id=p_opportunity_id;
  v_source := lower(trim(coalesce(v_row->>'source','')));
  select canonical_source into v_canonical from public.opportunity_source_identity_aliases where emitted_source=v_source;
  v_canonical := coalesce(v_canonical,v_source);
  select to_jsonb(obs) into v_observation from public.opportunity_source_observations obs where obs.opportunity_id::text=p_opportunity_id order by obs.observed_at desc, obs.id desc limit 1;
  v_policy := public.canonical_opportunity_source_policy(v_source);
  v_decision := public.opportunity_universe_decision(v_row,v_observation,v_policy,v_prior_state);
  insert into public.opportunity_universe_state(opportunity_id,inventory_state,lifecycle_state,lifecycle_reason,lifecycle_repair,professional_readiness,professional_reason,catalog_row_state,catalog_state,alerts_row_state,matching_row_state,matching_row_reason,source_matching_state,source_matching_reason,source_matching_provenance,source_matching_operational_state,source_matching_operational_reason,source_operational_state,source_operational_reason,final_matching_state,seo_row_state,seo_row_reason,seo_effective_reason,seo_state,alerts_state,unresolved_dimensions,source_permission_unknown_dimensions,provenance,evaluated_at)
  values(p_opportunity_id,v_decision->>'inventory_state',v_decision->>'lifecycle_state',v_decision->>'lifecycle_reason',v_decision->'lifecycle_repair',v_decision->>'professional_readiness',v_decision->>'professional_reason',v_decision->>'catalog_row_state',v_decision->>'catalog_state',v_decision->>'alerts_row_state',v_decision->>'matching_row_state',v_decision->>'matching_row_reason',v_decision->>'source_matching_state',v_decision->>'source_matching_reason',v_decision->>'source_matching_provenance',v_decision->>'source_matching_operational_state',v_decision->>'source_matching_operational_reason',v_decision->>'source_operational_state',v_decision->>'source_operational_reason',v_decision->>'final_matching_state',v_decision->>'seo_row_state',v_decision->>'seo_row_reason',v_decision->>'seo_effective_reason',v_decision->>'seo_state',v_decision->>'alerts_state',array(select jsonb_array_elements_text(v_decision->'unresolved_dimensions')),array(select jsonb_array_elements_text(v_decision->'source_permission_unknown_dimensions')),v_decision->'provenance',now())
  on conflict(opportunity_id) do update set inventory_state=excluded.inventory_state,lifecycle_state=excluded.lifecycle_state,lifecycle_reason=excluded.lifecycle_reason,lifecycle_repair=excluded.lifecycle_repair,professional_readiness=excluded.professional_readiness,professional_reason=excluded.professional_reason,catalog_row_state=excluded.catalog_row_state,catalog_state=excluded.catalog_state,alerts_row_state=excluded.alerts_row_state,matching_row_state=excluded.matching_row_state,matching_row_reason=excluded.matching_row_reason,source_matching_state=excluded.source_matching_state,source_matching_reason=excluded.source_matching_reason,source_matching_provenance=excluded.source_matching_provenance,source_matching_operational_state=excluded.source_matching_operational_state,source_matching_operational_reason=excluded.source_matching_operational_reason,source_operational_state=excluded.source_operational_state,source_operational_reason=excluded.source_operational_reason,final_matching_state=excluded.final_matching_state,seo_row_state=excluded.seo_row_state,seo_row_reason=excluded.seo_row_reason,seo_effective_reason=excluded.seo_effective_reason,seo_state=excluded.seo_state,alerts_state=excluded.alerts_state,unresolved_dimensions=excluded.unresolved_dimensions,source_permission_unknown_dimensions=excluded.source_permission_unknown_dimensions,provenance=excluded.provenance,evaluated_at=excluded.evaluated_at;
  if p_apply_lifecycle_repair and v_decision->'lifecycle_repair' is not null and v_decision->'lifecycle_repair'<>'null'::jsonb then
    if v_decision->'lifecycle_repair'->>'is_active'='false' or (v_decision->'lifecycle_repair'->>'is_active'='true' and v_row->>'verification_status'='verified') then
      update public.opportunities set is_active=(v_decision->'lifecycle_repair'->>'is_active')::boolean where id::text=p_opportunity_id and is_active is distinct from (v_decision->'lifecycle_repair'->>'is_active')::boolean;
      v_lifecycle_changed:=found;
      if v_lifecycle_changed then
        insert into public.opportunity_lifecycle_repair_audit(opportunity_id,prior_is_active,repaired_is_active,reason,observation_id,observation_status,observation_http_status,observation_at)
        values(p_opportunity_id,(v_row->>'is_active')::boolean,(v_decision->'lifecycle_repair'->>'is_active')::boolean,v_decision->>'lifecycle_reason',nullif(v_observation->>'id','')::uuid,v_observation->>'identity_status',nullif(v_observation->>'http_status','')::integer,nullif(v_observation->>'observed_at','')::timestamptz);
        return jsonb_set(public.refresh_opportunity_universe(p_opportunity_id,false),'{lifecycle_flag_changed}','true'::jsonb,true);
      end if;
    end if;
  end if;
  update public.opportunities set catalog_eligible=(v_decision->>'catalog_row_state'='READY'),match_eligible=(v_decision->>'matching_row_state'='READY'),alerts_eligible=(v_decision->>'alerts_row_state'='READY'),seo_eligible=(v_decision->>'seo_row_state'='READY')
    where id::text=p_opportunity_id and (catalog_eligible is distinct from (v_decision->>'catalog_row_state'='READY') or match_eligible is distinct from (v_decision->>'matching_row_state'='READY') or alerts_eligible is distinct from (v_decision->>'alerts_row_state'='READY') or seo_eligible is distinct from (v_decision->>'seo_row_state'='READY'));
  return jsonb_set(v_decision,'{lifecycle_flag_changed}',to_jsonb(v_lifecycle_changed),true);
end $$;

create or replace function public.opportunity_universe_after_write() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and (to_jsonb(new)-array['catalog_eligible','match_eligible','alerts_eligible','seo_eligible','updated_at']) is not distinct from (to_jsonb(old)-array['catalog_eligible','match_eligible','alerts_eligible','seo_eligible','updated_at']) then return new; end if;
  perform public.refresh_opportunity_universe(new.id::text,false); return new;
end $$;
drop trigger if exists opportunities_refresh_universe on public.opportunities;
create trigger opportunities_refresh_universe after insert or update on public.opportunities for each row execute function public.opportunity_universe_after_write();

-- Replace the legacy admin RPC that coupled an operational Matching switch to
-- opportunities.match_eligible. Row readiness is intrinsic; the switch is
-- evaluated independently by the universe reducer.
create or replace function public.admin_update_source_policy_atomic(
  p_source text, p_changes jsonb, p_expected_updated_at timestamptz default null, p_actor text default 'admin'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_current public.opportunity_sources%rowtype; v_after public.opportunity_sources%rowtype; v_impacted integer:=0;
begin
  select * into v_current from public.opportunity_sources where source=p_source for update;
  if not found then raise exception 'source_not_found'; end if;
  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then raise exception 'stale_source_policy'; end if;
  if p_changes ? 'source_tier' and p_changes->>'source_tier' not in ('SS','S','A','B') then raise exception 'invalid_source_tier'; end if;
  update public.opportunity_sources set
    display_name=case when p_changes?'display_name' then left(trim(p_changes->>'display_name'),240) else display_name end,
    source_tier=case when p_changes?'source_tier' then p_changes->>'source_tier' else source_tier end,
    trust_level=case when p_changes?'trust_level' then p_changes->>'trust_level' else trust_level end,
    auto_verify=case when p_changes?'auto_verify' then (p_changes->>'auto_verify')::boolean else auto_verify end,
    is_enabled=case when p_changes?'is_enabled' then (p_changes->>'is_enabled')::boolean else is_enabled end,
    catalog_enabled=case when p_changes?'catalog_enabled' then (p_changes->>'catalog_enabled')::boolean else catalog_enabled end,
    matching_enabled=case when p_changes?'matching_enabled' then (p_changes->>'matching_enabled')::boolean else matching_enabled end,
    alerts_enabled=case when p_changes?'alerts_enabled' then (p_changes->>'alerts_enabled')::boolean else alerts_enabled end,
    seo_enabled=case when p_changes?'seo_enabled' then (p_changes->>'seo_enabled')::boolean else seo_enabled end,
    allowed_country_codes=case when p_changes?'allowed_country_codes' then array(select upper(value) from jsonb_array_elements_text(p_changes->'allowed_country_codes')) else allowed_country_codes end,
    allowed_opportunity_types=case when p_changes?'allowed_opportunity_types' then array(select value from jsonb_array_elements_text(p_changes->'allowed_opportunity_types')) else allowed_opportunity_types end,
    max_items_per_day=case when p_changes?'max_items_per_day' then greatest(1,least(5000,(p_changes->>'max_items_per_day')::integer)) else max_items_per_day end,
    retention_days=case when p_changes?'retention_days' then greatest(1,least(365,(p_changes->>'retention_days')::integer)) else retention_days end,
    verification_criteria=case when p_changes?'verification_criteria' then p_changes->'verification_criteria' else verification_criteria end,
    notes=case when p_changes?'notes' then nullif(left(trim(p_changes->>'notes'),2000),'') else notes end,
    updated_at=clock_timestamp(),updated_by=left(coalesce(nullif(p_actor,''),'admin'),120)
  where source=p_source returning * into v_after;
  insert into public.admin_policy_events(entity_type,entity_key,before_state,after_state,impacted_rows,actor)
  values('source',p_source,to_jsonb(v_current),to_jsonb(v_after),v_impacted,left(coalesce(nullif(p_actor,''),'admin'),120));
  return jsonb_build_object('ok',true,'impacted_rows',v_impacted,'updated_at',v_after.updated_at);
end $$;

create or replace function public.refresh_due_opportunity_universe(p_limit integer default 500)
returns integer language plpgsql security definer set search_path=public as $$
declare v_id text; v_count integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  if p_limit<1 or p_limit>500 then raise exception 'page_size_out_of_range'; end if;
  -- Drain at most one canonical permission-change source per bounded runtime
  -- refresh invocation; permission writes themselves never scan inventory.
  perform public.refresh_dirty_opportunity_universe_sources(1);
  for v_id in select o.id::text from public.opportunities o join public.opportunity_universe_state u on u.opportunity_id=o.id::text
    where u.lifecycle_state='ACTIVE_VALID' and public.opportunity_deadline_state(o.deadline)='EXPIRED'
    order by o.deadline asc,o.id::text asc limit p_limit loop
      perform public.refresh_opportunity_universe(v_id); v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create or replace function public.opportunity_observation_refresh_universe() returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- This trigger is the explicit NEW-OBSERVATION lifecycle authority. Generic
  -- row/policy refreshes never apply historical lifecycle repairs.
  perform public.refresh_opportunity_universe(new.opportunity_id::text,true); return new;
end $$;
drop trigger if exists opportunity_observation_refresh_universe on public.opportunity_source_observations;
create trigger opportunity_observation_refresh_universe after insert on public.opportunity_source_observations for each row execute function public.opportunity_observation_refresh_universe();

create or replace function public.opportunity_source_policy_refresh_universe() returns trigger language plpgsql security definer set search_path=public as $$
declare v_canonical text;
begin
  select canonical_source into v_canonical from public.opportunity_source_identity_aliases where emitted_source=lower(new.source);
  v_canonical:=coalesce(v_canonical,lower(new.source));
  insert into public.opportunity_universe_dirty_sources(canonical_source,reason)
  values(v_canonical,'SOURCE_OPERATIONAL_POLICY_CHANGED')
  on conflict(canonical_source) do update set queued_at=now(),reason=excluded.reason;
  return new;
end $$;
drop trigger if exists opportunity_sources_refresh_universe on public.opportunity_sources;
create trigger opportunity_sources_refresh_universe after insert or update of source,is_enabled,catalog_enabled,matching_enabled,alerts_enabled,seo_enabled on public.opportunity_sources for each row execute function public.opportunity_source_policy_refresh_universe();

create or replace function public.opportunity_permission_refresh_universe() returns trigger language plpgsql security definer set search_path=public as $$
declare v_has_reconciled_rows boolean:=false;
begin
  -- Inserts and changes only enqueue one canonical source. They never inspect
  -- inventory in this trigger; repeated consumer writes coalesce by source.
  -- Initial permission seed is not queued while no opportunity has persisted
  -- Universe state; the explicit bounded reconciliation will consume this truth.
  if tg_op='INSERT' or (old.permission_state,old.reason,old.provenance,old.evidence_type,old.evidence_reference) is distinct from
      (new.permission_state,new.reason,new.provenance,new.evidence_type,new.evidence_reference) then
    select exists(select 1 from public.opportunity_universe_state u join public.opportunities o on o.id::text=u.opportunity_id
      where lower(trim(o.source))=new.canonical_source or lower(trim(o.source)) in
        (select emitted_source from public.opportunity_source_identity_aliases where canonical_source=new.canonical_source))
      into v_has_reconciled_rows;
    if v_has_reconciled_rows then
      insert into public.opportunity_universe_dirty_sources(canonical_source,reason)
      values(new.canonical_source,'SOURCE_PERMISSION_CHANGED')
      on conflict(canonical_source) do update set queued_at=now(),reason=excluded.reason;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists opportunity_permissions_refresh_universe on public.opportunity_source_consumer_permissions;
create trigger opportunity_permissions_refresh_universe after insert or update on public.opportunity_source_consumer_permissions for each row execute function public.opportunity_permission_refresh_universe();

create or replace function public.refresh_dirty_opportunity_universe_sources(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_source text; v_sources integer:=0; v_rows integer:=0; v_rows_one integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  if p_limit<1 or p_limit>100 then raise exception 'source_page_size_out_of_range'; end if;
  for v_source in select canonical_source from public.opportunity_universe_dirty_sources order by queued_at,canonical_source limit p_limit for update skip locked loop
    select count(*) into v_rows_one from public.opportunities o where lower(o.source) in (select emitted_source from public.opportunity_source_identity_aliases where canonical_source=v_source);
    perform public.refresh_opportunity_universe(o.id::text,false) from public.opportunities o where lower(o.source) in
      (select emitted_source from public.opportunity_source_identity_aliases where canonical_source=v_source);
    delete from public.opportunity_universe_dirty_sources where canonical_source=v_source;
    v_rows:=v_rows+v_rows_one; v_sources:=v_sources+1;
  end loop;
  return jsonb_build_object('sources_refreshed',v_sources,'opportunities_refreshed',v_rows);
end $$;

-- Future rows use the same predicate as the historical reducer. The trusted
-- source workflow remains responsible for verification; row flags are only
-- projections of canonical row readiness and never source permission.
create or replace function public.apply_opportunity_source_trust()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_source_policy jsonb; v_source_trust jsonb; v_decision jsonb;
begin
  new.source:=coalesce(nullif(trim(new.source),''),'unknown');
  insert into public.opportunity_sources(source,display_name,trust_level,auto_verify,is_enabled,notes)
  values(new.source,initcap(replace(new.source,'_',' ')),'review',false,true,'Fuente detectada automáticamente; requiere configuración.') on conflict(source) do nothing;
  select to_jsonb(s) into v_source_trust from public.opportunity_sources s where s.source=new.source;
  new.country_code:=coalesce(new.country_code,(v_source_trust->>'country_code'));
  if v_source_trust->>'trust_level'='blocked' or v_source_trust->>'is_enabled'<>'true' then new.verification_status:='quarantined'; new.is_active:=false;
  elsif new.verification_status='pending' and v_source_trust->>'auto_verify'='true' then
    new.verification_status:='verified'; new.verification_score:=coalesce(new.verification_score,85);
    new.verification_reasons:=coalesce(nullif(new.verification_reasons,'[]'::jsonb),(v_source_trust->'verification_criteria'));
    new.reviewed_at:=coalesce(new.reviewed_at,now()); new.reviewed_by:=coalesce(new.reviewed_by,'source_policy:'||new.source); new.is_active:=true;
  elsif new.verification_status<>'verified' then new.is_active:=false; end if;
  v_source_policy:=public.canonical_opportunity_source_policy(new.source);
  v_decision:=public.opportunity_universe_decision(to_jsonb(new),null,v_source_policy);
  new.catalog_eligible:=(v_decision->>'catalog_row_state'='READY');
  new.match_eligible:=(v_decision->>'matching_row_state'='READY');
  new.alerts_eligible:=(v_decision->>'alerts_row_state'='READY');
  new.seo_eligible:=(v_decision->>'seo_row_state'='READY');
  return new;
end $$;
drop trigger if exists opportunity_source_trust_before_insert on public.opportunities;
create trigger opportunity_source_trust_before_insert before insert on public.opportunities for each row execute function public.apply_opportunity_source_trust();

create or replace view public.opportunity_final_matching_universe with (security_invoker=true) as
select o.*, u.lifecycle_state as universe_lifecycle_state, u.matching_row_state as universe_matching_row_state,
       u.source_matching_state as universe_source_matching_state, u.final_matching_state as universe_final_matching_state, u.alerts_state as universe_alerts_state
from public.opportunities o join public.opportunity_universe_state u on u.opportunity_id=o.id::text
where u.final_matching_state='READY' and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN');
create or replace view public.opportunity_catalog_universe with (security_invoker=true) as
select o.*,u.lifecycle_state as universe_lifecycle_state,u.catalog_state as universe_catalog_state
from public.opportunities o join public.opportunity_universe_state u on u.opportunity_id=o.id::text where u.catalog_state='READY' and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN');
create or replace view public.opportunity_seo_universe with (security_invoker=true) as
select o.*,u.lifecycle_state as universe_lifecycle_state,u.seo_state as universe_seo_state
from public.opportunities o join public.opportunity_universe_state u on u.opportunity_id=o.id::text where u.seo_state='READY' and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN');
create or replace view public.opportunity_alert_universe with (security_invoker=true) as
select o.*,u.lifecycle_state as universe_lifecycle_state,u.alerts_state as universe_alerts_state
  ,u.final_matching_state as universe_final_matching_state
from public.opportunities o join public.opportunity_universe_state u on u.opportunity_id=o.id::text where u.alerts_state='READY' and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN');
revoke all on public.opportunity_final_matching_universe,public.opportunity_catalog_universe,public.opportunity_seo_universe,public.opportunity_alert_universe from public,anon,authenticated;
grant select on public.opportunity_final_matching_universe,public.opportunity_catalog_universe,public.opportunity_seo_universe,public.opportunity_alert_universe to service_role;

create or replace function public.reconcile_opportunity_universe_page(p_after_id text default null,p_page_size integer default 250,p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row record; v_count integer:=0; v_next text:=p_after_id; v_decision jsonb; v_applied jsonb; v_observation jsonb; v_policy jsonb; v_prior_state jsonb; v_source text; v_canonical text;
  v_counts jsonb:='{}'::jsonb; v_changed integer:=0; v_count_key text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_page_size < 1 or p_page_size > 500 then raise exception 'page_size_out_of_range'; end if;
  for v_row in select to_jsonb(o) as row_json, o.id::text as row_id from public.opportunities o where p_after_id is null or o.id::text>p_after_id order by o.id::text limit p_page_size loop
    v_source:=lower(trim(coalesce(v_row.row_json->>'source','')));
    select canonical_source into v_canonical from public.opportunity_source_identity_aliases where emitted_source=v_source;
    v_canonical:=coalesce(v_canonical,v_source);
    select to_jsonb(obs) into v_observation from public.opportunity_source_observations obs where obs.opportunity_id::text=v_row.row_id order by obs.observed_at desc,obs.id desc limit 1;
    select to_jsonb(u) into v_prior_state from public.opportunity_universe_state u where u.opportunity_id=v_row.row_id;
    v_policy := public.canonical_opportunity_source_policy(v_source);
    v_decision:=public.opportunity_universe_decision(v_row.row_json,v_observation,v_policy,v_prior_state);
    v_count_key:=v_decision->>'lifecycle_state';
    v_counts:=jsonb_set(v_counts,array[v_count_key],to_jsonb(coalesce((v_counts->>v_count_key)::integer,0)+1),true);
    v_count_key:='final:'||(v_decision->>'final_matching_state');
    v_counts:=jsonb_set(v_counts,array[v_count_key],to_jsonb(coalesce((v_counts->>v_count_key)::integer,0)+1),true);
    if p_apply then
      v_applied:=public.refresh_opportunity_universe(v_row.row_id,true);
      if coalesce((v_applied->>'lifecycle_flag_changed')::boolean,false) then v_changed:=v_changed+1; end if;
    end if;
    v_count:=v_count+1; v_next:=v_row.row_id;
  end loop;
  return jsonb_build_object('examined',v_count,'cursor_id',v_next,'complete',v_count<p_page_size,'apply',p_apply,'changed_lifecycle_flags',v_changed,'counts',v_counts);
end $$;

create or replace function public.get_opportunity_universe_summary()
returns jsonb language sql security definer set search_path=public as $$
  with universe_summary_per_source_base as (
    select provenance->>'source' source,count(*) n,
      count(*) filter(where lifecycle_state='ACTIVE_VALID') active_valid,
      count(*) filter(where lifecycle_state='INACTIVE_VALID') inactive_valid,
      count(*) filter(where lifecycle_state='STALE_DERIVED_STATE') stale_derived_state,
      count(*) filter(where lifecycle_state='LIFECYCLE_UNKNOWN') lifecycle_unknown,
      count(*) filter(where catalog_state='READY') catalog_ready,
      count(*) filter(where matching_row_state='READY') match_row_ready,
      count(*) filter(where source_matching_state='ALLOWED') source_match_allowed,
      count(*) filter(where source_matching_state='DENIED') source_match_denied,
      count(*) filter(where source_matching_state='UNKNOWN') policy_unknown,
      count(*) filter(where source_matching_operational_state='DENIED') matching_switch_disabled,
      count(*) filter(where source_matching_operational_state='UNKNOWN') matching_switch_unknown,
      count(*) filter(where final_matching_state='READY') final_matching,
      count(*) filter(where seo_state='READY') seo,
      count(*) filter(where seo_row_state='READY') seo_row_ready,
      count(*) filter(where seo_row_state='NOT_READY') seo_row_not_ready,
      count(*) filter(where seo_row_state='UNKNOWN') seo_row_unknown,
      count(*) filter(where seo_state='READY') seo_effective_ready,
      count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'seo_content_readiness_independent_of_lifecycle'='READY') seo_content_ready_unresolved,
      count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'lifecycle_recovery_class'='RECOVERABLE_NOW') lifecycle_recoverable_now,
      count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'lifecycle_recovery_class'='REFRESH_REQUIRED') lifecycle_refresh_required,
      count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'lifecycle_recovery_class'='CONTENT_NOT_READY') lifecycle_content_not_ready,
      count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'lifecycle_recovery_class'='SYSTEM_ERROR') lifecycle_system_error,
      count(*) filter(where seo_row_state='READY' and provenance->'consumer_permission_states'->>'seo'='UNKNOWN') seo_permission_unknown_ready_rows,
      count(*) filter(where alerts_state='READY') alerts,
      count(*) filter(where professional_readiness='PROFESSIONAL_THIN') professional_thin,
      count(*) filter(where matching_row_state='UNKNOWN') match_row_unknown
    from public.opportunity_universe_state
    group by provenance->>'source'
  ), universe_summary_lifecycle_reason_counts as (
    select provenance->>'source' source,provenance->>'lifecycle_unresolved_reason' reason,count(*) n
    from public.opportunity_universe_state
    where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE')
    group by provenance->>'source',provenance->>'lifecycle_unresolved_reason'
  ), universe_summary_lifecycle_reason_json as (
    select source,jsonb_object_agg(reason,n) top_lifecycle_unresolved_reasons
    from universe_summary_lifecycle_reason_counts group by source
  ), universe_summary_seo_reason_counts as (
    select provenance->>'source' source,seo_effective_reason reason,count(*) n
    from public.opportunity_universe_state where seo_state<>'READY'
    group by provenance->>'source',seo_effective_reason
  ), universe_summary_seo_reason_ranked as (
    select source,reason,n,row_number() over(partition by source order by n desc,reason) reason_rank
    from universe_summary_seo_reason_counts
  ), universe_summary_seo_reason_json as (
    select source,jsonb_object_agg(reason,n) seo_block_reasons
    from universe_summary_seo_reason_ranked where reason_rank<=10 group by source
  ), universe_summary_per_source as (
    select b.*,coalesce(l.top_lifecycle_unresolved_reasons,'{}'::jsonb) top_lifecycle_unresolved_reasons,
      coalesce(s.seo_block_reasons,'{}'::jsonb) seo_block_reasons
    from universe_summary_per_source_base b
    left join universe_summary_lifecycle_reason_json l using(source)
    left join universe_summary_seo_reason_json s using(source)
  )
  select jsonb_build_object('total_inventory',(select count(*) from public.opportunities),
    'lifecycle',coalesce((select jsonb_object_agg(lifecycle_state,n) from (select lifecycle_state,count(*) n from public.opportunity_universe_state group by lifecycle_state) x),'{}'::jsonb),
    'active_valid',(select count(*) from public.opportunity_universe_state where lifecycle_state='ACTIVE_VALID'),
    'inactive_valid',(select count(*) from public.opportunity_universe_state where lifecycle_state='INACTIVE_VALID'),
    'stale_derived_state',(select count(*) from public.opportunity_universe_state where lifecycle_state='STALE_DERIVED_STATE'),
    'lifecycle_unknown',(select count(*) from public.opportunity_universe_state where lifecycle_state='LIFECYCLE_UNKNOWN'),
    'catalog_universe',(select count(*) from public.opportunity_universe_state where catalog_state='READY'),
    'match_row_ready',(select count(*) from public.opportunity_universe_state where matching_row_state='READY'),
    'match_row_unknown',(select count(*) from public.opportunity_universe_state where matching_row_state='UNKNOWN'),
    'source_permission_allowed',(select count(*) from public.opportunity_universe_state where source_matching_state='ALLOWED'),
    'source_policy_unknown',(select count(*) from public.opportunity_universe_state where source_matching_state='UNKNOWN'),
    'source_match_allowed',(select count(*) from public.opportunity_universe_state where source_matching_state='ALLOWED'),
    'final_matching_universe',(select count(*) from public.opportunity_universe_state where final_matching_state='READY'),
    'seo_universe',(select count(*) from public.opportunity_universe_state where seo_state='READY'),
    'seo_row_ready',(select count(*) from public.opportunity_universe_state where seo_row_state='READY'),
    'seo_row_not_ready',(select count(*) from public.opportunity_universe_state where seo_row_state='NOT_READY'),
    'seo_row_unknown',(select count(*) from public.opportunity_universe_state where seo_row_state='UNKNOWN'),
    'seo_effective_ready',(select count(*) from public.opportunity_universe_state where seo_state='READY'),
    'seo_content_ready_independent_of_lifecycle',(select count(*) from public.opportunity_universe_state where provenance->>'seo_content_readiness_independent_of_lifecycle'='READY'),
    'seo_content_ready_while_lifecycle_unresolved',(select count(*) from public.opportunity_universe_state where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'seo_content_readiness_independent_of_lifecycle'='READY'),
    'lifecycle_recovery',jsonb_build_object('RECOVERABLE_NOW',(select count(*) from public.opportunity_universe_state where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'lifecycle_recovery_class'='RECOVERABLE_NOW'),'REFRESH_REQUIRED',(select count(*) from public.opportunity_universe_state where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'lifecycle_recovery_class'='REFRESH_REQUIRED'),'CONTENT_NOT_READY',(select count(*) from public.opportunity_universe_state where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'lifecycle_recovery_class'='CONTENT_NOT_READY'),'SYSTEM_ERROR',(select count(*) from public.opportunity_universe_state where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'lifecycle_recovery_class'='SYSTEM_ERROR')),
    'top_lifecycle_unresolved_reasons',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason) from (select provenance->>'lifecycle_unresolved_reason' reason,count(*) n from public.opportunity_universe_state where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') group by provenance->>'lifecycle_unresolved_reason' order by count(*) desc limit 10) lifecycle_reasons),'[]'::jsonb),
    'lifecycle_recovery_per_source',coalesce((
      with source_base as (
        select provenance->>'source' source,
          count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE')) unresolved,
          count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and provenance->>'seo_content_readiness_independent_of_lifecycle'='READY') content_ready
        from public.opportunity_universe_state
        group by provenance->>'source'
        having count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE')) > 0
      ), recovery_counts as (
        select provenance->>'source' source,provenance->>'lifecycle_recovery_class' recovery_class,count(*) n
        from public.opportunity_universe_state
        where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE')
        group by provenance->>'source',provenance->>'lifecycle_recovery_class'
      ), recovery_json as (
        select source,jsonb_object_agg(recovery_class,n) recovery from recovery_counts group by source
      ), reason_counts as (
        select provenance->>'source' source,provenance->>'lifecycle_unresolved_reason' reason,count(*) n
        from public.opportunity_universe_state
        where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE')
        group by provenance->>'source',provenance->>'lifecycle_unresolved_reason'
      ), reason_json as (
        select source,jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason) reasons
        from reason_counts group by source
      )
      select jsonb_agg(jsonb_build_object(
        'source',b.source,
        'lifecycle_unresolved_total',b.unresolved,
        'seo_content_ready_while_lifecycle_unresolved',b.content_ready,
        'recovery',coalesce(r.recovery,'{}'::jsonb),
        'top_reasons',coalesce(j.reasons,'[]'::jsonb)
      ) order by b.unresolved desc,b.source)
      from source_base b
      left join recovery_json r using(source)
      left join reason_json j using(source)
    ),'[]'::jsonb),
    'seo_permission_unknown_ready_rows',(select count(*) from public.opportunity_universe_state where seo_row_state='READY' and provenance->'consumer_permission_states'->>'seo'='UNKNOWN'),
    'top_seo_block_reasons',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason) from (select seo_effective_reason reason,count(*) n from public.opportunity_universe_state where seo_state<>'READY' group by seo_effective_reason order by count(*) desc limit 10) seo_reasons),'[]'::jsonb),
    'alert_universe',(select count(*) from public.opportunity_universe_state where alerts_state='READY'),
    'professional_thin',(select count(*) from public.opportunity_universe_state where professional_readiness='PROFESSIONAL_THIN'),
    'unresolved',(select count(*) from public.opportunity_universe_state where cardinality(unresolved_dimensions)>0),
    'inventory_state_reconciliation_difference',(select count(*) from public.opportunities)-(select count(*) from public.opportunity_universe_state),
    'matching_switch_denied',(select count(*) from public.opportunity_universe_state where source_matching_operational_state='DENIED'),
    'matching_switch_unknown',(select count(*) from public.opportunity_universe_state where source_matching_operational_state='UNKNOWN'),
    'matching_first_failure',coalesce((select jsonb_object_agg(reason,n) from (select case when lifecycle_state<>'ACTIVE_VALID' then 'LIFECYCLE_'||lifecycle_state when matching_row_state='NOT_READY' then 'MATCH_ROW_NOT_READY:'||matching_row_reason when matching_row_state='UNKNOWN' then 'MATCH_ROW_UNKNOWN' when source_operational_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT' when provenance->'source_policy_alias_conflicts' ? 'matching_enabled' then 'SOURCE_POLICY_ALIAS_CONFLICT' when source_matching_state='DENIED' then 'SOURCE_MATCH_DENIED' when source_matching_state='UNKNOWN' then 'SOURCE_MATCH_UNKNOWN' when source_matching_operational_state='DENIED' then 'SOURCE_MATCHING_DISABLED' when source_matching_operational_state='UNKNOWN' then 'SOURCE_MATCHING_UNKNOWN' when source_operational_state='DISABLED' then 'SOURCE_DISABLED' when source_operational_state='UNKNOWN' then 'SOURCE_STATE_UNKNOWN' else 'FINAL_MATCHING_UNIVERSE' end reason,count(*) n from public.opportunity_universe_state group by 1) x),'{}'::jsonb),
    'matching_first_failure_reconciliation_difference',(select count(*) from public.opportunities)-(select coalesce(sum(n),0) from (select count(*) n from public.opportunity_universe_state group by case when lifecycle_state<>'ACTIVE_VALID' then 'LIFECYCLE_'||lifecycle_state when matching_row_state='NOT_READY' then 'MATCH_ROW_NOT_READY:'||matching_row_reason when matching_row_state='UNKNOWN' then 'MATCH_ROW_UNKNOWN' when source_operational_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT' when provenance->'source_policy_alias_conflicts' ? 'matching_enabled' then 'SOURCE_POLICY_ALIAS_CONFLICT' when source_matching_state='DENIED' then 'SOURCE_MATCH_DENIED' when source_matching_state='UNKNOWN' then 'SOURCE_MATCH_UNKNOWN' when source_matching_operational_state='DENIED' then 'SOURCE_MATCHING_DISABLED' when source_matching_operational_state='UNKNOWN' then 'SOURCE_MATCHING_UNKNOWN' when source_operational_state='DISABLED' then 'SOURCE_DISABLED' when source_operational_state='UNKNOWN' then 'SOURCE_STATE_UNKNOWN' else 'FINAL_MATCHING_UNIVERSE' end) x),
    'active_matching_reconciliation_difference',(select count(*) filter(where lifecycle_state='ACTIVE_VALID') from public.opportunity_universe_state)-coalesce((select sum(n) from (select case when matching_row_state='NOT_READY' then 'MATCH_ROW_NOT_READY' when matching_row_state='UNKNOWN' then 'MATCH_ROW_UNKNOWN' when source_matching_state='DENIED' then 'SOURCE_MATCH_DENIED' when source_matching_state='UNKNOWN' then 'SOURCE_MATCH_UNKNOWN' when source_matching_operational_state='DENIED' then 'SOURCE_MATCHING_DISABLED' when source_matching_operational_state='UNKNOWN' then 'SOURCE_MATCHING_UNKNOWN' when source_operational_state='DISABLED' then 'SOURCE_DISABLED' when source_operational_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT' when source_operational_state='UNKNOWN' then 'SOURCE_STATE_UNKNOWN' else 'FINAL_MATCHING_UNIVERSE' end reason,count(*) n from public.opportunity_universe_state where lifecycle_state='ACTIVE_VALID' group by 1) x),0),
    'routing_unresolved_rows',(select count(*) from public.opportunity_universe_state where cardinality(unresolved_dimensions)>0),
    'rows_with_any_source_permission_unknown',(select count(*) from public.opportunity_universe_state where cardinality(source_permission_unknown_dimensions)>0),
    'source_permission_unknown_dimension_claims',(select coalesce(sum(cardinality(source_permission_unknown_dimensions)),0) from public.opportunity_universe_state),
    'per_source',coalesce((select jsonb_agg(jsonb_build_object('source',coalesce(x.source,'UNKNOWN'),'total',x.n,'active_valid',x.active_valid,'inactive_valid',x.inactive_valid,'stale_derived_state',x.stale_derived_state,'lifecycle_unknown',x.lifecycle_unknown,'catalog_ready',x.catalog_ready,'match_row_ready',x.match_row_ready,'source_match_allowed',x.source_match_allowed,'source_match_denied',x.source_match_denied,'source_policy_unknown',x.policy_unknown,'matching_switch_disabled',x.matching_switch_disabled,'matching_switch_unknown',x.matching_switch_unknown,'final_matching',x.final_matching,'seo',x.seo,'seo_row_ready',x.seo_row_ready,'seo_row_not_ready',x.seo_row_not_ready,'seo_row_unknown',x.seo_row_unknown,'seo_effective_ready',x.seo_effective_ready,'seo_content_ready_while_lifecycle_unresolved',x.seo_content_ready_unresolved,'lifecycle_recovery',jsonb_build_object('RECOVERABLE_NOW',x.lifecycle_recoverable_now,'REFRESH_REQUIRED',x.lifecycle_refresh_required,'CONTENT_NOT_READY',x.lifecycle_content_not_ready,'SYSTEM_ERROR',x.lifecycle_system_error),'top_lifecycle_unresolved_reasons',x.top_lifecycle_unresolved_reasons,'seo_permission_unknown_ready_rows',x.seo_permission_unknown_ready_rows,'seo_block_reasons',x.seo_block_reasons,'alerts',x.alerts,'professional_thin',x.professional_thin,'match_row_unknown',x.match_row_unknown)) from universe_summary_per_source x),'[]'::jsonb),
    'unreconciled',greatest(0,(select count(*) from public.opportunities)-(select count(*) from public.opportunity_universe_state)))
$$;

create or replace function public.get_opportunity_universe_row(p_opportunity_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_state public.opportunity_universe_state%rowtype; v_source text; v_cable text; v_found boolean:=false;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service_role_required'; end if;
  select coalesce(source,'UNKNOWN'),true into v_source,v_found from public.opportunities where id::text=p_opportunity_id;
  select * into v_state from public.opportunity_universe_state where opportunity_id=p_opportunity_id;
  if not v_found then return jsonb_build_object('found',false); end if;
  v_cable:=case
    when v_state.lifecycle_state not in ('ACTIVE_VALID','LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'LIFECYCLE: '||v_state.lifecycle_reason
    when v_state.lifecycle_state='ACTIVE_VALID' and v_state.professional_readiness<>'PROFESSIONAL_READY' then 'LIFECYCLE -> DATA_READINESS: '||v_state.professional_reason
    when v_state.lifecycle_state='ACTIVE_VALID' and v_state.matching_row_state<>'READY' then 'DATA_READINESS -> ROW_MATCH_READINESS: '||v_state.matching_row_reason
    when v_state.lifecycle_state='ACTIVE_VALID' and v_state.source_matching_state<>'ALLOWED' then 'ROW_MATCH_READINESS -> SOURCE_PERMISSION: '||v_state.source_matching_reason
    when v_state.lifecycle_state='ACTIVE_VALID' and v_state.source_matching_operational_state<>'ALLOWED' then 'SOURCE_PERMISSION -> SOURCE_MATCHING_CAPABILITY: '||v_state.source_matching_operational_reason
    when v_state.lifecycle_state='ACTIVE_VALID' and v_state.final_matching_state<>'READY' then 'SOURCE_PERMISSION -> FINAL_MATCHING: '||v_state.source_operational_state
    when v_state.lifecycle_state='ACTIVE_VALID' then 'FINAL_MATCHING -> RETRIEVAL: ROW_READY_FOR_RETRIEVAL'
    when v_state.opportunity_id is null then 'SOURCE → OBSERVATION → LIFECYCLE: UNRECONCILED'
    when v_state.provenance->>'observation_id' is null then 'SOURCE → OBSERVATION: NO_LINKED_OBSERVATION'
    when v_state.lifecycle_state<>'ACTIVE_VALID' then 'OBSERVATION → LIFECYCLE: '||v_state.lifecycle_reason
    when v_state.professional_readiness<>'PROFESSIONAL_READY' then 'LIFECYCLE → DATA_READINESS: '||v_state.professional_reason
    when v_state.matching_row_state<>'READY' then 'DATA_READINESS → ROW_MATCH_READINESS: '||v_state.matching_row_reason
    when v_state.source_matching_state<>'ALLOWED' then 'ROW_MATCH_READINESS → SOURCE_PERMISSION: '||v_state.source_matching_reason
    when v_state.source_matching_operational_state<>'ALLOWED' then 'SOURCE_PERMISSION → SOURCE_MATCHING_CAPABILITY: '||v_state.source_matching_operational_reason
    when v_state.final_matching_state<>'READY' then 'SOURCE_PERMISSION → FINAL_MATCHING: '||v_state.source_operational_state
    else 'FINAL_MATCHING → RETRIEVAL: ROW_READY_FOR_RETRIEVAL' end;
  return jsonb_build_object('found',true,'opportunity_id',p_opportunity_id,'source',v_source,'first_broken_cable',v_cable,'observation',jsonb_build_object('linked',v_state.provenance->>'observation_id' is not null,'id',v_state.provenance->>'observation_id','identity_status',v_state.provenance->>'observation_status','http_status',v_state.provenance->>'observation_http_status','observed_at',v_state.provenance->>'observation_at','note',case when v_state.provenance->>'observation_id' is null then 'NO_LINKED_OBSERVATION_INFORMATIONAL_UNLESS_REQUIRED_TO_RESOLVE_LIFECYCLE' else null end),'inventory_state',v_state.inventory_state,'lifecycle_state',v_state.lifecycle_state,'lifecycle_reason',v_state.lifecycle_reason,'professional_readiness',v_state.professional_readiness,'professional_reason',v_state.professional_reason,
    'consumer_diagnostics',jsonb_build_object(
      'CATALOG',jsonb_build_object('row_state',v_state.catalog_row_state,'source_global_state',v_state.source_operational_state,'consumer_switch_state',v_state.provenance->'consumer_switch_states'->>'catalog','permission_state',v_state.provenance->'consumer_permission_states'->>'catalog','effective_state',v_state.catalog_state,'first_unresolved_or_blocking_reason',case when v_state.catalog_row_state<>'READY' then 'CATALOG_ROW_NOT_READY' when v_state.source_operational_state<>'ENABLED' then v_state.source_operational_reason when v_state.provenance->'consumer_switch_states'->>'catalog'<>'ALLOWED' then 'CATALOG_SWITCH_OR_ALIAS_CONFLICT' when v_state.provenance->'consumer_permission_states'->>'catalog'<>'ALLOWED' then 'CATALOG_PERMISSION_NOT_ALLOWED' else null end),
      'MATCHING',jsonb_build_object('row_state',v_state.matching_row_state,'source_global_state',v_state.source_operational_state,'consumer_switch_state',v_state.source_matching_operational_state,'permission_state',v_state.source_matching_state,'effective_state',v_state.final_matching_state,'first_unresolved_or_blocking_reason',case when v_state.matching_row_state<>'READY' then v_state.matching_row_reason when v_state.source_operational_state<>'ENABLED' then v_state.source_operational_reason when v_state.source_matching_operational_state<>'ALLOWED' then v_state.source_matching_operational_reason when v_state.source_matching_state<>'ALLOWED' then v_state.source_matching_reason else null end),
      'ALERTS',jsonb_build_object('row_state',v_state.alerts_row_state,'source_global_state',v_state.source_operational_state,'consumer_switch_state',v_state.provenance->'consumer_switch_states'->>'alerts','permission_state',v_state.provenance->'consumer_permission_states'->>'alerts','effective_state',v_state.alerts_state,'first_unresolved_or_blocking_reason',case when v_state.alerts_row_state<>'READY' then 'ALERT_ROW_NOT_READY' when v_state.source_operational_state<>'ENABLED' then v_state.source_operational_reason when v_state.provenance->'consumer_switch_states'->>'alerts'<>'ALLOWED' then 'ALERTS_SWITCH_OR_ALIAS_CONFLICT' when v_state.provenance->'consumer_permission_states'->>'alerts'<>'ALLOWED' then 'ALERTS_PERMISSION_NOT_ALLOWED' else null end),
      'SEO',jsonb_build_object('row_state',v_state.seo_row_state,'row_reason',v_state.seo_row_reason,'source_global_state',v_state.source_operational_state,'consumer_switch_state',v_state.provenance->'consumer_switch_states'->>'seo','permission_state',v_state.provenance->'consumer_permission_states'->>'seo','effective_state',v_state.seo_state,'first_unresolved_or_blocking_reason',v_state.seo_effective_reason)),
    'catalog_state',v_state.catalog_state,'matching_row_state',v_state.matching_row_state,'matching_row_reason',v_state.matching_row_reason,'source_matching_state',v_state.source_matching_state,'source_matching_reason',v_state.source_matching_reason,'source_matching_operational_state',v_state.source_matching_operational_state,'source_matching_operational_reason',v_state.source_matching_operational_reason,'final_matching_state',v_state.final_matching_state,'seo_state',v_state.seo_state,'alerts_state',v_state.alerts_state,'unresolved_dimensions',v_state.unresolved_dimensions,'source_permission_unknown_dimensions',v_state.source_permission_unknown_dimensions,'provenance',v_state.provenance);
end $$;

create or replace function public.latest_opportunity_universe_observations(p_opportunity_ids text[])
returns table(id uuid, opportunity_id text, identity_status text, http_status integer, observed_at timestamptz)
language sql stable security definer set search_path=public as $$
  select distinct on (o.opportunity_id::text) o.id,o.opportunity_id::text,o.identity_status,o.http_status,o.observed_at
  from public.opportunity_source_observations o where o.opportunity_id::text=any(coalesce(p_opportunity_ids,'{}'::text[]))
  order by o.opportunity_id::text,o.observed_at desc,o.id desc
$$;

revoke all on function public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.opportunity_requirements_text(jsonb) from public,anon,authenticated;
revoke all on function public.canonical_opportunity_source_policy(text) from public,anon,authenticated;
revoke all on function public.refresh_opportunity_universe(text,boolean) from public,anon,authenticated;
revoke all on function public.refresh_due_opportunity_universe(integer) from public,anon,authenticated;
revoke all on function public.opportunity_universe_after_write() from public,anon,authenticated;
revoke all on function public.opportunity_observation_refresh_universe() from public,anon,authenticated;
revoke all on function public.opportunity_source_policy_refresh_universe() from public,anon,authenticated;
revoke all on function public.opportunity_permission_refresh_universe() from public,anon,authenticated;
revoke all on function public.refresh_dirty_opportunity_universe_sources(integer) from public,anon,authenticated;
revoke all on function public.apply_opportunity_source_trust() from public,anon,authenticated;
revoke all on function public.reconcile_opportunity_universe_page(text,integer,boolean) from public,anon,authenticated;
revoke all on function public.get_opportunity_universe_summary() from public,anon,authenticated;
revoke all on function public.get_opportunity_universe_row(text) from public,anon,authenticated;
grant execute on function public.reconcile_opportunity_universe_page(text,integer,boolean) to service_role;
grant execute on function public.refresh_due_opportunity_universe(integer) to service_role;
grant execute on function public.refresh_dirty_opportunity_universe_sources(integer) to service_role;
grant execute on function public.get_opportunity_universe_summary() to service_role;
grant execute on function public.get_opportunity_universe_row(text) to service_role;
revoke all on function public.latest_opportunity_universe_observations(text[]) from public,anon,authenticated;
grant execute on function public.latest_opportunity_universe_observations(text[]) to service_role;


-- Canonical identities and permission decisions. No evidence means UNKNOWN.
insert into public.opportunity_source_identity_aliases(emitted_source,canonical_source) values
('500_latam','500_latam'),
('abc','abc'),
('abc_color','abc'),
('abc_scrapper','abc'),
('aecid_paraguay_calls','aecid_paraguay_calls'),
('agroindustria','agroindustria'),
('agroindustria_py','agroindustria'),
('aptitus','aptitus'),
('aptitus_pe','aptitus'),
('arbeitnow','arbeitnow'),
('automotriz','automotriz'),
('automotriz_py','automotriz'),
('bancos','bancos'),
('becal','becal'),
('becas_gobierno_itaipu','becas_gobierno_itaipu'),
('bolsas_locales','bolsas_locales'),
('bolsas_locales_py','bolsas_locales'),
('bumeran','bumeran'),
('bumeran_pe','bumeran'),
('buscojobs','buscojobs'),
('caf_calls','caf_calls'),
('callcenters','callcenters'),
('cc_atento','callcenters'),
('cde_frontera','cde_frontera'),
('cde_frontera_py','cde_frontera'),
('chevening','chevening'),
('cird_competitions_tenders','cird_competitions_tenders'),
('clasipar','scrapper'),
('coimbra_group','coimbra_group'),
('computrabajo','computrabajo'),
('computrabajo_pe','computrabajo'),
('conacyt_convocatorias','conacyt_convocatorias'),
('constructoras','constructoras'),
('cooperativas','cooperativas'),
('copaco','copaco'),
('daad','daad'),
('developmentaid','developmentaid'),
('devex','devex'),
('eby_yacyreta','eby_yacyreta'),
('empleapy_mtess','empleapy_mtess'),
('energia_utilities','energia_utilities'),
('energia_utilities_py','energia_utilities'),
('erasmus_mundus','erasmus_mundus'),
('eu_delegation_paraguay','eu_delegation_paraguay'),
('eu_lac_accelerator','eu_lac_accelerator'),
('f6s_latam','f6s_latam'),
('farmacias','farmacias'),
('farmacias_py','farmacias'),
('fcq_una_job_board','fcq_una_job_board'),
('fiuna_job_board','fiuna_job_board'),
('foroparaguay','foros'),
('foros','foros'),
('frigorificos','frigorificos'),
('frigorificos_py','frigorificos'),
('fundacion','fundacion'),
('fundacion_carolina','fundacion_carolina'),
('fundacionparaguaya','fundacion'),
('gastronomia_hoteles','gastronomia_hoteles'),
('gastronomia_hoteles_py','gastronomia_hoteles'),
('globaljobs','globaljobs'),
('google_startups_latam','google_startups_latam'),
('googlejobs','googlejobs_v2'),
('googlejobs_v2','googlejobs_v2'),
('googlejobs_v3','googlejobs_v3'),
('grupo_cartes','grupocarteshs'),
('grupo_vierci','grupovierci'),
('grupocarteshs','grupocarteshs'),
('grupovierci','grupovierci'),
('himalayas','himalayas'),
('hireon','hireon'),
('hospitales','hospitales'),
('idb_calls','idb_calls'),
('idealist','idealist'),
('impactpool','impactpool'),
('indeed','indeed'),
('indeed_pe','indeed'),
('industria_manufactura','industria_manufactura'),
('industria_manufactura_py','industria_manufactura'),
('innovandopy_startups','innovandopy_startups'),
('ipa_convocatorias','ipa_convocatorias'),
('itau','itau'),
('jobicy','jobicy'),
('jooble','jooble'),
('jooble_pe','jooble'),
('laborum','laborum'),
('laborum_pe','laborum'),
('logistica_transporte','logistica_transporte'),
('logistica_transporte_py','logistica_transporte'),
('medios_comunicacion','medios_comunicacion'),
('medios_py','medios_comunicacion'),
('mef_inapp_becas','mef_inapp_becas'),
('merienderos','merienderos'),
('mic_portal_emprendedor','mic_portal_emprendedor'),
('ministerios','ministerios'),
('mit_solve','mit_solve'),
('mitic_opportunities','mitic_opportunities'),
('mtess','empleapy_mtess'),
('oas_scholarships','oas_scholarships'),
('ofertaslaborales','ofertaslaborales'),
('one_young_world_scholarships','one_young_world_scholarships'),
('ong_bid_py','ongs'),
('ong_giz_py','ongs'),
('ong_oas_py','ongs'),
('ongs','ongs'),
('opportunitydesk','opportunitydesk'),
('oya','oya'),
('oyaop','oya'),
('personal','personal'),
('pivot_jobs','pivot_jobs'),
('pro_ong_conevio','pro_ong_conevio'),
('puertos_importadoras','puertos_importadoras'),
('puertos_importadoras_py','puertos_importadoras'),
('reddit','reddit'),
('reddit_py','reddit'),
('reddit_py_trabajo','reddit'),
('reemujerpy_mipymes','reemujerpy_mipymes'),
('reliefweb','reliefweb'),
('remotive','remotive'),
('retail_malls','retail_malls'),
('retail_malls_py','retail_malls'),
('santander_open_academy','santander_open_academy'),
('scholarship_corner','scholarship_corner'),
('scrapper','scrapper'),
('seguros','seguros'),
('seguros_unimedica','seguros'),
('sicca','sicca'),
('snj_paraguay','snj_paraguay'),
('startup_chile','startup_chile'),
('supermercados','supermercados'),
('talent','talentcom'),
('talent.com','talentcom'),
('talentcom','talentcom'),
('tech_local','tech_local'),
('telecomunicaciones','telecomunicaciones'),
('telecomunicaciones_py','telecomunicaciones'),
('tigo','tigo'),
('ucom_job_board','ucom_job_board'),
('un-jobs','unjobs'),
('universidades','universidades'),
('unjobs','unjobs'),
('us_embassy_paraguay','us_embassy_paraguay'),
('vc4a_pes_latam','vc4a_pes_latam'),
('we-work-remotely','weworkremotely'),
('weworkremotely','weworkremotely'),
('workday_multinacionales','workday_multinacionales'),
('wwf_paraguay_calls','wwf_paraguay_calls'),
('wwr','weworkremotely'),
('zonajobs_py','foros')
on conflict(emitted_source) do update set canonical_source=excluded.canonical_source;

with
permission_sources(canonical_source) as (values
('unjobs'),
('himalayas'),
('talentcom'),
('weworkremotely'),
('empleapy_mtess'),
('mef_inapp_becas'),
('conacyt_convocatorias'),
('mitic_opportunities'),
('innovandopy_startups'),
('mic_portal_emprendedor'),
('reemujerpy_mipymes'),
('snj_paraguay'),
('ipa_convocatorias'),
('aecid_paraguay_calls'),
('us_embassy_paraguay'),
('eu_delegation_paraguay'),
('becas_gobierno_itaipu'),
('eby_yacyreta'),
('wwf_paraguay_calls'),
('cird_competitions_tenders'),
('pro_ong_conevio'),
('fiuna_job_board'),
('ucom_job_board'),
('fcq_una_job_board'),
('chevening'),
('erasmus_mundus'),
('oas_scholarships'),
('daad'),
('coimbra_group'),
('santander_open_academy'),
('one_young_world_scholarships'),
('500_latam'),
('google_startups_latam'),
('startup_chile'),
('idb_calls'),
('caf_calls'),
('mit_solve'),
('eu_lac_accelerator'),
('f6s_latam'),
('devex'),
('developmentaid'),
('impactpool'),
('globaljobs'),
('vc4a_pes_latam'),
('computrabajo'),
('buscojobs'),
('scrapper'),
('abc'),
('fundacion'),
('remotive'),
('oya'),
('opportunitydesk'),
('becal'),
('fundacion_carolina'),
('arbeitnow'),
('jobicy'),
('sicca'),
('ministerios'),
('bancos'),
('cooperativas'),
('seguros'),
('callcenters'),
('universidades'),
('constructoras'),
('grupovierci'),
('grupocarteshs'),
('hospitales'),
('supermercados'),
('ongs'),
('tech_local'),
('foros'),
('jooble'),
('googlejobs_v2'),
('googlejobs_v3'),
('automotriz'),
('farmacias'),
('gastronomia_hoteles'),
('agroindustria'),
('frigorificos'),
('industria_manufactura'),
('telecomunicaciones'),
('medios_comunicacion'),
('retail_malls'),
('logistica_transporte'),
('energia_utilities'),
('puertos_importadoras'),
('cde_frontera'),
('workday_multinacionales'),
('bolsas_locales'),
('aptitus'),
('bumeran'),
('indeed'),
('laborum'),
('reddit'),
('copaco'),
('hireon'),
('idealist'),
('itau'),
('merienderos'),
('ofertaslaborales'),
('personal'),
('pivot_jobs'),
('reliefweb'),
('scholarship_corner'),
('tigo')
),
permission_dimensions(dimension) as (values
('collect'),
('detail_fetch'),
('catalog'),
('matching'),
('alerts'),
('seo_index'),
('google_jobs'),
('third_party_distribution'),
('application_routing'),
('attribution_requirement')
),
permission_overrides(canonical_source,dimension,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes) as (values
('himalayas','collect','ALLOWED','PUBLIC_API_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Free public API requires no key/authentication and expressly supports job search products, dashboards, AI agents, and automation.'),
('himalayas','detail_fetch','ALLOWED','PUBLIC_API_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','The official API provides job detail fields, including full descriptions and application links; use the API payload and preserve source identity.'),
('himalayas','catalog','ALLOWED','FIRST_PARTY_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Official documentation allows listings to power job-search products and dashboards; Himalayas must remain the original source with linkback.'),
('himalayas','matching','ALLOWED','JOB_SEARCH_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Official documentation expressly permits job-search products, dashboards, AI agents, and automation; third-party republication remains separately prohibited.'),
('himalayas','alerts','ALLOWED','JOB_SEARCH_PRODUCT_USE','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Alerts are first-party job-search product use; preserve visible Himalayas attribution and the original listing link.'),
('himalayas','seo_index','ALLOWED','FIRST_PARTY_ORGANIC_INDEXING','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','First-party CVitae organic indexing is within permitted job-search product use; this does not permit Google Jobs or other third-party submission.'),
('himalayas','google_jobs','DENIED','THIRD_PARTY_JOB_AGGREGATOR_PROHIBITED','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Official documentation prohibits submitting Himalayas listings to third-party sites, explicitly including Google Jobs.'),
('himalayas','third_party_distribution','DENIED','THIRD_PARTY_JOB_AGGREGATOR_PROHIBITED','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Official documentation prohibits submission to third-party sites including Jooble, Neuvoo, Google Jobs, and LinkedIn Jobs.'),
('himalayas','application_routing','ALLOWED','PRESERVE_ORIGINAL_HIMALAYAS_LINK','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Keep and expose the original Himalayas listing/application link as the source destination.'),
('himalayas','attribution_requirement','ALLOWED','ATTRIBUTION_AND_LINKBACK_REQUIRED','https://himalayas.app/api','OFFICIAL_API_DOCUMENTATION','https://himalayas.app/api',DATE '2026-10-01','Visible Himalayas attribution and linkback to the original listing are mandatory conditions.'),
('weworkremotely','collect','DENIED','JOB_SEARCH_SERVICE_USE_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms expressly prohibit using API or any WWR data to build a job advertising or job search service; no separate official RSS grant for CVitae use was evidenced.'),
('weworkremotely','detail_fetch','DENIED','DETAIL_HTML_NOT_COVERED_BY_RSS_PERMISSION','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Feed permission does not authorize detail-page scraping/storage; obtain written permission before use.'),
('weworkremotely','catalog','DENIED','JOB_SEARCH_SERVICE_USE_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms prohibit using API or WWR data to build a job advertising or job search service.'),
('weworkremotely','matching','DENIED','JOB_SEARCH_SERVICE_USE_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Candidate-facing opportunity matching is part of a job search service; exact CVitae use requires publisher confirmation.'),
('weworkremotely','alerts','DENIED','JOB_SEARCH_SERVICE_USE_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Job alert distribution from WWR data would serve the prohibited job search service.'),
('weworkremotely','seo_index','DENIED','JOB_SEARCH_DESTINATION_REPLICATION_PROHIBITED','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms prohibit using the data for a destination/search service for WWR job content.'),
('weworkremotely','application_routing','ALLOWED','APPLICATION_MUST_ROUTE_TO_WWR','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms require application to route through weworkremotely.com; this is a routing condition, not reuse permission.'),
('weworkremotely','attribution_requirement','ALLOWED','APPLICATION_ROUTING_CONDITION','https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS','https://weworkremotely.com/api-terms-and-guidelines',DATE '2026-09-29','Terms specify the source interface must not be bypassed for applications; no broader distribution permission inferred.'),
('impactpool','collect','UNKNOWN','ACQUISITION_METHOD_PERMISSION_UNRESOLVED','https://www.impactpool.org/signup/terms; docs/source-permission-matrix.md#Impactpool','OFFICIAL_TERMS_AND_REPOSITORY_SOURCE_PROFILE','https://www.impactpool.org/signup/terms; docs/source-permission-matrix.md#Impactpool',DATE '2026-09-29','Terms prohibit unauthorized scraping/extraction, but repository describes API/listing acquisition and does not establish whether the current method is covered by a license.'),
('impactpool','detail_fetch','UNKNOWN','DETAIL_FETCH_PERMISSION_NOT_EVIDENCED','docs/source-permission-matrix.md#Impactpool','REPOSITORY_SOURCE_PROFILE','docs/source-permission-matrix.md#Impactpool',DATE '2026-09-29','No affirmative detail-fetch method/license is documented.'),
('impactpool','catalog','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Reproduction/distribution requires permission.'),
('impactpool','matching','UNKNOWN','MATCHING_USE_NOT_EVIDENCED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Terms restrict scraping and public reproduction; they do not expressly resolve internal matching use for the observed acquisition method.'),
('impactpool','alerts','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Use of extracted platform content for alerts is not licensed by repo evidence.'),
('impactpool','seo_index','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Public redistribution/indexing is not licensed by repo evidence.'),
('impactpool','google_jobs','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Third-party distribution is not licensed by repo evidence.'),
('impactpool','third_party_distribution','DENIED','REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED','https://www.impactpool.org/signup/terms','OFFICIAL_TERMS','https://www.impactpool.org/signup/terms',DATE '2026-09-29','Third-party distribution is not licensed by repo evidence.'),
('computrabajo','collect','DENIED','AUTOMATED_ACCESS_PROHIBITED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The official Paraguay notice prohibits access or reading through robots/automated programs and expressly prohibits Robot/Crawler copying.'),
('computrabajo','detail_fetch','DENIED','AUTOMATED_ACCESS_PROHIBITED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The official Paraguay notice prohibits software/scripts and automated reading/copying of site content.'),
('computrabajo','catalog','DENIED','CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','Reproduction and distribution of site content requires authorization; automated copying is expressly prohibited.'),
('computrabajo','matching','UNKNOWN','MATCHING_PERMISSION_NOT_EXPLICITLY_ADDRESSED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE_REVIEW','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The reviewed terms do not establish permission for internal or candidate-facing matching; no authorization is inferred.'),
('computrabajo','alerts','DENIED','CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','Alerts reproduce/distribute site content; the official notice requires authorization and prohibits automated copying.'),
('computrabajo','seo_index','DENIED','CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','Indexing copied listing content would reproduce/distribute content without the authorization required by the official notice.'),
('computrabajo','google_jobs','DENIED','THIRD_PARTY_DISTRIBUTION_NOT_AUTHORIZED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','Third-party listing distribution requires authorization; no Google Jobs authorization is evidenced.'),
('computrabajo','third_party_distribution','DENIED','CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The official notice requires authorization for reproduction/distribution of content.'),
('computrabajo','application_routing','UNKNOWN','APPLICATION_ROUTING_NOT_EVIDENCED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE_REVIEW','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','The reviewed notice does not establish a CVitae application-routing permission or condition.'),
('computrabajo','attribution_requirement','UNKNOWN','ATTRIBUTION_REQUIREMENT_NOT_EVIDENCED','https://py.computrabajo.com/avisolegal/','OFFICIAL_LEGAL_NOTICE_REVIEW','https://py.computrabajo.com/avisolegal/',DATE '2026-10-01','No attribution or linkback requirement was established by the reviewed notice; permission is not inferred.'),
('remotive','collect','ALLOWED','PUBLIC_API_USE_DOCUMENTED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Public API use is permitted subject to attribution, linkback, and the terms.'),
('remotive','detail_fetch','NOT_APPLICABLE','API_RECORD_HAS_NO_SEPARATE_DETAIL_FETCH','https://remotive.com/remote-jobs/api','OFFICIAL_API_CONTRACT','https://remotive.com/remote-jobs/api',DATE '2026-09-29','The consumed API record is the detail payload; no separate detail fetch is used.'),
('remotive','catalog','ALLOWED','ATTRIBUTION_AND_LINKBACK_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Permitted only with source attribution and linkback; not gated for signups.'),
('remotive','matching','ALLOWED','ATTRIBUTION_AND_LINKBACK_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Permitted only with source attribution and linkback.'),
('remotive','alerts','ALLOWED','ATTRIBUTION_AND_LINKBACK_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Permitted only with source attribution and linkback.'),
('remotive','google_jobs','DENIED','THIRD_PARTY_JOB_PLATFORM_RESTRICTED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Terms prohibit submission to third-party job platforms including Google Jobs.'),
('remotive','third_party_distribution','DENIED','THIRD_PARTY_JOB_PLATFORM_RESTRICTED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Terms prohibit redistribution to third-party job platforms.'),
('remotive','application_routing','ALLOWED','SOURCE_APPLICATION_LINK_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Route to the source application URL; preserve the source link.'),
('remotive','attribution_requirement','ALLOWED','ATTRIBUTION_REQUIRED','https://remotive.com/remote-jobs/api','OFFICIAL_API_TERMS','https://remotive.com/remote-jobs/api',DATE '2026-09-29','Attribution and linkback are mandatory conditions.'),
('fundacion_carolina','collect','DENIED','EXTRACTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Extraction/reuse is reserved absent legal basis or written authorization.'),
('fundacion_carolina','detail_fetch','DENIED','EXTRACTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','No detail extraction permission is evidenced.'),
('fundacion_carolina','catalog','DENIED','REPRODUCTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Reproduction/distribution requires authorization.'),
('fundacion_carolina','matching','DENIED','REPRODUCTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Use of extracted content is not authorized by repository evidence.'),
('fundacion_carolina','alerts','DENIED','REPRODUCTION_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Use of extracted content is not authorized by repository evidence.'),
('fundacion_carolina','seo_index','DENIED','REUSE_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Public reuse/indexing is not authorized absent permission.'),
('fundacion_carolina','google_jobs','DENIED','REUSE_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Third-party distribution is not authorized absent permission.'),
('fundacion_carolina','third_party_distribution','DENIED','REUSE_WITHOUT_AUTHORIZATION_PROHIBITED','https://www.fundacioncarolina.es/aviso-legal/','OFFICIAL_LEGAL_NOTICE','https://www.fundacioncarolina.es/aviso-legal/',DATE '2026-09-29','Third-party distribution is not authorized absent permission.'),
('arbeitnow','collect','ALLOWED','API_USE_WITH_LINKBACK','https://www.arbeitnow.com/terms','OFFICIAL_TERMS','https://www.arbeitnow.com/terms',DATE '2026-09-29','Official terms permit API data use with required linkback; this is limited to the documented API.'),
('arbeitnow','attribution_requirement','ALLOWED','LINKBACK_REQUIRED','https://www.arbeitnow.com/terms','OFFICIAL_TERMS','https://www.arbeitnow.com/terms',DATE '2026-09-29','Linkback is a required condition for API use.'),
('jobicy','collect','ALLOWED','PUBLIC_API_PRODUCT_USE_DOCUMENTED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Official API documentation (updated 2026-09-16) permits normal API integrations in own products without individual approval; polling must not exceed once per hour.'),
('jobicy','detail_fetch','NOT_APPLICABLE','API_RECORD_HAS_NO_SEPARATE_DETAIL_FETCH','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_CONTRACT','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Current local acquisition uses API records; official guidance says preserve canonical Jobicy URL and attribution.'),
('jobicy','catalog','ALLOWED','OWN_PRODUCT_LISTING_USE_DOCUMENTED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Documentation expressly covers job boards and user-facing products; preserve Jobicy as original source and canonical URL.'),
('jobicy','matching','ALLOWED','OWN_PRODUCT_LISTING_USE_DOCUMENTED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Career tools and AI assistants are named normal integrations; preserve attribution and source URL.'),
('jobicy','alerts','ALLOWED','OWN_PRODUCT_LISTING_USE_DOCUMENTED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Newsletters are expressly named; alert emails must preserve source attribution and canonical listing URL.'),
('jobicy','application_routing','ALLOWED','CANONICAL_SOURCE_URL_REQUIRED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Preserve and route through the canonical Jobicy job URL; direct ATS URLs require the documented access mode.'),
('jobicy','attribution_requirement','ALLOWED','SOURCE_ATTRIBUTION_REQUIRED','https://jobicy.com/jobs-rss-feed','OFFICIAL_API_DOCUMENTATION','https://jobicy.com/jobs-rss-feed',DATE '2026-09-29','Listings must not be presented as original CVitae postings; retain attribution and canonical Jobicy URL.')
),
permission_evidence as (
  select s.canonical_source,d.dimension,coalesce(o.permission_state,'UNKNOWN') permission_state,
    coalesce(o.reason,'SOURCE_PERMISSION_NOT_EVIDENCED') reason,
    coalesce(o.provenance,'docs/source-permission-matrix.md; no affirmative permission evidence identified') provenance,
    coalesce(o.evidence_type,'REPOSITORY_REVIEW') evidence_type,
    coalesce(o.evidence_reference,'docs/source-permission-matrix.md') evidence_reference,
    coalesce(o.verified_at,DATE '2026-09-29') verified_at,
    coalesce(o.notes,'No evidence for '||d.dimension||' on '||s.canonical_source||'; UNKNOWN is not DENIED and is not permission.') notes
  from permission_sources s cross join permission_dimensions d
  left join permission_overrides o using(canonical_source,dimension)
)
insert into public.opportunity_source_consumer_permissions(canonical_source,consumer,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes)
select canonical_source,dimension,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes from permission_evidence
on conflict(canonical_source,consumer) do update set permission_state=excluded.permission_state,reason=excluded.reason,provenance=excluded.provenance,evidence_type=excluded.evidence_type,evidence_reference=excluded.evidence_reference,verified_at=excluded.verified_at,notes=excluded.notes,updated_at=now();

-- Canonical permission evidence is independent from operational switches. Seed only evidence; never project UNKNOWN into switch columns.

