import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildEffectiveSeoInventory } from '../src/lib/seo-inventory.ts'
import { buildOpportunityRedirects, canonicalRoute, parseInventory, redirectText } from './generate-opportunity-redirects.mjs'

const root = path.resolve(import.meta.dirname, '..')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/seo-inventory.json'), 'utf8'))
const effective = buildEffectiveSeoInventory(fixture.opportunities, fixture.policies)
const normal = redirectText(effective)
assert.match(normal.text, /^\/oportunidades\/programme-officer \/empleos\/programme-officer 301!$/m)
assert.match(normal.text, /^\/empleos\/regional-fellowship \/oportunidades\/regional-fellowship 301!$/m)
assert.ok(!normal.text.includes('/empleos/programme-officer /'), 'canonical job has no redirect')

const kindOnly = buildEffectiveSeoInventory([{ ...fixture.opportunities[0], id:'kind', slug:'kind-job', opportunity_type:null, opportunity_kind:'job' }], fixture.policies)
assert.match(redirectText(kindOnly).text, /^\/oportunidades\/kind-job \/empleos\/kind-job 301!$/m)
const collision = buildOpportunityRedirects([{ canonical_path:'/empleos/shared-slug' }, { canonical_path:'/oportunidades/shared-slug' }])
assert.equal(collision.redirects.length, 0); assert.equal(collision.collisions, 2)
const reversed = redirectText([...effective].reverse())
assert.equal(reversed.text, normal.text, 'input order is byte-deterministic')
const canonicalSet = new Set(effective.map((row: any) => row.canonical_path))
const sources = new Set<string>()
for (const { source, target } of normal.redirects) {
  const from = canonicalRoute(source), to = canonicalRoute(target)
  assert.ok(!sources.has(source) && source !== target && !canonicalSet.has(source) && canonicalSet.has(target))
  assert.notEqual(from.family, to.family); assert.equal(from.slug, to.slug); sources.add(source)
}
for (const { target } of normal.redirects) assert.ok(!sources.has(target), 'no generated chain or loop')
for (const row of fixture.opportunities.filter((row: any) => ['thin', 'restricted', 'archived'].includes(row.id))) assert.ok(!normal.text.includes(row.slug), `excluded row has no alias: ${row.id}`)
for (const bad of ['/unknown/x', '/empleos/', '/empleos/a/b', '/empleos/unsafe space']) assert.throws(() => canonicalRoute(bad), /seo_redirect_invalid_canonical_path/)
assert.throws(() => parseInventory({ generated_at:'nope', rows:[] }), /seo_inventory_stale/)
assert.throws(() => parseInventory({ generated_at:new Date().toISOString(), rows:[] }), /seo_inventory_empty/)
process.env.SEO_INVENTORY_ALLOW_EMPTY = 'true'; assert.deepEqual(parseInventory({ generated_at:new Date().toISOString(), rows:[] }), []); delete process.env.SEO_INVENTORY_ALLOW_EMPTY
console.log(`verify_redirect_consistency_item32: PASS redirects=${normal.redirects.length} collisions=${collision.collisions} graph=acyclic deterministic=true`)
