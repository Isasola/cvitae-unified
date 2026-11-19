export const MATCHING_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type MatchingFreshnessReason =
  | 'CURRENT'
  | 'PROFILE_CHANGED'
  | 'AGE_EXPIRED'
  | 'PROFILE_CHANGED_AND_AGE_EXPIRED'
  | 'MISSING_PROFILE_SIGNATURE'
  | 'NO_RUN'
  | 'RUN_ERROR'
  | 'INVALID_RUN_TIMESTAMP'

export type MatchingDisplayStatus =
  | 'NO_RUN'
  | 'ERROR'
  | 'STALE'
  | 'SUCCESS_ZERO'
  | 'SUCCESS_WITH_RESULTS'

export interface MatchingRunState {
  status: MatchingDisplayStatus
  reason: MatchingFreshnessReason
  is_current: boolean
  age_expired: boolean
  profile_changed: boolean
  run_at: string | null
  profile_updated_at: string | null
  snapshot_profile_signature: string | null
  current_profile_signature: string | null
}

/**
 * One freshness decision shared by the authenticated candidate and Admin.
 * Historical snapshots remain useful evidence, but are never current results.
 */
export function matchingRunState(
  snapshot: any | null | undefined,
  currentProfileSignature?: string | null,
  now = Date.now(),
  maxAgeMs = MATCHING_MAX_AGE_MS,
): MatchingRunState {
  const base = {
    run_at: snapshot?.run_at ?? null,
    profile_updated_at: snapshot?.profile_updated_at ?? null,
    snapshot_profile_signature: snapshot?.profile_signature ?? null,
    current_profile_signature: currentProfileSignature ?? null,
  }
  if (!snapshot) return { ...base, status: 'NO_RUN', reason: 'NO_RUN', is_current: false, age_expired: false, profile_changed: false }
  if (snapshot.run_status === 'ERROR') return { ...base, status: 'ERROR', reason: 'RUN_ERROR', is_current: false, age_expired: false, profile_changed: false }

  const runTime = Date.parse(String(snapshot.run_at || ''))
  if (!Number.isFinite(runTime)) return { ...base, status: 'STALE', reason: 'INVALID_RUN_TIMESTAMP', is_current: false, age_expired: true, profile_changed: false }
  const ageExpired = now - runTime > maxAgeMs
  const snapshotSignature = String(snapshot.profile_signature || '')
  const currentSignature = String(currentProfileSignature || '')
  if (!snapshotSignature || !currentSignature) {
    return { ...base, status: 'STALE', reason: 'MISSING_PROFILE_SIGNATURE', is_current: false, age_expired: ageExpired, profile_changed: false }
  }
  const profileChanged = snapshotSignature !== currentSignature
  if (profileChanged || ageExpired) {
    const reason = profileChanged && ageExpired
      ? 'PROFILE_CHANGED_AND_AGE_EXPIRED'
      : profileChanged ? 'PROFILE_CHANGED' : 'AGE_EXPIRED'
    return { ...base, status: 'STALE', reason, is_current: false, age_expired: ageExpired, profile_changed: profileChanged }
  }
  return {
    ...base,
    status: Number(snapshot.match_count || 0) > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_ZERO',
    reason: 'CURRENT',
    is_current: true,
    age_expired: false,
    profile_changed: false,
  }
}
