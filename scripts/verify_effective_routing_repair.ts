/** Local contract for Item 24 routing repair: truth, explicit restrictions,
 * historical repair and the future INSERT trigger all share one semantics. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateOpportunityDistribution, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'
import { intrinsicRoutingGates } from '../src/lib/opportunity-truth.ts'
import { reconcileInventoryRows } from '../src/lib/inventory-reconciliation.ts'

const policy = (source: string, extra: Partial<SourcePolicyRow> = {}): SourcePolicyRow => ({
  source, is_enabled: true,
  // Intentionally false legacy configuration: it is no longer misread as a
  // contractual prohibition for an ordinary source.
  catalog_enabled: false, matching_enabled: false, alerts_enabled: false, seo_enabled: false,
  web_catalog_allowed: false, search_engine_indexing_allowed: null, google_jobs_distribution_allowed: false,
  ...extra,
})
const good = {
  id: 'ready', source: 'computrabajo', slug: 'programme-officer', title: 'Programme Officer', organization: 'Fixture Org',
  description: 'Coordinate programmes, monitor results, manage stakeholders and produce detailed implementation reports. '.repeat(2),
  tags: ['programme management', 'monitoring'], opportunity_type: 'job', is_active: true, verification_status: 'verified',
  catalog_eligible: false, match_eligible: false, alerts_eligible: false, seo_eligible: false, seo_status: 'review',
}

// Ordinary active source: legacy switches/flags cannot permanently hide
// intrinsic truth. Each consumer still evaluates independently.
let result = evaluateOpportunityDistribution(good, [policy('computrabajo')])
assert.equal(result.catalog.allowed, true); assert.equal(result.matching.allowed, true)
assert.equal(result.alerts.allowed, true); assert.equal(result.seo.allowed, true)
assert.equal(result.jobPosting.allowed, true); assert.equal(result.googleJobs.allowed, true)
assert.equal(result.catalog.adminSwitchState, 'LEGACY_CONFIG_DISABLED')
assert.equal(result.catalog.storedGateState, 'FALSE')

// Explicit Himalayas search restriction affects only external search consumers.
result = evaluateOpportunityDistribution({ ...good, source: 'himalayas' }, [policy('himalayas')])
assert.equal(result.catalog.allowed, true); assert.equal(result.matching.allowed, true); assert.equal(result.alerts.allowed, true)
assert.equal(result.seo.allowed, false); assert.equal(result.jobPosting.allowed, false); assert.equal(result.googleJobs.allowed, false)
assert(result.seo.reasons.includes('SOURCE_CAPABILITY_DENIED'))

// A source kill switch remains a separate operational denial.
result = evaluateOpportunityDistribution(good, [policy('computrabajo', { is_enabled: false })])
assert.equal(result.catalog.allowed, false); assert(result.catalog.reasons.includes('SOURCE_DISABLED'))
assert.equal(result.matching.allowed, false); assert.equal(result.alerts.allowed, false)

// Row requirements still deny only the affected consumer; they are not
// compensated by source policy or inherited by unrelated consumers.
result = evaluateOpportunityDistribution({ ...good, organization: '' }, [policy('computrabajo')])
assert.equal(result.matching.allowed, true); assert.equal(result.seo.allowed, false)
assert(result.seo.reasons.includes('MISSING_ORGANIZATION'))
result = evaluateOpportunityDistribution({ ...good, description: 'thin', tags: [] }, [policy('computrabajo')])
assert.equal(result.catalog.allowed, true); assert.equal(result.matching.allowed, false); assert.equal(result.seo.allowed, false)
result = evaluateOpportunityDistribution({ ...good, archived_at: '2026-09-01T00:00:00Z' }, [policy('computrabajo')])
assert.equal(result.catalog.allowed, false); assert(result.catalog.reasons.includes('ROW_DISABLED'))
result = evaluateOpportunityDistribution({ ...good, source: 'unknown_future_source' }, [])
assert.equal(result.catalog.allowed, false); assert(result.catalog.reasons.includes('SOURCE_POLICY_UNKNOWN'))

// Historical repair and future insert derive exactly the same deterministic
// gate patch. Source permission is not written into either patch.
const future = intrinsicRoutingGates(good).proposed
const historical = reconcileInventoryRows([good], [policy('computrabajo')])[0]
assert.deepEqual(historical.proposed, future)
assert.deepEqual(future, { catalog_eligible: true, match_eligible: true, alerts_eligible: true, seo_eligible: true })
assert.equal(reconcileInventoryRows([{ ...good, description: 'thin', tags: [] }], [policy('computrabajo')])[0].proposed.match_eligible, false)

const migration = readFileSync(new URL('../supabase/migrations/202609220001_future_opportunity_intrinsic_routing_gates.sql', import.meta.url), 'utf8')
assert(migration.includes('new.catalog_eligible := v_catalog_ready'))
assert(migration.includes('new.match_eligible := v_matching_ready'))
assert(migration.includes('new.alerts_eligible := v_matching_ready'))
assert(migration.includes('new.seo_eligible := v_seo_ready'))
assert(!migration.includes('source_policy.matching_enabled'), 'future gates must not inherit legacy source consumer switches')
assert(!migration.includes('source_policy.seo_enabled'), 'future SEO row gate must remain intrinsic')
console.log('verify_effective_routing_repair: PASS ordinary=automatic himalayas=internal_only stale=repairable future=trigger_contract')
