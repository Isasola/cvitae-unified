/**
 * Read-only, end-of-data routing audit.
 *
 * This intentionally evaluates the same shared truth and effective-policy
 * functions used by product surfaces.  It writes aggregate evidence locally
 * only; it never changes Supabase data or calls an RPC.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import registry from '../src/generated/source-intelligence-registry.json'
import { alertsReadiness, catalogReadiness, jobPostingReadiness, matchingReadiness, seoReadiness } from '../src/lib/opportunity-truth.ts'
import { canonicalSource, evaluateOpportunityDistribution, type PolicyDecision, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'

export const READ_ONLY_METHODS = new Set(['GET', 'HEAD'])
export const PAGE_SIZE = 500
export const SAMPLE_LIMIT = 20
/** Desired truth/routing fields. Production schema is probed once before use. */
export const OPPORTUNITY_COLUMNS = [
  'id', 'slug', 'title', 'organization', 'description', 'requirements', 'tags', 'professional_family',
  'source', 'opportunity_type', 'opportunity_kind', 'type', 'application_url', 'source_url',
  'location', 'city', 'department', 'country_code', 'eligible_countries', 'eligible_regions',
  'remote', 'remote_scope', 'work_arrangement', 'deadline', 'published_at',
  'is_active', 'verification_status', 'catalog_eligible', 'match_eligible', 'alerts_eligible',
  'seo_eligible', 'seo_status', 'jobposting_validity', 'deleted_at', 'archived_at', 'created_at', 'updated_at',
]
export const MANDATORY_COLUMNS = ['id', 'source', 'title']

type Row = Record<string, any>
type Consumer = 'catalog' | 'matching' | 'alerts' | 'seo' | 'jobPosting' | 'googleJobs'
type PageFetcher = (offset: number, size: number) => Promise<Row[]>
type CountFetcher = () => Promise<number | null>

const consumerNames: Consumer[] = ['catalog', 'matching', 'alerts', 'seo', 'jobPosting', 'googleJobs']
const knownSources = new Set(((registry as any).sources || []).map((item: any) => item.canonical_source))

function countValue(value: boolean | null | undefined, bucket: Record<string, number>) {
  if (value === true) bucket.true += 1
  else if (value === false) bucket.false += 1
  else bucket.null += 1
}

function addReason(target: Record<string, number>, reason: string) { target[reason] = (target[reason] || 0) + 1 }
function addSample(target: Record<string, any>, key: string, row: Row, detail: Record<string, any> = {}) {
  const item = target[key] || (target[key] = { count: 0, samples: [] })
  item.count += 1
  if (item.samples.length < SAMPLE_LIMIT) item.samples.push({ id: row.id, source: row.source, slug: row.slug || null, ...detail })
}
function topReasons(reasons: Record<string, number>) { return Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([reason, count]) => ({ reason, count })) }

function storedGate(row: Row, consumer: Consumer): boolean | null {
  if (consumer === 'catalog') return row.catalog_eligible
  if (consumer === 'matching') return row.match_eligible
  if (consumer === 'alerts') return row.alerts_eligible
  if (consumer === 'seo') return row.seo_eligible
  if (row.jobposting_validity === 'valid') return true
  if (row.jobposting_validity === 'incomplete') return false
  return null // not_applicable or not yet classified is not a boolean permission.
}
function storedState(row: Row, consumer: Consumer) {
  return consumer === 'seo' ? { eligible: row.seo_eligible ?? null, status: row.seo_status ?? null }
    : consumer === 'jobPosting' || consumer === 'googleJobs' ? { validity: row.jobposting_validity ?? null }
    : { eligible: storedGate(row, consumer) }
}
function sourceReason(decision: PolicyDecision) {
  return decision.reasons.some(reason => reason === 'SOURCE_POLICY_UNKNOWN' || reason.startsWith('SOURCE_CAPABILITY_') || reason.startsWith('SOURCE_SWITCH_') || reason === 'SOURCE_DISABLED')
}
function sourceUnknown(decision: PolicyDecision) { return decision.reasons.some(reason => reason === 'SOURCE_POLICY_UNKNOWN' || reason === 'SOURCE_CAPABILITY_UNKNOWN' || reason === 'SOURCE_SWITCH_UNKNOWN') }

function emptyConsumerSummary() {
  return {
    total_examined: 0, intrinsic_ready: 0, intrinsic_not_ready: 0, intrinsic_unknown: 0,
    stored_gate: { true: 0, false: 0, null: 0 }, effective_allowed: 0, effective_denied: 0,
    source_denied: 0, source_unknown: 0, row_denied: 0, reason_occurrences: {} as Record<string, number>, top_denial_reasons: [] as any[],
  }
}
function emptySourceSummary() {
  return { total_rows: 0, catalog_allowed: 0, matching_allowed: 0, alerts_allowed: 0, seo_allowed: 0, jobposting_allowed: 0, google_jobs_allowed: 0, denial_reasons: {} as Record<string, number> }
}

export function createAuditAccumulator() {
  return {
    pages: 0, rows_fetched: 0, unique_ids: new Set<string>(), duplicate_ids: new Set<string>(), canonical_sources: new Set<string>(), unknown_sources: new Set<string>(),
    consumers: Object.fromEntries(consumerNames.map(name => [name, emptyConsumerSummary()])) as Record<Consumer, ReturnType<typeof emptyConsumerSummary>>,
    per_source: {} as Record<string, ReturnType<typeof emptySourceSummary>>,
    discrepancies: {} as Record<string, any>,
    lifecycle: { inactive_deleted_or_archived: 0, samples: [] as any[] },
  }
}

/**
 * Keeps schema drift visible without turning optional absent data into a
 * failed audit. The selected list is the only list issued against production.
 */
export function selectColumnsForProduction(desired: string[], available: string[]) {
  const actual = new Set(available)
  const missingMandatory = MANDATORY_COLUMNS.filter(column => !actual.has(column))
  if (missingMandatory.length) throw new Error(`production_schema_missing_mandatory:${missingMandatory.join(',')}`)
  return {
    desired_columns: [...desired], available_columns: [...available].sort(),
    missing_columns: desired.filter(column => !actual.has(column)),
    selected_columns: desired.filter(column => actual.has(column)),
  }
}

/** Executes real shared readiness + effective distribution functions for one row. */
export function accountRoutingRow(acc: ReturnType<typeof createAuditAccumulator>, row: Row, policies: SourcePolicyRow[]) {
  const canonical = canonicalSource(row.source)
  const known = knownSources.has(canonical)
  const effective = evaluateOpportunityDistribution(row, policies)
  const readiness = {
    catalog: catalogReadiness(row), matching: matchingReadiness(row), alerts: alertsReadiness(row),
    seo: seoReadiness(row), jobPosting: jobPostingReadiness(row), googleJobs: jobPostingReadiness(row),
  }
  const decisions: Record<Consumer, PolicyDecision> = {
    catalog: effective.catalog, matching: effective.matching, alerts: effective.alerts, seo: effective.seo, jobPosting: effective.jobPosting, googleJobs: effective.googleJobs,
  }
  acc.canonical_sources.add(canonical)
  if (!known || !effective.policyFound) { acc.unknown_sources.add(String(row.source || '')); addSample(acc.discrepancies, 'unknown_policy_or_identity', row, { canonical_source: canonical }) }
  const source = acc.per_source[canonical] || (acc.per_source[canonical] = emptySourceSummary())
  source.total_rows += 1
  if (row.is_active !== true || row.deleted_at || row.archived_at) {
    acc.lifecycle.inactive_deleted_or_archived += 1
    if (acc.lifecycle.samples.length < SAMPLE_LIMIT) acc.lifecycle.samples.push({ id: row.id, source: row.source, deleted_at: row.deleted_at || null, archived_at: row.archived_at || null, is_active: row.is_active })
  }
  for (const consumer of consumerNames) {
    const summary = acc.consumers[consumer]; const intrinsic = readiness[consumer]; const decision = decisions[consumer]; const gate = storedGate(row, consumer)
    summary.total_examined += 1
    if (intrinsic.state === 'READY') summary.intrinsic_ready += 1
    else if (intrinsic.state === 'UNKNOWN') summary.intrinsic_unknown += 1
    else summary.intrinsic_not_ready += 1
    countValue(gate, summary.stored_gate)
    if (decision.allowed) {
      summary.effective_allowed += 1; (source as any)[`${consumer === 'jobPosting' ? 'jobposting' : consumer === 'googleJobs' ? 'google_jobs' : consumer}_allowed`] += 1
      // This auditor deliberately does not crawl or invoke downstream HTTP
      // surfaces.  Keep that evidence gap explicit instead of calling a row
      // routable merely because the decision core allowed it.
      addSample(acc.discrepancies, 'effective_allowed_downstream_not_verified', row, { consumer })
    }
    else {
      summary.effective_denied += 1
      const sourceBlocked = sourceReason(decision)
      if (sourceBlocked) source.denial_reasons = decision.reasons.reduce((target: Record<string, number>, reason) => (addReason(target, reason), target), source.denial_reasons)
      if (sourceBlocked) summary.source_denied += 1
      if (sourceUnknown(decision)) summary.source_unknown += 1
      if (decision.reasons.some(reason => !reason.startsWith('SOURCE_'))) summary.row_denied += 1
      for (const reason of decision.reasons) addReason(summary.reason_occurrences, reason)
    }
    if (intrinsic.state === 'READY' && gate === false) addSample(acc.discrepancies, 'intrinsic_ready_stored_gate_false', row, { consumer, stored: storedState(row, consumer), reasons: decision.reasons })
    if (intrinsic.state !== 'READY' && gate === true) addSample(acc.discrepancies, 'stored_gate_true_intrinsic_not_ready', row, { consumer, intrinsic: intrinsic.state, reasons: intrinsic.reasons })
    if (gate === true && !decision.allowed && sourceReason(decision)) addSample(acc.discrepancies, 'stored_gate_true_source_denied', row, { consumer, reasons: decision.reasons })
    if (intrinsic.state === 'READY' && decision.capabilityState === 'ALLOWED' && decision.adminSwitchState === 'ENABLED' && !decision.allowed) addSample(acc.discrepancies, 'intrinsic_ready_source_permitted_stored_gate_denied', row, { consumer, stored: storedState(row, consumer), reasons: decision.reasons })
  }
  if (effective.catalog.allowed && !effective.seo.allowed) addSample(acc.discrepancies, 'catalog_allowed_seo_denied', row, { reasons: effective.seo.reasons })
  if (effective.matching.allowed && !effective.alerts.allowed) addSample(acc.discrepancies, 'matching_allowed_alerts_denied', row, { reasons: effective.alerts.reasons })
  if (readiness.seo.state === 'READY' && readiness.jobPosting.state !== 'READY') addSample(acc.discrepancies, 'seo_ready_jobposting_not_ready', row, { jobposting_reasons: readiness.jobPosting.reasons })
  return { canonical, effective, readiness }
}

export async function auditEndOfData(options: { fetchPage: PageFetcher; policies: SourcePolicyRow[]; pageSize?: number; startCount?: CountFetcher; endCount?: CountFetcher; schema?: ReturnType<typeof selectColumnsForProduction> }) {
  const acc = createAuditAccumulator(); const size = options.pageSize || PAGE_SIZE
  const expected_start_rows = await options.startCount?.() ?? null
  for (let offset = 0; ; offset += size) {
    const page = await options.fetchPage(offset, size)
    acc.pages += 1
    for (const row of page) {
      acc.rows_fetched += 1
      const id = String(row.id || '')
      if (!id || acc.unique_ids.has(id)) { if (id) acc.duplicate_ids.add(id); continue }
      acc.unique_ids.add(id); accountRoutingRow(acc, row, options.policies)
    }
    if (page.length < size) break
  }
  const expected_end_rows = await options.endCount?.() ?? null
  for (const summary of Object.values(acc.consumers)) summary.top_denial_reasons = topReasons(summary.reason_occurrences)
  const perSourceTotal = Object.values(acc.per_source).reduce((sum, item) => sum + item.total_rows, 0)
  const consumers = Object.fromEntries(Object.entries(acc.consumers).map(([name, summary]) => [name, {
    ...summary,
    accounting: { examined: summary.total_examined, allowed_plus_denied: summary.effective_allowed + summary.effective_denied, passes: summary.total_examined === summary.effective_allowed + summary.effective_denied },
  }]))
  const downstream = {
    catalog: 'IMPLEMENTED_PUBLIC_OPPORTUNITIES_BOUNDARY', matching: 'IMPLEMENTED_MATCH_BATCH', alerts: 'IMPLEMENTED_SEND_HIGH_MATCH_ALERTS', seo: 'IMPLEMENTED_SEO_INVENTORY_SITEMAP', jobPosting: 'IMPLEMENTED_PAGE_STRUCTURED_DATA', googleJobs: 'IMPLEMENTED_EFFECTIVE_POLICY_DECISION',
    reachability_evidence: 'NOT_VERIFIED_BY_READ_ONLY_ROW_AUDIT',
  }
  return {
    schema_version: 'real-effective-routing-audit:v1', evidence_level: 'READ_ONLY_REAL_DATA', generated_at: new Date().toISOString(),
    inventory: { pages: acc.pages, rows: acc.rows_fetched, unique: acc.unique_ids.size, duplicates: acc.duplicate_ids.size, canonical_sources: [...acc.canonical_sources].sort(), unknown_sources: [...acc.unknown_sources].sort(), expected_start_rows, expected_end_rows },
    schema: options.schema || { desired_columns: [...OPPORTUNITY_COLUMNS], available_columns: [], missing_columns: [], selected_columns: [...OPPORTUNITY_COLUMNS] },
    consumers, per_source: acc.per_source, discrepancies: acc.discrepancies, lifecycle: acc.lifecycle,
    aeo_state: { state: 'NOT_IMPLEMENTED', evidence: 'approval-bus ProposalKind includes FAQ_AEO; no dedicated effective routing consumer exists' },
    geo_state: { state: 'DERIVED_FROM_EXISTING_SURFACE', evidence: 'eligibility and geographic truth feed catalog/matching surfaces; no dedicated GEO distribution policy consumer exists' },
    admin_state: { state: 'DERIVED_FROM_EXISTING_SURFACE', evidence: 'admin-data source_intelligence_snapshot and reconciliation use DB/dashboard plus reconcileInventoryRows; it is not this public routing projection' },
    downstream, accounting_checks: {
      rows_equal_unique: acc.rows_fetched === acc.unique_ids.size,
      duplicate_ids: acc.duplicate_ids.size,
      per_source_total: perSourceTotal,
      per_source_equals_examined: perSourceTotal === acc.unique_ids.size,
      pagination_terminal: true,
      pagination_snapshot_stable: expected_start_rows === null || expected_end_rows === null ? 'UNKNOWN' : expected_start_rows === expected_end_rows && expected_start_rows === acc.rows_fetched,
      unexplained_rows: acc.rows_fetched - acc.unique_ids.size,
    },
  }
}

function readonlyFetch(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (!READ_ONLY_METHODS.has(method)) throw new Error(`read_only_http_method_required:${method}`)
  return fetch(input, init)
}
function policyBaseline() {
  const path = resolve('generated/production-source-policy-readonly.json')
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')); const rows = parsed.policies || parsed
    if (!Array.isArray(rows) || rows.length !== 34) throw new Error('baseline must contain exactly 34 policy rows')
    return rows as SourcePolicyRow[]
  } catch (error: any) { throw new Error(`read_only_policy_baseline_unavailable:${error?.message || 'unknown'}`) }
}
function requireReadonlyEnvironment() {
  if (process.env.CVITAE_REAL_AUDIT_READ_ONLY !== '1') throw new Error('set_CVITAE_REAL_AUDIT_READ_ONLY_1_to_execute')
  const url = process.env.SUPABASE_READONLY_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_READONLY_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('read_only_credentials_missing: set SUPABASE_READONLY_URL/KEY or existing read credentials')
  return { url, key }
}
function readonlyClient(): SupabaseClient {
  const { url, key } = requireReadonlyEnvironment()
  return createClient(url, key, { global: { fetch: readonlyFetch } })
}
async function probeProductionSchema(db: SupabaseClient) {
  // One GET-only probe. We intentionally derive the production field list
  // from the returned row rather than retrying missing columns individually.
  const { data, error } = await db.from('opportunities').select('*').limit(1)
  if (error) throw error
  const row = data?.[0]
  if (!row || typeof row !== 'object') throw new Error('production_schema_probe_empty')
  return selectColumnsForProduction(OPPORTUNITY_COLUMNS, Object.keys(row))
}
function writeArtifacts(report: any) {
  const jsonPath = resolve('generated/real-effective-routing-audit.json'); const markdownPath = resolve('generated/real-effective-routing-audit.md')
  mkdirSync(dirname(jsonPath), { recursive: true }); writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  const consumerLines = Object.entries(report.consumers).map(([name, summary]: any) => `| ${name} | ${summary.total_examined} | ${summary.intrinsic_ready} | ${summary.effective_allowed} | ${summary.effective_denied} |`).join('\n')
  writeFileSync(markdownPath, `# Real effective routing audit\n\nEvidence: ${report.evidence_level}. No full opportunity payload is retained.\n\n- Pages: ${report.inventory.pages}\n- Rows / unique / duplicates: ${report.inventory.rows} / ${report.inventory.unique} / ${report.inventory.duplicates}\n- Canonical sources: ${report.inventory.canonical_sources.length}\n- Unknown source identities/policies: ${report.inventory.unknown_sources.length}\n- Pagination stability: ${report.accounting_checks.pagination_snapshot_stable}\n- Missing optional production columns: ${report.schema.missing_columns.join(', ') || 'none'}\n\n| Consumer | Examined | Intrinsic ready | Allowed | Denied |\n|---|---:|---:|---:|---:|\n${consumerLines}\n\nAEO: ${report.aeo_state.state}. GEO: ${report.geo_state.state}. Admin: ${report.admin_state.state}.\n`, 'utf8')
}

async function main() {
  const policies = policyBaseline(); const db = readonlyClient(); const schema = await probeProductionSchema(db)
  const count = async () => { const { count, error } = await db.from('opportunities').select('id', { count: 'exact', head: true }); if (error) throw error; return count ?? 0 }
  const report = await auditEndOfData({ policies, startCount: count, endCount: count, fetchPage: async (offset, size) => {
    const { data, error } = await db.from('opportunities').select(schema.selected_columns.join(',')).order('id', { ascending: true }).range(offset, offset + size - 1)
    if (error) throw error; return data || []
  }, schema })
  writeArtifacts(report)
  console.log(`real_effective_routing_audit: PASS pages=${report.inventory.pages} rows=${report.inventory.rows} unique=${report.inventory.unique}`)
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) main().catch(error => { console.error(`real_effective_routing_audit: FAIL ${error.message}`); process.exitCode = 1 })
