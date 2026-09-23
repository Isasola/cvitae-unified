import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildEffectiveSeoInventory, seoCanonicalPaths } from '../src/lib/seo-inventory.ts'

const root = path.resolve(import.meta.dirname, '..')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/seo-inventory.json'), 'utf8'))
const inventory = buildEffectiveSeoInventory(fixture.opportunities, fixture.policies)
const expected = seoCanonicalPaths(inventory)
assert.deepEqual(expected, ['/empleos/programme-officer', '/oportunidades/regional-fellowship'])
assert.equal(inventory.some(row => row.source === 'himalayas'), false)
assert.equal(inventory.some(row => row.slug === 'thin-card'), false)
console.log(JSON.stringify({ total: fixture.opportunities.length, source_permitted: 5, seo_ready: 3, effective_seo: expected.length, unique_canonical: expected.length, excluded_policy: 1, excluded_thin: 1, expected }))
