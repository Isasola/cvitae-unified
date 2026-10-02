import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildDefaultDictionary,
} from '../supabase/functions/_shared/matching.ts'
import {
  isHighMatchAlertDecision,
  isPotentialDiscoveryDecision,
  isVisibleMatchDecision,
  rankOpportunitiesV2,
  V2_PRESET_FULL,
} from '../supabase/functions/_shared/matching-v2.ts'

const FUTURE = '2099-12-31T00:00:00.000Z'
const dictionary = buildDefaultDictionary()
const candidate = {
  professional_title: 'Programme Officer International Development',
  summary: 'International cooperation, NGO programme coordination, monitoring and stakeholder engagement.',
  profile_data: {
    habilidades: ['Programme Management', 'Monitoring', 'Stakeholder Engagement'],
    location: 'Paraguay', seniority: 'mid', modality: 'remote',
    languages: ['Spanish', 'English'],
    candidate_truth: { evidence: { professional_title: 'CONFIRMED', summary: 'CONFIRMED', skills: 'CONFIRMED', location: 'CONFIRMED', seniority: 'CONFIRMED', languages: 'CONFIRMED' } },
    candidate_eligibility: { version: 1, residence_country: 'PY', citizenship_countries: [], work_authorization_countries: [], evidence: { residence_country: 'USER_CONFIRMED', citizenship_countries: 'UNKNOWN', work_authorization_countries: 'UNKNOWN' }, confirmed_at: null },
  },
}
const base = {
  source_match_state: 'ALLOWED', is_active: true, verification_status: 'verified',
  match_eligible: true, alerts_eligible: true, deleted_at: null, archived_at: null,
  deadline: FUTURE, remote: true, work_arrangement: 'Remote', eligible_countries: ['py'], eligible_regions: [], remote_scope: 'WORLDWIDE',
  opportunity_type: 'job', organization: 'Fixture NGO', location: 'Remote',
}
const good = {
  ...base, id: 'good', title: 'International Development Programme Officer',
  description: 'International development programme coordination, monitoring, reporting and stakeholder engagement.',
  tags: ['programme management', 'monitoring'],
}
const conflict = {
  ...base, id: 'conflict', title: 'Senior Backend Software Engineer',
  description: 'Design APIs, distributed systems, cloud infrastructure and backend software services.',
  tags: ['Python', 'Docker', 'Kubernetes'],
}
const unknownEligibility = { ...good, id: 'unknown-eligibility', eligible_countries: [], eligible_regions: [] }
const thin = { ...base, id: 'thin', title: 'Opportunity', description: 'Short listing.', tags: [] }

function decisions(profile: any, opportunities: any[]) {
  return rankOpportunitiesV2(profile, opportunities, dictionary, V2_PRESET_FULL, new Map(opportunities.map((row) => [row.id, .99])))
}

const baseline = decisions(candidate, [good, conflict, unknownEligibility, thin])
const byId = new Map(baseline.decisions.map(({ opp, decision }) => [opp.id, decision]))
assert.equal(byId.get('good')?.outcome, 'ABSTAIN', 'generic tags alone cannot establish professional evidence')
assert.equal(byId.get('conflict')?.outcome, 'DENY', 'professional conflict cannot reach any consumer despite semantic similarity')
assert.equal(byId.get('unknown-eligibility')?.outcome, 'ABSTAIN', 'unknown eligibility cannot become a confident match')
assert.equal(byId.get('thin')?.outcome, 'ABSTAIN', 'insufficient professional evidence cannot become a confident match')
assert.equal(isPotentialDiscoveryDecision(byId.get('unknown-eligibility')), false, 'generic tags cannot turn unknown eligibility into discovery evidence')
assert.equal(isPotentialDiscoveryDecision(byId.get('conflict')), false, 'professional conflict is never potential')
assert.equal(isPotentialDiscoveryDecision(decisions(candidate, [{ ...good, id: 'ineligible', eligible_countries: ['us'] }]).decisions[0].decision), false, 'explicit ineligibility is never potential')
assert.equal(isPotentialDiscoveryDecision(byId.get('thin')), false, 'insufficient professional evidence is hidden, not potential')

// This is the exact outcome boundary used by match-batch, then consumed by all
// interactive B2C surfaces. Counts are based on MATCH only.
const apiMatches = baseline.rankedV2.filter(({ decision }) => isVisibleMatchDecision(decision))
assert.deepEqual(apiMatches.map(({ opp }) => opp.id), [], 'generic tags cannot create a visible MATCH')
assert.equal(apiMatches.length, 0, 'Dashboard/Alertas/CV Vivo counts cannot include ABSTAIN or DENY')
assert.deepEqual(baseline.rankedPotentialV2.map(({ opp }) => opp.id), [], 'thin professional evidence cannot enter potential discovery')
assert.equal(isHighMatchAlertDecision(byId.get('good')), false, 'insufficient professional evidence cannot be delivered by alert policy')
assert.equal(isHighMatchAlertDecision(byId.get('unknown-eligibility')), false, 'ABSTAIN never qualifies for high-match delivery')
assert.equal(isHighMatchAlertDecision(byId.get('conflict')), false, 'DENY never qualifies for high-match delivery')

const changedProfile = {
  ...candidate,
  professional_title: 'Registered Nurse Healthcare',
  summary: 'Clinical nursing, patient care and hospital services.',
  profile_data: { ...candidate.profile_data, habilidades: ['Clinical care', 'Nursing'], candidate_truth: { evidence: { professional_title: 'CONFIRMED', summary: 'CONFIRMED', skills: 'CONFIRMED', location: 'CONFIRMED', seniority: 'CONFIRMED', languages: 'CONFIRMED' } } },
}
const afterProfileChange = decisions(changedProfile, [good]).decisions[0].decision
assert.equal(afterProfileChange.outcome, 'DENY', 'a persisted profile update must recompute rather than retain a stale MATCH')

const dashboard = readFileSync(new URL('../src/hub/Dashboard.tsx', import.meta.url), 'utf8')
const alerts = readFileSync(new URL('../src/hub/Alertas.tsx', import.meta.url), 'utf8')
const cvVivo = readFileSync(new URL('../src/hub/CVVivo.tsx', import.meta.url), 'utf8')
const learning = readFileSync(new URL('../src/hub/LearningPlan.tsx', import.meta.url), 'utf8')
const batch = readFileSync(new URL('../supabase/functions/match-batch/index.ts', import.meta.url), 'utf8')
const email = readFileSync(new URL('../netlify/functions/send-high-match-alerts.ts', import.meta.url), 'utf8')
const profileBoundary = readFileSync(new URL('../netlify/functions/b2c-profile.ts', import.meta.url), 'utf8')
const decisionContract = readFileSync(new URL('../src/lib/match-decision.ts', import.meta.url), 'utf8')
const matchingV2 = readFileSync(new URL('../supabase/functions/_shared/matching-v2.ts', import.meta.url), 'utf8')

for (const [name, source] of Object.entries({ dashboard, alerts, cvVivo, learning })) {
  assert.match(source, /matchDecision\?\.outcome === 'MATCH'/, `${name} fail-closes consumer data to visible MatchDecision outcomes`)
}
for (const field of ['applicable', 'eligibility', 'work_arrangement', 'hard_requirements', 'professional_evidence', 'confidence', 'outcome', 'score', 'positive_reasons', 'negative_reasons', 'unknown_reasons', 'hard_denials', 'matched_skills', 'missing_skills']) {
  assert.match(decisionContract, new RegExp(field), `neutral MatchDecision contract owns ${field}`)
}
for (const [name, source] of Object.entries({ dashboard, alerts })) {
  assert.match(source, /import type \{ MatchDecision \} from '@\/lib\/match-decision'/, `${name} imports the neutral canonical MatchDecision contract`)
  assert.doesNotMatch(source, /matchDecision\?: \{/, `${name} has no local divergent MatchDecision shape`)
}
assert.match(matchingV2, /from '\.\.\/\.\.\/\.\.\/src\/lib\/match-decision\.ts'/, 'Edge matcher imports the neutral type contract')
assert.match(matchingV2, /export type \{[\s\S]*MatchDecision/, 'Edge matcher re-exports MatchDecision for existing Edge consumers')
assert.match(batch, /isVisibleMatchDecision/, 'match-batch owns the common MATCH-only API payload')
assert.match(email, /isHighMatchAlertDecision/, 'scheduled email starts from the same base decision')
assert.doesNotMatch(email, /rankOpportunities\(profile/, 'scheduled email has no legacy candidate-fit invocation')
assert.match(email, /from\("opportunity_alert_universe"\)/, 'scheduled email discovers rows through the canonical alert universe, which applies lifecycle/deadline readiness')
assert.match(dashboard, /matchingProfileSignature/, 'Dashboard cache uses the shared matching profile signature')
assert.match(batch, /profile_signature: matchingProfileSignature/, 'match-batch persists the same matching profile signature')
assert.match(profileBoundary, /action === 'opportunity_preference'/, 'likes remain a feedback action, not a matching decision engine')

console.log('verify_matching_b2c_consumers: PASS consumers=5 match_only=1 alert_stricter=true profile_refresh=true likes=feedback_only')
