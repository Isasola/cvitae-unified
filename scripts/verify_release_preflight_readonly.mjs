/** Metadata preflight execution in embedded LOCAL PostgreSQL, never Supabase. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PGlite } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js'
import { pg_trgm } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js'

const sql = readFileSync('artifacts/release/final-release-preflight-readonly.sql', 'utf8')
const manifest = JSON.parse(sql.match(/\$manifest\$([\s\S]*?)\$manifest\$/)[1])
const statements = sql.replace(/--[^\n]*/g, '').replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/g, "''").replace(/'(?:''|[^'])*'/g, "''")
assert.equal((statements.match(/;/g) || []).length, 1)
assert.doesNotMatch(statements, /\b(insert|update|delete|merge|upsert|create|alter|drop|truncate|vacuum|analyze|refresh|call|do|set)\b/i)
assert.doesNotMatch(statements, /\bpublic\.[a-z_]+\s*\(/i, 'no application RPC invocation')
assert.doesNotMatch(sql, /pg_stat_statements|explain\s+analyze/i)
assert.match(sql, /AS cvitae_release_preflight;\s*$/)
assert.doesNotMatch(statements, /\b(?:from|join)\s+(?:public\.)?(?:opportunities|opportunity_universe_state|matching_retrieval_candidates)\b/i)
assert.match(sql, /CASE WHEN available THEN\s*\$history\$SELECT/)
assert.match(sql, /has_table_privilege\(c\.oid,'SELECT'\)/)
assert.match(sql, /c\.relrowsecurity/)
assert.equal(manifest.migrations.length, 5)
assert.equal(manifest.views.length, 5)
assert.equal(manifest.indexes.length, 11)
const covered = new Set([...manifest.relations.map(r => r.name), ...manifest.functions.filter(f => f.schema === 'public').map(f => f.name), ...manifest.views.map(v => v.name), ...manifest.indexes.map(i => i.name), ...manifest.types.map(t => t.split('.').pop())])
for (const migration of manifest.migrations) {
  const source = readFileSync(`supabase/migrations/${migration.version}_${migration.name}.sql`, 'utf8')
  assert.equal(createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex'), migration.sha256, 'dependency manifest must be refreshed if a migration changes')
  for (const name of source.matchAll(/\bpublic\.(\w+)/g)) assert.ok(covered.has(name[1]), `uncovered public dependency: ${name[1]}`)
}
console.log('PASS static: one SELECT/JSONB; metadata only; guarded optional history; five migration fingerprints and public dependency coverage')

const db = new PGlite({ extensions: { pg_trgm } })
const check = async () => {
  await db.exec('begin read only')
  try {
    const result = await db.query(sql)
    assert.equal(result.rows.length, 1)
    assert.deepEqual(Object.keys(result.rows[0]), ['cvitae_release_preflight'])
    assert.equal(result.fields[0].dataTypeID, 3802, 'JSONB result type')
    return result.rows[0].cvitae_release_preflight
  } finally { await db.exec('rollback') }
}
try {
  const empty = await check()
  assert.equal(empty.migration_history_available, false)
  assert.ok(empty.blockers.some(x => x.status === 'BLOCKER_HISTORY_NOT_AVAILABLE'))
  assert.ok(empty.blockers.some(x => x.status === 'BLOCKER_MISSING_RELATION'))
  console.log('PASS missing optional history/roles/tables/types/functions: one JSON, explicit blockers, no exception')
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create role preflight_reader;
    create schema extensions; create schema auth; create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text);
    insert into supabase_migrations.schema_migrations values('202610040001','source_switch_wiring');
    create table public.opportunities(id text primary key);
    create index opportunities_catalog_order_idx on public.opportunities(id);
    create function public.canonical_opportunity_source_policy(p_raw_source text) returns integer language sql as $$select 1$$;
    create function public.get_source_distribution_policy() returns integer language sql as $$select 1$$;
    create view public.dependent_policy as select public.get_source_distribution_policy();
    create view public.opportunity_catalog_universe as select id as wrong_name from public.opportunities;
  `)
  const plannedExtension = await check()
  assert.equal(plannedExtension.pg_trgm.status, 'NOT_INSTALLED_PLANNED_IN_EXTENSIONS')
  assert.equal(plannedExtension.pg_trgm.compatible, true)
  await db.exec('create extension pg_trgm with schema public')
  const incompatible = await check()
  assert.equal(incompatible.pg_trgm.status, 'BLOCKER_PG_TRGM_WRONG_SCHEMA')
  assert.ok(incompatible.blockers.some(x => x.object === 'public.canonical_opportunity_source_policy' && x.status === 'BLOCKER_RETURN_SIGNATURE'))
  assert.ok(incompatible.blockers.some(x => x.status === 'BLOCKER_DROP_DEPENDENCY'))
  assert.ok(incompatible.blockers.some(x => x.status === 'BLOCKER_VIEW_PREFIX_OR_TYPE'))
  assert.ok(incompatible.blockers.some(x => x.status === 'BLOCKER_INDEX_DEFINITION'))
  assert.equal(incompatible.migrations.find(x => x.version === '202610040001').status, 'RECORDED')
  assert.equal(incompatible.migrations.find(x => x.version === '202610030001').status, 'NOT_RECORDED_NOT_PROOF_OF_UNAPPLIED')
  console.log('PASS catalog mismatches: pg_trgm schema, return type, dependent view, view column prefix and recorded/unrecorded history')
  await db.exec('grant usage on schema supabase_migrations to preflight_reader; set role preflight_reader')
  const denied = await check()
  assert.equal(denied.migration_history_available, false)
  assert.equal(denied.migrations[0].status, 'NOT_AVAILABLE')
  await db.exec('reset role')
  await db.exec('grant select on supabase_migrations.schema_migrations to preflight_reader; set role preflight_reader')
  const allowed = await check()
  assert.equal(allowed.migration_history_available, true)
  // Reader lacks SELECT on opportunities: catalogs remain readable, inventory is never queried.
  assert.ok(allowed.blockers.some(x => x.status === 'BLOCKER_RUNTIME_SELECT'))
  await db.exec('reset role')
  console.log('PASS optional history privilege guard and metadata-only execution without inventory SELECT permission')
  await db.exec('alter table supabase_migrations.schema_migrations enable row level security; set role preflight_reader')
  const rls = await check()
  assert.equal(rls.migration_history_available, false, 'RLS hidden history cannot masquerade as unapplied migrations')
  await db.exec('reset role')
  console.log('PASS RLS-limited optional history fails closed')
} finally { await db.close() }

// Positive metadata fixture: no product rows or reducers, just catalog contracts.
const compatible = new PGlite({ extensions: { pg_trgm } })
const ident = value => `"${value.replaceAll('"', '""')}"`
try {
  await compatible.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions; create schema supabase_migrations;
    create domain public.vector as text;
    create extension pg_trgm with schema extensions;
    create table supabase_migrations.schema_migrations(version text primary key,name text);
    grant usage on schema public,auth,extensions to service_role;`)
  for (const r of manifest.relations) {
    const fields = r.columns.map(c => `${ident(c.name)} ${c.type || 'integer'}`)
    const key = manifest.keys.find(k => k.relation === r.name)
    if (key) fields.push(`primary key(${key.columns.map(ident).join(',')})`)
    await compatible.exec(`create table public.${ident(r.name)} (${fields.join(',')})`)
  }
  await compatible.exec('alter table public.match_alert_scan_progress add foreign key(profile_id) references public.user_master_profiles(id)')
  for (const f of manifest.functions) {
    if (f.schema === 'pg_catalog') continue
    const defaults = f.defaults ?? f.min_defaults ?? 0
    const args = f.input_types.map((t, i) => `${ident(f.input_names[i] || `p_${i}`)} ${t}${i >= f.input_types.length - defaults ? ' default null' : ''}`)
    let returns = f.result, body = `select null::${f.result}`, language = 'sql'
    if (f.outputs.length) {
      returns = `table(${f.outputs.map(o => `${ident(o.name)} ${o.type}`).join(',')})`
      body = `select ${f.outputs.map(o => `null::${o.type}`).join(',')} where false`
    } else if (f.setof) {
      returns = `setof ${f.result}`; body = `select * from ${f.result} limit 0`
    } else if (f.result === 'trigger') { language = 'plpgsql'; body = 'begin return new; end' }
    await compatible.exec(`create function ${f.schema}.${ident(f.name)}(${args.join(',')}) returns ${returns} language ${language} immutable as $$${body}$$`)
  }
  for (const v of manifest.views) {
    if (v.name === 'opportunity_pipeline_status') {
      const legacy = readFileSync('scripts/fixtures/pipeline-prod-prefix-20261005.sql', 'utf8')
      const viewSQL = legacy.match(/create or replace view public\.opportunity_pipeline_status[\s\S]*?(?=revoke all on public\.opportunity_pipeline_status)/i)[0]
      await compatible.exec(viewSQL)
      const oldPrefix = (await compatible.query(`select attnum,attname from pg_attribute
        where attrelid='public.opportunity_pipeline_status'::regclass and attnum>0 and not attisdropped order by attnum`)).rows
      assert.equal(oldPrefix.length, 72)
      assert.equal(oldPrefix[16].attname, 'ingestion_reason')
      assert.equal(oldPrefix[17].attname, 'provenance_certainty')
      continue
    }
    const columns = v.star ? [...manifest.relations.find(r => r.name === 'opportunities').columns] : []
    for (const c of v.columns) {
      const type = c.type || manifest.relations.find(r => r.name === c.source_relation).columns.find(x => x.name === c.source_column).type
      columns.push({ name: c.name, type })
    }
    await compatible.exec(`create view public.${ident(v.name)} as select ${columns.map(c => `null::${c.type} as ${ident(c.name)}`).join(',')}`)
  }
  for (const i of manifest.indexes) await compatible.exec(`create index ${ident(i.name)} on public.${ident(i.relation)} ${i.definition}`)
  for (const t of manifest.required_triggers) {
    if (t.function === 'opportunity_universe_after_write' || t.function === 'opportunity_observation_refresh_universe')
      await compatible.exec(`create function public.${ident(t.function)}() returns trigger language plpgsql as $$begin return new; end$$`)
    await compatible.exec(`create trigger ${ident(t.name)} after insert on public.${ident(t.relation)} for each row execute function public.${ident(t.function)}()`)
  }
  await compatible.exec('grant select on all tables in schema public to service_role; begin read only')
  const result = (await compatible.query(sql)).rows[0].cvitae_release_preflight
  assert.deepEqual(result.blockers, [], JSON.stringify(result.blockers))
  assert.ok(result.indexes.every(i => i.status === 'PASS'))
  assert.ok(result.view_replace_compatibility.every(v => v.status === 'PASS'))
  await compatible.exec('rollback')
  console.log('PASS complete positive metadata fixture: all 16 relations/160 columns/23 signatures/5 view prefixes/11 indexes/4 future triggers; legacy72 pipeline prefix PASS; zero blockers')
} finally { await compatible.close() }
