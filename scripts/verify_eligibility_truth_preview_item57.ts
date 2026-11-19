import assert from 'node:assert/strict'
import { buildDictionary, isEligibleForProfile } from '../supabase/functions/_shared/matching.ts'
import { rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'

const opportunity = { eligible_countries: ['PY'], eligible_regions: [], location: 'Berlin, Germany' }
assert.equal(isEligibleForProfile(opportunity, 'Paraguay'), true)
assert.equal(isEligibleForProfile({ eligible_countries: ['DE'], eligible_regions: [], location: 'Paraguay' }, 'Paraguay'), false)
assert.equal(isEligibleForProfile({ eligible_countries: [], eligible_regions: ['LATAM'], location: 'Berlin' }, 'Paraguay'), true)
const unknownDecision = rankOpportunitiesV2({ professional_title: 'Analista', profile_data: { location: 'Paraguay', modality: 'remote', candidate_truth: { evidence: { professional_title: 'USER_CONFIRMED' } } } }, [{ id: 'x', title: 'Analista', description: 'A'.repeat(120), location: 'Asunción, Paraguay', remote: true, eligible_countries: [], eligible_regions: [], is_active: true, verification_status: 'verified', match_eligible: true, deadline: null }], buildDictionary([]), V2_PRESET_FULL).decisions[0].decision
assert.equal(unknownDecision.eligibility, 'UNKNOWN', 'location/remote does not become eligibility')
console.log('verify_eligibility_truth_preview_item57: PASS explicit opportunity eligibility only; location/remote are not proxies')
