import assert from 'node:assert/strict'
import { collectAllowedPages } from '../netlify/functions/lib/public-opportunity-pagination.ts'

const pageSize = 100
const rows = [
  ...Array.from({ length: 650 }, (_, index) => ({ id: `denied-${index}`, allowed: false })),
  ...Array.from({ length: 300 }, (_, index) => ({ id: `allowed-${index}`, allowed: true })),
]
const offsets: number[] = []
const result = await collectAllowedPages({
  target: 300,
  pageSize,
  fetchPage: async (offset, size) => { offsets.push(offset); return rows.slice(offset, offset + size) },
  allowed: row => row.allowed,
})
assert.equal(result.length, 300)
assert.equal(result[0].id, 'allowed-0')
assert.ok(offsets.at(-1)! >= 900, 'pagination must continue beyond formerly capped raw pages')
assert.ok(offsets.length < Math.ceil(rows.length / pageSize) + 1, 'pagination remains bounded by target/end-of-data')
console.log(`public_pagination: PASS pages=${offsets.length} target=${result.length}`)
