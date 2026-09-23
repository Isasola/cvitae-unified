import { evaluateOpportunityDistribution, type SourcePolicyRow } from './effective-source-policy'
import { intrinsicRoutingGates, jobPostingReadiness } from './opportunity-truth'

export type ReconciliationRow = Record<string, any>
export type ReconciliationDecision = {
  id: string
  canonical_source: string
  catalog: { state: string; allowed: boolean; reasons: string[] }
  matching: { state: string; allowed: boolean; reasons: string[] }
  alerts: { state: string; allowed: boolean; reasons: string[] }
  seo: { state: string; allowed: boolean; reasons: string[] }
  jobPosting: { state: string; allowed: boolean; reasons: string[] }
  embedding: 'READY' | 'PENDING' | 'FAILED' | 'NOT_REQUIRED'
  alerts_allowed: boolean
  google_jobs_allowed: boolean
  current: Record<string, any>
  proposed: Record<string, any>
  changed_fields: string[]
}

/** Read-only row evaluation for dry-run, resumable reconciliation and Admin. */
export function reconcileInventoryRows(rows: ReconciliationRow[], policies: SourcePolicyRow[]): ReconciliationDecision[] {
  return rows.map(row => {
    const effective = evaluateOpportunityDistribution(row, policies)
    const intrinsic = intrinsicRoutingGates(row)
    const { catalog, matching, alerts, seo, proposed } = intrinsic
    const jobPosting = jobPostingReadiness(row)
    const embedding = matching.state !== 'READY' ? 'NOT_REQUIRED' : row.embedding ? 'READY' : row.embedding_error ? 'FAILED' : 'PENDING'
    // Row eligibility is derived from row truth and lifecycle only. Source
    // permissions remain in the effective decisions and never bulk-promote rows.
    const current = Object.fromEntries(Object.keys(proposed).map(key => [key, row[key]]))
    const changed_fields = Object.keys(proposed).filter(key => current[key] !== proposed[key])
    return {
      id: String(row.id), canonical_source: effective.canonicalSource,
      catalog: { state: catalog.state, allowed: effective.catalog.allowed, reasons: effective.catalog.reasons },
      matching: { state: matching.state, allowed: effective.matching.allowed, reasons: effective.matching.reasons },
      alerts: { state: alerts.state, allowed: effective.alerts.allowed, reasons: effective.alerts.reasons },
      seo: { state: seo.state, allowed: effective.seo.allowed, reasons: effective.seo.reasons },
      jobPosting: { state: jobPosting.state, allowed: effective.jobPosting.allowed, reasons: effective.jobPosting.reasons },
      embedding, alerts_allowed: effective.alerts.allowed, google_jobs_allowed: effective.googleJobs.allowed,
      current, proposed, changed_fields,
    }
  })
}

export function reconciliationSummary(decisions: ReconciliationDecision[]) {
  const count = (predicate: (item: ReconciliationDecision) => boolean) => decisions.filter(predicate).length
  const reasons = new Map<string, number>()
  for (const decision of decisions) for (const reason of [
    ...decision.catalog.reasons, ...decision.matching.reasons, ...decision.seo.reasons, ...decision.jobPosting.reasons,
  ]) reasons.set(reason, (reasons.get(reason) || 0) + 1)
  return {
    total_examined: decisions.length, would_change: count(item => item.changed_fields.length > 0), unchanged: count(item => item.changed_fields.length === 0), failed: 0,
    catalog_ready: count(item => item.catalog.state === 'READY'),
    matching_ready: count(item => item.matching.state === 'READY'),
    alerts_ready: count(item => item.alerts.state === 'READY'),
    seo_ready: count(item => item.seo.state === 'READY'),
    jobposting_ready: count(item => item.jobPosting.state === 'READY'),
    embedding_ready: count(item => item.embedding === 'READY'),
    embedding_pending: count(item => item.embedding === 'PENDING'),
    embedding_failed: count(item => item.embedding === 'FAILED'), embedding_not_required: count(item => item.embedding === 'NOT_REQUIRED'),
    catalog_allowed: count(item => item.catalog.allowed),
    matching_allowed: count(item => item.matching.allowed),
    seo_allowed: count(item => item.seo.allowed),
    alerts_allowed: count(item => item.alerts_allowed),
    google_jobs_allowed: count(item => item.google_jobs_allowed),
    top_reason_codes: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([reason, count]) => ({ reason, count })),
  }
}

export function mergeReconciliationSummaries(items: Array<ReturnType<typeof reconciliationSummary>>) {
  const total: any = { total_examined: 0, would_change: 0, unchanged: 0, failed: 0, catalog_ready: 0, matching_ready: 0, alerts_ready: 0, seo_ready: 0, jobposting_ready: 0, embedding_ready: 0, embedding_pending: 0, embedding_failed: 0, embedding_not_required: 0, catalog_allowed: 0, matching_allowed: 0, seo_allowed: 0, alerts_allowed: 0, google_jobs_allowed: 0 }
  const reasons = new Map<string, number>()
  for (const item of items) {
    for (const key of Object.keys(total)) total[key] += Number((item as any)[key] || 0)
    for (const entry of item.top_reason_codes) reasons.set(entry.reason, (reasons.get(entry.reason) || 0) + entry.count)
  }
  total.top_reason_codes = [...reasons.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([reason,count]) => ({reason,count}))
  return total
}

export async function reconcilePaged<T extends ReconciliationRow>(options: {
  pageSize: number; cursor?: number; fetchPage: (cursor: number, size: number) => Promise<T[]>; policies: SourcePolicyRow[]
  apply?: (row: T, proposed: Record<string, any>) => Promise<void>; maxPages?: number; decisionLimit?: number
}) {
  let cursor = options.cursor || 0; let pages = 0; let reachedEnd = false
  const decisions: ReconciliationDecision[] = []; const summaries: Array<ReturnType<typeof reconciliationSummary>> = []
  while (true) {
    const page = await options.fetchPage(cursor, options.pageSize)
    if (!page.length) { reachedEnd = true; break }
    const planned = reconcileInventoryRows(page, options.policies)
    if (options.apply) for (let index = 0; index < page.length; index++) if (planned[index].changed_fields.length) await options.apply(page[index], planned[index].proposed)
    summaries.push(reconciliationSummary(planned))
    const remaining = options.decisionLimit === undefined ? planned.length : Math.max(0, options.decisionLimit - decisions.length)
    if (remaining) decisions.push(...planned.slice(0, remaining))
    cursor += page.length; pages += 1
    if (page.length < options.pageSize) { reachedEnd = true; break }
    if (options.maxPages && pages >= options.maxPages) break
  }
  return { cursor, pages, decisions, summary: mergeReconciliationSummaries(summaries), complete: reachedEnd }
}

/**
 * Stateful, bounded-chunk apply orchestration. Preview metrics are inputs only
 * and are never merged into the returned APPLY counters. Consumers persist the
 * supplied checkpoint after every page and may resume from it after a failure.
 */
export async function orchestrateReconciliationApply<T extends ReconciliationRow>(options: {
  pageSize: number; cursor?: number; fetchPage: (cursor: number, size: number) => Promise<T[]>; policies: SourcePolicyRow[]
  apply: (row: T, proposed: Record<string, any>) => Promise<void>
  checkpoint?: (state: { cursor: number; pages: number; summary: ReturnType<typeof reconciliationSummary>; status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' }) => Promise<void> | void
  interruptAfterPages?: number
}) {
  let cursor = options.cursor || 0; let pages = 0; const summaries: Array<ReturnType<typeof reconciliationSummary>> = []
  try {
    while (true) {
      const page = await options.fetchPage(cursor, options.pageSize)
      if (!page.length) {
        const summary = mergeReconciliationSummaries(summaries)
        await options.checkpoint?.({ cursor, pages, summary, status: 'SUCCESS' })
        return { cursor, pages, summary, status: 'SUCCESS' as const }
      }
      const decisions = reconcileInventoryRows(page, options.policies)
      for (let index = 0; index < page.length; index++) if (decisions[index].changed_fields.length) await options.apply(page[index], decisions[index].proposed)
      summaries.push(reconciliationSummary(decisions)); cursor += page.length; pages += 1
      const summary = mergeReconciliationSummaries(summaries)
      if (page.length < options.pageSize) {
        await options.checkpoint?.({ cursor, pages, summary, status: 'SUCCESS' })
        return { cursor, pages, summary, status: 'SUCCESS' as const }
      }
      if (options.interruptAfterPages && pages >= options.interruptAfterPages) {
        await options.checkpoint?.({ cursor, pages, summary, status: 'PARTIAL' })
        return { cursor, pages, summary, status: 'PARTIAL' as const }
      }
      await options.checkpoint?.({ cursor, pages, summary, status: 'RUNNING' })
    }
  } catch (error) {
    const summary = mergeReconciliationSummaries(summaries)
    await options.checkpoint?.({ cursor, pages, summary, status: 'PARTIAL' })
    return { cursor, pages, summary, status: 'PARTIAL' as const, error }
  }
}
