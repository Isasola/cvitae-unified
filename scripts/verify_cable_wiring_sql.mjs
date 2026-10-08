/** Offline PostgreSQL execution of the actual reducers/triggers/views. No network. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { PGlite } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js'
import { pg_trgm } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js'
import { createPublicOpportunitiesHandler } from '../netlify/functions/public-opportunities.ts'
import { pipelineWithCurrentUniverse } from '../src/lib/opportunity-universe.ts'
const db = new PGlite({ extensions: { pg_trgm } })
const sql = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
const query = async (text, params = []) => (await db.query(text, params)).rows
const checks = []

const pass = name => { checks.push(name); console.log(`PASS ${name}`) }
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create function auth.role() returns text language sql as $$select 'service_role'::text$$;
    grant usage on schema auth to anon,authenticated,service_role;
    create table opportunities (
      id text primary key, source text, slug text, title text, organization text, description text,
      location text, rubro text, opportunity_type text, opportunity_kind text, type text,
      is_active boolean, verification_status text, deadline text, deleted_at timestamptz, archived_at timestamptz,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      catalog_eligible boolean, match_eligible boolean, alerts_eligible boolean, seo_eligible boolean, seo_status text,
      country_code text, tags jsonb, requirements jsonb, verification_score integer, verification_reasons jsonb,
      reviewed_at timestamptz, reviewed_by text, application_url text, source_url text
    );
    create table opportunity_sources (
      source text primary key, display_name text, trust_level text, source_tier text,
      auto_verify boolean default false, is_enabled boolean default true,
      catalog_enabled boolean default false, matching_enabled boolean default false, alerts_enabled boolean default false, seo_enabled boolean default true,
      notes text, country_code text, allowed_country_codes text[], allowed_opportunity_types text[],
      max_items_per_day integer, retention_days integer, verification_criteria jsonb,
      updated_at timestamptz default now(), updated_by text,
      registry_certified boolean, registry_adapter_version text, registry_policy_hash text, registry_synced_at timestamptz,
      web_catalog_allowed boolean, search_engine_indexing_allowed boolean, google_jobs_distribution_allowed boolean,
      third_party_job_distribution_allowed boolean, source_attribution_required boolean
    );
    create table opportunity_source_observations (
      id uuid primary key default gen_random_uuid(), opportunity_id text references opportunities(id),source text,
      identity_status text,http_status integer,observed_at timestamptz default now()
    );
    create table admin_policy_events (
      id uuid primary key default gen_random_uuid(), entity_type text,entity_key text,before_state jsonb,after_state jsonb,
      impacted_rows integer,actor text,created_at timestamptz default now()
    );
  `)
  await db.exec('grant select,insert,update,delete on opportunities,opportunity_sources,opportunity_source_observations to service_role')
  await db.exec(sql('supabase/migrations/202609200002_safe_source_distribution_policy.sql'))
  await db.exec(sql('supabase/migrations/202609280001_opportunity_universe.sql'))
  await db.exec(sql('supabase/migrations/202610030002_opportunity_universe_seo_permission.sql'))
  for (const source of ['himalayas','jobicy','remotive','unjobs','weworkremotely']) {
    await query('insert into opportunity_sources(source,auto_verify) values($1,true)', [source])
    await query('insert into opportunity_source_identity_aliases values($1,$1) on conflict do nothing', [source])
    for (const consumer of ['catalog','matching','alerts','seo_index']) {
      const state = source === 'unjobs' ? 'UNKNOWN' : source === 'weworkremotely' ? 'DENIED' : 'ALLOWED'
      await query(`insert into opportunity_source_consumer_permissions(canonical_source,consumer,permission_state,reason,provenance)
        values($1,$2,$3,'LOCAL_CONTRACT_FIXTURE','LOCAL_ONLY') on conflict(canonical_source,consumer) do update set permission_state=excluded.permission_state`, [source, consumer, state])
    }
  }
  const insert = async (id, source='himalayas', active=true, title='Programme Officer') => query(`
    insert into opportunities(id,source,slug,title,organization,description,opportunity_type,is_active,verification_status,updated_at,rubro)
    values($1,$2,$1,$4,'Factual fixture organization',repeat('Lead programme delivery, research and stakeholder coordination with professional experience. ',3),
      'job',$3,'verified',now()-interval '1 day','Research')`, [id,source,active,title])
  await insert('existing')
  await query("update opportunity_sources set is_enabled=false,seo_enabled=false where source='himalayas'")
  assert.equal((await query("select catalog_state from opportunity_universe_state where opportunity_id='existing'"))[0].catalog_state, 'NOT_READY')
  await db.exec(sql('supabase/migrations/202610040001_source_switch_wiring.sql'))
  await db.exec(sql('supabase/migrations/202610040002_public_catalog_coverage.sql'))
  assert.equal((await query('select count(*) n from opportunity_catalog_universe'))[0].n, 0)
  const pendingAdmin=(await query("select get_opportunity_universe_row('existing') result"))[0].result
  assert.notEqual(pendingAdmin.consumer_diagnostics.CATALOG.effective_state,'READY','Admin cannot declare historical repair before it reaches the real view')
  assert.equal(pendingAdmin.policy_reconciliation_pending,true)
  assert.equal(pendingAdmin.first_broken_cable,'UNIVERSE_RECONCILIATION: STORED_FINAL_MATCHING_NOT_READY')
  const reconcile = (await query('select reconcile_opportunity_universe_page(null,25,true) result'))[0].result
  assert.equal(reconcile.examined, 1)
  for (const view of ['opportunity_catalog_universe','opportunity_final_matching_universe','opportunity_alert_universe']) {
    assert.equal((await query(`select count(*) n from ${view} where id='existing'`))[0].n, 1)
  }
  pass('CASE_6_EXISTING_RECONCILIATION_REAL_VIEWS')
  await db.exec('set role service_role')
  await insert('future')
  for(const view of ['opportunity_catalog_universe','opportunity_final_matching_universe','opportunity_alert_universe','opportunity_seo_universe'])
    assert.equal((await query(`select count(*) n from ${view} where id='future'`))[0].n,1,`${view} must work under the real runtime role`)
  await query("select get_opportunity_universe_row('future')")
  await db.exec('reset role')
  await db.exec('set role anon')
  await query('select * from get_source_distribution_policy()')
  await assert.rejects(query('select canonical_opportunity_source_policy(\'himalayas\')'), /permission denied/)
  await assert.rejects(query('select * from admin_policy_events'), /permission denied/)
  await db.exec('reset role')
  pass('SERVICE_ROLE_CONSUMERS_AND_ANON_MINIMAL_PROJECTION_ONLY')
  for (const field of ['catalog_state','final_matching_state','alerts_state']) assert.equal((await query("select * from opportunity_universe_state where opportunity_id='future'"))[0][field],'READY')
  pass('CASE_1_HIMALAYAS_ALLOWED_DEFAULTS')
  pass('CASE_7_FUTURE_AFTER_INSERT_AUTOMATIC')
  for (const source of ['jobicy','remotive']) {
    await insert(source,source)
    const state = (await query('select * from opportunity_universe_state where opportunity_id=$1',[source]))[0]
    for (const field of ['catalog_state','final_matching_state','alerts_state']) assert.equal(state[field],'READY')
  }
  pass('CASE_2_JOBICY_REMOTIVE_STALE_DEFAULTS')
  await query("update opportunity_sources set catalog_enabled=true,matching_enabled=true,alerts_enabled=true where source in ('unjobs','weworkremotely')")
  for (const source of ['unjobs','weworkremotely']) {
    await insert(source,source)
    const state = (await query('select * from opportunity_universe_state where opportunity_id=$1',[source]))[0]
    for (const field of ['catalog_state','final_matching_state','alerts_state']) assert.equal(state[field],'READY','first-party routing ignores historical source-level permission vetoes')
    assert.equal((await query('select count(*) n from opportunity_catalog_universe where id=$1',[source]))[0].n,1)
  }
  pass('CASE_3_UNKNOWN_ADVISORY_ROW_DRIVEN')
  pass('CASE_4_DENIED_ADVISORY_ROW_DRIVEN')
  // The current false -> false request must still record operator intent.
  await query(`select admin_update_source_policy_atomic('himalayas','{"catalog_enabled":false,"matching_enabled":false,"alerts_enabled":false}',null,'admin')`)
  assert.equal((await query('select count(*) n from opportunity_catalog_universe where source=\'himalayas\''))[0].n,0,'explicit kill takes effect before dirty queue drains')
  const killedAdmin=(await query("select get_opportunity_universe_row('future') result"))[0].result
  assert.equal(killedAdmin.consumer_diagnostics.CATALOG.effective_state,'NOT_READY')
  assert.equal(killedAdmin.consumer_diagnostics.MATCHING.effective_state,'NOT_READY')
  const persisted=(await query("select * from opportunity_universe_state where opportunity_id='future'"))[0]
  const inspectorPipeline=pipelineWithCurrentUniverse({...persisted,ingestion_state:'TRACED',ingestion_outcome:'REJECTED',
    pipeline_health:'ROUTED',next_action:'NO_ACTION',blocking_phases:[],next_actions:{INGESTION:{state:'TRACED'}}},killedAdmin)
  assert.equal(inspectorPipeline.catalog_state,'NOT_READY')
  assert.equal(inspectorPipeline.final_matching_state,'NOT_READY')
  assert.equal(inspectorPipeline.next_actions.CATALOG.state,'NOT_READY')
  assert.equal(inspectorPipeline.next_actions.MATCHING.state,'NOT_READY')
  assert.equal(inspectorPipeline.pipeline_health,'ROUTED_WITH_EXCLUSIONS')
  assert.equal(inspectorPipeline.persisted_consumer_states.CATALOG,'READY')
  assert.equal(inspectorPipeline.ingestion_state,'TRACED')
  assert.equal(inspectorPipeline.ingestion_outcome,'REJECTED')
  assert.equal(inspectorPipeline.next_actions.INGESTION.state,'TRACED')
  assert.match(sql('netlify/functions/admin-data.ts'),/pipeline: pipelineWithCurrentUniverse\(pipelineResult.data \|\| null, data\)/)
  await insert('killed')
  const killed=(await query("select * from opportunity_universe_state where opportunity_id='killed'"))[0]
  assert.equal(killed.final_matching_state,'NOT_READY')
  assert.equal(killed.source_matching_operational_reason,'SOURCE_MATCHING_DISABLED')
  assert.equal((await query("select * from get_source_distribution_policy() where source='himalayas'"))[0].consumer_switch_overrides.matching,false)
  pass('CASE_5_EXPLICIT_KILL_AND_PUBLIC_PROJECTION')
  await query(`select admin_update_source_policy_atomic('himalayas','{"catalog_enabled":true,"matching_enabled":true,"alerts_enabled":true}',null,'admin')`)
  await insert('unknown-lifecycle','himalayas',null)
  assert.equal((await query("select lifecycle_state from opportunity_universe_state where opportunity_id='unknown-lifecycle'"))[0].lifecycle_state,'LIFECYCLE_UNKNOWN')
  await query(`insert into opportunity_source_observations(opportunity_id,source,identity_status,http_status) values('unknown-lifecycle','himalayas','IDENTITY_CONFIRMED',200)`)
  const resolved=(await query("select * from opportunity_universe_state where opportunity_id='unknown-lifecycle'"))[0]
  assert.equal(resolved.lifecycle_state,'ACTIVE_VALID')
  for (const field of ['catalog_state','final_matching_state','alerts_state']) assert.equal(resolved[field],'READY')
  pass('CASE_8_UNKNOWN_FACTUAL_OBSERVATION_AUTOMATIC')
  // C09.1: a stale default is not a manual kill; permissions never own collection.
  assert.equal((await query("select canonical_opportunity_source_policy('weworkremotely') p"))[0].p.is_enabled,true)
  assert.equal((await query("select canonical_opportunity_source_policy('unjobs') p"))[0].p.is_enabled,true)
  assert.equal((await query("select * from get_source_distribution_policy() where source='himalayas'"))[0].seo_enabled,true)
  await query(`select admin_update_source_policy_atomic('himalayas','{"seo_enabled":false}',null,'admin')`)
  const seoKill=(await query("select get_opportunity_universe_row('future') p"))[0].p
  assert.equal(seoKill.consumer_diagnostics.SEO.effective_state,'NOT_READY')
  assert.equal(seoKill.consumer_diagnostics.MATCHING.effective_state,'READY')
  assert.equal((await query("select canonical_opportunity_source_policy('himalayas') p"))[0].p.consumer_switch_overrides.seo,false)
  await query(`select admin_update_source_policy_atomic('himalayas','{"is_enabled":false}',null,'admin')`)
  assert.equal((await query("select canonical_opportunity_source_policy('himalayas') p"))[0].p.is_enabled,false)
  assert.equal((await query("select count(*) n from opportunity_catalog_universe where source='himalayas'"))[0].n,0)
  await insert('operator-killed-row')
  assert.equal((await query("select verification_status from opportunities where id='operator-killed-row'"))[0].verification_status,'verified','operator switch cannot falsify row verification')
  assert.equal((await query("select catalog_state from opportunity_universe_state where opportunity_id='operator-killed-row'"))[0].catalog_state,'NOT_READY','operator kill still blocks delivery')
  await query(`select admin_update_source_policy_atomic('himalayas','{"is_enabled":true,"seo_enabled":true}',null,'admin')`)
  await insert('seo-thin','himalayas')
  await query("update opportunities set description='' where id='seo-thin'")
  assert.equal((await query("select seo_state from opportunity_universe_state where opportunity_id='seo-thin'"))[0].seo_state,'NOT_READY')
  await query("update opportunities set description=repeat('Factual programme responsibilities and experience. ',4) where id='seo-thin'")
  assert.equal((await query("select seo_state from opportunity_universe_state where opportunity_id='seo-thin'"))[0].seo_state,'READY')
  // Every ready source fixture uses the same persisted reducer, including historical advisory DENIED.
  for (const source of ['computrabajo','impactpool','fundacion_carolina','arbeitnow']) {
    await query('insert into opportunity_sources(source,auto_verify,is_enabled) values($1,true,false)',[source])
    await query('insert into opportunity_source_identity_aliases values($1,$1) on conflict do nothing',[source])
    for (const consumer of ['catalog','matching','alerts','seo_index','google_jobs','third_party_distribution'])
      await query(`insert into opportunity_source_consumer_permissions(canonical_source,consumer,permission_state,reason,provenance)
        values($1,$2,'DENIED','EXPLICIT_LOCAL_NEGATIVE_FIXTURE','LOCAL_ONLY') on conflict do nothing`,[source,consumer])
    await insert(source,source)
    const state=(await query('select * from opportunity_universe_state where opportunity_id=$1',[source]))[0]
    for (const field of ['catalog_state','final_matching_state','alerts_state','seo_state']) assert.equal(state[field],'READY')
    assert.equal(state.provenance.temporary_legacy_seo_exception,undefined)
    const admin=(await query('select get_opportunity_universe_row($1) p',[source]))[0].p
    for (const consumer of ['CATALOG','MATCHING','ALERTS','SEO']) {
      assert.equal(admin.consumer_diagnostics[consumer].permission_state,'DENIED')
      assert.equal(admin.consumer_diagnostics[consumer].permission_role,'ADVISORY_FIRST_PARTY')
      assert.equal(admin.consumer_diagnostics[consumer].effective_state,'READY')
    }
  }
  await query(`insert into opportunity_source_consumer_permissions(canonical_source,consumer,permission_state,reason,provenance)
    values('weworkremotely','google_jobs','DENIED','EXPLICIT_LOCAL_NEGATIVE_FIXTURE','LOCAL_ONLY')`)
  await query(`select admin_update_source_policy_atomic('weworkremotely','{"seo_enabled":false}',null,'admin')`)
  assert.equal((await query("select count(*) n from opportunity_seo_universe where source='weworkremotely'"))[0].n,0)
  assert.equal((await query("select count(*) n from opportunity_catalog_universe where source='weworkremotely'"))[0].n,1)
  await query(`select admin_update_source_policy_atomic('weworkremotely','{"seo_enabled":true}',null,'admin')`)
  await query("insert into opportunity_sources(source,is_enabled,auto_verify) values('conacyt_convocatorias',true,true)")
  await query("insert into opportunity_source_identity_aliases values('conacyt_convocatorias','conacyt_convocatorias') on conflict do nothing")
  assert.equal((await query("select canonical_opportunity_source_policy('conacyt_convocatorias') p"))[0].p.producer_state,'NO_EXECUTABLE_PRODUCER')
  assert.equal((await query("select canonical_opportunity_source_policy('conacyt_convocatorias') p"))[0].p.is_enabled,false)
  await insert('no-producer','conacyt_convocatorias')
  assert.equal((await query("select get_opportunity_universe_row('no-producer') p"))[0].p.source_operational_reason,'NO_EXECUTABLE_PRODUCER')
  pass('C09_1_FIRST_PARTY_ROW_DRIVEN_EXTERNAL_DENIED_ADVISORY_AND_NO_PRODUCER')
  pass('C09_1_OPERATIONAL_DEFAULT_SOURCE_AND_SEO_AUDITED_KILLS_ROW_REPAIR')
  // More than 1,000 existing rows; search and area predicates execute in SQL.
  for (let page=0;page<6;page++) await db.exec(`insert into opportunities(id,source,slug,title,organization,description,opportunity_type,is_active,verification_status,updated_at,rubro)
    select 'bulk-'||lpad(n::text,5,'0'),'himalayas','bulk-'||n,'Programme Officer','Fixture',repeat('Professional programme coordination responsibilities and factual experience requirements. ',3),'job',true,'verified',now()+interval '1 day','Operations'
    from generate_series(${page*200},${page*200+199}) n`)
  await insert('beyond-1000','himalayas',true,'Rare Precision Engineer')
  const found = await query("select id from search_public_opportunities('Rare Precision','Research',null,'jobs',null,null,101)")
  assert.equal(found.length,1); assert.equal(found[0].id,'beyond-1000')
  const publicHandler=createPublicOpportunitiesHandler(() => ({
    rpc: async (name,args) => ({ data: name==='get_source_distribution_policy'
      ? await query('select * from get_source_distribution_policy()')
      : await query('select * from search_public_opportunities($1,$2,$3,$4,$5,$6,$7)',[args.p_query,args.p_area,args.p_types,args.p_mode,args.p_after_updated_at,args.p_after_id,args.p_limit]), error:null }),
    from: name => {
      assert.equal(name,'opportunity_seo_universe')
      return { select: columns => {
        assert.equal(columns,'id')
        return { in: async (field,ids) => {
          assert.equal(field,'id'); assert.ok(ids.length<=100)
          return { data:await query('select id from opportunity_seo_universe where id=any($1::text[])',[ids]),error:null }
        } }
      } }
    },
  }))
  const response=await publicHandler({queryStringParameters:{mode:'jobs',q:'Rare Precision',area:'Research'}},{})
  assert.equal(response.statusCode,200)
  assert.equal(JSON.parse(response.body)[0].id,'beyond-1000','real public handler reads the indexed canonical query beyond the first 1,000')
  await db.exec('set enable_seqscan=off')
  const plan=await query("explain select id from opportunities where catalog_search_text(title,organization,location,rubro,opportunity_type,opportunity_kind) like '%rare precision%'")
  assert.ok(JSON.stringify(plan).includes('opportunities_catalog_search_idx'))
  await db.exec('reset enable_seqscan')
  let cursor=null, seen=new Set(), requests=0
  do {
    const rows=await query('select * from search_public_opportunities($1,null,null,$2,$3,$4,101)',['','jobs',cursor?.at||null,cursor?.id||null])
    for (const row of rows.slice(0,100)) { assert.ok(!seen.has(row.id)); seen.add(row.id) }
    const last=rows.slice(0,100).at(-1)
    cursor=rows.length>100?{at:last.updated_at,id:last.id}:null
    requests++
  } while(cursor)
  const total=(await query('select count(*) n from opportunity_catalog_universe'))[0].n
  assert.equal(seen.size,total); assert.ok(requests>10)
  pass('CASE_9_SEARCH_AFTER_1000_INDEX_AND_ALL_CATALOG_PAGES')
  let dirtyPages=0
  await query("update opportunity_sources set catalog_enabled=catalog_enabled where source='himalayas'")
  do {
    const result=(await query('select refresh_dirty_opportunity_universe_sources(1) result'))[0].result
    assert.ok(result.opportunities_refreshed<=250)
    dirtyPages++
    if (!result.pending_sources) break
    assert.ok(dirtyPages<30)
  } while(true)
  assert.ok(dirtyPages>4)
  assert.equal((await query("select count(*) n from opportunity_universe_dirty_sources"))[0].n,0)
  pass('DIRTY_SOURCE_BOUNDED_RESUMABLE_FULL_COVERAGE')
  // Historical cursor RPC also finishes the whole denominator and is idempotent.
  let historicalCursor=null, historicalRows=0, historicalPages=0
  do {
    const result=(await query('select reconcile_opportunity_universe_page($1,250,true) result',[historicalCursor]))[0].result
    assert.ok(result.examined<=250); assert.equal(result.changed_lifecycle_flags,0)
    historicalRows+=result.examined; historicalCursor=result.cursor_id; historicalPages++
    if(result.complete) break
    assert.ok(historicalPages<20)
  } while(true)
  assert.equal(historicalRows,(await query('select count(*) n from opportunities'))[0].n)
  pass('HISTORICAL_CURSOR_COMPLETE_IDEMPOTENT_NO_PER_CONSUMER_SCAN')
  await insert('deadline-due')
  await query('update opportunities set deadline=$1 where id=$2',[new Date(Date.now()+1000).toISOString(),'deadline-due'])
  assert.ok((await query("select next_lifecycle_check_at from opportunity_universe_state where opportunity_id='deadline-due'"))[0].next_lifecycle_check_at)
  await new Promise(resolve=>setTimeout(resolve,1500))
  assert.equal((await query('select refresh_due_opportunity_universe(1) n'))[0].n,1)
  assert.equal((await query("select lifecycle_state from opportunity_universe_state where opportunity_id='deadline-due'"))[0].lifecycle_state,'EXPIRED')
  assert.equal((await query('select refresh_due_opportunity_universe(1) n'))[0].n,0,'no unchanged inventory replay on the next due run')
  await db.exec('set enable_seqscan=off')
  const duePlan=await query('explain select opportunity_id from opportunity_universe_state where next_lifecycle_check_at<=now() order by next_lifecycle_check_at,opportunity_id limit 500')
  assert.match(JSON.stringify(duePlan),/opportunity_universe_next_lifecycle_check_idx/)
  await db.exec('reset enable_seqscan')
  pass('COMMON_LIFECYCLE_DUE_INDEX_EXACT_SET_NO_UNCHANGED_REPLAY')
  const seo=(await query('select id from opportunity_seo_universe order by updated_at desc,id')).map(r=>r.id)
  const sitemap=[]
  for(let offset=0;offset<seo.length;offset+=1000) sitemap.push(...(await query('select id from opportunity_seo_universe order by updated_at desc,id limit 1000 offset $1',[offset])).map(r=>r.id))
  assert.deepEqual(sitemap,seo); assert.ok(sitemap.length>1000)
  pass('CASE_10_SITEMAP_PAGED_FULL_COVERAGE')
  const admin=(await query("select get_opportunity_universe_row('future') result"))[0].result
  assert.equal(admin.consumer_diagnostics.MATCHING.effective_state,'READY')
  assert.equal(admin.consumer_diagnostics.CATALOG.consumer_switch_state,'ALLOWED')
  pass('ADMIN_ROW_EXPLAINS_CANONICAL_CONSUMERS')
  // After exercising the verbatim migration, inject only the clock dependency
  // into the same reducer/view definitions to prove the inclusive date boundary.
  // Repository SQL is not modified; this isolated in-memory DB is destroyed.
  await query("insert into opportunity_sources(source,auto_verify) values('computrabajo',true) on conflict do nothing")
  await query("insert into opportunity_source_identity_aliases values('computrabajo','computrabajo') on conflict do nothing")
  for(const consumer of ['catalog','matching','alerts','seo_index']) await query(`insert into opportunity_source_consumer_permissions(canonical_source,consumer,permission_state,reason,provenance)
    values('computrabajo',$1,$2,'TEMPORARY_CONTRACT_FIXTURE','LOCAL_ONLY') on conflict(canonical_source,consumer) do update set permission_state=excluded.permission_state`,[consumer,consumer==='matching'?'UNKNOWN':'DENIED'])
  await insert('ct-legacy','computrabajo')
  await query("update opportunities set created_at='2026-09-20',seo_eligible=true,seo_status='eligible' where id='ct-legacy'")
  await db.exec(`create function public.cvitae_test_now() returns timestamptz language sql stable as $$select current_setting('cvitae.test_now')::timestamptz$$`)
  const wiringSql=sql('supabase/migrations/202610040001_source_switch_wiring.sql')
  const reducerStart=wiringSql.indexOf('create or replace function public.opportunity_universe_decision')
  const reducer=wiringSql.slice(reducerStart,wiringSql.indexOf('end $$;',reducerStart)+7)
  const seoViewStart=wiringSql.indexOf('create or replace view public.opportunity_seo_universe')
  const seoView=wiringSql.slice(seoViewStart,wiringSql.indexOf(';',seoViewStart)+1)
  await db.exec((reducer+'\n'+seoView).replaceAll('now()','public.cvitae_test_now()'))
  for(const [date,expected] of [['2026-10-03','READY'],['2026-10-09','READY'],['2026-10-10','READY']]) {
    await query("select set_config('cvitae.test_now',$1,false)",[`${date}T12:00:00Z`])
    await query("select refresh_opportunity_universe('ct-legacy')")
    const state=(await query("select * from opportunity_universe_state where opportunity_id='ct-legacy'"))[0]
    assert.equal(state.seo_state,expected)
    assert.equal((await query("select count(*) n from opportunity_seo_universe where id='ct-legacy'"))[0].n,expected==='READY'?1:0)
    for (const field of ['catalog_state','final_matching_state','alerts_state']) assert.equal(state[field],'READY')
    assert.equal(state.provenance.temporary_legacy_seo_exception,undefined)
  }
  await query("update opportunities set created_at='2026-10-10',seo_eligible=false,seo_status='pending' where id='ct-legacy'")
  assert.equal((await query("select seo_state from opportunity_universe_state where opportunity_id='ct-legacy'"))[0].seo_state,'READY')
  pass('COMPUTRABAJO_SQL_ALL_DATES_HISTORICAL_FUTURE_ROW_DRIVEN_NO_EXCEPTION')
  const rollback=sql('artifacts/release/final-cable-apply-plan.md').split('## I. Rollback exacto')[1].match(/```sql\n([\s\S]*?)```/)[1]
  await db.exec(rollback)
  assert.equal((await query("select count(*) n from opportunity_catalog_universe where id='jobicy'"))[0].n,0)
  assert.equal((await query("select count(*) n from opportunity_final_matching_universe where id='remotive'"))[0].n,0)
  assert.equal((await query("select * from get_source_distribution_policy() where source='jobicy'"))[0].consumer_switch_overrides.catalog,false)
  assert.ok((await query('select count(*) n from opportunity_universe_dirty_sources'))[0].n>0)
  pass('EXACT_RELEASE_PLAN_ROLLBACK_FUNCTION_AND_DIRTY_QUEUE')
  writeFileSync('artifacts/release/cable-local-sql-evidence.json',JSON.stringify({status:'LOCAL_SQL_EXECUTION_PASS',engine:'PGlite PostgreSQL',checks,catalog_rows:total,catalog_pages:requests,dirty_pages:dirtyPages,seo_urls:sitemap.length,checkpoint:"C09.1 delta; C09/C20 baseline retained",changed_migrations:["202610040001_source_switch_wiring.sql"],prod_executed:false},null,2)+'\n')
} finally { await db.close() }
