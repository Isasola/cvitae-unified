import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_CONFIGURATION_REQUIRED')
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const expected = { computrabajo_py: 86, unjobs_pe: 10, unjobs_ar: 23 } as const
type Cohort = keyof typeof expected
const definitions: Record<Cohort, { source: string; country: string }> = {
  computrabajo_py: { source: '%computrabajo%', country: 'PY' },
  unjobs_pe: { source: '%unjobs%', country: 'PE' },
  unjobs_ar: { source: '%unjobs%', country: 'AR' },
}

async function readCohortIds() {
  const ids: Record<Cohort, string[]> = { computrabajo_py: [], unjobs_pe: [], unjobs_ar: [] }
  for (const bucket of Object.keys(definitions) as Cohort[]) {
    const { source, country } = definitions[bucket]
    let offset = 0
    while (true) {
      const { data, error } = await supabase.from('opportunities').select('id')
        .ilike('source', source).eq('country_code', country).order('id', { ascending: true }).range(offset, offset + 499)
      if (error) throw new Error(`COHORT_READ_FAILED:${bucket}:${error.code ?? 'UNKNOWN'}`)
      const page = data ?? []
      ids[bucket].push(...page.map(row => String(row.id)))
      if (page.length < 500) break
      offset += page.length
    }
  }
  const counts = Object.fromEntries(Object.entries(ids).map(([bucket, values]) => [bucket, values.length])) as Record<Cohort, number>
  if ((Object.keys(expected) as Cohort[]).some(bucket => counts[bucket] !== expected[bucket])) {
    console.log(JSON.stringify({ status: 'BASELINE_MISMATCH', expected, observed: counts }))
    process.exitCode = 2
    return null
  }
  return ids
}

async function summarize(ids: Record<Cohort, string[]>) {
  const allIds = Object.values(ids).flat()
  const states = new Map<string, any>()
  for (let offset = 0; offset < allIds.length; offset += 500) {
    const { data, error } = await supabase.from('opportunity_universe_state')
      .select('opportunity_id,final_matching_state,matching_row_reason,source_operational_reason,source_matching_operational_reason,source_matching_reason,seo_state,seo_row_reason,seo_effective_reason')
      .in('opportunity_id', allIds.slice(offset, offset + 500))
    if (error) throw new Error(`COHORT_STATE_READ_FAILED:${error.code ?? 'UNKNOWN'}`)
    for (const row of data ?? []) states.set(String(row.opportunity_id), row)
  }
  const result: Record<string, any> = {}
  for (const bucket of Object.keys(ids) as Cohort[]) {
    const matching: Record<string, number> = {}
    const seo: Record<string, number> = {}
    const outsideReasons: Record<string, number> = {}
    for (const id of ids[bucket]) {
      const state = states.get(id)
      const matchState = String(state?.final_matching_state ?? 'NO_UNIVERSE_STATE')
      const seoState = String(state?.seo_state ?? 'NO_UNIVERSE_STATE')
      matching[matchState] = (matching[matchState] ?? 0) + 1
      seo[seoState] = (seo[seoState] ?? 0) + 1
      if (matchState !== 'READY') {
        const reason = state?.matching_row_reason
          || state?.source_operational_reason
          || state?.source_matching_operational_reason
          || state?.source_matching_reason
          || 'NO_PERSISTED_REASON'
        outsideReasons[String(reason)] = (outsideReasons[String(reason)] ?? 0) + 1
      }
    }
    result[bucket] = { total: ids[bucket].length, matching, seo, matching_outside_ready_reasons: outsideReasons }
  }
  return result
}

const cohortIds = await readCohortIds()
if (cohortIds) {
  const before = await summarize(cohortIds)
  let data: any = null
  let lastError: any = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await supabase.rpc('refresh_dirty_opportunity_universe_sources', { p_limit: 1 })
    if (!response.error) { data = response.data; lastError = null; break }
    lastError = response.error
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** attempt)))
  }
  if (lastError) throw new Error(`RECONCILIATION_CANARY_FAILED:${lastError.code ?? 'UNKNOWN'}`)
  const after = await summarize(cohortIds)
  const dirtyQueue = await supabase.from('opportunity_universe_dirty_sources')
    .select('canonical_source,queued_at,reason,cursor_id', { count: 'exact' }).order('queued_at', { ascending: true }).limit(25)
  if (dirtyQueue.error) throw new Error(`DIRTY_QUEUE_READ_FAILED:${dirtyQueue.error.code ?? 'UNKNOWN'}`)
  const opportunitiesRefreshed = Number(data?.opportunities_refreshed ?? 0)
  console.log(JSON.stringify({
    status: opportunitiesRefreshed > 0 ? 'CANARY_PROGRESS' : 'CANARY_NO_PROGRESS',
    cohort_size: Object.values(cohortIds).reduce((sum, values) => sum + values.length, 0),
    before,
    canary_rpc: data,
    dirty_queue_after: { pending_sources: dirtyQueue.count ?? 0, oldest_sources: dirtyQueue.data ?? [] },
    after,
    delta: Object.fromEntries((Object.keys(expected) as Cohort[]).map(bucket => [bucket, {
      ready: (after[bucket].matching.READY ?? 0) - (before[bucket].matching.READY ?? 0),
      seo_ready: (after[bucket].seo.READY ?? 0) - (before[bucket].seo.READY ?? 0),
    }]))
  }, null, 2))
  if (opportunitiesRefreshed < 1) process.exitCode = 1
}
