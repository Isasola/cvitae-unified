-- PROPOSED WRITE / NOT APPLIED.
-- Corrects only recruiter_b2b producer semantics after 202610090001/002.
-- Historical row repair is intentionally a separate, operator-authorized write.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $preflight$
begin
  if to_regprocedure('public.apply_opportunity_source_trust()') is null
    or to_regprocedure('public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.opportunity_universe_decision_before_r2_20261009(jsonb,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.sync_recruiter_vacancy_mirror(uuid,text)') is null then
    raise exception 'recruiter_lifecycle_correction_dependency_missing';
  end if;
  if not exists(
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='opportunities'
      and t.tgname='opportunity_source_trust_before_insert' and not t.tgisinternal
  ) or not exists(
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='opportunities'
      and t.tgname='zz_recruiter_mirror_lifecycle' and not t.tgisinternal
  ) then
    raise exception 'recruiter_lifecycle_correction_trigger_dependency_missing';
  end if;
end $preflight$;

-- PostgreSQL executes triggers of the same kind in name order. This trigger is
-- deliberately after opportunity_source_trust_before_insert and the installed
-- zz_recruiter_mirror_lifecycle guard. It restores only facts declared by the
-- controlled recruiter producer; it does not attest the vacancy contents.
create or replace function public.guard_recruiter_declared_lifecycle_country()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_declared_active boolean; v_owner_id text; v_owner_valid boolean;
begin
  if lower(trim(coalesce(new.source,'')))<>'recruiter_b2b' then return new; end if;
  if new.recruiter_vacancy_id is null then raise exception 'recruiter_mirror_requires_vacancy'; end if;
  select r.is_active,r.recruiter_token_id::text,
    coalesce(t.is_active and t.verification_status='verified',false)
    into v_declared_active,v_owner_id,v_owner_valid
  from public.recruiter_vacancies r
  left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
  where r.id=new.recruiter_vacancy_id;
  if not found then raise exception 'recruiter_vacancy_missing'; end if;
  if v_owner_id is null or not v_owner_valid then raise exception 'recruiter_owner_not_verified'; end if;

  -- Employer identity and the employer's open/closed declaration are factual
  -- inputs for ownership/lifecycle. They do not verify requirements or content.
  new.is_active:=v_declared_active;
  -- recruiter_vacancies has location text but no factual country field. The
  -- source default must not be promoted into an asserted job country.
  new.country_code:=null;
  return new;
end $$;

drop trigger if exists zzz_recruiter_declared_lifecycle_country on public.opportunities;
create trigger zzz_recruiter_declared_lifecycle_country
  before insert or update on public.opportunities
  for each row execute function public.guard_recruiter_declared_lifecycle_country();

-- Preserve the installed reducer for every other source. For recruiter_b2b,
-- the employer declaration resolves lifecycle only. Factual verification and
-- every consumer permission/switch remain independent and unchanged.
create or replace function public.opportunity_universe_decision(
  p_row jsonb,p_observation jsonb,p_source_policy jsonb,p_prior_state jsonb default null
)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_result jsonb; v_source text; v_consumer text; v_field text; v_gate jsonb;
  v_gates jsonb:='{}'; v_states jsonb:='{}'; v_closed boolean; v_deadline_state text;
begin
  v_result:=public.opportunity_universe_decision_before_r2_20261009(
    p_row,p_observation,p_source_policy,p_prior_state);
  v_source:=p_source_policy->>'canonical_source';
  if public.controlled_opportunity_producer(v_source) is null then return v_result; end if;
  v_closed:=p_row->>'is_active'='false';

  if v_closed then
    v_result:=v_result||jsonb_build_object(
      'lifecycle_state','INACTIVE_VALID','lifecycle_reason','PUBLISHER_CLOSED',
      'lifecycle_repair',null,'catalog_row_state','NOT_READY','matching_row_state','NOT_READY',
      'alerts_row_state','NOT_READY','seo_row_state','NOT_READY','seo_row_reason','PUBLISHER_CLOSED',
      'matching_row_reason','PUBLISHER_CLOSED','professional_readiness','PROFESSIONAL_UNKNOWN',
      'professional_reason','LIFECYCLE_NOT_READY');
  elsif v_source='recruiter_b2b' then
    v_deadline_state:=public.opportunity_deadline_state(p_row->>'deadline');
    -- Deleted, archived, expired, invalid-deadline and newer hard-dead evidence
    -- are already resolved by the underlying reducer and are never overridden.
    if v_result->>'lifecycle_state'='LIFECYCLE_UNKNOWN'
      and v_deadline_state in ('OPEN','UNKNOWN')
      and nullif(p_row->>'deleted_at','') is null
      and nullif(p_row->>'archived_at','') is null then
      v_result:=v_result||jsonb_build_object(
        'lifecycle_state','ACTIVE_VALID',
        'lifecycle_reason','PUBLISHER_DECLARED_OPEN_FACTUAL_PENDING',
        'lifecycle_repair',null,
        'professional_reason','FACTUAL_VERIFICATION_PENDING',
        'matching_row_reason','FACTUAL_VERIFICATION_PENDING',
        'seo_row_reason','FACTUAL_VERIFICATION_PENDING');
      v_result:=jsonb_set(v_result,'{unresolved_dimensions}',coalesce((
        select jsonb_agg(value order by ordinality)
        from jsonb_array_elements_text(coalesce(v_result->'unresolved_dimensions','[]'::jsonb))
          with ordinality as unresolved(value,ordinality)
        where value<>'LIFECYCLE'
      ),'[]'::jsonb));
    end if;
  end if;

  foreach v_consumer in array array['catalog','matching','alerts','seo'] loop
    v_field:=case when v_consumer='matching' then 'final_matching_state' else v_consumer||'_state' end;
    v_gate:=public.controlled_opportunity_permission(p_source_policy,v_consumer);
    v_gates:=jsonb_set(v_gates,array[v_consumer],v_gate);
    v_states:=jsonb_set(v_states,array[v_consumer],v_gate->'state');
    if v_closed then v_result:=jsonb_set(v_result,array[v_field],'"NOT_READY"');
    elsif v_result->>v_field='READY' and v_gate->>'state'<>'ALLOWED' then
      v_result:=jsonb_set(v_result,array[v_field],to_jsonb(case when v_gate->>'state'='DENIED' then 'NOT_READY' else 'UNKNOWN' end::text));
    end if;
    if v_gate->>'state'='UNKNOWN' then
      v_result:=jsonb_set(v_result,'{unresolved_dimensions}',coalesce(v_result->'unresolved_dimensions','[]')
        ||jsonb_build_array(upper(v_consumer)||'_PERMISSION_UNKNOWN'));
    end if;
  end loop;
  v_result:=v_result||jsonb_build_object(
    'source_matching_state',v_gates->'matching'->>'state',
    'source_matching_reason',v_gates->'matching'->>'reason');
  if v_closed then v_result:=jsonb_set(v_result,'{seo_effective_reason}','"PUBLISHER_CLOSED"');
  elsif v_result->>'seo_row_state'='READY' and v_gates->'seo'->>'state'<>'ALLOWED' then
    v_result:=jsonb_set(v_result,'{seo_effective_reason}',v_gates->'seo'->'reason');
  end if;
  v_result:=jsonb_set(v_result,'{provenance}',coalesce(v_result->'provenance','{}')
    ||jsonb_build_object(
      'first_party_permission_role','CONTROLLED_PRODUCER_PERMISSION',
      'controlled_consumer_gates',v_gates,'consumer_permission_states',v_states));
  if v_source='recruiter_b2b' then
    v_result:=jsonb_set(v_result,'{provenance}',v_result->'provenance'||jsonb_build_object(
      'publisher_declared_lifecycle',jsonb_build_object(
        'state',case when v_closed then 'CLOSED' else 'OPEN' end,
        'source','recruiter_vacancies.is_active',
        'factual_verification',coalesce(p_row->>'verification_status','UNKNOWN'),
        'country_evidence','NOT_PROVIDED')));
  end if;
  return v_result;
end $$;

revoke all on function public.guard_recruiter_declared_lifecycle_country() from public,anon,authenticated;
-- CREATE OR REPLACE preserves the reducer OID, owner and installed grants.
commit;
