/** Focused local PostgreSQL fixture: actual policy SQL, Admin projection, Registry and workflows. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js'

process.env.ADMIN_PASSWORD ??= 'fixture-only-not-a-secret'
const { sourceOperationalProjection, sourceSwitchBlocked, workflowRoutes, verifiedRouteFor } = await import('../netlify/functions/admin-data.ts')
const read = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
const db = new PGlite()
const query = async (text, params = []) => (await db.query(text, params)).rows

try {
  const migration = read('supabase/migrations/202610040001_source_switch_wiring.sql')
  const storedFunction = migration.match(/create or replace function public\.stored_opportunity_source_policy\(p_raw_source text\)[\s\S]*?\$\$;/i)?.[0]
  const canonicalFunction = migration.match(/create or replace function public\.canonical_opportunity_source_policy\(p_raw_source text\)[\s\S]*?\$\$;/i)?.[0]
  const projectionFunction = migration.match(/drop function public\.get_source_distribution_policy\(\);[\s\S]*?grant execute on function public\.get_source_distribution_policy\(\) to service_role;/i)?.[0]
  assert.ok(storedFunction && canonicalFunction && projectionFunction, 'the real production policy function bodies are loaded from the current migration')

  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table opportunity_sources (
      source text primary key, is_enabled boolean, catalog_enabled boolean, matching_enabled boolean,
      alerts_enabled boolean, seo_enabled boolean, registry_certified boolean, registry_adapter_version text,
      registry_policy_hash text, registry_synced_at timestamptz, web_catalog_allowed boolean,
      search_engine_indexing_allowed boolean, google_jobs_distribution_allowed boolean,
      third_party_job_distribution_allowed boolean, source_attribution_required boolean
    );
    create table opportunity_source_identity_aliases(emitted_source text primary key, canonical_source text not null);
    create table admin_policy_events(id bigint generated always as identity primary key, entity_type text, entity_key text, before_state jsonb, after_state jsonb, created_at timestamptz default now());
    create table opportunity_source_consumer_permissions(canonical_source text, consumer text, permission_state text);
    create table opportunity_universe_dirty_sources(canonical_source text primary key, queued_at timestamptz default now(), reason text);
  `)
  await db.exec(storedFunction)
  await db.exec(canonicalFunction)
  await db.exec('create function public.get_source_distribution_policy() returns table(source text) language sql as $$select null::text where false$$')
  await db.exec(projectionFunction)
  const registry = JSON.parse(read('src/generated/source-intelligence-registry.json'))
  const profile = registry.sources.find(item => item.canonical_source === 'jobicy')
  assert.ok(profile)
  for (const alias of profile.emitted_aliases) {
    await query('insert into opportunity_source_identity_aliases(emitted_source,canonical_source) values($1,$2)', [alias.toLowerCase(), profile.canonical_source])
  }
  await query(`insert into opportunity_sources(source,is_enabled,catalog_enabled,matching_enabled,alerts_enabled,seo_enabled,
    web_catalog_allowed,search_engine_indexing_allowed,google_jobs_distribution_allowed,third_party_job_distribution_allowed,source_attribution_required)
    values('jobicy',true,false,false,false,false,false,false,false,false,true)`)
  await query("insert into opportunity_universe_dirty_sources(canonical_source,reason) values('jobicy','POLICY_RECONCILIATION_PENDING')")

  const effective = (await query("select * from get_source_distribution_policy() where source='jobicy'"))[0]
  const stored = (await query("select source,is_enabled,catalog_enabled,matching_enabled,alerts_enabled,seo_enabled from opportunity_sources where source='jobicy'"))[0]
  assert.equal(stored.matching_enabled, false)
  assert.equal(effective.matching_enabled, true, 'SQL authority derives matching=true despite the legacy stored false')
  assert.equal((await query("select count(*) n from opportunity_universe_dirty_sources where canonical_source='jobicy'"))[0].n, 1)

  const routes = workflowRoutes()
  const projection = sourceOperationalProjection(profile, [effective], [stored], routes, registry.sources)
  assert.equal(projection.stored_switches.matching, false)
  assert.equal(projection.effective_switches.matching, true)
  assert.equal(sourceSwitchBlocked(projection.effective_switches), false, 'a pending queue does not convert effective matching=true into a disabled diagnostic')

  const routeRows = registry.sources.map(item => verifiedRouteFor(item, routes, registry.sources))
  const directInvocations = routes.filter(route => route.workflow === '.github/workflows/scrapers.yml')
  assert.equal(registry.sources.length, 107, 'all Registry profiles participate, including profiles without a route')
  assert.equal(directInvocations.length, 81, 'the current workflow yields 81 directly monitored invocations')
  assert.equal(new Set(directInvocations.map(route => route.runner_id)).size, 81)
  assert.equal(routeRows.filter(route => route.state === 'DIRECT').length, 87, 'all 87 profiles associated with direct workflow entrypoints have exact path evidence')
  assert.ok(routeRows.every(route => ['DIRECT', 'ALTERNATE', 'MANUAL', 'NO_ROUTE', 'UNKNOWN'].includes(route.state)))
  assert.ok(routeRows.filter(route => ['MANUAL', 'NO_ROUTE', 'UNKNOWN'].includes(route.state)).every(route => route.evidence.length > 0), 'non-direct routes retain the evidence or unresolved reason that supports their classification')
  assert.ok(routeRows.filter(route => route.state === 'DIRECT').flatMap(route => route.evidence).every(evidence => evidence.profile_owners.length > 0), 'shared producer entrypoints retain their exact Registry profile scope')
  console.log(JSON.stringify({ status: 'PASS', checks: ['effective-vs-stored-sql-policy-with-dirty-queue', 'no-false-matching-disabled-diagnostic', '107-registry-profiles', '81-direct-workflow-invocations', '87-profile-entrypoint-mappings'], stored_matching: stored.matching_enabled, effective_matching: effective.matching_enabled, dirty_source: 'jobicy', registry_profiles: registry.sources.length, direct_invocations: directInvocations.length, direct_profiles: routeRows.filter(route => route.state === 'DIRECT').length }, null, 2))
} finally {
  await db.close()
}
