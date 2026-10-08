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
const migration = sql('supabase/migrations/202610080001_seo_universe_read_path.sql')
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
assert(!/grant|revoke|create\s+(or\s+replace\s+)?function/i.test(executable),'source permissions and function implementations are untouched')
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
const deadline = sql('supabase/migrations/202609280001_opportunity_universe.sql')
  .match(/create or replace function public\.opportunity_deadline_state[\s\S]*?end \$\$;/)[0]
const db = new PGlite()
const query = async (text, params=[]) => (await db.query(text, params)).rows
try {
  await db.exec(`
    create role service_role;
    create table opportunities (
      id text primary key, source text, slug text, title text, organization text,
      description text, opportunity_type text, deadline text, updated_at timestamptz,
      opportunity_kind text, type text, created_at timestamptz default now()
    );
    create table opportunity_universe_state (
      opportunity_id text primary key references opportunities(id),
      lifecycle_state text, seo_state text, final_matching_state text
    );
    create index opportunity_universe_final_matching_idx on opportunity_universe_state(final_matching_state,opportunity_id);
    create table opportunity_source_identity_aliases (emitted_source text primary key, canonical_source text not null);
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
    -- Match the supplied production policy-row cardinality, including inactive
    -- profiles which have no opportunities. These are explicit fixture inputs.
    insert into opportunity_sources
      select 'fixture_inactive_'||n, jsonb_build_object('canonical_source','fixture_inactive_'||n,'is_enabled',false,'seo_enabled',true)
      from generate_series(1,112) n;
    insert into opportunity_source_identity_aliases values ('future_alias','future_qualifying_producer');
    insert into opportunities(id,source,slug,title,organization,description,opportunity_type,deadline,updated_at)
      select lpad(n::text,8,'0'), case when n=6026 then 'future_qualifying_producer' when n=6025 then 'future_alias' when n%2=0 then 'jobicy' else 'himalayas' end,
        'role-'||n,'Factual programme officer','Factual organization',repeat('Factual programme delivery and professional responsibilities. ',4),
        'job',null, '2026-10-01'::timestamptz + (n%28)*interval '1 day'
      from generate_series(1,16536) n;
    insert into opportunity_universe_state
      select id,'ACTIVE_VALID',case when id<='00006026' then 'READY' else 'NOT_READY' end,'NOT_READY' from opportunities;
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
    await query(`insert into opportunities(id,source,slug,title,organization,description,opportunity_type,deadline,updated_at) values($1,$2,$3,'Factual programme officer','Organization',repeat('Factual professional responsibilities. ',5),'job',$4,now())`,[id,source,id==='z-no-slug'?null:id,date])
    await query('insert into opportunity_universe_state values($1,\'ACTIVE_VALID\',$2,\'NOT_READY\')',[id,state])
  }
  await db.exec(migration)
  await db.exec(migration) // index and replacement are repeatable
  assert.deepEqual(await metadata(),before,'column ordinals/types, owner, ACL and security_invoker are unchanged')
  assert.equal((await query("select id from seo_fixture_dependent where id='00000001'"))[0].id,'00000001','existing named dependency remains usable')
  assert.equal((await query(`select count(*) n from (
    (select * from opportunity_seo_universe except all select * from legacy_seo_fixture_reference)
    union all (select * from legacy_seo_fixture_reference except all select * from opportunity_seo_universe)
  ) differences`))[0].n,0,'all visible rows/columns match the actual 040001 definition')
  const visible = new Set((await query("select id from opportunity_seo_universe where id like 'z-%'")).map(row=>row.id))
  assert.deepEqual([...visible].sort(),['z-no-slug','z-nullable-seo','z-unknown'])
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
    assert(!nodes.some(node=>node['Node Type']==='Seq Scan' && node['Relation Name']==='opportunities'),'no full opportunities scan')
    assert(!nodes.some(node=>node['Index Name']==='opportunity_universe_state_pkey'),'no per-inventory universe PK lookups')
    const opportunities=nodes.filter(node=>node['Relation Name']==='opportunities')
    assert(opportunities.every(node=>node['Actual Loops']<=260),'opportunity lookups follow the current page, including late pages')
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
  console.log(JSON.stringify({status:'PASS',parity:'all rows and columns',metadata:'owner/ACL/security_invoker/columns preserved',rows:rows.length,pages:readPages,page_size:250,inventory:inventory.length,future_source:'inventory + runtime sitemap',plans}))
} finally { await db.close() }
