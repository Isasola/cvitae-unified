import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import registry from '../src/generated/source-intelligence-registry.json'
import { canonicalSourcePermissionRegistry, SOURCE_PERMISSION_DIMENSIONS, SOURCE_PERMISSION_REVIEWED_AT, sourcePermissionCoverage } from '../src/lib/source-permission-truth.ts'
import { registeredSourceOperationalDefault } from '../src/lib/effective-source-policy.ts'

// C09.1 release overlay is a generated Registry projection, not a second list
// of operational truth. This mode leaves all historical release artifacts alone.
if (process.argv.includes('--source-operation-projection-only')) {
  const target = resolve(process.cwd(), 'supabase/migrations/202610040001_source_switch_wiring.sql')
  const sql = readFileSync(target, 'utf8')
  const sources = (registry as any).sources.map((item: any) => item.canonical_source)
    .filter(registeredSourceOperationalDefault).sort()
  const pattern = /v_source=any\(array\[[^\]]+\]\)/g
  if ([...sql.matchAll(pattern)].length !== 1) throw new Error('SOURCE_OPERATION_PROJECTION_MARKER_MISMATCH')
  const projection = `v_source=any(array[${sources.map((source: string) => `'${source.replaceAll("'", "''")}'`).join(',')}])`
  writeFileSync(target, sql.replace(pattern, projection))
  console.log(`SOURCE_OPERATION_REGISTRY_PROJECTION=${sources.length}`)
  process.exit(0)
}

const root = process.cwd()
const out = resolve(root, 'artifacts/opportunity-universe')
mkdirSync(out, { recursive: true })
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
const quoteDate = (value: string) => `DATE '${value.replace(/'/g, "''")}'`
const identityRows = new Map<string, string>()
for (const profile of (registry as any).sources || []) {
  for (const emitted of new Set([profile.canonical_source, ...(profile.emitted_aliases || [])].map((value: string) => String(value).toLowerCase()))) {
    const prior = identityRows.get(emitted)
    if (prior && prior !== profile.canonical_source) throw new Error(`SOURCE_ALIAS_CONFLICT:${emitted}`)
    identityRows.set(emitted, profile.canonical_source)
  }
}
const aliasSql = [...identityRows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([emitted, canonical]) => `(${quote(emitted)},${quote(canonical)})`).join(',\n')
const permissionRegistry = canonicalSourcePermissionRegistry()
const permissionSourcesSql = permissionRegistry.map(row => `(${quote(row.canonical_source)})`).join(',\n')
const permissionDimensionsSql = SOURCE_PERMISSION_DIMENSIONS.map(dimension => `(${quote(dimension)})`).join(',\n')
const permissionDefault = (source: string, dimension: string) => ({
  state: 'UNKNOWN', reason: 'SOURCE_PERMISSION_NOT_EVIDENCED', provenance: 'docs/source-permission-matrix.md; no affirmative permission evidence identified',
  evidence_type: 'REPOSITORY_REVIEW', evidence_url_or_repo_reference: 'docs/source-permission-matrix.md', verified_at: SOURCE_PERMISSION_REVIEWED_AT,
  notes: `No evidence for ${dimension} on ${source}; UNKNOWN is not DENIED and is not permission.`,
})
const permissionOverrides = permissionRegistry.flatMap(row => SOURCE_PERMISSION_DIMENSIONS.flatMap(dimension => {
  const value = row.dimensions[dimension]
  const fallback = permissionDefault(row.canonical_source, dimension)
  return Object.keys(fallback).every(key => (value as any)[key] === (fallback as any)[key]) ? [] : [`(${[
    row.canonical_source, dimension, value.state, value.reason, value.provenance, value.evidence_type,
    value.evidence_url_or_repo_reference, value.verified_at, value.notes,
  ].map((field, index) => index === 7 ? quoteDate(field) : quote(field)).join(',')})`]
})).join(',\n')
const permissionUniverseSql = `permission_sources(canonical_source) as (values
${permissionSourcesSql}
),
permission_dimensions(dimension) as (values
${permissionDimensionsSql}
),
permission_overrides(canonical_source,dimension,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes) as (values
${permissionOverrides}
),
permission_evidence as (
  select s.canonical_source,d.dimension,coalesce(o.permission_state,'UNKNOWN') permission_state,
    coalesce(o.reason,'SOURCE_PERMISSION_NOT_EVIDENCED') reason,
    coalesce(o.provenance,'docs/source-permission-matrix.md; no affirmative permission evidence identified') provenance,
    coalesce(o.evidence_type,'REPOSITORY_REVIEW') evidence_type,
    coalesce(o.evidence_reference,'docs/source-permission-matrix.md') evidence_reference,
    coalesce(o.verified_at,${quoteDate(SOURCE_PERMISSION_REVIEWED_AT)}) verified_at,
    coalesce(o.notes,'No evidence for '||d.dimension||' on '||s.canonical_source||'; UNKNOWN is not DENIED and is not permission.') notes
  from permission_sources s cross join permission_dimensions d
  left join permission_overrides o using(canonical_source,dimension)
)`
const universeMigration = readFileSync(resolve(root, 'supabase/migrations/202609280001_opportunity_universe.sql'), 'utf8')
const retrievalMigration = readFileSync(resolve(root, 'supabase/migrations/202609270001_matching_retrieval_coverage.sql'), 'utf8')
if (/extensions\.vector/i.test(retrievalMigration)
  || !/query_embedding\s+public\.vector\(384\)/i.test(retrievalMigration)
  || !/set\s+search_path\s*=\s*public\s+as\s+\$\$/i.test(retrievalMigration)
  || !/revoke\s+all\s+on\s+function\s+public\.score_opportunity_embeddings\(public\.vector,\s*text\[\]\)/i.test(retrievalMigration)
  || !/grant\s+execute\s+on\s+function\s+public\.score_opportunity_embeddings\(public\.vector,\s*text\[\]\)/i.test(retrievalMigration)) {
  throw new Error('RETRIEVAL_PRODUCTION_VECTOR_CONTRACT_MISMATCH')
}
const projection = `
-- Canonical identities and permission decisions. No evidence means UNKNOWN.
insert into public.opportunity_source_identity_aliases(emitted_source,canonical_source) values
${aliasSql}
on conflict(emitted_source) do update set canonical_source=excluded.canonical_source;

with\n${permissionUniverseSql}\ninsert into public.opportunity_source_consumer_permissions(canonical_source,consumer,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes)\nselect canonical_source,dimension,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes from permission_evidence
on conflict(canonical_source,consumer) do update set permission_state=excluded.permission_state,reason=excluded.reason,provenance=excluded.provenance,evidence_type=excluded.evidence_type,evidence_reference=excluded.evidence_reference,verified_at=excluded.verified_at,notes=excluded.notes,updated_at=now();

-- Canonical permission evidence is independent from operational switches. Seed only evidence; never project UNKNOWN into switch columns.
`
const schemaSql = `-- STAGE A: additive schema, canonical reducer, permission seed and independent operational controls only.
-- Does not run full historical reconciliation and does not apply Retrieval schema.
${universeMigration}
${projection}
`
const forbiddenSchemaFeatures = [
  [/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im, 'TRANSACTION_CONTROL'],
  [/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/im, 'CREATE_INDEX_CONCURRENTLY'],
  [/^\s*VACUUM\b/im, 'VACUUM'],
  [/\b(?:net\.http|http_get|http_post|dblink|pg_notify|lo_import)\s*\(/i, 'EXTERNAL_SIDE_EFFECT'],
  [/\b(?:select|perform|call)\s+(?:public\.)?reconcile_opportunity_universe_page\s*\(/i, 'AUTOMATIC_HISTORICAL_RECONCILIATION'],
  [/\b(?:select|perform|call)\s+(?:public\.)?(?:send_high_match_alerts|run_scraper|run_matching_retrieval_expansion|netlify_deploy)\s*\(/i, 'OPERATIONAL_JOB_INVOCATION'],
]
const unsafeSchemaFeatures = forbiddenSchemaFeatures.filter(([pattern]) => (pattern as RegExp).test(schemaSql)).map(([, name]) => name)
if (unsafeSchemaFeatures.length) throw new Error(`PROD_SCHEMA_NOT_COMPILE_TRANSACTION_SAFE:${unsafeSchemaFeatures.join(',')}`)
const compileTransactionSql = `BEGIN;\n\n${schemaSql}\nROLLBACK;\n`
const functionBodyRows = [...universeMigration.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\([\s\S]*?\)\s*returns[\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$\s*;/gi)]
const expectedFunctionRows = functionBodyRows.map(match => ({ name: match[1], md5: createHash('md5').update(match[2].replace(/\s+/g, ' ').trim(), 'utf8').digest('hex') }))
if (!expectedFunctionRows.length || new Set(expectedFunctionRows.map(row => row.name)).size !== expectedFunctionRows.length) throw new Error('PARTIAL_SCHEMA_FUNCTION_MANIFEST_INVALID')
const functionValuesSql = expectedFunctionRows.map(row => `('${row.name}','${row.md5}')`).join(',\n')
const partialSchemaCheckSql = `-- READ ONLY Stage 2 partial-apply inspection. Catalog/metadata only; this script does not mutate state.
with expected_tables(name) as (values
  ('opportunity_source_identity_aliases'),('opportunity_source_consumer_permissions'),('opportunity_universe_dirty_sources'),('opportunity_lifecycle_repair_audit'),('opportunity_universe_state')
), expected_views(name,marker) as (values
  ('opportunity_final_matching_universe','final_matching_state'),('opportunity_catalog_universe','catalog_state'),('opportunity_seo_universe','seo_state'),('opportunity_alert_universe','alerts_state')
), expected_indexes(name) as (values ('opportunity_universe_final_matching_idx'),('opportunity_universe_source_state_idx')),
expected_triggers(name,table_name) as (values
  ('opportunities_refresh_universe','opportunities'),('opportunity_observation_refresh_universe','opportunity_source_observations'),('opportunity_sources_refresh_universe','opportunity_sources'),('opportunity_permissions_refresh_universe','opportunity_source_consumer_permissions'),('opportunity_source_trust_before_insert','opportunities')
), expected_policies(name) as (values
  ('opportunity_universe_state_service_role'),('opportunity_source_identity_aliases_service_role'),('opportunity_source_permissions_service_role'),('opportunity_universe_dirty_sources_service_role'),('opportunity_lifecycle_repair_audit_service_role')
), expected_functions(name,body_md5) as (values
${functionValuesSql}
), table_objects as (
  select 'table' kind,e.name, c.oid is not null present,
    coalesce(c.relrowsecurity,false) definition_ok
  from expected_tables e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.name and c.relkind in ('r','p')
), view_objects as (
  select 'view' kind,e.name,c.oid is not null present,
    coalesce(position(e.marker in lower(pg_get_viewdef(c.oid,true)))>0 and position('ready' in lower(pg_get_viewdef(c.oid,true)))>0,false) definition_ok
  from expected_views e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.name and c.relkind='v'
), index_objects as (
  select 'index' kind,e.name,c.oid is not null present,
    coalesce(i.indisvalid and i.indisready,false) definition_ok
  from expected_indexes e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.name and c.relkind='i'
  left join pg_index i on i.indexrelid=c.oid
), trigger_objects as (
  select 'trigger' kind,e.name,t.oid is not null present,
    coalesce(t.tgenabled<>'D',false) definition_ok
  from expected_triggers e left join pg_class rel on rel.relnamespace='public'::regnamespace and rel.relname=e.table_name
  left join pg_trigger t on t.tgrelid=rel.oid and t.tgname=e.name and not t.tgisinternal
), policy_objects as (
  select 'policy' kind,e.name,p.oid is not null present,
    coalesce(p.polcmd='*',false) definition_ok
  from expected_policies e left join pg_policy p on p.polrelid in (select oid from pg_class where relnamespace='public'::regnamespace) and p.polname=e.name
), function_objects as (
  select 'function' kind,e.name,
    coalesce(bool_or(p.oid is not null),false) present,
    coalesce(bool_or(md5(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g')))=e.body_md5),false) definition_ok
  from expected_functions e left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=e.name
  group by e.name,e.body_md5
), objects as (
  select * from table_objects union all select * from view_objects union all select * from index_objects
  union all select * from trigger_objects union all select * from policy_objects union all select * from function_objects
), summary as (
  select count(*) object_total,count(*) filter(where present) object_present,
    count(*) filter(where not present) object_missing,count(*) filter(where present and not definition_ok) definition_mismatch,
    coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name,'present',present,'release_definition_match',case when present then definition_ok else null end) order by kind,name),'[]'::jsonb) object_details
  from objects
)
select jsonb_build_object(
  'stage','OPPORTUNITY_UNIVERSE_SCHEMA',
  'status',case when object_present=0 then 'NOT_APPLIED' when object_missing>0 then 'PARTIALLY_APPLIED' when definition_mismatch=0 then 'ALREADY_APPLIED_EQUIVALENT' else 'UNKNOWN' end,
  'objects_expected',object_total,'objects_present',object_present,'objects_missing',object_missing,'definition_mismatches',definition_mismatch,
  'definition_comparison','Function bodies compare normalized md5; views, RLS, indexes, triggers and policies use catalog structure/markers.',
  'objects',object_details
) as stage2_schema_state
from summary;
`
const retrievalSql = `-- STAGE D: apply only after Opportunity Universe full reconciliation and post-reconciliation checks pass.
-- Additive local Retrieval schema. Do not execute without separate approval.
${retrievalMigration}`
const retrievalDependencyPreflightSql = `-- READ ONLY: Retrieval migration dependency contract against the current PostgreSQL target.
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
          and actual_type ~ '^(public\\.)?vector\\(384\\)$' then 'PASS' else 'FAIL' end
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
  'vector_extension',jsonb_build_object('installed',(select count(*)>0 from vector_extension),'schema',(select max(schema_name) from vector_extension),'version',(select max(extversion) from vector_extension),'type_schema',(select max(schema_name) from vector_type),'type_belongs_to_extension',(select belongs_to_extension from vector_extension_type),'opportunities_embedding_format_type',(select actual_type from column_actual where relation_name='opportunities' and column_name='embedding'),'opportunities_embedding_base_type',(select actual_base_type from column_actual where relation_name='opportunities' and column_name='embedding'),'opportunities_embedding_dimension',case when (select actual_type from column_actual where relation_name='opportunities' and column_name='embedding') ~ '^(public\\.)?vector\\([0-9]+\\)$' then substring((select actual_type from column_actual where relation_name='opportunities' and column_name='embedding') from '\\(([0-9]+)\\)')::integer else null end),
  'dependencies',coalesce(jsonb_agg(jsonb_build_object('class',dependency_class,'object',object,'expected',expected,'actual',actual,'status',status) order by dependency_class,object),'[]'::jsonb)
) as retrieval_dependency_preflight from checks;
`
const applySql = `-- STAGED RELEASE ONLY. THIS FILE IS INTENTIONALLY NON-EXECUTABLE.
-- Apply prod-apply-schema.sql, run scripts/apply_opportunity_universe_prod.ts in bounded batches,
-- verify Opportunity Universe, then apply prod-apply-retrieval.sql and run verify-prod.sql.
-- No single-transaction full-inventory loop is provided.`

const permissionValueRows = permissionUniverseSql
const requirementsTextSql = (row: string) => `case jsonb_typeof(to_jsonb(${row})->'requirements')
      when 'string' then trim(coalesce(to_jsonb(${row})->'requirements' #>> '{}',''))
      when 'array' then coalesce((select string_agg(trim(req.text_value),' ' order by req.ordinality) from (
        select case jsonb_typeof(item.value) when 'string' then item.value #>> '{}'
          when 'object' then case when jsonb_typeof(item.value->'text')='string' then item.value->>'text' else null end
          else null end text_value,item.ordinality
        from jsonb_array_elements(to_jsonb(${row})->'requirements') with ordinality as item(value,ordinality)
      ) req where nullif(trim(req.text_value),'') is not null),'')
      else '' end`
const preflightSql = `-- PURE READ ONLY. One result row / one JSON object. Evaluates every current opportunity; no migration objects required.
with
identity_map(emitted_source,canonical_source) as (values
${aliasSql}
),
${permissionValueRows},
permission_pivot as (
  select canonical_source,
    max(permission_state) filter(where dimension='matching') as matching_permission,
    max(permission_state) filter(where dimension='catalog') as catalog_permission,
    max(permission_state) filter(where dimension='alerts') as alerts_permission,
    max(permission_state) filter(where dimension='seo_index') as seo_permission,
    max(reason) filter(where dimension='matching') as matching_reason,
    max(provenance) filter(where dimension='matching') as matching_provenance,
    bool_or(permission_state='UNKNOWN') any_permission_unknown,
    sum((permission_state='UNKNOWN')::int) unknown_permission_dimensions
  from permission_evidence group by canonical_source
),
source_policy_rows as (
  select coalesce(i.canonical_source,lower(trim(s.source))) canonical_source,s.*
  from public.opportunity_sources s left join identity_map i on i.emitted_source=lower(trim(s.source))
),
source_policy as (
  select canonical_source,count(*) row_count,
    count(*) filter(where is_enabled is null) enabled_nulls,count(distinct is_enabled) enabled_values,
    case when count(*) filter(where is_enabled is null)>0 or count(distinct is_enabled)<>1 then null else bool_and(is_enabled) end is_enabled,
    count(*) filter(where matching_enabled is null) matching_nulls,count(distinct matching_enabled) matching_values,
    case when count(*) filter(where matching_enabled is null)>0 or count(distinct matching_enabled)<>1 then null else bool_and(matching_enabled) end matching_enabled,
    count(*) filter(where catalog_enabled is null) catalog_nulls,count(distinct catalog_enabled) catalog_values,
    count(*) filter(where alerts_enabled is null) alerts_nulls,count(distinct alerts_enabled) alerts_values,
    count(*) filter(where seo_enabled is null) seo_nulls,count(distinct seo_enabled) seo_values,
    count(distinct coalesce(is_enabled::text,'UNKNOWN'))>1 global_alias_conflict,
    count(distinct coalesce(matching_enabled::text,'UNKNOWN'))>1 matching_alias_conflict,
    count(distinct coalesce(catalog_enabled::text,'UNKNOWN'))>1 catalog_alias_conflict,
    count(distinct coalesce(alerts_enabled::text,'UNKNOWN'))>1 alerts_alias_conflict,
    count(distinct coalesce(seo_enabled::text,'UNKNOWN'))>1 seo_alias_conflict,
    case when count(*) filter(where catalog_enabled is null)>0 or count(distinct catalog_enabled)<>1 then null else bool_and(catalog_enabled) end catalog_enabled,
    case when count(*) filter(where alerts_enabled is null)>0 or count(distinct alerts_enabled)<>1 then null else bool_and(alerts_enabled) end alerts_enabled,
    case when count(*) filter(where seo_enabled is null)>0 or count(distinct seo_enabled)<>1 then null else bool_and(seo_enabled) end seo_enabled,
    (count(distinct coalesce(is_enabled::text,'UNKNOWN'))>1 or count(distinct coalesce(matching_enabled::text,'UNKNOWN'))>1 or count(distinct coalesce(catalog_enabled::text,'UNKNOWN'))>1 or count(distinct coalesce(alerts_enabled::text,'UNKNOWN'))>1 or count(distinct coalesce(seo_enabled::text,'UNKNOWN'))>1) policy_alias_conflict,
    jsonb_agg(lower(source) order by lower(source)) policy_rows
  from source_policy_rows group by canonical_source
),
latest_observation as (
  select distinct on (opportunity_id::text) opportunity_id::text opportunity_id,id,source,identity_status,http_status,observed_at
  from public.opportunity_source_observations order by opportunity_id::text,observed_at desc,id desc
),
inventory as (
  select o.*,coalesce(i.canonical_source,lower(trim(o.source))) canonical_source,
    ${requirementsTextSql('o')} universe_requirements_text,to_jsonb(o)->>'professional_family' universe_professional_family_value,
    lo.id observation_id,lo.source observation_source,coalesce(oi.canonical_source,lower(trim(lo.source))) observation_canonical_source,lo.identity_status observation_status,lo.http_status observation_http_status,lo.observed_at observation_at,
    pp.matching_permission,pp.catalog_permission,pp.alerts_permission,pp.seo_permission,pp.matching_reason,pp.matching_provenance,
    sp.row_count policy_row_count,sp.enabled_nulls,sp.enabled_values,sp.is_enabled,sp.matching_nulls,sp.matching_values,sp.matching_enabled,
    sp.catalog_enabled,sp.catalog_nulls,sp.catalog_values,sp.alerts_enabled,sp.alerts_nulls,sp.alerts_values,sp.seo_enabled,sp.seo_nulls,sp.seo_values,sp.global_alias_conflict,sp.matching_alias_conflict,sp.catalog_alias_conflict,sp.alerts_alias_conflict,sp.seo_alias_conflict,sp.policy_alias_conflict,sp.policy_rows,coalesce(pp.any_permission_unknown,true) any_permission_unknown,coalesce(pp.unknown_permission_dimensions,10) unknown_permission_dimensions,
    case when nullif(trim(o.deadline),'') is null then 'UNKNOWN'
      when trim(o.deadline) ~ '^\\d{4}-\\d{2}-\\d{2}$' and pg_input_is_valid(trim(o.deadline),'date') then case when trim(o.deadline)::date < current_date then 'EXPIRED' else 'OPEN' end
      when trim(o.deadline) ~ '(Z|[+-]\\d\\d:\\d\\d)$' and pg_input_is_valid(trim(o.deadline),'timestamptz') then case when trim(o.deadline)::timestamptz < now() then 'EXPIRED' else 'OPEN' end
      else 'INVALID' end deadline_state
  from public.opportunities o
  left join identity_map i on i.emitted_source=lower(trim(o.source))
  left join latest_observation lo on lo.opportunity_id=o.id::text
  left join identity_map oi on oi.emitted_source=lower(trim(lo.source))
  left join permission_pivot pp on pp.canonical_source=coalesce(i.canonical_source,lower(trim(o.source)))
  left join source_policy sp on sp.canonical_source=coalesce(i.canonical_source,lower(trim(o.source)))
),
classified as (
  select x.*,
    case when nullif(x.deleted_at::text,'') is not null then 'DELETED'
      when nullif(x.archived_at::text,'') is not null then 'ARCHIVED'
      when x.deadline_state='EXPIRED' then 'EXPIRED'
      when x.deadline_state='INVALID' then 'LIFECYCLE_UNKNOWN'
      when x.observation_at is not null and (x.updated_at is null or x.observation_at>x.updated_at) and x.observation_status in ('DEAD','REMOVED') and x.observation_http_status in (404,410) then 'HARD_DEAD'
      when x.is_active is not true and x.observation_at is not null and (x.updated_at is null or x.observation_at>x.updated_at) and x.observation_status='IDENTITY_CONFIRMED' and x.observation_http_status=200 then 'STALE_DERIVED_STATE'
      when x.is_active is true and x.verification_status='verified' then 'ACTIVE_VALID'
      when x.is_active is false and x.verification_status in ('rejected','quarantined') then 'INACTIVE_VALID'
      else 'LIFECYCLE_UNKNOWN' end lifecycle_state,
    case when nullif(x.deleted_at::text,'') is not null then 'ROW_DELETED'
      when nullif(x.archived_at::text,'') is not null then 'ROW_ARCHIVED'
      when x.deadline_state='EXPIRED' then 'DEADLINE_EXPIRED'
      when x.deadline_state='INVALID' then 'DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN'
      when x.observation_at is not null and (x.updated_at is null or x.observation_at>x.updated_at) and x.observation_status in ('DEAD','REMOVED') and x.observation_http_status in (404,410) then 'LATEST_HARD_DEAD_OBSERVATION'
      when x.is_active is not true and x.observation_at is not null and (x.updated_at is null or x.observation_at>x.updated_at) and x.observation_status='IDENTITY_CONFIRMED' and x.observation_http_status=200 then case when x.is_active is false then 'LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE' else 'LATEST_LIVE_OBSERVATION_RESOLVES_UNKNOWN_ACTIVE' end
      when x.is_active is true and x.verification_status='verified' then case when x.deadline_state='UNKNOWN' then 'ACTIVE_VERIFIED_NO_DEADLINE' else 'ACTIVE_VERIFIED_DEADLINE_OPEN' end
      when x.is_active is false and x.verification_status in ('rejected','quarantined') then 'VERIFICATION_'||upper(x.verification_status)
      else 'INSUFFICIENT_LIFECYCLE_EVIDENCE' end lifecycle_reason,
    case when nullif(trim(coalesce(x.title,'')),'')='' then 'MISSING_TITLE'
      when nullif(trim(coalesce(x.slug,'')),'') is null then 'MISSING_CANONICAL_IDENTITY'
      when length(trim(coalesce(x.description,'')))<100 then 'THIN_CONTENT'
      when nullif(trim(coalesce(x.organization,'')),'') is null then 'MISSING_ORGANIZATION'
      else 'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' end seo_content_reason,
    case when nullif(trim(coalesce(x.title,'')),'')<>'' and cardinality(regexp_split_to_array(trim(x.title),'\\s+'))>=2 and (length(trim(coalesce(x.description,'')))>=100 or length(trim(coalesce(x.universe_requirements_text,'')))>=60 or nullif(trim(coalesce(x.universe_professional_family_value,'')),'') is not null) then true else false end professional_fact,
    case when x.global_alias_conflict then 'CONFLICT' when x.enabled_nulls is null or x.enabled_nulls>0 or x.enabled_values<>1 then 'UNKNOWN' when x.is_enabled then 'ALLOWED' else 'DENIED' end source_operation_state,
    case when x.global_alias_conflict or x.matching_alias_conflict or x.matching_nulls is null or x.matching_nulls>0 or x.matching_values<>1 then 'UNKNOWN' when x.matching_enabled then 'ALLOWED' else 'DENIED' end matching_switch_state,
    case when x.global_alias_conflict or x.catalog_alias_conflict or x.catalog_nulls is null or x.catalog_nulls>0 or x.catalog_values<>1 then 'UNKNOWN' when x.catalog_enabled then 'ALLOWED' else 'DENIED' end catalog_switch_state,
    case when x.global_alias_conflict or x.alerts_alias_conflict or x.alerts_nulls is null or x.alerts_nulls>0 or x.alerts_values<>1 then 'UNKNOWN' when x.alerts_enabled then 'ALLOWED' else 'DENIED' end alerts_switch_state,
    case when x.global_alias_conflict or x.seo_alias_conflict or x.seo_nulls is null or x.seo_nulls>0 or x.seo_values<>1 then 'UNKNOWN' when x.seo_enabled then 'ALLOWED' else 'DENIED' end seo_switch_state
  from inventory x
),
decisions as (
  select c.*,
    case when c.lifecycle_state<>'ACTIVE_VALID' then 'PROFESSIONAL_UNKNOWN' when c.professional_fact then 'PROFESSIONAL_READY' else 'PROFESSIONAL_THIN' end professional_state,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end when c.professional_fact then 'READY' else 'NOT_READY' end matching_row_state,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end when nullif(trim(coalesce(c.title,'')),'')='' or nullif(trim(coalesce(c.slug,'')),'') is null then 'NOT_READY' else 'READY' end catalog_row_state,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end when nullif(trim(coalesce(c.title,'')),'') is null or nullif(trim(coalesce(c.slug,'')),'') is null or length(trim(coalesce(c.description,'')))<100 or nullif(trim(coalesce(c.organization,'')),'') is null then 'NOT_READY' else 'READY' end seo_row_state,
    case when c.seo_content_reason='SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' then 'READY' else 'NOT_READY' end seo_content_state,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end
      when nullif(trim(coalesce(c.title,'')),'') is null then 'MISSING_TITLE' when nullif(trim(coalesce(c.slug,'')),'') is null then 'MISSING_CANONICAL_IDENTITY'
      when length(trim(coalesce(c.description,'')))<100 then 'THIN_CONTENT' when nullif(trim(coalesce(c.organization,'')),'') is null then 'MISSING_ORGANIZATION' else 'SEO_ROW_READY' end seo_row_reason,
    case when c.lifecycle_state<>'ACTIVE_VALID' then case when c.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then 'UNKNOWN' else 'NOT_READY' end when not c.professional_fact then 'NOT_READY' else 'READY' end alerts_row_state,
    case when c.canonical_source='computrabajo' then case when (now() at time zone 'UTC')::date<=date '2026-10-09' then 'ACTIVE' else 'EXPIRED' end else 'NOT_APPLICABLE' end temporary_legacy_seo_exception_state,
    case when c.lifecycle_state='STALE_DERIVED_STATE' then c.lifecycle_reason
      when c.lifecycle_state<>'LIFECYCLE_UNKNOWN' then null
      when c.deadline_state='INVALID' then 'DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN'
      when c.observation_id is null then 'NO_OBSERVATION'
      when c.observation_canonical_source is not null and c.observation_canonical_source<>c.canonical_source then 'OBSERVATION_SOURCE_MISMATCH'
      when c.observation_status='IDENTITY_UNRESOLVED' then 'IDENTITY_UNRESOLVED'
      when c.observation_status='IDENTITY_MISMATCH' then 'IDENTITY_MISMATCH'
      when c.observation_http_status in (0,429) or c.observation_http_status>=500 then 'TRANSIENT_HTTP_EVIDENCE'
      when c.observation_status='IDENTITY_CONFIRMED' and c.observation_http_status=200 then 'OBSERVATION_NOT_NEWER_THAN_ROW_UPDATE'
      when c.observation_http_status is null then 'HTTP_STATUS_UNKNOWN'
      else 'LIFECYCLE_EVIDENCE_INSUFFICIENT' end lifecycle_unresolved_reason,
    case when c.lifecycle_state not in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') then case when c.lifecycle_state in ('EXPIRED','DELETED','ARCHIVED','HARD_DEAD','INACTIVE_VALID') then 'EXPLICITLY_INACTIVE' else 'NOT_UNRESOLVED' end
      when c.lifecycle_state='STALE_DERIVED_STATE' and c.verification_status='verified' then 'RECOVERABLE_NOW'
      when c.seo_content_reason<>'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' then 'CONTENT_NOT_READY'
      when c.observation_id is not null and c.observation_canonical_source is not null and c.observation_canonical_source<>c.canonical_source then 'SYSTEM_ERROR'
      else 'REFRESH_REQUIRED' end lifecycle_recovery_class
  from classified c
),
states_prepared as (
 select d.*,
  (d.canonical_source='computrabajo'
    and d.temporary_legacy_seo_exception_state='ACTIVE'
    and d.seo_permission='DENIED'
    and d.seo_eligible is true and d.seo_status='eligible'
    and d.created_at is not null and (d.created_at at time zone 'UTC')::date<=date '2026-10-03'
    and d.seo_row_state='READY' and d.source_operation_state='ALLOWED' and d.seo_switch_state='ALLOWED') temporary_legacy_seo_exception_applied
 from decisions d
),
states as (
 select d.*,
  case when d.matching_row_state<>'READY' then d.matching_row_state when d.matching_permission='DENIED' or d.source_operation_state='DENIED' or d.matching_switch_state='DENIED' then 'NOT_READY'
    when d.matching_permission is distinct from 'ALLOWED' or d.source_operation_state in ('UNKNOWN','CONFLICT') or d.matching_switch_state='UNKNOWN' then 'UNKNOWN' else 'READY' end final_matching_state,
  case when d.catalog_row_state<>'READY' then d.catalog_row_state when d.catalog_permission='DENIED' or d.source_operation_state='DENIED' or d.catalog_switch_state='DENIED' then 'NOT_READY' when d.catalog_permission is distinct from 'ALLOWED' or d.source_operation_state in ('UNKNOWN','CONFLICT') or d.catalog_switch_state='UNKNOWN' then 'UNKNOWN' else 'READY' end catalog_state,
  case when d.alerts_row_state<>'READY' then d.alerts_row_state when d.alerts_permission='DENIED' or d.source_operation_state='DENIED' or d.alerts_switch_state='DENIED' then 'NOT_READY' when d.alerts_permission is distinct from 'ALLOWED' or d.source_operation_state in ('UNKNOWN','CONFLICT') or d.alerts_switch_state='UNKNOWN' then 'UNKNOWN' else 'READY' end alerts_state,
  case when d.seo_row_state<>'READY' then d.seo_row_state when d.temporary_legacy_seo_exception_applied then 'READY' when d.seo_permission='DENIED' then 'NOT_READY' when d.seo_switch_state='DENIED' then 'NOT_READY' when d.source_operation_state='DENIED' then 'NOT_READY' when d.source_operation_state in ('UNKNOWN','CONFLICT') then 'UNKNOWN' else 'READY' end seo_state,
  case when d.seo_row_state<>'READY' then d.seo_row_reason when d.temporary_legacy_seo_exception_applied then 'TEMP_LEGACY_SEO_EXCEPTION_APPLIED' when d.seo_permission='DENIED' then 'SOURCE_SEO_PERMISSION_DENIED' when d.seo_switch_state='DENIED' then 'SOURCE_SEO_OPERATOR_DISABLED' when d.source_operation_state='DENIED' then 'SOURCE_DISABLED' when d.source_operation_state in ('UNKNOWN','CONFLICT') then case when d.source_operation_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT' else 'SOURCE_OPERATIONAL_STATE_UNKNOWN' end else 'SEO_EFFECTIVE_READY' end seo_effective_reason
 from states_prepared d
),
failures as (
 select s.*,case when lifecycle_state<>'ACTIVE_VALID' then 'LIFECYCLE_'||lifecycle_state
  when matching_row_state='NOT_READY' then 'MATCH_ROW_NOT_READY'
  when matching_row_state='UNKNOWN' then 'MATCH_ROW_UNKNOWN'
  when source_operation_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT'
  when matching_alias_conflict then 'SOURCE_POLICY_ALIAS_CONFLICT'
  when matching_permission='DENIED' then 'SOURCE_PERMISSION_DENIED'
  when matching_permission is distinct from 'ALLOWED' then 'SOURCE_PERMISSION_UNKNOWN'
  when source_operation_state='DENIED' then 'SOURCE_DISABLED'
  when source_operation_state='UNKNOWN' then 'SOURCE_OPERATION_UNKNOWN'
  when matching_switch_state='DENIED' then 'MATCHING_SWITCH_DISABLED'
  when matching_switch_state='UNKNOWN' then 'MATCHING_SWITCH_UNKNOWN'
  else 'FINAL_MATCHING_UNIVERSE' end first_failure
 from states s
),
summary as (
 select count(*) AS total_inventory,
  count(*) filter(where lifecycle_state='ACTIVE_VALID') active_valid,count(*) filter(where lifecycle_state='INACTIVE_VALID') inactive_valid,
  count(*) filter(where lifecycle_state='EXPIRED') expired,count(*) filter(where lifecycle_state='DELETED') deleted,
  count(*) filter(where lifecycle_state='ARCHIVED') archived,count(*) filter(where lifecycle_state='HARD_DEAD') hard_dead,0::bigint superseded_duplicate,
  count(*) filter(where lifecycle_state='STALE_DERIVED_STATE') stale_derived_state,count(*) filter(where lifecycle_state='LIFECYCLE_UNKNOWN') lifecycle_unknown,
  count(*) filter(where professional_state='PROFESSIONAL_READY') professional_ready,count(*) filter(where professional_state='PROFESSIONAL_THIN') professional_thin,count(*) filter(where professional_state='PROFESSIONAL_UNKNOWN') professional_unknown,
  count(*) filter(where matching_row_state='READY') match_row_ready,count(*) filter(where matching_row_state='NOT_READY') match_row_not_ready,count(*) filter(where matching_row_state='UNKNOWN') match_row_unknown,
  count(*) filter(where matching_permission='ALLOWED') match_permission_allowed,count(*) filter(where matching_permission='DENIED') match_permission_denied,count(*) filter(where matching_permission is null or matching_permission='UNKNOWN') match_permission_unknown,
  count(*) filter(where matching_switch_state='ALLOWED') match_switch_allowed,count(*) filter(where matching_switch_state='DENIED') match_switch_denied,count(*) filter(where matching_switch_state='UNKNOWN') match_switch_unknown,
  count(*) filter(where final_matching_state='READY') final_matching_universe,count(*) filter(where catalog_state='READY') catalog_universe,count(*) filter(where alerts_state='READY') alert_universe,count(*) filter(where seo_state='READY') seo_universe,
  count(*) filter(where seo_row_state='READY') seo_row_ready,count(*) filter(where seo_row_state='NOT_READY') seo_row_not_ready,count(*) filter(where seo_row_state='UNKNOWN') seo_row_unknown,count(*) filter(where seo_state='READY') seo_effective_ready,
  count(*) filter(where seo_content_state='READY') seo_content_ready_independent_of_lifecycle,
  count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE')) lifecycle_unresolved_total,
  count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') and seo_content_state='READY') seo_content_ready_while_lifecycle_unresolved,
  count(*) filter(where lifecycle_recovery_class='RECOVERABLE_NOW') lifecycle_recoverable_now,
  count(*) filter(where lifecycle_recovery_class='REFRESH_REQUIRED') lifecycle_refresh_required,
  count(*) filter(where lifecycle_recovery_class='CONTENT_NOT_READY') lifecycle_content_not_ready,
  count(*) filter(where lifecycle_recovery_class='SYSTEM_ERROR') lifecycle_system_error,
  count(*) filter(where lifecycle_recovery_class='EXPLICITLY_INACTIVE') lifecycle_explicitly_inactive_rows,
  count(*) filter(where seo_row_state='READY' and seo_permission='UNKNOWN') seo_permission_unknown_ready_rows,
  count(*) filter(where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') or matching_row_state='UNKNOWN' or source_operation_state in ('UNKNOWN','CONFLICT') or (matching_row_state='READY' and matching_permission='UNKNOWN') or (matching_row_state='READY' and matching_permission='ALLOWED' and matching_switch_state='UNKNOWN') or (catalog_row_state='READY' and (catalog_permission='UNKNOWN' or catalog_switch_state='UNKNOWN')) or (alerts_row_state='READY' and (alerts_permission='UNKNOWN' or alerts_switch_state='UNKNOWN'))) routing_unresolved_total,
  count(*) filter(where any_permission_unknown) rows_with_any_source_permission_unknown,
  count(*) filter(where policy_alias_conflict) source_policy_alias_conflicts,
  coalesce(sum(unknown_permission_dimensions),0) unknown_permission_dimension_claims,
  count(*) filter(where (lifecycle_state='HARD_DEAD' and is_active=true) or (lifecycle_state='STALE_DERIVED_STATE' and verification_status='verified')) repairable_rows,
  count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and match_eligible=true and is_enabled=true and matching_enabled=true) current_matching,
  count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and catalog_eligible=true and is_enabled=true and catalog_enabled=true) current_catalog,
  count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and alerts_eligible=true and is_enabled=true and alerts_enabled=true) current_alerts,
  count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and seo_eligible=true and is_enabled=true and seo_enabled=true) current_seo,
  count(*) filter(where lifecycle_state='ACTIVE_VALID') lifecycle_ready,
  count(*) filter(where temporary_legacy_seo_exception_applied) temporary_legacy_seo_exception_active_rows
 from failures
),
life_counts as (select (select total_inventory from summary) total,sum(n) grouped from (select count(*) n from failures group by lifecycle_state) x),
match_counts as (select count(*) filter(where lifecycle_state='ACTIVE_VALID') lifecycle_ready,
 count(*) filter(where first_failure='FINAL_MATCHING_UNIVERSE') ready,
 count(*) filter(where first_failure in ('SOURCE_PERMISSION_DENIED','SOURCE_PERMISSION_UNKNOWN')) permission_failure,
 count(*) filter(where first_failure in ('SOURCE_DISABLED','SOURCE_OPERATION_UNKNOWN','SOURCE_POLICY_ALIAS_CONFLICT','MATCHING_SWITCH_DISABLED','MATCHING_SWITCH_UNKNOWN')) operational_failure,
 count(*) filter(where lifecycle_state='ACTIVE_VALID' and matching_row_state='NOT_READY') row_not_ready,count(*) filter(where lifecycle_state='ACTIVE_VALID' and matching_row_state='UNKNOWN') row_unknown from failures),
first_failure as (select jsonb_object_agg(first_failure,n order by first_failure) value from (select first_failure,count(*) n from failures group by first_failure) f),
per_source as (select coalesce(jsonb_agg(jsonb_build_object('source',q.canonical_source,'total',q.total,'lifecycle_ready',q.lifecycle_ready,'matching_row_ready',q.match_row_ready,'permission_allowed',q.permission_allowed,'permission_denied',q.permission_denied,'permission_unknown',q.permission_unknown,'matching_switch_current_allowed',q.switch_current_allowed,'matching_switch_current_denied',q.switch_current_denied,'matching_switch_current_unknown',q.switch_current_unknown,'final_matching',q.final_matching,'catalog',q.catalog,'alerts',q.alerts,'seo',q.seo,'seo_row_ready',q.seo_row_ready,'seo_row_not_ready',q.seo_row_not_ready,'seo_row_unknown',q.seo_row_unknown,'seo_effective_ready',q.seo_effective_ready,'seo_permission_unknown_ready_rows',q.seo_permission_unknown_ready_rows,'seo_block_reasons',q.seo_block_reasons,'current_matching',q.current_matching,'current_catalog',q.current_catalog,'current_alerts',q.current_alerts,'current_seo',q.current_seo,'catalog_removed',greatest(q.current_catalog-q.catalog,0),'catalog_added',greatest(q.catalog-q.current_catalog,0),'matching_removed',greatest(q.current_matching-q.final_matching,0),'matching_added',greatest(q.final_matching-q.current_matching,0),'alerts_removed',greatest(q.current_alerts-q.alerts,0),'alerts_added',greatest(q.alerts-q.current_alerts,0),'seo_removed',greatest(q.current_seo-q.seo,0),'seo_added',greatest(q.seo-q.current_seo,0)) order by q.total desc,q.canonical_source),'[]'::jsonb) value from (select canonical_source,count(*) total,count(*) filter(where lifecycle_state='ACTIVE_VALID') lifecycle_ready,count(*) filter(where matching_row_state='READY') match_row_ready,count(*) filter(where matching_permission='ALLOWED') permission_allowed,count(*) filter(where matching_permission='DENIED') permission_denied,count(*) filter(where matching_permission is null or matching_permission='UNKNOWN') permission_unknown,count(*) filter(where matching_switch_state='ALLOWED') switch_current_allowed,count(*) filter(where matching_switch_state='DENIED') switch_current_denied,count(*) filter(where matching_switch_state='UNKNOWN') switch_current_unknown,count(*) filter(where final_matching_state='READY') final_matching,count(*) filter(where catalog_state='READY') catalog,count(*) filter(where alerts_state='READY') alerts,count(*) filter(where seo_state='READY') seo,count(*) filter(where seo_row_state='READY') seo_row_ready,count(*) filter(where seo_row_state='NOT_READY') seo_row_not_ready,count(*) filter(where seo_row_state='UNKNOWN') seo_row_unknown,count(*) filter(where seo_state='READY') seo_effective_ready,count(*) filter(where seo_row_state='READY' and seo_permission='UNKNOWN') seo_permission_unknown_ready_rows,coalesce((select jsonb_object_agg(reason,n) from (select seo_effective_reason reason,count(*) n from failures f where f.canonical_source=outerq.canonical_source and f.seo_state<>'READY' group by seo_effective_reason) z),'{}'::jsonb) seo_block_reasons,count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and match_eligible=true and is_enabled=true and matching_enabled=true) current_matching,count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and catalog_eligible=true and is_enabled=true and catalog_enabled=true) current_catalog,count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and alerts_eligible=true and is_enabled=true and alerts_enabled=true) current_alerts,count(*) filter(where is_active=true and verification_status='verified' and deleted_at is null and archived_at is null and deadline_state in ('OPEN','UNKNOWN') and seo_eligible=true and is_enabled=true and seo_enabled=true) current_seo from failures outerq group by canonical_source) q),
exclusions as (select jsonb_build_object('lifecycle_not_ready',(select count(*) from failures where lifecycle_state<>'ACTIVE_VALID'),'professional_thin',(select count(*) from failures where professional_state='PROFESSIONAL_THIN'),'row_match_unknown',(select count(*) from failures where matching_row_state='UNKNOWN'),'permission_denied',(select count(*) from failures where matching_permission='DENIED'),'permission_unknown',(select count(*) from failures where matching_permission is null or matching_permission='UNKNOWN'),'source_disabled',(select count(*) from failures where source_operation_state='DENIED'),'source_operation_unknown',(select count(*) from failures where source_operation_state='UNKNOWN'),'matching_switch_disabled',(select count(*) from failures where matching_switch_state='DENIED'),'matching_switch_unknown',(select count(*) from failures where matching_switch_state='UNKNOWN')) value)
select jsonb_build_object(
 'observed_at',now(),'TOTAL_INVENTORY',s.total_inventory,
 'PREDICTED_LIFECYCLE_GROUPS',jsonb_build_object('ACTIVE_VALID',s.active_valid,'INACTIVE_VALID',s.inactive_valid,'EXPIRED',s.expired,'DELETED',s.deleted,'ARCHIVED',s.archived,'HARD_DEAD',s.hard_dead,'SUPERSEDED_DUPLICATE',s.superseded_duplicate,'STALE_DERIVED_STATE',s.stale_derived_state,'LIFECYCLE_UNKNOWN',s.lifecycle_unknown),
 'PROFESSIONAL',jsonb_build_object('PROFESSIONAL_READY',s.professional_ready,'PROFESSIONAL_THIN',s.professional_thin,'PROFESSIONAL_UNKNOWN',s.professional_unknown),
 'MATCH',jsonb_build_object('MATCH_ROW_READY',s.match_row_ready,'MATCH_ROW_NOT_READY',s.match_row_not_ready,'MATCH_ROW_UNKNOWN',s.match_row_unknown),
 'SOURCE_PERMISSION',jsonb_build_object('MATCH_PERMISSION_ALLOWED',s.match_permission_allowed,'MATCH_PERMISSION_DENIED',s.match_permission_denied,'MATCH_PERMISSION_UNKNOWN',s.match_permission_unknown,'ROWS_WITH_ANY_SOURCE_PERMISSION_UNKNOWN',s.rows_with_any_source_permission_unknown,'SOURCE_PERMISSION_UNKNOWN_DIMENSION_CLAIMS',s.unknown_permission_dimension_claims),
 'SOURCE_OPERATION',jsonb_build_object('MATCH_SWITCH',jsonb_build_object('ALLOWED',s.match_switch_allowed,'DENIED',s.match_switch_denied,'UNKNOWN',s.match_switch_unknown),'SOURCE_POLICY_ALIAS_CONFLICT_ROWS',s.source_policy_alias_conflicts),
 'FINAL_MATCHING_UNIVERSE',s.final_matching_universe,'CATALOG_UNIVERSE',s.catalog_universe,'ALERT_UNIVERSE',s.alert_universe,'SEO_UNIVERSE',s.seo_universe,
 'SEO_ROW_READY',s.seo_row_ready,'SEO_ROW_NOT_READY',s.seo_row_not_ready,'SEO_ROW_UNKNOWN',s.seo_row_unknown,'SEO_ROW_RECONCILIATION_DIFFERENCE',s.total_inventory - s.seo_row_ready - s.seo_row_not_ready - s.seo_row_unknown,'SEO_EFFECTIVE_READY',s.seo_effective_ready,'SEO_PERMISSION_UNKNOWN_READY_ROWS',s.seo_permission_unknown_ready_rows,
 'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE',s.seo_content_ready_independent_of_lifecycle,
 'SEO_CONTENT_READY_WHILE_LIFECYCLE_UNRESOLVED',s.seo_content_ready_while_lifecycle_unresolved,
 'LIFECYCLE_UNRESOLVED_TOTAL',s.lifecycle_unresolved_total,'LIFECYCLE_RECOVERABLE_NOW',s.lifecycle_recoverable_now,'LIFECYCLE_REFRESH_REQUIRED',s.lifecycle_refresh_required,'LIFECYCLE_CONTENT_NOT_READY',s.lifecycle_content_not_ready,'LIFECYCLE_SYSTEM_ERROR',s.lifecycle_system_error,'LIFECYCLE_EXPLICITLY_INACTIVE_ROWS',s.lifecycle_explicitly_inactive_rows,
 'TOP_LIFECYCLE_UNRESOLVED_REASONS',(select coalesce(jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason),'[]'::jsonb) from (select lifecycle_unresolved_reason reason,count(*) n from failures where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') group by lifecycle_unresolved_reason) lifecycle_reasons),
 'LIFECYCLE_RECOVERY_PER_SOURCE',(select coalesce(jsonb_agg(jsonb_build_object('source',q.canonical_source,'lifecycle_unresolved_total',q.unresolved,'seo_content_ready_while_lifecycle_unresolved',q.content_ready,'recovery',q.recovery,'top_reasons',q.reasons) order by q.unresolved desc,q.canonical_source),'[]'::jsonb) from (select canonical_source,count(*) unresolved,count(*) filter(where seo_content_state='READY') content_ready,coalesce((select jsonb_object_agg(recovery_class,n) from (select lifecycle_recovery_class recovery_class,count(*) n from failures f where f.canonical_source=u.canonical_source and f.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') group by lifecycle_recovery_class) r),'{}'::jsonb) recovery,coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason) from (select lifecycle_unresolved_reason reason,count(*) n from failures f where f.canonical_source=u.canonical_source and f.lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') group by lifecycle_unresolved_reason) r),'[]'::jsonb) reasons from failures u where lifecycle_state in ('LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE') group by canonical_source) q),
 'TOP_SEO_BLOCK_REASONS',(select coalesce(jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason),'[]'::jsonb) from (select seo_effective_reason reason,count(*) n from failures where seo_state<>'READY' group by seo_effective_reason) seo_reasons),
 'TOP_SEO_CONTENT_BLOCK_REASONS',(select coalesce(jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason),'[]'::jsonb) from (select seo_content_reason reason,count(*) n from failures where seo_content_state='NOT_READY' group by seo_content_reason) seo_content_reasons),
 'SEO_CONTENT_REASONS_PER_SOURCE',(select coalesce(jsonb_agg(jsonb_build_object('source',q.canonical_source,'content_ready',q.ready,'content_not_ready',q.not_ready,'reasons',q.reasons) order by q.total desc,q.canonical_source),'[]'::jsonb) from (select canonical_source,count(*) total,count(*) filter(where seo_content_state='READY') ready,count(*) filter(where seo_content_state='NOT_READY') not_ready,coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by n desc,reason) from (select seo_content_reason reason,count(*) n from failures f where f.canonical_source=u.canonical_source and seo_content_state='NOT_READY' group by seo_content_reason) r),'[]'::jsonb) reasons from failures u group by canonical_source) q),
 'ROUTING_UNRESOLVED_ROWS',s.routing_unresolved_total,'ROWS_WITH_ANY_SOURCE_PERMISSION_UNKNOWN',s.rows_with_any_source_permission_unknown,'SOURCE_PERMISSION_UNKNOWN_DIMENSION_CLAIMS',s.unknown_permission_dimension_claims,'REPAIRABLE_ROWS',s.repairable_rows,'SOURCE_POLICY_ALIAS_CONFLICT_ROWS',s.source_policy_alias_conflicts,'FIRST_FAILURE',ff.value,'WHY_NOT_MATCH_UNIVERSE',e.value,'PER_SOURCE',ps.value,
 'TEMP_LEGACY_SEO_EXCEPTION',jsonb_build_object('name','TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09','source','computrabajo','consumer','seo','scope','existing-first-party-seo-only','legacy_created_on_or_before','2026-10-03','permission_state','DENIED','state',case when (now() at time zone 'UTC')::date<=date '2026-10-09' then 'ACTIVE' else 'EXPIRED' end,'expires_on_inclusive','2026-10-09','applied_only_for','SEO_READY + seo_eligible=true + seo_status=eligible + created_at<=2026-10-03 + source enabled + SEO switch enabled','active_rows',s.temporary_legacy_seo_exception_active_rows,'reason','Preserves qualifying legacy first-party SEO rows through 2026-10-09 UTC inclusive; never grants permission or another consumer.'),
 'CURRENT_VS_PREDICTED_IMPACT',jsonb_build_object('CURRENT_PUBLIC_CATALOG',s.current_catalog,'PREDICTED_CATALOG_UNIVERSE',s.catalog_universe,'CATALOG_ROWS_REMOVED',greatest(s.current_catalog-s.catalog_universe,0),'CATALOG_ROWS_ADDED',greatest(s.catalog_universe-s.current_catalog,0),'CURRENT_MATCHING_UNIVERSE',s.current_matching,'PREDICTED_FINAL_MATCHING_UNIVERSE',s.final_matching_universe,'MATCH_ROWS_REMOVED',greatest(s.current_matching-s.final_matching_universe,0),'MATCH_ROWS_ADDED',greatest(s.final_matching_universe-s.current_matching,0),'CURRENT_ALERT_UNIVERSE',s.current_alerts,'PREDICTED_ALERT_UNIVERSE',s.alert_universe,'CURRENT_SEO_UNIVERSE',s.current_seo,'PREDICTED_SEO_UNIVERSE',s.seo_universe),
 'RECONCILIATION_DIFFERENCE',jsonb_build_object('lifecycle',s.total_inventory-(s.active_valid+s.inactive_valid+s.expired+s.deleted+s.archived+s.hard_dead+s.superseded_duplicate+s.stale_derived_state+s.lifecycle_unknown),'matching_first_failure',s.total_inventory-(select coalesce(sum(n),0) from (select count(*) n from failures group by first_failure) groups),'active_matching',mc.lifecycle_ready-(mc.ready+mc.permission_failure+mc.operational_failure+mc.row_not_ready+mc.row_unknown),'difference',(select count(*) from failures)-(s.active_valid+s.inactive_valid+s.expired+s.deleted+s.archived+s.hard_dead+s.superseded_duplicate+s.stale_derived_state+s.lifecycle_unknown)),
 'RETRIEVAL_SCHEMA_PRESENCE',jsonb_build_object('opportunity_universe_state',to_regclass('public.opportunity_universe_state') is not null,'states',to_regclass('public.matching_retrieval_states') is not null,'candidates',to_regclass('public.matching_retrieval_candidates') is not null,'score_rpc',to_regprocedure('public.score_opportunity_embeddings(public.vector,text[])') is not null,'prune_rpc',to_regprocedure('public.prune_matching_retrieval_candidates()') is not null)
) as opportunity_universe_preflight
from summary s cross join first_failure ff cross join per_source ps cross join exclusions e cross join match_counts mc;
`
writeFileSync(resolve(out, 'preflight-prod.sql'), preflightSql, 'utf8')
const verifySql = `-- POST-APPLY READ ONLY verification. One JSON result, each invariant explicit.
with u as (select public.get_opportunity_universe_summary() summary),
inv as (select count(*) n from public.opportunities),
st as (select count(*) n, count(*) filter(where lifecycle_state='ACTIVE_VALID') active_valid,
 count(*) filter(where lifecycle_state='INACTIVE_VALID') inactive_valid,count(*) filter(where lifecycle_state='EXPIRED') expired,
 count(*) filter(where lifecycle_state='DELETED') deleted,count(*) filter(where lifecycle_state='ARCHIVED') archived,
 count(*) filter(where lifecycle_state='HARD_DEAD') hard_dead,count(*) filter(where lifecycle_state='SUPERSEDED_DUPLICATE') superseded,
 count(*) filter(where lifecycle_state='STALE_DERIVED_STATE') stale,count(*) filter(where lifecycle_state='LIFECYCLE_UNKNOWN') lifecycle_unknown,
 count(*) filter(where catalog_state='READY') catalog_ready,count(*) filter(where final_matching_state='READY') matching_ready,
 count(*) filter(where alerts_state='READY') alerts_ready,count(*) filter(where seo_state='READY') seo_ready,
 count(*) filter(where cardinality(unresolved_dimensions)>0) routing_unresolved,
 count(*) filter(where cardinality(source_permission_unknown_dimensions)>0) permission_unknown_rows,
 coalesce(sum(cardinality(source_permission_unknown_dimensions)),0) permission_unknown_claims
 from public.opportunity_universe_state),
mf as (select coalesce(sum(n),0) n from (select count(*) n from public.opportunity_universe_state group by case
 when lifecycle_state<>'ACTIVE_VALID' then 'LIFECYCLE'
 when matching_row_state='NOT_READY' then 'MATCH_ROW_NOT_READY'
 when matching_row_state='UNKNOWN' then 'MATCH_ROW_UNKNOWN'
 when source_operational_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT'
 when source_matching_state='DENIED' then 'SOURCE_MATCH_DENIED'
 when source_matching_state='UNKNOWN' then 'SOURCE_MATCH_UNKNOWN'
 when source_matching_operational_state='DENIED' then 'SOURCE_MATCHING_DISABLED'
 when source_matching_operational_state='UNKNOWN' then 'SOURCE_MATCHING_UNKNOWN'
 when source_operational_state='DISABLED' then 'SOURCE_DISABLED'
 when source_operational_state='UNKNOWN' then 'SOURCE_OPERATION_UNKNOWN'
 else 'FINAL_MATCHING_UNIVERSE' end) g),
pc as (select count(distinct canonical_source) sources,count(distinct consumer) dimensions,count(*) rows,
 count(*)-count(distinct (canonical_source,consumer)) duplicate_rows,
 count(*) filter(where permission_state='UNKNOWN') unknown_permission_rows
 from public.opportunity_source_consumer_permissions),
perm_dims as (select coalesce(jsonb_agg(jsonb_build_object('dimension',consumer,'ALLOWED',allowed,'DENIED',denied,'UNKNOWN',unknown_count,'NOT_APPLICABLE',not_applicable) order by consumer),'[]'::jsonb) value
 from (select consumer,count(*) filter(where permission_state='ALLOWED') allowed,count(*) filter(where permission_state='DENIED') denied,count(*) filter(where permission_state='UNKNOWN') unknown_count,count(*) filter(where permission_state='NOT_APPLICABLE') not_applicable from public.opportunity_source_consumer_permissions group by consumer) p),
aliases as (select count(*) n,count(*)-count(distinct emitted_source) duplicate_aliases from public.opportunity_source_identity_aliases),
conflicts as (select count(*) n from public.opportunity_sources s where (public.canonical_opportunity_source_policy(s.source)->>'alias_conflict')::boolean),
permission_semantics as (select count(*) filter(where permission_state not in ('ALLOWED','DENIED','UNKNOWN','NOT_APPLICABLE')) invalid_states from public.opportunity_source_consumer_permissions),
 retrieval as (select count(*) filter(where scan_kind='FULL' and scan_status='COMPLETE' and scan_target_count<>(select matching_ready from st)) full_denominator_mismatch from public.matching_retrieval_states),
 retrieval_state_quality as (select count(*) filter(where profile_signature is null or profile_signature='' or source_policy_signature is null or source_policy_signature='' or scan_kind not in ('FULL','DELTA') or scan_status not in ('PENDING','SCANNING','COMPLETE','ERROR') or examined_count<0 or target_count<0 or candidate_count<0) invalid_states from public.matching_retrieval_states),
 retrieval_candidate_quality as (select count(*) filter(where profile_signature is null or profile_signature='' or opportunity_content_fingerprint is null or opportunity_content_fingerprint='' or candidate_class not in ('MATCH','POTENTIAL') or evaluation_lane not in ('FULL_BACKFILL','INCREMENTAL') or cardinality(retrieval_lanes)=0) invalid_candidates from public.matching_retrieval_candidates),
stale_candidates as (select count(*) n from public.matching_retrieval_candidates c left join public.opportunity_universe_state u on u.opportunity_id=c.opportunity_id where u.opportunity_id is null or u.final_matching_state<>'READY'),
backfill_alerts as (select count(*) n from public.matching_retrieval_candidates c join public.match_alert_deliveries a on a.opportunity_id::text=c.opportunity_id where c.evaluation_lane='FULL_BACKFILL' and a.status='sent'),
repair as (select count(*) n from public.opportunity_universe_state u join public.opportunities o on o.id::text=u.opportunity_id
 where u.lifecycle_repair is not null and o.is_active is distinct from (u.lifecycle_repair->>'is_active')::boolean),
repair_audit as (select (select count(*) from public.opportunity_lifecycle_repair_audit) n,(select count(*) from public.opportunity_lifecycle_repair_audit a left join public.opportunity_source_observations obs on obs.id=a.observation_id where obs.id is null or obs.opportunity_id::text<>a.opportunity_id
 or not ((a.reason='LATEST_HARD_DEAD_OBSERVATION' and obs.identity_status in ('DEAD','REMOVED') and obs.http_status in (404,410))
 or (a.reason='LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE' and obs.identity_status='IDENTITY_CONFIRMED' and obs.http_status=200))) invalid_provenance,
 coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by reason) from (select reason,count(*) n from public.opportunity_lifecycle_repair_audit group by reason) reasons),'[]'::jsonb) by_reason),
views as (select (select count(*) from public.opportunity_catalog_universe) catalog_count,(select count(*) from public.opportunity_final_matching_universe) matching_count,
 (select count(*) from public.opportunity_alert_universe) alerts_count,(select count(*) from public.opportunity_seo_universe) seo_count)
select jsonb_build_object('observed_at',now(),'TOTAL_INVENTORY',inv.n,
 'PREDICTED_FINAL_MATCHING_UNIVERSE',(u.summary->>'final_matching_universe')::bigint,'ACTUAL_FINAL_MATCHING_UNIVERSE',st.matching_ready,
 'PREDICTED_CATALOG_UNIVERSE',(u.summary->>'catalog_universe')::bigint,'ACTUAL_CATALOG_UNIVERSE',views.catalog_count,
 'PREDICTED_ALERT_UNIVERSE',(u.summary->>'alert_universe')::bigint,'ACTUAL_ALERT_UNIVERSE',views.alerts_count,
 'PREDICTED_SEO_UNIVERSE',(u.summary->>'seo_universe')::bigint,'ACTUAL_SEO_UNIVERSE',views.seo_count,
 'ACTUAL_LIFECYCLE_GROUPS',jsonb_build_object('ACTIVE_VALID',st.active_valid,'INACTIVE_VALID',st.inactive_valid,'EXPIRED',st.expired,'DELETED',st.deleted,'ARCHIVED',st.archived,'HARD_DEAD',st.hard_dead,'SUPERSEDED_DUPLICATE',st.superseded,'STALE_DERIVED_STATE',st.stale,'LIFECYCLE_UNKNOWN',st.lifecycle_unknown),
 'ROUTING_UNRESOLVED_ROWS',st.routing_unresolved,'ROWS_WITH_ANY_SOURCE_PERMISSION_UNKNOWN',st.permission_unknown_rows,'SOURCE_PERMISSION_UNKNOWN_DIMENSION_CLAIMS',st.permission_unknown_claims,
 'INVARIANTS',jsonb_build_object(
 'INVENTORY_STATE_COVERAGE',jsonb_build_object('status',case when inv.n=st.n then 'PASS' else 'FAIL' end,'difference',inv.n-st.n),
 'LIFECYCLE_PARTITION',jsonb_build_object('status',case when inv.n=st.active_valid+st.inactive_valid+st.expired+st.deleted+st.archived+st.hard_dead+st.superseded+st.stale+st.lifecycle_unknown then 'PASS' else 'FAIL' end,'difference',inv.n-(st.active_valid+st.inactive_valid+st.expired+st.deleted+st.archived+st.hard_dead+st.superseded+st.stale+st.lifecycle_unknown)),
 'MATCHING_FIRST_FAILURE_PARTITION',jsonb_build_object('status',case when inv.n=mf.n then 'PASS' else 'FAIL' end,'difference',inv.n-mf.n),
 'CATALOG_VIEW_PARITY',case when views.catalog_count=st.catalog_ready then 'PASS' else 'FAIL' end,'MATCHING_VIEW_PARITY',case when views.matching_count=st.matching_ready then 'PASS' else 'FAIL' end,'ALERT_VIEW_PARITY',case when views.alerts_count=st.alerts_ready then 'PASS' else 'FAIL' end,'SEO_VIEW_PARITY',case when views.seo_count=st.seo_ready then 'PASS' else 'FAIL' end,
 'PERMISSION_REGISTRY_105X10',case when pc.sources=105 and pc.dimensions=10 and pc.rows=1050 and pc.duplicate_rows=0 then 'PASS' else 'FAIL' end,
 'ALIASES_EXPECTED_COUNT',jsonb_build_object('status',case when aliases.n=${identityRows.size} and aliases.duplicate_aliases=0 then 'PASS' else 'FAIL' end,'actual',aliases.n,'expected',${identityRows.size}),
 'SOURCE_POLICY_ALIAS_CONFLICTS',jsonb_build_object('status',case when conflicts.n=0 then 'PASS' else 'FAIL' end,'count',conflicts.n),'PERMISSION_UNKNOWN_PRESERVED',case when permission_semantics.invalid_states=0 then 'PASS' else 'FAIL' end,'INVALID_PERMISSION_STATES',permission_semantics.invalid_states,'UNKNOWN_NOT_DENIED',case when not exists(select 1 from public.opportunity_universe_state s left join public.opportunity_source_consumer_permissions p on p.canonical_source=s.provenance->>'source' and p.consumer='matching' where s.source_matching_state is distinct from coalesce(p.permission_state,'UNKNOWN')) then 'PASS' else 'FAIL' end,
 'LIFECYCLE_REPAIR_AUDIT',jsonb_build_object('status',case when repair_audit.invalid_provenance=0 and repair.n=0 then 'PASS' else 'FAIL' end,'repair_count',repair_audit.n,'invalid_observation_provenance',repair_audit.invalid_provenance,'by_reason',repair_audit.by_reason,'unapplied_repair_proposals',repair.n),
  'RETRIEVAL_SCHEMA_PRESENT',case when to_regclass('public.matching_retrieval_states') is not null and to_regclass('public.matching_retrieval_candidates') is not null and to_regprocedure('public.score_opportunity_embeddings(public.vector,text[])') is not null and to_regprocedure('public.prune_matching_retrieval_candidates()') is not null then 'PASS' else 'FAIL' end,
  'RETRIEVAL_FULL_DENOMINATOR_MISMATCHES',jsonb_build_object('status',case when retrieval.full_denominator_mismatch=0 then 'PASS' else 'FAIL' end,'count',retrieval.full_denominator_mismatch),'STALE_RETRIEVAL_CANDIDATES_OUTSIDE_UNIVERSE',jsonb_build_object('status',case when stale_candidates.n=0 then 'PASS' else 'FAIL' end,'count',stale_candidates.n),'SENT_ALERTS_FROM_FULL_BACKFILL',jsonb_build_object('status',case when backfill_alerts.n=0 then 'PASS' else 'FAIL' end,'count',backfill_alerts.n),
  'RETRIEVAL_STATE_STRUCTURAL_VALIDITY',jsonb_build_object('status',case when rsq.invalid_states=0 and rcq.invalid_candidates=0 then 'PASS' else 'FAIL' end,'invalid_states',rsq.invalid_states,'invalid_candidates',rcq.invalid_candidates),
  'CANARY_READINESS',case when to_regclass('public.matching_retrieval_states') is not null and rsq.invalid_states=0 and rcq.invalid_candidates=0 and stale_candidates.n=0 then 'PASS' else 'FAIL' end),
 'REGISTRY',jsonb_build_object('canonical_sources',pc.sources,'dimensions',pc.dimensions,'permission_rows',pc.rows,'duplicate_rows',pc.duplicate_rows,'unknown_permission_rows',pc.unknown_permission_rows,'permission_dimension_states',pd.value,'aliases',aliases.n),
 'OPPORTUNITY_UNIVERSE_SUMMARY',u.summary) as opportunity_universe_post_apply_verification
from u cross join inv cross join st cross join mf cross join pc cross join perm_dims pd cross join aliases cross join conflicts cross join permission_semantics cross join retrieval cross join retrieval_state_quality rsq cross join retrieval_candidate_quality rcq cross join stale_candidates cross join backfill_alerts cross join repair cross join repair_audit cross join views;
`
const verifyUniverseSql = `-- POST-UNIVERSE PRE-RETRIEVAL READ ONLY verification. Universe objects only; one JSON result with explicit invariants.
with u as (select public.get_opportunity_universe_summary() summary),
inv as (select count(*) n from public.opportunities),
st as (select count(*) n, count(*) filter(where lifecycle_state='ACTIVE_VALID') active_valid,
 count(*) filter(where lifecycle_state='INACTIVE_VALID') inactive_valid,count(*) filter(where lifecycle_state='EXPIRED') expired,
 count(*) filter(where lifecycle_state='DELETED') deleted,count(*) filter(where lifecycle_state='ARCHIVED') archived,
 count(*) filter(where lifecycle_state='HARD_DEAD') hard_dead,count(*) filter(where lifecycle_state='SUPERSEDED_DUPLICATE') superseded,
 count(*) filter(where lifecycle_state='STALE_DERIVED_STATE') stale,count(*) filter(where lifecycle_state='LIFECYCLE_UNKNOWN') lifecycle_unknown,
 count(*) filter(where catalog_state='READY') catalog_ready,count(*) filter(where final_matching_state='READY') matching_ready,
 count(*) filter(where alerts_state='READY') alerts_ready,count(*) filter(where seo_state='READY') seo_ready,
 count(*) filter(where cardinality(unresolved_dimensions)>0) routing_unresolved,
 count(*) filter(where cardinality(source_permission_unknown_dimensions)>0) permission_unknown_rows,
 coalesce(sum(cardinality(source_permission_unknown_dimensions)),0) permission_unknown_claims
 from public.opportunity_universe_state),
mf as (select coalesce(sum(n),0) n from (select count(*) n from public.opportunity_universe_state group by case
 when lifecycle_state<>'ACTIVE_VALID' then 'LIFECYCLE'
 when matching_row_state='NOT_READY' then 'MATCH_ROW_NOT_READY'
 when matching_row_state='UNKNOWN' then 'MATCH_ROW_UNKNOWN'
 when source_operational_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT'
 when source_matching_state='DENIED' then 'SOURCE_MATCH_DENIED'
 when source_matching_state='UNKNOWN' then 'SOURCE_MATCH_UNKNOWN'
 when source_matching_operational_state='DENIED' then 'SOURCE_MATCHING_DISABLED'
 when source_matching_operational_state='UNKNOWN' then 'SOURCE_MATCHING_UNKNOWN'
 when source_operational_state='DISABLED' then 'SOURCE_DISABLED'
 when source_operational_state='UNKNOWN' then 'SOURCE_OPERATION_UNKNOWN'
 else 'FINAL_MATCHING_UNIVERSE' end) g),
pc as (select count(distinct canonical_source) sources,count(distinct consumer) dimensions,count(*) rows,
 count(*)-count(distinct (canonical_source,consumer)) duplicate_rows,
 count(*) filter(where permission_state='UNKNOWN') unknown_permission_rows
 from public.opportunity_source_consumer_permissions),
perm_dims as (select coalesce(jsonb_agg(jsonb_build_object('dimension',consumer,'ALLOWED',allowed,'DENIED',denied,'UNKNOWN',unknown_count,'NOT_APPLICABLE',not_applicable) order by consumer),'[]'::jsonb) value
 from (select consumer,count(*) filter(where permission_state='ALLOWED') allowed,count(*) filter(where permission_state='DENIED') denied,count(*) filter(where permission_state='UNKNOWN') unknown_count,count(*) filter(where permission_state='NOT_APPLICABLE') not_applicable from public.opportunity_source_consumer_permissions group by consumer) p),
aliases as (select count(*) n,count(*)-count(distinct emitted_source) duplicate_aliases from public.opportunity_source_identity_aliases),
conflicts as (select count(*) n from public.opportunity_sources s where (public.canonical_opportunity_source_policy(s.source)->>'alias_conflict')::boolean),
permission_semantics as (select count(*) filter(where permission_state not in ('ALLOWED','DENIED','UNKNOWN','NOT_APPLICABLE')) invalid_states from public.opportunity_source_consumer_permissions),
repair as (select count(*) n from public.opportunity_universe_state u join public.opportunities o on o.id::text=u.opportunity_id
 where u.lifecycle_repair is not null and o.is_active is distinct from (u.lifecycle_repair->>'is_active')::boolean),
repair_audit as (select (select count(*) from public.opportunity_lifecycle_repair_audit) n,(select count(*) from public.opportunity_lifecycle_repair_audit a left join public.opportunity_source_observations obs on obs.id=a.observation_id where obs.id is null or obs.opportunity_id::text<>a.opportunity_id
 or not ((a.reason='LATEST_HARD_DEAD_OBSERVATION' and obs.identity_status in ('DEAD','REMOVED') and obs.http_status in (404,410))
 or (a.reason='LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE' and obs.identity_status='IDENTITY_CONFIRMED' and obs.http_status=200))) invalid_provenance,
 coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by reason) from (select reason,count(*) n from public.opportunity_lifecycle_repair_audit group by reason) reasons),'[]'::jsonb) by_reason),
views as (select (select count(*) from public.opportunity_catalog_universe) catalog_count,(select count(*) from public.opportunity_final_matching_universe) matching_count,
 (select count(*) from public.opportunity_alert_universe) alerts_count,(select count(*) from public.opportunity_seo_universe) seo_count)
select jsonb_build_object('observed_at',now(),'TOTAL_INVENTORY',inv.n,
 'PREDICTED_FINAL_MATCHING_UNIVERSE',(u.summary->>'final_matching_universe')::bigint,'ACTUAL_FINAL_MATCHING_UNIVERSE',st.matching_ready,
 'PREDICTED_CATALOG_UNIVERSE',(u.summary->>'catalog_universe')::bigint,'ACTUAL_CATALOG_UNIVERSE',views.catalog_count,
 'PREDICTED_ALERT_UNIVERSE',(u.summary->>'alert_universe')::bigint,'ACTUAL_ALERT_UNIVERSE',views.alerts_count,
 'PREDICTED_SEO_UNIVERSE',(u.summary->>'seo_universe')::bigint,'ACTUAL_SEO_UNIVERSE',views.seo_count,
 'ACTUAL_LIFECYCLE_GROUPS',jsonb_build_object('ACTIVE_VALID',st.active_valid,'INACTIVE_VALID',st.inactive_valid,'EXPIRED',st.expired,'DELETED',st.deleted,'ARCHIVED',st.archived,'HARD_DEAD',st.hard_dead,'SUPERSEDED_DUPLICATE',st.superseded,'STALE_DERIVED_STATE',st.stale,'LIFECYCLE_UNKNOWN',st.lifecycle_unknown),
 'ROUTING_UNRESOLVED_ROWS',st.routing_unresolved,'ROWS_WITH_ANY_SOURCE_PERMISSION_UNKNOWN',st.permission_unknown_rows,'SOURCE_PERMISSION_UNKNOWN_DIMENSION_CLAIMS',st.permission_unknown_claims,
 'INVARIANTS',jsonb_build_object(
 'INVENTORY_STATE_COVERAGE',jsonb_build_object('status',case when inv.n=st.n then 'PASS' else 'FAIL' end,'difference',inv.n-st.n),
 'LIFECYCLE_PARTITION',jsonb_build_object('status',case when inv.n=st.active_valid+st.inactive_valid+st.expired+st.deleted+st.archived+st.hard_dead+st.superseded+st.stale+st.lifecycle_unknown then 'PASS' else 'FAIL' end,'difference',inv.n-(st.active_valid+st.inactive_valid+st.expired+st.deleted+st.archived+st.hard_dead+st.superseded+st.stale+st.lifecycle_unknown)),
 'MATCHING_FIRST_FAILURE_PARTITION',jsonb_build_object('status',case when inv.n=mf.n then 'PASS' else 'FAIL' end,'difference',inv.n-mf.n),
 'CATALOG_VIEW_PARITY',case when views.catalog_count=st.catalog_ready then 'PASS' else 'FAIL' end,'MATCHING_VIEW_PARITY',case when views.matching_count=st.matching_ready then 'PASS' else 'FAIL' end,'ALERT_VIEW_PARITY',case when views.alerts_count=st.alerts_ready then 'PASS' else 'FAIL' end,'SEO_VIEW_PARITY',case when views.seo_count=st.seo_ready then 'PASS' else 'FAIL' end,
 'PERMISSION_REGISTRY_105X10',case when pc.sources=105 and pc.dimensions=10 and pc.rows=1050 and pc.duplicate_rows=0 then 'PASS' else 'FAIL' end,
 'ALIASES_EXPECTED_COUNT',jsonb_build_object('status',case when aliases.n=${identityRows.size} and aliases.duplicate_aliases=0 then 'PASS' else 'FAIL' end,'actual',aliases.n,'expected',${identityRows.size}),
 'SOURCE_POLICY_ALIAS_CONFLICTS',jsonb_build_object('status',case when conflicts.n=0 then 'PASS' else 'FAIL' end,'count',conflicts.n),'PERMISSION_UNKNOWN_PRESERVED',case when permission_semantics.invalid_states=0 then 'PASS' else 'FAIL' end,'INVALID_PERMISSION_STATES',permission_semantics.invalid_states,'UNKNOWN_NOT_DENIED',case when not exists(select 1 from public.opportunity_universe_state s left join public.opportunity_source_consumer_permissions p on p.canonical_source=s.provenance->>'source' and p.consumer='matching' where s.source_matching_state is distinct from coalesce(p.permission_state,'UNKNOWN')) then 'PASS' else 'FAIL' end,
 'LIFECYCLE_REPAIR_AUDIT',jsonb_build_object('status',case when repair_audit.invalid_provenance=0 and repair.n=0 then 'PASS' else 'FAIL' end,'repair_count',repair_audit.n,'invalid_observation_provenance',repair_audit.invalid_provenance,'by_reason',repair_audit.by_reason,'unapplied_repair_proposals',repair.n)),
 'REGISTRY',jsonb_build_object('canonical_sources',pc.sources,'dimensions',pc.dimensions,'permission_rows',pc.rows,'duplicate_rows',pc.duplicate_rows,'unknown_permission_rows',pc.unknown_permission_rows,'permission_dimension_states',pd.value,'aliases',aliases.n),
 'OPPORTUNITY_UNIVERSE_SUMMARY',u.summary) as opportunity_universe_post_universe_verification
from u cross join inv cross join st cross join mf cross join pc cross join perm_dims pd cross join aliases cross join conflicts cross join permission_semantics cross join repair cross join repair_audit cross join views;
`
const preRetrievalLeaks = verifyUniverseSql.match(/matching_retrieval_states|matching_retrieval_candidates|score_opportunity_embeddings|prune_matching_retrieval_candidates|match_alert_deliveries/g) || []
if (preRetrievalLeaks.length) throw new Error(`PRE_RETRIEVAL_VERIFIER_REFERENCES_RETRIEVAL_SCHEMA:${[...new Set(preRetrievalLeaks)].join(',')}`)
writeFileSync(resolve(out, 'verify-universe-prod.sql'), verifyUniverseSql, 'utf8')
writeFileSync(resolve(out, 'verify-prod.sql'), verifySql, 'utf8')

const coverage = sourcePermissionCoverage()
const materialRows = coverage.per_source.map(row => `| ${row.canonical_source} | ${row.unknown_dimensions.length ? `UNKNOWN: ${row.unknown_dimensions.join(', ')}` : 'No UNKNOWN dimensions'} |`).join('\n')
const dimensionCoverageRows = SOURCE_PERMISSION_DIMENSIONS.map(dimension => {
  const states = (coverage.permission_dimensions as any)[dimension]
  return `| ${dimension.toUpperCase()} | ${states.ALLOWED} | ${states.DENIED} | ${states.UNKNOWN} | ${states.NOT_APPLICABLE} |`
}).join('\n')
const coverageMarkdown = `# Canonical source permission coverage\n\nReview date: ${SOURCE_PERMISSION_REVIEWED_AT}. This is repository/official-document evidence, not PROD state. UNKNOWN means no affirmative evidence; it does not mean DENIED.\n\n- canonical_sources_total: ${coverage.canonical_sources_total}\n- fully_resolved_sources (all 10 dimensions non-UNKNOWN): ${coverage.fully_resolved_sources}\n- partially_resolved_sources: ${coverage.partially_resolved_sources}\n- unknown_sources (all dimensions UNKNOWN): ${coverage.unknown_sources}\n- inventory_sources_total (14-source 2026-09-28 observation set): ${coverage.inventory_sources_total}\n- inventory_sources_fully_resolved: ${coverage.inventory_sources_fully_resolved}\n- inventory_sources_with_unknown_permission: ${coverage.inventory_sources_with_unknown_permission}\n\nThe historical inventory-source set is not asserted to be the current full PROD source set; run preflight-prod.sql for current per-source rows.\n\n| Material permission dimension | ALLOWED | DENIED | UNKNOWN | NOT_APPLICABLE |\n|---|---:|---:|---:|---:|\n${dimensionCoverageRows}\n\n| Material source | Exactly unresolved dimensions |\n|---|---|\n${materialRows}\n\nFor each listed dimension, missing evidence means affirmative permission for that exact use: acquisition-method authorization (COLLECT/DETAIL_FETCH), consumer reuse (CATALOG/MATCHING/ALERTS), indexing/distribution (SEO_INDEX/GOOGLE_JOBS/THIRD_PARTY_DISTRIBUTION), legal source application route, or attribution obligation. Source registry booleans and observed scraper behavior are not permission evidence.\n\n## Evidence with explicit scope\n\n- Himalayas: checked-in source permission model; consumer permissions are separate; SEO/search and third-party restrictions retained.\n- Remotive: official API terms permit attributed/link-backed API use and prohibit third-party job-platform redistribution; SEO remains UNKNOWN.\n- WWR: RSS permission is limited to attributed RSS use; API terms restrict job-search services and scraping/detail HTML is not granted by RSS permission. Detail fetch remains denied/review-required.\n- Jobicy: public API/RSS product integration is documented; only collection is resolved, broader reuse stays UNKNOWN.\n- Arbeitnow: official terms allow documented API use with linkback; downstream consumer scopes remain UNKNOWN.\n- Impactpool and Fundación Carolina: official terms/legal notice prohibit unlicensed extraction/reuse; where observed acquisition is scraping/extraction, collection/detail and content reuse fail closed.\n`
const reviewedCoverageMarkdown = coverageMarkdown
  .replace(/- inventory_sources_total[^\n]*\n- inventory_sources_fully_resolved[^\n]*\n- inventory_sources_with_unknown_permission[^\n]*\n\nThe historical inventory-source set[^\n]*\n\n/, '- current PROD inventory-source counts: NOT OBSERVED; derive the material source universe from every row in preflight-prod.sql PER_SOURCE output, never from a fixed list.\n\n')
  .replace('Material permission dimension', 'Canonical permission dimension (all registry sources)')
  .replace('Material source', 'Canonical source')
  .replace('WWR: RSS permission is limited to attributed RSS use; API terms restrict job-search services and scraping/detail HTML is not granted by RSS permission. Detail fetch remains denied/review-required.', 'WWR: official API terms prohibit using API or WWR data to build a job advertising/job-search service and prohibit scraping/copying/storing; no separate official RSS grant for CVitae’s exact use is evidenced. Affected catalog/matching/alerts are denied; detail fetch is denied; unrelated distribution dimensions remain independently UNKNOWN.')
  .replace('Jobicy: public API/RSS product integration is documented; only collection is resolved, broader reuse stays UNKNOWN.', 'Jobicy: official API documentation updated 2026-09-16 permits normal integrations in own products/user experiences (including job boards, newsletters, career tools, AI assistants and internal apps), preserves canonical URL/attribution, and caps polling at hourly. Catalog, matching, alerts and source-link application routing are ALLOWED; SEO/indexing and third-party distribution remain UNKNOWN.')
  .replace('Arbeitnow: official terms allow documented API use with linkback; downstream consumer scopes remain UNKNOWN.', 'Arbeitnow: official terms say API use requires a link back and may be revoked; the general terms restrict copying, public display and mirroring. Only API collection/linkback are resolved; downstream reuse remains UNKNOWN pending scope-specific authorization.')
writeFileSync(resolve(out, 'source-permission-coverage.md'), reviewedCoverageMarkdown, 'utf8')
writeFileSync(resolve(out, 'prod-apply-schema.sql'), schemaSql, 'utf8')
writeFileSync(resolve(out, 'prod-compile-transaction.sql'), compileTransactionSql, 'utf8')
writeFileSync(resolve(out, 'check-partial-schema-prod.sql'), partialSchemaCheckSql, 'utf8')
writeFileSync(resolve(out, 'prod-apply-retrieval.sql'), retrievalSql, 'utf8')
writeFileSync(resolve(out, 'preflight-retrieval-prod-dependencies.sql'), retrievalDependencyPreflightSql, 'utf8')
writeFileSync(resolve(out, 'prod-apply.sql'), applySql, 'utf8')

const plan = [
  '# Opportunity Universe — production apply plan', '',
  'Status: PREFLIGHT READY_NOT_RUN. PROD apply is NOT AUTHORIZED; no production mutation was performed.', '',
  '## Frozen 2026-09-28 baseline', '',
  'TOTAL 16,405; first-failure groups: inactive/unknown 9,272, expired 91, source matching disabled 6,460, match eligibility unexplained 429, source allowed 153. Sum = 16,405.',
  'Persisted MATCH_ELIGIBLE 6,476 is historical state, not candidate eligibility truth. Retrieval objects were reported ABSENT.', '',
  '## Apply order (separate calls; no unbounded SQL transaction)', '',
  '1. After explicit authorization and successful PROD preflight, run prod-apply-schema.sql. It installs additive schema, canonical reducer, permission seed and future triggers, but performs no full-inventory lifecycle repair.',
  '2. Run scripts/apply_opportunity_universe_prod.ts --apply --confirm YES --page-size 250 --max-pages 4. It calls reconciliation once per transaction, saves a local cursor after each successful page, and resumes after failures.',
  '3. Require runner complete=true and run verify-prod.sql; every invariant must pass before proceeding.',
  '4. Only then apply prod-apply-retrieval.sql and rerun verify-prod.sql. prod-apply.sql is a non-executable pointer.', '',
  `The canonical permission registry covers ${(registry as any).sources.length} sources × ${SOURCE_PERMISSION_DIMENSIONS.length} independent dimensions. UNKNOWN remains distinct from DENIED; evidence and scope are retained per dimension. Legacy consumer switches remain operator-controlled and independent; effective states combine each switch with the corresponding canonical permission. Current inventory-source coverage is not hardcoded; exact PROD source counts and unresolved dimensions come from preflight-prod.sql PER_SOURCE output.`, '',
  'Historical repair requires a newer linked hard-dead HTTP 404/410 observation or a newer linked HTTP 200 IDENTITY_CONFIRMED observation (restore only if verification_status is already verified). Invalid deadline timezone remains UNKNOWN. Candidate eligibility is never used as row readiness.', '',
  '## Validation', '',
  '1. Run preflight-prod.sql in Supabase SQL Editor; inspect all inventory rows, per-source deltas, UNKNOWN permission and alias conflicts.',
  '2. Require inventory/lifecycle/matching differences to be zero; UNKNOWN stays semantically distinct from operationally disabled.',
  '3. Obtain separate explicit PROD write authorization.',
  '4. Apply schema, run resumable 250-row reconciliation, then verify Universe before Retrieval schema.',
  '5. Apply Retrieval schema only after Universe validation; rerun verify-prod.sql and require every named invariant PASS.', '',
  'No destructive table drops or blind UNKNOWN-to-TRUE coercions are included.',
].join('\n')
writeFileSync(resolve(out, 'prod-apply-plan.md'), plan, 'utf8')
const releasePlan = [
  '# Opportunity Universe production release plan', '',
  'PREFLIGHT=READY_NOT_RUN; PROD_APPLY=NOT_AUTHORIZED; PROD_RUNTIME_VALIDATION=PENDING. No production write or deployment has occurred.', '',
  'Historical 2026-09-28 baseline only: TOTAL=16,405; first-failure counts 9,272 + 91 + 6,460 + 429 + 153 = 16,405. Remeasure all current values in preflight; these are not desired outcomes.', '',
  '## Complete staged order', '',
  '0. READ-ONLY PROD PREFLIGHT — execute preflight-prod.sql in Supabase SQL Editor; inspect all rows, per-source consumer deltas, permission UNKNOWNs, alias conflicts and require reconciliation difference 0.',
  '1. Obtain explicit authorization for PROD database writes and deployments.',
  '2. Apply prod-apply-schema.sql (additive schema, reducer, independent permission truth and operational controls, plus steady-state triggers only). No switch is projected from permission truth and no historical lifecycle repair occurs here.',
  '3. Run scripts/apply_opportunity_universe_prod.ts with page-size <=250. One call/transaction per page; persist local cursor only after success; resume after errors; stop on error.',
  '4. Run verify-universe-prod.sql. REQUIRE EVERY Universe invariant PASS before advancing.',
  '5. Apply prod-apply-retrieval.sql only after stage 4 passes.',
  '6. Deploy Supabase Edge match-batch runtime plus required shared modules.',
  '7. Perform ONE protected Netlify production deploy containing every changed site/function consumer. Preserve the limited deploy: no preview/debug deploy and no second production deploy.',
  '8. Activate/update the GitHub background worker/workflow only after its required authorized commit/push.',
  '9. Run final verify-prod.sql; require every Universe and Retrieval invariant PASS.',
  '10. Run deterministic single-user FULL canary with bounded pages; verify cursor/coverage and no historical alert delivery.',
  '11. Smoke actual Catalog, Sitemap/SEO, Matching, Alerts dry-run/no-send, Admin summary/row diagnostics and background worker consumers.',
  '12. Mark PROD_CONFIRMED/CLOSE only after all DB checks, runtime smoke, canary and no-alert-flood checks pass.', '',
  '## Release transition guard', '',
  'prod-apply-schema.sql installs canonical permission truth independently from operator-controlled source switches. Stage 2 is behavior-changing because effective Catalog/Matching/Alerts/SEO states are recalculated from both dimensions; permission UNKNOWN is never written as operational false.',
  'After PROD authorization, do not start Stage 2 until the preflight consumer deltas have been explicitly accepted.',
  'Do not deliberately leave the release stopped between Stage 2 and runtime cutover. Execute schema → bounded reconciliation → verify-universe → Retrieval → runtime deployment as one controlled release session.',
  'Any FAIL stops advancement immediately; do not declare PROD_CONFIRMED.', '',
  'For later authorized execution Codex first attempts existing non-persistent access: process environment, repo-local authorized environment, existing authenticated Netlify access and existing linked/authenticated Supabase CLI access. Never print credentials; do not ask Isa to edit env files. If blocked, return one exact missing access item.', '',
  'UNKNOWN permission remains distinct from DENIED. Historical repair is evidence-backed and explicitly apply-gated. Candidate eligibility does not determine row readiness. No destructive drops, fabricated facts, blind activation or unbounded transaction.',
].join('\n')
writeFileSync(resolve(out, 'prod-apply-plan.md'), releasePlan, 'utf8')

const runtimeFiles = [
  ['netlify/functions/public-opportunities.ts','Netlify Site / public Catalog','ONE protected Netlify production deploy','Catalog view available','After DB stages 2 and 5','Read-only response sample/count matches opportunity_catalog_universe.'],
  ['netlify/functions/sitemap.ts','Netlify Site / SEO','Same single Netlify deploy','SEO view available','After DB stages 2 and 5','Sitemap URLs are members of opportunity_seo_universe; excluded rows absent.'],
  ['netlify/functions/send-high-match-alerts.ts','Netlify scheduled function / Alerts','Same single Netlify deploy','Alert view and Retrieval tables available','After DB stages 2 and 5','Dry-run/no-send set matches Alert universe; zero historical FULL_BACKFILL delivery.'],
  ['netlify/functions/admin-data.ts + netlify/functions/lib/eight-gates.ts','Netlify Function / Admin API','Same single Netlify deploy','Universe summary and row RPCs available','After DB stage 2','Summary/row response reconciles and separates permission UNKNOWN from operational disablement.'],
  ['src/components/admin/SourceOperationsView.tsx','Netlify Site / Admin UI','Same single Netlify deploy','Admin API response compatible','After DB stage 2','UI shows universe counts, routing unresolved, permission unknown and first broken cable.'],
  ['src/lib/opportunity-universe.ts + src/lib/source-permission-truth.ts + src/lib/effective-source-policy.ts + shared/professional-evidence.ts','Netlify bundle and required Supabase Edge shared bundle','Included in the same Netlify deploy and Edge function release as applicable','Matching SQL functions/schema installed','After DB stages 2 and 5','Consumer-specific smoke and shared contract gates pass.'],
  ['supabase/functions/match-batch/index.ts + required shared modules','Supabase Edge / Matching','Authorized Supabase function deployment','Final matching view and Retrieval schema available','After DB stages 2 and 5','Safe invocation reads opportunity_final_matching_universe; V2 remains decision authority.'],
  ['scripts/run_matching_retrieval_expansion.ts + .github/workflows/matching-retrieval.yml','GitHub Actions / Background Retrieval','Authorized commit/push, then enable schedule/dispatch','Retrieval schema and secrets already configured','After DB stage 5','Bounded single-user run reports canonical denominator/cursor; no alert side effect.'],
] as const
const runtimeManifest = [
  '# Opportunity Universe runtime release manifest','',
  'Deployment is planned only; nothing was deployed. Netlify requires exactly ONE protected production deployment for the complete site/function set; no preview/debug deployment.', '',
  '| Artifact/file | Runtime surface | Deployment mechanism | Dependency | Required prior DB stage | Post-deploy smoke check |',
  '|---|---|---|---|---|---|',
  ...runtimeFiles.map(row => `| ${row.join(' | ')} |`), '',
  '## Post-deploy smoke (read-only; no notifications)', '',
  '- PUBLIC CATALOG: confirm public-opportunities consumes canonical Catalog view; compare bounded returned IDs/count with `opportunity_catalog_universe`.',
  '- SITEMAP/SEO: confirm sitemap output is sourced from `opportunity_seo_universe`; sampled excluded rows do not appear.',
  '- MATCHING: invoke match-batch safely and confirm canonical final-matching universe hydration with current V2 reranking.',
  '- ALERTS: dry-run/no-send only; compare candidates to `opportunity_alert_universe` and prove no historical FULL_BACKFILL delivery.',
  '- ADMIN: request summary and one bounded row diagnosis; verify first-broken-cable and separate permission UNKNOWN / operator switch state.',
  '- BACKGROUND RETRIEVAL: one deterministic canary worker invocation against canonical denominator; inspect bounded cursor/coverage and no alert side effect.',
  '- Never send real user notifications during validation. PROD_CONFIRMED requires every smoke, verifier and canary check to pass.',
].join('\n')
writeFileSync(resolve(out, 'runtime-release-manifest.md'), runtimeManifest, 'utf8')
console.log(JSON.stringify({ artifacts: ['preflight-prod.sql', 'preflight-retrieval-prod-dependencies.sql', 'source-permission-coverage.md', 'prod-apply-schema.sql', 'prod-compile-transaction.sql', 'check-partial-schema-prod.sql', 'prod-apply-retrieval.sql', 'prod-apply.sql', 'prod-apply-plan.md', 'verify-universe-prod.sql', 'verify-prod.sql', 'runtime-release-manifest.md'], aliases: identityRows.size, canonical_sources: permissionRegistry.length, permission_dimensions: SOURCE_PERMISSION_DIMENSIONS.length, permission_decisions: permissionRegistry.length * SOURCE_PERMISSION_DIMENSIONS.length, permission_overrides: permissionOverrides ? permissionOverrides.split('\n').length : 0, compile_transaction_safe: true, prod_apply: false }))
