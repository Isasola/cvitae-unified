import assert from 'node:assert/strict'
import fs from 'node:fs'
import { demandCluster, publicOpportunityDemandInventory, recommendDemand } from '../src/lib/search-demand.ts'
assert.equal(demandCluster('trabajos en cde'), 'JOBS:ciudad-del-este'); assert.equal(demandCluster('empleos Ciudad del Este'), 'JOBS:ciudad-del-este')
const result = recommendDemand([{query:'bolsa de trabajo paraguay',clicks:0,impressions:18,position:3.6}], {'JOBS:paraguay': {count:8, existingLanding:true, canonical:'/oportunidades/paraguay'}})
assert.equal(result[0].recommendation, 'IMPROVE'); assert.equal(result[0].proposal?.kind, 'SEO_IMPROVEMENT')
const create = recommendDemand([{query:'trabajo luque',clicks:1,impressions:22,position:5}], {'JOBS:luque': {count:5, existingLanding:false}})[0]
assert.equal(create.recommendation, 'CREATE'); assert.equal(create.proposal?.kind, 'SEO_LANDING'); assert.equal(create.proposal?.targetCanonical, null); assert.equal(create.proposal?.proposedPath, '/empleos/luque')
assert.equal(recommendDemand([{query:'internship abroad',clicks:0,impressions:100,position:2}], {})[0].recommendation, 'IGNORE')
assert.deepEqual(
  publicOpportunityDemandInventory([{ city:'Ciudad del Este' }, { city:'CDE' }, { city:null }]),
  { 'JOBS:ciudad-del-este': { count:2, existingLanding:false } },
)
const adminAnalytics = fs.readFileSync('netlify/functions/admin-analytics.ts', 'utf8')
assert.match(adminAnalytics, /publicOpportunityDemandInventory\(\(publicSeoInventory as any\)\.rows\)/)
assert.match(adminAnalytics, /demand_actions: Array\.isArray\([\s\S]*?recommendDemand\(/)
const growthCenter = fs.readFileSync('src/components/admin/AdminGrowthCenter.tsx', 'utf8')
assert.match(growthCenter, /demand_actions\?: Array/)
assert.match(growthCenter, /Propuestas de demanda/)
console.log('verify_search_demand: PASS')
