-- PROPOSED WRITE / NOT APPLIED.
-- Private authenticated B2C matching is an independent first-party consumer.
-- This migration changes no catalog, SEO, alerts, Google Jobs or third-party
-- permission and does not rewrite the five historical B2B Opportunity Truth
-- mirrors. Historical derived Universe state is reconciled later through the
-- separately authorized, bounded cursor contract defined by this migration;
-- future writes keep converging through refresh_opportunity_universe.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create temporary table c4_reducer_baseline_contract on commit drop as
select p.oid function_oid,p.proowner,p.proacl
from pg_proc p
where p.oid=to_regprocedure('public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)');

do $capture$
declare
  v_oid oid;
  v_backup_oid oid;
  v_definition text;
  v_signature text:='jsonb,jsonb,jsonb,jsonb';
  v_acl record;
  v_grantee text;
begin
  if to_regprocedure('public.opportunity_universe_decision_before_c4_20261011('||v_signature||')') is null then
    v_oid:=to_regprocedure('public.opportunity_universe_decision('||v_signature||')');
    if v_oid is null then raise exception 'missing_baseline_function:opportunity_universe_decision'; end if;
    v_definition:=pg_get_functiondef(v_oid);
    if position('CREATE OR REPLACE FUNCTION public.opportunity_universe_decision(' in v_definition)<>1 then
      raise exception 'unexpected_function_definition:opportunity_universe_decision';
    end if;
    execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.opportunity_universe_decision(',
      'CREATE OR REPLACE FUNCTION public.opportunity_universe_decision_before_c4_20261011(');
    execute format('alter function public.opportunity_universe_decision_before_c4_20261011(%s) owner to %I',
      v_signature,(select pg_get_userbyid(proowner) from pg_proc where oid=v_oid));
    -- The wrapper is SECURITY INVOKER. Its baseline delegate must remain
    -- executable by exactly the roles that can execute the installed reducer.
    -- Rebuild the backup ACL from the catalog rather than assuming service_role.
    execute format('revoke all on function public.opportunity_universe_decision_before_c4_20261011(%s) from public',v_signature);
    for v_acl in
      select acl.grantee,acl.is_grantable
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where p.oid=v_oid and acl.privilege_type='EXECUTE' and acl.grantee<>p.proowner
    loop
      v_grantee:=case when v_acl.grantee=0 then 'public'
        else quote_ident(pg_get_userbyid(v_acl.grantee)) end;
      execute format('grant execute on function public.opportunity_universe_decision_before_c4_20261011(%s) to %s%s',
        v_signature,v_grantee,case when v_acl.is_grantable then ' with grant option' else '' end);
    end loop;
    v_backup_oid:=to_regprocedure('public.opportunity_universe_decision_before_c4_20261011('||v_signature||')');
    if exists(select 1 from pg_roles r
      where has_function_privilege(r.oid,v_oid,'EXECUTE') is distinct from
        has_function_privilege(r.oid,v_backup_oid,'EXECUTE')) then
      raise exception 'opportunity_universe_decision_backup_acl_mismatch';
    end if;
  end if;
end $capture$;

create temporary table c4_match_baseline_contract on commit drop as
select p.oid function_oid,p.proowner,p.proacl,p.prosecdef,p.provolatile,p.proisstrict,
  p.proleakproof,p.proparallel,l.lanname,p.pronargdefaults,p.proargnames,
  pg_get_expr(p.proargdefaults,0) argument_defaults,
  pg_get_function_result(p.oid) function_result,
  md5(coalesce(p.proacl::text,'DEFAULT_ACL')) input_acl_digest,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_proc p join pg_language l on l.oid=p.prolang
where p.oid=to_regprocedure('public.match_opportunities(public.vector,double precision,integer)');

create temporary table c4_match_baseline_acl on commit drop as
select acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable
from pg_proc p
cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
where p.oid=to_regprocedure('public.match_opportunities(public.vector,double precision,integer)');

create temporary table c4_match_expected_acl_contract on commit drop as
with target_roles as (
  select (select oid from pg_roles where rolname='anon') anon_oid,
    (select oid from pg_roles where rolname='authenticated') authenticated_oid,
    (select oid from pg_roles where rolname='service_role') service_oid
), expected_rows as (
  select b.grantee,bool_or(b.is_grantable) is_grantable
  from c4_match_baseline_acl b cross join target_roles r
  where b.privilege_type='EXECUTE'
    and b.grantee not in (0,r.anon_oid,r.authenticated_oid,r.service_oid)
  group by b.grantee
  union all
  select r.service_oid,coalesce((select bool_or(b.is_grantable)
    from c4_match_baseline_acl b where b.privilege_type='EXECUTE' and b.grantee=r.service_oid),false)
  from target_roles r
)
select md5(coalesce(string_agg(grantee::text||':'||is_grantable::text,E'\n'
    order by grantee),'')) expected_acl_contract_digest,
  jsonb_agg(jsonb_build_object('grantee',grantee,'is_grantable',is_grantable)
    order by grantee) expected_acl_contract
from expected_rows;

do $validate_match_contract$
declare
  v_contract record;
  v_overloads integer;
begin
  if to_regtype('public.vector') is null then
    raise exception 'missing_required_type:public.vector';
  end if;
  select count(*) into v_overloads
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='match_opportunities';
  if v_overloads<>1 then
    raise exception 'unexpected_match_opportunities_overload_count:%',v_overloads;
  end if;
  select * into v_contract from c4_match_baseline_contract;
  if not found then raise exception 'missing_baseline_function:match_opportunities'; end if;
  if v_contract.pronargdefaults<>2
    or v_contract.proargnames[1:3] is distinct from array['query_embedding','match_threshold','match_count']::text[]
    or regexp_replace(v_contract.argument_defaults,'\s+','', 'g')<>'0.3,20' then
    raise exception 'unexpected_match_opportunities_arguments_or_defaults:%',
      coalesce(v_contract.argument_defaults,'NULL');
  end if;
  if v_contract.function_result<>
    'TABLE(id text, title text, organization text, location text, rubro text, tags text[], description text, application_url text, source text, similarity double precision)' then
    raise exception 'unexpected_match_opportunities_result:%',v_contract.function_result;
  end if;
  if v_contract.lanname<>'sql' or v_contract.prosecdef
    or v_contract.provolatile<>'s' or v_contract.proisstrict
    or v_contract.proleakproof or v_contract.proparallel<>'u' then
    raise exception 'unexpected_match_opportunities_properties';
  end if;
  if not has_function_privilege('service_role',v_contract.function_oid,'EXECUTE') then
    raise exception 'service_role_cannot_execute_match_opportunities';
  end if;
  if v_contract.input_acl_digest<>'791d2b1e22edbb03f97770724fbb588b'
    or not v_contract.anon_execute or not v_contract.authenticated_execute then
    raise exception 'unexpected_match_opportunities_input_acl:%:%:%',
      v_contract.input_acl_digest,v_contract.anon_execute,v_contract.authenticated_execute;
  end if;
  if (select count(*) from pg_operator o
      where o.oprnamespace='public'::regnamespace and o.oprname='<=>'
        and o.oprleft=to_regtype('public.vector')
        and o.oprright=to_regtype('public.vector')
        and o.oprresult='double precision'::regtype)<>1 then
    raise exception 'public_vector_cosine_operator_contract_missing_or_ambiguous';
  end if;
end $validate_match_contract$;

do $capture_match$
declare v_oid oid; v_definition text; v_signature text:='public.vector,double precision,integer';
begin
  if to_regprocedure('public.match_opportunities_before_c4_20261011('||v_signature||')') is null then
    v_oid:=to_regprocedure('public.match_opportunities('||v_signature||')');
    if v_oid is null then raise exception 'missing_baseline_function:match_opportunities'; end if;
    v_definition:=pg_get_functiondef(v_oid);
    if position('CREATE OR REPLACE FUNCTION public.match_opportunities(' in v_definition)<>1 then
      raise exception 'unexpected_function_definition:match_opportunities';
    end if;
    execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.match_opportunities(',
      'CREATE OR REPLACE FUNCTION public.match_opportunities_before_c4_20261011(');
    execute format('alter function public.match_opportunities_before_c4_20261011(%s) owner to %I',
      v_signature,(select pg_get_userbyid(proowner) from pg_proc where oid=v_oid));
    execute format('revoke all on function public.match_opportunities_before_c4_20261011(%s) from public,anon,authenticated',v_signature);
    execute format('grant execute on function public.match_opportunities_before_c4_20261011(%s) to service_role',v_signature);
  end if;
end $capture_match$;

create or replace function public.opportunity_universe_decision(
  p_row jsonb,p_observation jsonb,p_source_policy jsonb,p_prior_state jsonb default null
)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  v_result jsonb;
  v_source text;
  v_permission text;
  v_row_state text;
  v_source_state text;
  v_switch_state text;
  v_final text;
  v_final_reason text;
  v_first_failure text;
  v_lifecycle text;
  v_source_identity_resolved boolean;
  v_matching_conflict boolean;
  v_professional boolean;
begin
  v_result:=public.opportunity_universe_decision_before_c4_20261011(
    p_row,p_observation,p_source_policy,p_prior_state);
  v_source:=p_source_policy->>'canonical_source';

  -- Controlled first-party producers may declare a vacancy open while factual
  -- verification remains pending. That confidence state is preserved; it does
  -- not erase professional evidence or turn into public distribution approval.
  if public.controlled_opportunity_producer(v_source) is not null
    and v_result->>'lifecycle_state'='ACTIVE_VALID'
    and p_row->>'verification_status'<>'verified' then
    v_professional:=cardinality(regexp_split_to_array(trim(coalesce(p_row->>'title','')),'\s+'))>=2
      and (length(trim(coalesce(p_row->>'description','')))>=100
        or length(public.opportunity_requirements_text(p_row->'requirements'))>=60
        or nullif(trim(coalesce(p_row->>'professional_family','')),'') is not null);
    v_result:=v_result||jsonb_build_object(
      'professional_readiness',case when v_professional then 'PROFESSIONAL_READY' else 'PROFESSIONAL_THIN' end,
      'professional_reason',case when v_professional then 'PUBLISHER_DECLARED_PROFESSIONAL_EVIDENCE_FACTUAL_PENDING' else 'INSUFFICIENT_PROFESSIONAL_EVIDENCE' end,
      'matching_row_state',case when v_professional then 'READY' else 'NOT_READY' end,
      'matching_row_reason',case when v_professional then 'PUBLISHER_DECLARED_PROFESSIONAL_EVIDENCE_FACTUAL_PENDING' else 'INSUFFICIENT_PROFESSIONAL_EVIDENCE' end);
  end if;

  v_permission:=coalesce(v_result->>'source_matching_state','UNKNOWN');
  v_row_state:=coalesce(v_result->>'matching_row_state','UNKNOWN');
  v_source_state:=coalesce(v_result->>'source_operational_state','UNKNOWN');
  v_switch_state:=coalesce(v_result->>'source_matching_operational_state','UNKNOWN');
  v_lifecycle:=coalesce(v_result->>'lifecycle_state','LIFECYCLE_UNKNOWN');
  v_source_identity_resolved:=nullif(trim(coalesce(v_source,'')),'') is not null
    and lower(trim(v_source))<>'unknown';
  v_matching_conflict:=coalesce((p_source_policy->>'matching_enabled_alias_conflict')::boolean,false);
  v_final:=case
    when v_lifecycle<>'ACTIVE_VALID' then
      case when v_lifecycle in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end
    when v_row_state<>'READY' then v_row_state
    when not v_source_identity_resolved then 'UNKNOWN'
    when v_permission='DENIED' then 'NOT_READY'
    when v_source_state='DISABLED' or v_switch_state='DENIED' then 'NOT_READY'
    when v_source_state='CONFLICT' or v_matching_conflict then 'UNKNOWN'
    else 'READY' end;
  v_final_reason:=case
    when v_lifecycle<>'ACTIVE_VALID' then 'LIFECYCLE_'||v_lifecycle||':'||coalesce(v_result->>'lifecycle_reason','UNKNOWN')
    when v_row_state<>'READY' then 'MATCH_ROW_'||v_row_state||':'||coalesce(v_result->>'matching_row_reason','UNKNOWN')
    when not v_source_identity_resolved then 'SOURCE_IDENTITY_UNRESOLVED'
    when v_permission='DENIED' then 'SOURCE_MATCHING_PERMISSION_DENIED:'||coalesce(v_result->>'source_matching_reason','UNSPECIFIED')
    when v_source_state='DISABLED' then 'SOURCE_EXPLICITLY_DISABLED:'||coalesce(v_result->>'source_operational_reason','UNSPECIFIED')
    when v_switch_state='DENIED' then 'SOURCE_MATCHING_EXPLICITLY_DISABLED:'||coalesce(v_result->>'source_matching_operational_reason','UNSPECIFIED')
    when v_source_state='CONFLICT' or v_matching_conflict then 'SOURCE_POLICY_CONFLICT:'||
      case when v_matching_conflict then 'MATCHING_ENABLED_ALIAS_CONFLICT' else coalesce(v_result->>'source_operational_reason','UNSPECIFIED') end
    when v_permission='UNKNOWN' or v_source_state='UNKNOWN' or v_switch_state='UNKNOWN'
      then 'PRIVATE_MATCHING_READY_WITH_ADVISORY_UNKNOWN'
    else 'PRIVATE_MATCHING_READY' end;
  v_first_failure:=case when v_final='READY' then 'FINAL_MATCHING_UNIVERSE' else v_final_reason end;
  v_result:=v_result||jsonb_build_object(
    'final_matching_state',v_final,
    'final_matching_reason',v_final_reason,
    'first_failure',v_first_failure);

  -- UNKNOWN remains evidence. It is neither promoted to ALLOWED nor erased;
  -- this annotation records that absence of a public-distribution decision is
  -- advisory for authenticated private matching, not an implicit prohibition.
  if v_permission='UNKNOWN'
    and not (coalesce(v_result->'unresolved_dimensions','[]'::jsonb)
      ? 'MATCHING_PERMISSION_UNKNOWN:ADVISORY_PRIVATE_MATCHING') then
    v_result:=jsonb_set(v_result,'{unresolved_dimensions}',
      coalesce(v_result->'unresolved_dimensions','[]'::jsonb)
      ||jsonb_build_array('MATCHING_PERMISSION_UNKNOWN:ADVISORY_PRIVATE_MATCHING'));
  end if;
  v_result:=jsonb_set(v_result,'{provenance}',coalesce(v_result->'provenance','{}'::jsonb)
    ||jsonb_build_object('private_matching_contract',jsonb_build_object(
      'consumer','AUTHENTICATED_CANDIDATE_PROFILE','permission_state',v_permission,
      'permission_effect',case when v_permission='DENIED' then 'EXPLICIT_PRESENTATION_DENY' else 'ADVISORY_EVIDENCE' end,
      'source_operational_state',v_source_state,'matching_switch_state',v_switch_state,
      'operational_effect',case
        when v_source_state='DISABLED' then 'EXPLICIT_SOURCE_DISABLE'
        when v_switch_state='DENIED' then 'EXPLICIT_MATCHING_DISABLE'
        when v_source_state='CONFLICT' or v_matching_conflict then 'BLOCKING_SOURCE_POLICY_CONFLICT'
        when v_source_state='UNKNOWN' or v_switch_state='UNKNOWN' then 'ADVISORY_ABSENCE_OF_DECISION'
        else 'OPERATIONALLY_ENABLED' end,
      'final_reason',v_final_reason,'first_failure',v_first_failure,
      'public_distribution_independent',true)));
  return v_result;
end $$;

do $verify_reducer_replacement$
declare v_before c4_reducer_baseline_contract%rowtype; v_after record;
begin
  select * into strict v_before from c4_reducer_baseline_contract;
  select p.oid function_oid,p.proowner,p.proacl into strict v_after from pg_proc p
  where p.oid=to_regprocedure('public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)');
  if v_after.function_oid<>v_before.function_oid or v_after.proowner<>v_before.proowner
    or v_after.proacl is distinct from v_before.proacl then
    raise exception 'opportunity_universe_decision_identity_owner_or_acl_changed';
  end if;
  if not has_function_privilege(pg_get_userbyid(v_after.proowner),
      'public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)','EXECUTE')
    or exists(select 1 from pg_roles r where
      has_function_privilege(r.oid,v_after.function_oid,'EXECUTE') is distinct from
      has_function_privilege(r.oid,
        to_regprocedure('public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)'),
        'EXECUTE')) then
    raise exception 'opportunity_universe_decision_backup_access_incompatible';
  end if;
end $verify_reducer_replacement$;

create temporary table c4_matching_view_baseline_contract on commit drop as
select c.oid relation_oid,c.relowner,c.relacl,c.reloptions,
  (select jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum)
    from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns_contract,
  (select coalesce(jsonb_agg(pg_describe_object(d.classid,d.objid,d.objsubid)
      order by pg_describe_object(d.classid,d.objid,d.objsubid)),'[]'::jsonb)
    from pg_depend d
    where d.refclassid='pg_class'::regclass and d.refobjid=c.oid and d.deptype<>'i'
      and not (d.classid='pg_rewrite'::regclass and d.objid in
        (select r.oid from pg_rewrite r where r.ev_class=c.oid))) external_dependents
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='opportunity_final_matching_universe' and c.relkind='v';

-- final_matching_state already includes lifecycle, intrinsic readiness, the
-- private presentation restriction and audited operational switches. Repeating
-- raw source columns here was a second, divergent authority.
create or replace view public.opportunity_final_matching_universe with (security_invoker=true) as
select o.*,u.lifecycle_state as universe_lifecycle_state,
  u.matching_row_state as universe_matching_row_state,
  u.source_matching_state as universe_source_matching_state,
  u.final_matching_state as universe_final_matching_state,
  u.alerts_state as universe_alerts_state
from public.opportunities o
join public.opportunity_universe_state u on u.opportunity_id=o.id::text
where u.final_matching_state='READY'
  and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN');

do $verify_matching_view_replacement$
declare v_before c4_matching_view_baseline_contract%rowtype; v_after record;
begin
  select * into strict v_before from c4_matching_view_baseline_contract;
  select c.oid relation_oid,c.relowner,c.relacl,c.reloptions,
    (select jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,
        'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum)
      from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns_contract,
    (select coalesce(jsonb_agg(pg_describe_object(d.classid,d.objid,d.objsubid)
        order by pg_describe_object(d.classid,d.objid,d.objsubid)),'[]'::jsonb)
      from pg_depend d
      where d.refclassid='pg_class'::regclass and d.refobjid=c.oid and d.deptype<>'i'
        and not (d.classid='pg_rewrite'::regclass and d.objid in
          (select r.oid from pg_rewrite r where r.ev_class=c.oid))) external_dependents
  into strict v_after
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='opportunity_final_matching_universe' and c.relkind='v';
  if v_after.relation_oid<>v_before.relation_oid or v_after.relowner<>v_before.relowner
    or v_after.relacl is distinct from v_before.relacl
    or v_after.reloptions is distinct from v_before.reloptions
    or v_after.columns_contract is distinct from v_before.columns_contract
    or v_after.external_dependents is distinct from v_before.external_dependents then
    raise exception 'opportunity_final_matching_universe_contract_changed';
  end if;
  if not ('security_invoker=true'=any(coalesce(v_after.reloptions,'{}'::text[])))
    or not has_table_privilege('service_role',v_after.relation_oid,'SELECT')
    or has_table_privilege('anon',v_after.relation_oid,'SELECT')
    or has_table_privilege('authenticated',v_after.relation_oid,'SELECT') then
    raise exception 'opportunity_final_matching_universe_access_incompatible';
  end if;
  if not exists(
      select 1 from pg_rewrite r join pg_depend d
        on d.classid='pg_rewrite'::regclass and d.objid=r.oid
      where r.ev_class=v_after.relation_oid and d.refclassid='pg_class'::regclass
        and d.refobjid='public.opportunities'::regclass)
    or not exists(
      select 1 from pg_rewrite r join pg_depend d
        on d.classid='pg_rewrite'::regclass and d.objid=r.oid
      where r.ev_class=v_after.relation_oid and d.refclassid='pg_class'::regclass
        and d.refobjid='public.opportunity_universe_state'::regclass)
    or not exists(
      select 1 from pg_rewrite r join pg_depend d
        on d.classid='pg_rewrite'::regclass and d.objid=r.oid
      join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
      where r.ev_class=v_after.relation_oid and d.refclassid='pg_class'::regclass
        and d.refobjid='public.opportunity_universe_state'::regclass
        and a.attname='final_matching_state') then
    raise exception 'opportunity_final_matching_universe_dependencies_incompatible';
  end if;
end $verify_matching_view_replacement$;

-- Vector retrieval must spend its bounded budget inside the same private
-- matching universe; hydration is no longer responsible for discarding an
-- arbitrary first N of public-policy-blocked rows.
create or replace function public.match_opportunities(
  query_embedding public.vector(384),
  match_threshold double precision default 0.3,
  match_count integer default 20
) returns table(
  id text,
  title text,
  organization text,
  location text,
  rubro text,
  tags text[],
  description text,
  application_url text,
  source text,
  similarity double precision
)
language sql stable security invoker set search_path='' as $$
  select o.id::text,o.title::text,o.organization::text,o.location::text,
    o.rubro::text,o.tags::text[],o.description::text,o.application_url::text,
    o.source::text,(1-(o.embedding OPERATOR(public.<=>) query_embedding))::double precision as similarity
  from public.opportunity_final_matching_universe o
  where o.embedding is not null
    and 1-(o.embedding OPERATOR(public.<=>) query_embedding)>=match_threshold
  order by o.embedding OPERATOR(public.<=>) query_embedding
  limit greatest(1,least(match_count,500))
$$;

-- PROD evidence confirms this RPC is an internal retrieval primitive. The
-- sole executable caller uses SUPABASE_SERVICE_ROLE_KEY. Harden only this exact
-- signature; CREATE OR REPLACE has retained its OID, owner and incoming ACL up
-- to this explicit, reviewable delta.
revoke execute on function public.match_opportunities(public.vector,double precision,integer)
  from public,anon,authenticated;
grant execute on function public.match_opportunities(public.vector,double precision,integer)
  to service_role;

do $verify_match_replacement$
declare
  v_before c4_match_baseline_contract%rowtype;
  v_after record;
  v_overloads integer;
  v_expected_acl_digest text;
  v_actual_acl_digest text;
  v_anon oid;
  v_authenticated oid;
  v_service oid;
begin
  select * into strict v_before from c4_match_baseline_contract;
  select p.oid function_oid,p.proowner,p.proacl,p.prosecdef,p.provolatile,p.proisstrict,
    p.proleakproof,p.proparallel,l.lanname,p.pronargdefaults,p.proargnames,
    pg_get_expr(p.proargdefaults,0) argument_defaults,
    pg_get_function_result(p.oid) function_result
  into strict v_after
  from pg_proc p join pg_language l on l.oid=p.prolang
  where p.oid=to_regprocedure('public.match_opportunities(public.vector,double precision,integer)');
  select count(*) into v_overloads
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='match_opportunities';
  if v_overloads<>1 or v_after.function_oid<>v_before.function_oid then
    raise exception 'match_opportunities_identity_changed_or_overloaded';
  end if;
  if v_after.proowner<>v_before.proowner then
    raise exception 'match_opportunities_owner_changed';
  end if;
  if v_after.prosecdef or v_after.pronargdefaults<>2
    or regexp_replace(v_after.argument_defaults,'\s+','','g')<>'0.3,20'
    or v_after.function_result<>v_before.function_result
    or v_after.lanname<>v_before.lanname
    or position('public.opportunity_final_matching_universe' in pg_get_functiondef(v_after.function_oid))=0 then
    raise exception 'match_opportunities_contract_changed';
  end if;
  select oid into strict v_anon from pg_roles where rolname='anon';
  select oid into strict v_authenticated from pg_roles where rolname='authenticated';
  select oid into strict v_service from pg_roles where rolname='service_role';
  if has_function_privilege('anon',v_after.function_oid,'EXECUTE')
    or has_function_privilege('authenticated',v_after.function_oid,'EXECUTE')
    or not has_function_privilege('service_role',v_after.function_oid,'EXECUTE') then
    raise exception 'match_opportunities_acl_hardening_failed';
  end if;
  if exists(
    (select grantee,grantor,privilege_type,is_grantable from c4_match_baseline_acl
      where grantee not in (0,v_anon,v_authenticated,v_service)
     except
     select acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where p.oid=v_after.function_oid and acl.grantee not in (0,v_anon,v_authenticated,v_service))
    union all
    (select acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where p.oid=v_after.function_oid and acl.grantee not in (0,v_anon,v_authenticated,v_service)
     except
     select grantee,grantor,privilege_type,is_grantable from c4_match_baseline_acl
      where grantee not in (0,v_anon,v_authenticated,v_service))) then
    raise exception 'match_opportunities_unrelated_acl_changed';
  end if;
  select expected_acl_contract_digest into strict v_expected_acl_digest
    from c4_match_expected_acl_contract;
  select md5(coalesce(string_agg(grantee::text||':'||is_grantable::text,E'\n'
      order by grantee),'')) into v_actual_acl_digest
  from (
    select acl.grantee,bool_or(acl.is_grantable) is_grantable
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where p.oid=v_after.function_oid and acl.privilege_type='EXECUTE'
    group by acl.grantee
  ) normalized_acl;
  if v_actual_acl_digest is distinct from v_expected_acl_digest then
    raise exception 'match_opportunities_acl_delta_mismatch:%:%',v_expected_acl_digest,v_actual_acl_digest;
  end if;
end $verify_match_replacement$;

-- Historical reconciliation is separate from schema installation. Preparation
-- materializes the exact opportunity IDs and their canonical identity once;
-- later alias/source/date changes cannot enter, leave or move that membership.
create or replace function public.private_matching_c4_source_identity(p_raw_source text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_normalized text:=nullif(lower(trim(coalesce(p_raw_source,''))), '');
  v_alias_rows integer:=0;
  v_alias_targets integer:=0;
  v_alias_target text;
  v_direct boolean:=false;
begin
  if v_normalized is null then
    return jsonb_build_object('state','MISSING','reason','SOURCE_IDENTITY_MISSING',
      'normalized_source',null,'canonical_source',null);
  end if;
  select count(*),count(distinct a.canonical_source),min(a.canonical_source)
    into v_alias_rows,v_alias_targets,v_alias_target
  from public.opportunity_source_identity_aliases a
  where a.emitted_source=v_normalized;
  select exists(select 1 from public.opportunity_sources s where lower(s.source)=v_normalized)
    into v_direct;
  if v_alias_rows>1 or v_alias_targets>1 then
    return jsonb_build_object('state','AMBIGUOUS','reason','MULTIPLE_ALIAS_ROWS_OR_TARGETS',
      'normalized_source',v_normalized,'canonical_source',null,'alias_rows',v_alias_rows,
      'alias_targets',v_alias_targets);
  elsif v_alias_rows=1 then
    return jsonb_build_object('state','RESOLVED',
      'reason',case when v_direct and v_alias_target<>v_normalized
        then 'EXPLICIT_ALIAS_OVERRIDES_CANONICAL_NAME_COLLISION' else 'EXPLICIT_ALIAS' end,
      'normalized_source',v_normalized,'canonical_source',v_alias_target,
      'alias_rows',1,'direct_registry_name_collision',v_direct and v_alias_target<>v_normalized);
  elsif v_direct then
    return jsonb_build_object('state','RESOLVED','reason','DIRECT_CANONICAL_SOURCE',
      'normalized_source',v_normalized,'canonical_source',v_normalized,'alias_rows',0);
  end if;
  return jsonb_build_object('state','UNREGISTERED','reason','NO_CANONICAL_IDENTITY_AUTHORITY',
    'normalized_source',v_normalized,'canonical_source',null,'alias_rows',0);
end $$;

create or replace function public.private_matching_c4_contract_digests()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'permission_global_digest',(select md5(coalesce(string_agg(to_jsonb(p)::text,E'\n'
      order by p.canonical_source,p.consumer,to_jsonb(p)::text),'')) from public.opportunity_source_consumer_permissions p),
    'permission_global_rows',(select count(*) from public.opportunity_source_consumer_permissions),
    'permission_recruiter_digest',(select md5(coalesce(string_agg(to_jsonb(p)::text,E'\n'
      order by p.canonical_source,p.consumer,to_jsonb(p)::text),'')) from public.opportunity_source_consumer_permissions p
      where p.canonical_source='recruiter_b2b'),
    'permission_recruiter_rows',(select count(*) from public.opportunity_source_consumer_permissions
      where canonical_source='recruiter_b2b'),
    'source_policy_digest',(select md5(coalesce(string_agg(to_jsonb(s)::text,E'\n'
      order by lower(s.source),to_jsonb(s)::text),''))
      from public.opportunity_sources s),
    'source_policy_rows',(select count(*) from public.opportunity_sources),
    'alias_digest',(select md5(coalesce(string_agg(to_jsonb(a)::text,E'\n'
      order by lower(a.emitted_source),lower(a.canonical_source),to_jsonb(a)::text),''))
      from public.opportunity_source_identity_aliases a),
    'alias_rows',(select count(*) from public.opportunity_source_identity_aliases)
  )
$$;

create table public.private_matching_c4_reconciliation_runs (
  run_key text primary key check(run_key='C4_20261011'),
  snapshot_at timestamptz not null,
  status text not null check(status in ('PREPARING','PREPARED','RUNNING','COMPLETE','COMPLETE_WITH_IDENTITY_REVIEW','FAILED')),
  total_members bigint not null default 0,
  resolved_members bigint not null default 0,
  identity_review_members bigint not null default 0,
  permission_global_digest text not null,
  permission_global_rows bigint not null,
  permission_recruiter_digest text not null,
  permission_recruiter_rows bigint not null,
  source_policy_digest text not null,
  source_policy_rows bigint not null,
  alias_digest text not null,
  alias_rows bigint not null,
  prepared_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check(total_members=resolved_members+identity_review_members)
);

create table public.private_matching_c4_reconciliation_sources (
  bucket_key text primary key,
  run_key text not null references public.private_matching_c4_reconciliation_runs(run_key),
  canonical_source text,
  identity_state text not null check(identity_state in ('RESOLVED','MISSING','AMBIGUOUS','UNREGISTERED')),
  identity_reason text not null,
  status text not null check(status in ('PENDING','RUNNING','COMPLETE','FAILED','BLOCKED_IDENTITY')),
  cursor_id text,
  total_rows bigint not null check(total_rows>=0),
  processed_rows bigint not null default 0 check(processed_rows between 0 and total_rows),
  changed_rows bigint not null default 0 check(changed_rows between 0 and processed_rows),
  attempts integer not null default 0,
  recovery_count integer not null default 0,
  last_batch_id bigint,
  last_error text,
  last_recovery_note text,
  last_recovery_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create unique index private_matching_c4_one_resolved_bucket_per_source
  on public.private_matching_c4_reconciliation_sources(run_key,canonical_source)
  where identity_state='RESOLVED';

create table public.private_matching_c4_reconciliation_members (
  opportunity_id text primary key,
  run_key text not null references public.private_matching_c4_reconciliation_runs(run_key),
  bucket_key text not null references public.private_matching_c4_reconciliation_sources(bucket_key)
    deferrable initially deferred,
  snapshot_raw_source text,
  snapshot_normalized_source text,
  snapshot_canonical_source text,
  identity_state text not null check(identity_state in ('RESOLVED','MISSING','AMBIGUOUS','UNREGISTERED')),
  identity_reason text not null,
  snapshot_created_at timestamptz,
  processing_state text not null check(processing_state in ('PENDING','COMPLETE','BLOCKED_IDENTITY')),
  attempt_count integer not null default 0,
  completion_count integer not null default 0 check(completion_count between 0 and 1),
  before_lifecycle_state text,
  before_final_matching_state text,
  before_catalog_state text,
  before_alerts_state text,
  before_seo_state text,
  after_lifecycle_state text,
  after_final_matching_state text,
  after_first_failure text,
  after_catalog_state text,
  after_alerts_state text,
  after_seo_state text,
  current_raw_source text,
  current_canonical_source text,
  source_identity_drift boolean not null default false,
  final_state_changed boolean,
  completed_at timestamptz,
  check(attempt_count>=completion_count),
  check((processing_state='COMPLETE' and completion_count=1)
    or (processing_state<>'COMPLETE' and completion_count=0))
);
create index private_matching_c4_members_pending_idx
  on public.private_matching_c4_reconciliation_members(bucket_key,processing_state,opportunity_id);

create table public.private_matching_c4_reconciliation_batches (
  batch_id bigint generated always as identity primary key,
  run_key text not null references public.private_matching_c4_reconciliation_runs(run_key),
  bucket_key text not null references public.private_matching_c4_reconciliation_sources(bucket_key),
  start_cursor text,
  end_cursor text,
  selected_ids text[] not null default '{}',
  attempted_ids text[] not null default '{}',
  selected_count integer not null default 0 check(selected_count>=0),
  attempted_count integer not null default 0 check(attempted_count>=0),
  succeeded_count integer not null default 0 check(succeeded_count>=0),
  status text not null check(status in ('RUNNING','COMPLETE','FAILED','RECOVERY_AUTHORIZED')),
  failed_opportunity_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check(selected_count=cardinality(selected_ids)),
  check(attempted_count=cardinality(attempted_ids)),
  check(attempted_count between succeeded_count and selected_count),
  check(attempted_ids<@selected_ids)
);

create table public.private_matching_c4_reconciliation_outcomes (
  bucket_key text not null references public.private_matching_c4_reconciliation_sources(bucket_key),
  outcome_kind text not null check(outcome_kind in ('ROUTING','FINAL_STATE','FIRST_FAILURE','SOURCE_DRIFT')),
  outcome_key text not null,
  member_count bigint not null check(member_count>0),
  primary key(bucket_key,outcome_kind,outcome_key)
);

alter table public.private_matching_c4_reconciliation_runs enable row level security;
alter table public.private_matching_c4_reconciliation_sources enable row level security;
alter table public.private_matching_c4_reconciliation_members enable row level security;
alter table public.private_matching_c4_reconciliation_batches enable row level security;
alter table public.private_matching_c4_reconciliation_outcomes enable row level security;
revoke all on public.private_matching_c4_reconciliation_runs,
  public.private_matching_c4_reconciliation_sources,
  public.private_matching_c4_reconciliation_members,
  public.private_matching_c4_reconciliation_batches,
  public.private_matching_c4_reconciliation_outcomes from public,anon,authenticated;
grant select on public.private_matching_c4_reconciliation_runs,
  public.private_matching_c4_reconciliation_sources,
  public.private_matching_c4_reconciliation_members,
  public.private_matching_c4_reconciliation_batches,
  public.private_matching_c4_reconciliation_outcomes to service_role;

create or replace function public.prepare_private_matching_c4_reconciliation()
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  v_snapshot timestamptz;
  v_digests jsonb;
  v_total bigint;
  v_resolved bigint;
  v_review bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('private_matching_c4_reconciliation',0));
  if exists(select 1 from public.private_matching_c4_reconciliation_runs where run_key='C4_20261011') then
    return (select jsonb_build_object('run_key',run_key,'snapshot_at',snapshot_at,'status',status,
      'total_members',total_members,'resolved_members',resolved_members,
      'identity_review_members',identity_review_members,'idempotency','IMMUTABLE_EXISTING_MEMBERSHIP')
      from public.private_matching_c4_reconciliation_runs where run_key='C4_20261011');
  end if;

  -- A short lock makes the INSERT...SELECT membership one exact inventory cut.
  -- Batches never hold this lock and never reselect membership from Truth.
  lock table public.opportunities in share mode;
  v_snapshot:=clock_timestamp();
  v_digests:=public.private_matching_c4_contract_digests();
  insert into public.private_matching_c4_reconciliation_runs(
    run_key,snapshot_at,status,permission_global_digest,permission_global_rows,
    permission_recruiter_digest,permission_recruiter_rows,source_policy_digest,
    source_policy_rows,alias_digest,alias_rows)
  values('C4_20261011',v_snapshot,'PREPARING',
    v_digests->>'permission_global_digest',(v_digests->>'permission_global_rows')::bigint,
    v_digests->>'permission_recruiter_digest',(v_digests->>'permission_recruiter_rows')::bigint,
    v_digests->>'source_policy_digest',(v_digests->>'source_policy_rows')::bigint,
    v_digests->>'alias_digest',(v_digests->>'alias_rows')::bigint);

  insert into public.private_matching_c4_reconciliation_members(
    opportunity_id,run_key,bucket_key,snapshot_raw_source,snapshot_normalized_source,
    snapshot_canonical_source,identity_state,identity_reason,snapshot_created_at,
    processing_state,before_lifecycle_state,before_final_matching_state,
    before_catalog_state,before_alerts_state,before_seo_state)
  select o.id::text,'C4_20261011',
    case when identity.value->>'state'='RESOLVED' then 'SOURCE:'||(identity.value->>'canonical_source')
      else 'IDENTITY_REVIEW:'||(identity.value->>'state')||':'||coalesce(identity.value->>'normalized_source','<missing>') end,
    o.source,identity.value->>'normalized_source',identity.value->>'canonical_source',
    identity.value->>'state',identity.value->>'reason',o.created_at,
    case when identity.value->>'state'='RESOLVED' then 'PENDING' else 'BLOCKED_IDENTITY' end,
    coalesce(u.lifecycle_state,'MISSING'),coalesce(u.final_matching_state,'MISSING'),
    coalesce(u.catalog_state,'MISSING'),coalesce(u.alerts_state,'MISSING'),coalesce(u.seo_state,'MISSING')
  from public.opportunities o
  cross join lateral (select public.private_matching_c4_source_identity(o.source) value) identity
  left join public.opportunity_universe_state u on u.opportunity_id=o.id::text;

  insert into public.private_matching_c4_reconciliation_sources(
    bucket_key,run_key,canonical_source,identity_state,identity_reason,status,total_rows)
  select bucket_key,'C4_20261011',snapshot_canonical_source,identity_state,
    min(identity_reason),case when identity_state='RESOLVED' then 'PENDING' else 'BLOCKED_IDENTITY' end,count(*)
  from public.private_matching_c4_reconciliation_members
  where run_key='C4_20261011'
  group by bucket_key,snapshot_canonical_source,identity_state;

  select count(*),count(*) filter(where identity_state='RESOLVED'),
    count(*) filter(where identity_state<>'RESOLVED')
    into v_total,v_resolved,v_review
  from public.private_matching_c4_reconciliation_members where run_key='C4_20261011';
  if v_total<>(select count(*) from public.opportunities) then
    raise exception 'snapshot_membership_denominator_mismatch:%:%',v_total,(select count(*) from public.opportunities);
  end if;
  update public.private_matching_c4_reconciliation_runs set status='PREPARED',
    total_members=v_total,resolved_members=v_resolved,identity_review_members=v_review,
    updated_at=clock_timestamp() where run_key='C4_20261011';
  return jsonb_build_object('run_key','C4_20261011','snapshot_at',v_snapshot,'status','PREPARED',
    'total_members',v_total,'resolved_members',v_resolved,'identity_review_members',v_review,
    'membership','IMMUTABLE_BY_OPPORTUNITY_ID');
end $$;

create or replace function public.resume_private_matching_c4_failed_source(
  p_bucket_key text,p_expected_attempts integer,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.private_matching_c4_reconciliation_sources%rowtype; v_batch_id bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'recovery_note_required'; end if;
  select * into v_job from public.private_matching_c4_reconciliation_sources
    where bucket_key=p_bucket_key for update;
  if not found then raise exception 'reconciliation_source_not_found'; end if;
  if v_job.status<>'FAILED' then raise exception 'source_not_failed:%',v_job.status; end if;
  if v_job.attempts<>p_expected_attempts then raise exception 'stale_recovery_attempt_count:%',v_job.attempts; end if;
  insert into public.private_matching_c4_reconciliation_batches(
    run_key,bucket_key,start_cursor,status,error_message,completed_at)
  values(v_job.run_key,v_job.bucket_key,v_job.cursor_id,'RECOVERY_AUTHORIZED',left(trim(p_note),500),clock_timestamp())
  returning batch_id into v_batch_id;
  update public.private_matching_c4_reconciliation_sources set
    status=case when processed_rows=total_rows then 'COMPLETE' else 'PENDING' end,
    recovery_count=recovery_count+1,last_recovery_note=left(trim(p_note),500),
    last_recovery_at=clock_timestamp(),last_batch_id=v_batch_id,updated_at=clock_timestamp()
  where bucket_key=v_job.bucket_key;
  update public.private_matching_c4_reconciliation_runs set status='RUNNING',updated_at=clock_timestamp()
    where run_key=v_job.run_key;
  return jsonb_build_object('bucket_key',v_job.bucket_key,'status','PENDING',
    'cursor_unchanged',v_job.cursor_id,'processed_rows',v_job.processed_rows,
    'attempts_unchanged',v_job.attempts,'recovery_batch_id',v_batch_id);
end $$;

create or replace function public.reconcile_private_matching_c4_batch(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_job public.private_matching_c4_reconciliation_sources%rowtype;
  v_member public.private_matching_c4_reconciliation_members%rowtype;
  v_after public.opportunity_universe_state%rowtype;
  v_run public.private_matching_c4_reconciliation_runs%rowtype;
  v_ids text[]:='{}';
  v_attempted_ids text[]:='{}';
  v_selected integer:=0;
  v_attempted integer:=0;
  v_succeeded integer:=0;
  v_changed integer:=0;
  v_batch_id bigint;
  v_id text;
  v_refresh jsonb;
  v_current_source text;
  v_current_identity jsonb;
  v_first_failure text;
  v_source_drift boolean;
  v_new_processed bigint;
  v_new_status text;
  v_pending_sources integer;
  v_failed_sources integer;
  v_identity_review bigint;
  v_digests jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required'; end if;
  if p_limit<1 or p_limit>250 then raise exception 'page_size_out_of_range'; end if;
  select * into strict v_run from public.private_matching_c4_reconciliation_runs
    where run_key='C4_20261011' for update;
  if exists(select 1 from public.private_matching_c4_reconciliation_sources where status='FAILED') then
    return jsonb_build_object('done',false,'status','STOP_FAILED_SOURCE',
      'failed_sources',(select jsonb_agg(jsonb_build_object('bucket_key',bucket_key,
        'cursor',cursor_id,'attempts',attempts,'last_error',last_error) order by bucket_key)
        from public.private_matching_c4_reconciliation_sources where status='FAILED'),
      'recovery','CALL_resume_private_matching_c4_failed_source');
  end if;
  v_digests:=public.private_matching_c4_contract_digests();
  if v_digests->>'permission_global_digest'<>v_run.permission_global_digest
    or (v_digests->>'permission_global_rows')::bigint<>v_run.permission_global_rows
    or v_digests->>'permission_recruiter_digest'<>v_run.permission_recruiter_digest
    or (v_digests->>'permission_recruiter_rows')::bigint<>v_run.permission_recruiter_rows
    or v_digests->>'source_policy_digest'<>v_run.source_policy_digest
    or (v_digests->>'source_policy_rows')::bigint<>v_run.source_policy_rows then
    return jsonb_build_object('done',false,'status','STOP_CONTRACT_DIGEST_DRIFT',
      'cursor_unchanged',true,'processed_unchanged',true,
      'permission_global_matches',v_digests->>'permission_global_digest'=v_run.permission_global_digest
        and (v_digests->>'permission_global_rows')::bigint=v_run.permission_global_rows,
      'permission_recruiter_matches',v_digests->>'permission_recruiter_digest'=v_run.permission_recruiter_digest
        and (v_digests->>'permission_recruiter_rows')::bigint=v_run.permission_recruiter_rows,
      'source_policy_matches',v_digests->>'source_policy_digest'=v_run.source_policy_digest
        and (v_digests->>'source_policy_rows')::bigint=v_run.source_policy_rows);
  end if;

  select * into v_job from public.private_matching_c4_reconciliation_sources
  where status in ('PENDING','RUNNING') and identity_state='RESOLVED'
  order by case status when 'RUNNING' then 0 else 1 end,updated_at,bucket_key
  limit 1 for update skip locked;
  if not found then
    select count(*) filter(where status in ('PENDING','RUNNING')),
      count(*) filter(where status='FAILED') into v_pending_sources,v_failed_sources
    from public.private_matching_c4_reconciliation_sources where identity_state='RESOLVED';
    select identity_review_members into v_identity_review from public.private_matching_c4_reconciliation_runs
      where run_key='C4_20261011';
    v_new_status:=case when v_failed_sources>0 then 'FAILED'
      when v_pending_sources>0 then 'RUNNING'
      when v_identity_review>0 then 'COMPLETE_WITH_IDENTITY_REVIEW' else 'COMPLETE' end;
    update public.private_matching_c4_reconciliation_runs set status=v_new_status,
      completed_at=case when v_new_status in ('COMPLETE','COMPLETE_WITH_IDENTITY_REVIEW') then clock_timestamp() else null end,
      updated_at=clock_timestamp() where run_key='C4_20261011';
    return jsonb_build_object('done',v_pending_sources=0 and v_failed_sources=0,
      'status',v_new_status,'pending_sources',v_pending_sources,'failed_sources',v_failed_sources,
      'identity_review_members',v_identity_review);
  end if;

  select coalesce(array_agg(opportunity_id order by opportunity_id),'{}'::text[]) into v_ids
  from (select opportunity_id from public.private_matching_c4_reconciliation_members
    where bucket_key=v_job.bucket_key and processing_state='PENDING'
    order by opportunity_id limit p_limit) page;
  v_selected:=cardinality(v_ids);
  if v_selected=0 then
    v_new_status:=case when v_job.processed_rows=v_job.total_rows then 'COMPLETE' else 'FAILED' end;
    if v_new_status='FAILED' then
      insert into public.private_matching_c4_reconciliation_batches(
        run_key,bucket_key,start_cursor,status,error_code,error_message,completed_at)
      values(v_job.run_key,v_job.bucket_key,v_job.cursor_id,'FAILED','C4DENOM',
        'MEMBERSHIP_DENOMINATOR_MISMATCH',clock_timestamp())
      returning batch_id into v_batch_id;
    end if;
    update public.private_matching_c4_reconciliation_sources set status=v_new_status,
      last_error=case when v_new_status='FAILED' then 'MEMBERSHIP_DENOMINATOR_MISMATCH' else last_error end,
      last_batch_id=case when v_new_status='FAILED' then v_batch_id else last_batch_id end,
      completed_at=case when v_new_status='COMPLETE' then clock_timestamp() else null end,
      updated_at=clock_timestamp() where bucket_key=v_job.bucket_key;
    if v_new_status='FAILED' then
      update public.private_matching_c4_reconciliation_runs set status='FAILED',updated_at=clock_timestamp()
        where run_key=v_job.run_key;
    end if;
    return jsonb_build_object('done',false,'bucket_key',v_job.bucket_key,'status',v_new_status,
      'cursor_unchanged',v_job.cursor_id,'selected',0,'processed',v_job.processed_rows,'total',v_job.total_rows);
  end if;

  insert into public.private_matching_c4_reconciliation_batches(
    run_key,bucket_key,start_cursor,selected_ids,selected_count,status)
  values(v_job.run_key,v_job.bucket_key,v_job.cursor_id,v_ids,v_selected,'RUNNING')
  returning batch_id into v_batch_id;
  update public.private_matching_c4_reconciliation_sources set status='RUNNING',
    attempts=attempts+1,last_batch_id=v_batch_id,updated_at=clock_timestamp()
    where bucket_key=v_job.bucket_key;
  update public.private_matching_c4_reconciliation_runs set status='RUNNING',updated_at=clock_timestamp()
    where run_key=v_job.run_key;

  begin
    foreach v_id in array v_ids loop
      v_attempted:=v_attempted+1;
      v_attempted_ids:=array_append(v_attempted_ids,v_id);
      select * into strict v_member from public.private_matching_c4_reconciliation_members
        where opportunity_id=v_id and bucket_key=v_job.bucket_key and processing_state='PENDING'
        for update;
      select o.source into v_current_source from public.opportunities o where o.id::text=v_id;
      if not found then raise exception 'snapshot_member_opportunity_missing:%',v_id; end if;
      v_current_identity:=public.private_matching_c4_source_identity(v_current_source);
      if v_current_identity->>'state'<>'RESOLVED' then
        raise exception 'current_source_identity_unresolved:%:%',v_id,v_current_identity->>'reason';
      end if;
      v_source_drift:=coalesce(v_current_identity->>'canonical_source','')<>
        coalesce(v_member.snapshot_canonical_source,'') or
        coalesce(v_current_identity->>'normalized_source','')<>
        coalesce(v_member.snapshot_normalized_source,'');
      v_refresh:=public.refresh_opportunity_universe(v_id,false);
      if v_refresh is null then raise exception 'refresh_returned_null:%',v_id; end if;
      select * into v_after from public.opportunity_universe_state where opportunity_id=v_id;
      if not found then raise exception 'derived_universe_missing_after_refresh:%',v_id; end if;
      if v_after.lifecycle_state not in ('ACTIVE_VALID','EXPIRED','DELETED','ARCHIVED','HARD_DEAD',
          'SUPERSEDED_DUPLICATE','INACTIVE_VALID','STALE_DERIVED_STATE','LIFECYCLE_UNKNOWN')
        or v_after.final_matching_state not in ('READY','NOT_READY','UNKNOWN')
        or v_after.source_matching_state not in ('ALLOWED','DENIED','UNKNOWN')
        or v_after.source_matching_operational_state not in ('ALLOWED','DENIED','UNKNOWN')
        or v_after.source_operational_state not in ('ENABLED','DISABLED','UNKNOWN','CONFLICT') then
        raise exception 'derived_universe_invalid_state:%',v_id;
      end if;
      if v_after.final_matching_state='READY' and (v_after.lifecycle_state<>'ACTIVE_VALID'
        or v_after.source_matching_state='DENIED'
        or v_after.source_matching_operational_state='DENIED'
        or v_after.source_operational_state in ('DISABLED','CONFLICT')) then
        raise exception 'derived_universe_gate_violation:%',v_id;
      end if;
      if v_refresh->>'lifecycle_state' is distinct from v_after.lifecycle_state
        or v_refresh->>'final_matching_state' is distinct from v_after.final_matching_state then
        raise exception 'refresh_result_persistence_mismatch:%',v_id;
      end if;
      if (v_member.before_catalog_state<>'READY' and v_after.catalog_state='READY')
        or (v_member.before_alerts_state<>'READY' and v_after.alerts_state='READY')
        or (v_member.before_seo_state<>'READY' and v_after.seo_state='READY') then
        raise exception 'public_consumer_promotion_blocked:%',v_id;
      end if;
      v_first_failure:=coalesce(v_after.provenance->'private_matching_contract'->>'first_failure',
        case when v_after.lifecycle_state<>'ACTIVE_VALID' then 'LIFECYCLE_'||v_after.lifecycle_state||':'||v_after.lifecycle_reason
          when v_after.matching_row_state<>'READY' then 'MATCH_ROW_'||v_after.matching_row_state||':'||v_after.matching_row_reason
          else 'FINAL_MATCHING_'||v_after.final_matching_state end);
      update public.private_matching_c4_reconciliation_members set
        processing_state='COMPLETE',attempt_count=attempt_count+1,completion_count=completion_count+1,
        after_lifecycle_state=v_after.lifecycle_state,after_final_matching_state=v_after.final_matching_state,
        after_first_failure=v_first_failure,after_catalog_state=v_after.catalog_state,
        after_alerts_state=v_after.alerts_state,after_seo_state=v_after.seo_state,
        current_raw_source=v_current_source,current_canonical_source=v_current_identity->>'canonical_source',
        source_identity_drift=v_source_drift,
        final_state_changed=before_final_matching_state is distinct from v_after.final_matching_state,
        completed_at=clock_timestamp()
      where opportunity_id=v_id and processing_state='PENDING' and completion_count=0;
      if not found then raise exception 'member_completion_conflict:%',v_id; end if;
      v_succeeded:=v_succeeded+1;
      if v_member.before_final_matching_state is distinct from v_after.final_matching_state then v_changed:=v_changed+1; end if;
      insert into public.private_matching_c4_reconciliation_outcomes(bucket_key,outcome_kind,outcome_key,member_count)
        values(v_job.bucket_key,'ROUTING',case when v_after.final_matching_state='READY' then 'ADMITTED' else 'EXCLUDED' end,1),
          (v_job.bucket_key,'FINAL_STATE',v_after.final_matching_state,1),
          (v_job.bucket_key,'FIRST_FAILURE',v_first_failure,1)
        on conflict(bucket_key,outcome_kind,outcome_key) do update
          set member_count=public.private_matching_c4_reconciliation_outcomes.member_count+excluded.member_count;
      if v_source_drift then
        insert into public.private_matching_c4_reconciliation_outcomes(bucket_key,outcome_kind,outcome_key,member_count)
        values(v_job.bucket_key,'SOURCE_DRIFT',coalesce(v_member.snapshot_canonical_source,'<none>')||'->'||
          coalesce(v_current_identity->>'canonical_source','<none>'),1)
        on conflict(bucket_key,outcome_kind,outcome_key) do update
          set member_count=public.private_matching_c4_reconciliation_outcomes.member_count+excluded.member_count;
      end if;
    end loop;
    if v_attempted<>v_selected or v_succeeded<>v_selected
      or (select count(*) from public.private_matching_c4_reconciliation_members
          where opportunity_id=any(v_ids) and processing_state='COMPLETE' and completion_count=1)<>v_selected
      or (select count(*) from public.opportunity_universe_state
          where opportunity_id=any(v_ids))<>v_selected then
      raise exception 'batch_identity_or_completeness_mismatch:%:%:%',v_selected,v_attempted,v_succeeded;
    end if;

    v_new_processed:=v_job.processed_rows+v_selected;
    v_new_status:=case when v_new_processed=v_job.total_rows then 'COMPLETE' else 'RUNNING' end;
    update public.private_matching_c4_reconciliation_batches set status='COMPLETE',
      attempted_ids=v_attempted_ids,attempted_count=v_attempted,succeeded_count=v_succeeded,
      end_cursor=v_ids[v_selected],completed_at=clock_timestamp() where batch_id=v_batch_id;
    update public.private_matching_c4_reconciliation_sources set status=v_new_status,
      cursor_id=v_ids[v_selected],processed_rows=v_new_processed,changed_rows=changed_rows+v_changed,
      completed_at=case when v_new_status='COMPLETE' then clock_timestamp() else null end,
      updated_at=clock_timestamp() where bucket_key=v_job.bucket_key;
    return jsonb_build_object('done',false,'bucket_key',v_job.bucket_key,'status',v_new_status,
      'batch_id',v_batch_id,'selected',v_selected,'attempted',v_attempted,'succeeded',v_succeeded,
      'processed',v_new_processed,'total',v_job.total_rows,'changed',v_changed,
      'cursor',v_ids[v_selected]);
  exception when others then
    update public.private_matching_c4_reconciliation_batches set status='FAILED',
      attempted_ids=v_attempted_ids,attempted_count=v_attempted,succeeded_count=0,
      failed_opportunity_id=case when v_attempted>0 then v_attempted_ids[v_attempted] else null end,
      error_code=sqlstate,error_message=left(sqlerrm,500),completed_at=clock_timestamp()
      where batch_id=v_batch_id;
    update public.private_matching_c4_reconciliation_sources set status='FAILED',
      last_error=sqlstate||':'||left(sqlerrm,500),updated_at=clock_timestamp()
      where bucket_key=v_job.bucket_key;
    update public.private_matching_c4_reconciliation_runs set status='FAILED',updated_at=clock_timestamp()
      where run_key=v_job.run_key;
    return jsonb_build_object('done',false,'bucket_key',v_job.bucket_key,'status','FAILED',
      'batch_id',v_batch_id,'selected',v_selected,'attempted',v_attempted,'succeeded',0,
      'cursor_unchanged',v_job.cursor_id,'processed_unchanged',v_job.processed_rows,
      'error_code',sqlstate,'error',left(sqlerrm,500),
      'recovery','EXPLICIT_resume_private_matching_c4_failed_source_REQUIRED');
  end;
end $$;

revoke all on function public.private_matching_c4_source_identity(text) from public,anon,authenticated;
revoke all on function public.private_matching_c4_contract_digests() from public,anon,authenticated;
revoke all on function public.prepare_private_matching_c4_reconciliation() from public,anon,authenticated;
revoke all on function public.resume_private_matching_c4_failed_source(text,integer,text) from public,anon,authenticated;
revoke all on function public.reconcile_private_matching_c4_batch(integer) from public,anon,authenticated;
grant execute on function public.private_matching_c4_source_identity(text) to service_role;
grant execute on function public.private_matching_c4_contract_digests() to service_role;
grant execute on function public.prepare_private_matching_c4_reconciliation() to service_role;
grant execute on function public.resume_private_matching_c4_failed_source(text,integer,text) to service_role;
grant execute on function public.reconcile_private_matching_c4_batch(integer) to service_role;

commit;
