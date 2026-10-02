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
assert.deepEqual(expected, ['/empleos/programme-officer','/empleos/restricted','/oportunidades/regional-fellowship'], 'intrinsic SEO-ready rows route automatically even while their canonical source permission remains UNKNOWN')
for (const row of fixture.opportunities.filter((item: any) => item.source === 'unjobs')) {
  assert.equal(publicDistributionProjection(row, fixture.policies).seo.capabilityState, 'UNKNOWN', `${row.source} permission remains UNKNOWN`)
}
const computrabajo = fixture.opportunities.find((row: any) => row.source === 'computrabajo')
const computrabajoSeo = publicDistributionProjection(computrabajo, fixture.policies, observationDate).seo
assert.equal(computrabajoSeo.capabilityState, 'DENIED', 'Computrabajo SEO permission truth remains explicitly DENIED')
assert.equal(computrabajoSeo.allowed, true, 'the separate temporary legacy exception may preserve this already-routed row')
assert.equal(computrabajoSeo.temporaryException?.state,'ACTIVE')
assert.equal(computrabajoSeo.temporaryException?.applied,true)
const afterException = buildEffectiveSeoInventory(fixture.opportunities, fixture.policies, new Date('2026-10-10T00:00:00Z'))
assert.deepEqual(seoCanonicalPaths(afterException), expected, 'first-party SEO-ready Computrabajo rows remain routed after the temporary exception expires; expiry does not gate the canonical SEO contract')
const restricted = fixture.opportunities.find((row: any) => row.source === 'himalayas')
assert.equal(publicDistributionProjection(restricted, fixture.policies).seo.capabilityState, 'ALLOWED', 'Himalayas first-party organic indexing is allowed')
assert.equal(seoCanonicalPaths([{ canonical_path: '/already-effective/job' }, { canonical_path: '/already-effective/job' } as any]).length, 1, 'consumer canonical paths deduplicate already-authorized inventory')
const thin = fixture.opportunities.find((row: any) => row.id === 'thin')
assert.ok(seoReadiness(thin).reasons.includes('THIN_CONTENT'), 'thin content remains excluded by row quality')
const archived = fixture.opportunities.find((row: any) => row.id === 'archived')
assert.ok(catalogReadiness(archived).reasons.includes('ROW_DISABLED'), 'archived rows remain excluded')
assert.ok(catalogReadiness(fixture.opportunities.find((row: any) => row.id === 'duplicate')).state === 'READY', 'duplicate canonical identity remains a deduplication concern, not permission')
assert.equal(inventory.some(row => row.source === 'himalayas'), true)
assert.equal(inventory.some(row => row.slug === 'thin-card'), false)
assert.equal(inventory.some(row => row.slug === 'regional-fellowship'), true, 'UNKNOWN permission stays UNKNOWN but does not block first-party routing')
assert.equal(inventory.filter(row => row.canonical_path === '/empleos/programme-officer').length,1,'legacy exception continues normal duplicate canonical deduplication')
console.log(JSON.stringify({ total: fixture.opportunities.length, seo_unknown: 2, seo_denied: 1, himalayas_allowed: 1, temporary_legacy_seo_exception: 1, effective_seo: expected.length, expected }))
