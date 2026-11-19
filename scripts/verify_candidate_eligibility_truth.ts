import assert from 'node:assert/strict'
import { evaluateOpportunityEligibility, confirmedCandidateEligibility, normalizeCountryCode } from '../shared/candidate-eligibility.ts'
import { matchingProfileSignature } from '../shared/matching-profile-signature.ts'
import { canonicalCandidateProfile } from '../shared/candidate-profile.ts'
import { buildProfileEmbeddingText } from '../supabase/functions/_shared/embedding.ts'
import { readFileSync } from 'node:fs'
import { ISO_3166_ALPHA2_CODES } from '../shared/iso-countries.ts'
import { COUNTRY_OPTIONS } from '../shared/country-options.ts'

const confirmed=(residence_country='', citizenship_countries:string[]=[])=>(confirmedCandidateEligibility({residence_country,citizenship_countries}))
const remote=(eligible_countries:string[]=[], eligible_regions:string[]=[], extra:any={})=>({remote:true,eligible_countries,eligible_regions,...extra})
for (const code of ['PY','US','GB']) assert.equal(normalizeCountryCode(code),code)
for (const code of ['ZZ','XK','']) assert.equal(normalizeCountryCode(code),'')
assert.equal(ISO_3166_ALPHA2_CODES.length,249)
assert.equal(new Set(ISO_3166_ALPHA2_CODES).size,249)
assert.deepEqual(COUNTRY_OPTIONS.map(({code})=>code),ISO_3166_ALPHA2_CODES)
assert.equal(evaluateOpportunityEligibility(undefined,remote(['PY'])).state,'UNKNOWN')
assert.equal(evaluateOpportunityEligibility(confirmed('PY'),remote(['PY'])).state,'ELIGIBLE')
assert.equal(evaluateOpportunityEligibility(confirmed('PY'),remote(['US'])).state,'INELIGIBLE')
assert.equal(evaluateOpportunityEligibility(confirmed('', ['PY']),remote(['PY'])).state,'UNKNOWN')
assert.equal(evaluateOpportunityEligibility(confirmed('PY',['US']),remote(['US'],[],{citizenship_requirement:'US citizenship'})).state,'ELIGIBLE')
assert.equal(evaluateOpportunityEligibility(confirmed('PY'),remote(['US'],[],{citizenship_requirement:'US citizenship'})).state,'UNKNOWN')
assert.equal(evaluateOpportunityEligibility(undefined,remote([],['GLOBAL'])).state,'ELIGIBLE')
assert.equal(evaluateOpportunityEligibility(undefined,remote([],['GLOBAL'],{citizenship_requirement:'Must be citizen'})).reason,'OPPORTUNITY_CITIZENSHIP_REQUIREMENT_UNSTRUCTURED')
assert.equal(evaluateOpportunityEligibility(undefined,remote([],['GLOBAL'],{residency_requirement:'Must reside'})).reason,'OPPORTUNITY_RESIDENCY_REQUIREMENT_UNSTRUCTURED')
assert.equal(evaluateOpportunityEligibility(confirmed('', ['US']),remote(['US'],['GLOBAL'],{citizenship_requirement:'Must be citizen'})).state,'ELIGIBLE')
assert.equal(evaluateOpportunityEligibility(confirmed('PY'),remote([],['LATAM'])).state,'ELIGIBLE')
assert.equal(evaluateOpportunityEligibility(confirmed('US'),remote([],['LATAM'])).state,'INELIGIBLE')
assert.equal(evaluateOpportunityEligibility(confirmed('PY'),remote([],['EUROPE'])).reason,'REGION_MEMBERSHIP_UNSUPPORTED:EUROPE')
assert.equal(evaluateOpportunityEligibility(confirmed('PY'),{eligible_countries:['PY']}).reason,'OPPORTUNITY_ELIGIBILITY_BASIS_UNKNOWN')
const base={professional_title:'Engineer',profile_data:{location:'Asunción, Paraguay'}}
assert.equal(evaluateOpportunityEligibility(canonicalCandidateProfile(base).profile_data.candidate_eligibility,remote(['PY'])).state,'UNKNOWN')
assert.notEqual(matchingProfileSignature(base),matchingProfileSignature({...base,profile_data:{...base.profile_data,candidate_eligibility:confirmed('PY')}}))
const embedding=buildProfileEmbeddingText({...base,profile_data:{...base.profile_data,candidate_eligibility:confirmed('PY',['US'])}})
assert.doesNotMatch(embedding,/USER_CONFIRMED|work_authorization|citizenship|residence_country|\bPY\b|\bUS\b/)
const profileSave=readFileSync(new URL('../netlify/functions/b2c-profile.ts',import.meta.url),'utf8')
assert.match(profileSave,/hasOwnProperty\.call\(incoming, 'candidate_eligibility'\)/)
for (const file of ['../src/hub/CVVivo.tsx','../src/hub/CVRewrite.tsx','../src/hub/ATSDiagnostic.tsx','../src/hub/LearningPlan.tsx']) {
  assert.doesNotMatch(readFileSync(new URL(file,import.meta.url),'utf8'),/candidate_eligibility/)
}
console.log('PASS verify_candidate_eligibility_truth')
