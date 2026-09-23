import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'generated/source-distribution-policy-snapshot.json'), 'utf8'))
const allowed = new Set(['source','is_enabled','catalog_enabled','matching_enabled','alerts_enabled','seo_enabled','registry_certified','registry_adapter_version','registry_policy_hash','registry_synced_at','web_catalog_allowed','search_engine_indexing_allowed','google_jobs_distribution_allowed','third_party_job_distribution_allowed','source_attribution_required'])
assert.equal(snapshot.schema_version, 'source-distribution-policy:v1')
assert.ok(Date.parse(snapshot.generated_at), 'snapshot must be fresh/generated')
assert.ok(Array.isArray(snapshot.policies), 'snapshot must contain only policy rows')
for (const row of snapshot.policies) for (const key of Object.keys(row)) assert.ok(allowed.has(key), `unexpected public snapshot field: ${key}`)
assert.equal(snapshot.policies.find((row: any) => row.source === 'himalayas')?.search_engine_indexing_allowed, false)
console.log(`source_policy_snapshot: PASS policies=${snapshot.policies.length}`)
