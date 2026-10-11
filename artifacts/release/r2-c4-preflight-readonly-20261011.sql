-- READ ONLY / STOP C4 PRE-FLIGHT. Safe to run before either proposed migration.
-- Returns schema/policy metadata and aggregate counts only; no CV, email, token
-- or applicant data is selected.
begin transaction read only;

select current_setting('server_version_num')::integer server_version_num,
  current_setting('server_version') server_version;

with required_functions(signature) as (values
  ('public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)'),
  ('public.opportunity_universe_decision_before_r2_20261009(jsonb,jsonb,jsonb,jsonb)'),
  ('public.match_opportunities(public.vector,double precision,integer)'),
  ('public.opportunity_requirements_text(jsonb)'),
  ('public.controlled_opportunity_producer(text)'),
  ('public.refresh_opportunity_universe(text,boolean)'),
  ('public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text,text)'),
  ('public.close_recruiter_vacancy_atomic(text,uuid)'),
  ('public.sync_recruiter_vacancy_mirror(uuid,text)')
)
select signature,to_regprocedure(signature) is not null present from required_functions order by signature;

select e.extname,n.nspname extension_schema,e.extversion,
  to_regtype('public.vector')::text public_vector,
  to_regtype('extensions.vector')::text extensions_vector
from pg_extension e join pg_namespace n on n.oid=e.extnamespace
where e.extname='vector';

select o.oid,o.oid::regoperator exact_operator,
  o.oprleft::regtype left_type,o.oprright::regtype right_type,o.oprresult::regtype result_type,
  count(*) over() compatible_operator_count
from pg_operator o
where o.oprnamespace='public'::regnamespace and o.oprname='<=>'
  and o.oprleft=to_regtype('public.vector') and o.oprright=to_regtype('public.vector')
  and o.oprresult='double precision'::regtype;

with target as (
  select to_regprocedure('public.match_opportunities(public.vector,double precision,integer)')::oid oid
), contract as (
  select p.oid,p.oid::regprocedure exact_regprocedure,
    pg_get_function_identity_arguments(p.oid) identity_arguments,
    pg_get_function_arguments(p.oid) arguments_with_defaults,
    pg_get_function_result(p.oid) function_result,p.proretset,p.prosecdef,
    l.lanname,p.provolatile,p.proparallel,p.proisstrict,p.proleakproof,p.proconfig,
    p.pronargs,p.pronargdefaults,p.proargnames,pg_get_expr(p.proargdefaults,0) argument_defaults,
    pg_get_userbyid(p.proowner) owner,p.proacl,
    md5(coalesce(p.proacl::text,'DEFAULT_ACL')) acl_digest,
    has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
  from target t join pg_proc p on p.oid=t.oid join pg_language l on l.oid=p.prolang
)
select c.*,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='match_opportunities') overload_count,
  (c.pronargs=3 and c.pronargdefaults=2
    and c.proargnames[1:3]=array['query_embedding','match_threshold','match_count']::text[]
    and regexp_replace(c.argument_defaults,'\s+','','g')='0.3,20') arguments_compatible,
  c.function_result=
    'TABLE(id text, title text, organization text, location text, rubro text, tags text[], description text, application_url text, source text, similarity double precision)' result_compatible,
  (c.lanname='sql' and c.proretset and not c.prosecdef and c.provolatile='s' and c.proparallel='u'
    and not c.proisstrict and not c.proleakproof and c.service_execute) structural_contract_compatible,
  case
    when c.service_execute and c.anon_execute and c.authenticated_execute
      and c.acl_digest='791d2b1e22edbb03f97770724fbb588b' then 'ACL_REMEDIATION_REQUIRED'
    when c.service_execute and not c.anon_execute and not c.authenticated_execute then 'HARDENED'
    else 'ACL_UNEXPECTED' end acl_state,
  '791d2b1e22edbb03f97770724fbb588b' authorized_input_acl_digest
from contract c;

with target as (
  select p.oid,p.proowner,p.proacl
  from pg_proc p
  where p.oid=to_regprocedure('public.match_opportunities(public.vector,double precision,integer)')
), roles as (
  select (select oid from pg_roles where rolname='anon') anon_oid,
    (select oid from pg_roles where rolname='authenticated') authenticated_oid,
    (select oid from pg_roles where rolname='service_role') service_oid
), baseline_acl as (
  select acl.* from target t
  cross join lateral aclexplode(coalesce(t.proacl,acldefault('f',t.proowner))) acl
), expected_rows as (
  select b.grantee,bool_or(b.is_grantable) is_grantable
  from baseline_acl b cross join roles r
  where b.privilege_type='EXECUTE'
    and b.grantee not in (0,r.anon_oid,r.authenticated_oid,r.service_oid)
  group by b.grantee
  union all
  select r.service_oid,coalesce((select bool_or(b.is_grantable) from baseline_acl b
    where b.privilege_type='EXECUTE' and b.grantee=r.service_oid),false)
  from roles r
)
select (select md5(coalesce(t.proacl::text,'DEFAULT_ACL')) from target t) input_acl_digest,
  md5(coalesce(string_agg(grantee::text||':'||is_grantable::text,E'\n'
    order by grantee),'')) expected_output_acl_contract_digest,
  jsonb_agg(jsonb_build_object('grantee',grantee,'is_grantable',is_grantable)
    order by grantee) expected_output_acl_contract,
  'REMOVE_EFFECTIVE_EXECUTE_PUBLIC_ANON_AUTHENTICATED_ONLY' authorized_delta
from expected_rows;

select p.oid,p.oid::regprocedure exact_regprocedure,pg_get_userbyid(p.proowner) owner,
  md5(coalesce(p.proacl::text,'DEFAULT_ACL')) acl_digest,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_proc p
where p.oid=to_regprocedure('public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)');

select c.oid,c.oid::regclass exact_relation,pg_get_userbyid(c.relowner) owner,
  c.reloptions,md5(coalesce(c.relacl::text,'DEFAULT_ACL')) acl_digest,
  has_table_privilege('service_role',c.oid,'SELECT') service_select,
  has_table_privilege('anon',c.oid,'SELECT') anon_select,
  has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,
  (select jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum)
    from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns_contract,
  (select coalesce(jsonb_agg(pg_describe_object(d.classid,d.objid,d.objsubid)
      order by pg_describe_object(d.classid,d.objid,d.objsubid)),'[]'::jsonb)
    from pg_depend d where d.refclassid='pg_class'::regclass and d.refobjid=c.oid
      and d.deptype<>'i' and not (d.classid='pg_rewrite'::regclass and d.objid in
        (select r.oid from pg_rewrite r where r.ev_class=c.oid))) external_dependents
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='opportunity_final_matching_universe' and c.relkind='v';

with target as (
  select to_regprocedure('public.match_opportunities(public.vector,double precision,integer)')::oid oid
)
select d.deptype,d.refclassid::regclass referenced_catalog,
  case d.refclassid
    when 'pg_type'::regclass then d.refobjid::regtype::text
    when 'pg_namespace'::regclass then (select n.nspname from pg_namespace n where n.oid=d.refobjid)
    when 'pg_language'::regclass then (select l.lanname from pg_language l where l.oid=d.refobjid)
    else d.refobjid::text
  end referenced_object
from target t join pg_depend d on d.classid='pg_proc'::regclass and d.objid=t.oid
order by d.refclassid::regclass::text,referenced_object,d.deptype;

with required_columns(table_name,column_name,data_type) as (values
  ('recruiter_vacancies','id','uuid'),('recruiter_vacancies','recruiter_token_id','uuid'),
  ('recruiter_vacancies','title','text'),('recruiter_vacancies','description','text'),
  ('recruiter_vacancies','requirements','text'),('recruiter_vacancies','location','text'),
  ('recruiter_vacancies','modality','text'),('recruiter_vacancies','salary_range','text'),
  ('recruiter_vacancies','slug','text'),('recruiter_vacancies','is_active','boolean'),
  ('opportunities','id','text'),('opportunities','recruiter_vacancy_id','uuid'),
  ('opportunities','created_at','timestamp with time zone'),
  ('opportunities','requirements','jsonb'),('opportunities','value','text'),
  ('opportunity_universe_state','final_matching_state','text'))
select r.*,c.data_type actual_type,(c.column_name is not null and c.data_type=r.data_type) compatible
from required_columns r left join information_schema.columns c
  on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
order by r.table_name,r.column_name;

select c.relname relation,c.relkind,c.relrowsecurity,
  has_table_privilege('service_role',c.oid,'SELECT') service_select,
  has_table_privilege('service_role',c.oid,'INSERT') service_insert,
  has_table_privilege('service_role',c.oid,'UPDATE') service_update
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'recruiter_tokens','recruiter_vacancies','recruiter_vacancy_operations','opportunities',
  'opportunity_universe_state','opportunity_source_consumer_permissions','opportunity_sources',
  'recruiter_vacancy_mutation_operations','recruiter_seo_plus_requests','recruiter_seo_plus_events')
order by c.relname;

select event_object_table,trigger_name,action_timing,event_manipulation,action_statement
from information_schema.triggers
where event_object_schema='public' and event_object_table in ('opportunities','recruiter_vacancies')
order by event_object_table,action_timing,trigger_name,event_manipulation;

select dependent_ns.nspname||'.'||dependent.relname dependent_relation,
  source_ns.nspname||'.'||source.relname source_relation
from pg_rewrite rw
join pg_class dependent on dependent.oid=rw.ev_class
join pg_namespace dependent_ns on dependent_ns.oid=dependent.relnamespace
join pg_depend d on d.objid=rw.oid and d.classid='pg_rewrite'::regclass
join pg_class source on source.oid=d.refobjid
join pg_namespace source_ns on source_ns.oid=source.relnamespace
where dependent_ns.nspname='public' and dependent.relname='opportunity_final_matching_universe'
order by source_relation;

select count(*) recruiter_vacancies,
  count(*) filter(where r.is_active) recruiter_open,
  count(*) filter(where not r.is_active) recruiter_closed,
  count(o.id) mirrors,
  count(*) filter(where r.recruiter_token_id is null or t.id is null) owner_missing
from public.recruiter_vacancies r
left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
left join public.opportunities o on o.recruiter_vacancy_id=r.id;

select count(*) opportunity_denominator,
  count(*) filter(where nullif(lower(trim(source)),'') is null) missing_source_identity,
  count(*) filter(where created_at is null) missing_created_at
from public.opportunities;

select md5(coalesce(string_agg(to_jsonb(p)::text,E'\n'
    order by p.canonical_source,p.consumer,to_jsonb(p)::text),'')) permission_global_digest,
  count(*) permission_global_rows,
  md5(coalesce(string_agg(to_jsonb(p)::text,E'\n'
    order by p.canonical_source,p.consumer,to_jsonb(p)::text)
    filter(where p.canonical_source='recruiter_b2b'),'')) permission_recruiter_digest,
  count(*) filter(where p.canonical_source='recruiter_b2b') permission_recruiter_rows
from public.opportunity_source_consumer_permissions p;

select md5(coalesce(string_agg(to_jsonb(s)::text,E'\n'
    order by lower(s.source),to_jsonb(s)::text),'')) source_policy_digest,
  count(*) source_policy_rows
from public.opportunity_sources s;

select 'c6dcc71299db2237f17d455729d238a7' legacy_recruiter_reference_digest,
  'REFERENCE_ONLY_DIFFERENT_HISTORICAL_ALGORITHM_NOT_COMPARABLE' comparison_rule;

select jsonb_build_object(
  'c4_objects_already_present',jsonb_build_object(
    'decision_backup',to_regprocedure('public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)') is not null,
    'matching_rpc_backup',to_regprocedure('public.match_opportunities_before_c4_20261011(public.vector,double precision,integer)') is not null,
    'reconciliation_table',to_regclass('public.private_matching_c4_reconciliation_sources') is not null,
    'reconciliation_prepare_rpc',to_regprocedure('public.prepare_private_matching_c4_reconciliation()') is not null,
    'reconciliation_batch_rpc',to_regprocedure('public.reconcile_private_matching_c4_batch(integer)') is not null,
    'update_rpc',to_regprocedure('public.update_recruiter_vacancy_atomic(text,uuid,text,text,text,text,text,text,text)') is not null,
    'seo_request_rpc',to_regprocedure('public.request_recruiter_seo_plus(text,uuid,text,boolean,text)') is not null,
    'seo_requests_table',to_regclass('public.recruiter_seo_plus_requests') is not null),
  'stop_if_any_required_function_or_column_is_missing','YES',
  'expected_historical_contract','8 vacancies / 5 mirrors / 3 owner missing; no row changes by C4 migrations') result;

-- Consolidated pre-apply decision. It uses catalog identity/dependencies rather
-- than rendered view SQL, and it expects every C4-001 object to be absent.
with required_functions(signature) as (values
  ('public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)'),
  ('public.match_opportunities(public.vector,double precision,integer)'),
  ('public.refresh_opportunity_universe(text,boolean)'),
  ('public.canonical_opportunity_source_policy(text)')
), function_check as (
  select count(*) filter(where to_regprocedure(signature) is null) missing
  from required_functions
), required_columns(table_name,column_name) as (values
  ('opportunities','id'),('opportunities','source'),('opportunities','created_at'),
  ('opportunity_universe_state','opportunity_id'),('opportunity_universe_state','lifecycle_state'),
  ('opportunity_universe_state','final_matching_state'),('opportunity_universe_state','catalog_state'),
  ('opportunity_universe_state','alerts_state'),('opportunity_universe_state','seo_state'),
  ('opportunity_source_identity_aliases','emitted_source'),
  ('opportunity_source_identity_aliases','canonical_source')
), column_check as (
  select count(*) filter(where c.column_name is null) missing
  from required_columns r left join information_schema.columns c
    on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
), vector_check as (
  select count(*) compatible_operators from pg_operator o
  where o.oprnamespace='public'::regnamespace and o.oprname='<=>'
    and o.oprleft=to_regtype('public.vector') and o.oprright=to_regtype('public.vector')
    and o.oprresult='double precision'::regtype
), rpc_check as (
  select count(*) filter(where p.pronargs=3 and p.pronargdefaults=2 and not p.prosecdef
      and pg_get_function_result(p.oid)=
        'TABLE(id text, title text, organization text, location text, rubro text, tags text[], description text, application_url text, source text, similarity double precision)'
      and has_function_privilege('service_role',p.oid,'EXECUTE')) structural_compatible,
    count(*) functions,
    bool_or(has_function_privilege('service_role',p.oid,'EXECUTE')) service_execute,
    bool_or(has_function_privilege('anon',p.oid,'EXECUTE')) anon_execute,
    bool_or(has_function_privilege('authenticated',p.oid,'EXECUTE')) authenticated_execute,
    max(md5(coalesce(p.proacl::text,'DEFAULT_ACL'))) input_acl_digest
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='match_opportunities'
), view_check as (
  select count(*) filter(where c.relkind='v'
      and 'security_invoker=true'=any(coalesce(c.reloptions,'{}'::text[]))
      and has_table_privilege('service_role',c.oid,'SELECT')
      and not has_table_privilege('anon',c.oid,'SELECT')
      and not has_table_privilege('authenticated',c.oid,'SELECT')
      and exists(select 1 from pg_rewrite r join pg_depend d
        on d.classid='pg_rewrite'::regclass and d.objid=r.oid
        where r.ev_class=c.oid and d.refclassid='pg_class'::regclass
          and d.refobjid='public.opportunities'::regclass)
      and exists(select 1 from pg_rewrite r join pg_depend d
        on d.classid='pg_rewrite'::regclass and d.objid=r.oid
        where r.ev_class=c.oid and d.refclassid='pg_class'::regclass
          and d.refobjid='public.opportunity_universe_state'::regclass)
      and exists(select 1 from pg_rewrite r join pg_depend d
        on d.classid='pg_rewrite'::regclass and d.objid=r.oid
        join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
        where r.ev_class=c.oid and d.refclassid='pg_class'::regclass
          and d.refobjid='public.opportunity_universe_state'::regclass
          and a.attname='final_matching_state')) compatible
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='opportunity_final_matching_universe'
), identity_check as (
  select (select count(*) from (select o.id::text from public.opportunities o
      group by o.id::text having count(*)>1) d) duplicate_opportunity_ids,
    (select count(*) from (select a.emitted_source from public.opportunity_source_identity_aliases a
      group by a.emitted_source
      having count(*)>1 or count(distinct a.canonical_source)>1) d) ambiguous_aliases
), c4_check as (
  select
    (case when to_regprocedure('public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)') is null then 0 else 1 end
    +case when to_regprocedure('public.match_opportunities_before_c4_20261011(public.vector,double precision,integer)') is null then 0 else 1 end
    +case when to_regprocedure('public.private_matching_c4_source_identity(text)') is null then 0 else 1 end
    +case when to_regprocedure('public.private_matching_c4_contract_digests()') is null then 0 else 1 end
    +case when to_regprocedure('public.prepare_private_matching_c4_reconciliation()') is null then 0 else 1 end
    +case when to_regprocedure('public.resume_private_matching_c4_failed_source(text,integer,text)') is null then 0 else 1 end
    +case when to_regprocedure('public.reconcile_private_matching_c4_batch(integer)') is null then 0 else 1 end
    +case when to_regclass('public.private_matching_c4_reconciliation_runs') is null then 0 else 1 end
    +case when to_regclass('public.private_matching_c4_reconciliation_sources') is null then 0 else 1 end
    +case when to_regclass('public.private_matching_c4_reconciliation_members') is null then 0 else 1 end
    +case when to_regclass('public.private_matching_c4_reconciliation_batches') is null then 0 else 1 end
    +case when to_regclass('public.private_matching_c4_reconciliation_outcomes') is null then 0 else 1 end) existing_objects
), historical as (
  select count(*) vacancies,count(o.id) mirrors,
    count(*) filter(where r.recruiter_token_id is null or t.id is null) owner_missing
  from public.recruiter_vacancies r
  left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
  left join public.opportunities o on o.recruiter_vacancy_id=r.id and o.source='recruiter_b2b'
), checks as (
  select function_check.missing missing_functions,column_check.missing missing_columns,
    vector_check.compatible_operators,rpc_check.structural_compatible rpc_structural_compatible,
    rpc_check.functions rpc_overloads,rpc_check.input_acl_digest,
    rpc_check.service_execute,rpc_check.anon_execute,rpc_check.authenticated_execute,
    case
      when rpc_check.service_execute and rpc_check.anon_execute and rpc_check.authenticated_execute
        and rpc_check.input_acl_digest='791d2b1e22edbb03f97770724fbb588b' then 'ACL_REMEDIATION_REQUIRED'
      when rpc_check.service_execute and not rpc_check.anon_execute and not rpc_check.authenticated_execute then 'HARDENED'
      else 'ACL_UNEXPECTED' end rpc_acl_state,
    view_check.compatible view_compatible,identity_check.*,c4_check.existing_objects,historical.*
  from function_check cross join column_check cross join vector_check cross join rpc_check
    cross join view_check cross join identity_check cross join c4_check cross join historical
)
select case when missing_functions=0 and missing_columns=0 and compatible_operators=1
    and rpc_structural_compatible=1 and rpc_overloads=1 and view_compatible=1
    and duplicate_opportunity_ids=0 and ambiguous_aliases=0 and existing_objects=0
    and vacancies=8 and mirrors=5 and owner_missing=3
  then case rpc_acl_state when 'ACL_REMEDIATION_REQUIRED' then 'ACL_REMEDIATION_REQUIRED'
    when 'HARDENED' then 'PASS' else 'STOP' end
  else 'STOP' end final_result,to_jsonb(checks) evidence
from checks;

rollback;
