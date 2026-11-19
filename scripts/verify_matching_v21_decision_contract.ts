import assert from 'node:assert/strict'
import { buildDefaultDictionary } from '../supabase/functions/_shared/matching.ts'
import { rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'
import { readFileSync } from 'node:fs'
import { isEligibleForProfile } from '../supabase/functions/_shared/matching.ts'

const dictionary = buildDefaultDictionary()
const profile = {
  professional_title: 'Software Backend Developer',
  summary: 'Backend developer with Python SQL Docker and APIs.',
  profile_data: {
    habilidades: ['Python', 'SQL', 'Docker'], seniority: 'semi-senior',
    location: 'Asunción, Paraguay', modality: 'remote',
    candidate_truth: { evidence: { professional_title: 'USER_CONFIRMED', skills: 'USER_CONFIRMED' } },
    candidate_eligibility: { version: 1, residence_country: 'PY', citizenship_countries: [], work_authorization_countries: [], evidence: { residence_country: 'USER_CONFIRMED', citizenship_countries: 'UNKNOWN', work_authorization_countries: 'UNKNOWN' }, confirmed_at: null },
  },
}
const base = {
  is_active: true, verification_status: 'verified', match_eligible: true,
  deleted_at: null, archived_at: null, deadline: null, source_match_state: 'ALLOWED',
  location: 'Remote', type: 'Remote', remote: true, eligible_countries: ['py'], eligible_regions: [],
  tags: ['Python', 'SQL', 'Docker'], description: 'Senior backend engineering role building APIs with Python, SQL, Docker, and production systems. '.repeat(2),
}
function decision(override: Record<string, unknown> = {}, similarity = .95) {
  const opp = { ...base, id: 'case', title: 'Backend Software Engineer Senior', rubro: 'Technology', ...override }
  return rankOpportunitiesV2(profile, [opp], dictionary, V2_PRESET_FULL, new Map([[opp.id, similarity]])).decisions[0].decision
}

assert.equal(decision().outcome, 'MATCH', 'compatible, eligible, evidenced row matches')
assert.equal(decision({ title: 'Clinical Hospital Nurse', rubro: 'Healthcare', tags: ['Nursing', 'Patient care'] }, .99).outcome, 'DENY', 'semantic score cannot rescue professional conflict')
assert.equal(decision({ eligible_countries: ['us'], title: 'Backend Software Engineer Senior' }, .99).outcome, 'DENY', 'semantic score cannot rescue explicit ineligibility')
assert.equal(decision({ description: 'Short', tags: [], title: 'Backend Software Engineer' }, .99).outcome, 'ABSTAIN', 'insufficient professional evidence abstains')
assert.equal(decision({ eligible_countries: [], eligible_regions: [] }).eligibility, 'UNKNOWN', 'missing eligibility stays unknown')
const eligibilityUnknownReasons = decision({ eligible_countries: [], eligible_regions: [] }).unknown_reasons
assert.deepEqual(eligibilityUnknownReasons.filter((reason) => reason === 'CANDIDATE_ELIGIBILITY_UNKNOWN' || reason === 'OPPORTUNITY_ELIGIBILITY_UNKNOWN'), ['CANDIDATE_ELIGIBILITY_UNKNOWN', 'OPPORTUNITY_ELIGIBILITY_UNKNOWN'], 'unknown keeps generic and evaluator-specific diagnostic reasons')
assert.equal(decision({ eligible_countries: ['us'], location: 'Remote', type: 'Remote' }).eligibility, 'INELIGIBLE', 'remote does not imply worldwide eligibility')
const ineligibleReasons = decision({ eligible_countries: ['us'] }).hard_denials
assert.deepEqual(ineligibleReasons.filter((reason) => reason === 'CANDIDATE_INELIGIBLE' || reason === 'CANDIDATE_COUNTRY_NOT_ALLOWED'), ['CANDIDATE_INELIGIBLE', 'CANDIDATE_COUNTRY_NOT_ALLOWED'], 'ineligible keeps generic and evaluator-specific diagnostic reasons')
assert.equal(decision({ hard_requirements: ['Kubernetes'] }).outcome, 'DENY', 'explicit hard requirement failure denies')
assert.equal(decision().hard_requirements, 'UNKNOWN', 'absent optional requirements remain unknown')
assert.equal(decision({ source_match_state: 'UNKNOWN' }).outcome, 'DENY', 'unknown source boundary fails closed')
assert.equal(isEligibleForProfile({ eligible_countries: ['GLOBAL'], eligible_regions: [], title: 'Global role' }, 'Paraguay'), true, 'GLOBAL is an explicit worldwide eligibility alias')

const unknownTruthProfile = { ...profile, profile_data: { ...profile.profile_data, candidate_truth: { evidence: { professional_title: 'UNKNOWN', skills: 'UNKNOWN' } } } }
const unknownTruthOpp = { ...base, id: 'unknown-candidate-truth', title: 'Backend Software Engineer Senior', rubro: 'Technology' }
assert.equal(rankOpportunitiesV2(unknownTruthProfile, [unknownTruthOpp], dictionary, V2_PRESET_FULL).decisions[0].decision.outcome, 'ABSTAIN', 'explicit Candidate Truth unknown cannot become fit evidence')

const dashboardDecision = decision()
const alertDecision = decision()
assert.deepEqual(alertDecision, dashboardDecision, 'dashboard and alert consumers receive the same base decision')
assert.equal(dashboardDecision.outcome, 'MATCH')
assert.equal(dashboardDecision.confidence, 'HIGH')
assert.ok((dashboardDecision.score ?? 0) < 100, 'alert threshold can be stricter than the base decision')
assert.ok(dashboardDecision.positive_reasons.some((reason) => reason.startsWith('Skills overlap:')), 'explanation reasons originate in the decision')

const scheduled = readFileSync(new URL('../netlify/functions/send-high-match-alerts.ts', import.meta.url), 'utf8')
assert.ok(scheduled.includes('rankOpportunitiesV2'), 'scheduled alerts use V2.1 decision boundary')
assert.ok(!scheduled.includes('rankOpportunities(profile,'), 'legacy scheduled ranking invocation removed')
console.log('verify_matching_v21_decision_contract: PASS cases=12 consumer_boundary=shared')
