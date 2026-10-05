export type RetrievalClass = 'MATCH' | 'POTENTIAL'
export type RetrievalStateStatus = 'PENDING' | 'SCANNING' | 'COMPLETE' | 'ERROR'
export type RetrievalLane = 'RECENT' | 'SEMANTIC' | 'BACKGROUND_MATCH' | 'BACKGROUND_POTENTIAL'

export type SourceIdentity = { canonical_source: string; emitted_aliases: readonly string[] }
export type SourcePolicy = { source: string; is_enabled: boolean | null; matching_enabled: boolean | null }
export type CanonicalSourcePolicyIndex = {
  canonical: Map<string, SourcePolicy>
  byEmitter: Map<string, SourcePolicy>
}

const normalized = (source: unknown) => String(source ?? '').trim().toLowerCase()
const explicitBoolean = (value: unknown): boolean | null => value === true ? true : value === false ? false : null

export function normalizeSourcePolicyRow(row: any): SourcePolicy {
  return { source: String(row?.source ?? ''), is_enabled: explicitBoolean(row?.is_enabled), matching_enabled: explicitBoolean(row?.matching_enabled) }
}

function canonicalPolicyName(source: unknown, identities: readonly SourceIdentity[], canonicalSource?: (source: unknown) => string) {
  const emitter = normalized(source)
  const identity = identities.find((item) => normalized(item.canonical_source) === emitter || item.emitted_aliases.some((alias) => normalized(alias) === emitter))
  return normalized(identity?.canonical_source ?? canonicalSource?.(emitter) ?? emitter)
}

export function sourcePolicySignatureRows(rows: SourcePolicy[], canonicalSource: (source: unknown) => string) {
  const policies = new Map<string, SourcePolicy>()
  for (const row of rows) {
    const source = normalized(canonicalSource(row.source))
    const is_enabled = explicitBoolean(row.is_enabled)
    const matching_enabled = explicitBoolean(row.matching_enabled)
    const existing = policies.get(source)
    if (existing && (existing.is_enabled !== is_enabled || existing.matching_enabled !== matching_enabled)) throw new Error('SOURCE_POLICY_ALIAS_CONFLICT')
    policies.set(source, { source, is_enabled, matching_enabled })
  }
  return [...policies.values()].sort((a, b) => a.source.localeCompare(b.source))
}

export async function sourcePolicySignature(rows: SourcePolicy[], canonicalSource: (source: unknown) => string, permissionRows: any[] = []) {
  const policies = sourcePolicySignatureRows(rows, canonicalSource)
  const permissions = new Map<string, string>()
  for (const row of permissionRows) {
    if (String(row?.consumer || '') !== 'matching') continue
    const source = normalized(canonicalSource(row.canonical_source ?? row.source))
    const state = String(row.permission_state ?? 'UNKNOWN')
    const previous = permissions.get(source)
    if (previous && previous !== state) throw new Error('SOURCE_POLICY_ALIAS_CONFLICT')
    permissions.set(source, state)
  }
  const signatureRows = policies.map(row => ({ ...row, matching_permission: permissions.get(row.source) ?? 'UNKNOWN' }))
  const bytes = new TextEncoder().encode(JSON.stringify(signatureRows))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function buildCanonicalSourcePolicyIndex(
  rows: SourcePolicy[],
  identities: readonly SourceIdentity[],
  canonicalSource?: (source: unknown) => string,
): CanonicalSourcePolicyIndex {
  const canonical = new Map<string, SourcePolicy>()
  for (const row of rows) {
    const source = canonicalPolicyName(row.source, identities, canonicalSource)
    const is_enabled = explicitBoolean(row.is_enabled)
    const matching_enabled = explicitBoolean(row.matching_enabled)
    const existing = canonical.get(source)
    if (existing && (existing.is_enabled !== is_enabled || existing.matching_enabled !== matching_enabled)) throw new Error('SOURCE_POLICY_ALIAS_CONFLICT')
    canonical.set(source, { source, is_enabled, matching_enabled })
  }
  const byEmitter = new Map(canonical)
  for (const identity of identities) {
    const policy = canonical.get(normalized(identity.canonical_source))
    if (!policy) continue
    byEmitter.set(normalized(identity.canonical_source), policy)
    for (const alias of identity.emitted_aliases) byEmitter.set(normalized(alias), policy)
  }
  return { canonical, byEmitter }
}

export function sourcePolicyFor(index: CanonicalSourcePolicyIndex, rawSource: unknown) {
  return index.byEmitter.get(normalized(rawSource)) ?? null
}

export function sourceMatchingAllowed(policy: Pick<SourcePolicy, 'is_enabled' | 'matching_enabled'> | null | undefined) {
  return policy?.is_enabled === true && policy.matching_enabled === true
}

export function expandEnabledSourceEmitters(index: CanonicalSourcePolicyIndex, identities: readonly SourceIdentity[]) {
  const emitters = new Map<string, string>()
  for (const [source, policy] of index.canonical) {
    if (!sourceMatchingAllowed(policy)) continue
    emitters.set(source, source)
    const identity = identities.find((item) => normalized(item.canonical_source) === source)
    for (const alias of identity?.emitted_aliases ?? []) {
      const rawAlias = String(alias).trim()
      if (rawAlias) emitters.set(normalized(rawAlias), rawAlias)
    }
  }
  return [...emitters.values()].sort((a, b) => a.localeCompare(b))
}

export function retrievalCacheIsCurrent(candidate: any, state: any, profileSignature: string, policySignature: string) {
  return Boolean(candidate && state
    && candidate.profile_signature === profileSignature
    && state.profile_signature === profileSignature
    && state.source_policy_signature === policySignature)
}

export function opportunityCacheIsCurrent(candidate: any, opportunity: any) {
  return Boolean(candidate?.opportunity_content_fingerprint
    && opportunity?.content_fingerprint
    && candidate.opportunity_content_fingerprint === opportunity.content_fingerprint)
}

export function deltaRowInSnapshot(updatedAt: string | null | undefined, watermark: string, cutoff: string) {
  return Boolean(updatedAt && updatedAt > watermark && updatedAt <= cutoff)
}

export function mergeRetrievalSimilarities(background: Map<string, number>, liveSemantic: Map<string, number>) {
  const merged = new Map(background)
  for (const [id, score] of liveSemantic) merged.set(id, score)
  return merged
}

export function unionRetrievalLanes(lanes: Array<{ lane: RetrievalLane; rows: any[] }>) {
  const byId = new Map<string, { opportunity: any; lanes: Set<RetrievalLane> }>()
  for (const { lane, rows } of lanes) for (const opportunity of rows) {
    const id = String(opportunity.id ?? '')
    if (!id) continue
    const current = byId.get(id) ?? { opportunity, lanes: new Set<RetrievalLane>() }
    current.lanes.add(lane)
    byId.set(id, current)
  }
  return [...byId.values()]
}

export function cacheCandidateAlertEligible(candidate: any, opportunity: any, alertWindowStart: string) {
  return candidate?.candidate_class === 'MATCH'
    && (candidate.evaluation_lane === 'INCREMENTAL'
      || opportunity?.created_at >= alertWindowStart
      || opportunity?.updated_at >= alertWindowStart)
}

export type AlertCacheCursor = { evaluated_at: string; user_id: string; opportunity_id: string }

/** Read one page only. The caller persists its cursor with pending delivery effects. */
export async function collectAlertCandidateSnapshot(
  fetchPage: (after: AlertCacheCursor | null, limit: number) => Promise<any[]>,
  pageSize = 100,
  cursor: AlertCacheCursor | null = null,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('INVALID_ALERT_CACHE_PAGE_SIZE')
  const rows = await fetchPage(cursor, pageSize)
  if (rows.length > pageSize) throw new Error('ALERT_CACHE_PAGE_OVERFLOW')
  const last = rows[rows.length - 1]
  const next = last ? { evaluated_at: String(last.evaluated_at), user_id: String(last.user_id), opportunity_id: String(last.opportunity_id) } : cursor
  if (last && cursor && (next!.evaluated_at < cursor.evaluated_at || (next!.evaluated_at === cursor.evaluated_at && next!.user_id < cursor.user_id) || (next!.evaluated_at === cursor.evaluated_at && next!.user_id === cursor.user_id && next!.opportunity_id <= cursor.opportunity_id))) throw new Error('ALERT_CACHE_CURSOR_DID_NOT_ADVANCE')
  return { rows, cursor: next, complete: rows.length < pageSize }
}

export function cursorAfterPage(rows: any[], timestampField: 'created_at' | 'updated_at') {
  if (!rows.length) return null
  const last = rows[rows.length - 1]
  return { at: String(last[timestampField]), id: String(last.id) }
}

/** Cursor is persisted only after all page effects have completed successfully. */
export async function commitRetrievalPage<T>(rows: T[], process: (rows: T[]) => Promise<void>, persistCursor: () => Promise<void>) {
  await process(rows)
  await persistCursor()
}

export function classifyInventoryRow(row: any, policy: SourcePolicy | null, now: string) {
  if (row.is_active === false) return { included: false, reason: 'INACTIVE', class: 'LIFECYCLE_EXCLUSION', certainty: 'VALID_EXCLUSION' }
  if (row.is_active !== true) return { included: false, reason: 'ACTIVE_STATE_UNKNOWN', class: 'UNRESOLVED', certainty: 'UNRESOLVED' }
  if (row.verification_status && row.verification_status !== 'verified') return { included: false, reason: 'NOT_VERIFIED', class: 'LIFECYCLE_EXCLUSION', certainty: 'VALID_EXCLUSION' }
  if (!row.verification_status) return { included: false, reason: 'VERIFICATION_STATE_UNKNOWN', class: 'UNRESOLVED', certainty: 'UNRESOLVED' }
  if (row.deleted_at) return { included: false, reason: 'DELETED', class: 'LIFECYCLE_EXCLUSION', certainty: 'VALID_EXCLUSION' }
  if (row.archived_at) return { included: false, reason: 'ARCHIVED', class: 'LIFECYCLE_EXCLUSION', certainty: 'VALID_EXCLUSION' }
  if (row.deadline && row.deadline < now) return { included: false, reason: 'DEADLINE_EXPIRED', class: 'LIFECYCLE_EXCLUSION', certainty: 'VALID_EXCLUSION' }
  if (!policy) return { included: false, reason: 'SOURCE_POLICY_UNKNOWN', class: 'UNRESOLVED', certainty: 'UNRESOLVED' }
  if (policy.is_enabled === false) return { included: false, reason: 'SOURCE_DISABLED', class: 'SOURCE_POLICY', certainty: 'VALID_EXCLUSION' }
  if (policy.is_enabled !== true) return { included: false, reason: 'SOURCE_POLICY_UNKNOWN', class: 'UNRESOLVED', certainty: 'UNRESOLVED' }
  if (policy.matching_enabled !== true) {
    if (policy.matching_enabled === false) return { included: false, reason: 'SOURCE_MATCHING_DISABLED', class: 'SOURCE_POLICY', certainty: 'VALID_EXCLUSION' }
    return { included: false, reason: 'SOURCE_MATCHING_POLICY_UNKNOWN', class: 'UNRESOLVED', certainty: 'UNRESOLVED' }
  }
  if (row.match_eligible !== true) {
    if (row.match_eligibility_stale === true) return { included: false, reason: 'MATCH_ELIGIBILITY_STALE', class: 'STALE_DERIVED_STATE', certainty: 'STALE_DERIVED_STATE' }
    return { included: false, reason: 'MATCH_ELIGIBILITY_UNEXPLAINED', class: 'UNRESOLVED', certainty: 'UNRESOLVED' }
  }
  return { included: true, reason: 'SOURCE_ALLOWED_MATCH_ELIGIBLE', class: 'INCLUDED', certainty: 'SOURCE_ALLOWED' }
}

export function inventoryFunnelPage(rows: any[], policies: CanonicalSourcePolicyIndex, cutoff: string) {
  const counts: Record<string, any> = { TOTAL_INVENTORY: rows.length, WHY_NOT_MATCH_UNIVERSE: {}, EXCLUSION_CLASSES: {} }
  const eligible: any[] = []
  for (const row of rows) {
    const policy = sourcePolicyFor(policies, row.source)
    if (row.is_active === true) {
      counts.ACTIVE = (counts.ACTIVE ?? 0) + 1
      if (row.verification_status === 'verified') {
        counts.VERIFIED = (counts.VERIFIED ?? 0) + 1
        if (!row.deleted_at) {
          counts.NOT_DELETED = (counts.NOT_DELETED ?? 0) + 1
          if (!row.archived_at) {
            counts.NOT_ARCHIVED = (counts.NOT_ARCHIVED ?? 0) + 1
            if (!row.deadline || row.deadline >= cutoff) {
              counts.DEADLINE_ACTIVE = (counts.DEADLINE_ACTIVE ?? 0) + 1
              if (row.match_eligible === true) {
                counts.MATCH_ELIGIBLE = (counts.MATCH_ELIGIBLE ?? 0) + 1
                if (sourceMatchingAllowed(policy)) counts.SOURCE_ALLOWED = (counts.SOURCE_ALLOWED ?? 0) + 1
              }
            }
          }
        }
      }
    }
    const classification = classifyInventoryRow(row, policy, cutoff)
    if (classification.included) {
      eligible.push({ ...row, source_match_state: 'ALLOWED' })
      if (!String(row.title ?? '').trim() || !String(row.content_fingerprint ?? '').trim()) counts.DATA_QUALITY_GAP_MATCH_INPUT = (counts.DATA_QUALITY_GAP_MATCH_INPUT ?? 0) + 1
      if (!String(row.title ?? '').trim() || !String(row.content_fingerprint ?? '').trim()) counts.EXCLUSION_CLASSES.DATA_QUALITY_GAP = (counts.EXCLUSION_CLASSES.DATA_QUALITY_GAP ?? 0) + 1
    } else {
      const reason = classification.reason
      counts.WHY_NOT_MATCH_UNIVERSE[reason] = (counts.WHY_NOT_MATCH_UNIVERSE[reason] ?? 0) + 1
      counts.EXCLUSION_CLASSES[classification.class] = (counts.EXCLUSION_CLASSES[classification.class] ?? 0) + 1
      if (classification.certainty === 'VALID_EXCLUSION') counts.EXCLUSION_CLASSES.VALID_EXCLUSION = (counts.EXCLUSION_CLASSES.VALID_EXCLUSION ?? 0) + 1
    }
  }
  return { counts, eligible }
}

export function mergeInventoryFunnelCounts(target: Record<string, any>, delta: Record<string, any>) {
  for (const [key, value] of Object.entries(delta)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] ??= {}
      mergeInventoryFunnelCounts(target[key], value)
    } else if (typeof value === 'number') target[key] = (target[key] ?? 0) + value
  }
  return target
}

export function classifyBackgroundCoverage(state: any, profileSignature: string, policySignature: string) {
  if (!state) return 'NO_SCAN'
  if (state.profile_signature !== profileSignature || state.source_policy_signature !== policySignature) return 'STALE'
  if (state.scan_status === 'ERROR') return 'ERROR'
  return state.scan_status === 'COMPLETE' ? 'COMPLETE' : 'PARTIAL'
}
