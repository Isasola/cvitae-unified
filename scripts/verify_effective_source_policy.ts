import assert from 'node:assert/strict'
import { canonicalSource, evaluateOpportunityDistribution, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'

const rich = { source:'computrabajo', slug:'programme-officer', title:'Programme Officer', organization:'Acme', description:'Coordinate programmes, monitor results, prepare reports and collaborate with partners. '.repeat(2), tags:['programme management','monitoring'], opportunity_type:'job', is_active:true, verification_status:'verified', catalog_eligible:true, match_eligible:true, alerts_eligible:true, seo_eligible:true, seo_status:'eligible' }
const policy = (source:string, extra:Partial<SourcePolicyRow> = {}):SourcePolicyRow => ({ source, is_enabled:true, catalog_enabled:true, matching_enabled:true, alerts_enabled:true, seo_enabled:true, web_catalog_allowed:true, search_engine_indexing_allowed:true, google_jobs_distribution_allowed:true, ...extra })
let result = evaluateOpportunityDistribution(rich, [policy('computrabajo', { web_catalog_allowed:false, search_engine_indexing_allowed:null, google_jobs_distribution_allowed:false })])
assert.equal(result.catalog.allowed, true, 'legacy false capability is configuration, not contractual denial')
assert.equal(result.seo.allowed, true)
assert.equal(result.googleJobs.allowed, true)
assert.equal(result.catalog.adminSwitchState, 'ENABLED')
result = evaluateOpportunityDistribution({...rich, source:'oyaop', title:'Open Opportunity', description:'', tags:[]}, [policy('oya', { is_enabled:false, matching_enabled:false, web_catalog_allowed:false })])
assert.equal(canonicalSource('oyaop'), 'oya'); assert.equal(result.canonicalSource, 'oya'); assert.equal(result.matching.allowed, false); assert(result.matching.reasons.includes('INSUFFICIENT_PROFESSIONAL_EVIDENCE'))
result = evaluateOpportunityDistribution(rich, [policy('himalayas', { catalog_enabled:false, matching_enabled:false, alerts_enabled:false, seo_enabled:false, web_catalog_allowed:true, search_engine_indexing_allowed:false, google_jobs_distribution_allowed:false })])
assert.equal(result.policyFound, false, 'unresolved source does not inherit Himalayas policy')
result = evaluateOpportunityDistribution({...rich, source:'himalayas'}, [policy('himalayas', { catalog_enabled:false, matching_enabled:false, alerts_enabled:false, seo_enabled:false, web_catalog_allowed:true, search_engine_indexing_allowed:false, google_jobs_distribution_allowed:false })])
assert.equal(result.catalog.allowed, true); assert.equal(result.matching.allowed, true); assert.equal(result.alerts.allowed, true)
assert.equal(result.seo.allowed, false); assert.equal(result.googleJobs.allowed, false)
result = evaluateOpportunityDistribution(rich, [policy('computrabajo')])
assert.equal(result.catalog.allowed, true); assert.equal(result.matching.allowed, true); assert.equal(result.alerts.allowed, true); assert.equal(result.seo.allowed, true); assert.equal(result.googleJobs.allowed, true)
console.log('verify_effective_source_policy: PASS')
