import { sourceProducerExecution } from './effective-source-policy'
import { SOURCE_PERMISSION_DIMENSIONS, sourcePermissionDimensionTruth } from './source-permission-truth'

export type SourceScope = 'FULL_DB' | 'SAMPLED' | 'LAST_RUN' | 'LAST_N_RUNS' | 'DERIVED' | 'UNKNOWN' | 'UNAVAILABLE'

/** Bounded Admin projection of existing telemetry/ledger/policy, never a gate owner. */
export function sourceDoorDiagnostics(profile: any, policy: any, run: any, gates: any[] = [], ledger?: any) {
  const stage = (name: string, status: string, reason: string, next_action: string, evidence: any = null) => ({ name, status, reason, next_action, evidence })
  const fromGate = (name: string, index: number, next: string) => {
    const value = gates[index]
    return stage(name, value?.status || 'NOT_EVALUATED', value?.reason_code || 'NO_STAGE_EVIDENCE', next,
      { scope: 'SAMPLED_OR_LAST_RUN', ...Object.fromEntries(Object.entries(value?.metrics || {}).filter(([, item]) => item == null || ['number', 'boolean'].includes(typeof item) || typeof item === 'string' && item.length <= 120)) })
  }
  const metrics = run?.extraction_metrics || {}
  const executed = (name: string, value: unknown, expected: unknown) => stage(name,
    typeof value === 'string' && !/^(LEGACY|NOT_REPORTED|UNKNOWN|unvalidated)/i.test(value) ? 'PASS' : 'NOT_EVALUATED',
    value ? String(value).slice(0, 120) : 'EXECUTION_NOT_REPORTED', 'INSPECT_PRODUCER_PROVENANCE', { executed: value || null, expected: expected || null })
  const producer = sourceProducerExecution(profile.canonical_source)
  const stages = [producer.state === 'NO_EXECUTABLE_PRODUCER'
    ? stage('DISCOVERY/FETCH','FAIL','NO_EXECUTABLE_PRODUCER','IMPLEMENT_OR_REGISTER_EXISTING_PRODUCER',producer)
    : fromGate('DISCOVERY/FETCH', 0, 'INSPECT_PRODUCER_RUN'),
    // Observation/HTTP success is not extraction execution evidence.
    metrics.eight_gates?.gate_2 ? fromGate('EXTRACTION', 1, 'INSPECT_EXTRACTION_FIELDS')
      : stage('EXTRACTION', 'NOT_EVALUATED', 'EXTRACTION_NOT_REPORTED', 'INSPECT_EXTRACTION_FIELDS'),
    executed('ADAPTER', run?.adapter_version, profile.adapter_version),
    executed('CLEANER/NORMALIZATION', metrics.executed_cleaner_version, profile.cleaner_version),
    fromGate('SINK/PERSISTENCE', 4, 'INSPECT_PERSISTENCE_RECEIPTS'),
    stage('INGESTION TRACE', !ledger ? 'NOT_EVALUATED' : ledger.ingestion_trace_incomplete > 0 ? 'FAIL' : ledger.ingestion_traced === ledger.inventory && ledger.inventory > 0 ? 'PASS' : 'NOT_EVALUATED',
      !ledger ? 'LEDGER_UNAVAILABLE' : ledger.ingestion_trace_incomplete > 0 ? 'TRACE_INCOMPLETE' : 'HISTORICAL_OR_TRACED_COUNTS', 'INSPECT_ROW_INGESTION_TRACE', ledger ? { traced: ledger.ingestion_traced, incomplete: ledger.ingestion_trace_incomplete, inventory: ledger.inventory } : null),
    stage('OBSERVATION', !ledger ? 'NOT_EVALUATED' : ledger.observation_missing > 0 ? 'WARNING' : 'PASS',
      !ledger ? 'LEDGER_UNAVAILABLE' : ledger.observation_missing > 0 ? 'OBSERVATION_MISSING' : 'OBSERVATION_PRESENT', 'SOURCE_REFRESH', ledger ? { missing: ledger.observation_missing } : null),
    stage('FACTORY', !ledger ? 'NOT_EVALUATED' : ledger.factory_blocked > 0 || ledger.factory_review > 0 || ledger.factory_pending > 0 ? 'WARNING' : ledger.factory_ready > 0 ? 'PASS' : 'NOT_EVALUATED', 'FACTORY_COUNTS', 'INSPECT_FACTORY_LEDGER', ledger ? { ready: ledger.factory_ready, review: ledger.factory_review, pending: ledger.factory_pending, blocked: ledger.factory_blocked } : null),
    stage('LIFECYCLE', !ledger ? 'NOT_EVALUATED' : ledger.lifecycle_unknown > 0 ? 'WARNING' : ledger.lifecycle_active_valid > 0 ? 'PASS' : 'NOT_EVALUATED', 'LIFECYCLE_COUNTS', 'INSPECT_ROW_LIFECYCLE', ledger ? { active_valid: ledger.lifecycle_active_valid, unknown: ledger.lifecycle_unknown } : null),
    fromGate('ROW READINESS', 3, 'INSPECT_ROW_MISSING_FIELDS'),
  ]
  const permissions = Object.fromEntries(SOURCE_PERMISSION_DIMENSIONS.map(dimension => {
    const truth = sourcePermissionDimensionTruth(profile.canonical_source, dimension)
    // Full reason/provenance already lives in source_permission_truth on the
    // same source response. Do not serialize a second permission registry.
    return [dimension, { state: truth.state, role: ['catalog','matching','alerts','seo_index'].includes(dimension) ? 'ADVISORY_FIRST_PARTY' : 'SPECIFIC_DIMENSION' }]
  }))
  stages.push(stage('CONSUMER PERMISSION', 'INFORMATIONAL', 'INDEPENDENT_DIMENSIONS', 'INSPECT_EXACT_CONSUMER_PERMISSION', permissions))
  const explicitKill = Object.values(policy?.consumer_switch_overrides || {}).some(value => value === false)
  stages.push(stage('OPERATOR SWITCH', !policy ? 'NOT_EVALUATED' : explicitKill || policy.is_enabled === false ? 'WARNING' : 'INFORMATIONAL',
    !policy ? 'SOURCE_POLICY_UNKNOWN' : explicitKill ? 'EXPLICIT_OPERATOR_KILL' : policy.is_enabled === false ? 'SOURCE_OPERATIONALLY_DISABLED' : 'CANONICAL_OPERATIONAL_SWITCHES', 'INSPECT_ADMIN_POLICY_EVENTS',
    policy ? { is_enabled: policy.is_enabled, catalog: policy.catalog_enabled, matching: policy.matching_enabled, alerts: policy.alerts_enabled, seo: policy.seo_enabled, explicit_overrides: policy.consumer_switch_overrides || {} } : null))
  stages.push(stage('FINAL ROUTING', ledger ? 'INFORMATIONAL' : 'NOT_EVALUATED', ledger ? 'PERSISTED_UNIVERSE_COUNTS' : 'LEDGER_UNAVAILABLE', 'INSPECT_CURRENT_UNIVERSE_ROW_RPC',
    ledger ? { catalog: ledger.catalog_ready, matching: ledger.matching_ready, alerts: ledger.alerts_ready, seo: ledger.seo_ready, authority: 'PERSISTED_LEDGER_AGGREGATE', current_row: 'ON_DEMAND_RPC' } : null))
  const failure = stages.find(item => item.status === 'FAIL')
  const unconfirmed = stages.find(item => ['FAIL', 'WARNING', 'NOT_EVALUATED'].includes(item.status))
  return { scope: 'SOURCE_SUMMARY_NO_ROW_PAYLOAD', producer_execution: producer, stages, first_failure: failure || null,
    first_unconfirmed: unconfirmed || null, next_action: (failure || unconfirmed)?.next_action || 'NONE' }
}

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
