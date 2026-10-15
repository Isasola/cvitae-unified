/** Focused local PostgreSQL fixture: actual policy SQL, Admin projection, Registry and workflows. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PGlite } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js'

process.env.ADMIN_PASSWORD ??= 'fixture-only-not-a-secret'
const { diagnoseSource, sourceOperationalProjection, sourceSwitchBlocked, workflowRoutes, verifiedRouteFor } = await import('../netlify/functions/admin-data.ts')
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
  const workflowFiles = ['.github/workflows/scrapers.yml', '.github/workflows/source-maintenance.yml', '.github/workflows/scheduled-source-automation.yml', '.github/workflows/scrapers-latam.yml']
  const routesFromSource = workflowFiles.flatMap(workflow => [...read(workflow).matchAll(/python\s+scripts\/run_scraper_monitored\.py\s+([\w.-]+)\s+([\w.-]+)\s+([\w./-]+\.py)/g)].map(match => ({
    workflow, runner_id: match[1].toLowerCase(), entrypoint: match[3].replaceAll('\\', '/').toLowerCase(),
  })))
  assert.deepEqual(routes, routesFromSource, 'the packaged route projection is generated from the current workflow definitions')
  const routeHash = createHash('sha256').update(JSON.stringify(routes.map(({ workflow, runner_id, entrypoint }) => ({ entrypoint, runner_id, workflow })))).digest('hex')
  assert.equal(registry.workflow_routes_hash, routeHash, 'route projection freshness hash matches its serialized workflow data')
  const projection = sourceOperationalProjection(profile, [effective], [stored], routes, registry.sources)
  assert.equal(projection.stored_switches.matching, false)
  assert.equal(projection.effective_switches.matching, true)
  assert.equal(sourceSwitchBlocked(projection.effective_switches), false, 'a pending queue does not convert effective matching=true into a disabled diagnostic')

  const aliasProfile = { ...profile, emitted_aliases: ['jobicy', 'jobicy-alt'] }
  const storedOn = { source: 'jobicy', is_enabled: true, catalog_enabled: false, matching_enabled: false, alerts_enabled: false, seo_enabled: false }
  const storedOff = { ...storedOn, source: 'jobicy-alt', matching_enabled: true }
  const conflictProjection = sourceOperationalProjection(aliasProfile, [effective], [stored, storedOff], routes, registry.sources)
  assert.equal(conflictProjection.stored_switches, null)
  assert.equal(conflictProjection.stored_switches_conflict, true)
  assert.equal(conflictProjection.stored_switches_evidence.length, 2)
  assert.equal(conflictProjection.effective_switches.matching, true, 'stored alias conflict does not override effective SQL policy')
  const identicalProjection = sourceOperationalProjection(aliasProfile, [effective], [storedOn, { ...storedOn, source: 'jobicy-alt' }], routes, registry.sources)
  assert.equal(identicalProjection.stored_switches_conflict, false)
  assert.equal(identicalProjection.stored_switches.matching, false)
  const missingProjection = sourceOperationalProjection(aliasProfile, [effective], [], routes, registry.sources)
  assert.equal(missingProjection.stored_switches, null)
  assert.equal(missingProjection.stored_switches_conflict, false)
  assert.deepEqual(missingProjection.stored_switches_evidence, [])

  const routeRows = registry.sources.map(item => verifiedRouteFor(item, routes, registry.sources))
  const directInvocations = routes.filter(route => route.workflow === '.github/workflows/scrapers.yml')
  assert.equal(registry.sources.length, 108, 'all Registry profiles participate, including profiles without a route')
  assert.equal(directInvocations.length, 81, 'the current workflow yields 81 directly monitored invocations')
  assert.equal(new Set(directInvocations.map(route => route.runner_id)).size, 81)
  assert.equal(routeRows.filter(route => route.state === 'DIRECT').length, 87, 'all 87 profiles associated with the legacy direct workflow retain exact path evidence')
  assert.equal(routeRows.filter(route => route.state === 'ALTERNATE').length, 1, 'the isolated LATAM producer is an alternate workflow route')
  assert.ok(routeRows.every(route => ['DIRECT', 'ALTERNATE', 'MANUAL', 'NO_ROUTE', 'UNKNOWN'].includes(route.state)))
  assert.ok(routeRows.filter(route => ['MANUAL', 'NO_ROUTE', 'UNKNOWN'].includes(route.state)).every(route => route.evidence.length > 0), 'non-direct routes retain the evidence or unresolved reason that supports their classification')
  assert.ok(routeRows.filter(route => route.state === 'DIRECT').flatMap(route => route.evidence).every(evidence => evidence.profile_owners.length > 0), 'shared producer entrypoints retain their exact Registry profile scope')

  const uniqueProfile = registry.sources.find(item => {
    const route = verifiedRouteFor(item, routes, registry.sources)
    return route.state === 'DIRECT' && route.runner_ids.length === 1
  })
  const sharedRoute = routeRows.flatMap((route, index) => route.evidence.map(item => ({ route, profile: registry.sources[index], item }))).find(item => item.route.runner_ids.length === 0 && (item.item.profile_owners?.length || 0) > 1)
  const noRunnerProfile = registry.sources.find(item => verifiedRouteFor(item, routes, registry.sources).runner_ids.length === 0)
  assert.ok(uniqueProfile && sharedRoute && noRunnerProfile, 'Registry provides exclusive, shared and unresolved route fixtures')
  const createSupabase = ({ runRows = [] } = {}) => {
    const calls = []
    const supabase = {
      from(table) {
        const queryBuilder = {
          table, filters: [],
          select(...args) { this.selectArgs = args; return this },
          in(column, values) { this.filters.push({ method: 'in', column, values }); return this },
          is(column, value) { this.filters.push({ method: 'is', column, value }); return this },
          order() { return this }, limit() { return this },
          then(resolve, reject) {
            calls.push({ table, filters: this.filters })
            let data = table === 'scraper_runs' ? runRows : []
            const runFilter = this.filters.find(filter => filter.column === 'scraper_id')
            if (table === 'scraper_runs' && runFilter) data = data.filter(row => runFilter.values.includes(row.scraper_id))
            return Promise.resolve({ data, error: null, count: table === 'opportunities' ? 0 : null }).then(resolve, reject)
          },
        }
        return queryBuilder
      },
      rpc(name) { assert.equal(name, 'get_source_distribution_policy'); return Promise.resolve({ data: [], error: null }) },
    }
    return { supabase, calls }
  }
  const directRoute = verifiedRouteFor(uniqueProfile, routes, registry.sources)
  const run = { id: 1, run_id: 'fixture-run', scraper_id: directRoute.runner_ids[0], status: 'success', started_at: '2026-10-13T00:00:00Z', found_count: 4, inserted_count: 2, updated_count: 0 }
  const directDb = createSupabase({ runRows: [run, { ...run, scraper_id: 'unrelated_runner' }] })
  const directResult = await diagnoseSource(directDb.supabase, uniqueProfile.canonical_source, registry)
  const directBody = JSON.parse(directResult.body)
  assert.equal(directResult.statusCode, 200)
  assert.equal(directBody.runner_id, directRoute.runner_ids[0])
  assert.equal(directBody.runner_attribution, 'VERIFIED')
  assert.equal(directBody.latest_run.run_id, 'fixture-run')
  assert.ok(directBody.eight_gates.gates.length > 0, 'the rest of the diagnostic gates execute for a directly routed source')
  assert.deepEqual(directDb.calls.find(call => call.table === 'scraper_runs').filters.find(filter => filter.column === 'scraper_id').values, directRoute.runner_ids)

  const unresolvedDb = createSupabase({ runRows: [run] })
  const unresolvedResult = await diagnoseSource(unresolvedDb.supabase, noRunnerProfile.canonical_source, registry)
  const unresolvedBody = JSON.parse(unresolvedResult.body)
  assert.equal(unresolvedResult.statusCode, 200)
  assert.equal(unresolvedBody.runner_id, null)
  assert.equal(unresolvedBody.runner_attribution, 'UNKNOWN')
  assert.equal(unresolvedBody.latest_run, null)
  assert.equal(unresolvedDb.calls.some(call => call.table === 'scraper_runs'), false, 'no runner means no global or empty-list scraper_runs query')
  assert.ok(unresolvedBody.eight_gates.gates.length > 0, 'the other gates continue without runner history')

  const sharedDb = createSupabase({ runRows: [run] })
  const sharedResult = await diagnoseSource(sharedDb.supabase, sharedRoute.profile.canonical_source, registry)
  const sharedBody = JSON.parse(sharedResult.body)
  assert.equal(sharedBody.statusCode, undefined)
  assert.equal(sharedBody.execution_route, 'DIRECT')
  assert.equal(sharedBody.runner_id, null)
  assert.ok(sharedBody.execution_route_evidence.some(item => item.profile_owners.length > 1))
  assert.equal(sharedDb.calls.some(call => call.table === 'scraper_runs'), false, 'shared entrypoint history is not attributed without an exclusive runner identity')
  assert.ok(sharedBody.eight_gates.gates.length > 0)
  console.log(JSON.stringify({ status: 'PASS', checks: ['effective-vs-stored-sql-policy-with-dirty-queue', 'stored-alias-conflict-identical-and-missing', 'diagnose-source-exclusive-runner', 'diagnose-source-no-runner-no-global-query', 'diagnose-source-shared-entrypoint-not-attributed', '108-registry-profiles', '81-direct-workflow-invocations', '87-legacy-profile-entrypoint-mappings', '1-alternate-latam-producer'], stored_matching: stored.matching_enabled, effective_matching: effective.matching_enabled, dirty_source: 'jobicy', registry_profiles: registry.sources.length, direct_invocations: directInvocations.length, direct_profiles: routeRows.filter(route => route.state === 'DIRECT').length }, null, 2))
} finally {
  await db.close()
}
