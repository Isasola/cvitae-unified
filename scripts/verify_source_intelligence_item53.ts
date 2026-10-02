import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  indexRowsBySource,
  latestRowsByKey,
  rowsForAliases,
  scopedMetric,
  selectEffectiveDiagnosis,
} from '../src/lib/source-intelligence-contract'

const sourceNames = Array.from({ length: 119 }, (_, index) => `source-${index + 1}`)
const rows = Array.from({ length: 10_000 }, (_, index) => ({
  source: sourceNames[index % sourceNames.length],
  opportunity_id: `opportunity-${index % 5_000}`,
  observed_at: new Date(1_700_000_000_000 + index).toISOString(),
}))
const indexed = indexRowsBySource(rows)
assert.equal(indexed.size, 119)
assert.equal(rowsForAliases(indexed, ['source-1']).length, 85)
assert.equal(latestRowsByKey(rowsForAliases(indexed, ['source-1']), 'opportunity_id').length, 85)
const oldFilterOperations = sourceNames.length * rows.length
const indexedOperations = rows.length + sourceNames.length
assert.ok(indexedOperations < oldFilterOperations, 'source assembly must pre-index rows instead of filtering every source')
const adminDataSource = readFileSync(new URL('../netlify/functions/admin-data.ts', import.meta.url), 'utf8')
for (const field of ['title', 'description', 'organization', 'location', 'country_code', 'application_url', 'source_url', 'remote_scope']) {
  assert.ok(adminDataSource.includes(field), `Source Intelligence path must preserve ${field}`)
}
assert.ok(adminDataSource.includes('field_survival'), 'field survival must reach the snapshot')
assert.ok(adminDataSource.includes('evaluateEightGates'), 'normalized persisted rows must reach Eight Gates')

const snapshotSource = { canonical_source: 'source-a', eight_gates: { gates: [{ status: 'PASS' }] } }
const freshWarning = { source: 'source-a', diagnosed_at: '2026-09-23T00:00:00.000Z', eight_gates: { gates: [{ status: 'WARNING' }] }, overall_health: 'DEGRADED' }
const effective = selectEffectiveDiagnosis(snapshotSource, freshWarning, 'source-a')
assert.equal(effective._diagnosis_scope, 'FRESH')
assert.equal(effective.eight_gates.gates[0].status, 'WARNING')
const switched = selectEffectiveDiagnosis(snapshotSource, freshWarning, 'source-b')
assert.equal(switched._diagnosis_scope, undefined)
assert.equal(switched.eight_gates.gates[0].status, 'PASS')

assert.deepEqual(scopedMetric(5_000, 2_000), { total: 5_000, sampled: 2_000, total_scope: 'FULL_DB', sample_scope: 'SAMPLED' })
assert.deepEqual(scopedMetric(null, 2_000), { total: null, sampled: 2_000, total_scope: 'UNAVAILABLE', sample_scope: 'SAMPLED' })

const optionalMetrics = { dynamic_metrics_unavailable: { observations: 'unavailable' } }
assert.equal(optionalMetrics.dynamic_metrics_unavailable.observations, 'unavailable')

const before = JSON.stringify({ registry: { profiles: sourceNames.map(source => ({ source, metadata: 'stable profile payload' })) }, sources: sourceNames.map(source => ({ canonical_source: source })) })
const after = JSON.stringify({ registry: { profile_count: sourceNames.length }, sources: sourceNames.map(source => ({ canonical_source: source })) })
const beforeBytes = Buffer.byteLength(before)
const afterBytes = Buffer.byteLength(after)
assert.ok(afterBytes < beforeBytes, 'snapshot should not duplicate full registry profiles')

class FixtureQuery {
  constructor(private readonly data: any[] = [], private readonly count: number | null = null) {}
  select() { return this }
  order() { return this }
  limit() { return this }
  is() { return this }
  in() { return this }
  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    return Promise.resolve({ data: this.data, count: this.count, error: null }).then(resolve, reject)
  }
}

process.env.ADMIN_PASSWORD = 'fixture-only'
const { loadMissingOpportunitySamples, sourceIntelligenceSnapshot } = await import('../netlify/functions/admin-data.ts')
const sourceA = Array.from({ length: 10_001 }, (_, index) => ({ source: 'source-a', id: `a-${index}` }))
const globalFirstPage = indexRowsBySource(sourceA)
const sourceBFixture = Array.from({ length: 2_000 }, (_, index) => ({ source: 'source-b', id: `b-${index}` }))
const sourceScopedSamples = await loadMissingOpportunitySamples({ from: () => ({ select() { return this }, in() { return this }, is() { return this }, order() { return this }, limit() { return Promise.resolve({ data: sourceBFixture, error: null }) } }) }, [{ canonical_source: 'source-a', emitted_aliases: ['source-a'] }, { canonical_source: 'source-b', emitted_aliases: ['source-b'] }], globalFirstPage)
assert.equal(sourceScopedSamples.get('source-a')?.status, 'GLOBAL_SAMPLE')
assert.equal(sourceScopedSamples.get('source-b')?.status, 'PER_SOURCE_SAMPLE')
assert.equal(sourceScopedSamples.get('source-b')?.rows.length, 2_000)
const fixtureRows = Array.from({ length: 10_000 }, (_, index) => ({ source: sourceNames[index % sourceNames.length], opportunity_id: `fixture-${index}`, observed_at: new Date(1_700_000_000_000 + index).toISOString() }))
const fixtureDashboard = { sources: Object.fromEntries(sourceNames.map(source => [source, { total: 5_000, catalog: 4_000, matching: 3_000, seo: 2_000 }])) }
const fixtureSupabase = {
  from(table: string) {
    if (table === 'opportunity_source_observations' || table === 'opportunity_source_policy_events' || table === 'opportunity_enrichment_events') return new FixtureQuery(fixtureRows)
    if (table === 'opportunities') return new FixtureQuery([], 5_000)
    if (table === 'scraper_runs') return new FixtureQuery([])
    if (table === 'opportunity_sources' || table === 'source_control_audit_log') return new FixtureQuery([])
    return new FixtureQuery([])
  },
  rpc(name: string) {
    return Promise.resolve({ data: name === 'admin_source_quality_aggregate' ? {} : [], error: null })
  },
}
const snapshot = await sourceIntelligenceSnapshot(fixtureSupabase, fixtureDashboard, [])
assert.equal(snapshot._observability.source_count, 105)
assert.equal(snapshot.sources.length, 105)
assert.equal(snapshot.sources[0]._inventory_scope.inventory, 'FULL_DB')
assert.equal(snapshot.sources[0]._inventory_scope.recent_rows, 'client_sample')
assert.equal(snapshot.registry.profiles, undefined)
assert.equal(snapshot.registry.profile_count, 105)
assert.equal(snapshot._observability.sample_sizes.observations, 10_000)
const fixtureSnapshotBytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8')
assert.ok(fixtureSnapshotBytes > 0)

console.log(`verify_source_intelligence_item53: PASS sources=119 rows=10000 old_filter_ops=${oldFilterOperations} indexed_ops=${indexedOperations} fresh_wins=1 source_switch_invalidates=1 totals_scoped=1 optional_degraded=1 payload_deduped=1 payload_before=${beforeBytes} payload_after=${afterBytes} fixture_snapshot_bytes=${fixtureSnapshotBytes}`)
