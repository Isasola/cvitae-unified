-- PROPOSED WRITE / NOT APPLIED. STOP C requires separate operator approval.
-- Extends the canonical producer registry for the first-party RPC producer.
-- No source switches or permission rows are changed. Other sources delegate
-- to their exact installed definitions, captured once for rollback/parity.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $capture$
declare v_name text; v_signature text; v_oid oid; v_definition text; v_backup text;
begin
  foreach v_name in array array['canonical_opportunity_source_policy','opportunity_universe_decision','get_opportunity_universe_row'] loop
    v_signature := case when v_name='opportunity_universe_decision' then 'jsonb,jsonb,jsonb,jsonb' else 'text' end;
    v_backup := v_name || '_before_r2_20261009';
    if to_regprocedure('public.'||v_backup||'('||v_signature||')') is null then
      v_oid := to_regprocedure('public.'||v_name||'('||v_signature||')');
      if v_oid is null then raise exception 'missing_baseline_function:%',v_name; end if;
      v_definition := pg_get_functiondef(v_oid);
      if position('CREATE OR REPLACE FUNCTION public.'||v_name||'(' in v_definition) <> 1 then
        raise exception 'unexpected_function_definition:%',v_name;
      end if;
      execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.'||v_name||'(', 'CREATE OR REPLACE FUNCTION public.'||v_backup||'(');
      execute format('alter function public.%I(%s) owner to %I', v_backup,v_signature,(select pg_get_userbyid(proowner) from pg_proc where oid=v_oid));
      execute format('revoke all on function public.%I(%s) from public,anon,authenticated',v_backup,v_signature);
      execute format('grant execute on function public.%I(%s) to service_role',v_backup,v_signature);
    end if;
  end loop;
end $capture$;

-- Same controlled registry as shared/controlled-opportunity-producers.json.
-- This is producer capability, NEVER publication permission.
create or replace function public.controlled_opportunity_producer(p_source text)
returns jsonb language sql immutable set search_path='' as $$
  select case when p_source='recruiter_b2b' then jsonb_build_object(
    'state','EXECUTABLE_PRODUCER','entrypoints',jsonb_build_array('netlify/functions/create-vacancy.ts'),
    'operational_default','ACTIVE','permission_mode','EXPLICIT_PER_CONSUMER',
    'identity_authority','verified recruiter token inside atomic RPC') else null end
$$;
revoke all on function public.controlled_opportunity_producer(text) from public,anon,authenticated;
grant execute on function public.controlled_opportunity_producer(text) to service_role;

create or replace function public.canonical_opportunity_source_policy(p_raw_source text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_policy jsonb; v_stored jsonb; v_source text; v_config jsonb; v_consumer text; v_field text; v_override jsonb;
begin
  v_policy := public.canonical_opportunity_source_policy_before_r2_20261009(p_raw_source);
  v_source := v_policy->>'canonical_source';
  if public.controlled_opportunity_producer(v_source) is null then return v_policy; end if;
  v_stored := public.stored_opportunity_source_policy(p_raw_source);
  select to_jsonb(s) into v_config from public.opportunity_sources s where s.source=v_source;
  -- Read exact source configuration and existing audited overrides. Do not
  -- silently turn every consumer on merely because a producer exists.
  foreach v_consumer in array array['source','catalog','matching','alerts','seo'] loop
    v_field := case when v_consumer='source' then 'is_enabled' else v_consumer||'_enabled' end;
    v_override := v_policy->'consumer_switch_overrides'->v_consumer;
    v_policy := jsonb_set(v_policy,array[v_field],coalesce(v_override,v_stored->v_field,'null'::jsonb));
  end loop;
  return v_policy || jsonb_build_object(
    'producer_state','EXECUTABLE_PRODUCER','producer_execution',public.controlled_opportunity_producer(v_source),
    'first_party_permission_role','CONTROLLED_PRODUCER_PERMISSION',
    'web_catalog_allowed',v_config->'web_catalog_allowed',
    'search_engine_indexing_allowed',v_config->'search_engine_indexing_allowed',
    'google_jobs_distribution_allowed',v_config->'google_jobs_distribution_allowed',
    'third_party_job_distribution_allowed',v_config->'third_party_job_distribution_allowed');
end $$;

create or replace function public.controlled_opportunity_permission(p_policy jsonb,p_consumer text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_dimension text; v_column text; v_state text; v_reason text;
begin
  v_dimension := case p_consumer when 'seo' then 'seo_index' when 'jobPosting' then 'google_jobs'
    when 'googleJobs' then 'google_jobs' when 'thirdParty' then 'third_party_distribution' else p_consumer end;
  v_column := case p_consumer when 'catalog' then 'web_catalog_allowed' when 'seo' then 'search_engine_indexing_allowed'
    when 'jobPosting' then 'google_jobs_distribution_allowed' when 'googleJobs' then 'google_jobs_distribution_allowed'
    when 'thirdParty' then 'third_party_job_distribution_allowed' else null end;
  v_state := coalesce(p_policy->'consumer_permission_states'->>v_dimension,'UNKNOWN');
  if v_column is not null and p_policy->>v_column='false' then v_state:='DENIED'; end if;
  if v_state not in ('ALLOWED','DENIED') then v_state:='UNKNOWN'; end if;
  v_reason := case when v_state='ALLOWED' then 'EXPLICIT_CONSUMER_PERMISSION'
    when v_column='web_catalog_allowed' and p_policy->>v_column='false' then 'WEB_CATALOG_DENIED'
    else upper(v_dimension)||'_PERMISSION_'||v_state end;
  return jsonb_build_object('state',v_state,'reason',v_reason);
end $$;
revoke all on function public.controlled_opportunity_permission(jsonb,text) from public,anon,authenticated;
grant execute on function public.controlled_opportunity_permission(jsonb,text) to service_role;

create or replace function public.opportunity_universe_decision(p_row jsonb,p_observation jsonb,p_source_policy jsonb,p_prior_state jsonb default null)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_result jsonb; v_source text; v_consumer text; v_field text; v_gate jsonb; v_gates jsonb:='{}'; v_states jsonb:='{}'; v_closed boolean;
begin
  v_result := public.opportunity_universe_decision_before_r2_20261009(p_row,p_observation,p_source_policy,p_prior_state);
  v_source := p_source_policy->>'canonical_source';
  if public.controlled_opportunity_producer(v_source) is null then return v_result; end if;
  v_closed := p_row->>'is_active'='false';
  -- An employer closure cannot be undone by later HTTP 200/live observations.
  if v_closed then
    v_result := v_result || jsonb_build_object('lifecycle_state','INACTIVE_VALID','lifecycle_reason','PUBLISHER_CLOSED',
      'lifecycle_repair',null,'catalog_row_state','NOT_READY','matching_row_state','NOT_READY','alerts_row_state','NOT_READY',
      'seo_row_state','NOT_READY','seo_row_reason','PUBLISHER_CLOSED','matching_row_reason','PUBLISHER_CLOSED',
      'professional_readiness','PROFESSIONAL_UNKNOWN','professional_reason','LIFECYCLE_NOT_READY');
  end if;
  foreach v_consumer in array array['catalog','matching','alerts','seo'] loop
    v_field := case when v_consumer='matching' then 'final_matching_state' else v_consumer||'_state' end;
    v_gate := public.controlled_opportunity_permission(p_source_policy,v_consumer);
    v_gates := jsonb_set(v_gates,array[v_consumer],v_gate);
    v_states := jsonb_set(v_states,array[v_consumer],v_gate->'state');
    if v_closed then v_result:=jsonb_set(v_result,array[v_field],'"NOT_READY"');
    elsif v_result->>v_field='READY' and v_gate->>'state'<>'ALLOWED' then
      v_result := jsonb_set(v_result,array[v_field],to_jsonb(case when v_gate->>'state'='DENIED' then 'NOT_READY' else 'UNKNOWN' end::text));
    end if;
    if v_gate->>'state'='UNKNOWN' then
      v_result:=jsonb_set(v_result,'{unresolved_dimensions}',coalesce(v_result->'unresolved_dimensions','[]')||jsonb_build_array(upper(v_consumer)||'_PERMISSION_UNKNOWN'));
    end if;
  end loop;
  v_result:=v_result||jsonb_build_object('source_matching_state',v_gates->'matching'->>'state',
    'source_matching_reason',v_gates->'matching'->>'reason');
  if v_closed then v_result:=jsonb_set(v_result,'{seo_effective_reason}','"PUBLISHER_CLOSED"');
  elsif v_result->>'seo_row_state'='READY' and v_gates->'seo'->>'state'<>'ALLOWED' then
    v_result:=jsonb_set(v_result,'{seo_effective_reason}',v_gates->'seo'->'reason');
  end if;
  v_result:=jsonb_set(v_result,'{provenance}',coalesce(v_result->'provenance','{}')||jsonb_build_object(
    'first_party_permission_role','CONTROLLED_PRODUCER_PERMISSION','controlled_consumer_gates',v_gates,'consumer_permission_states',v_states));
  return v_result;
end $$;

create or replace function public.get_opportunity_universe_row(p_opportunity_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_consumer text; v_gate jsonb; v_key text;
begin
  v_result:=public.get_opportunity_universe_row_before_r2_20261009(p_opportunity_id);
  if public.controlled_opportunity_producer(v_result->>'source') is null then return v_result; end if;
  foreach v_consumer in array array['CATALOG','MATCHING','ALERTS','SEO'] loop
    v_key:=lower(v_consumer);
    v_gate:=v_result->'provenance'->'controlled_consumer_gates'->v_key;
    v_result:=jsonb_set(v_result,array['consumer_diagnostics',v_consumer,'permission_role'],'"CONTROLLED_PRODUCER_PERMISSION"');
    if v_gate is not null then
      v_result:=jsonb_set(v_result,array['consumer_diagnostics',v_consumer,'permission_state'],v_gate->'state');
      v_result:=jsonb_set(v_result,array['consumer_diagnostics',v_consumer,'permission_gate'],v_gate);
      if v_gate->>'state'<>'ALLOWED' and v_result->'consumer_diagnostics'->v_consumer->>'row_state'='READY' then
        v_result:=jsonb_set(v_result,array['consumer_diagnostics',v_consumer,'first_unresolved_or_blocking_reason'],v_gate->'reason');
      end if;
    end if;
  end loop;
  return v_result;
end $$;
-- CREATE OR REPLACE preserves the original function OIDs, owners and grants.
commit;
