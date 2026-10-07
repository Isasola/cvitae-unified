import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { publicDistributionProjection } from '../src/lib/effective-source-policy.ts'
import { catalogReadiness, seoReadiness } from '../src/lib/opportunity-truth.ts'
import { buildEffectiveSeoInventory, seoCanonicalPaths } from '../src/lib/seo-inventory.ts'

const root = path.resolve(import.meta.dirname, '..')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/seo-inventory.json'), 'utf8'))
const observationDate = new Date('2026-10-01T12:00:00Z')
const inventory = buildEffectiveSeoInventory(fixture.opportunities, fixture.policies, observationDate)
const expected = seoCanonicalPaths(inventory)
assert.deepEqual(expected, ['/empleos/himalayas-first-party', '/empleos/legacy-seo-role', '/empleos/new-computrabajo', '/empleos/programme-officer', '/oportunidades/regional-fellowship'], 'intrinsic SEO rows, first-party row gates and Himalayas first-party pages enter the inventory')
for (const row of fixture.opportunities.filter((item: any) => item.source === 'unjobs')) {
  assert.equal(publicDistributionProjection(row, fixture.policies).seo.capabilityState, 'UNKNOWN', `${row.source} permission remains UNKNOWN`)
}
const computrabajo = fixture.opportunities.find((row: any) => row.source === 'computrabajo')
const computrabajoSeo = publicDistributionProjection(computrabajo, fixture.policies, observationDate).seo
assert.equal(computrabajoSeo.capabilityState, 'DENIED', 'Computrabajo SEO permission truth remains explicitly DENIED')
assert.equal(computrabajoSeo.allowed, true, 'Computrabajo uses the same row gates without an exception')
assert.equal(computrabajoSeo.temporaryException,null)
for (const date of ['2026-10-03T12:00:00Z','2026-10-09T23:59:59Z','2026-10-10T00:00:00Z']) {
  for (const row of fixture.opportunities.filter((item:any)=>item.source==='computrabajo' && !item.archived_at)) {
    const decision=publicDistributionProjection(row,fixture.policies,new Date(date)).seo
    assert.equal(decision.allowed,true,`same row gates on ${date}`)
    assert.equal(decision.temporaryException,null)
    assert.equal(decision.capabilityState,'DENIED','historical evidence preserved')
  }
}
const restricted = fixture.opportunities.find((row: any) => row.source === 'himalayas')
const himalayasProjection = publicDistributionProjection(restricted, fixture.policies, observationDate)
assert.equal(himalayasProjection.seo.capabilityState, 'ALLOWED', 'Himalayas first-party SEO is allowed')
assert.equal(himalayasProjection.seo.allowed, true)
assert.equal(himalayasProjection.sourceAttributionRequired, true)
assert.equal(himalayasProjection.applicationRouting.state, 'ALLOWED')
assert.equal(himalayasProjection.googleJobs.allowed, false)
assert.equal(himalayasProjection.thirdParty.allowed, false)
assert.equal(himalayasProjection.jobPosting.allowed, false)
assert.equal(seoCanonicalPaths([{ canonical_path: '/already-effective/job' }, { canonical_path: '/already-effective/job' } as any]).length, 1, 'consumer canonical paths deduplicate already-authorized inventory')
const thin = fixture.opportunities.find((row: any) => row.id === 'thin')
assert.ok(seoReadiness(thin).reasons.includes('THIN_CONTENT'), 'thin content remains excluded by row quality')
const archived = fixture.opportunities.find((row: any) => row.id === 'archived')
assert.ok(catalogReadiness(archived).reasons.includes('ROW_DISABLED'), 'archived rows remain excluded')
assert.ok(catalogReadiness(fixture.opportunities.find((row: any) => row.id === 'duplicate')).state === 'READY', 'duplicate canonical identity remains a deduplication concern, not permission')
assert.equal(inventory.some(row => row.source === 'himalayas' && row.canonical_path === '/empleos/himalayas-first-party'), true)
assert.equal(inventory.some(row => row.slug === 'thin-card'), false)
assert.equal(inventory.some(row => row.slug === 'regional-fellowship'), true, 'UNKNOWN permission stays UNKNOWN but does not block first-party routing')
assert.equal(inventory.some(row => row.slug === 'legacy-seo-role'), true,'historical Computrabajo row remains row-driven')
assert.equal(inventory.some(row => row.slug === 'new-computrabajo'), true,'new rows use the same row-driven contract')
assert.equal(inventory.filter(row => row.canonical_path === '/empleos/programme-officer').length,1,'permitted Jobicy row retains canonical SEO readiness')
console.log(JSON.stringify({ total: fixture.opportunities.length, seo_unknown: 2, seo_denied: 2, himalayas_allowed: 1, computrabajo_window: 'RETIRED_REDUNDANT; ROW_DRIVEN_READY_ON_ALL_THREE_DATES', effective_seo: expected.length, expected }))
