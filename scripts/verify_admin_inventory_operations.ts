import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reconcileInventoryRows, reconcilePaged, orchestrateReconciliationApply } from '../src/lib/inventory-reconciliation.ts'

const root = new URL('..', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const admin = read('netlify/functions/admin-data.ts')
const view = read('src/components/admin/SourceOperationsView.tsx')
const migration = read('supabase/migrations/202609210001_inventory_reconciliation_jobs.sql')

for (const token of ['preview_inventory_reconciliation', 'apply_inventory_reconciliation', 'resume_inventory_reconciliation', 'retry_maintenance_telemetry', 'inventory_reconciliation_jobs', 'confirm=true requerido', 'source_totals', 'accounted_total', 'explained_rows', 'unexplained_rows', 'unknown_sources']) assert.ok(admin.includes(token), token)
for (const token of ['PREVIEW INVENTARIO', 'APLICAR RECONCILIACIÓN', 'REANUDAR', 'REINTENTAR TELEMETRÍA', 'QUEUED', 'RUNNING']) assert.ok(view.includes(token), token)
for (const token of ['cursor_offset', 'PARTIAL', 'reason_counts', 'reconciliation_id']) assert.ok(migration.includes(token), token)
assert.ok(admin.includes('examined: 0') && admin.includes('reason_counts: {}'), 'preview must not populate APPLY counters')
assert.ok(admin.includes('metadata: { preview: summary'), 'preview summary must be retained separately')
assert.ok(!admin.includes('if (job?.status === "RUNNING") job.status = "PARTIAL"'), 'ordinary RUNNING is not PARTIAL')
assert.ok(view.includes("while (result.status === 'RUNNING'"), 'one Admin APPLY action must chain normal chunks')
for (const action of ['preview_inventory_reconciliation', 'apply_inventory_reconciliation', 'resume_inventory_reconciliation']) {
  const start = admin.indexOf(`action === "${action}"`)
  assert.ok(start >= 0, `${action} is present`)
  const scope = admin.slice(start, start + 4500)
  assert.match(scope, /get_source_distribution_policy/, `${action} reads the complete shared source-policy universe`)
  assert.doesNotMatch(scope, /opportunity_sources[\s\S]{0,250}limit\(500\)/, `${action} has no 500-row source-policy ceiling`)
}
assert.ok(!admin.includes('select(RECONCILIATION_POLICY_FIELDS).limit(500)'), 'reconciliation cannot reintroduce a fixed source-policy ceiling')
assert.ok(admin.includes('supabase.rpc("get_source_distribution_policy"),\n    // P0.1'), 'source operation snapshot uses the shared complete policy boundary')

const policy = [{ source: 'computrabajo', is_enabled: true, catalog_enabled: true, matching_enabled: true, alerts_enabled: true, seo_enabled: true, web_catalog_allowed: true, search_engine_indexing_allowed: true }]
const base = { source: 'computrabajo', is_active: true, verification_status: 'verified', catalog_eligible: false, match_eligible: false, alerts_eligible: null, seo_eligible: false, seo_status: 'review', opportunity_type: 'job', title: 'Data Analyst', organization: 'Fixture', slug: 'data-analyst', description: 'Data analysis, SQL, dashboards, modelling and reporting for business decisions. '.repeat(3), tags: ['sql', 'analysis'] }
const preview = reconcileInventoryRows([{ ...base, id: 'one' }], policy)[0]
assert.equal(preview.proposed.match_eligible, true)
assert.equal(preview.proposed.alerts_eligible, true, 'alerts use their own current readiness contract')
assert.equal(preview.proposed.seo_eligible, true)
assert.ok(!('seo_status' in preview.proposed))

const rows = Array.from({ length: 7000 }, (_, i) => ({ ...base, id: String(i), slug: `row-${i}` }))
let writes = 0
const partial = await reconcilePaged({ pageSize: 100, maxPages: 7, fetchPage: async (cursor, size) => rows.slice(cursor, cursor + size), policies: policy })
assert.equal(partial.cursor, 700); assert.equal(partial.complete, false)
const resumed = await reconcilePaged({ pageSize: 100, cursor: partial.cursor, fetchPage: async (cursor, size) => rows.slice(cursor, cursor + size), policies: policy, apply: async (row, patch) => { Object.assign(row, patch); writes++ } })
const first = await reconcilePaged({ pageSize: 100, fetchPage: async (cursor, size) => rows.slice(cursor, cursor + size), policies: policy, apply: async (row, patch) => { Object.assign(row, patch); writes++ } })
const rerun = await reconcilePaged({ pageSize: 100, fetchPage: async (cursor, size) => rows.slice(cursor, cursor + size), policies: policy })
assert.equal(resumed.summary.total_examined, 6300)
assert.equal(first.summary.would_change, 700, 'only the interrupted first chunk remains to be applied')
assert.equal(rerun.summary.would_change, 0)

// Preview uses 7,000 examined rows, but APPLY counters start from zero.
const applyRows = Array.from({ length: 7000 }, (_, i) => ({ ...base, id: `apply-${i}`, slug: `apply-${i}` }))
const checkpoints: any[] = []
const applied = await orchestrateReconciliationApply({
  pageSize: 250, fetchPage: async (cursor, size) => applyRows.slice(cursor, cursor + size), policies: policy,
  apply: async (row, patch) => Object.assign(row, patch), checkpoint: state => checkpoints.push(state),
})
assert.equal(checkpoints[0].summary.total_examined, 250, 'preview=7000 must not inflate first APPLY chunk')
assert.ok(Array.isArray(checkpoints[0].summary.top_reason_codes), 'APPLY persists a chunk-local reason histogram, including an empty one when all rows route')
assert.equal(applied.summary.total_examined, 7000)
assert.equal(applied.summary.total_examined, 7000, 'every fetched row has one reconciliation decision')
assert.equal(applied.pages, 28)
assert.equal(applied.status, 'SUCCESS')
const interruptedRows = Array.from({ length: 7000 }, (_, i) => ({ ...base, id: `resume-${i}`, slug: `resume-${i}` }))
const interruptedApply = await orchestrateReconciliationApply({ pageSize: 100, interruptAfterPages: 7, fetchPage: async (cursor, size) => interruptedRows.slice(cursor, cursor + size), policies: policy, apply: async (row, patch) => Object.assign(row, patch) })
assert.equal(interruptedApply.status, 'PARTIAL'); assert.equal(interruptedApply.cursor, 700)
const resumedApply = await orchestrateReconciliationApply({ pageSize: 100, cursor: interruptedApply.cursor, fetchPage: async (cursor, size) => interruptedRows.slice(cursor, cursor + size), policies: policy, apply: async (row, patch) => Object.assign(row, patch) })
assert.equal(resumedApply.status, 'SUCCESS'); assert.equal(resumedApply.summary.total_examined, 6300)
console.log(`verify_admin_inventory_operations: PASS static_contract=true policies=full-universe preview=7000 first_apply=250 apply=7000 chunks=${applied.pages} status=${applied.status} resume=700+6300 rerun_changes=0 buttons=contract-wired`)
