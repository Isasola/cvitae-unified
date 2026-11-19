export type UniverseMaintenanceStatus = 'COMPLETE' | 'RESUMABLE'

export type DirtyRefreshResponse = {
  pending_sources: number
  sources_refreshed: number
  opportunities_refreshed: number
  page_size: 250
}

const nonNegativeInteger = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`INVALID_RPC_RESPONSE:${field}`)
  }
  return value
}

export function parseDueRefreshCount(value: unknown): number {
  return nonNegativeInteger(value, 'due_rows_refreshed')
}

export function parseDirtyRefreshResponse(value: unknown): DirtyRefreshResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RPC_RESPONSE:object')
  const response = value as Record<string, unknown>
  if (response.page_size !== 250) throw new Error('INVALID_RPC_RESPONSE:page_size')
  return {
    pending_sources: nonNegativeInteger(response.pending_sources, 'pending_sources'),
    sources_refreshed: nonNegativeInteger(response.sources_refreshed, 'sources_refreshed'),
    opportunities_refreshed: nonNegativeInteger(response.opportunities_refreshed, 'opportunities_refreshed'),
    page_size: 250,
  }
}

export function maintenanceCompletion(pendingSources: number): { status: UniverseMaintenanceStatus; continuation_required: boolean } {
  const pending = nonNegativeInteger(pendingSources, 'pending_sources')
  return { status: pending === 0 ? 'COMPLETE' : 'RESUMABLE', continuation_required: pending > 0 }
}

export function nextNoProgressWindows(previous: unknown, progressed: boolean): number {
  if (progressed) return 0
  const prior = typeof previous === 'number' && Number.isInteger(previous) && previous >= 0 ? previous : 0
  return prior + 1
}

export function maintenanceIsStalled(
  pendingSources: number,
  oldestPendingAgeSeconds: number | null,
  consecutiveNoProgressWindows: number,
  minimumAgeSeconds = 2 * 60 * 60,
): boolean {
  const pending = nonNegativeInteger(pendingSources, 'pending_sources')
  const windows = nonNegativeInteger(consecutiveNoProgressWindows, 'consecutive_no_progress_windows')
  return pending > 0 && windows >= 2 && oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds >= minimumAgeSeconds
}
