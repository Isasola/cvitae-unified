-- READ ONLY / run immediately after separately authorized 202610110001.
begin transaction read only;

select to_regprocedure('public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)') is not null decision_backup,
  to_regprocedure('public.match_opportunities_before_c4_20261011(public.vector,double precision,integer)') is not null matching_rpc_backup;

select to_regclass('public.private_matching_c4_reconciliation_runs') is not null reconciliation_runs,
  to_regclass('public.private_matching_c4_reconciliation_sources') is not null reconciliation_sources,
  to_regclass('public.private_matching_c4_reconciliation_members') is not null reconciliation_members,
  to_regclass('public.private_matching_c4_reconciliation_batches') is not null reconciliation_batches,
  to_regclass('public.private_matching_c4_reconciliation_outcomes') is not null reconciliation_outcomes,
  to_regprocedure('public.private_matching_c4_source_identity(text)') is not null identity_rpc,
  to_regprocedure('public.private_matching_c4_contract_digests()') is not null digest_rpc,
  to_regprocedure('public.prepare_private_matching_c4_reconciliation()') is not null prepare_rpc,
  to_regprocedure('public.resume_private_matching_c4_failed_source(text,integer,text)') is not null resume_rpc,
  to_regprocedure('public.reconcile_private_matching_c4_batch(integer)') is not null batch_rpc,
  (select count(*) from public.private_matching_c4_reconciliation_runs) run_rows_before_prepare,
  (select count(*) from public.private_matching_c4_reconciliation_sources) source_rows_before_prepare,
  (select count(*) from public.private_matching_c4_reconciliation_members) member_rows_before_prepare,
  (select count(*) from public.private_matching_c4_reconciliation_batches) batch_rows_before_prepare,
  (select count(*) from public.private_matching_c4_reconciliation_outcomes) outcome_rows_before_prepare;

with target as (
  select to_regprocedure('public.match_opportunities(public.vector,double precision,integer)')::oid oid
)
select p.oid,p.oid::regprocedure exact_regprocedure,
  pg_get_function_arguments(p.oid) arguments_with_defaults,
  pg_get_function_result(p.oid) function_result,l.lanname,p.provolatile,p.prosecdef,
  pg_get_userbyid(p.proowner) owner,md5(coalesce(p.proacl::text,'DEFAULT_ACL')) output_acl_digest,
  '791d2b1e22edbb03f97770724fbb588b' authorized_input_acl_digest,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  (select count(*) from pg_proc f join pg_namespace n on n.oid=f.pronamespace
    where n.nspname='public' and f.proname='match_opportunities') overload_count,
  (p.pronargs=3 and p.pronargdefaults=2
    and p.proargnames[1:3]=array['query_embedding','match_threshold','match_count']::text[]
    and regexp_replace(pg_get_expr(p.proargdefaults,0),'\s+','','g')='0.3,20'
    and pg_get_function_result(p.oid)=
      'TABLE(id text, title text, organization text, location text, rubro text, tags text[], description text, application_url text, source text, similarity double precision)'
    and l.lanname='sql' and p.provolatile='s' and not p.prosecdef
    and not has_function_privilege('anon',p.oid,'EXECUTE')
    and not has_function_privilege('authenticated',p.oid,'EXECUTE')
    and position('public.opportunity_final_matching_universe' in pg_get_functiondef(p.oid))>0) contract_compatible
from target t join pg_proc p on p.oid=t.oid join pg_language l on l.oid=p.prolang;

select case when has_function_privilege('service_role',p.oid,'EXECUTE')
    and not has_function_privilege('anon',p.oid,'EXECUTE')
    and not has_function_privilege('authenticated',p.oid,'EXECUTE')
  then 'PASS' else 'STOP' end acl_hardening_result,
  p.oid exact_oid,pg_get_userbyid(p.proowner) owner,
  md5(coalesce(p.proacl::text,'DEFAULT_ACL')) output_acl_digest,
  'ONLY_PUBLIC_ANON_AUTHENTICATED_EXECUTE_REMOVED;SERVICE_ROLE_EXECUTE_PRESERVED' authorized_acl_delta
from pg_proc p
where p.oid=to_regprocedure('public.match_opportunities(public.vector,double precision,integer)');

with target as (
  select p.oid,p.proowner,p.proacl from pg_proc p
  where p.oid=to_regprocedure('public.match_opportunities(public.vector,double precision,integer)')
), normalized_acl as (
  select acl.grantee,bool_or(acl.is_grantable) is_grantable
  from target t cross join lateral aclexplode(coalesce(t.proacl,acldefault('f',t.proowner))) acl
  where acl.privilege_type='EXECUTE' group by acl.grantee
)
select md5(coalesce(string_agg(grantee::text||':'||is_grantable::text,E'\n'
    order by grantee),'')) actual_output_acl_contract_digest,
  jsonb_agg(jsonb_build_object('grantee',grantee,'is_grantable',is_grantable)
    order by grantee) actual_output_acl_contract
from normalized_acl;

select c.oid,pg_get_userbyid(c.relowner) owner,c.reloptions,md5(coalesce(c.relacl::text,'DEFAULT_ACL')) acl_digest,
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

select p.oid,p.oid::regprocedure exact_regprocedure,
  md5(coalesce(p.proacl::text,'DEFAULT_ACL')) acl_digest,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_proc p where p.oid in (
  to_regprocedure('public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)'),
  to_regprocedure('public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)'),
  to_regprocedure('public.match_opportunities(public.vector,double precision,integer)'),
  to_regprocedure('public.private_matching_c4_source_identity(text)'),
  to_regprocedure('public.private_matching_c4_contract_digests()'),
  to_regprocedure('public.prepare_private_matching_c4_reconciliation()'),
  to_regprocedure('public.resume_private_matching_c4_failed_source(text,integer,text)'),
  to_regprocedure('public.reconcile_private_matching_c4_batch(integer)'))
order by p.oid::regprocedure::text;

select c.relname,
  has_table_privilege('service_role',c.oid,'SELECT') service_select,
  (has_table_privilege('service_role',c.oid,'INSERT') or has_table_privilege('service_role',c.oid,'UPDATE')
    or has_table_privilege('service_role',c.oid,'DELETE')) service_direct_write,
  (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('anon',c.oid,'INSERT')
    or has_table_privilege('anon',c.oid,'UPDATE') or has_table_privilege('anon',c.oid,'DELETE')) anon_any_access,
  (has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT')
    or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE')) authenticated_any_access
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'private_matching_c4_reconciliation_runs','private_matching_c4_reconciliation_sources',
  'private_matching_c4_reconciliation_members','private_matching_c4_reconciliation_batches',
  'private_matching_c4_reconciliation_outcomes')
order by c.relname;

with functions as (
  select
    to_regprocedure('public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)')::oid installed_oid,
    to_regprocedure('public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)')::oid backup_oid
)
select count(*) filter(where has_function_privilege(r.oid,f.installed_oid,'EXECUTE') is distinct from
    has_function_privilege(r.oid,f.backup_oid,'EXECUTE')) access_mismatched_roles,
  jsonb_agg(r.rolname order by r.rolname) filter(where has_function_privilege(r.oid,f.installed_oid,'EXECUTE') is distinct from
    has_function_privilege(r.oid,f.backup_oid,'EXECUTE')) access_mismatch_roles
from functions f cross join pg_roles r;

select count(*) compatible_operator_count,
  jsonb_agg(o.oid::regoperator::text order by o.oid::regoperator::text) exact_operators
from pg_operator o
where o.oprnamespace='public'::regnamespace and o.oprname='<=>'
  and o.oprleft=to_regtype('public.vector') and o.oprright=to_regtype('public.vector')
  and o.oprresult='double precision'::regtype;

with target as (
  select 'public.opportunity_final_matching_universe'::regclass oid
)
select source.oid::regclass dependency,
  jsonb_agg(distinct jsonb_build_object('column_number',d.refobjsubid,
    'column_name',a.attname) order by jsonb_build_object('column_number',d.refobjsubid,
    'column_name',a.attname)) dependency_columns
from target t
join pg_rewrite r on r.ev_class=t.oid
join pg_depend d on d.classid='pg_rewrite'::regclass and d.objid=r.oid
  and d.refclassid='pg_class'::regclass
join pg_class source on source.oid=d.refobjid
left join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
where source.oid in ('public.opportunities'::regclass,'public.opportunity_universe_state'::regclass)
group by source.oid order by source.oid::regclass::text;

select count(*) recruiter_vacancies,
  count(o.id) recruiter_mirrors,
  count(*) filter(where r.recruiter_token_id is null or t.id is null) owner_missing,
  count(*) filter(where r.is_active and u.lifecycle_state='ACTIVE_VALID' and u.final_matching_state='READY') open_private_matching_ready,
  count(*) filter(where not r.is_active and u.lifecycle_state='INACTIVE_VALID' and u.final_matching_state='NOT_READY') closed_private_matching_blocked,
  count(*) filter(where o.id is not null and u.source_matching_state='UNKNOWN'
    and 'matching'=any(u.source_permission_unknown_dimensions)) matching_unknown_preserved,
  count(*) filter(where o.id is not null and (u.catalog_state='READY' or u.seo_state='READY' or u.alerts_state='READY')) other_consumers_ready
from public.recruiter_vacancies r
left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
left join public.opportunities o on o.recruiter_vacancy_id=r.id and o.source='recruiter_b2b'
left join public.opportunity_universe_state u on u.opportunity_id=o.id;

select count(*) duplicate_mirrors from (
  select recruiter_vacancy_id from public.opportunities where recruiter_vacancy_id is not null
  group by recruiter_vacancy_id having count(*)>1
) duplicates;

select public.private_matching_c4_contract_digests() reproducible_contract_digests;
select 'c6dcc71299db2237f17d455729d238a7' legacy_recruiter_reference_digest,
  'REFERENCE_ONLY_DIFFERENT_HISTORICAL_ALGORITHM_NOT_COMPARABLE' comparison_rule;

rollback;
