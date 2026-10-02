-- READ ONLY: Retrieval migration dependency contract against the current PostgreSQL target.
-- One SELECT / one JSON result. Catalog metadata and read-only row validation only; no DDL/DML/RPC.
with
expected_schemas(schema_name) as (values ('auth'),('public')),
expected_relations(schema_name,relation_name) as (values
  ('auth','users'),('public','opportunities'),('public','opportunity_universe_state'),('public','matching_diagnostic_snapshots')
),
expected_columns(schema_name,relation_name,column_name,expected_type,addable) as (values
  ('auth','users','id','uuid',false),
  ('public','opportunities','id','text',false),
  ('public','opportunities','embedding','public.vector(384)',false),
  ('public','opportunities','content_fingerprint','text',false),
  ('public','opportunity_universe_state','opportunity_id','text',false),
  ('public','opportunity_universe_state','final_matching_state','text',false),
  ('public','matching_diagnostic_snapshots','background_retrieval_count','integer',true),
  ('public','matching_diagnostic_snapshots','background_scan_status','text',true),
  ('public','matching_diagnostic_snapshots','background_examined_count','integer',true),
  ('public','matching_diagnostic_snapshots','background_target_count','integer',true),
  ('public','matching_diagnostic_snapshots','background_candidate_count','integer',true),
  ('public','matching_diagnostic_snapshots','background_completed_at','timestamp with time zone',true),
  ('public','matching_diagnostic_snapshots','total_inventory_count','integer',true),
  ('public','matching_diagnostic_snapshots','inventory_funnel','jsonb',true),
  ('public','matching_diagnostic_snapshots','inventory_funnel_at','timestamp with time zone',true)
),
expected_roles(role_name) as (values ('anon'),('authenticated'),('service_role')),
expected_functions(schema_name,function_name,expected_signature,may_be_absent) as (values
  ('auth','role','auth.role() returns text',false),
  ('public','score_opportunity_embeddings','public.score_opportunity_embeddings(public.vector,text[]) returns table(id text, similarity double precision)',true),
  ('public','prune_matching_retrieval_candidates','public.prune_matching_retrieval_candidates() returns integer',true)
),
expected_constraints(schema_name,relation_name,constraint_name) as (values
  ('public','matching_diagnostic_snapshots','matching_diagnostic_snapshots_background_status_check')
),
schema_actual as (
  select e.schema_name,n.oid is not null present from expected_schemas e left join pg_catalog.pg_namespace n on n.nspname=e.schema_name
),
relation_actual as (
  select e.schema_name,e.relation_name,c.oid,c.relkind,c.relrowsecurity,n.nspname
  from expected_relations e left join pg_catalog.pg_namespace n on n.nspname=e.schema_name
  left join pg_catalog.pg_class c on c.relnamespace=n.oid and c.relname=e.relation_name
),
column_actual as (
  select e.schema_name,e.relation_name,e.column_name,e.expected_type,e.addable,
    r.oid relation_oid,a.attnum,
    case when a.attnum is null then null
      else pg_catalog.format_type(a.atttypid,a.atttypmod) end actual_type,
    tn.nspname actual_type_schema,t.typname actual_base_type
  from expected_columns e
  left join pg_catalog.pg_namespace rn on rn.nspname=e.schema_name
  left join pg_catalog.pg_class r on r.relnamespace=rn.oid and r.relname=e.relation_name
  left join pg_catalog.pg_attribute a on a.attrelid=r.oid and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
  left join pg_catalog.pg_type t on t.oid=a.atttypid
  left join pg_catalog.pg_namespace tn on tn.oid=t.typnamespace
),
vector_extension as (
  select e.extversion,n.nspname schema_name from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='vector'
),
vector_type as (
  select t.oid,n.nspname schema_name,t.typname from pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid=t.typnamespace where t.typname='vector' and n.nspname='public' and t.typtype='b'
),
vector_extension_type as (
  select exists(
    select 1 from vector_type t join pg_catalog.pg_depend d on d.classid='pg_catalog.pg_type'::regclass and d.objid=t.oid and d.deptype='e'
    join pg_catalog.pg_extension e on d.refclassid='pg_catalog.pg_extension'::regclass and d.refobjid=e.oid and e.extname='vector'
  ) belongs_to_extension
),
operator_actual as (
  select o.oid,ln.nspname schema_name,o.oprname,
    format('%I.%I',ltn.nspname,lt.typname) left_type,
    format('%I.%I',rtn.nspname,rt.typname) right_type,
    pg_catalog.format_type(o.oprresult,null) result_type
  from pg_catalog.pg_operator o
  join pg_catalog.pg_namespace ln on ln.oid=o.oprnamespace
  join pg_catalog.pg_type lt on lt.oid=o.oprleft join pg_catalog.pg_namespace ltn on ltn.oid=lt.typnamespace
  join pg_catalog.pg_type rt on rt.oid=o.oprright join pg_catalog.pg_namespace rtn on rtn.oid=rt.typnamespace
  where o.oprname='<=>' and o.oprnamespace=pg_catalog.to_regnamespace('public') and o.oprleft=pg_catalog.to_regtype('public.vector') and o.oprright=pg_catalog.to_regtype('public.vector')
),
function_actual as (
  select e.schema_name,e.function_name,e.expected_signature,e.may_be_absent,p.oid,
    case when p.oid is null then null else pg_catalog.format_type(p.prorettype,null) end return_type,
    case when p.oid is null then null else pg_catalog.pg_get_function_result(p.oid) end result_signature,
    case when p.oid is null then null else p.proretset end returns_set,
    case when p.oid is null then null else pg_catalog.pg_get_function_identity_arguments(p.oid) end identity_arguments,
    case when p.oid is null then null else p.proargtypes[0]=pg_catalog.to_regtype('public.vector') and p.proargtypes[1]='text[]'::regtype and pg_catalog.pg_get_function_result(p.oid)='TABLE(id text, similarity double precision)' and p.proretset end score_signature_ok,
    case when p.oid is null then null else p.pronargs=0 and p.prorettype='integer'::regtype and not p.proretset end prune_signature_ok,
    case when p.oid is null then null else p.pronargs=0 and p.prorettype='text'::regtype and not p.proretset end auth_role_signature_ok
  from expected_functions e
  left join pg_catalog.pg_namespace n on n.nspname=e.schema_name
  left join pg_catalog.pg_proc p on p.pronamespace=n.oid and p.proname=e.function_name
    and ((e.function_name='role' and p.pronargs=0)
      or (e.function_name='score_opportunity_embeddings' and p.pronargs=2 and p.proargtypes[0]=pg_catalog.to_regtype('public.vector') and p.proargtypes[1]='text[]'::regtype)
      or (e.function_name='prune_matching_retrieval_candidates' and p.pronargs=0))
),
function_overload_sets as (
  select e.schema_name,e.function_name,e.expected_signature,e.may_be_absent,count(p.oid) overload_count,
    count(p.oid) filter(where
      (e.function_name='role' and p.pronargs=0 and p.prorettype='text'::regtype and not p.proretset)
      or (e.function_name='score_opportunity_embeddings' and p.pronargs=2 and p.proargtypes[0]=pg_catalog.to_regtype('public.vector') and p.proargtypes[1]='text[]'::regtype and pg_catalog.pg_get_function_result(p.oid)='TABLE(id text, similarity double precision)' and p.proretset)
      or (e.function_name='prune_matching_retrieval_candidates' and p.pronargs=0 and p.prorettype='integer'::regtype and not p.proretset)
    ) compatible_overloads,
    string_agg(pg_catalog.pg_get_function_identity_arguments(p.oid)||' returns '||pg_catalog.format_type(p.prorettype,null),'; ' order by pg_catalog.pg_get_function_identity_arguments(p.oid)) actual_overloads
  from expected_functions e left join pg_catalog.pg_namespace n on n.nspname=e.schema_name
  left join pg_catalog.pg_proc p on p.pronamespace=n.oid and p.proname=e.function_name
  group by e.schema_name,e.function_name,e.expected_signature,e.may_be_absent
),
key_targets as (
  select e.schema_name,e.relation_name,e.column_name,r.oid relation_oid,a.attnum,
    exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=r.oid and c.contype in ('p','u') and pg_catalog.cardinality(c.conkey)=1 and a.attnum=any(c.conkey)) unique_key
  from (values ('auth','users','id'),('public','opportunities','id')) e(schema_name,relation_name,column_name)
  left join pg_catalog.pg_namespace n on n.nspname=e.schema_name
  left join pg_catalog.pg_class r on r.relnamespace=n.oid and r.relname=e.relation_name
  left join pg_catalog.pg_attribute a on a.attrelid=r.oid and a.attname=e.column_name and a.attnum>0 and not a.attisdropped
),
snapshot_constraint as (
  select c.oid,pg_catalog.pg_get_constraintdef(c.oid) definition
  from pg_catalog.pg_constraint c where c.conrelid=pg_catalog.to_regclass('public.matching_diagnostic_snapshots') and c.conname='matching_diagnostic_snapshots_background_status_check'
),
snapshot_relevant_constraints as (
  select string_agg(c.conname||': '||pg_catalog.pg_get_constraintdef(c.oid),'; ' order by c.conname) definitions
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class r on r.oid=c.conrelid
  join pg_catalog.pg_namespace n on n.oid=r.relnamespace and n.nspname='public' and r.relname='matching_diagnostic_snapshots'
  join pg_catalog.pg_attribute a on a.attrelid=r.oid and a.attnum=any(c.conkey) and a.attname in (select column_name from expected_columns where schema_name='public' and relation_name='matching_diagnostic_snapshots' and addable=true)
  where c.contype in ('c','p','u','x')
),
checks(dependency_class,object,expected,actual,status) as (
  select 'SCHEMA','SCHEMA '||schema_name,'present',case when present then 'present' else 'absent' end,case when present then 'PASS' else 'FAIL' end from schema_actual
  union all
  select 'RELATION','RELATION '||schema_name||'.'||relation_name,'table (ordinary or partitioned)',coalesce(relkind::text,'absent'),case when relkind in ('r','p') then 'PASS' else 'FAIL' end from relation_actual
  union all
  select 'COLUMN','COLUMN '||schema_name||'.'||relation_name||'.'||column_name,
    case when addable then expected_type||' (if absent, migration adds it)' else expected_type end,
    case when relation_oid is null then 'parent relation absent' when attnum is null then 'absent' else coalesce(actual_type,'unknown') end,
    case when relation_oid is null then 'FAIL'
      when attnum is null and addable then 'ABSENT_OK'
      when attnum is null then 'FAIL'
      when schema_name='public' and relation_name='opportunities' and column_name='embedding'
        then case when actual_type_schema='public' and actual_base_type='vector'
          and actual_type ~ '^(public\.)?vector\(384\)$' then 'PASS' else 'FAIL' end
      when actual_type=expected_type then 'PASS' else 'FAIL' end
  from column_actual
  union all
  select 'EXTENSION','EXTENSION vector','installed in public',coalesce(schema_name||' version '||extversion,'absent'),case when schema_name='public' then 'PASS' else 'FAIL' end from (select * from vector_extension union all select null,null where not exists(select 1 from vector_extension)) x
  union all
  select 'TYPE','TYPE public.vector','public.vector base type',coalesce(schema_name||'.'||typname,'absent'),case when oid is not null then 'PASS' else 'FAIL' end from (select * from vector_type union all select null::oid,null::name,null::name where not exists(select 1 from vector_type)) x
  union all
  select 'TYPE_EXTENSION','TYPE public.vector extension membership','public.vector is owned by installed vector extension',belongs_to_extension::text,case when belongs_to_extension then 'PASS' else 'FAIL' end from vector_extension_type
  union all
  select 'OPERATOR','OPERATOR public.<=> (public.vector,public.vector)','vector distance operator returning double precision',coalesce(string_agg(result_type,', '),'absent'),case when count(*) filter(where result_type='double precision')>0 then 'PASS' else 'FAIL' end from operator_actual
  union all
  select 'FUNCTION','FUNCTION '||schema_name||'.'||function_name,expected_signature,
    case when oid is null then 'absent' else coalesce(identity_arguments,'')||' returns '||coalesce(result_signature,return_type,'unknown') end,
    case when oid is null and may_be_absent then 'ABSENT_OK' when oid is null then 'FAIL'
      when function_name='role' and auth_role_signature_ok then 'PASS'
      when function_name='score_opportunity_embeddings' and score_signature_ok then 'PASS'
      when function_name='prune_matching_retrieval_candidates' and prune_signature_ok then 'PASS' else 'FAIL' end
  from function_actual group by schema_name,function_name,expected_signature,may_be_absent,oid,identity_arguments,return_type,result_signature,auth_role_signature_ok,score_signature_ok,prune_signature_ok
  union all
  select 'FUNCTION_OVERLOADS','FUNCTION '||schema_name||'.'||function_name,expected_signature,
    coalesce(actual_overloads,'absent'),case when overload_count=0 and may_be_absent then 'ABSENT_OK' when compatible_overloads=1 then 'PASS' else 'FAIL' end
  from function_overload_sets
  union all
  select 'FK_TARGET','UNIQUE KEY '||schema_name||'.'||relation_name||'.'||column_name,'single-column PRIMARY KEY or UNIQUE',case when relation_oid is null then 'relation absent' when attnum is null then 'column absent' when unique_key then 'unique key present' else 'unique key absent' end,case when relation_oid is not null and attnum is not null and unique_key then 'PASS' else 'FAIL' end from key_targets
  union all
  select 'ROLE','ROLE '||role_name,'role exists',case when r.oid is null then 'absent' else 'present' end,case when r.oid is null then 'FAIL' else 'PASS' end from expected_roles e left join pg_catalog.pg_roles r on r.rolname=e.role_name
  union all
  select 'FUNCTION_PRIVILEGE','FUNCTION auth.role service_role execution','auth schema USAGE and auth.role() EXECUTE',
    case when r.oid is null then 'service_role absent' when f.oid is null then 'auth.role() absent' else pg_catalog.format('schema_usage=%s; execute=%s',pg_catalog.has_schema_privilege(r.rolname,'auth','USAGE'),pg_catalog.has_function_privilege(r.rolname,f.oid,'EXECUTE')) end,
    case when r.oid is null or f.oid is null then 'FAIL' when pg_catalog.has_schema_privilege(r.rolname,'auth','USAGE') and pg_catalog.has_function_privilege(r.rolname,f.oid,'EXECUTE') then 'PASS' else 'FAIL' end
  from pg_catalog.pg_roles r cross join pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid=f.pronamespace
  where r.rolname='service_role' and n.nspname='auth' and f.proname='role' and f.pronargs=0
  union all
  select 'FUNCTION_PRIVILEGE','FUNCTION auth.role service_role execution','auth schema USAGE and auth.role() EXECUTE','dependency missing','FAIL'
  where not exists(select 1 from pg_catalog.pg_roles where rolname='service_role') or not exists(select 1 from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid=f.pronamespace where n.nspname='auth' and f.proname='role' and f.pronargs=0)
  union all
  select 'CONSTRAINT','CONSTRAINT public.matching_diagnostic_snapshots.'||constraint_name,'migration may replace named check',coalesce(definition,'absent'),case when oid is null then 'ABSENT_OK' else 'PASS' end from expected_constraints e left join snapshot_constraint c on true
  union all
  select 'CONSTRAINT_SET','CONSTRAINTS on matching_diagnostic_snapshots columns altered by migration','all existing relevant constraints enumerated',coalesce(definitions,'none present'),'PASS' from snapshot_relevant_constraints
  union all
  select 'RLS','RELATION public.matching_diagnostic_snapshots RLS','existing setting is preserved',case when oid is null then 'relation absent' when relrowsecurity then 'enabled' else 'disabled' end,case when oid is null then 'FAIL' else 'PASS' end from relation_actual where schema_name='public' and relation_name='matching_diagnostic_snapshots'
  union all
  select 'APPLY_PRIVILEGE','SCHEMA public CREATE','superuser or CREATE privilege',pg_catalog.format('%s; create=%s; superuser=%s',current_user,coalesce(pg_catalog.has_schema_privilege(current_user,pg_catalog.to_regnamespace('public'),'CREATE'),false),coalesce((select rolsuper from pg_catalog.pg_roles where rolname=current_user),false)),case when coalesce(pg_catalog.has_schema_privilege(current_user,pg_catalog.to_regnamespace('public'),'CREATE'),false) or coalesce((select rolsuper from pg_catalog.pg_roles where rolname=current_user),false) then 'PASS' else 'FAIL' end
  union all
  select 'APPLY_PRIVILEGE','TABLE public.matching_diagnostic_snapshots ALTER','table owner or superuser',pg_catalog.format('%s; owner=%s',current_user,coalesce(pg_catalog.pg_get_userbyid(c.relowner),'absent')),case when c.oid is null then 'FAIL' when c.relowner=(select oid from pg_catalog.pg_roles where rolname=current_user) or coalesce((select rolsuper from pg_catalog.pg_roles where rolname=current_user),false) then 'PASS' else 'FAIL' end
  from (values (pg_catalog.to_regclass('public.matching_diagnostic_snapshots'))) expected(table_oid)
  left join pg_catalog.pg_class c on c.oid=expected.table_oid
)
select jsonb_build_object(
  'observed_at',now(),'POSTGRES_VERSION',current_setting('server_version'),'CURRENT_USER',current_user,
  'DEPENDENCIES_TOTAL',count(*),'PASS',count(*) filter(where status='PASS'),'FAIL',count(*) filter(where status='FAIL'),'ABSENT_OK',count(*) filter(where status='ABSENT_OK'),
  'SAFE_TO_COMPILE',count(*) filter(where status='FAIL')=0,
  'DEPENDENCY_CLASSES',(select jsonb_object_agg(dependency_class,n order by dependency_class) from (select dependency_class,count(*) n from checks group by dependency_class) totals),
  'vector_extension',jsonb_build_object('installed',(select count(*)>0 from vector_extension),'schema',(select max(schema_name) from vector_extension),'version',(select max(extversion) from vector_extension),'type_schema',(select max(schema_name) from vector_type),'type_belongs_to_extension',(select belongs_to_extension from vector_extension_type),'opportunities_embedding_format_type',(select actual_type from column_actual where relation_name='opportunities' and column_name='embedding'),'opportunities_embedding_base_type',(select actual_base_type from column_actual where relation_name='opportunities' and column_name='embedding'),'opportunities_embedding_dimension',case when (select actual_type from column_actual where relation_name='opportunities' and column_name='embedding') ~ '^(public\.)?vector\([0-9]+\)$' then substring((select actual_type from column_actual where relation_name='opportunities' and column_name='embedding') from '\(([0-9]+)\)')::integer else null end),
  'dependencies',coalesce(jsonb_agg(jsonb_build_object('class',dependency_class,'object',object,'expected',expected,'actual',actual,'status',status) order by dependency_class,object),'[]'::jsonb)
) as retrieval_dependency_preflight from checks;
