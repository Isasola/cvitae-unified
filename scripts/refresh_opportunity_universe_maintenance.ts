import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { maintenanceCompletion, maintenanceIsStalled, nextNoProgressWindows, parseDirtyRefreshResponse, parseDueRefreshCount } from '../shared/opportunity-universe-maintenance.ts'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_CONFIGURATION_REQUIRED')

const rpcTimeoutMs = 20_000
const timeoutFetch: typeof fetch = (input, init = {}) => fetch(input, {
  ...init,
  signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(rpcTimeoutMs)]) : AbortSignal.timeout(rpcTimeoutMs),
})
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timeoutFetch } })
const canaryOnly = process.argv.includes('--canary')
const dueLimit = canaryOnly ? 0 : 500
const dirtySourceLimit = 1
const maxDirtyBatches = canaryOnly ? 1 : 8
const maxRuntimeMs = 7 * 60 * 1000
const startedAtMs = Date.now()
const previousProgressPath = process.env.UNIVERSE_PREVIOUS_STATE_PATH
const previousStateFile = previousProgressPath ? join(previousProgressPath, 'universe-maintenance-progress.json') : ''
let previousNoProgressWindows: number | null = null
if (previousStateFile && existsSync(previousStateFile)) {
  try {
    const previous = JSON.parse(readFileSync(previousStateFile, 'utf8')) as Record<string, unknown>
    if (previous.schema === 'cvitae.universe-maintenance-progress.v1'
      && typeof previous.consecutive_no_progress_windows === 'number'
      && Number.isInteger(previous.consecutive_no_progress_windows)
      && previous.consecutive_no_progress_windows >= 0) {
      previousNoProgressWindows = previous.consecutive_no_progress_windows
    }
  } catch {
    previousNoProgressWindows = null
  }
}
const cursorSignature = (value: unknown): string | null => value == null ? null : createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
const result = {
  owner: 'common-opportunity-universe-maintenance',
  status: 'ERROR' as 'COMPLETE' | 'RESUMABLE' | 'ERROR',
  sources_processed: 0,
  opportunities_recalculated: 0,
  batches_processed: 0,
  batch_progress: [] as Array<{ batch: number; sources_refreshed: number; opportunities_refreshed: number; pending_sources: number }>,
  pending_sources: 0,
  pending_source_sample: [] as Array<{ canonical_source: string; queued_at: string; reason: string; cursor_signature: string | null }>,
  source_page_progress: [] as Array<{ source_hint: string; page_rows: number; sources_completed: number; cursor_before_signature: string | null; cursor_after_signature: string | null; cursor_state: 'ADVANCED' | 'SOURCE_COMPLETED' | 'UNCHANGED_OR_CONCURRENT' }>,
  oldest_pending_queued_at: null as string | null,
  oldest_pending_age_seconds: null as number | null,
  progress_units: 0,
  consecutive_no_progress_windows: 0,
  previous_progress_state: previousNoProgressWindows === null ? 'UNAVAILABLE_OR_FIRST_WINDOW' : 'READ_FROM_PRIOR_WORKFLOW_ARTIFACT',
  stalled: false,
  stalled_reason: 'NOT_ASSESSED',
  pending_rows_estimate_by_source: 'NOT_EXPOSED_BY_CURRENT_RPC',
  pending_rows_estimate_reason: 'The durable SQL queue exposes source and cursor, but not a safe per-source remaining-row aggregate.',
  retries: 0,
  continuation_required: false,
  error_code: null as string | null,
  due_rows_refreshed: 0,
  elapsed_ms: 0,
  stop_reason: null as string | null,
  bounds: { due_limit: dueLimit, dirty_source_limit: dirtySourceLimit, max_dirty_batches: maxDirtyBatches, expected_page_size: 250, rpc_timeout_ms: rpcTimeoutMs, max_runtime_ms: maxRuntimeMs, max_dirty_rows_per_run: maxDirtyBatches * 250 },
}

try {
  const rpcWithRetry = async (name: string, args: Record<string, number>) => {
    let lastError: any
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await supabase.rpc(name, args)
      if (!response.error) return response.data
      lastError = response.error
      if (attempt < 1) {
        result.retries += 1
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    throw lastError
  }
  if (dueLimit > 0) {
    if (Date.now() - startedAtMs >= maxRuntimeMs) throw new Error('RUNTIME_BUDGET_EXHAUSTED_BEFORE_DUE_REFRESH')
    const due = await rpcWithRetry('refresh_due_opportunity_universe', { p_limit: dueLimit })
    result.due_rows_refreshed = parseDueRefreshCount(due)
  }

  for (let batch = 0; batch < maxDirtyBatches; batch++) {
    if (Date.now() - startedAtMs >= maxRuntimeMs) {
      result.stop_reason = 'RUNTIME_BUDGET_EXHAUSTED'
      break
    }
    const next = await supabase.from('opportunity_universe_dirty_sources')
      .select('canonical_source,cursor_id').order('queued_at', { ascending: true }).order('canonical_source', { ascending: true }).limit(1)
    if (next.error) throw next.error
    const hint = next.data?.[0]
    if (!hint) break
    const data = await rpcWithRetry('refresh_dirty_opportunity_universe_sources', { p_limit: dirtySourceLimit })
    const response = parseDirtyRefreshResponse(data)
    const { pending_sources: pending, sources_refreshed: sources, opportunities_refreshed: opportunities } = response

    result.batches_processed += 1
    result.sources_processed += sources
    result.opportunities_recalculated += opportunities
    result.pending_sources = pending
    result.batch_progress.push({ batch: batch + 1, sources_refreshed: sources, opportunities_refreshed: opportunities, pending_sources: pending })
    const after = await supabase.from('opportunity_universe_dirty_sources')
      .select('cursor_id').eq('canonical_source', hint.canonical_source).limit(1)
    if (after.error) throw after.error
    const afterCursor = after.data?.[0]?.cursor_id ?? null
    const completed = !after.data?.length && sources > 0
    const advanced = afterCursor !== null && afterCursor !== hint.cursor_id
    result.source_page_progress.push({
      source_hint: hint.canonical_source,
      page_rows: opportunities,
      sources_completed: sources,
      cursor_before_signature: cursorSignature(hint.cursor_id),
      cursor_after_signature: cursorSignature(afterCursor),
      cursor_state: completed ? 'SOURCE_COMPLETED' : advanced ? 'ADVANCED' : 'UNCHANGED_OR_CONCURRENT',
    })
    result.progress_units += opportunities + sources
    if (pending === 0) break
  }

  const pending = await supabase.from('opportunity_universe_dirty_sources')
    .select('canonical_source,queued_at,reason,cursor_id', { count: 'exact' }).order('queued_at', { ascending: true }).limit(25)
  if (pending.error) throw pending.error
  result.pending_source_sample = (pending.data ?? []).map(row => ({ canonical_source: row.canonical_source, queued_at: row.queued_at, reason: row.reason, cursor_signature: cursorSignature(row.cursor_id) }))
  result.pending_sources = pending.count ?? result.pending_sources
  result.oldest_pending_queued_at = result.pending_source_sample[0]?.queued_at ?? null
  result.oldest_pending_age_seconds = result.oldest_pending_queued_at
    ? Math.max(0, Math.floor((Date.now() - Date.parse(result.oldest_pending_queued_at)) / 1000))
    : null
  result.consecutive_no_progress_windows = nextNoProgressWindows(previousNoProgressWindows, result.progress_units > 0)
  result.stalled = maintenanceIsStalled(result.pending_sources, result.oldest_pending_age_seconds, result.consecutive_no_progress_windows)
  result.stalled_reason = result.stalled
    ? 'NO_PROGRESS_IN_TWO_OR_MORE_CONSECUTIVE_WINDOWS_WITH_OLD_PENDING_QUEUE'
    : result.progress_units > 0 ? 'PROGRESS_OBSERVED_THIS_WINDOW'
      : result.pending_sources > 0 ? 'ONE_OR_FEWER_NO_PROGRESS_WINDOWS; STALL_NOT_CONFIRMED'
        : 'NO_PENDING_SOURCES'
  result.elapsed_ms = Date.now() - startedAtMs
  if (result.pending_sources > 0 && !result.stop_reason && result.batches_processed >= maxDirtyBatches) result.stop_reason = 'DIRTY_RPC_BUDGET_EXHAUSTED'

  const completion = maintenanceCompletion(result.pending_sources)
  result.status = completion.status
  result.continuation_required = completion.continuation_required
} catch (error) {
  result.status = 'ERROR'
  result.error_code = error instanceof Error ? error.message.slice(0, 240) : 'UNKNOWN_ERROR'
  result.continuation_required = result.pending_sources > 0
  result.stop_reason = result.error_code
  result.elapsed_ms = Date.now() - startedAtMs
  result.consecutive_no_progress_windows = nextNoProgressWindows(previousNoProgressWindows, result.progress_units > 0)
  result.stalled = maintenanceIsStalled(result.pending_sources, result.oldest_pending_age_seconds, result.consecutive_no_progress_windows)
  result.stalled_reason = result.stalled ? 'NO_PROGRESS_IN_TWO_OR_MORE_CONSECUTIVE_WINDOWS_WITH_OLD_PENDING_QUEUE' : 'STALL_NOT_CONFIRMED_DURING_ERROR_WINDOW'
}

const serialized = JSON.stringify(result)
console.log(serialized)
const statePath = process.env.UNIVERSE_MAINTENANCE_STATE_PATH
if (statePath) {
  try {
    writeFileSync(statePath, JSON.stringify({
      schema: 'cvitae.universe-maintenance-progress.v1',
      run_id: process.env.GITHUB_RUN_ID ?? null,
      recorded_at: new Date().toISOString(),
      consecutive_no_progress_windows: result.consecutive_no_progress_windows,
      progress_units: result.progress_units,
      pending_sources: result.pending_sources,
      status: result.status,
    }, null, 2))
  } catch (error) {
    console.error(`UNIVERSE_PROGRESS_ARTIFACT_WRITE_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}`)
  }
}
if (result.status === 'ERROR') process.exitCode = 1
