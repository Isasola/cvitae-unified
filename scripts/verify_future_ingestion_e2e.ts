/** Local future-row integration: real Python Sink/Factory + real TS truth/policy. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { canonicalSource, evaluateOpportunityDistribution, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'
import { catalogReadiness, intrinsicRoutingGates, matchingReadiness, seoReadiness } from '../src/lib/opportunity-truth.ts'

const python = spawnSync('python', ['scripts/fixture_future_ingestion_python.py'], { encoding: 'utf8', shell: process.platform === 'win32' })
assert.equal(python.status, 0, python.stderr || python.stdout)
const payload = JSON.parse(python.stdout.trim())
const row = payload.row as Record<string, any>

const policy = (source: string, extra: Partial<SourcePolicyRow> = {}): SourcePolicyRow => ({
  source, is_enabled: true, catalog_enabled: true, matching_enabled: true,
  alerts_enabled: true, seo_enabled: true, web_catalog_allowed: true,
  search_engine_indexing_allowed: true, google_jobs_distribution_allowed: false, ...extra,
})

// Sink normalization, dedupe and factory queue/commit came from the real
// Python modules above; no reconciliation function participates in this flow.
assert.deepEqual(payload.sink, { found: 2, valid: 2, unique: 1, duplicates_in_run: 1, inserted: 1 })
assert.equal(payload.factory.selected, 1)
assert.equal(payload.factory.status, 'ready')
assert.equal(payload.factory.embedding_state, 'NOT_REQUIRED_PRE_TRIGGER')
assert.equal(payload.factory.commit_called, 1)
assert.ok(row.content_fingerprint && row.semantic_fingerprint)
assert.equal(row.factory_status, 'pending')
assert.equal(canonicalSource(row.source), 'computrabajo')
assert.equal(canonicalSource('oyaop'), 'oya', 'raw emitted aliases resolve only through Registry V2')

// Readiness comes from truth, independently of stored legacy eligibility flags.
assert.equal(catalogReadiness(row).state, 'READY')
assert.equal(matchingReadiness(row).state, 'READY')
assert.equal(seoReadiness(row).state, 'READY')
const futureGates = intrinsicRoutingGates(row)
assert.deepEqual(futureGates.proposed, { catalog_eligible: true, match_eligible: true, alerts_eligible: true, seo_eligible: true })
const effective = evaluateOpportunityDistribution(row, [policy('computrabajo')])
assert.equal(effective.canonicalSource, 'computrabajo')
assert.equal(effective.catalog.allowed, true)
assert.equal(effective.matching.allowed, true)
assert.equal(effective.alerts.allowed, true)
assert.equal(effective.seo.allowed, true, 'SEO readiness is distinct from stale SEO status')
assert.equal(effective.googleJobs.allowed, true, 'Google Jobs is an independent product-policy consumer')

const oldFlagsFalse = { ...row, catalog_eligible: false, match_eligible: false, alerts_eligible: false, seo_eligible: false, seo_status: 'review' }
assert.equal(matchingReadiness(oldFlagsFalse).state, 'READY', 'intrinsic readiness ignores stale row flags')
const deniedByRow = evaluateOpportunityDistribution(oldFlagsFalse, [policy('computrabajo')])
assert.equal(deniedByRow.matching.allowed, true, 'stale match flag is observable but not permanent routing truth')
assert.equal(deniedByRow.alerts.allowed, true)
assert.equal(deniedByRow.matching.storedGateState, 'FALSE')

const missingOrganization = { ...row, id: 'future-missing-org', organization: '', seo_eligible: true, seo_status: 'eligible' }
assert.equal(catalogReadiness(missingOrganization).state, 'READY')
assert.equal(matchingReadiness(missingOrganization).state, 'READY')
assert.equal(seoReadiness(missingOrganization).state, 'NOT_READY')
assert.ok(seoReadiness(missingOrganization).reasons.includes('MISSING_ORGANIZATION'))
assert.equal(evaluateOpportunityDistribution(missingOrganization, [policy('computrabajo')]).seo.allowed, false)

const himalayas = { ...row, id: 'future-himalayas', source: 'himalayas' }
const himalayasDecision = evaluateOpportunityDistribution(himalayas, [policy('himalayas', { search_engine_indexing_allowed: false, google_jobs_distribution_allowed: false })])
assert.equal(himalayasDecision.matching.allowed, true, 'SEO restriction does not disable internal matching')
assert.equal(himalayasDecision.seo.allowed, false)
assert.ok(himalayasDecision.seo.reasons.includes('SOURCE_CAPABILITY_DENIED'))

const unknown = evaluateOpportunityDistribution({ ...row, id: 'future-unknown', source: 'unregistered_future_source' }, [])
assert.equal(unknown.policyFound, false)
assert.equal(unknown.catalog.allowed, false)
assert.equal(unknown.matching.allowed, false)
assert.equal(unknown.seo.allowed, false)
assert.ok(unknown.catalog.reasons.includes('SOURCE_CAPABILITY_UNKNOWN'))
assert.ok(unknown.matching.reasons.includes('SOURCE_SWITCH_UNKNOWN'))

console.log(JSON.stringify({
  verifier: 'future_ingestion_e2e',
  stages: ['OpportunitySink.normalize+dedupe', 'factory.queue+seal+commit', 'truth.readiness', 'effective.policy'],
  cases: ['canonical permitted row', 'missing organization', 'Himalayas SEO denied/internal matching allowed', 'unknown source fail closed'],
  embedding: matchingReadiness(row).state === 'READY' ? 'PENDING_AFTER_FUTURE_TRIGGER' : 'NOT_REQUIRED',
  reconciliation_used: false,
}))
