import { createClient } from '@supabase/supabase-js'
import { classifyOpportunityUniverse, summarizeOpportunityUniverse, type OpportunityUniverseDecision, type UniversePolicy } from '../src/lib/opportunity-universe.ts'
import { canonicalSourcePermissionRows } from '../src/lib/source-permission-truth.ts'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args.set(process.argv[i], process.argv[++i] ?? '')
const apply = args.has('--apply')
if (apply && args.get('--confirm') !== 'YES') throw new Error('APPLY_REQUIRES --apply --confirm YES')
const pageSize = Number(args.get('--page-size') ?? 250)
const maxPages = Number(args.get('--max-pages') ?? 1000)
if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10000) throw new Error('INVALID_BOUNDED_SCAN_ARGUMENT')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_CONFIGURATION_REQUIRED')
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const addCounts = (target: Record<string, number>, value: Record<string, any>) => {
  for (const [key, count] of Object.entries(value)) if (typeof count === 'number') target[key] = (target[key] || 0) + count
}
const totals: Record<string, any> = { examined: 0, lifecycle: {}, source_matching_state: {}, source_matching_operational_state: {}, matching_row_state: {}, professional_readiness: {}, final_matching_state: {}, first_failure: {}, catalog: 0, match_row_ready: 0, seo: 0, alerts: 0, repairable: 0, unknown: 0, per_source: {}, predicted_after: { lifecycle: {}, matching_row_state: {}, final_matching_state: {}, catalog: 0, seo: 0, alerts: 0 } }
const policyResult = await supabase.from('opportunity_sources').select('source,is_enabled,matching_enabled,catalog_enabled,alerts_enabled,seo_enabled')
if (policyResult.error) throw policyResult.error
const policies = (policyResult.data ?? []) as UniversePolicy[]
const observationCutoff = new Date().toISOString()
let cursor: string | null = null
let pages = 0
let reachedEnd = false
const now = new Date()
while (pages < maxPages) {
  let query = supabase.from('opportunities').select('*').order('id', { ascending: true }).limit(pageSize)
  if (cursor) query = query.gt('id', cursor)
  const page = await query
  if (page.error) throw page.error
  const rows = page.data ?? []
  if (!rows.length) { reachedEnd = true; break }
  const ids = rows.map(row => String(row.id))
  const latest = new Map<string, any>()
  let observationOffset = 0
  while (true) {
    const observationResult = await supabase.from('opportunity_source_observations').select('id,opportunity_id,source,identity_status,http_status,observed_at').in('opportunity_id', ids).lte('observed_at', observationCutoff).order('observed_at', { ascending: false }).order('id', { ascending: false }).range(observationOffset, observationOffset + 999)
    if (observationResult.error) throw observationResult.error
    for (const observation of observationResult.data ?? []) if (!latest.has(String(observation.opportunity_id))) latest.set(String(observation.opportunity_id), observation)
    if ((observationResult.data ?? []).length < 1000) break
    observationOffset += 1000
  }
  const priorResult = await supabase.from('opportunity_universe_state').select('opportunity_id,lifecycle_state,lifecycle_reason,provenance').in('opportunity_id', ids)
  if (priorResult.error && apply) throw priorResult.error
  const prior = new Map<string, any>((priorResult.data ?? []).map((item: any) => [String(item.opportunity_id), item]))
  const decisions = rows.map(row => classifyOpportunityUniverse(row, policies, latest.get(String(row.id)), now, undefined, prior.get(String(row.id))))
  const summary = summarizeOpportunityUniverse(decisions)
  const afterDecisions = decisions.map((decision, index) => decision.lifecycle_repair
    ? classifyOpportunityUniverse({ ...rows[index], ...decision.lifecycle_repair, updated_at: now.toISOString() }, policies, latest.get(String(rows[index].id)), now, undefined, decision)
    : decision)
  const afterSummary = summarizeOpportunityUniverse(afterDecisions)
  addCounts(totals.predicted_after.lifecycle, afterSummary.lifecycle)
  for (const decision of afterDecisions) {
    for (const [target, value] of [[totals.predicted_after.matching_row_state, decision.matching_row_state], [totals.predicted_after.final_matching_state, decision.final_matching_state]] as Array<[Record<string, number>, string]>) target[value] = (target[value] || 0) + 1
  }
  totals.predicted_after.catalog += afterSummary.CATALOG_UNIVERSE; totals.predicted_after.seo += afterSummary.SEO_UNIVERSE; totals.predicted_after.alerts += afterSummary.ALERT_UNIVERSE
  totals.examined += rows.length
  addCounts(totals.lifecycle, summary.lifecycle)
  addCounts(totals.first_failure, summary.first_failure)
  totals.catalog += summary.CATALOG_UNIVERSE; totals.match_row_ready += summary.MATCH_ROW_READY; totals.seo += summary.SEO_UNIVERSE; totals.alerts += summary.ALERT_UNIVERSE
  totals.repairable += decisions.filter(item => item.lifecycle_repair).length
  totals.unknown += decisions.filter(item => item.lifecycle_state === 'LIFECYCLE_UNKNOWN' || item.matching_row_state === 'UNKNOWN' || item.source_matching_state === 'UNKNOWN').length
  for (const decision of decisions) {
    for (const [target, value] of [[totals.source_matching_state, decision.source_matching_state], [totals.source_matching_operational_state, decision.source_matching_operational_state], [totals.matching_row_state, decision.matching_row_state], [totals.professional_readiness, decision.professional_readiness], [totals.final_matching_state, decision.final_matching_state]] as Array<[Record<string, number>, string]>) target[value] = (target[value] || 0) + 1
  }
  for (const decision of decisions) {
    const source = String(decision.provenance.source || 'UNKNOWN')
    totals.per_source[source] ??= { total: 0, lifecycle: {}, final: {} }
    totals.per_source[source].total += 1
    totals.per_source[source].lifecycle[decision.lifecycle_state] = (totals.per_source[source].lifecycle[decision.lifecycle_state] || 0) + 1
    totals.per_source[source].final[decision.final_matching_state] = (totals.per_source[source].final[decision.final_matching_state] || 0) + 1
  }
  if (apply) {
    // Apply is delegated to the SQL implementation so future writes and historical
    // reconciliation share exactly one database decision and repair contract.
    const applied = await supabase.rpc('reconcile_opportunity_universe_page', { p_after_id: cursor, p_page_size: pageSize, p_apply: true })
    if (applied.error) throw applied.error
    if (Number(applied.data?.examined) !== rows.length || String(applied.data?.cursor_id) !== String(rows[rows.length - 1].id)) throw new Error('APPLY_PAGE_CURSOR_MISMATCH')
  }
  cursor = String(rows[rows.length - 1].id)
  pages += 1
  if (rows.length < pageSize) { reachedEnd = true; break }
}
if (!cursor) reachedEnd = true
const complete = reachedEnd
let actual_after: any = null
if (apply && complete) {
  const result = await supabase.rpc('get_opportunity_universe_summary')
  if (result.error) throw result.error
  actual_after = result.data
}
console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', complete, pages, page_size: pageSize, cursor_id: cursor, ...totals, actual_after }))
