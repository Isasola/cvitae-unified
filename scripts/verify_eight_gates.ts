import assert from 'node:assert/strict'
import { evaluateEightGates } from '../netlify/functions/lib/eight-gates'

const profile = (overrides: any = {}) => ({ canonical_source: 'fixture', adapter_version: 'fixture:v1', semantic_version: 'source-contract:v2', certified: true, automation_enabled: true, auto_enabled: false, distribution_policy: { web_catalog_allowed: false, google_jobs_distribution_allowed: false, third_party_job_distribution_allowed: false, source_attribution_required: false }, ...overrides })
const row = (overrides: any = {}) => ({ description: 'Useful description '.repeat(8), organization: 'Org', location: 'Asunción', country_code: 'PY', application_url: 'https://apply.test/1', source_url: 'https://source.test/1', remote_scope: 'ONSITE', ...overrides })
const run = (overrides: any = {}) => ({ status: 'healthy', found_count: 1, finished_at: '2026-09-15T00:00:00Z', extraction_metrics: {}, ...overrides })

const healthy = evaluateEightGates(profile(), [row()], run(), [], [])
assert.equal(healthy.gates[3].status, 'PASS')
assert.equal(healthy.gates[6].status, 'NOT_APPLICABLE')
assert.equal(healthy.gates[6].reason_code, 'AUTO_DISABLED_BY_POLICY')
assert.equal(healthy.gates[7].reason_code, 'RESTRICTED_BY_POLICY')

const talent = evaluateEightGates(profile({ canonical_source: 'talentcom' }), [row({ description: '', source_url: '' })], run(), [], [])
assert.equal(talent.gates[3].reason_code, 'CONTENT_INSUFFICIENT')
assert.equal(talent.gates[5].reason_code, 'RUNTIME_PASS_DATA_HEALTH_FAIL')
assert.equal(talent.gates[1].reason_code, 'DETAIL_UNPROVEN') // UNKNOWN remains unknown, never NOT_PUBLISHED

const lost = evaluateEightGates(profile({ auto_enabled: true, distribution_policy: { web_catalog_allowed: true } }), [row({ description: '' })], run({ extraction_metrics: { eight_gates: { gate_2: { metrics: { fields: { description: { extracted: 1 } } } } } } }), [], [])
assert.equal(lost.gates[4].reason_code, 'DESCRIPTION_LOST_BEFORE_PERSISTENCE')
assert.equal(lost.gates[6].reason_code, 'BLOCKED_BY_PREVIOUS_GATE')
assert.equal(lost.gates[6].status, 'NOT_EVALUATED')
assert.equal(lost.gates[7].reason_code, 'BLOCKED_BY_PREVIOUS_GATE')
assert.equal(lost.gates[7].evidence.blocked_by_gate, 4)

const ready = evaluateEightGates(profile({ canonical_source: 'unjobs', auto_enabled: true, distribution_policy: { web_catalog_allowed: true, google_jobs_distribution_allowed: true, third_party_job_distribution_allowed: true, source_attribution_required: true } }), [row()], run(), [], [])
assert.equal(ready.gates[6].status, 'PASS')
assert.equal(ready.gates[6].reason_code, 'READY_FOR_AUTOMATION')

const parser = evaluateEightGates(profile(), [row()], run({ extraction_metrics: { eight_gates: { gate_2: { status: 'FAIL', reason_code: 'DETAIL_UNAVAILABLE', metrics: {} } } } }), [], [])
assert.equal(parser.gates[1].status, 'FAIL')

const himalayas = evaluateEightGates(profile({ canonical_source: 'himalayas', distribution_policy: { web_catalog_allowed: true, google_jobs_distribution_allowed: false, third_party_job_distribution_allowed: false, source_attribution_required: true } }), [row()], run(), [], [])
assert.equal(himalayas.gates[6].reason_code, 'AUTO_DISABLED_BY_POLICY')
assert.equal(himalayas.gates[7].status, 'WARNING')
assert.equal(himalayas.gates[7].reason_code, 'PARTIALLY_ALLOWED')
assert.equal(himalayas.gates[7].metrics.surfaces.organic_seo.state, 'POLICY_NOT_DEFINED')

const uncertified = evaluateEightGates(profile({ certified: false }), [row()], run(), [], [])
assert.equal(uncertified.gates[6].status, 'NOT_APPLICABLE')
assert.equal(uncertified.gates[6].reason_code, 'SOURCE_NOT_CERTIFIED')
assert.notEqual(uncertified.gates[6].status, 'FAIL')

const policyUndefined = evaluateEightGates(profile({ distribution_policy: undefined }), [row()], run(), [], [])
assert.equal(policyUndefined.gates[7].status, 'NOT_EVALUATED')
assert.equal(policyUndefined.gates[7].reason_code, 'POLICY_NOT_DEFINED')
console.log('PASS eight gates UI projection: previous-gate block, AUTO policy, partial distribution, undefined SEO/AEO/GEO, uncertified source, non-failing restrictions')
