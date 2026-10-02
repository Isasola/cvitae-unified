import { createClient } from '@supabase/supabase-js'
import { canonicalCandidateProfile } from '../shared/candidate-profile.ts'
import { matchingProfileSignature } from '../shared/matching-profile-signature.ts'
import { commitRetrievalPage, cursorAfterPage, normalizeSourcePolicyRow, sourcePolicySignature } from '../shared/matching-retrieval.ts'
import { nextRetrievalSchedulerCursor, prioritizeRetrievalUsers, type RetrievalSchedulerCandidate, type RetrievalSchedulerReason } from '../shared/retrieval-user-scheduler.ts'
import { buildDictionary } from '../supabase/functions/_shared/matching.ts'
import { isPotentialDiscoveryDecision, isVisibleMatchDecision, rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'
import { EDGE_SOURCE_IDENTITIES } from '../supabase/functions/_shared/generated-source-registry.ts'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args.set(process.argv[i], process.argv[++i] ?? '')
const intArg = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(args.get(name) ?? fallback)
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`INVALID_${name.slice(2).toUpperCase()}`)
  return value
}
const onlyUser = args.get('--user') || ''
const maxUsers = intArg('--max-users', 2, 1, 25)
const pageSize = intArg('--page-size', 250, 1, 500)
const maxPages = intArg('--max-pages', 4, 1, 100)
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_CONFIGURATION_REQUIRED')

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const canonicalSource = (raw: unknown) => {
  const source = String(raw ?? '').trim().toLowerCase()
  const identity = EDGE_SOURCE_IDENTITIES.find((item) => item.canonical_source === source || item.emitted_aliases.includes(source))
  return identity?.canonical_source || source
}
const nowIso = () => new Date().toISOString()
const pageFields = 'id,slug,title,organization,location,rubro,tags,description,application_url,type,opportunity_type,opportunity_kind,remote,remote_scope,eligible_countries,eligible_regions,citizenship_requirement,residency_requirement,source,deadline,created_at,updated_at,is_active,verification_status,match_eligible,alerts_eligible,archived_at,deleted_at,content_fingerprint'

function inventoryDelta(rows: any[], policies: ReturnType<typeof buildCanonicalSourcePolicyIndex>, cutoff: string) {
  return inventoryFunnelPage(rows, policies, cutoff)
}

async function getSourcePolicies() {
  const [{ data, error }, { data: permissions, error: permissionError }] = await Promise.all([
    supabase.from('opportunity_sources').select('source,is_enabled,matching_enabled'),
    supabase.from('opportunity_source_consumer_permissions').select('canonical_source,consumer,permission_state').eq('consumer', 'matching'),
  ])
  if (error) throw error
  if (permissionError) throw permissionError
  const rows = (data ?? []).map(normalizeSourcePolicyRow)
  const signature = await sourcePolicySignature(rows, canonicalSource, permissions ?? [])
  return { rows, signature }
}

async function countUniverse(cutoff: string, full = false, watermark: string | null = null) {
  if (!full && watermark) {
    const { count, error } = await supabase.from('opportunities').select('id', { count: 'exact', head: true })
      .gt('updated_at', watermark).lte('updated_at', cutoff)
    if (error) throw error
    return count ?? 0
  }
  let query = supabase.from('opportunity_final_matching_universe').select('id', { count: 'exact', head: true })
  if (full) query = query.lte('created_at', cutoff).lte('updated_at', cutoff)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

function pageQuery(userState: any, pageSizeValue: number) {
  const table = userState.scan_kind === 'FULL' ? 'opportunity_final_matching_universe' : 'opportunities'
  const fields = userState.scan_kind === 'FULL' ? `${pageFields},universe_final_matching_state` : pageFields
  let query = supabase.from(table).select(fields).order(userState.scan_kind === 'FULL' ? 'created_at' : 'updated_at', { ascending: true }).order('id', { ascending: true }).limit(pageSizeValue)
  if (userState.scan_kind === 'FULL') {
    query = query.lte('created_at', userState.scan_cutoff).lte('updated_at', userState.scan_cutoff)
    if (userState.cursor_at && userState.cursor_id) query = query.or(`created_at.gt.${userState.cursor_at},and(created_at.eq.${userState.cursor_at},id.gt.${userState.cursor_id})`)
  } else {
    query = query.gt('updated_at', userState.last_change_watermark ?? '1970-01-01T00:00:00.000Z').lte('updated_at', userState.scan_cutoff)
    if (userState.cursor_at && userState.cursor_id) query = query.or(`updated_at.gt.${userState.cursor_at},and(updated_at.eq.${userState.cursor_at},id.gt.${userState.cursor_id})`)
  }
  return query
}

async function evaluatePage(profile: any, opportunities: any[], profileSig: string, evaluationLane: 'FULL_BACKFILL' | 'INCREMENTAL', scanKind: 'FULL' | 'DELTA') {
  const universe = new Map<string, string>()
  if (scanKind === 'FULL') for (const row of opportunities) universe.set(String(row.id), String(row.universe_final_matching_state || 'READY'))
  else {
    const { data, error } = await supabase.from('opportunity_universe_state').select('opportunity_id,final_matching_state').in('opportunity_id', opportunities.map(row => String(row.id)))
    if (error) throw error
    for (const row of data ?? []) universe.set(String(row.opportunity_id), String(row.final_matching_state))
  }
  const eligible = opportunities.filter(row => universe.get(String(row.id)) === 'READY')
  const ids = eligible.map((row) => String(row.id))
  const similarities = new Map<string, number>()
  if (profile.embedding && ids.length) {
    const { data, error } = await supabase.rpc('score_opportunity_embeddings', { query_embedding: profile.embedding, opportunity_ids: ids.slice(0, 500) })
    if (error) throw new Error('SEMANTIC_PAGE_SCORING_FAILED')
    for (const item of data ?? []) if (Number.isFinite(Number(item.similarity))) similarities.set(String(item.id), Number(item.similarity))
  }
  const candidate = canonicalCandidateProfile(profile)
  const profileInput = {
    professional_title: candidate.professional_title, summary: candidate.summary, cv_text: candidate.cv_text,
    profile_data: { ...candidate.profile_data },
  }
  const dictionaryRows = await supabase.from('skill_dictionary').select('canonical_name,variants')
  if (dictionaryRows.error) throw dictionaryRows.error
  const dictionary = buildDictionary((dictionaryRows.data ?? []).map((row: any) => [String(row.canonical_name ?? ''), Array.isArray(row.variants) ? row.variants.map(String) : []]))
  const ranked = rankOpportunitiesV2(profileInput, eligible, dictionary, V2_PRESET_FULL, similarities)
  const currentRows = await supabase.from('opportunities').select('id,updated_at,content_fingerprint').in('id', opportunities.map((row) => String(row.id)))
  if (currentRows.error) throw currentRows.error
  const currentById = new Map((currentRows.data ?? []).map((row: any) => [String(row.id), row]))
  if (opportunities.some((row) => {
    const current = currentById.get(String(row.id))
    return !current || String(current.updated_at) !== String(row.updated_at) || current.content_fingerprint !== row.content_fingerprint
  })) throw new Error('PAGE_CHANGED_DURING_EVALUATION')
  const byId = new Map(ranked.decisions.map(({ opp, decision }) => [String(opp.id), decision]))
  const candidates: any[] = []
  const removeIds: string[] = []
  for (const opportunity of eligible) {
    const decision: any = byId.get(String(opportunity.id))
    if (decision && (isVisibleMatchDecision(decision) || isPotentialDiscoveryDecision(decision)) && opportunity.content_fingerprint) {
      candidates.push({
        user_id: profile.user_id, opportunity_id: String(opportunity.id), profile_signature: profileSig,
        opportunity_content_fingerprint: opportunity.content_fingerprint,
        candidate_class: isVisibleMatchDecision(decision) ? 'MATCH' : 'POTENTIAL',
        score_snapshot: typeof decision.score === 'number' ? decision.score : null,
        semantic_similarity: similarities.get(String(opportunity.id)) ?? null,
        reason_codes: [...new Set([...(decision.positive_reasons ?? []), ...(decision.negative_reasons ?? []), ...(decision.unknown_reasons ?? []), ...(decision.hard_denials ?? [])])],
        retrieval_lanes: [], evaluation_lane: evaluationLane, evaluated_at: nowIso(),
      })
    } else removeIds.push(String(opportunity.id))
  }
  // Rows outside the current source-allowed match universe must lose stale shortlist entries too.
  const eligibleSet = new Set(ids)
  for (const row of opportunities) if (!eligibleSet.has(String(row.id))) removeIds.push(String(row.id))
  if (removeIds.length) {
    const { error } = await supabase.from('matching_retrieval_candidates').delete().eq('user_id', profile.user_id).in('opportunity_id', [...new Set(removeIds)])
    if (error) throw error
  }
  if (candidates.length) {
    const { error } = await supabase.from('matching_retrieval_candidates').upsert(candidates, { onConflict: 'user_id,opportunity_id' })
    if (error) throw error
  }
  const outcomeCounts = { MATCH: 0, POTENTIAL: 0, ABSTAIN: 0, DENY: 0 }
  for (const { decision } of ranked.decisions) outcomeCounts[decision.outcome]++
  const counts = { FINAL_MATCHING_UNIVERSE: eligible.length, BACKGROUND_EVALUATED: eligible.length, MATCH: outcomeCounts.MATCH, POTENTIAL: outcomeCounts.POTENTIAL, ABSTAIN: outcomeCounts.ABSTAIN, DENY: outcomeCounts.DENY, CANDIDATE_RETAINED: candidates.length }
  return { counts, examined: eligible.length, candidates: candidates.length }
}

async function selectUsers(maxCount: number) {
  const fields = 'user_id,professional_title,summary,cv_text,profile_data,embedding,updated_at'
  if (onlyUser) {
    const { data, error } = await supabase.from('user_master_profiles').select(fields).eq('user_id', onlyUser).maybeSingle()
    if (error) throw error
    return { selected: data ? [{ profile: data, scheduler_reason: undefined }] : [], nextCursor: null, currentCursor: null }
  }
  const groups: Record<RetrievalSchedulerReason, Array<RetrievalSchedulerCandidate<any>>> = { PENDING: [], SCANNING: [], ERROR: [], STALE: [], NO_STATE: [], DELTA_PENDING: [] }
  const seen = new Set<string>()
  const add = (reason: RetrievalSchedulerReason, profile: any) => {
    if (!profile?.user_id || seen.has(String(profile.user_id))) return
    groups[reason].push({ profile, scheduler_reason: reason })
    seen.add(String(profile.user_id))
  }
  const loadByStates = async (states: any[], reason: RetrievalSchedulerReason) => {
    if (!states.length) return
    const loaded = await supabase.from('user_master_profiles').select(fields).in('user_id', states.map((row: any) => row.user_id))
    if (loaded.error) throw loaded.error
    for (const profile of loaded.data ?? []) add(reason, profile)
  }
  const pending = await supabase.from('matching_retrieval_states').select('user_id,scan_status').in('scan_status', ['PENDING', 'SCANNING']).order('updated_at', { ascending: true }).limit(maxCount)
  if (pending.error) throw pending.error
  await loadByStates((pending.data ?? []).filter((row: any) => row.scan_status === 'PENDING'), 'PENDING')
  await loadByStates((pending.data ?? []).filter((row: any) => row.scan_status === 'SCANNING'), 'SCANNING')
  let selection = prioritizeRetrievalUsers(maxCount, groups)
  if (selection.length < maxCount) {
    const errors = await supabase.from('matching_retrieval_states').select('user_id').eq('scan_status', 'ERROR').order('updated_at', { ascending: true }).limit(maxCount - selection.length)
    if (errors.error) throw errors.error
    await loadByStates(errors.data ?? [], 'ERROR')
    selection = prioritizeRetrievalUsers(maxCount, groups)
  }

  const scheduler = await supabase.from('matching_retrieval_scheduler_state').select('profile_cursor').eq('singleton', true).single()
  if (scheduler.error) throw scheduler.error
  const cursor = scheduler.data.profile_cursor as string | null
  const sampleSize = Math.max(250, maxCount * 20)
  const sampledResult = await supabase.from('user_master_profiles').select(fields)
    .gt('user_id', cursor ?? '00000000-0000-0000-0000-000000000000').order('user_id', { ascending: true }).limit(sampleSize)
  if (sampledResult.error) throw sampledResult.error
  const sampled = sampledResult.data ?? []
  if (cursor && sampled.length < sampleSize) {
    const wrap = await supabase.from('user_master_profiles').select(fields).lt('user_id', cursor).order('user_id', { ascending: true }).limit(sampleSize - sampled.length)
    if (wrap.error) throw wrap.error
    sampled.push(...(wrap.data ?? []))
  }
  const sampleIds = sampled.map((row: any) => String(row.user_id))
  const states = sampleIds.length ? await supabase.from('matching_retrieval_states').select('user_id,profile_signature,source_policy_signature,scan_status').in('user_id', sampleIds) : { data: [], error: null }
  if (states.error) throw states.error
  const stateByUser = new Map((states.data ?? []).map((row: any) => [row.user_id, row]))
  const safelySkipped = new Set<string>()
  const sampledCandidates: Array<RetrievalSchedulerCandidate<any>> = []
  for (const profile of sampled) {
    const state: any = stateByUser.get(profile.user_id)
    let reason: RetrievalSchedulerReason | null = null
    if (!state) reason = 'NO_STATE'
    else if (state.scan_status === 'PENDING' || state.scan_status === 'SCANNING' || state.scan_status === 'ERROR') reason = state.scan_status
    else if (state.profile_signature !== matchingProfileSignature(profile) || state.source_policy_signature !== sourcePolicies.signature) reason = 'STALE'
    else safelySkipped.add(String(profile.user_id))
    if (reason) {
      const candidate = { profile, scheduler_reason: reason }
      sampledCandidates.push(candidate)
      add(reason, profile)
    } else sampledCandidates.push({ profile, scheduler_reason: 'DELTA_PENDING' })
  }

  selection = prioritizeRetrievalUsers(maxCount, groups)
  if (selection.length < maxCount) {
    const complete = await supabase.from('matching_retrieval_states').select('user_id,last_change_watermark,profile_signature,source_policy_signature')
      .eq('scan_status', 'COMPLETE').order('last_change_watermark', { ascending: true }).limit(Math.min(250, Math.max(20, maxCount * 10)))
    if (complete.error) throw complete.error
    const cutoff = nowIso()
    let checks = 0
    for (const state of complete.data ?? []) {
      const highPrioritySelection = prioritizeRetrievalUsers(maxCount, { ...groups, DELTA_PENDING: [] })
      if (highPrioritySelection.length >= maxCount || checks >= Math.min(250, Math.max(20, maxCount * 10))) break
      if (seen.has(String(state.user_id))) continue
      checks++
      const loaded = await supabase.from('user_master_profiles').select(fields).eq('user_id', state.user_id).maybeSingle()
      if (loaded.error) throw loaded.error
      const profile = loaded.data
      if (!profile) continue
      if (matchingProfileSignature(profile) !== (state as any).profile_signature || sourcePolicies.signature !== (state as any).source_policy_signature) {
        add('STALE', profile)
      } else if (highPrioritySelection.length < maxCount) {
        // The shared opportunity stream is checked only for a bounded prefix of
        // COMPLETE users, and an idle user never consumes a worker slot.
        const watermark = state.last_change_watermark ?? '1970-01-01T00:00:00.000Z'
        const changed = await supabase.from('opportunities').select('id').gt('updated_at', watermark).lte('updated_at', cutoff).limit(1)
        if (changed.error) throw changed.error
        if (changed.data?.length) add('DELTA_PENDING', profile)
      }
      selection = prioritizeRetrievalUsers(maxCount, groups)
    }
  }

  selection = prioritizeRetrievalUsers(maxCount, groups)
  const nextCursor = nextRetrievalSchedulerCursor(sampledCandidates, selection.filter((item) => sampleIds.includes(String(item.profile.user_id))), safelySkipped, cursor)
  return { selected: selection, nextCursor, currentCursor: cursor }
}

async function stateFor(userId: string) {
  const { data, error } = await supabase.from('matching_retrieval_states').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}

async function initializeState(profile: any, profileSig: string, policySig: string, kind: 'FULL' | 'DELTA', watermark: string | null, sourceCount: number, previous: any = null) {
  const cutoff = nowIso()
  const target = await countUniverse(cutoff, kind === 'FULL', watermark)
  if (kind === 'FULL') {
    const { error: deleteError } = await supabase.from('matching_retrieval_candidates').delete().eq('user_id', profile.user_id)
    if (deleteError) throw deleteError
  }
  const { data, error } = await supabase.from('matching_retrieval_states').upsert({
    user_id: profile.user_id, profile_signature: profileSig, source_policy_signature: policySig,
    scan_kind: kind, scan_status: 'PENDING', scan_cutoff: cutoff, cursor_at: null, cursor_id: null,
    last_change_watermark: watermark,
    examined_count: kind === 'FULL' ? 0 : (previous?.examined_count ?? 0),
    target_count: kind === 'FULL' ? target : (previous?.target_count ?? 0),
    scan_examined_count: 0, scan_target_count: target, candidate_count: 0,
    completed_at: null, last_error_code: null, inventory_funnel: kind === 'FULL' ? {} : undefined,
    inventory_funnel_at: kind === 'FULL' ? null : undefined, updated_at: cutoff,
  }, { onConflict: 'user_id' }).select('*').single()
  if (error) throw error
  return data
}

async function processUser(profile: any, pageLimit: number, pageSizeValue: number) {
  const startedAt = Date.now()
  let inventoryRowsScanned = 0
  let sourceAllowedRowsEvaluated = 0
  let candidatesRetained = 0
  const profileSig = matchingProfileSignature(profile)
  const state = await stateFor(profile.user_id)
  let current = state
  const signaturesChanged = !state || state.profile_signature !== profileSig || state.source_policy_signature !== sourcePolicies.signature
  if (signaturesChanged) current = await initializeState(profile, profileSig, sourcePolicies.signature, 'FULL', null, sourcePolicies.rows.length)
  else if (state.scan_status === 'ERROR' && state.last_error_code === 'COVERAGE_COUNT_MISMATCH') {
    current = await initializeState(profile, profileSig, sourcePolicies.signature, state.scan_kind, state.last_change_watermark, sourcePolicies.rows.length, state)
  } else if (state.scan_status === 'ERROR') {
    const { error } = await supabase.from('matching_retrieval_states').update({ scan_status: 'SCANNING', last_error_code: null, updated_at: nowIso() }).eq('user_id', profile.user_id)
    if (error) throw error
    current = { ...state, scan_status: 'SCANNING' }
  } else if (state.scan_status === 'COMPLETE') {
    const cutoff = nowIso()
    let changed = supabase.from('opportunities').select('id', { count: 'exact', head: true }).gt('updated_at', state.last_change_watermark ?? '1970-01-01T00:00:00.000Z').lte('updated_at', cutoff)
    const { count, error } = await changed
    if (error) throw error
    if (!count) return { user_id: profile.user_id, pages: 0, status: 'COMPLETE', examined: state.examined_count, target: state.target_count, duration_ms: Date.now() - startedAt, inventory_rows_scanned: 0, source_allowed_rows_evaluated: 0, candidates_retained: state.candidate_count ?? 0 }
    current = await initializeState(profile, profileSig, sourcePolicies.signature, 'DELTA', state.last_change_watermark, sourcePolicies.rows.length, state)
  }
  const effective = await supabase.from('matching_retrieval_states').select('*').eq('user_id', profile.user_id).single()
  if (effective.error) throw effective.error
  current = effective.data
  if (current.scan_status === 'PENDING') {
    const { error } = await supabase.from('matching_retrieval_states').update({ scan_status: 'SCANNING', updated_at: nowIso() }).eq('user_id', profile.user_id)
    if (error) throw error
    current.scan_status = 'SCANNING'
  }
  let pages = 0
  for (; pages < pageLimit; pages++) {
    const { data: rows, error } = await pageQuery(current, pageSizeValue)
    if (error) throw error
      if (!rows?.length) {
      if (current.scan_examined_count !== current.scan_target_count) throw new Error('COVERAGE_COUNT_MISMATCH')
      const coverageTarget = await countUniverse(current.scan_cutoff, true)
      const completion = nowIso()
      const counts = await supabase.from('matching_retrieval_candidates').select('opportunity_id', { count: 'exact', head: true }).eq('user_id', profile.user_id).eq('profile_signature', profileSig)
      if (counts.error) throw counts.error
      candidatesRetained = counts.count ?? 0
      const done = await supabase.from('matching_retrieval_states').update({
        scan_status: 'COMPLETE', completed_at: completion,
        last_change_watermark: current.scan_cutoff, cursor_at: null, cursor_id: null,
        examined_count: coverageTarget, target_count: coverageTarget,
        candidate_count: counts.count ?? 0,
        inventory_funnel_at: current.scan_kind === 'FULL' ? current.scan_cutoff : current.inventory_funnel_at,
        updated_at: completion, last_error_code: null,
      }).eq('user_id', profile.user_id)
      if (done.error) throw done.error
      current.scan_status = 'COMPLETE'
      current.examined_count = coverageTarget
      current.target_count = coverageTarget
      break
    }
    const nextCursor = cursorAfterPage(rows, current.scan_kind === 'FULL' ? 'created_at' : 'updated_at')
    const evaluationLane = current.scan_kind === 'FULL' ? 'FULL_BACKFILL' : 'INCREMENTAL'
    await commitRetrievalPage(rows, async (pageRows) => {
      const result = await evaluatePage(profile, pageRows, profileSig, evaluationLane, current.scan_kind)
      const counts = { ...(current.inventory_funnel ?? {}) }
      if (current.scan_kind === 'FULL') for (const [key, value] of Object.entries(result.counts)) counts[key] = Number(counts[key] || 0) + Number(value || 0)
      const nextScanExamined = current.scan_examined_count + (current.scan_kind === 'FULL' ? result.examined : pageRows.length)
      const nextExamined = current.scan_kind === 'FULL' ? nextScanExamined : current.examined_count
      const currentCandidates = await supabase.from('matching_retrieval_candidates').select('opportunity_id', { count: 'exact', head: true }).eq('user_id', profile.user_id).eq('profile_signature', profileSig)
      if (currentCandidates.error) throw currentCandidates.error
      const updated = await supabase.from('matching_retrieval_states').update({
        scan_status: 'SCANNING', cursor_at: nextCursor?.at ?? null, cursor_id: nextCursor?.id ?? null,
        examined_count: nextExamined, scan_examined_count: nextScanExamined, candidate_count: currentCandidates.count ?? 0,
        inventory_funnel: counts, updated_at: nowIso(), last_error_code: null,
      }).eq('user_id', profile.user_id)
      if (updated.error) throw updated.error
      inventoryRowsScanned += pageRows.length
      sourceAllowedRowsEvaluated += result.examined
      candidatesRetained = currentCandidates.count ?? 0
      current = { ...current, cursor_at: nextCursor?.at, cursor_id: nextCursor?.id, examined_count: nextExamined, scan_examined_count: nextScanExamined, candidate_count: currentCandidates.count ?? 0, inventory_funnel: counts }
    }, async () => {})
  }
  return { user_id: profile.user_id, pages, status: current.scan_status, examined: current.examined_count, target: current.target_count, duration_ms: Date.now() - startedAt, inventory_rows_scanned: inventoryRowsScanned, source_allowed_rows_evaluated: sourceAllowedRowsEvaluated, candidates_retained: candidatesRetained }
}

const { rows: policyRows, signature: policySig } = await getSourcePolicies()
const sourcePolicies = { rows: policyRows, signature: policySig }
const { data: expiredUniverseRefresh, error: universeRefreshError } = await supabase.rpc('refresh_due_opportunity_universe', { p_limit: 500 })
if (universeRefreshError) throw new Error('OPPORTUNITY_UNIVERSE_LIFECYCLE_REFRESH_FAILED')
let dirtySourceBatches = 0
let pendingDirtySources = 0
do {
  const { data, error } = await supabase.rpc('refresh_dirty_opportunity_universe_sources', { p_limit: 50 })
  if (error) throw new Error('OPPORTUNITY_UNIVERSE_SOURCE_POLICY_REFRESH_FAILED')
  pendingDirtySources = Number(data?.sources_refreshed || 0)
  dirtySourceBatches++
  if (pendingDirtySources > 0 && dirtySourceBatches >= 10) throw new Error('OPPORTUNITY_UNIVERSE_DIRTY_SOURCE_QUEUE_NOT_DRAINED')
} while (pendingDirtySources > 0)
const { data: pruneResult, error: pruneError } = await supabase.rpc('prune_matching_retrieval_candidates')
if (pruneError) throw new Error('CANDIDATE_CACHE_PRUNE_FAILED')
const schedule = await selectUsers(maxUsers)
const profiles = schedule.selected
const results: any[] = []
let schedulerBatchSucceeded = true
for (const profile of profiles) {
  if (results.length >= maxUsers) break
  try {
    const result = await processUser(profile.profile, maxPages, pageSize)
    results.push({ scheduler_reason: profile.scheduler_reason, status: result.status, duration_ms: result.duration_ms, pages_processed: result.pages, inventory_rows_scanned: result.inventory_rows_scanned, source_allowed_rows_evaluated: result.source_allowed_rows_evaluated, candidates_retained: result.candidates_retained, examined: result.examined, target: result.target })
  } catch (error: any) {
    schedulerBatchSucceeded = false
    await supabase.from('matching_retrieval_states').update({ scan_status: 'ERROR', last_error_code: error?.message === 'COVERAGE_COUNT_MISMATCH' ? 'COVERAGE_COUNT_MISMATCH' : 'PAGE_PROCESS_FAILED', updated_at: nowIso() }).eq('user_id', profile.profile.user_id)
    results.push({ scheduler_reason: profile.scheduler_reason, status: 'ERROR', error_code: error?.message === 'COVERAGE_COUNT_MISMATCH' ? 'COVERAGE_COUNT_MISMATCH' : 'PAGE_PROCESS_FAILED' })
  }
}
if (!onlyUser && schedulerBatchSucceeded && schedule.nextCursor && schedule.nextCursor !== schedule.currentCursor) {
  const { error } = await supabase.from('matching_retrieval_scheduler_state').update({ profile_cursor: schedule.nextCursor, updated_at: nowIso() }).eq('singleton', true)
  if (error) throw error
}
console.log(JSON.stringify({ users_processed: results.length, max_users: maxUsers, page_size: pageSize, max_pages_per_user: maxPages, opportunity_universe_expirations_refreshed: Number(expiredUniverseRefresh ?? 0), stale_candidates_pruned: Number(pruneResult ?? 0), results }, null, 2))
