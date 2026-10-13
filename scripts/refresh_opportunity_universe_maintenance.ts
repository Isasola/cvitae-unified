import { createClient } from '@supabase/supabase-js'
import { maintenanceCompletion, parseDirtyRefreshResponse, parseDueRefreshCount } from '../shared/opportunity-universe-maintenance.ts'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_CONFIGURATION_REQUIRED')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const dueLimit = 500
const dirtySourceLimit = 1
const maxDirtyBatches = 10
const result = {
  owner: 'common-opportunity-universe-maintenance',
  status: 'ERROR' as 'COMPLETE' | 'RESUMABLE' | 'ERROR',
  sources_processed: 0,
  opportunities_recalculated: 0,
  batches_processed: 0,
  pending_sources: 0,
  continuation_required: false,
  error_code: null as string | null,
  due_rows_refreshed: 0,
  bounds: { due_limit: dueLimit, dirty_source_limit: dirtySourceLimit, max_dirty_batches: maxDirtyBatches, expected_page_size: 250 },
}

try {
  const due = await supabase.rpc('refresh_due_opportunity_universe', { p_limit: dueLimit })
  if (due.error) throw new Error(`OPPORTUNITY_UNIVERSE_LIFECYCLE_REFRESH_FAILED:${due.error.message}`)
  result.due_rows_refreshed = parseDueRefreshCount(due.data)

  for (let batch = 0; batch < maxDirtyBatches; batch++) {
    const refreshed = await supabase.rpc('refresh_dirty_opportunity_universe_sources', { p_limit: dirtySourceLimit })
    if (refreshed.error) throw new Error(`OPPORTUNITY_UNIVERSE_SOURCE_POLICY_REFRESH_FAILED:${refreshed.error.message}`)

    const response = parseDirtyRefreshResponse(refreshed.data)
    const { pending_sources: pending, sources_refreshed: sources, opportunities_refreshed: opportunities } = response

    result.batches_processed += 1
    result.sources_processed += sources
    result.opportunities_recalculated += opportunities
    result.pending_sources = pending
    if (pending === 0) break
  }

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
