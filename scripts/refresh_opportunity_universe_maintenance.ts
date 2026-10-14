import { createClient } from '@supabase/supabase-js'
import { maintenanceCompletion, parseDirtyRefreshResponse, parseDueRefreshCount } from '../shared/opportunity-universe-maintenance.ts'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_CONFIGURATION_REQUIRED')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const canaryOnly = process.argv.includes('--canary')
const dueLimit = canaryOnly ? 0 : 500
const dirtySourceLimit = 1
const maxDirtyBatches = canaryOnly ? 1 : 10
const result = {
  owner: 'common-opportunity-universe-maintenance',
  status: 'ERROR' as 'COMPLETE' | 'RESUMABLE' | 'ERROR',
  sources_processed: 0,
  opportunities_recalculated: 0,
  batches_processed: 0,
  batch_progress: [] as Array<{ batch: number; sources_refreshed: number; opportunities_refreshed: number; pending_sources: number }>,
  pending_sources: 0,
  pending_source_sample: [] as Array<{ canonical_source: string; queued_at: string; reason: string; cursor_id: string | null }>,
  oldest_pending_queued_at: null as string | null,
  stalled: false,
  retries: 0,
  continuation_required: false,
  error_code: null as string | null,
  due_rows_refreshed: 0,
  bounds: { due_limit: dueLimit, dirty_source_limit: dirtySourceLimit, max_dirty_batches: maxDirtyBatches, expected_page_size: 250 },
}

try {
  const rpcWithRetry = async (name: string, args: Record<string, number>) => {
    let lastError: any
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await supabase.rpc(name, args)
      if (!response.error) return response.data
      lastError = response.error
      if (attempt < 2) {
        result.retries += 1
        await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** attempt)))
      }
    }
    throw lastError
  }
  if (dueLimit > 0) {
    const due = await rpcWithRetry('refresh_due_opportunity_universe', { p_limit: dueLimit })
    result.due_rows_refreshed = parseDueRefreshCount(due)
  }

  for (let batch = 0; batch < maxDirtyBatches; batch++) {
    const data = await rpcWithRetry('refresh_dirty_opportunity_universe_sources', { p_limit: dirtySourceLimit })
    const response = parseDirtyRefreshResponse(data)
    const { pending_sources: pending, sources_refreshed: sources, opportunities_refreshed: opportunities } = response

    result.batches_processed += 1
    result.sources_processed += sources
    result.opportunities_recalculated += opportunities
    result.pending_sources = pending
    result.batch_progress.push({ batch: batch + 1, sources_refreshed: sources, opportunities_refreshed: opportunities, pending_sources: pending })
    if (pending === 0) break
  }

  const pending = await supabase.from('opportunity_universe_dirty_sources')
    .select('canonical_source,queued_at,reason,cursor_id', { count: 'exact' }).order('queued_at', { ascending: true }).limit(25)
  if (pending.error) throw pending.error
  result.pending_source_sample = (pending.data ?? []).map(row => ({ canonical_source: row.canonical_source, queued_at: row.queued_at, reason: row.reason, cursor_id: row.cursor_id ?? null }))
  result.pending_sources = pending.count ?? result.pending_sources
  result.oldest_pending_queued_at = result.pending_source_sample[0]?.queued_at ?? null
  result.stalled = Boolean(result.oldest_pending_queued_at && Date.now() - Date.parse(result.oldest_pending_queued_at) > 2 * 60 * 60 * 1000)

  const completion = maintenanceCompletion(result.pending_sources)
  result.status = completion.status
  result.continuation_required = completion.continuation_required
} catch (error) {
  result.status = 'ERROR'
  result.error_code = error instanceof Error ? error.message.slice(0, 240) : 'UNKNOWN_ERROR'
  result.continuation_required = result.pending_sources > 0
}

console.log(JSON.stringify(result))
if (result.status === 'ERROR') process.exitCode = 1
