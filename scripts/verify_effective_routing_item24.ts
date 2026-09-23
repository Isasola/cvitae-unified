import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { catalogReadiness, matchingReadiness, seoReadiness } from '../src/lib/opportunity-truth.ts'
import { canonicalSource, evaluateOpportunityDistribution, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'

const good = {
  source: 'computrabajo', slug: 'programme-officer', title: 'Programme Officer', organization: 'Acme',
  description: 'Coordinate programmes, monitor results, prepare reports and collaborate with partners. '.repeat(2),
  tags: ['programme management', 'monitoring'], opportunity_type: 'job', is_active: true,
  verification_status: 'verified', catalog_eligible: true, match_eligible: true, alerts_eligible: true,
  seo_eligible: true, seo_status: 'eligible',
}
const policy = (source: string, extra: Partial<SourcePolicyRow> = {}): SourcePolicyRow => ({
  source, is_enabled: true, catalog_enabled: true, matching_enabled: true, alerts_enabled: true, seo_enabled: true,
  web_catalog_allowed: true, search_engine_indexing_allowed: true, google_jobs_distribution_allowed: false, ...extra,
})
const deny = (result: ReturnType<typeof evaluateOpportunityDistribution>, consumer: 'catalog'|'matching'|'alerts'|'seo'|'googleJobs', code: string) => {
  assert.equal(result[consumer].allowed, false)
  assert(result[consumer].reasons.includes(code), `${consumer}: expected ${code}, got ${result[consumer].reasons.join(',')}`)
}

// A: source permission + intrinsic truth align; stored gates are telemetry/
// repair inputs and do not permanently override current truth.
let result = evaluateOpportunityDistribution(good, [policy('computrabajo')])
assert.equal(catalogReadiness(good).state, 'READY'); assert.equal(matchingReadiness(good).state, 'READY'); assert.equal(seoReadiness(good).state, 'READY')
assert.equal(result.catalog.allowed, true); assert.equal(result.matching.allowed, true); assert.equal(result.alerts.allowed, true); assert.equal(result.seo.allowed, true)

// B/I: missing organization is an SEO fact gap, not a matching gap.
result = evaluateOpportunityDistribution({ ...good, organization: '' }, [policy('computrabajo')])
assert.equal(result.matching.allowed, true); deny(result, 'seo', 'MISSING_ORGANIZATION')

// C/G: Himalayas is internally usable when allowed but search distribution is explicitly denied.
result = evaluateOpportunityDistribution({ ...good, source: 'himalayas' }, [policy('himalayas', { web_catalog_allowed: true, search_engine_indexing_allowed: false, google_jobs_distribution_allowed: false })])
assert.equal(result.catalog.allowed, true); assert.equal(result.matching.allowed, true); assert.equal(result.alerts.allowed, true)
deny(result, 'seo', 'SOURCE_CAPABILITY_DENIED'); deny(result, 'googleJobs', 'SOURCE_CAPABILITY_DENIED')

// D: operational source disable wins over otherwise-good intrinsic truth.
result = evaluateOpportunityDistribution(good, [policy('computrabajo', { is_enabled: false })])
deny(result, 'catalog', 'SOURCE_DISABLED'); deny(result, 'matching', 'SOURCE_DISABLED'); deny(result, 'alerts', 'SOURCE_DISABLED'); deny(result, 'seo', 'SOURCE_DISABLED')

// E: raw unknown stays unknown and cannot inherit a nearby source's permissions.
result = evaluateOpportunityDistribution({ ...good, source: 'unregistered_future_source' }, [policy('computrabajo')])
assert.equal(result.policyFound, false); assert.equal(result.canonicalSource, 'unregistered_future_source')
deny(result, 'catalog', 'SOURCE_POLICY_UNKNOWN'); deny(result, 'matching', 'SOURCE_POLICY_UNKNOWN'); deny(result, 'seo', 'SOURCE_POLICY_UNKNOWN')

// F: truth and routing are intrinsic; false persisted flags remain observable
// for reconciliation but do not block an otherwise-ready ordinary source.
const staleFlags = { ...good, catalog_eligible: false, match_eligible: false, alerts_eligible: false, seo_eligible: false, seo_status: 'review' }
assert.equal(catalogReadiness(staleFlags).state, 'READY'); assert.equal(matchingReadiness(staleFlags).state, 'READY'); assert.equal(seoReadiness(staleFlags).state, 'READY')
result = evaluateOpportunityDistribution(staleFlags, [policy('computrabajo')])
assert.equal(result.catalog.allowed, true); assert.equal(result.matching.allowed, true); assert.equal(result.alerts.allowed, true); assert.equal(result.seo.allowed, true)
assert.equal(result.catalog.storedGateState, 'FALSE'); assert.equal(result.matching.storedGateState, 'FALSE')

// H: source SEO permission cannot compensate for thin source truth.
result = evaluateOpportunityDistribution({ ...good, description: 'thin' }, [policy('computrabajo')])
assert.equal(result.matching.allowed, true); deny(result, 'seo', 'THIN_CONTENT')

// J: alert truth is evaluated independently and a stale stored alert gate does
// not spill into matching or become a permanent alert denial.
result = evaluateOpportunityDistribution({ ...good, alerts_eligible: false }, [policy('computrabajo')])
assert.equal(result.matching.allowed, true); assert.equal(result.alerts.allowed, true); assert.equal(result.alerts.storedGateState, 'FALSE')

// Registry identity remains the only alias authority.
assert.equal(canonicalSource('oyaop'), 'oya')

const audit = JSON.parse(readFileSync(new URL('../generated/effective-routing-audit.json', import.meta.url), 'utf8'))
assert.equal(audit.registry_profiles, 105)
const himalayasAudit = audit.sources.find((entry: any) => entry.canonical_source === 'himalayas')
const unjobsAudit = audit.sources.find((entry: any) => entry.canonical_source === 'unjobs')
assert.equal(himalayasAudit.seo_source_state, 'EXPLICIT_RESTRICTION')
assert.equal(himalayasAudit.google_jobs_source_state, 'EXPLICIT_RESTRICTION')
assert.equal(unjobsAudit.seo_source_state, 'CONFIG_DISABLED_NO_RESTRICTION_EVIDENCE')
assert.equal(unjobsAudit.matching_source_state, 'UNKNOWN')

console.log('verify_effective_routing_item24: PASS consumers=distinct Himalayas=internal_allowed_seo_denied UNJobs=config_not_contract unknown=fail_closed')
