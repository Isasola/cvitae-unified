export type RetrievalSchedulerReason = 'PENDING' | 'SCANNING' | 'ERROR' | 'STALE' | 'NO_STATE' | 'DELTA_PENDING'
export type RetrievalSchedulerCandidate<T = any> = { profile: T; scheduler_reason: RetrievalSchedulerReason }

const idOf = (candidate: RetrievalSchedulerCandidate) => String(candidate.profile?.user_id ?? '')

/** Priorities are explicit; idle COMPLETE profiles are omitted by construction. */
export function prioritizeRetrievalUsers<T>(
  maxUsers: number,
  groups: Record<RetrievalSchedulerReason, Array<RetrievalSchedulerCandidate<T>>>,
) {
  const selected: Array<RetrievalSchedulerCandidate<T>> = []
  const seen = new Set<string>()
  const priority: RetrievalSchedulerReason[] = ['PENDING', 'SCANNING', 'ERROR', 'STALE', 'NO_STATE', 'DELTA_PENDING']
  for (const reason of priority) {
    for (const candidate of groups[reason]) {
      const id = idOf(candidate)
      if (!id || seen.has(id)) continue
      selected.push(candidate)
      seen.add(id)
      if (selected.length >= maxUsers) return selected
    }
  }
  return selected
}

/** Advances only through the contiguous scanned prefix, never past an unselected
 * stale/no-state profile. This keeps a bounded keyset walk fair across runs. */
export function nextRetrievalSchedulerCursor<T>(
  scanned: Array<RetrievalSchedulerCandidate<T>>,
  selected: Array<RetrievalSchedulerCandidate<T>>,
  safelySkippedUserIds: Set<string>,
  currentCursor: string | null,
) {
  const selectedIds = new Set(selected.map(idOf))
  let next = currentCursor
  for (const candidate of scanned) {
    const id = idOf(candidate)
    if (selectedIds.has(id) || safelySkippedUserIds.has(id)) {
      next = id
      continue
    }
    break
  }
  return next
}
