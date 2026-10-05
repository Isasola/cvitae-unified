-- LOCAL ONLY. Reuse policy audit, canonical policy and Universe. No inventory update on apply.
-- Stored switches remain available for rollback; effective defaults follow explicit permission.
create index if not exists admin_policy_events_source_lookup_idx
  on public.admin_policy_events(entity_type,entity_key,created_at desc,id desc);
create index if not exists opportunities_universe_source_cursor_idx on public.opportunities (lower(source),(id::text));
create index if not exists opportunities_catalog_order_idx on public.opportunities(updated_at desc,id);

create or replace function public.stored_opportunity_source_policy(p_raw_source text)
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

create or replace function public.canonical_opportunity_source_policy(p_raw_source text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_policy jsonb; v_source text; v_consumer text; v_field text; v_override jsonb; v_overrides jsonb:='{}'::jsonb; v_stored jsonb;
begin
  v_policy:=public.stored_opportunity_source_policy(p_raw_source);
  v_source:=v_policy->>'canonical_source';
  v_stored:=jsonb_build_object('catalog',v_policy->'catalog_enabled','matching',v_policy->'matching_enabled','alerts',v_policy->'alerts_enabled');
  foreach v_consumer in array array['catalog','matching','alerts'] loop
    v_field:=v_consumer||'_enabled';
    select case when e.after_state->'explicit_consumer_switches' ? v_consumer
           then e.after_state->'explicit_consumer_switches'->v_consumer else e.after_state->v_field end
      into v_override from public.admin_policy_events e
      where e.entity_type='source'
        and (lower(e.entity_key)=v_source or lower(e.entity_key) in
          (select emitted_source from public.opportunity_source_identity_aliases where canonical_source=v_source))
        and (e.after_state->'explicit_consumer_switches' ? v_consumer
          or (e.after_state ? v_field and e.before_state->v_field is distinct from e.after_state->v_field))
      order by e.created_at desc,e.id desc limit 1;
    if found then
      v_policy:=jsonb_set(v_policy,array[v_field],coalesce(v_override,'null'::jsonb));
      v_overrides:=jsonb_set(v_overrides,array[v_consumer],coalesce(v_override,'null'::jsonb));
      v_policy:=jsonb_set(v_policy,array[v_field||'_alias_conflict'],'false'::jsonb);
    elsif v_policy->>'is_enabled'='true' and exists(select 1 from public.opportunity_source_consumer_permissions
      where canonical_source=v_source and consumer=v_consumer and permission_state='ALLOWED') then
      v_policy:=jsonb_set(v_policy,array[v_field],'true'::jsonb);
      v_policy:=jsonb_set(v_policy,array[v_field||'_alias_conflict'],'false'::jsonb);
    end if;
  end loop;
  return v_policy||jsonb_build_object('consumer_permission_states',(select jsonb_object_agg(consumer,permission_state) from public.opportunity_source_consumer_permissions where canonical_source=v_source), 'consumer_switch_overrides',v_overrides,'stored_consumer_switches',v_stored,
    'switch_authority','CANONICAL_PERMISSION_WITH_ADMIN_POLICY_EVENTS');
end $$;
revoke all on function public.stored_opportunity_source_policy(text) from public,anon,authenticated;
grant execute on function public.stored_opportunity_source_policy(text) to service_role;
-- Canonical views are security_invoker: their actual runtime role must be able
-- to invoke the policy function. Public clients use the minimal definer RPC.
revoke all on function public.canonical_opportunity_source_policy(text) from public,anon,authenticated;
grant execute on function public.canonical_opportunity_source_policy(text) to service_role;

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
  values('source',p_source,to_jsonb(v_current),to_jsonb(v_after)||jsonb_build_object('explicit_consumer_switches',(select coalesce(jsonb_object_agg(replace(key,'_enabled',''),value),'{}'::jsonb) from jsonb_each(p_changes) where key in ('catalog_enabled','matching_enabled','alerts_enabled'))),v_impacted,left(coalesce(nullif(p_actor,''),'admin'),120));
  return jsonb_build_object('ok',true,'impacted_rows',v_impacted,'updated_at',v_after.updated_at);
end $$;

-- Local-only: minimal public/build policy projection.  It intentionally omits
-- maintenance, reviewers, notes and any mutation capability.
drop function public.get_source_distribution_policy();
create function public.get_source_distribution_policy()
returns table (
  source text,
  is_enabled boolean,
  catalog_enabled boolean,
  matching_enabled boolean,
  alerts_enabled boolean,
  seo_enabled boolean,
  registry_certified boolean,
  registry_adapter_version text,
  registry_policy_hash text,
  registry_synced_at timestamptz,
  web_catalog_allowed boolean,
  search_engine_indexing_allowed boolean,
  google_jobs_distribution_allowed boolean,
  third_party_job_distribution_allowed boolean,
  source_attribution_required boolean,
  consumer_switch_overrides jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    os.source, os.is_enabled, (p.policy->>'catalog_enabled')::boolean, (p.policy->>'matching_enabled')::boolean,
    (p.policy->>'alerts_enabled')::boolean, os.seo_enabled, os.registry_certified,
    os.registry_adapter_version, os.registry_policy_hash, os.registry_synced_at,
    os.web_catalog_allowed, os.search_engine_indexing_allowed,
    os.google_jobs_distribution_allowed, os.third_party_job_distribution_allowed,
    os.source_attribution_required, p.policy->'consumer_switch_overrides'
  from public.opportunity_sources os cross join lateral (select public.canonical_opportunity_source_policy(os.source) policy) p
$$;

revoke all on function public.get_source_distribution_policy() from public;
grant execute on function public.get_source_distribution_policy() to anon, authenticated;

grant execute on function public.get_source_distribution_policy() to service_role;
alter table public.opportunity_universe_dirty_sources add column if not exists cursor_id text;
create or replace function public.opportunity_source_policy_refresh_universe() returns trigger language plpgsql security definer set search_path=public as $$
declare v_canonical text;
begin
  select canonical_source into v_canonical from public.opportunity_source_identity_aliases where emitted_source=lower(new.source);
  v_canonical:=coalesce(v_canonical,lower(new.source));
  insert into public.opportunity_universe_dirty_sources(canonical_source,reason,cursor_id)
    values(v_canonical,'SOURCE_OPERATIONAL_POLICY_CHANGED',null)
    on conflict(canonical_source) do update set queued_at=now(),reason=excluded.reason,cursor_id=null;
  return new;
end $$;
create or replace function public.refresh_dirty_opportunity_universe_sources(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_dirty record; v_id text; v_cursor text; v_rows integer:=0; v_page integer; v_sources integer:=0; v_pending integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  if p_limit<1 or p_limit>100 then raise exception 'source_page_size_out_of_range'; end if;
  for v_dirty in select * from public.opportunity_universe_dirty_sources order by queued_at,canonical_source
    limit p_limit for update skip locked loop
    v_page:=0; v_cursor:=v_dirty.cursor_id;
    for v_id in select o.id::text from public.opportunities o
      where (lower(o.source)=v_dirty.canonical_source or lower(o.source) in
        (select emitted_source from public.opportunity_source_identity_aliases where canonical_source=v_dirty.canonical_source))
      and (v_dirty.cursor_id is null or o.id::text>v_dirty.cursor_id)
      order by o.id::text limit 250 loop
      perform public.refresh_opportunity_universe(v_id,false);
      v_cursor:=v_id; v_page:=v_page+1;
    end loop;
    v_rows:=v_rows+v_page;
    if v_page<250 then
      delete from public.opportunity_universe_dirty_sources where canonical_source=v_dirty.canonical_source;
      v_sources:=v_sources+1;
    else
      update public.opportunity_universe_dirty_sources set cursor_id=v_cursor,queued_at=clock_timestamp()
        where canonical_source=v_dirty.canonical_source;
    end if;
  end loop;
  select count(*) into v_pending from public.opportunity_universe_dirty_sources;
  return jsonb_build_object('sources_refreshed',v_sources,'opportunities_refreshed',v_rows,'pending_sources',v_pending,'page_size',250);
end $$;
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
      on conflict(canonical_source) do update set queued_at=now(),reason=excluded.reason,cursor_id=null;
    end if;
  end if;
  return new;
end $$;

create or replace view public.opportunity_final_matching_universe with (security_invoker=true) as
with effective_policies as materialized (select distinct public.canonical_opportunity_source_policy(s.source) policy from public.opportunity_sources s)
select o.*, u.lifecycle_state as universe_lifecycle_state, u.matching_row_state as universe_matching_row_state,
       u.source_matching_state as universe_source_matching_state, u.final_matching_state as universe_final_matching_state, u.alerts_state as universe_alerts_state
from public.opportunities o left join public.opportunity_source_identity_aliases a on a.emitted_source=lower(trim(o.source)) join effective_policies p on p.policy->>'canonical_source'=coalesce(a.canonical_source,lower(trim(o.source))) join public.opportunity_universe_state u on u.opportunity_id=o.id::text
where u.final_matching_state='READY' and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN') and p.policy->>'is_enabled'='true' and p.policy->>'matching_enabled'='true' and p.policy->'consumer_permission_states'->>'matching'='ALLOWED';

create or replace view public.opportunity_catalog_universe with (security_invoker=true) as
with effective_policies as materialized (select distinct public.canonical_opportunity_source_policy(s.source) policy from public.opportunity_sources s)
select o.*,u.lifecycle_state as universe_lifecycle_state,u.catalog_state as universe_catalog_state
from public.opportunities o left join public.opportunity_source_identity_aliases a on a.emitted_source=lower(trim(o.source)) join effective_policies p on p.policy->>'canonical_source'=coalesce(a.canonical_source,lower(trim(o.source))) join public.opportunity_universe_state u on u.opportunity_id=o.id::text where u.catalog_state='READY' and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN') and p.policy->>'is_enabled'='true' and p.policy->>'catalog_enabled'='true' and p.policy->'consumer_permission_states'->>'catalog'='ALLOWED';

create or replace view public.opportunity_alert_universe with (security_invoker=true) as
with effective_policies as materialized (select distinct public.canonical_opportunity_source_policy(s.source) policy from public.opportunity_sources s)
select o.*,u.lifecycle_state as universe_lifecycle_state,u.alerts_state as universe_alerts_state
  ,u.final_matching_state as universe_final_matching_state
from public.opportunities o left join public.opportunity_source_identity_aliases a on a.emitted_source=lower(trim(o.source)) join effective_policies p on p.policy->>'canonical_source'=coalesce(a.canonical_source,lower(trim(o.source))) join public.opportunity_universe_state u on u.opportunity_id=o.id::text where u.alerts_state='READY' and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN') and p.policy->>'is_enabled'='true' and p.policy->>'alerts_enabled'='true' and p.policy->'consumer_permission_states'->>'alerts'='ALLOWED';


-- Same reducer, with explicit policy/audit provenance for Admin.
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
    'provenance',jsonb_build_object('source',v_canonical,'observation_id',p_observation->>'id','observation_status',p_observation->>'identity_status','observation_http_status',p_observation->>'http_status','observation_at',p_observation->>'observed_at','source_policy_rows',p_source_policy->'policy_rows','consumer_switch_overrides',p_source_policy->'consumer_switch_overrides','stored_consumer_switches',p_source_policy->'stored_consumer_switches','switch_authority',p_source_policy->'switch_authority','source_policy_alias_conflicts',jsonb_build_array(case when coalesce((p_source_policy->>'is_enabled_alias_conflict')::boolean,false) then 'is_enabled' end,case when coalesce((p_source_policy->>'matching_enabled_alias_conflict')::boolean,false) then 'matching_enabled' end,case when coalesce((p_source_policy->>'catalog_enabled_alias_conflict')::boolean,false) then 'catalog_enabled' end,case when coalesce((p_source_policy->>'alerts_enabled_alias_conflict')::boolean,false) then 'alerts_enabled' end,case when coalesce((p_source_policy->>'seo_enabled_alias_conflict')::boolean,false) then 'seo_enabled' end),'consumer_permission_states',jsonb_build_object('catalog',v_catalog_permission,'matching',v_permission,'alerts',v_alert_permission,'seo',v_seo_permission),'consumer_switch_states',jsonb_build_object('catalog',case when p_source_policy->>'catalog_enabled'='true' and not coalesce((p_source_policy->>'catalog_enabled_alias_conflict')::boolean,false) then 'ALLOWED' when p_source_policy->>'catalog_enabled'='false' and not coalesce((p_source_policy->>'catalog_enabled_alias_conflict')::boolean,false) then 'DENIED' else 'UNKNOWN' end,'matching',case when v_matching_enabled='true' then 'ALLOWED' when v_matching_enabled='false' then 'DENIED' else 'UNKNOWN' end,'alerts',case when p_source_policy->>'alerts_enabled'='true' and not coalesce((p_source_policy->>'alerts_enabled_alias_conflict')::boolean,false) then 'ALLOWED' when p_source_policy->>'alerts_enabled'='false' and not coalesce((p_source_policy->>'alerts_enabled_alias_conflict')::boolean,false) then 'DENIED' else 'UNKNOWN' end,'seo',case when p_source_policy->>'seo_enabled'='true' and not coalesce((p_source_policy->>'seo_enabled_alias_conflict')::boolean,false) then 'ALLOWED' when p_source_policy->>'seo_enabled'='false' and not coalesce((p_source_policy->>'seo_enabled_alias_conflict')::boolean,false) then 'DENIED' else 'UNKNOWN' end),'temporary_legacy_seo_exception',case when v_canonical='computrabajo' then jsonb_build_object('name','TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09','state',v_temp_legacy_seo_exception_state,'expires_on','2026-10-09','applied',v_temp_legacy_seo_exception_applied,'permission_state',v_seo_permission,'reason','Preserve qualifying SEO-ready first-party rows during the live observation window; no permission or other consumer is granted.') else null end,'permission_source',v_permission_provenance,'seo_content_readiness_independent_of_lifecycle',case when v_seo_content_reason='SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' then 'READY' else 'NOT_READY' end,'seo_content_reason',v_seo_content_reason,'lifecycle_unresolved_reason',v_lifecycle_unresolved_reason,'lifecycle_recovery_class',v_lifecycle_recovery_class)
  );
end $$;

-- Temporal permission expiry and explicit source kills fail closed immediately.
create or replace view public.opportunity_seo_universe with (security_invoker=true) as
with effective_policies as materialized (select distinct public.canonical_opportunity_source_policy(s.source) policy from public.opportunity_sources s)
select o.*,u.lifecycle_state as universe_lifecycle_state,u.seo_state as universe_seo_state
from public.opportunities o left join public.opportunity_source_identity_aliases a on a.emitted_source=lower(trim(o.source)) join effective_policies p on p.policy->>'canonical_source'=coalesce(a.canonical_source,lower(trim(o.source))) join public.opportunity_universe_state u on u.opportunity_id=o.id::text where u.seo_state='READY' and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN') and p.policy->>'is_enabled'='true' and p.policy->>'seo_enabled' is distinct from 'false'
 and (coalesce(p.policy->'consumer_permission_states'->>'seo_index','UNKNOWN')<>'DENIED' or
 (p.policy->>'canonical_source'='computrabajo' and u.provenance->'temporary_legacy_seo_exception'->>'applied'='true'
 and (now() at time zone 'UTC')::date<=date '2026-10-09'));

-- Scheduling metadata only. Lifecycle truth remains opportunity_universe_decision.
alter table public.opportunity_universe_state add column if not exists next_lifecycle_check_at timestamptz;
create index if not exists opportunity_universe_next_lifecycle_check_idx
  on public.opportunity_universe_state(next_lifecycle_check_at,opportunity_id)
  where next_lifecycle_check_at is not null;
create or replace function public.opportunity_universe_schedule_deadline() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_deadline text; v_date date;
begin
  new.next_lifecycle_check_at:=null;
  if new.lifecycle_state<>'ACTIVE_VALID' then return new; end if;
  select deadline into v_deadline from public.opportunities where id=new.opportunity_id;
  v_deadline:=trim(coalesce(v_deadline,''));
  if public.opportunity_deadline_state(v_deadline)<>'OPEN' then return new; end if;
  begin
    if v_deadline ~ '^\d{4}-\d{2}-\d{2}$' then
      v_date:=v_deadline::date;
      new.next_lifecycle_check_at:=(v_date+1)::timestamp at time zone 'UTC';
    elsif v_deadline ~ '(Z|[+-]\d\d:\d\d)$' then
      new.next_lifecycle_check_at:=v_deadline::timestamptz;
    end if;
  exception when others then new.next_lifecycle_check_at:=null; end;
  return new;
end $$;
drop trigger if exists opportunity_universe_schedule_deadline on public.opportunity_universe_state;
create trigger opportunity_universe_schedule_deadline before insert or update on public.opportunity_universe_state
  for each row execute function public.opportunity_universe_schedule_deadline();
revoke all on function public.opportunity_universe_schedule_deadline() from public,anon,authenticated;

create or replace function public.refresh_due_opportunity_universe(p_limit integer default 500)
returns integer language plpgsql security definer set search_path=public as $$
declare v_id text; v_count integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  if p_limit<1 or p_limit>500 then raise exception 'page_size_out_of_range'; end if;
  -- Only enqueue the temporal SEO expiry here. The common owner's separate
  -- dirty-source loop drains it within its explicit source/page budget.
  if (now() at time zone 'UTC')::date>date '2026-10-09' and exists (
    select 1 from public.opportunities o join public.opportunity_universe_state u on u.opportunity_id=o.id::text
    where lower(o.source)='computrabajo' and u.seo_state='READY'
      and u.provenance->'temporary_legacy_seo_exception'->>'applied'='true') then
    insert into public.opportunity_universe_dirty_sources(canonical_source,reason)
      values('computrabajo','TEMP_LEGACY_SEO_EXCEPTION_EXPIRED') on conflict(canonical_source) do nothing;
  end if;
  for v_id in select u.opportunity_id from public.opportunity_universe_state u
    where u.next_lifecycle_check_at<=now()
    order by u.next_lifecycle_check_at,u.opportunity_id limit p_limit loop
      perform public.refresh_opportunity_universe(v_id); v_count:=v_count+1;
  end loop;
  return v_count;
end $$;


-- Exact-row Admin explanation of current gate and pending persisted reconciliation.
create or replace function public.get_opportunity_universe_row(p_opportunity_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_state public.opportunity_universe_state%rowtype; v_source text; v_cable text; v_found boolean:=false; v_row jsonb; v_obs jsonb; v_live jsonb; v_cached jsonb; v_result jsonb; v_key text; v_consumer text; v_pending boolean:=false;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service_role_required'; end if;
  select coalesce(source,'UNKNOWN'),true into v_source,v_found from public.opportunities where id::text=p_opportunity_id;
  select * into v_state from public.opportunity_universe_state where opportunity_id=p_opportunity_id;
  if not v_found then return jsonb_build_object('found',false); end if;
  if v_state.opportunity_id is not null then
    v_cached:=to_jsonb(v_state);
    select to_jsonb(o) into v_row from public.opportunities o where o.id=p_opportunity_id;
    select to_jsonb(obs) into v_obs from public.opportunity_source_observations obs
      where obs.opportunity_id=p_opportunity_id order by obs.observed_at desc,obs.id desc limit 1;
    v_live:=public.opportunity_universe_decision(v_row,v_obs,public.canonical_opportunity_source_policy(v_source),v_cached);
    foreach v_key in array array['catalog_state','final_matching_state','alerts_state','seo_state'] loop
      if v_cached->>v_key is distinct from v_live->>v_key then v_pending:=true; end if;
      if coalesce(v_cached->>v_key,'UNKNOWN')<>'READY' and v_live->>v_key='READY' then
        v_live:=jsonb_set(v_live,array[v_key],coalesce(v_cached->v_key,'"UNKNOWN"'::jsonb));
      end if;
    end loop;
    v_state:=jsonb_populate_record(v_state,v_live);
  end if;

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
  if v_pending and v_state.final_matching_state<>'READY'
     and v_state.matching_row_state='READY' and v_state.source_operational_state='ENABLED'
     and v_state.source_matching_state='ALLOWED' and v_state.source_matching_operational_state='ALLOWED' then
    v_cable:='UNIVERSE_RECONCILIATION: STORED_FINAL_MATCHING_NOT_READY';
  end if;
  v_result:=jsonb_build_object('found',true,'opportunity_id',p_opportunity_id,'source',v_source,'first_broken_cable',v_cable,'observation',jsonb_build_object('linked',v_state.provenance->>'observation_id' is not null,'id',v_state.provenance->>'observation_id','identity_status',v_state.provenance->>'observation_status','http_status',v_state.provenance->>'observation_http_status','observed_at',v_state.provenance->>'observation_at','note',case when v_state.provenance->>'observation_id' is null then 'NO_LINKED_OBSERVATION_INFORMATIONAL_UNLESS_REQUIRED_TO_RESOLVE_LIFECYCLE' else null end),'inventory_state',v_state.inventory_state,'lifecycle_state',v_state.lifecycle_state,'lifecycle_reason',v_state.lifecycle_reason,'professional_readiness',v_state.professional_readiness,'professional_reason',v_state.professional_reason,
    'consumer_diagnostics',jsonb_build_object(
      'CATALOG',jsonb_build_object('row_state',v_state.catalog_row_state,'source_global_state',v_state.source_operational_state,'consumer_switch_state',v_state.provenance->'consumer_switch_states'->>'catalog','permission_state',v_state.provenance->'consumer_permission_states'->>'catalog','effective_state',v_state.catalog_state,'first_unresolved_or_blocking_reason',case when v_state.catalog_row_state<>'READY' then 'CATALOG_ROW_NOT_READY' when v_state.source_operational_state<>'ENABLED' then v_state.source_operational_reason when v_state.provenance->'consumer_switch_states'->>'catalog'<>'ALLOWED' then 'CATALOG_SWITCH_OR_ALIAS_CONFLICT' when v_state.provenance->'consumer_permission_states'->>'catalog'<>'ALLOWED' then 'CATALOG_PERMISSION_NOT_ALLOWED' else null end),
      'MATCHING',jsonb_build_object('row_state',v_state.matching_row_state,'source_global_state',v_state.source_operational_state,'consumer_switch_state',v_state.source_matching_operational_state,'permission_state',v_state.source_matching_state,'effective_state',v_state.final_matching_state,'first_unresolved_or_blocking_reason',case when v_state.matching_row_state<>'READY' then v_state.matching_row_reason when v_state.source_operational_state<>'ENABLED' then v_state.source_operational_reason when v_state.source_matching_operational_state<>'ALLOWED' then v_state.source_matching_operational_reason when v_state.source_matching_state<>'ALLOWED' then v_state.source_matching_reason else null end),
      'ALERTS',jsonb_build_object('row_state',v_state.alerts_row_state,'source_global_state',v_state.source_operational_state,'consumer_switch_state',v_state.provenance->'consumer_switch_states'->>'alerts','permission_state',v_state.provenance->'consumer_permission_states'->>'alerts','effective_state',v_state.alerts_state,'first_unresolved_or_blocking_reason',case when v_state.alerts_row_state<>'READY' then 'ALERT_ROW_NOT_READY' when v_state.source_operational_state<>'ENABLED' then v_state.source_operational_reason when v_state.provenance->'consumer_switch_states'->>'alerts'<>'ALLOWED' then 'ALERTS_SWITCH_OR_ALIAS_CONFLICT' when v_state.provenance->'consumer_permission_states'->>'alerts'<>'ALLOWED' then 'ALERTS_PERMISSION_NOT_ALLOWED' else null end),
      'SEO',jsonb_build_object('row_state',v_state.seo_row_state,'row_reason',v_state.seo_row_reason,'source_global_state',v_state.source_operational_state,'consumer_switch_state',v_state.provenance->'consumer_switch_states'->>'seo','permission_state',v_state.provenance->'consumer_permission_states'->>'seo','effective_state',v_state.seo_state,'first_unresolved_or_blocking_reason',v_state.seo_effective_reason)),
    'catalog_state',v_state.catalog_state,'matching_row_state',v_state.matching_row_state,'matching_row_reason',v_state.matching_row_reason,'source_matching_state',v_state.source_matching_state,'source_matching_reason',v_state.source_matching_reason,'source_matching_operational_state',v_state.source_matching_operational_state,'source_matching_operational_reason',v_state.source_matching_operational_reason,'final_matching_state',v_state.final_matching_state,'seo_state',v_state.seo_state,'alerts_state',v_state.alerts_state,'unresolved_dimensions',v_state.unresolved_dimensions,'source_permission_unknown_dimensions',v_state.source_permission_unknown_dimensions,'provenance',v_state.provenance);
  v_result:=v_result||jsonb_build_object('source_operational_state',v_state.source_operational_state,'source_operational_reason',v_state.source_operational_reason);
  if v_pending then
    v_result:=v_result||jsonb_build_object('policy_reconciliation_pending',true,'persisted_consumer_states',
      jsonb_build_object('catalog',v_cached->'catalog_state','matching',v_cached->'final_matching_state','alerts',v_cached->'alerts_state','seo',v_cached->'seo_state'));
    foreach v_consumer in array array['CATALOG','MATCHING','ALERTS','SEO'] loop
      if v_result->'consumer_diagnostics'->v_consumer->>'effective_state'<>'READY'
         and v_result->'consumer_diagnostics'->v_consumer->>'first_unresolved_or_blocking_reason' is null then
        v_result:=jsonb_set(v_result,array['consumer_diagnostics',v_consumer,'first_unresolved_or_blocking_reason'],'"UNIVERSE_POLICY_RECONCILIATION_PENDING"'::jsonb);
      end if;
    end loop;
  end if;
  return v_result;
end $$;
