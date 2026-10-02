import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateOpportunityEligibility } from '../shared/candidate-eligibility.ts'

const backend = readFileSync(new URL('../netlify/functions/application-workspace.ts', import.meta.url), 'utf8')
const frontend = readFileSync(new URL('../src/hub/ApplicationWorkspace.tsx', import.meta.url), 'utf8')
assert.match(backend, /import \{ evaluateOpportunityEligibility \} from '\.\.\/\.\.\/shared\/candidate-eligibility'/)
assert.match(backend, /evaluateOpportunityEligibility\(profile\.profile_data\?\.candidate_eligibility, opportunity\)/)
for (const field of ['remote', 'remote_scope', 'eligible_countries', 'eligible_regions', 'citizenship_requirement', 'residency_requirement']) {
  assert.match(backend, new RegExp(`OPPORTUNITY_FIELDS[^\\n]*${field}`))
}
const invokeModel = backend.slice(backend.indexOf('async function invokeModel'), backend.indexOf('const VERSION_FIELDS'))
for (const privateField of ['candidate_eligibility', 'citizenship_countries', 'work_authorization_countries', 'residence_country']) {
  assert.doesNotMatch(invokeModel, new RegExp(privateField))
  assert.doesNotMatch(backend.slice(backend.indexOf('type GroundingEvidence'), backend.indexOf('function evidenceHash')), new RegExp(privateField))
}
assert.match(frontend, /data\.eligibilityAssessment\.state === 'ELIGIBLE'/)
assert.match(frontend, /data\.eligibilityAssessment\.state === 'INELIGIBLE'/)
assert.match(frontend, /No podemos confirmar todavía tu elegibilidad\. Revisá los requisitos oficiales\./)
assert.match(frontend, /Abrir formulario oficial/)
const global = evaluateOpportunityEligibility(undefined, { remote: true, eligible_regions: ['GLOBAL'] })
const unknown = evaluateOpportunityEligibility(undefined, { remote: true, eligible_regions: [] })
const mismatch = evaluateOpportunityEligibility({ residence_country: 'US', evidence: { residence_country: 'USER_CONFIRMED' } }, { remote: true, eligible_countries: ['PY'] })
assert.deepEqual([global.state, unknown.state, mismatch.state], ['ELIGIBLE', 'UNKNOWN', 'INELIGIBLE'])
console.log('PASS verify_application_eligibility')
