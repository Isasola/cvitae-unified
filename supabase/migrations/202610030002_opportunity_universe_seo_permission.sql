-- Corrective source-routing projection: explicit organic denial wins; UNKNOWN alone does not.
-- Queue source-level refreshes for the existing bounded Universe owner; do not execute historical recovery here.
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
  v_temp_legacy_seo_exception_state := case when v_canonical <> 'computrabajo' then 'NOT_APPLICABLE' when (now() at time zone 'UTC')::date <= date '2026-10-09' then 'ACTIVE' else 'EXPIRED' end;
  v_temp_legacy_seo_exception_applied := v_canonical='computrabajo'
    and v_temp_legacy_seo_exception_state='ACTIVE'
    and v_seo_row='READY'
    and p_row->>'seo_eligible'='true'
    and p_row->>'seo_status'='eligible'
    and p_row->>'created_at' ~ '^\d{4}-\d{2}-\d{2}([T ].*)?$'
    and left(p_row->>'created_at',10)<='2026-10-03'
    and v_seo_permission='DENIED'
    and v_source_enabled='true'
    and p_source_policy->>'seo_enabled'='true'
    and not coalesce((p_source_policy->>'seo_enabled_alias_conflict')::boolean,false);
  v_seo := case when v_seo_row <> 'READY' then v_seo_row
    when v_temp_legacy_seo_exception_applied then 'READY'
    when v_seo_permission='DENIED' then 'NOT_READY'
    when p_source_policy->>'seo_enabled'='false' and not coalesce((p_source_policy->>'seo_enabled_alias_conflict')::boolean,false) then 'NOT_READY'
    when v_source_enabled='UNKNOWN' then 'UNKNOWN'
    when v_source_enabled='false' then 'NOT_READY' else 'READY' end;
  v_seo_effective_reason := case when v_seo_row<>'READY' then v_seo_row_reason
    when v_temp_legacy_seo_exception_applied then 'TEMP_LEGACY_SEO_EXCEPTION_APPLIED'
    when v_seo_permission='DENIED' then 'SOURCE_SEO_PERMISSION_DENIED'
    when p_source_policy->>'seo_enabled'='false' and not coalesce((p_source_policy->>'seo_enabled_alias_conflict')::boolean,false) then 'SOURCE_SEO_OPERATOR_DISABLED'
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

insert into public.opportunity_universe_dirty_sources(canonical_source, reason)
select distinct canonical_source, 'SOURCE_PERMISSION_ROUTING_CONTRACT_REFRESH'
from public.opportunity_source_identity_aliases
where nullif(trim(canonical_source), '') is not null
on conflict (canonical_source) do update
set queued_at = least(public.opportunity_universe_dirty_sources.queued_at, excluded.queued_at),
    reason = excluded.reason;
