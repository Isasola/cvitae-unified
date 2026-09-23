/**
 * Cross-runtime parity contract. TS executes the historical/future shared
 * truth. `sqlGateContract` is the exact SQL trigger expression expressed over
 * the same fixture cases; static assertions pin those expressions in the
 * unapplied migration so either implementation drifting fails RC verification.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deadlineLifecycle, intrinsicRoutingGates } from '../src/lib/opportunity-truth.ts'
import { evaluateOpportunityDistribution, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'
import { buildEffectiveSeoInventory } from '../src/lib/seo-inventory.ts'
import { collectAllowedPages } from '../netlify/functions/lib/public-opportunity-pagination.ts'
import { buildDictionary } from '../supabase/functions/_shared/matching.ts'
import { rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'

type Row = Record<string, any>
const fixture = JSON.parse(readFileSync(resolve('scripts/fixtures/intrinsic-routing-parity.json'), 'utf8'))
const materializeDeadline = (row: Row): Row => row.deadline === '__TODAY__'
  ? { ...row, deadline: new Date().toISOString().slice(0, 10) }
  : row

const sqlGateContract = (row: Row) => {
  const catalog = (row.is_active ?? true) === true
    && (!row.verification_status || row.verification_status === 'verified')
    && !row.deleted_at && !row.archived_at
    && deadlineLifecycle(row.deadline) !== 'EXPIRED'
    && Boolean(String(row.title || '').trim()) && Boolean(String(row.slug || '').trim())
  const titleSpecific = String(row.title || '').trim().split(/\s+/).length >= 2
  const tags = Array.isArray(row.tags) ? row.tags.filter((tag: unknown) => Boolean(String(tag || '').trim())).length : 0
  const matching = catalog && titleSpecific && (
    String(row.description || '').trim().length >= 100 || String(row.requirements || '').trim().length >= 60 || tags >= 2 || Boolean(String(row.professional_family || '').trim())
  )
  const seo = catalog && String(row.description || '').trim().length >= 100 && Boolean(String(row.organization || '').trim())
  return { catalog_eligible: catalog, match_eligible: matching, alerts_eligible: matching, seo_eligible: seo }
}

for (const entry of fixture.cases as Array<{ id: string; row: Row; expected: Record<string, boolean>; deadline_state?: string }>) {
  const row = materializeDeadline(entry.row)
  const ts = intrinsicRoutingGates(row).proposed
  const sql = sqlGateContract(row)
  if (entry.deadline_state) assert.equal(deadlineLifecycle(row.deadline), entry.deadline_state, `deadline:${entry.id}`)
  const expected = {
    catalog_eligible: entry.expected.catalog, match_eligible: entry.expected.matching,
    alerts_eligible: entry.expected.alerts, seo_eligible: entry.expected.seo,
  }
  assert.deepEqual(ts, expected, `TS:${entry.id}`)
  assert.deepEqual(sql, expected, `SQL-contract:${entry.id}`)
  assert.deepEqual(sql, ts, `parity:${entry.id}`)
}

const migration = readFileSync(resolve('supabase/migrations/202609220001_future_opportunity_intrinsic_routing_gates.sql'), 'utf8')
for (const token of [
  "coalesce(new.is_active, true) is true", "nullif(trim(coalesce(new.verification_status, '')), '') is null or new.verification_status = 'verified'",
  "v_deadline_text := nullif(trim(new.deadline), '')",
  "v_deadline_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'",
  "v_deadline_date < (now() at time zone 'UTC')::date",
  "v_deadline_text ~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$'",
  "v_deadline_instant := v_deadline_text::timestamptz",
  "and not v_deadline_expired",
  "length(trim(coalesce(to_jsonb(new)->>'requirements', ''))) >= 60",
  "to_jsonb(new)->>'professional_family'", "unnest(coalesce(new.tags, '{}'::text[]))",
  "new.catalog_eligible := v_catalog_ready", "new.match_eligible := v_matching_ready",
  "new.alerts_eligible := v_matching_ready", "new.seo_eligible := v_seo_ready",
]) assert(migration.includes(token), `migration contract missing: ${token}`)
assert(!migration.includes('new.deadline >= now()'), 'text deadline must not be compared directly with now()')
assert(!/new\.deadline\s*::\s*(date|timestamptz)/.test(migration), 'raw deadline text must not be blindly cast')
assert(!migration.includes('source_policy.matching_enabled'))
assert(!migration.includes('source_policy.seo_enabled'))

const policy = (source: string, extra: Partial<SourcePolicyRow> = {}): SourcePolicyRow => ({ source, is_enabled: true, catalog_enabled: false, matching_enabled: false, alerts_enabled: false, seo_enabled: false, web_catalog_allowed: false, search_engine_indexing_allowed: null, google_jobs_distribution_allowed: false, ...extra })
const ready = { ...fixture.cases.find((item: any) => item.id === 'good-complete').row, id: 'ready', source: 'computrabajo', eligible_countries: ['py'], catalog_eligible: false, match_eligible: false, alerts_eligible: false, seo_eligible: false }
const reconciled = { ...ready, ...intrinsicRoutingGates(ready).proposed }
const ordinary = evaluateOpportunityDistribution(reconciled, [policy('computrabajo')])
assert(ordinary.catalog.allowed && ordinary.matching.allowed && ordinary.alerts.allowed && ordinary.seo.allowed)
const profile = { professional_title: 'Programme Officer International Development', profile_data: { habilidades: ['programme management', 'monitoring'], seniority: 'mid', location: 'Paraguay' } }
const ranked = rankOpportunitiesV2(profile as any, [reconciled], buildDictionary([]), V2_PRESET_FULL)
assert.equal(ranked.eligible.length, 1, 'matching consumes the reconciled match gate plus intrinsic evidence')
assert.equal([reconciled].filter(row => row.alerts_eligible === true).length, 1, 'alert request filter sees reconciled alert gate')
assert.equal(buildEffectiveSeoInventory([reconciled], [policy('computrabajo')]).length, 1, 'SEO sees reconciled ordinary row')
const himalayas = evaluateOpportunityDistribution({ ...reconciled, source: 'himalayas' }, [policy('himalayas')])
assert(himalayas.catalog.allowed && himalayas.matching.allowed && himalayas.alerts.allowed)
assert(!himalayas.seo.allowed && !himalayas.jobPosting.allowed && !himalayas.googleJobs.allowed)
const thin = { ...reconciled, ...fixture.cases.find((item: any) => item.id === 'thin-description').row }
const thinDecision = evaluateOpportunityDistribution(thin, [policy('computrabajo')])
assert(thinDecision.catalog.allowed && !thinDecision.matching.allowed && !thinDecision.seo.allowed)

// Same public helper, over multiple raw pages, proves stale false gates do not
// hide an otherwise-ready row and pagination still terminates at target/end.
const raw = [
  ...Array.from({ length: 450 }, (_, index) => ({ ...thin, id: `denied-${index}`, slug: `denied-${index}`, title: '' })),
  ...Array.from({ length: 3 }, (_, index) => ({ ...ready, id: `ready-${index}`, slug: `ready-${index}` })),
]
const offsets: number[] = []
const publicRows = await collectAllowedPages({ target: 3, pageSize: 100, fetchPage: async (offset, size) => { offsets.push(offset); return raw.slice(offset, offset + size) }, allowed: row => evaluateOpportunityDistribution(row, [policy('computrabajo')]).catalog.allowed })
assert.equal(publicRows.length, 3); assert(offsets.length >= 5); assert.equal(publicRows[0].id, 'ready-0')
console.log(`verify_intrinsic_routing_parity: PASS cases=${fixture.cases.length} pages=${offsets.length} consumers=public+matching+alerts+seo himalayas=internal_only`)
