import assert from 'node:assert/strict'
import { canonicalSource, evaluateOpportunityDistribution, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'
import { publicOpportunitySchemaType } from '../src/lib/opportunity-truth.ts'
import { aggregatedJobPosting } from '../src/lib/factual-job-posting.ts'
import { sourcePermissionDimensionTruth } from '../src/lib/source-permission-truth.ts'

const rich = { source:'computrabajo', slug:'programme-officer', title:'Programme Officer', organization:'Acme', description:'Coordinate programmes, monitor results, prepare reports and collaborate with partners. '.repeat(2), tags:['programme management','monitoring'], opportunity_type:'job', is_active:true, verification_status:'verified', created_at:'2026-09-20T00:00:00Z', catalog_eligible:true, match_eligible:true, alerts_eligible:true, seo_eligible:true, seo_status:'eligible' }
const policy = (source:string, extra:Partial<SourcePolicyRow> = {}):SourcePolicyRow => ({ source, is_enabled:true, catalog_enabled:true, matching_enabled:true, alerts_enabled:true, seo_enabled:true, web_catalog_allowed:true, search_engine_indexing_allowed:true, google_jobs_distribution_allowed:true, ...extra })
let result = evaluateOpportunityDistribution(rich, [policy('computrabajo', { web_catalog_allowed:false, search_engine_indexing_allowed:null, google_jobs_distribution_allowed:false })], new Date('2026-10-03T12:00:00Z'))
assert.equal(result.catalog.allowed, true, 'first-party Catalog is row-driven; historical permission remains advisory')
assert.equal(result.catalog.capabilityState, 'DENIED')
assert(!result.catalog.reasons.includes('SOURCE_CATALOG_PERMISSION_DENIED')); assert(result.catalog.permissionReasons.includes('SOURCE_CATALOG_PERMISSION_DENIED'))
assert.equal(result.seo.allowed, true, 'qualifying legacy Computrabajo row gets the narrow first-party SEO exception')
assert.equal(result.seo.capabilityState, 'DENIED')
assert.equal(result.seo.temporaryException, null)
assert.equal(result.googleJobs.allowed, false)
assert.equal(result.catalog.adminSwitchState, 'ENABLED')
result = evaluateOpportunityDistribution({...rich, source:'oyaop', title:'Open Opportunity', description:'', tags:[]}, [policy('oya', { is_enabled:false, matching_enabled:false, web_catalog_allowed:false })])
assert.equal(canonicalSource('oyaop'), 'oya'); assert.equal(result.canonicalSource, 'oya'); assert.equal(result.matching.allowed, false); assert(result.matching.reasons.includes('INSUFFICIENT_PROFESSIONAL_EVIDENCE'))
result = evaluateOpportunityDistribution(rich, [policy('himalayas', { catalog_enabled:false, matching_enabled:false, alerts_enabled:false, seo_enabled:false, consumer_switch_overrides:{ catalog:false, matching:false, alerts:false, seo:false }, web_catalog_allowed:true, search_engine_indexing_allowed:false, google_jobs_distribution_allowed:false })])
assert.equal(result.policyFound, false, 'unresolved source does not inherit Himalayas policy')
result = evaluateOpportunityDistribution({...rich, source:'himalayas'}, [policy('himalayas', { catalog_enabled:false, matching_enabled:false, alerts_enabled:false, seo_enabled:false, consumer_switch_overrides:{ catalog:false, matching:false, alerts:false, seo:false }, web_catalog_allowed:true, search_engine_indexing_allowed:false, google_jobs_distribution_allowed:false })])
assert.equal(result.catalog.allowed, false); assert(result.catalog.reasons.includes('SOURCE_CATALOG_OPERATOR_DISABLED'))
assert.equal(result.matching.allowed, false); assert.equal(result.matching.reasons.includes('SOURCE_MATCHING_OPERATOR_DISABLED'), true)
assert.equal(result.alerts.allowed, false); assert(result.alerts.reasons.includes('SOURCE_ALERTS_OPERATOR_DISABLED'))
assert.equal(result.seo.allowed, false, 'an explicit SEO consumer switch OFF blocks organic routing')
assert.equal(result.googleJobs.allowed, false)
for (const [consumer, field] of [['catalog','catalog_enabled'],['matching','matching_enabled'],['alerts','alerts_enabled']] as const) {
  const switchOff = evaluateOpportunityDistribution({ ...rich, source:'himalayas' }, [policy('himalayas', { [field]:false, consumer_switch_overrides: { [consumer]:false } })])
  assert.equal(switchOff[consumer].capabilityState, 'ALLOWED', `${consumer} permission remains ALLOWED while its switch is OFF`)
  assert.equal(switchOff[consumer].allowed, false)
  assert(switchOff[consumer].reasons.includes(`SOURCE_${consumer.toUpperCase()}_OPERATOR_DISABLED`), `${consumer} is causally blocked by operator switch`)
}
// The retired window had no factual gate independent of source-name permission.
for (const date of ['2026-10-03T12:00:00Z','2026-10-09T23:59:59Z','2026-10-10T00:00:00Z']) {
  for (const extra of [{}, {created_at:'2026-10-05T12:00:00Z',seo_eligible:false,seo_status:'pending'}]) {
    const d=evaluateOpportunityDistribution({...rich,...extra},[policy('computrabajo')],new Date(date))
    for (const consumer of ['catalog','matching','alerts','seo'] as const) {
      assert.equal(d[consumer].allowed,true)
      assert.equal(d[consumer].permissionRole,'ADVISORY_FIRST_PARTY')
    }
    assert.equal(d.seo.capabilityState,'DENIED')
    assert.equal(d.seo.temporaryException,null)
    assert(!d.googleJobs.allowed && !d.thirdParty.allowed)
  }
}
assert.equal(evaluateOpportunityDistribution({...rich,description:'Too short'},[policy('computrabajo')]).seo.allowed,false)
const ctSwitchOff = evaluateOpportunityDistribution(rich, [policy('computrabajo', { seo_enabled:false, consumer_switch_overrides:{seo:false} })], new Date('2026-10-01T12:00:00Z'))
assert.equal(ctSwitchOff.seo.allowed,false,'explicit SEO switch OFF blocks even where source permission is denied')
assert.equal(ctSwitchOff.seo.reasons.includes('SOURCE_SEO_OPERATOR_DISABLED'),true)
result = evaluateOpportunityDistribution(rich, [policy('computrabajo')], new Date('2026-10-10T00:00:00Z'))
assert.equal(result.catalog.allowed, true); assert.equal(result.matching.allowed, true); assert.equal(result.alerts.allowed, true); assert.equal(result.seo.allowed, true); assert.equal(result.jobPosting.allowed, false); assert.equal(result.googleJobs.allowed, false); assert.equal(result.thirdParty.allowed, false)
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'collect').state, 'DENIED')
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'detail_fetch').state, 'DENIED')
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'catalog').state, 'DENIED')
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'alerts').state, 'DENIED')
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'seo_index').state, 'DENIED')
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'google_jobs').state, 'DENIED')
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'third_party_distribution').state, 'DENIED')
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'matching').state, 'UNKNOWN')
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'application_routing').state, 'UNKNOWN')
assert.equal(sourcePermissionDimensionTruth('computrabajo', 'attribution_requirement').state, 'UNKNOWN')

const himalayasRow = { ...rich, source:'himalayas', slug:'himalayas-organic-role', country_code:'PY', city:'Asunción', published_at:'2026-09-01T00:00:00Z' }
const himalayasPolicy = policy('himalayas')
const himalayas = evaluateOpportunityDistribution(himalayasRow, [himalayasPolicy])
assert.equal(himalayas.seo.capabilityState, 'ALLOWED')
assert.equal(himalayas.seo.allowed, true, 'Himalayas ordinary first-party public pages may be indexed')
assert.equal(himalayas.catalog.allowed, true)
assert.equal(himalayas.matching.allowed, true)
assert.equal(himalayas.alerts.allowed, true)
assert.equal(himalayas.jobPosting.allowed, false, 'JobPosting follows Google Jobs permission, not SEO_INDEX')
assert.equal(himalayas.googleJobs.allowed, false)
assert.equal(himalayas.thirdParty.allowed, false)
const structured = aggregatedJobPosting({ ...himalayasRow, distribution:himalayas }, 'https://cvitae.lat/empleos/himalayas-organic-role')
assert.equal(structured.state, 'NOT_READY')
assert(structured.reasons.includes('JOBPOSTING_NOT_ALLOWED'))
assert.equal(publicOpportunitySchemaType(himalayasRow, structured.state === 'READY'), 'WebPage', 'public factual page retains generic schema and does not emit JobPosting')
const seoSwitchOff = evaluateOpportunityDistribution(himalayasRow, [policy('himalayas', { seo_enabled:false, consumer_switch_overrides:{seo:false} })])
assert.equal(seoSwitchOff.seo.capabilityState, 'ALLOWED', 'Himalayas SEO permission remains independent from its operator switch')
assert.equal(seoSwitchOff.seo.allowed, false, 'explicit consumer switch OFF blocks SEO')
assert(seoSwitchOff.seo.reasons.includes('SOURCE_SEO_OPERATOR_DISABLED'))
const unknownSeoPermissionReady = evaluateOpportunityDistribution({ ...himalayasRow, source:'jobicy' }, [policy('jobicy', { seo_enabled:true })])
assert.equal(unknownSeoPermissionReady.seo.capabilityState, 'UNKNOWN', 'permission evidence remains UNKNOWN')
assert.equal(unknownSeoPermissionReady.seo.allowed, true, 'UNKNOWN alone does not destroy intrinsic first-party SEO readiness')
assert.equal(unknownSeoPermissionReady.seo.adminSwitchState,'ENABLED')
assert(unknownSeoPermissionReady.seo.permissionReasons.includes('SOURCE_SEO_PERMISSION_UNKNOWN'))
const unknownPermissionNoSwitch = evaluateOpportunityDistribution({ ...himalayasRow, source:'jobicy' }, [policy('jobicy', { seo_enabled:true })])
assert.equal(unknownPermissionNoSwitch.seo.capabilityState,'UNKNOWN')
assert.equal(unknownPermissionNoSwitch.seo.allowed,true,'UNKNOWN source permission is not rewritten into a veto for a ready first-party page')
assert.equal(unknownSeoPermissionReady.googleJobs.allowed, false, 'external Google Jobs remains fail-closed on unknown permission')
console.log('verify_effective_source_policy: PASS')
