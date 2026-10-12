import assert from 'node:assert/strict'
import { buildDefaultDictionary } from '../supabase/functions/_shared/matching.ts'
import { isPotentialDiscoveryDecision, rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'

const dictionary = buildDefaultDictionary()
const truth = { evidence: { professional_title: 'USER_CONFIRMED', summary: 'USER_CONFIRMED', skills: 'USER_CONFIRMED', location: 'USER_CONFIRMED', seniority: 'USER_CONFIRMED' } }
const eligibility = { version: 1, residence_country: 'PY', citizenship_countries: [], work_authorization_countries: [], evidence: { residence_country: 'USER_CONFIRMED', citizenship_countries: 'UNKNOWN', work_authorization_countries: 'UNKNOWN' }, confirmed_at: '2026-10-12T00:00:00Z' }
const cases = [
  { id: 'rrii', title: 'Programme Officer International Development', summary: 'International relations, cooperation and partnerships.', skills: ['International Cooperation', 'Monitoring'] },
  { id: 'coordination', title: 'Project Coordinator', summary: 'Coordinates projects, stakeholders, budgets and reporting.', skills: ['Project Coordination', 'Planning'] },
  { id: 'project-management', title: 'Project Manager', summary: 'Project management, delivery planning and stakeholder coordination.', skills: ['Project Management', 'Planning'] },
]

for (const canary of cases) {
  const profile = { professional_title: canary.title, summary: canary.summary, profile_data: { habilidades: canary.skills, location: 'Paraguay', modality: 'remote', seniority: 'mid', candidate_truth: truth, candidate_eligibility: eligibility } }
  const opportunity = {
    id: `opportunity-${canary.id}`, source_match_state: 'ALLOWED', is_active: true,
    verification_status: 'verified', match_eligible: true, deleted_at: null, archived_at: null,
    deadline: null, title: canary.title, description: `${canary.summary} The role owns documented outcomes, partner communication, implementation planning, monitoring, reporting and continuous improvement.`,
    tags: canary.skills, location: 'Remote', type: 'Remote', remote: true, eligible_regions: ['GLOBAL'], eligible_countries: [],
  }
  const result = rankOpportunitiesV2(profile, [opportunity], dictionary, V2_PRESET_FULL, new Map([[opportunity.id, .93]]))
  assert.equal(result.decisions[0]?.decision.outcome, 'MATCH', `${canary.id} reaches a confirmed match`)
  assert.equal(result.rankedV2[0]?.opp.id, opportunity.id, `${canary.id} is visible only in its own run`)

  const unknown = { ...opportunity, id: `${opportunity.id}-unknown`, eligible_regions: [], eligible_countries: [] }
  const unknownResult = rankOpportunitiesV2(profile, [unknown], dictionary, V2_PRESET_FULL, new Map([[unknown.id, .93]]))
  assert.equal(unknownResult.decisions[0]?.decision.outcome, 'ABSTAIN')
  assert.equal(isPotentialDiscoveryDecision(unknownResult.decisions[0]?.decision), true)
}

console.log('verify_r3_matching_profile_canaries: PASS rr_ii coordination project_management match_and_potential')
