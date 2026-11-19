/** Offline PostgreSQL: old/new view equivalence, plan and real cursor traversal. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { PGlite } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js'
import { seoUniversePages } from '../src/lib/seo-universe-fetch.js'
import { opportunitySitemapPageFromUniverse } from '../netlify/functions/sitemap.ts'
import { buildSeoInventoryFromUniverse, buildEffectiveSeoInventory, seoCanonicalPaths } from '../src/lib/seo-inventory.ts'

const sql = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
const original = sql('supabase/migrations/202610040001_source_switch_wiring.sql')
assert.equal(createHash('sha256').update(original).digest('hex'), '3055782d986c1043697adb5b7ca70376efef94ab41d3bf9b3fd0644a82e59b0c', 'applied 040001 must stay byte-identical (LF)')
const universeBase = sql('supabase/migrations/202609280001_opportunity_universe.sql')
const migration = sql('supabase/migrations/202610080001_seo_universe_read_path.sql')
const permissionMigration = sql('supabase/migrations/202610140002_explicit_seo_permission_universe.sql')
const permissionRollback = sql('docs/release/operator/03_ROLLBACK_202610140002_explicit_seo_permission_universe.sql')
const legacyPermissionQueueFunction = original.match(/create or replace function public\.opportunity_permission_refresh_universe\(\)[\s\S]*?end \$\$;/i)?.[0]
const permissionQueueFunction = permissionMigration.match(/create or replace function public\.opportunity_permission_refresh_universe\(\)[\s\S]*?end \$\$;/i)?.[0]
const permissionQueueTrigger = universeBase.match(/create trigger opportunity_permissions_refresh_universe[\s\S]*?;/i)?.[0]
assert(legacyPermissionQueueFunction && permissionQueueFunction && permissionQueueTrigger, 'reuse the installed source-permission dirty-queue trigger contract')
assert.match(permissionQueueFunction,/insert into public\.opportunity_universe_dirty_sources/i)
assert.doesNotMatch(permissionQueueFunction,/opportunities|opportunity_universe_state|for\s+\w+\s+in\s+select|refresh_opportunity_universe\(/i,'permission writes only enqueue one canonical source; no opportunity scan/recalculation')
const generator = sql('scripts/generate-seo-inventory.ts')
const buildColumns = generator.match(/const OPPORTUNITY_COLUMNS = '([^']+)'/)[1].split(',')
const executable = migration.replace(/--[^\n]*/g, '')
assert(!/\b(drop|delete|update|insert|truncate|alter|refresh)\b/i.test(executable))
assert.match(executable, /begin;[\s\S]*commit;/i)
assert.match(executable, /create index if not exists[\s\S]*\(opportunity_id\)[\s\S]*where seo_state = 'READY'/i)
assert.match(executable, /security_invoker=true/)
assert.match(executable, /canonical_opportunity_source_policy/)
assert.match(executable, /opportunity_deadline_state\(candidate.deadline\) in \('OPEN','UNKNOWN'\)/)
assert.match(executable, /is_enabled'='true'/)
assert.match(executable, /seo_enabled' is distinct from 'false'/)
assert(!/grant|revoke|create\s+(or\s+replace\s+)?function/i.test(executable),'080001 remains a read-path-only migration')
assert(!/\boffset\b|source\s+in\s*\(|materialized\s+view/i.test(executable))
assert.deepEqual([...executable.matchAll(/\blimit\s+(\d+)/gi)].map(match=>Number(match[1])), [1], 'only the unique opportunity lookup has LIMIT; no total ceiling')
const fetchCode = sql('src/lib/seo-universe-fetch.js')
assert(!/\.range\(|\.offset\(|count:/.test(fetchCode))
assert.match(fetchCode, /query\.gt\('id', cursor\)/)
assert.match(sql('src/lib/paged-fetch.js'), /KEYSET_CURSOR_NOT_ADVANCING/)
for (const file of ['scripts/generate-seo-inventory.ts','netlify/functions/sitemap.ts']) assert.match(sql(file), /seoUniversePages/)
assert.match(sql('scripts/generate-seo-inventory.ts'), /buildSeoInventoryFromUniverse\(opportunities\)/)
assert.match(sql('src/lib/seo-inventory.ts'), /export function buildEffectiveSeoInventory/,'raw/shared projection remains available')

const legacyView = original.match(/create or replace view public\.opportunity_seo_universe[\s\S]*?;/)[0]
const deadline = universeBase
  .match(/create or replace function public\.opportunity_deadline_state[\s\S]*?end \$\$;/)[0]
const db = new PGlite()
const query = async (text, params=[]) => (await db.query(text, params)).rows
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table opportunities (
      id text primary key, source text, slug text, title text, organization text,
      description text, opportunity_type text, deadline text, updated_at timestamptz,
      opportunity_kind text, type text, created_at timestamptz default now()
    );
    create table opportunity_universe_state (
      opportunity_id text primary key references opportunities(id),
      lifecycle_state text not null default 'UNKNOWN', seo_row_state text not null default 'UNKNOWN', seo_row_reason text not null default 'UNKNOWN', seo_state text not null default 'UNKNOWN',
      seo_effective_reason text not null default 'UNKNOWN', catalog_state text not null default 'UNKNOWN', source_matching_state text not null default 'UNKNOWN',
      source_matching_reason text, source_matching_provenance text,
      final_matching_state text not null default 'UNKNOWN', alerts_state text not null default 'UNKNOWN', provenance jsonb not null default '{}'::jsonb
    );
    create index opportunity_universe_final_matching_idx on opportunity_universe_state(final_matching_state,opportunity_id);
    create table opportunity_source_identity_aliases (emitted_source text primary key, canonical_source text not null);
    create table opportunity_source_consumer_permissions (
      canonical_source text not null, consumer text not null, permission_state text not null,
      reason text not null, provenance text not null, evidence_type text not null,
      evidence_reference text not null, verified_at date not null, notes text not null default '',
      primary key(canonical_source,consumer)
    );
    create table opportunity_universe_dirty_sources (
      canonical_source text primary key, reason text not null,
      queued_at timestamptz not null default now(), cursor_id text
    );
    create table opportunity_sources (source text primary key, policy jsonb);
    -- Fixture INPUT at the existing policy boundary. This is NOT a replacement
    -- permission reducer: both actual view definitions call this same input.
    -- The future producer is stipulated operationally certified for this test.
    create function canonical_opportunity_source_policy(text) returns jsonb
      language sql stable as $$select policy from opportunity_sources where source=$1$$;
    insert into opportunity_sources values
      ('himalayas','{"canonical_source":"himalayas","is_enabled":true,"seo_enabled":true}'),
      ('jobicy','{"canonical_source":"jobicy","is_enabled":true,"seo_enabled":true}'),
      ('future_qualifying_producer','{"canonical_source":"future_qualifying_producer","is_enabled":true,"seo_enabled":true}'),
      ('killed','{"canonical_source":"killed","is_enabled":false,"seo_enabled":true}'),
      ('seo_killed','{"canonical_source":"seo_killed","is_enabled":true,"seo_enabled":false}'),
      ('oper_unknown','{"canonical_source":"oper_unknown","is_enabled":null,"seo_enabled":true}'),
      ('nullable_seo','{"canonical_source":"nullable_seo","is_enabled":true}');
    insert into opportunity_sources values
      ('weworkremotely','{"canonical_source":"weworkremotely","is_enabled":true,"seo_enabled":true}');
    insert into opportunity_source_consumer_permissions values
      ('jobicy','seo_index','DENIED','LEGACY_REPOSITORY_DENY','docs/source-permission-matrix.md','REPOSITORY_REVIEW','docs/source-permission-matrix.md','2026-10-14','fixture unsupported denial');
    -- Match the supplied production policy-row cardinality, including inactive
    -- profiles which have no opportunities. These are explicit fixture inputs.
    insert into opportunity_sources
      select 'fixture_inactive_'||n, jsonb_build_object('canonical_source','fixture_inactive_'||n,'is_enabled',false,'seo_enabled',true)
      from generate_series(1,112) n;
    insert into opportunity_source_identity_aliases values ('future_alias','future_qualifying_producer');
    insert into opportunities(id,source,slug,title,organization,description,opportunity_type,deadline,updated_at)
      select lpad(n::text,8,'0'), case when n=6026 then 'future_qualifying_producer' when n=6025 then 'future_alias' when n%2=0 then 'jobicy' else 'himalayas' end,
        'role-'||n,'Factual programme officer','Factual organization',repeat('Regional programme delivery coordinates stakeholder analysis, project planning, compliance monitoring, reporting, research partnerships, operational support, community services, measurable outcomes and implementation review. ',2),
        'job',null, '2026-10-01'::timestamptz + (n%28)*interval '1 day'
      from generate_series(1,16536) n;
    insert into opportunity_universe_state(opportunity_id,lifecycle_state,seo_row_state,seo_row_reason,seo_effective_reason,seo_state,catalog_state,source_matching_state,source_matching_reason,source_matching_provenance,final_matching_state,alerts_state,provenance)
      select id,'ACTIVE_VALID',case when id<='00006026' then 'READY' else 'NOT_READY' end,
        case when id<='00006026' then 'SEO_ROW_READY' else 'THIN_CONTENT' end,
        case when id<='00006026' then 'SEO_EFFECTIVE_READY' else 'THIN_CONTENT' end,
        case when id<='00006026' then 'READY' else 'NOT_READY' end,'READY','UNKNOWN','SOURCE_PERMISSION_NOT_EVIDENCED','fixture','NOT_READY','READY','{}'::jsonb from opportunities;
    insert into opportunities(id,source,slug,title,organization,description,opportunity_type,deadline,updated_at)
      values('wwr-policy-test','weworkremotely','wwr-policy-test','Remote Engineer','Example','Regional programme delivery coordinates stakeholder analysis, project planning, compliance monitoring, reporting, research partnerships, operational support, community services, measurable outcomes and implementation review.','job',null,now());
    insert into opportunity_universe_state(opportunity_id,lifecycle_state,seo_row_state,seo_row_reason,seo_effective_reason,seo_state,catalog_state,source_matching_state,source_matching_reason,source_matching_provenance,final_matching_state,alerts_state)
      values('wwr-policy-test','ACTIVE_VALID','READY','SEO_ROW_READY','SEO_EFFECTIVE_READY','READY','READY','UNKNOWN','SOURCE_PERMISSION_NOT_EVIDENCED','fixture','READY','READY');
  `)
  // Include the actual build selection (unused fields may be null). This tests
  // both the small diagnostic query and the wider production page projection.
  const existingColumns=new Set((await query("select attname from pg_attribute where attrelid='opportunities'::regclass and attnum>0 and not attisdropped")).map(row=>row.attname))
  for(const name of buildColumns.filter(name=>!existingColumns.has(name))) {
    assert(/^[a-z_]+$/.test(name))
    await db.exec(`alter table opportunities add column ${name} text`)
  }
  await db.exec(deadline)
  await db.exec(legacyView)
  await db.exec(legacyView.replace('public.opportunity_seo_universe','public.legacy_seo_fixture_reference'))
  await db.exec('create view seo_fixture_dependent as select id,universe_lifecycle_state from opportunity_seo_universe')
  await db.exec(legacyPermissionQueueFunction)
  await db.exec(permissionQueueTrigger)
  await db.exec('grant select on opportunity_seo_universe,opportunities,opportunity_universe_state,opportunity_source_identity_aliases,opportunity_sources to service_role')
  const metadata = () => query(`select c.oid,c.relowner,c.relacl,c.reloptions,
    (select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod) order by a.attnum)
     from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns
    from pg_class c where c.oid='opportunity_seo_universe'::regclass`)
  const before = await metadata()
  const negative = [
    ['z-not-ready','himalayas',null,'NOT_READY'], ['z-kill','killed',null,'READY'],
    ['z-seo-kill','seo_killed',null,'READY'], ['z-expired','himalayas','2000-01-01','READY'],
    ['z-invalid','himalayas','not a date','READY'], ['z-unknown','himalayas',null,'READY'],
    ['z-nullable-seo','nullable_seo','2999-01-01','READY'], ['z-no-slug','himalayas',null,'READY'],
    ['z-oper-unknown','oper_unknown',null,'READY'],
  ]
  for (const [id,source,date,state] of negative) {
    await query(`insert into opportunities(id,source,slug,title,organization,description,opportunity_type,deadline,updated_at) values($1,$2,$3,'Factual programme officer','Organization','Regional programme delivery coordinates stakeholder analysis, project planning, compliance monitoring, reporting, research partnerships, operational support, community services, measurable outcomes and implementation review.','job',$4,now())`,[id,source,id==='z-no-slug'?null:id,date])
    await query('insert into opportunity_universe_state(opportunity_id,lifecycle_state,seo_row_state,seo_row_reason,seo_effective_reason,seo_state,final_matching_state) values($1,\'ACTIVE_VALID\',\'READY\',\'SEO_ROW_READY\',\'SEO_EFFECTIVE_READY\',$2,\'NOT_READY\')',[id,state])
  }
  await query(`insert into opportunities(id,source,slug,title,organization,description,opportunity_type,deadline,updated_at)
    values('thin-legacy-backfill','himalayas','thin-legacy-backfill','Programme Officer','Organization',repeat('The vacancy offers qualified professionals meaningful responsibilities. ',4),'job',null,now())`)
  await query(`insert into opportunity_universe_state(opportunity_id,lifecycle_state,seo_row_state,seo_row_reason,seo_effective_reason,seo_state,final_matching_state)
    values('thin-legacy-backfill','ACTIVE_VALID','NOT_READY','THIN_CONTENT','THIN_CONTENT','NOT_READY','NOT_READY')`)
  await db.exec('create table legacy_seo_fixture_snapshot as select * from legacy_seo_fixture_reference')
  await db.exec(migration)
  await db.exec(migration) // index and replacement are repeatable
  await db.exec(permissionMigration)
  await db.exec(permissionMigration) // explicit permission row/view/trigger migration is idempotent
  assert.deepEqual(await metadata(),before,'column ordinals/types, owner, ACL and security_invoker are unchanged')
  assert.equal((await query("select id from seo_fixture_dependent where id='00000001'"))[0].id,'00000001','existing named dependency remains usable')
  assert.equal((await query(`select count(*) n from (
    (select * from opportunity_seo_universe except all select * from legacy_seo_fixture_snapshot)
    union all (select * from legacy_seo_fixture_snapshot except all select * from opportunity_seo_universe)
  ) differences`))[0].n,2,'view delta excludes the official WWR denial and the previously admitted missing-slug row')
  assert.equal((await query("select count(*) n from (select id from legacy_seo_fixture_snapshot except all select id from opportunity_seo_universe) d where id='wwr-policy-test'"))[0].n,1)
  assert.deepEqual((await query(`select id from (select id from legacy_seo_fixture_snapshot except all select id from opportunity_seo_universe) removed`)).map(row=>row.id).sort(),['wwr-policy-test','z-no-slug'])
  assert.equal((await query("select public.source_seo_explicitly_denied('weworkremotely') denied"))[0].denied,true)
  for (const consumer of ['catalog','matching','alerts','seo_index']) assert.equal((await query(`select public.source_consumer_explicitly_denied('weworkremotely','${consumer}') denied`))[0].denied,true)
  assert.equal((await query("select public.source_seo_explicitly_denied('jobicy') denied"))[0].denied,false,'repository/default DENIED is advisory')
  assert.equal((await query("select public.source_seo_row_readiness_reason('breadcrumb','breadcrumb','Regional programme delivery coordinates stakeholder analysis, project planning, compliance monitoring, reporting, research partnerships, operational support, community services, measurable outcomes and implementation review.','Organization') reason"))[0].reason,'GENERIC_OR_NAVIGATION_TITLE')
  assert.equal((await query("select public.source_seo_row_readiness_reason('Programme Officer','programme-officer',repeat('The vacancy offers qualified professionals meaningful responsibilities. ',4),'Organization') reason"))[0].reason,'DESCRIPTION_WITHOUT_FACTUAL_CONTENT','length alone does not pass the factual-content rule')
  assert.equal((await query("select public.source_seo_row_readiness_reason('Programme Officer','programme-officer','Regional programme delivery coordinates stakeholder analysis, project planning, compliance monitoring, reporting, research partnerships, operational support, community services, measurable outcomes and implementation review.','Organization') reason"))[0].reason,'SEO_ROW_READY')
  assert.equal((await query("select count(*) n from opportunity_universe_dirty_sources where canonical_source='weworkremotely'"))[0].n,1,'four consumer evidence rows coalesce into one canonical source queue entry')
  assert.equal((await query("select seo_row_state,seo_row_reason from opportunity_universe_state where opportunity_id='thin-legacy-backfill'"))[0].seo_row_reason,'DESCRIPTION_WITHOUT_FACTUAL_CONTENT','legacy THIN_CONTENT is normalized to the same precise factual reason without promoting READY')
  const wwrState=(await query("select catalog_state,source_matching_state,final_matching_state,alerts_state,seo_state,seo_effective_reason from opportunity_universe_state where opportunity_id='wwr-policy-test'"))[0]
  assert.equal(wwrState.catalog_state,'NOT_READY'); assert.equal(wwrState.source_matching_state,'DENIED'); assert.equal(wwrState.final_matching_state,'NOT_READY'); assert.equal(wwrState.alerts_state,'NOT_READY'); assert.equal(wwrState.seo_effective_reason,'SOURCE_SEO_PERMISSION_DENIED')
  await query("update opportunity_universe_state set seo_state='READY',seo_effective_reason='SEO_EFFECTIVE_READY' where opportunity_id='wwr-policy-test'")
  assert.equal((await query("select seo_state from opportunity_universe_state where opportunity_id='wwr-policy-test'"))[0].seo_state,'NOT_READY','future C09/C20 recomputation stays aligned by the new trigger')
  await query(`insert into opportunities(id,source,slug,title,organization,description,opportunity_type,deadline,updated_at)
    values('thin-factual-test','himalayas','thin-factual-test','Programme Officer','Organization',repeat('The vacancy offers qualified professionals meaningful responsibilities. ',4),'job',null,now())`)
  await query(`insert into opportunity_universe_state(opportunity_id,lifecycle_state,seo_row_state,seo_row_reason,seo_effective_reason,seo_state,catalog_state,source_matching_state,source_matching_reason,source_matching_provenance,final_matching_state,alerts_state)
    values('thin-factual-test','ACTIVE_VALID','READY','SEO_ROW_READY','SEO_EFFECTIVE_READY','READY','READY','UNKNOWN','SOURCE_PERMISSION_NOT_EVIDENCED','fixture','READY','READY')`)
  assert.equal((await query("select seo_row_state,seo_row_reason,seo_state from opportunity_universe_state where opportunity_id='thin-factual-test'"))[0].seo_row_reason,'DESCRIPTION_WITHOUT_FACTUAL_CONTENT','quality trigger aligns persisted state with the factual-content contract')
  const visible = new Set((await query("select id from opportunity_seo_universe where id like 'z-%'")).map(row=>row.id))
  assert.deepEqual([...visible].sort(),['z-nullable-seo','z-unknown'])
  await db.exec('analyze opportunities; analyze opportunity_universe_state; analyze opportunity_sources; analyze opportunity_source_identity_aliases;') // LOCAL fixture only
  const plans = []
  for (const [cursor,columns] of [[null,'id,slug,updated_at'],['00005000','id,slug,updated_at'],[null,buildColumns.join(',')],['00005000',buildColumns.join(',')]]) {
    const predicate = cursor===null ? '' : 'and id > $1'
    const plan = (await query(`explain (analyze,buffers,format json) select ${columns} from opportunity_seo_universe where slug is not null ${predicate} order by id asc limit 250`, cursor===null?[]:[cursor]))[0]['QUERY PLAN'][0]
    const nodes=[]
    const visit = node => { nodes.push(node); for (const child of node.Plans||[]) visit(child) }
    visit(plan.Plan)
    assert(nodes.some(node=>node['Index Name']==='opportunity_universe_seo_ready_id_idx'),'READY partial index drives the page')
    if(cursor!==null) assert(nodes.some(node=>node['Index Name']==='opportunity_universe_seo_ready_id_idx' && node['Index Cond']?.includes('opportunity_id >')),'later pages seek at the index cursor, never walk earlier IDs')
    assert(!nodes.some(node=>node['Node Type']==='Seq Scan' && node['Relation Name']==='opportunities'),'no full opportunities scan: '+JSON.stringify(plan.Plan))
    assert(!nodes.some(node=>node['Index Name']==='opportunity_universe_state_pkey'),'no per-inventory universe PK lookups')
    const opportunities=nodes.filter(node=>node['Relation Name']==='opportunities')
    assert(opportunities.every(node=>node['Actual Loops']<=260),'opportunity lookups follow the current page, including late pages: '+JSON.stringify(plan.Plan))
    assert.equal(plan.Plan['Actual Rows'],250)
    plans.push({cursor,projection:columns==='id,slug,updated_at'?'diagnostic':'actual build',time_ms:plan['Execution Time'],opportunity_lookups:opportunities.map(node=>node['Actual Loops'])})
  }
  // Exercise the ACTUAL JS keyset helper against PostgreSQL, not an array fake.
  const requests=[]
  const sqlClient = { from(table) {
    assert.equal(table,'opportunity_seo_universe')
    let columns='',cursor=null,size=null
    const builder={
      select(value){ assert(/^[a-z_,]+$/.test(value)); columns=value; return builder },
      not(...args){ assert.deepEqual(args,['slug','is',null]); return builder },
      order(...args){ assert.deepEqual(args,['id',{ascending:true}]); return builder },
      limit(value){ assert.equal(value,250); size=value; return builder },
      gt(column,value){ assert.equal(column,'id'); cursor=value; return builder },
      range(){ throw Error('OFFSET_FORBIDDEN') },
      then(resolve,reject){
        assert.equal(size,250)
        return query(`select ${columns} from opportunity_seo_universe where slug is not null ${cursor===null?'':'and id>$1'} order by id asc limit 250`,cursor===null?[]:[cursor])
          .then(data=>{ requests.push({cursor,size,returned:data.length}); return {data:JSON.parse(JSON.stringify(data)),error:null} }).then(resolve,reject)
      },
    }
    return builder
  } }
  await db.exec('set role service_role')
  const rows=[]
  for await (const page of seoUniversePages(sqlClient,'id,slug,source,opportunity_type,updated_at,title,organization,description')) rows.push(...page)
  assert.equal(rows.length,6028)
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length)
  assert(rows.some(row=>row.id==='00006026' && row.source==='future_qualifying_producer'),'future qualifying source past page 10 is fetched without a source list')
  assert(!rows.some(row=>row.id==='z-no-slug'))
  assert(requests.every(request=>request.returned<=250))
  assert.equal(requests.length,25)
  const readPages=requests.length
  assert.equal(requests[0].cursor,null)
  for(let i=1;i<requests.length;i++) assert(requests[i].cursor> (requests[i-1].cursor||''))
  const inventory=buildSeoInventoryFromUniverse(rows)
  assert.equal(inventory.length,rows.length,'all canonical eligible rows reach generated inventory')
  assert(inventory.some(row=>row.source==='future_qualifying_producer' && row.canonical_path==='/empleos/role-6026'),'reader does not require a hardcoded producer or a second permission')
  const duplicates=[...rows,{...rows[0],id:'newer',updated_at:'2099-01-01T00:00:00Z'}, {...rows[0],id:'a-tie',updated_at:'2099-01-01T00:00:00Z'}]
  const canonical=buildSeoInventoryFromUniverse(duplicates)
  assert.deepEqual(buildSeoInventoryFromUniverse([...duplicates].reverse()),canonical)
  assert.equal(canonical.find(row=>row.slug===rows[0].slug).id,'a-tie','updated_at DESC, id ASC before dedupe')
  assert.equal(buildSeoInventoryFromUniverse([{id:'missing-slug',source:'future_unknown'}]).length,0)
  const rawFixture=JSON.parse(sql('scripts/fixtures/seo-inventory.json'))
  const rawInventory=buildEffectiveSeoInventory(rawFixture.opportunities,rawFixture.policies)
  assert.deepEqual(seoCanonicalPaths(buildSeoInventoryFromUniverse(rawInventory)),seoCanonicalPaths(rawInventory),'existing fixture path contract unchanged')
  const aliasRow=rawFixture.opportunities.find(row=>row.source==='himalayas')
  const normal=buildSeoInventoryFromUniverse([aliasRow])[0]
  const { canonicalSource }=await import('../src/lib/effective-source-policy.ts')
  assert.equal(normal.canonical_source,canonicalSource(aliasRow.source),'canonical alias resolver remains shared')
  assert.equal(buildSeoInventoryFromUniverse([{...aliasRow,source:'future_qualifying_producer'}]).length,1,'local registry membership is not a second SEO gate')
  const registry=JSON.parse(sql('src/generated/source-intelligence-registry.json'))
  const aliased=registry.sources.find(profile=>profile.emitted_aliases.some(alias=>alias!==profile.canonical_source))
  const emitted=aliased.emitted_aliases.find(alias=>alias!==aliased.canonical_source)
  assert.equal(buildSeoInventoryFromUniverse([{...aliasRow,source:emitted}])[0].canonical_source,aliased.canonical_source)
  // An ignored build fixture exercises the SAME live-universe projection,
  // including a future source from the real local SQL traversal. Raw fixtures
  // remain supported for the existing shared eligibility verifier.
  mkdirSync('.cvitae-state/cable-build',{recursive:true})
  writeFileSync('.cvitae-state/cable-build/seo-read-path-fixture.json',JSON.stringify({
    fromUniverse:true,policies:rawFixture.policies,
    opportunities:[...rawInventory,...rows.slice(0,2495),rows.find(row=>row.id==='00006026')],
  }))
  const runtime = await opportunitySitemapPageFromUniverse(sqlClient,'/sitemap-opportunities/7.xml')
  assert.equal(runtime.statusCode,200)
  assert.match(runtime.body,/role-6026/,'future source reaches runtime sitemap on final XML page')
  // Live gates still apply after the index exists; a policy kill takes effect
  // immediately and its removal restores the same existing row without refresh.
  await db.exec('reset role')
  await query(`update opportunity_sources set policy=jsonb_set(policy,'{is_enabled}','false') where source='himalayas'`)
  assert.equal((await query("select count(*) n from opportunity_seo_universe where id='00000001'"))[0].n,0)
  await query(`update opportunity_sources set policy=jsonb_set(policy,'{is_enabled}','true') where source='himalayas'`)
  assert.equal((await query("select count(*) n from opportunity_seo_universe where id='00000001'"))[0].n,1)
  const verification=sql('artifacts/release/verify-seo-universe-read-path.sql')
  assert(!/\b(insert|update|delete|create|alter|drop|truncate|call|refresh|vacuum|analyze)\b/i.test(verification.replace(/--[^\n]*/g,'').replace(/explain \(analyze, buffers\)/gi,'')),'post-apply artifact only reads/explains')
  const verificationOutput=await db.exec(verification)
  assert.equal(verificationOutput.length,3,'metadata + first/next real projection plans')
  assert(verificationOutput.slice(1).every(result=>JSON.stringify(result.rows).includes('opportunity_universe_seo_ready_id_idx')),'the actual operator artifact uses the READY index on both pages')
  assert.match(permissionRollback,/SAFE_ROLLBACK_BLOCKED/)
  assert(!/\b(update|delete)\s+public\.(opportunity_universe_state|opportunity_source_consumer_permissions)\b/i.test(permissionRollback),'rollback never restores stale state or deletes permission evidence')

  // Evidence changes enqueue the canonical source via the existing bounded
  // C09/C20 queue. The queue trigger does not recalculate opportunity rows.
  await query('delete from opportunity_universe_dirty_sources')
  await query("update opportunities set source='future_alias' where id='00006026'")
  await query("insert into opportunity_universe_dirty_sources(canonical_source,reason,cursor_id) values('future_qualifying_producer','PREVIOUS_CURSOR','00006000')")
  const beforeSeoPermission = (await query("select seo_state,catalog_state,source_matching_state,final_matching_state,alerts_state from opportunity_universe_state where opportunity_id='00006026'"))[0]
  await query(`insert into opportunity_source_consumer_permissions
    (canonical_source,consumer,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes)
    values('future_qualifying_producer','seo_index','DENIED','SEO_ONLY_REVIEWED_DENIAL','https://policy.example/seo','OFFICIAL_API_TERMS','https://policy.example/seo','2026-10-14','fixture')`)
  const seoQueue = (await query("select canonical_source,reason,cursor_id from opportunity_universe_dirty_sources"))
  assert.deepEqual(seoQueue,[{canonical_source:'future_qualifying_producer',reason:'SOURCE_PERMISSION_CHANGED',cursor_id:null}], 'alias identity queues one source and restarts its durable cursor')
  assert.deepEqual((await query("select seo_state,catalog_state,source_matching_state,final_matching_state,alerts_state from opportunity_universe_state where opportunity_id='00006026'"))[0],beforeSeoPermission,'permission write queues work; it does not synchronously scan/recalculate opportunities')
  await query("update opportunity_universe_state set seo_row_state='READY',seo_row_reason='SEO_ROW_READY',seo_state='READY',seo_effective_reason='SEO_EFFECTIVE_READY',catalog_state='READY',source_matching_state='UNKNOWN',final_matching_state='READY',alerts_state='READY' where opportunity_id='00006026'")
  const seoOnly = (await query("select seo_state,catalog_state,source_matching_state,final_matching_state,alerts_state from opportunity_universe_state where opportunity_id='00006026'"))[0]
  assert.equal(seoOnly.seo_state,'NOT_READY')
  assert.deepEqual([seoOnly.catalog_state,seoOnly.source_matching_state,seoOnly.final_matching_state,seoOnly.alerts_state],['READY','UNKNOWN','READY','READY'],'an SEO-only denial does not veto Catalog, private Matching, or Alerts')
  assert.equal((await query("select count(*) n from opportunity_seo_universe where id='00006026'"))[0].n,0,'the same explicit SEO evidence excludes the canonical SQL view')

  // Change an existing consumer evidence row. Its source queue is coalesced,
  // the prior cursor is reset, and only the affected dimension is denied.
  await query('delete from opportunity_universe_dirty_sources')
  await query("insert into opportunity_universe_dirty_sources(canonical_source,reason,cursor_id) values('jobicy','PREVIOUS_CURSOR','00005000')")
  await query(`update opportunity_source_consumer_permissions
    set reason='SEO_ONLY_REVIEWED_DENIAL',provenance='https://policy.example/seo',evidence_type='OFFICIAL_API_TERMS',
      evidence_reference='https://policy.example/seo',notes='evidence upgraded in fixture'
    where canonical_source='jobicy' and consumer='seo_index'`)
  assert.deepEqual((await query('select canonical_source,reason,cursor_id from opportunity_universe_dirty_sources')),[{canonical_source:'jobicy',reason:'SOURCE_PERMISSION_CHANGED',cursor_id:null}],'a permission evidence update enqueues the source and restarts its cursor')
  assert.equal((await query("select public.source_seo_explicitly_denied('jobicy') denied"))[0].denied,true)
  await query("update opportunity_universe_state set catalog_state='READY',source_matching_state='UNKNOWN',source_matching_reason='SOURCE_PERMISSION_NOT_EVIDENCED',final_matching_state='READY',alerts_state='READY',seo_row_state='READY',seo_row_reason='SEO_ROW_READY',seo_state='READY',seo_effective_reason='SEO_EFFECTIVE_READY' where opportunity_id='00000002'")
  const jobicySeoOnly=(await query("select catalog_state,source_matching_state,final_matching_state,alerts_state,seo_state from opportunity_universe_state where opportunity_id='00000002'"))[0]
  assert.deepEqual(jobicySeoOnly,{catalog_state:'READY',source_matching_state:'UNKNOWN',final_matching_state:'READY',alerts_state:'READY',seo_state:'NOT_READY'})
  assert.equal((await query("select count(*) n from opportunity_seo_universe where id='00000002'"))[0].n,0)

  // A matching-only prohibition remains independent of SEO, Catalog and
  // Alerts; SQL and TypeScript receive the same evidence fixture.
  await query('delete from opportunity_universe_dirty_sources')
  await query(`insert into opportunity_source_consumer_permissions
    (canonical_source,consumer,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes)
    values('himalayas','matching','DENIED','MATCHING_ONLY_REVIEWED_DENIAL','https://policy.example/matching','OFFICIAL_API_TERMS','https://policy.example/matching','2026-10-14','fixture')`)
  assert.deepEqual((await query('select canonical_source,reason from opportunity_universe_dirty_sources')),[{canonical_source:'himalayas',reason:'SOURCE_PERMISSION_CHANGED'}])
  await query("update opportunity_universe_state set catalog_state='READY',source_matching_state='UNKNOWN',source_matching_reason='SOURCE_PERMISSION_NOT_EVIDENCED',final_matching_state='READY',alerts_state='READY',seo_row_state='READY',seo_row_reason='SEO_ROW_READY',seo_state='READY',seo_effective_reason='SEO_EFFECTIVE_READY' where opportunity_id='00000001'")
  const matchingOnly=(await query("select catalog_state,source_matching_state,final_matching_state,alerts_state,seo_state from opportunity_universe_state where opportunity_id='00000001'"))[0]
  assert.deepEqual(matchingOnly,{catalog_state:'READY',source_matching_state:'DENIED',final_matching_state:'NOT_READY',alerts_state:'READY',seo_state:'READY'})
  assert.equal((await query("select count(*) n from opportunity_seo_universe where id='00000001'"))[0].n,1,'matching-only denial does not remove the SEO view row')
  const { evaluateOpportunityDistribution } = await import('../src/lib/effective-source-policy.ts')
  const parityPermission=(source,dimension)=>{
    const denied=(source==='jobicy'&&dimension==='seo_index')||(source==='himalayas'&&dimension==='matching')
    return {state:denied?'DENIED':'ALLOWED',reason:denied?'REVIEWED_CONSUMER_DENIAL':'TEST_ALLOWED',evidence_type:'OFFICIAL_API_TERMS',provenance:'https://policy.example/consumer',evidence_url_or_repo_reference:'https://policy.example/consumer',verified_at:'2026-10-14',notes:'same local PGlite/TS contract fixture'}
  }
  const truthRow={source:'himalayas',slug:'role-1',title:'Programme Officer',organization:'Example',description:'Regional programme delivery coordinates stakeholder analysis, project planning, compliance monitoring, reporting, research partnerships, operational support, community services, measurable outcomes and implementation review.',tags:['programme management'],opportunity_type:'job',is_active:true,verification_status:'verified',catalog_eligible:true,match_eligible:true,alerts_eligible:true,seo_eligible:true,seo_status:'eligible'}
  const policyRows=[{source:'himalayas',is_enabled:true,catalog_enabled:true,matching_enabled:true,alerts_enabled:true,seo_enabled:true},{source:'jobicy',is_enabled:true,catalog_enabled:true,matching_enabled:true,alerts_enabled:true,seo_enabled:true}]
  const tsMatchingOnly=evaluateOpportunityDistribution(truthRow,policyRows,new Date('2026-10-14T12:00:00Z'),parityPermission)
  assert.equal(tsMatchingOnly.matching.allowed,false); assert.equal(tsMatchingOnly.catalog.allowed,true); assert.equal(tsMatchingOnly.alerts.allowed,true); assert.equal(tsMatchingOnly.seo.allowed,true)
  const tsSeoOnly=evaluateOpportunityDistribution({...truthRow,source:'jobicy'},policyRows,new Date('2026-10-14T12:00:00Z'),parityPermission)
  assert.equal(tsSeoOnly.seo.allowed,false); assert.equal(tsSeoOnly.matching.allowed,true); assert.equal(tsSeoOnly.catalog.allowed,true); assert.equal(tsSeoOnly.alerts.allowed,true)
  assert.match(sql('netlify/functions/public-opportunities.ts'),/opportunity_catalog_universe[\s\S]*opportunity_seo_universe/,'public detail/list keep Catalog and SEO authorities separate')
  assert.match(sql('netlify/functions/sitemap.ts'),/opportunity_seo_universe/,'runtime sitemap consumes the same SQL SEO view')

  // Three distinct terminal lifecycle changes after TG_OP=INSERT, plus a new
  // WWR row whose consumer marker has NULL prior_* values. These used to make
  // the old rollback assign NULL to NOT NULL columns or revive stale READY.
  for (const [id,terminal] of [['postmigration-expired','EXPIRED'],['postmigration-deleted','DELETED'],['postmigration-archived','ARCHIVED']]) {
    await query('insert into opportunities(id,source,slug,title,organization,description,opportunity_type,deadline,updated_at) values($1,\'himalayas\',$1,\'Programme Officer\',\'Example\',repeat(\'The vacancy offers qualified professionals meaningful responsibilities. \',4),\'job\',null,now())',[id])
    await query(`insert into opportunity_universe_state(opportunity_id,lifecycle_state,seo_row_state,seo_row_reason,seo_effective_reason,seo_state,catalog_state,source_matching_state,source_matching_reason,source_matching_provenance,final_matching_state,alerts_state)
      values($1,'ACTIVE_VALID','READY','SEO_ROW_READY','SEO_EFFECTIVE_READY','READY','READY','UNKNOWN','SOURCE_PERMISSION_NOT_EVIDENCED','fixture','READY','READY')`,[id])
    await query('update opportunity_universe_state set lifecycle_state=$2 where opportunity_id=$1',[id,terminal])
    assert.equal((await query('select lifecycle_state,seo_state from opportunity_universe_state where opportunity_id=$1',[id]))[0].lifecycle_state,terminal)
    assert.equal((await query('select seo_state from opportunity_universe_state where opportunity_id=$1',[id]))[0].seo_state,'NOT_READY','terminal row remains non-indexable')
  }
  await query(`insert into opportunities(id,source,slug,title,organization,description,opportunity_type,deadline,updated_at)
    values('postmigration-wwr','weworkremotely','postmigration-wwr','Programme Officer','Example',repeat('The vacancy offers qualified professionals meaningful responsibilities. ',4),'job',null,now())`)
  await query(`insert into opportunity_universe_state(opportunity_id,lifecycle_state,seo_row_state,seo_row_reason,seo_effective_reason,seo_state,catalog_state,source_matching_state,source_matching_reason,source_matching_provenance,final_matching_state,alerts_state)
    values('postmigration-wwr','ACTIVE_VALID','READY','SEO_ROW_READY','SEO_EFFECTIVE_READY','READY','READY','UNKNOWN','SOURCE_PERMISSION_NOT_EVIDENCED','fixture','READY','READY')`)
  const insertMarker=(await query("select provenance->'explicit_consumer_permission_reconciliation' marker from opportunity_universe_state where opportunity_id='postmigration-wwr'"))[0].marker
  assert.equal(insertMarker.prior_state_capture,'NO_PREEXISTING_ROW')
  assert.equal(insertMarker.prior_catalog_state,null); assert.equal(insertMarker.prior_final_matching_state,null); assert.equal(insertMarker.prior_seo_state,null)
  const invalidInsert=(await query("select seo_row_state,seo_row_reason,seo_state,seo_effective_reason from opportunity_universe_state where opportunity_id='postmigration-wwr'"))[0]
  assert.deepEqual(invalidInsert,{seo_row_state:'NOT_READY',seo_row_reason:'DESCRIPTION_WITHOUT_FACTUAL_CONTENT',seo_state:'NOT_READY',seo_effective_reason:'DESCRIPTION_WITHOUT_FACTUAL_CONTENT'})

  // The rollback is allowed only if it can remove artifacts without reverting
  // state or official restrictions. Here it must abort twice and be a no-op.
  await db.exec(`
    create table rollback_attempt_state_snapshot as select * from opportunity_universe_state;
    create table rollback_attempt_permission_snapshot as select * from opportunity_source_consumer_permissions;
    create table rollback_attempt_queue_snapshot as select * from opportunity_universe_dirty_sources;
    create table rollback_attempt_view_snapshot as select * from opportunity_seo_universe;
  `)
  const countRows = async (sqlText) => Number((await query(sqlText))[0].n)
  const rollbackAttempt = async () => {
    let message=''
    try { await db.exec(permissionRollback) } catch (error) {
      message=String(error)
      try { await db.exec('rollback') } catch { /* transaction may already be closed by PGlite */ }
    }
    assert.match(message,/SAFE_ROLLBACK_BLOCKED/,'unsafe reversals stop before DDL or row changes')
    return message
  }
  const firstBlock=await rollbackAttempt()
  const secondBlock=await rollbackAttempt()
  assert.match(secondBlock,/SAFE_ROLLBACK_BLOCKED/,'a repeated rollback attempt remains a safe no-op')
  assert.equal(await countRows(`select count(*) n from ((select * from opportunity_universe_state except all select * from rollback_attempt_state_snapshot) union all (select * from rollback_attempt_state_snapshot except all select * from opportunity_universe_state)) d`),0,'rollback never restores stale consumer/lifecycle snapshots')
  assert.equal(await countRows(`select count(*) n from ((select * from opportunity_source_consumer_permissions except all select * from rollback_attempt_permission_snapshot) union all (select * from rollback_attempt_permission_snapshot except all select * from opportunity_source_consumer_permissions)) d`),0,'WWR and other permission evidence remain unchanged')
  assert.equal(await countRows(`select count(*) n from ((select * from opportunity_universe_dirty_sources except all select * from rollback_attempt_queue_snapshot) union all (select * from rollback_attempt_queue_snapshot except all select * from opportunity_universe_dirty_sources)) d`),0,'rollback attempts do not consume or reset the durable source cursor')
  assert.equal(await countRows(`select count(*) n from ((select * from opportunity_seo_universe except all select * from rollback_attempt_view_snapshot) union all (select * from rollback_attempt_view_snapshot except all select * from opportunity_seo_universe)) d`),0,'SQL SEO view is unchanged after both blocked attempts')
  assert.equal(await countRows("select count(*) n from opportunity_source_consumer_permissions where canonical_source='weworkremotely' and permission_state='DENIED' and evidence_type='OFFICIAL_API_TERMS'"),4,'all four WWR restrictions and their evidence survive rollback attempts')
  assert.equal((await query("select count(*) n from pg_trigger where tgname='opportunity_universe_explicit_consumer_denials' and not tgisinternal"))[0].n,1,'the forward guard remains installed when rollback is blocked')
  assert.equal(await countRows("select count(*) n from opportunity_universe_state where (seo_row_state is null or seo_row_reason is null or seo_state is null or seo_effective_reason is null)"),0,'no NOT NULL state is nulled')
  assert.equal((await query("select lifecycle_state,seo_state from opportunity_universe_state where opportunity_id='postmigration-expired'"))[0].lifecycle_state,'EXPIRED')
  assert.equal((await query("select seo_state from opportunity_universe_state where opportunity_id='postmigration-expired'"))[0].seo_state,'NOT_READY','rollback does not reactivate an expired row')

  console.log(JSON.stringify({status:'PASS',rollback:'BLOCKED_SAFELY_TWICE_NO_STATE_CHANGE',rollback_reason:firstBlock.split('\n')[0],migration_cases:['preexisting_invalid','postmigration_insert_null_prior','expired','deleted','archived','consumer_policy_change','WWR_denials_preserved'],permissions_queue:'canonical source coalesced; durable cursor reset; no opportunity scan or synchronous row recalculation',consumer_parity:'SQL/PGlite and TS per-consumer decisions agree',metadata:'owner/ACL/security_invoker/columns preserved',rows:rows.length,pages:readPages,page_size:250,inventory:inventory.length,future_source:'inventory + runtime sitemap',plans}))
} finally { await db.close() }
