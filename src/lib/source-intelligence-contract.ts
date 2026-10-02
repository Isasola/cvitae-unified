export type SourceScope = 'FULL_DB' | 'SAMPLED' | 'LAST_RUN' | 'LAST_N_RUNS' | 'DERIVED' | 'UNKNOWN' | 'UNAVAILABLE'

export function firstNonConfirmedRequiredStage(gates: Array<{ status?: string }> = []) {
  return gates.findIndex(gate => !['PASS', 'NOT_APPLICABLE'].includes(String(gate.status || 'NOT_EVALUATED')))
}

export function summarizeSourceHealth(gates: Array<{ status?: string }> = []) {
  const failing = gates.filter(gate => gate.status === 'FAIL')
  const warnings = gates.filter(gate => gate.status === 'WARNING')
  const notEvaluated = gates.filter(gate => gate.status === 'NOT_EVALUATED')
  return {
    overall_health: failing.length ? 'CRITICAL' : notEvaluated.length ? 'UNKNOWN' : warnings.length ? 'DEGRADED' : 'HEALTHY',
    first_non_confirmed_required_stage: firstNonConfirmedRequiredStage(gates),
    failing_gates: failing.length,
    warning_gates: warnings.length,
    not_evaluated_gates: notEvaluated.length,
  }
}

export function indexRowsBySource<T extends Record<string, any>>(rows: T[] = []) {
  const index = new Map<string, T[]>()
  for (const row of rows) {
    const source = String(row.source || '').toLowerCase()
    if (!source) continue
    const bucket = index.get(source)
    if (bucket) bucket.push(row)
    else index.set(source, [row])
  }
  return index
}

export function rowsForAliases<T>(index: Map<string, T[]>, aliases: string[]) {
  return aliases.flatMap(alias => index.get(String(alias).toLowerCase()) || [])
}

export function latestRowsByKey<T extends Record<string, any>>(rows: T[], key: keyof T) {
  const latest = new Map<string, T>()
  for (const row of rows) {
    const value = String(row[key] || '')
    if (value && !latest.has(value)) latest.set(value, row)
  }
  return [...latest.values()]
}

export function selectEffectiveDiagnosis(snapshotSource: any, freshDiagnosis: any, selectedSource: string | null) {
  if (freshDiagnosis && selectedSource && String(freshDiagnosis.source || '').toLowerCase() === selectedSource.toLowerCase()) {
    return { ...snapshotSource, ...freshDiagnosis, _diagnosis_scope: 'FRESH', eight_gates: freshDiagnosis.eight_gates || snapshotSource?.eight_gates }
  }
  return snapshotSource
}

export function scopedMetric(total: number | null | undefined, sampled: number, totalScope: SourceScope = 'FULL_DB') {
  return {
    total: typeof total === 'number' ? total : null,
    sampled,
    total_scope: typeof total === 'number' ? totalScope : 'UNAVAILABLE',
    sample_scope: 'SAMPLED' as SourceScope,
  }
}
