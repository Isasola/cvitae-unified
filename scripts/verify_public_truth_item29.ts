import assert from 'node:assert/strict'
import fs from 'node:fs'
import { catalogReadiness, canonicalOpportunityPathForRow, deadlineLifecycle, matchesPublicOpportunityMode } from '../src/lib/opportunity-truth.ts'
import { evaluateOpportunityDistribution, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'
import { publicCatalogQuery, publicCatalogPage } from '../netlify/functions/lib/public-opportunity-pagination.ts'
import { publicOpportunityResponse } from '../netlify/functions/public-opportunities.ts'
import { decodePublicOpportunityResponse } from '../src/lib/public-opportunity-response.ts'

const now = new Date('2026-09-22T12:00:00-03:00')
const row = { source:'computrabajo', slug:'role', title:'Programme Officer', organization:'Acme', description:'Programme delivery, monitoring, stakeholder coordination and reporting responsibilities. '.repeat(2), tags:['programme','monitoring'], opportunity_type:'job', is_active:true, verification_status:'verified', catalog_eligible:true, match_eligible:true, alerts_eligible:true, seo_eligible:true, seo_status:'eligible' }
const policy: SourcePolicyRow = { source:'computrabajo', is_enabled:true }

assert.equal(catalogReadiness({ ...row, deadline:'2026-10-01' }, now).state, 'READY')
assert.equal(catalogReadiness({ ...row, deadline:null }, now).state, 'READY')
assert.deepEqual(catalogReadiness({ ...row, deadline:'2026-09-21' }, now), { state:'NOT_READY', reasons:['DEADLINE_EXPIRED'] })
assert.equal(catalogReadiness({ ...row, archived_at:'2026-09-01T00:00:00Z' }, now).state, 'NOT_READY')
assert.equal(catalogReadiness({ ...row, deleted_at:'2026-09-01T00:00:00Z' }, now).state, 'NOT_READY')
assert.equal(catalogReadiness({ ...row, is_active:false }, now).state, 'NOT_READY')
assert.equal(catalogReadiness({ ...row, verification_status:'pending' }, now).state, 'NOT_READY')
assert.equal(deadlineLifecycle('not-a-date', now), 'INVALID')
assert.equal(deadlineLifecycle('2026-09-22', new Date('2026-09-22T23:59:59-03:00')), 'OPEN')
assert.equal(deadlineLifecycle('2026-09-22', new Date('2026-09-23T00:00:00-03:00')), 'EXPIRED')
assert.equal(evaluateOpportunityDistribution({ ...row, deadline:'2020-01-01' }, [policy]).catalog.reasons.includes('DEADLINE_EXPIRED'), true)

assert.equal(canonicalOpportunityPathForRow({ ...row, slug:'typed-job' }), '/empleos/typed-job')
assert.equal(canonicalOpportunityPathForRow({ ...row, slug:'kind-job', opportunity_type:null, opportunity_kind:'consultancy' }), '/empleos/kind-job')
assert.equal(canonicalOpportunityPathForRow({ ...row, slug:'scholarship', opportunity_type:'scholarship' }), '/oportunidades/scholarship')
assert.equal(canonicalOpportunityPathForRow({ ...row, slug:'training', opportunity_type:null, opportunity_kind:'training' }), '/oportunidades/training')

const raw = [
  ...Array.from({ length: 450 }, (_, index) => ({ ...row, id:`other-${index}`, slug:`other-${index}`, opportunity_type:'training' })),
  ...Array.from({ length: 300 }, (_, index) => ({ ...row, id:`job-${index}`, slug:`job-${index}`, opportunity_type:null, opportunity_kind:'job' })),
]
const jobs:typeof raw = []
let cursor:string|null = null
do {
  const args = publicCatalogQuery({ mode:'jobs', cursor:cursor || undefined })
  // The canonical SQL RPC filters the entire result set before its page budget.
  const page = publicCatalogPage(raw.filter(item => matchesPublicOpportunityMode(item, 'jobs'))
    .sort((a,b)=>a.id.localeCompare(b.id)).filter(item=>!args.p_after_id || item.id>args.p_after_id)
    .slice(0,args.p_limit))
  jobs.push(...page.rows); cursor=page.nextCursor
} while(cursor)
assert.equal(jobs.length, 300)
assert.ok(jobs.every(item => matchesPublicOpportunityMode(item, 'jobs')))
assert.equal(matchesPublicOpportunityMode({ ...row, opportunity_type:null, opportunity_kind:'job' }, 'jobs'), true)
assert.equal(matchesPublicOpportunityMode({ ...row, opportunity_type:null, opportunity_kind:'training' }, 'non_jobs'), true)

assert.deepEqual(publicOpportunityResponse([], 'missing'), { statusCode:404, body:{ error:'not_found' } })
assert.deepEqual(publicOpportunityResponse([], undefined), { statusCode:200, body:[] })
const response = (status:number, body:unknown) => ({ status, ok:status >= 200 && status < 300, json:async () => body })
assert.equal(await decodePublicOpportunityResponse(response(404, { error:'not_found' }) as any, 'missing'), null)
await assert.rejects(() => decodePublicOpportunityResponse(response(503, { error:'unavailable' }) as any, 'missing'), /public_policy_unavailable/)
await assert.rejects(() => decodePublicOpportunityResponse(response(404, { error:'not_found' }) as any), /public_policy_unavailable/)
const netlify = fs.readFileSync('netlify.toml', 'utf8')
for (const family of ['empleos','oportunidades']) {
  assert.ok(!netlify.includes(`from = "/${family}/:slug"`), 'generated _redirects is the only detail routing authority')
}
const detailSource = fs.readFileSync('netlify/functions/public-opportunity-detail.ts','utf8')
assert.doesNotMatch(detailSource, /export const config|preferStatic|context\.params/)
assert.match(detailSource, /status: 404/)
for (const page of ['src/pages/Jobs.tsx', 'src/pages/Opportunities.tsx', 'src/pages/MarketOpportunities.tsx']) assert.match(fs.readFileSync(page, 'utf8'), /canonicalOpportunityPathForRow/)
console.log('verify_public_truth_item29: PASS lifecycle canonical_mode detail_404 loader_404')
