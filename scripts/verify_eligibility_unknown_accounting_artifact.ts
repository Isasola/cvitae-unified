import assert from 'node:assert/strict'
import { applyMatchBatchSourcePolicy, canonicalSource, classifyUnknown, declaredEligibilityState, extractEligibilityEvidence } from '../artifacts/eligibility-unknown-accounting.mts'

assert.equal(declaredEligibilityState({ eligible_regions: ['GLOBAL'], eligible_countries: [], location: 'Remote' }, 'Paraguay'), 'ELIGIBLE')
assert.equal(declaredEligibilityState({ eligible_regions: ['US'], eligible_countries: [], location: 'Remote' }, 'Paraguay'), 'INELIGIBLE')
assert.equal(declaredEligibilityState({ eligible_regions: [], eligible_countries: [], location: 'Asunción, Paraguay', remote: true }, 'Paraguay'), 'UNKNOWN')

assert.equal(extractEligibilityEvidence('Position based in Asunción', 'description'), null)
assert.equal(extractEligibilityEvidence('Applicants must be based in Paraguay', 'description')?.kind, 'COUNTRY')
assert.equal(extractEligibilityEvidence('English C1', 'requirements'), null)
assert.equal(extractEligibilityEvidence('Must be authorized to work in Paraguay', 'requirements')?.kind, 'WORK_AUTHORIZATION')
assert.equal(classifyUnknown({ eligible_countries: [], eligible_regions: [], remote_scope: 'WORLDWIDE', description: '' }).cause, 'UNRESOLVED_RAW_CHECK_REQUIRED')
assert.equal(classifyUnknown({ eligible_countries: [], eligible_regions: [], description: 'Applicants from anywhere in the world may apply' }).cause, 'EXPLICIT_WORLDWIDE_NOT_CANONICALIZED')
assert.equal(canonicalSource('talent'), 'talentcom')

const rows = [{ source: 'wwr', id: 'allowed' }, { source: 'talent', id: 'disabled' }]
assert.deepEqual(applyMatchBatchSourcePolicy(rows, [{ source: 'weworkremotely', is_enabled: true }, { source: 'talentcom', is_enabled: false }]).map((row) => row.id), ['allowed'])
console.log('verify_eligibility_unknown_accounting_artifact: PASS')
