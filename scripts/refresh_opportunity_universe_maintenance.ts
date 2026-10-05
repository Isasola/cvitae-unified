import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_CONFIGURATION_REQUIRED')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const dueLimit = 500
const dirtySourceLimit = 1
const maxDirtyBatches = 10

const due = await supabase.rpc('refresh_due_opportunity_universe', { p_limit: dueLimit })
if (due.error) throw new Error(`OPPORTUNITY_UNIVERSE_LIFECYCLE_REFRESH_FAILED:${due.error.message}`)

let refreshedSources = 0
let pendingDirtySources = 0
let batches = 0
do {
  const result = await supabase.rpc('refresh_dirty_opportunity_universe_sources', { p_limit: dirtySourceLimit })
  if (result.error) throw new Error(`OPPORTUNITY_UNIVERSE_SOURCE_POLICY_REFRESH_FAILED:${result.error.message}`)
  pendingDirtySources = Number(result.data?.pending_sources || 0)
  refreshedSources += Number(result.data?.sources_refreshed || 0)
  batches += 1
} while (pendingDirtySources > 0 && batches < maxDirtyBatches)

console.log(JSON.stringify({
  owner: 'common-opportunity-universe-maintenance',
  due_rows_refreshed: Number(due.data || 0),
  dirty_sources_refreshed: refreshedSources,
  dirty_source_batches: batches,
  pending_dirty_sources: pendingDirtySources,
  resumable: pendingDirtySources > 0,
  bounds: { due_limit: dueLimit, dirty_source_limit: dirtySourceLimit, max_dirty_batches: maxDirtyBatches },
}))
