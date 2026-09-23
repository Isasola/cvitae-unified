import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { auditEndOfData, MANDATORY_COLUMNS, OPPORTUNITY_COLUMNS, PAGE_SIZE, READ_ONLY_METHODS, selectColumnsForProduction } from './audit_real_effective_routing.ts'
import type { SourcePolicyRow } from '../src/lib/effective-source-policy.ts'

const policy: SourcePolicyRow[] = [{ source: 'computrabajo', is_enabled: true, catalog_enabled: true, matching_enabled: true, alerts_enabled: true, seo_enabled: true, web_catalog_allowed: true, search_engine_indexing_allowed: true, google_jobs_distribution_allowed: false }]
const rich = (id: number) => ({ id: `row-${id}`, source: 'computrabajo', slug: `row-${id}`, title: 'Programme Officer', organization: 'Fixture Org', description: 'Programme delivery, monitoring, stakeholder coordination and reporting responsibilities. '.repeat(2), tags: ['programme', 'monitoring'], opportunity_type: 'job', is_active: true, verification_status: 'verified', catalog_eligible: true, match_eligible: true, alerts_eligible: true, seo_eligible: true, seo_status: 'eligible', jobposting_validity: 'valid', deleted_at: null, archived_at: null })
const rows = Array.from({ length: PAGE_SIZE * 2 + 17 }, (_, index) => rich(index))
rows[2] = { ...rows[2], id: rows[1].id } // duplicate is detected, never silently counted.
rows[3] = { ...rows[3], source: 'future_unresolved', match_eligible: false }
rows[4] = { ...rows[4], organization: '', seo_eligible: true, seo_status: 'eligible' }
let calls = 0
// Simulate a production schema otherwise complete for this desired projection,
// with exactly the two optional columns observed missing in production.
const productionColumns = OPPORTUNITY_COLUMNS.filter(column => column !== 'requirements' && column !== 'professional_family')
const schema = selectColumnsForProduction(OPPORTUNITY_COLUMNS, productionColumns)
assert.deepEqual(schema.missing_columns.sort(), ['professional_family', 'requirements'], 'optional production columns remain explicit evidence')
assert.ok(!schema.selected_columns.includes('requirements') && !schema.selected_columns.includes('professional_family'), 'missing optional fields are never selected')
assert.throws(() => selectColumnsForProduction(OPPORTUNITY_COLUMNS, productionColumns.filter(column => column !== 'source')), /production_schema_missing_mandatory:source/, 'mandatory schema absence fails closed')
assert.ok(MANDATORY_COLUMNS.includes('id') && MANDATORY_COLUMNS.includes('source') && MANDATORY_COLUMNS.includes('title'))
const report = await auditEndOfData({ policies: policy, schema, pageSize: PAGE_SIZE, startCount: async () => rows.length, endCount: async () => rows.length, fetchPage: async (offset, size) => { calls += 1; return rows.slice(offset, offset + size) } })
assert.equal(calls, 3, 'pagination must run through terminal partial page, without fixed universe cap')
assert.equal(report.inventory.rows, rows.length)
assert.equal(report.inventory.unique, rows.length - 1)
assert.equal(report.inventory.duplicates, 1)
assert.equal(report.accounting_checks.per_source_total, report.inventory.unique)
assert.equal(report.accounting_checks.unexplained_rows, 1, 'duplicate evidence is explicit rather than hidden')
assert.deepEqual(report.schema.missing_columns.sort(), ['professional_family', 'requirements'], 'audit report preserves optional schema evidence')
for (const summary of Object.values(report.consumers) as any[]) assert.equal(summary.accounting.passes, true, 'allowed + denied must equal examined')
assert.ok(report.inventory.unknown_sources.includes('future_unresolved'), 'unknown identity/policy remains visible')
assert.ok(report.discrepancies.catalog_allowed_seo_denied || report.consumers.seo.effective_denied > 0, 'row-level reason accounting executes real policy/readiness')
assert.deepEqual([...READ_ONLY_METHODS].sort(), ['GET', 'HEAD'])
const source = readFileSync('scripts/audit_real_effective_routing.ts', 'utf8')
for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) assert.ok(!source.includes(forbidden), `auditor must have no mutation/RPC path: ${forbidden}`)
assert.ok(source.includes('catalogReadiness(row)') && source.includes('matchingReadiness(row)') && source.includes('seoReadiness(row)') && source.includes('jobPostingReadiness(row)') && source.includes('evaluateOpportunityDistribution(row, policies)'), 'auditor must execute real shared truth/policy helpers')
assert.ok(OPPORTUNITY_COLUMNS.includes('alerts_eligible') && OPPORTUNITY_COLUMNS.includes('jobposting_validity'), 'required stored consumer gates selected')
console.log(`verify_real_effective_routing_audit: PASS pages=${report.inventory.pages} unique=${report.inventory.unique} duplicate_detected=${report.inventory.duplicates} optional_schema_tolerant=true shared_core=true readonly=true`)
