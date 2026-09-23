import assert from 'node:assert/strict'
import { canonicalOpportunityPath, canonicalOpportunityUrl, fieldState, matchingEvidenceReady, catalogReadiness, matchingReadiness, seoReadiness, jobPostingReadiness } from '../src/lib/opportunity-truth.ts'
import { evaluateOpportunityDistribution, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'

const row = { source:'computrabajo', slug:'x', title:'Programme Officer', is_active:true, verification_status:'verified', catalog_eligible:true, match_eligible:false, alerts_eligible:true, seo_eligible:true, seo_status:'eligible', opportunity_type:'job', description:'x'.repeat(120), organization:'Acme' }
const policy = (source = 'computrabajo', extra: Partial<SourcePolicyRow> = {}): SourcePolicyRow => ({ source, is_enabled:true, catalog_enabled:false, matching_enabled:false, alerts_enabled:false, seo_enabled:false, web_catalog_allowed:false, search_engine_indexing_allowed:null, google_jobs_distribution_allowed:false, ...extra })

let decision = evaluateOpportunityDistribution(row, [policy()])
assert.equal(decision.catalog.allowed, true); assert.equal(decision.matching.allowed, true); assert.equal(decision.alerts.allowed, true)
assert.equal(decision.seo.allowed, true); assert.equal(decision.jobPosting.allowed, true); assert.equal(decision.googleJobs.allowed, true)
assert.equal(decision.thirdParty.allowed, false); assert(decision.thirdParty.reasons.includes('THIRD_PARTY_DELIVERY_UNAVAILABLE'))
decision = evaluateOpportunityDistribution({ ...row, source:'himalayas' }, [policy('himalayas', { web_catalog_allowed:true, search_engine_indexing_allowed:false })])
assert.equal(decision.catalog.allowed, true); assert.equal(decision.seo.allowed, false); assert.equal(decision.jobPosting.allowed, false); assert.equal(decision.googleJobs.allowed, false)
assert.equal(canonicalOpportunityPath('x','job'), '/empleos/x'); assert.equal(canonicalOpportunityPath('x','scholarship'), '/oportunidades/x'); assert.equal(canonicalOpportunityUrl('x','job'), 'https://cvitae.lat/empleos/x'); assert.equal(fieldState(null), 'UNKNOWN'); assert.equal(fieldState('derived','INFERRED'), 'INFERRED')
assert.equal(matchingEvidenceReady({ title:'International opportunity', description:'', tags:[] }), false, 'thin card does not become matchable')
assert.equal(matchingEvidenceReady({ title:'Programme Officer', description:'Responsibilities and qualifications for programme delivery and development work. '.repeat(3), tags:[] }), true, 'rich evidence can be matching-ready')
const rich = {...row, match_eligible:true, tags:['programme','monitoring']}
assert.equal(catalogReadiness(rich).state, 'READY'); assert.equal(matchingReadiness(rich).state, 'READY'); assert.equal(seoReadiness(rich).state, 'READY'); assert.equal(jobPostingReadiness(rich).state, 'READY')
assert.equal(matchingReadiness({...rich, description:'', tags:[]}).reasons[0], 'INSUFFICIENT_PROFESSIONAL_EVIDENCE')
assert.equal(seoReadiness({...rich, description:'short'}).reasons[0], 'THIN_CONTENT')
console.log('verify_distribution_truth: PASS canonical_item24_only')
