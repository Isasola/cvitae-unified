import assert from 'node:assert/strict'
import { reconcileInventoryRows, reconciliationSummary, reconcilePaged } from '../src/lib/inventory-reconciliation.ts'

const policy = [{ source: 'computrabajo', is_enabled: true, catalog_enabled: true, matching_enabled: true, alerts_enabled: true, seo_enabled: true, web_catalog_allowed: true, search_engine_indexing_allowed: true, google_jobs_distribution_allowed: false }]
const base = { source: 'computrabajo', is_active: true, verification_status: 'verified', catalog_eligible: true, match_eligible: true, alerts_eligible: true, seo_eligible: true, seo_status: 'eligible', opportunity_type: 'job', title: 'Programme Officer', organization: 'UN', slug: 'programme-officer', description: 'Programme responsibilities and requirements for international development delivery. '.repeat(2) }
const decisions = reconcileInventoryRows([{ ...base, id: 'rich', embedding: [1] }, { ...base, id: 'thin', slug: 'thin', description: '', embedding: null }, { ...base, id: 'archived', slug: 'archived', archived_at: '2026-01-01T00:00:00Z' }], policy)
assert.equal(decisions[0].catalog.allowed, true)
assert.equal(decisions[0].embedding, 'READY')
assert.equal(decisions[1].matching.state, 'NOT_READY')
assert.ok(decisions[1].matching.reasons.includes('INSUFFICIENT_PROFESSIONAL_EVIDENCE'))
assert.equal(decisions[1].embedding, 'NOT_REQUIRED')
assert.equal(decisions[1].proposed.alerts_eligible, false, 'alerts use their own readiness result')
assert.ok(!('seo_status' in decisions[1].proposed), 'SEO review state is never collapsed into blocked')
const reviewSeo = reconcileInventoryRows([{ ...base, id: 'review-seo', seo_status: 'review', seo_eligible: false }], policy)[0]
assert.equal(reviewSeo.proposed.seo_eligible, true)
assert.ok(!('seo_status' in reviewSeo.proposed))
const richDisabled = reconcileInventoryRows([{ ...base, id: 'stored-disabled', match_eligible: false }], policy)[0]
assert.equal(richDisabled.matching.state, 'READY', 'intrinsic readiness must ignore a stale row flag')
assert.equal(richDisabled.proposed.match_eligible, true)
const sourceDisabled = reconcileInventoryRows([{ ...base, id: 'source-disabled', match_eligible: false }], [{ ...policy[0], is_enabled: false, matching_enabled: false }])[0]
assert.equal(sourceDisabled.matching.state, 'READY')
assert.equal(sourceDisabled.matching.allowed, false, 'source policy remains an effective, separate gate')
const aliases = reconcileInventoryRows([{ ...base, id: 'oya-a', source: 'oya' }, { ...base, id: 'oya-alias', source: 'oyaop' }], [{ ...policy[0], source: 'oya', is_enabled: false }])
assert.deepEqual(aliases.map(item => item.canonical_source), ['oya', 'oya'])
assert.ok(aliases.every(item => !item.catalog.allowed), 'canonical aliases cannot bypass a disabled source')
assert.equal(decisions[2].catalog.allowed, false)
const summary = reconciliationSummary(decisions)
assert.equal(summary.total_examined, 3)
assert.equal(summary.catalog_allowed, 2)

const mass = Array.from({ length: 7000 }, (_, index) => ({ ...base, id: `row-${index}`, slug: `row-${index}`, description: index % 3 ? base.description : '', match_eligible: false, alerts_eligible: false, seo_eligible: false, seo_status: 'blocked' }))
const fetchPage = async (cursor: number, size: number) => mass.slice(cursor, cursor + size)
const preview = await reconcilePaged({ pageSize: 137, fetchPage, policies: policy, decisionLimit: 100 })
assert.equal(preview.decisions.length, 100, 'preview keeps a bounded decision sample rather than all 7000 rows')
assert.equal(preview.summary.total_examined, 7000)
assert.equal(preview.complete, true)
const changed = new Map<string, Record<string, any>>()
const apply = await reconcilePaged({ pageSize: 137, fetchPage, policies: policy, apply: async (row, proposed) => { Object.assign(row, proposed); changed.set(row.id, proposed) } })
assert.equal(apply.summary.would_change, preview.summary.would_change)
const rerun = await reconcilePaged({ pageSize: 137, fetchPage, policies: policy })
assert.equal(rerun.summary.would_change, 0)
const interrupted = await reconcilePaged({ pageSize: 100, fetchPage, policies: policy, maxPages: 7 })
const resumed = await reconcilePaged({ pageSize: 100, cursor: interrupted.cursor, fetchPage, policies: policy })
assert.equal(interrupted.decisions.length + resumed.decisions.length, 7000)
assert.equal(interrupted.complete, false)
assert.equal(resumed.complete, true)
console.log(`verify_inventory_reconciliation: PASS rows=7000 preview_changes=${preview.summary.would_change} apply_changes=${apply.summary.would_change} rerun_changes=${rerun.summary.would_change} resume=${interrupted.decisions.length}+${resumed.decisions.length} sample=${preview.decisions.length}`)
