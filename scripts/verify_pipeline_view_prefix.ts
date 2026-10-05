/** LOCAL PostgreSQL only: replace the frozen legacy view, retain its dependencies. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js'
import { pipelineWithCurrentUniverse } from '../src/lib/opportunity-universe.ts'

const read = (path: string) => readFileSync(path, 'utf8')
const migration = read('supabase/migrations/202610030001_pipeline_trace_contract_v2.sql')
const legacy = read('scripts/fixtures/pipeline-prod-prefix-20261005.sql')
const preflight = read('artifacts/release/final-release-preflight-readonly.sql')
const manifest = JSON.parse(preflight.match(/\$manifest\$([\s\S]*?)\$manifest\$/)![1])
const db = new PGlite()
const setup = `create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions; create domain public.vector as text;
    create function public.vector_dims(public.vector) returns integer language sql immutable as $$select 384$$;`
const tables: string[] = []
const ident = (s: string) => `"${s.replaceAll('"', '""')}"`
const fields = async (name = 'opportunity_pipeline_status') => (await db.query(`
  select a.attnum::integer ordinal,a.attname name,format_type(a.atttypid,a.atttypmod) type
  from pg_attribute a where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attnum
`, [`public.${name}`])).rows as { ordinal: number, name: string, type: string }[]
const pipelineCheck = async (sql: string) => {
  await db.exec('begin read only')
  try {
    const row = (await db.query(sql)).rows[0] as any
    return row.cvitae_release_preflight.view_replace_compatibility.find((v: any) => v.name === 'opportunity_pipeline_status')
  } finally { await db.exec('rollback') }
}
try {
  await db.exec(setup)
  for (const name of ['opportunities','opportunity_source_observations','opportunity_factory_snapshots',
    'opportunity_universe_state','opportunity_source_identity_aliases','scraper_runs']) {
    const r = manifest.relations.find((r: any) => r.name === name)
    const columns = r.columns.filter((c: any) => !c.provided_by).map((c: any) => `${ident(c.name)} ${c.type}`)
    if (name === 'opportunities') columns.push('primary key(id)')
    if (name === 'scraper_runs') columns.push('id uuid primary key')
    const sql = `create table public.${ident(name)} (${columns.join(',')})`
    tables.push(sql)
    await db.exec(sql)
  }
  // The independent fixture is the original pre-v2 migration, not candidate-derived SQL.
  await db.exec(legacy)
  await db.exec('grant select on opportunities,opportunity_source_observations,opportunity_factory_snapshots,opportunity_universe_state,opportunity_source_identity_aliases to service_role')
  const before = await fields()
  assert.equal(before.length, 72)
  assert.deepEqual(before[16], { ordinal: 17, name: 'ingestion_reason', type: 'text' })
  assert.deepEqual(before[17], { ordinal: 18, name: 'provenance_certainty', type: 'text' })
  await db.exec(`create view public.legacy_pipeline_consumer as select * from public.opportunity_pipeline_status;
    insert into public.opportunities(id,source,created_at,updated_at) values('legacy','local_trace_fixture',now(),now());
    insert into public.opportunity_ingestion_events(event_key,opportunity_id,canonical_source,producer_id,run_id,outcome,trace_state,identity_sha256,reason)
      values('legacy','legacy','local_trace_fixture','LOCAL_TEST','LOCAL_RUN','UNCHANGED','TRACED','LOCAL_FIXTURE_ONLY','LEGACY_REASON');`)
  const receiptBefore = (await db.query('select to_jsonb(e) receipt from opportunity_ingestion_events e')).rows[0].receipt
  const objectBefore = (await db.query(`select 'public.opportunity_pipeline_status'::regclass::oid oid`)).rows[0].oid

  // Discriminator reproduces the rejected middle insertion, including real PG error.
  const appended = '  li.outcome as ingestion_outcome,\n  li.trace_contract_version as ingestion_trace_contract_version,\n  li.reason as ingestion_outcome_reason'
  assert.ok(migration.includes(appended))
  const bad = migration.replace('  lo.evidence as observation_evidence,\n'+appended, '  lo.evidence as observation_evidence')
    .replace("else 'LEGACY_TRACE_STATE_UNVERIFIED' end as ingestion_state,", "else 'LEGACY_TRACE_STATE_UNVERIFIED' end as ingestion_state,\n  li.outcome as ingestion_outcome,\n  li.trace_contract_version as ingestion_trace_contract_version,")
    .replace('end) as ingestion_reason,', 'end) as ingestion_reason,\n  li.reason as ingestion_outcome_reason,')
  await db.exec('begin')
  await assert.rejects(db.exec(bad), /cannot change name of view column "ingestion_reason" to "ingestion_outcome"/)
  await db.exec('rollback')
  assert.deepEqual(await fields(), before)
  console.log('PASS negative: real PostgreSQL rejects the old ordinal17/18 insertion; transaction leaves legacy prefix intact')

  const wrongManifest = structuredClone(manifest)
  const wrongView = wrongManifest.views.find((v: any) => v.name === 'opportunity_pipeline_status')
  const prefix = wrongView.columns.slice(0,72), tail = wrongView.columns.slice(72)
  assert.deepEqual(tail.map((c: any) => c.name), ['ingestion_outcome','ingestion_trace_contract_version','ingestion_outcome_reason'])
  wrongView.columns = [...prefix.slice(0,16),...tail.slice(0,2),prefix[16],tail[2],...prefix.slice(17)]
  wrongView.columns.forEach((c: any, i: number) => c.ordinal = i+1)
  const wrongPreflight = preflight.replace(/\$manifest\$[\s\S]*?\$manifest\$/, `$manifest$${JSON.stringify(wrongManifest)}$manifest$`)
  assert.equal((await pipelineCheck(wrongPreflight)).status, 'BLOCKER_VIEW_PREFIX_OR_TYPE')
  assert.equal((await pipelineCheck(preflight)).status, 'PASS', 'correct prefix permits append before application')

  await db.exec('begin')
  await db.exec(migration)
  await db.exec('commit')
  const after = await fields()
  assert.deepEqual(after.slice(0,before.length), before, 'every legacy name/type/ordinal retained')
  assert.deepEqual(after.slice(72), [
    { ordinal:73,name:'ingestion_outcome',type:'text' },
    { ordinal:74,name:'ingestion_trace_contract_version',type:'text' },
    { ordinal:75,name:'ingestion_outcome_reason',type:'text' },
  ])
  assert.equal((await db.query(`select 'public.opportunity_pipeline_status'::regclass::oid oid`)).rows[0].oid, objectBefore)
  assert.deepEqual(await fields('legacy_pipeline_consumer'), before, 'existing SELECT * dependency remains valid')
  const receiptAfter = (await db.query(`select to_jsonb(e)-'trace_contract_version'-'identity_factual'-'trace_reason' receipt from opportunity_ingestion_events e`)).rows[0].receipt
  assert.deepEqual(receiptAfter, receiptBefore, 'existing receipt data untouched')
  assert.equal((await pipelineCheck(preflight)).status, 'PASS')
  console.log('PASS corrected migration: same view OID/dependency; all72 legacy names/types/ordinals; 3 text fields appended; preflight BLOCKER -> PASS')

  const outcomes = ['INSERTED','UPDATED','UNCHANGED','DUPLICATE_IN_RUN','BUDGET_SKIPPED','REJECTED','PERSISTENCE_FAILED']
  const event = async (key: string, id: string|null, outcome: string, trace: string, factual = true) => db.query(`
    insert into opportunity_ingestion_events(event_key,opportunity_id,canonical_source,producer_id,run_id,
      outcome,trace_state,identity_sha256,trace_contract_version,identity_factual,trace_reason,reason)
    values($1,$2,'local_trace_fixture','LOCAL_TEST','LOCAL_RUN',$3,$4,'LOCAL_FIXTURE_ONLY','v2',$5,
      case when $4='TRACED' then 'TRACE_REQUIREMENTS_SATISFIED' else 'IDENTITY_NOT_FACTUAL' end,'OUTCOME_REASON')
  `,[key,id,outcome,trace,factual])
  for (const outcome of outcomes) {
    await db.query(`insert into opportunities(id,source,created_at,updated_at) values($1,'local_trace_fixture',now(),now())`,[outcome])
    await event(outcome,outcome,outcome,'TRACED')
  }
  for (const outcome of ['BUDGET_SKIPPED','REJECTED','PERSISTENCE_FAILED']) await event(`unlinked-${outcome}`,null,outcome,'TRACED')
  for (const outcome of outcomes.slice(0,4)) await assert.rejects(event(`missing-id-${outcome}`,null,outcome,'TRACED'), /v2_persisted_identity/)
  await assert.rejects(event('not-factual','INSERTED','UPDATED','TRACED',false), /v2_traced_requirements/)
  await db.exec(`insert into opportunities(id,source,created_at,updated_at) values
    ('incomplete','local_trace_fixture',now(),now()),('historical','local_trace_fixture',now(),now())`)
  await event('incomplete','incomplete','REJECTED','INCOMPLETE',false)
  const rows = (await db.query('select * from opportunity_pipeline_status order by opportunity_id')).rows as any[]
  for (const row of rows) {
    assert.equal(row.ingestion_state,row.next_actions.INGESTION.state)
    if (row.ingestion_state === 'TRACED') {
      assert.notEqual(row.pipeline_health,'TRACE_INCOMPLETE')
      assert.equal(row.next_actions.INGESTION.next_action,'NONE')
      assert.equal(row.ingestion_outcome,row.next_actions.INGESTION.outcome)
      assert.equal(row.ingestion_reason,'TRACE_REQUIREMENTS_SATISFIED')
      assert.equal(row.ingestion_outcome_reason,'OUTCOME_REASON')
    }
    if (row.opportunity_id === 'legacy') assert.equal(row.ingestion_state,'LEGACY_TRACE_STATE_UNVERIFIED')
    if (row.opportunity_id === 'historical') assert.equal(row.ingestion_state,'HISTORICAL_DB_PRESENCE')
    if (row.opportunity_id === 'incomplete') {
      assert.equal(row.ingestion_state,'INCOMPLETE'); assert.equal(row.pipeline_health,'TRACE_INCOMPLETE')
      assert.equal(row.next_action,'REPAIR_INGESTION_TRACE')
      assert.equal(row.next_actions.INGESTION.next_action,'REPAIR_INGESTION_TRACE')
    }
  }
  const ledger = (await db.query('select admin_opportunity_pipeline_ledger() payload')).rows[0].payload as any
  assert.equal(ledger.counts.total_inventory,10)
  assert.equal(ledger.counts.ingestion_traced,7)
  assert.equal(ledger.counts.ingestion_trace_incomplete,1)
  assert.equal(ledger.counts.ingestion_trace_legacy_unverified,1)
  assert.equal(ledger.counts.ingestion_historical_untraced,1)
  assert.equal(ledger.sources[0].ingestion_traced,7)
  assert.equal(ledger.sources[0].ingestion_trace_incomplete,1)
  const accounting = (await db.query(read('artifacts/opportunity-pipeline/verify-prod.sql'))).rows[0] as any
  assert.equal(accounting.opportunity_pipeline_verification.PIPELINE_ROWS,10)
  await db.exec('set role service_role')
  assert.equal(((await db.query('select admin_opportunity_pipeline_ledger() payload')).rows[0].payload as any).counts.total_inventory,10)
  const inspector = (await db.query("select * from opportunity_pipeline_status where opportunity_id='REJECTED'")).rows[0] as any
  assert.equal(inspector.ingestion_state,'TRACED')
  assert.equal(inspector.ingestion_outcome,'REJECTED')
  await db.exec('reset role')
  console.log('PASS C02/C03: seven outcomes orthogonal to trace; persisted ID/factual constraints; historical uncertainty; one trace authority; Admin ledger counts/permissions/accounting')

  const named = JSON.parse(JSON.stringify(rows.find(r => r.opportunity_id === 'REJECTED')))
  const reordered = Object.fromEntries(Object.entries(named).reverse())
  assert.equal(pipelineWithCurrentUniverse(reordered,null)!.ingestion_state,'TRACED')
  assert.equal(pipelineWithCurrentUniverse(reordered,null)!.ingestion_outcome,'REJECTED')
  const consumer_diagnostics = Object.fromEntries(['CATALOG','MATCHING','ALERTS','SEO'].map(c =>
    [c,{ effective_state:'UNKNOWN', first_unresolved_or_blocking_reason:'LOCAL_PROJECTION_FIXTURE' }]))
  const projected = pipelineWithCurrentUniverse(reordered,{ consumer_diagnostics })!
  for (const field of ['ingestion_state','ingestion_reason','ingestion_outcome','ingestion_trace_contract_version','ingestion_outcome_reason'])
    assert.equal(projected[field],named[field],`named Admin projection retains ${field}`)
  const admin = read('netlify/functions/admin-data.ts')
  assert.match(admin,/from\("opportunity_pipeline_status"\)\.select\("\*"\)\.eq\("opportunity_id", id\)\.maybeSingle\(\)/)
  assert.match(admin,/pipelineWithCurrentUniverse\(pipelineResult\.data \|\| null, data\)/)
  assert.doesNotMatch(admin,/Object\.values\(pipelineResult\.data|pipelineResult\.data\s*\[\s*\d+/)
  const ui = read('src/components/admin/SourceOperationsView.tsx')
  assert.match(ui,/universeRowDiagnosis\.pipeline\.ingestion_state/)
  assert.match(ui,/universeRowDiagnosis\.pipeline\.ingestion_reason/)
  assert.match(ui,/JSON\.stringify\(\{ normalized: universeRowDiagnosis\.pipeline\.normalized_fields_snapshot/)
  console.log('PASS consumers: SQL SELECT * uses named fields and retains dependencies; Admin REST/object projection uses names, not ordinals')
  const fresh = new PGlite()
  try {
    await fresh.exec(setup)
    for (const sql of tables) await fresh.exec(sql)
    await fresh.exec(read('supabase/migrations/202610020001_opportunity_pipeline_ledger.sql'))
    await fresh.exec(migration)
    await fresh.exec(migration) // compatible replacement is repeatable as well.
    const freshFields = (await fresh.query(`select attnum::integer ordinal,attname name,format_type(atttypid,atttypmod) type
      from pg_attribute where attrelid='public.opportunity_pipeline_status'::regclass and attnum>0 and not attisdropped order by attnum`)).rows
    assert.deepEqual(freshFields, after)
    console.log('PASS fresh installation: initial + corrective migration twice yields the identical 72+3 projection')
  } finally { await fresh.close() }
} finally { await db.close() }
