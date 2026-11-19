/**
 * Product analytics READ MODEL for the existing, admin-authenticated endpoint.
 * No new truth table; all measures explicitly declare their denominator.
 * GA4 anonymous users are intentionally not joined to authenticated identities.
 */
export type ProductPeriod = 7 | 30 | 90

type Profile = {
  id: string
  user_id: string | null
  is_test: boolean | null
  created_at: string
  profile_data: Record<string, unknown> | null
  cv_storage_path: string | null
}
type Event = { user_id: string; event_type: string; occurred_at: string }
type Ats = { user_id: string; created_at: string }
type Acquisition = { user_id: string; source: string | null; medium: string | null }

const PAGE_SIZE = 500
const MAX_ROWS = 20000
const DAY_MS = 86_400_000

async function collectAll<T>(queryFactory: () => any, label: string): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await queryFactory().range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`${label}: ${error.code || 'QUERY_FAILED'}`)
    if (!Array.isArray(data)) throw new Error(`${label}: INVALID_PAGE`)
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows
  }
  // Never report a partial count as the universe's total.
  throw new Error(`${label}: FULL_COVERAGE_LIMIT_REACHED`)
}

function hasCompletedProfile(row: Profile): boolean {
  return row.profile_data?.onboarding_status === 'completed' &&
    typeof row.profile_data?.onboarding_completed_at === 'string' &&
    Boolean(Date.parse(row.profile_data.onboarding_completed_at))
}

function acquisitionChannel(row: Acquisition): string | null {
  // Restrict untrusted UTM labels so emails, URLs and arbitrary content do not enter admin aggregates.
  const safe = (v: unknown) => {
    const text = String(v || '').trim().toLowerCase()
    return text.length <= 48 && /^[a-z0-9_.-]*$/.test(text) ? text : ''
  }
  const source = safe(row.source)
  const medium = safe(row.medium)
  return !source && !medium ? null : `${source || '(unknown)'} / ${medium || '(unknown)'}`
}

const classOf = (row: Profile): 'REAL' | 'TEST' | 'UNKNOWN' =>
  row.is_test === false ? 'REAL' : row.is_test === true ? 'TEST' : 'UNKNOWN'

export async function readProductMetrics(db: any, days: ProductPeriod, includeTests: boolean) {
  const now = new Date()
  const periodStart = new Date(now.getTime() - days * DAY_MS).toISOString()

  // Full historical denominator, separate from registration cohort in chosen period.
  const profiles = await collectAll<Profile>(() => db.from('user_master_profiles')
    .select('id,user_id,is_test,created_at,profile_data,cv_storage_path')
    .order('created_at', { ascending: true }).order('id', { ascending: true }), 'profiles')

  const classification = { REAL: 0, TEST: 0, UNKNOWN: 0 }
  const byUser = new Map<string, Profile[]>()
  for (const row of profiles) {
    classification[classOf(row)] += 1
    if (row.user_id) byUser.set(row.user_id, [...(byUser.get(row.user_id) || []), row])
  }
  // An identity that was ever TEST/UNKNOWN cannot be silently counted as REAL.
  const mixedIdentityIds = [...byUser].filter(([, rows]) => new Set(rows.map(classOf)).size > 1).map(([id]) => id)
  const mixed = new Set(mixedIdentityIds)
  const chosen = profiles.filter(p => (classOf(p) === 'REAL' || (includeTests && classOf(p) === 'TEST')) && (!p.user_id || !mixed.has(p.user_id)))
  const unlinked = chosen.filter(p => !p.user_id).length
  const chosenIds = [...new Set(chosen.flatMap(p => p.user_id ? [p.user_id] : []))]
  const chosenSet = new Set(chosenIds)
  const duplicateRows = chosen.filter(p => p.user_id).length - chosenIds.length

  // Cohort membership is based on first observed profile row for each identity,
  // not on extra profile rows created later.
  const firstCreated = new Map<string, number>()
  for (const row of profiles) {
    if (!row.user_id || !chosenSet.has(row.user_id)) continue
    const time = Date.parse(row.created_at)
    if (!Number.isFinite(time)) continue
    firstCreated.set(row.user_id, Math.min(time, firstCreated.get(row.user_id) ?? Infinity))
  }
  const cohortIds = chosenIds.filter(id => (firstCreated.get(id) ?? -Infinity) >= Date.parse(periodStart))
  const cohortSet = new Set(cohortIds)
  const cohortProfiles = chosen.filter(p => p.user_id && cohortSet.has(p.user_id))
  const completedIds = new Set(cohortProfiles.filter(hasCompletedProfile).map(p => p.user_id))
  const cvIds = new Set(cohortProfiles.filter(p => Boolean(p.cv_storage_path)).map(p => p.user_id))

  // Period activity is measured across ALL historical selected identities,
  // never just newly registered users. Separate metrics avoid mixing denominators.
  let ats: Ats[] = []
  let events: Event[] = []
  let acquisition: Acquisition[] = []
  for (let i = 0; i < chosenIds.length; i += 150) {
    const ids = chosenIds.slice(i, i + 150)
    const [a, e, ac] = await Promise.all([
      collectAll<Ats>(() => db.from('cv_ats_assessments').select('user_id,created_at')
        .in('user_id', ids).gte('created_at', periodStart)
        .order('created_at', { ascending: true }).order('id', { ascending: true }), 'ats_assessments'),
      collectAll<Event>(() => db.from('user_events').select('user_id,event_type,occurred_at')
        .in('user_id', ids).gte('occurred_at', periodStart)
        .order('occurred_at', { ascending: true }).order('id', { ascending: true }), 'product_events'),
      collectAll<Acquisition>(() => db.from('b2c_acquisition').select('user_id,source,medium')
        .in('user_id', ids).order('created_at', { ascending: true }).order('id', { ascending: true }), 'acquisition'),
    ])
    ats.push(...a)
    events.push(...e)
    acquisition.push(...ac)
  }

  const attribution = new Map<string, string>()
  for (const a of acquisition) {
    const channel = acquisitionChannel(a)
    if (channel && !attribution.has(a.user_id)) attribution.set(a.user_id, channel)
  }
  const channels = new Map<string, number>()
  for (const id of chosenIds) {
    const name = attribution.get(id) || 'Sin atribución confiable'
    channels.set(name, (channels.get(name) || 0) + 1)
  }
  const eventTypes = new Map<string, { events: number; users: Set<string> }>()
  for (const ev of events) {
    const item = eventTypes.get(ev.event_type) || { events: 0, users: new Set<string>() }
    item.events += 1
    item.users.add(ev.user_id)
    eventTypes.set(ev.event_type, item)
  }

  const uniqueAtsUsers = new Set(ats.map(a => a.user_id))
  const profileActivationRate = cohortIds.length ? Math.round(completedIds.size * 10_000 / cohortIds.length) / 100 : null
  return {
    contract: 'admin-product-metrics:observed-v2',
    period_days: days, period_start: periodStart, generated_at: now.toISOString(),
    include_tests: includeTests,
    definitions: {
      cohort: 'Identidades con su primer perfil observado creado en la ventana elegida',
      activity: 'Eventos y diagnósticos persistidos en la ventana, entre identidades históricas seleccionadas',
      test: 'TEST y UNKNOWN excluidos por defecto. Identidades mixtas en revisión siempre excluidas',
    },
    classification,
    lifetime: {
      profile_rows: profiles.length,
      selected_profile_rows: chosen.length,
      selected_linked_user_ids: chosenIds.length,
      selected_unlinked_profile_rows: unlinked,
      selected_duplicate_profile_rows: duplicateRows,
      mixed_classification_user_ids: mixed.size,
      authentication_verified: false,
    },
    registration: { cohort_unique_ids: cohortIds.length },
    activation: {
      profile_completed_in_cohort_current: completedIds.size,
      cv_currently_stored_in_cohort: cvIds.size,
      profile_current_completion_rate_pct: profileActivationRate,
      ats_diagnostics_saved_in_period: ats.length,
      ats_diagnostic_users_in_period: uniqueAtsUsers.size,
      cv_analysis_completed_users: null,
      cv_analysis_note: 'ATS persistido se mide por separado; no prueba éxito de todos los análisis de CV.',
    },
    attribution: {
      channels: [...channels].sort((a, b) => b[1] - a[1]).map(([channel, users]) => ({ channel, users })),
      attributed_unique_users: attribution.size,
      scope: 'Identidades seleccionadas históricas, no solo la cohorte nueva',
    },
    observed_events: {
      coverage: events.length ? 'PARTIAL_EVENTS' : 'NO_EVENTS', events: events.length,
      unique_users: new Set(events.map(e => e.user_id)).size,
      types: [...eventTypes].sort((a, b) => b[1].events - a[1].events)
        .map(([type, count]) => ({ type, events: count.events, users: count.users.size })),
    },
    retention: {
      dau: null, wau: null, mau: null, d7: null, d30: null,
      reason: 'Cobertura histórica de actividades significativas no demostrada. Los eventos observados no bastan para calcular retención.',
    },
    funnel: {
      registered: cohortIds.length,
      profile_completed: completedIds.size,
      first_successful_cv_analysis: null, returned_another_day: null,
      reason: 'Perfil actual observado; no hay eventos autoritativos para primer análisis general y retorno posterior.',
    },
  }
}
