import { canonicalSource, effectiveSourceSwitches, registeredSourceOperationalDefault } from './effective-source-policy'
import { catalogReadiness, deadlineLifecycle, seoContentReadinessIndependentOfLifecycle, seoReadiness } from './opportunity-truth'
import { hasProfessionalEvidence } from '../../shared/professional-evidence'
import { SOURCE_PERMISSION_DIMENSIONS, sourcePermissionDimensionTruth, sourcePermissionTruth } from './source-permission-truth'

export type UniverseState = 'READY' | 'NOT_READY' | 'UNKNOWN'
export type LifecycleState = 'ACTIVE_VALID' | 'EXPIRED' | 'DELETED' | 'ARCHIVED' | 'HARD_DEAD' | 'SUPERSEDED_DUPLICATE' | 'INACTIVE_VALID' | 'STALE_DERIVED_STATE' | 'LIFECYCLE_UNKNOWN'
export type PermissionState = 'ALLOWED' | 'DENIED' | 'UNKNOWN'
export type UniversePolicy = import('./effective-source-policy').SourcePolicyRow

const permission = sourcePermissionTruth

function timestamp(value: unknown): number | null {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

export type OpportunityUniverseDecision = {
  id: string
  inventory_state: 'PRESENT'
  lifecycle_state: LifecycleState
  lifecycle_reason: string
  lifecycle_repair: { is_active?: boolean } | null
  professional_readiness: 'PROFESSIONAL_READY' | 'PROFESSIONAL_THIN' | 'PROFESSIONAL_UNKNOWN'
  professional_reason: string
  catalog_row_state: UniverseState
  catalog_state: UniverseState
  alerts_row_state: UniverseState
  seo_row_state: UniverseState
  seo_row_reason: string
  seo_content_readiness_independent_of_lifecycle: 'READY' | 'NOT_READY'
  seo_content_reason: string
  seo_effective_reason: string
  lifecycle_unresolved_reason: string | null
  lifecycle_recovery_class: 'RECOVERABLE_NOW' | 'REFRESH_REQUIRED' | 'CONTENT_NOT_READY' | 'SYSTEM_ERROR' | 'EXPLICITLY_INACTIVE' | 'NOT_UNRESOLVED'
  matching_row_state: UniverseState
  matching_row_reason: string
  source_matching_state: PermissionState
  source_matching_reason: string
  source_matching_provenance: string
  source_matching_operational_state: PermissionState
  source_matching_operational_reason: string
  catalog_operational_state: PermissionState
  alerts_operational_state: PermissionState
  seo_operational_state: PermissionState
  source_operational_state: 'ENABLED' | 'DISABLED' | 'UNKNOWN' | 'CONFLICT'
  source_operational_reason: string
  source_policy_alias_conflicts: string[]
  final_matching_state: UniverseState
  seo_state: UniverseState
  alerts_state: UniverseState
  unresolved_dimensions: string[]
  source_permission_unknown_dimensions: string[]
  provenance: Record<string, unknown>
}

export function opportunitySourcePermission(rawSource: string | null | undefined, consumer: 'catalog' | 'matching' | 'alerts' | 'seo') {
  return permission(canonicalSource(rawSource), consumer)
}

export function classifyOpportunityUniverse(row: Record<string, any>, policyRows: UniversePolicy[], observation?: Record<string, any> | null, now = new Date(), permissionResolver = permission, priorDecision?: Record<string, any> | null): OpportunityUniverseDecision {
  const source = canonicalSource(row.source)
  const sourcePolicies = policyRows.filter(item => canonicalSource(item.source) === source).map(item => effectiveSourceSwitches(item, permissionResolver))
  const enabledValues = new Set(sourcePolicies.map(item => item.is_enabled === true ? 'true' : item.is_enabled === false ? 'false' : 'unknown'))
  const matchingValues = new Set(sourcePolicies.map(item => item.matching_enabled === true ? 'true' : item.matching_enabled === false ? 'false' : 'unknown'))
  const catalogValues = new Set(sourcePolicies.map(item => item.catalog_enabled === true ? 'true' : item.catalog_enabled === false ? 'false' : 'unknown'))
  const alertsValues = new Set(sourcePolicies.map(item => item.alerts_enabled === true ? 'true' : item.alerts_enabled === false ? 'false' : 'unknown'))
  const seoValues = new Set(sourcePolicies.map(item => item.seo_enabled === true ? 'true' : item.seo_enabled === false ? 'false' : 'unknown'))
  const aliasConflicts = [
    ...(enabledValues.size > 1 ? ['is_enabled'] : []),
    ...(matchingValues.size > 1 ? ['matching_enabled'] : []),
    ...(catalogValues.size > 1 ? ['catalog_enabled'] : []),
    ...(alertsValues.size > 1 ? ['alerts_enabled'] : []),
    ...(seoValues.size > 1 ? ['seo_enabled'] : []),
  ]
  const policyConflict = aliasConflicts.length > 0
  const globalPolicyConflict = enabledValues.size > 1
  const policyUnknown = sourcePolicies.length === 0 || enabledValues.has('unknown')
  const matchingPolicyUnknown = sourcePolicies.length === 0 || matchingValues.has('unknown')
  const operationalState = (values: Set<string>, dimension: string): PermissionState => sourcePolicies.length === 0 || globalPolicyConflict || aliasConflicts.includes(dimension) || values.has('unknown') ? 'UNKNOWN' : values.has('false') ? 'DENIED' : 'ALLOWED'
  const catalogOperational = operationalState(catalogValues, 'catalog_enabled')
  const alertsOperational = operationalState(alertsValues, 'alerts_enabled')
  const seoOperational = operationalState(seoValues, 'seo_enabled')
  const policy = sourcePolicies[0]
  const deleted = Boolean(row.deleted_at)
  const archived = Boolean(row.archived_at)
  const deadline = deadlineLifecycle(row.deadline, now)
  const observedAt = timestamp(observation?.observed_at)
  const rowUpdatedAt = timestamp(row.updated_at)
  const priorEvidenceAccepted = Boolean(observation?.id && priorDecision?.provenance?.observation_id === observation.id && ['LATEST_HARD_DEAD_OBSERVATION', 'LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE', 'LATEST_LIVE_OBSERVATION_RESOLVES_UNKNOWN_ACTIVE'].includes(String(priorDecision?.lifecycle_reason || '')))
  const newerThanRow = priorEvidenceAccepted || (observedAt !== null && (rowUpdatedAt === null || observedAt > rowUpdatedAt))
  const hardDead = newerThanRow && ['DEAD', 'REMOVED'].includes(String(observation?.identity_status || '')) && [404, 410].includes(Number(observation?.http_status))
  const latestLive = newerThanRow && observation?.identity_status === 'IDENTITY_CONFIRMED' && Number(observation?.http_status) === 200
  let lifecycle_state: LifecycleState
  let lifecycle_reason: string
  let lifecycle_repair: { is_active?: boolean } | null = null
  if (deleted) { lifecycle_state = 'DELETED'; lifecycle_reason = 'ROW_DELETED' }
  else if (archived) { lifecycle_state = 'ARCHIVED'; lifecycle_reason = 'ROW_ARCHIVED' }
  else if (deadline === 'EXPIRED') { lifecycle_state = 'EXPIRED'; lifecycle_reason = 'DEADLINE_EXPIRED' }
  else if (hardDead) { lifecycle_state = 'HARD_DEAD'; lifecycle_reason = 'LATEST_HARD_DEAD_OBSERVATION'; lifecycle_repair = row.is_active === false ? null : { is_active: false } }
  else if (row.is_active !== true && latestLive) { lifecycle_state = 'STALE_DERIVED_STATE'; lifecycle_reason = row.is_active === false ? 'LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE' : 'LATEST_LIVE_OBSERVATION_RESOLVES_UNKNOWN_ACTIVE'; lifecycle_repair = row.verification_status === 'verified' ? { is_active: true } : null }
  else if (row.is_active === true && row.verification_status === 'verified' && deadline !== 'INVALID') { lifecycle_state = 'ACTIVE_VALID'; lifecycle_reason = deadline === 'UNKNOWN' ? 'ACTIVE_VERIFIED_NO_DEADLINE' : 'ACTIVE_VERIFIED_DEADLINE_OPEN' }
  else if (row.is_active === false && ['rejected', 'quarantined'].includes(String(row.verification_status || ''))) { lifecycle_state = 'INACTIVE_VALID'; lifecycle_reason = `VERIFICATION_${String(row.verification_status).toUpperCase()}` }
  else { lifecycle_state = 'LIFECYCLE_UNKNOWN'; lifecycle_reason = deadline === 'INVALID' ? 'DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN' : 'INSUFFICIENT_LIFECYCLE_EVIDENCE' }

  const lifecycleReady = lifecycle_state === 'ACTIVE_VALID'
  const professional = hasProfessionalEvidence(row)
  const professional_readiness = lifecycleReady ? (professional ? 'PROFESSIONAL_READY' : 'PROFESSIONAL_THIN') : 'PROFESSIONAL_UNKNOWN'
  const professional_reason = lifecycleReady ? (professional ? 'PROFESSIONAL_EVIDENCE_SUFFICIENT' : 'INSUFFICIENT_PROFESSIONAL_EVIDENCE') : 'LIFECYCLE_NOT_READY'
  const matching_row_state: UniverseState = !lifecycleReady ? (lifecycle_state === 'LIFECYCLE_UNKNOWN' || lifecycle_state === 'STALE_DERIVED_STATE' ? 'UNKNOWN' : 'NOT_READY') : professional ? 'READY' : 'NOT_READY'
  const matching_row_reason = !lifecycleReady ? lifecycle_reason : professional ? 'PROFESSIONAL_EVIDENCE_SUFFICIENT' : 'INSUFFICIENT_PROFESSIONAL_EVIDENCE'
  const sourcePermission = permissionResolver(source, 'matching')
  const source_matching_operational_state: PermissionState = globalPolicyConflict || aliasConflicts.includes('matching_enabled') || matchingPolicyUnknown ? 'UNKNOWN' : matchingValues.has('false') ? 'DENIED' : 'ALLOWED'
  const source_matching_operational_reason = globalPolicyConflict || aliasConflicts.includes('matching_enabled') ? 'SOURCE_POLICY_ALIAS_CONFLICT' : matchingPolicyUnknown ? 'SOURCE_MATCHING_SWITCH_UNKNOWN' : source_matching_operational_state === 'DENIED' ? 'SOURCE_MATCHING_DISABLED' : 'SOURCE_MATCHING_ENABLED'
  const source_operational_state = globalPolicyConflict ? 'CONFLICT' : policyUnknown ? 'UNKNOWN' : policy?.is_enabled ? 'ENABLED' : 'DISABLED'
  const source_operational_reason = globalPolicyConflict ? 'SOURCE_POLICY_ALIAS_CONFLICT' : policyUnknown ? 'SOURCE_POLICY_STATE_UNKNOWN' : !registeredSourceOperationalDefault(source) ? 'NO_EXECUTABLE_PRODUCER' : source_operational_state === 'ENABLED' ? 'SOURCE_OPERATIONALLY_ENABLED' : 'SOURCE_DISABLED'
  const final_matching_state: UniverseState = matching_row_state !== 'READY' ? matching_row_state : source_matching_operational_state === 'DENIED' || source_operational_state === 'DISABLED' ? 'NOT_READY' : source_matching_operational_state === 'UNKNOWN' || source_operational_state === 'UNKNOWN' || source_operational_state === 'CONFLICT' ? 'UNKNOWN' : 'READY'
  const catalogRow = catalogReadiness({ ...row, is_active: lifecycleReady, verification_status: lifecycleReady ? 'verified' : row.verification_status }, now)
  const seoRow = seoReadiness({ ...row, is_active: lifecycleReady, verification_status: lifecycleReady ? 'verified' : row.verification_status }, now)
  const catalogPermission = permissionResolver(source, 'catalog')
  const seoPermission = permissionResolver(source, 'seo')
  const alertPermission = permissionResolver(source, 'alerts')
  const consumerState = (ready: boolean, _permissionState: PermissionState, switchState: PermissionState): UniverseState => !lifecycleReady ? (lifecycle_state === 'LIFECYCLE_UNKNOWN' || lifecycle_state === 'STALE_DERIVED_STATE' ? 'UNKNOWN' : 'NOT_READY') : !ready ? 'NOT_READY' : source_operational_state === 'UNKNOWN' || source_operational_state === 'CONFLICT' ? 'UNKNOWN' : source_operational_state === 'DISABLED' || switchState === 'DENIED' ? 'NOT_READY' : switchState === 'ALLOWED' ? 'READY' : 'UNKNOWN'
  const catalog_state = consumerState(catalogRow.state === 'READY', catalogPermission.state, catalogOperational)
  const seo_row_state: UniverseState = !lifecycleReady ? (lifecycle_state === 'LIFECYCLE_UNKNOWN' || lifecycle_state === 'STALE_DERIVED_STATE' ? 'UNKNOWN' : 'NOT_READY') : seoRow.state === 'READY' ? 'READY' : 'NOT_READY'
  const seo_row_reason = !lifecycleReady ? lifecycle_reason : seoRow.state === 'READY' ? 'SEO_ROW_READY' : seoRow.reasons[0] || 'SEO_ROW_NOT_READY'
  const seo_state: UniverseState = seo_row_state !== 'READY' ? seo_row_state
    : seoOperational === 'DENIED' ? 'NOT_READY'
    : seoOperational === 'UNKNOWN' || source_operational_state === 'UNKNOWN' || source_operational_state === 'CONFLICT' ? 'UNKNOWN'
    : source_operational_state === 'DISABLED' ? 'NOT_READY'
    : 'READY'
  const seo_effective_reason = seo_row_state !== 'READY' ? seo_row_reason
    : seoOperational === 'DENIED' ? 'SOURCE_SEO_OPERATOR_DISABLED'
    : aliasConflicts.includes('seo_enabled') ? 'SOURCE_POLICY_ALIAS_CONFLICT'
    : seoOperational === 'UNKNOWN' ? 'SOURCE_SEO_SWITCH_UNKNOWN'
    : source_operational_state === 'CONFLICT' ? 'SOURCE_POLICY_ALIAS_CONFLICT'
    : source_operational_state === 'UNKNOWN' ? 'SOURCE_OPERATIONAL_STATE_UNKNOWN'
    : source_operational_state === 'DISABLED' ? source_operational_reason
    : 'SEO_EFFECTIVE_READY'
  const seoContent = seoContentReadinessIndependentOfLifecycle(row)
  const lifecycleUnresolved = lifecycle_state === 'LIFECYCLE_UNKNOWN' || lifecycle_state === 'STALE_DERIVED_STATE'
  const observationSource = observation?.source ? canonicalSource(String(observation.source)) : null
  const lifecycle_unresolved_reason = !lifecycleUnresolved ? null
    : lifecycle_state === 'STALE_DERIVED_STATE' ? lifecycle_reason
    : deadline === 'INVALID' ? 'DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN'
    : !observation?.id ? 'NO_OBSERVATION'
    : observationSource && observationSource !== source ? 'OBSERVATION_SOURCE_MISMATCH'
    : observation?.identity_status === 'IDENTITY_UNRESOLVED' ? 'IDENTITY_UNRESOLVED'
    : observation?.identity_status === 'IDENTITY_MISMATCH' ? 'IDENTITY_MISMATCH'
    : [0, 429].includes(Number(observation?.http_status)) || Number(observation?.http_status) >= 500 ? 'TRANSIENT_HTTP_EVIDENCE'
    : observation?.identity_status === 'IDENTITY_CONFIRMED' && Number(observation?.http_status) === 200 ? 'OBSERVATION_NOT_NEWER_THAN_ROW_UPDATE'
    : 'LIFECYCLE_EVIDENCE_INSUFFICIENT'
  const lifecycle_recovery_class = !lifecycleUnresolved ? ['EXPIRED','DELETED','ARCHIVED','HARD_DEAD','INACTIVE_VALID'].includes(lifecycle_state) ? 'EXPLICITLY_INACTIVE' : 'NOT_UNRESOLVED'
    : lifecycle_repair ? 'RECOVERABLE_NOW'
    : seoContent.state !== 'READY' ? 'CONTENT_NOT_READY'
    : lifecycle_unresolved_reason === 'OBSERVATION_SOURCE_MISMATCH' ? 'SYSTEM_ERROR'
    : 'REFRESH_REQUIRED'
  const alerts_state = consumerState(professional, alertPermission.state, alertsOperational)
  const unresolved_dimensions: string[] = []
  if (lifecycle_state === 'LIFECYCLE_UNKNOWN' || lifecycle_state === 'STALE_DERIVED_STATE') unresolved_dimensions.push('LIFECYCLE')
  if (matching_row_state === 'UNKNOWN') unresolved_dimensions.push('ROW_MATCH_READINESS')
  if (source_matching_operational_state === 'UNKNOWN') unresolved_dimensions.push('SOURCE_MATCHING_SWITCH')
  if (source_operational_state === 'UNKNOWN') unresolved_dimensions.push('SOURCE_OPERATIONAL_STATE')
  if (source_operational_state === 'CONFLICT') unresolved_dimensions.push('SOURCE_POLICY_ALIAS_CONFLICT:is_enabled')
  if (source_matching_operational_state === 'UNKNOWN' && aliasConflicts.includes('matching_enabled')) unresolved_dimensions.push('SOURCE_POLICY_ALIAS_CONFLICT:matching_enabled')
  if (lifecycleReady && catalogRow.state === 'READY' && catalogOperational === 'UNKNOWN') unresolved_dimensions.push(aliasConflicts.includes('catalog_enabled') ? 'SOURCE_POLICY_ALIAS_CONFLICT:catalog_enabled' : 'CATALOG_SWITCH_UNKNOWN')
  if (professional && alertsOperational === 'UNKNOWN' && lifecycleReady) unresolved_dimensions.push(aliasConflicts.includes('alerts_enabled') ? 'SOURCE_POLICY_ALIAS_CONFLICT:alerts_enabled' : 'ALERT_SWITCH_UNKNOWN')
  const source_permission_unknown_dimensions = SOURCE_PERMISSION_DIMENSIONS.filter(dimension => sourcePermissionDimensionTruth(source, dimension).state === 'UNKNOWN')
  return {
    id: String(row.id || ''), inventory_state: 'PRESENT', lifecycle_state, lifecycle_reason, lifecycle_repair,
    professional_readiness, professional_reason, catalog_row_state: !lifecycleReady ? (lifecycle_state === 'LIFECYCLE_UNKNOWN' || lifecycle_state === 'STALE_DERIVED_STATE' ? 'UNKNOWN' : 'NOT_READY') : catalogRow.state === 'READY' ? 'READY' : catalogRow.state === 'UNKNOWN' ? 'UNKNOWN' : 'NOT_READY', catalog_state,
    alerts_row_state: !lifecycleReady ? (lifecycle_state === 'LIFECYCLE_UNKNOWN' || lifecycle_state === 'STALE_DERIVED_STATE' ? 'UNKNOWN' : 'NOT_READY') : professional ? 'READY' : 'NOT_READY',
    seo_row_state, seo_row_reason, seo_content_readiness_independent_of_lifecycle: seoContent.state, seo_content_reason: seoContent.reasons[0] || 'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE', seo_effective_reason,
    lifecycle_unresolved_reason, lifecycle_recovery_class,
    matching_row_state, matching_row_reason, source_matching_state: sourcePermission.state, source_matching_reason: sourcePermission.reason,
    source_matching_provenance: sourcePermission.provenance, source_matching_operational_state, source_matching_operational_reason, catalog_operational_state: catalogOperational, alerts_operational_state: alertsOperational, seo_operational_state: seoOperational, source_operational_state, source_operational_reason, source_policy_alias_conflicts: aliasConflicts, final_matching_state,
    seo_state, alerts_state, unresolved_dimensions, source_permission_unknown_dimensions,
    provenance: {
      source, observation_id: observation?.id ?? null, observation_status: observation?.identity_status ?? null, observation_http_status: observation?.http_status ?? null, observation_at: observation?.observed_at ?? null,
      source_policy_rows: sourcePolicies.map(item => item.source), source_policy_alias_conflicts: aliasConflicts, source_permission: sourcePermission.provenance,
      consumer_switch_overrides: policy?.consumer_switch_overrides || {},
      first_party_permission_role: 'ADVISORY_ONLY',
      switch_authority: 'REGISTRY_OPERATION_WITH_ADMIN_POLICY_EVENTS',
      consumer_permission_states: { catalog: permissionResolver(source, 'catalog').state, matching: sourcePermission.state, alerts: permissionResolver(source, 'alerts').state, seo: permissionResolver(source, 'seo').state },
      consumer_switch_states: { catalog: catalogOperational, matching: source_matching_operational_state, alerts: alertsOperational, seo: seoOperational },
    },
  }
}

/** Exact-row Admin presentation uses the current canonical RPC, preserving the
 * persisted ledger as evidence. This copies decisions; it never recomputes gates. */
export function pipelineWithCurrentUniverse(pipeline: Record<string, any> | null, universe: Record<string, any> | null) {
  if (!pipeline || !universe?.consumer_diagnostics) return pipeline
  const fields = { CATALOG: 'catalog_state', MATCHING: 'final_matching_state', ALERTS: 'alerts_state', SEO: 'seo_state' } as const
  const result = { ...pipeline, state_authority: 'CANONICAL_UNIVERSE_ROW_RPC',
    policy_reconciliation_pending: universe.policy_reconciliation_pending === true,
    persisted_consumer_states: Object.fromEntries(Object.entries(fields).map(([consumer, field]) => [consumer, pipeline[field]])),
    next_actions: { ...pipeline.next_actions }, source_permission_states: {}, consumer_switch_states: {},
  } as Record<string, any>
  for (const [consumer, field] of Object.entries(fields)) {
    const diagnostic = universe.consumer_diagnostics[consumer]
    const state = diagnostic?.effective_state || 'UNKNOWN'
    const reason = diagnostic?.first_unresolved_or_blocking_reason || (state === 'READY' ? 'READY' : 'UNIVERSE_STATE_NOT_RECONCILED')
    result[field] = state
    result[`${consumer.toLowerCase()}_reason`] = reason
    result.source_permission_states[consumer.toLowerCase()] = diagnostic?.permission_state || 'UNKNOWN'
    result.consumer_switch_states[consumer.toLowerCase()] = diagnostic?.consumer_switch_state || 'UNKNOWN'
    result.next_actions[consumer] = { ...result.next_actions[consumer], state, reason,
      next_action: state === 'READY' ? 'NONE' : `INSPECT_${consumer}_REASON` }
  }
  for (const field of ['lifecycle_state', 'lifecycle_reason', 'source_operational_reason', 'source_matching_state', 'source_matching_reason',
    'source_matching_operational_state', 'source_matching_operational_reason']) result[field] = universe[field] ?? pipeline[field]
  result.universe_provenance = universe.provenance
  result.source_operational_state = universe.consumer_diagnostics.CATALOG?.source_global_state || 'UNKNOWN'
  result.next_actions.LIFECYCLE = { ...result.next_actions.LIFECYCLE, state: result.lifecycle_state,
    reason: result.lifecycle_reason,
    next_action: ['LIFECYCLE_UNKNOWN', 'STALE_DERIVED_STATE'].includes(result.lifecycle_state) ? (pipeline.next_actions?.LIFECYCLE?.next_action || 'REVIEW_LIFECYCLE_EVIDENCE') : 'NONE' }
  const excluded = Object.keys(fields).filter(consumer => result.next_actions[consumer].state !== 'READY')
  result.blocking_phases = [...(pipeline.blocking_phases || []).filter((phase: string) => !(phase in fields)), ...excluded]
  if (['ROUTED', 'ROUTED_WITH_EXCLUSIONS'].includes(pipeline.pipeline_health)) result.pipeline_health = excluded.length ? 'ROUTED_WITH_EXCLUSIONS' : 'ROUTED'
  if (['NO_ACTION', 'INSPECT_CONSUMER_REASON'].includes(pipeline.next_action)) {
    result.next_action = excluded.length ? 'INSPECT_CONSUMER_REASON' : 'NO_ACTION'
    result.next_action_reason = excluded.length ? `${excluded[0]}: ${result.next_actions[excluded[0]].reason}` : 'ALL_ROUTING_STATES_READY'
  }
  return result
}

export function summarizeOpportunityUniverse(decisions: OpportunityUniverseDecision[]) {
  const counts = (field: keyof OpportunityUniverseDecision, value: unknown) => decisions.filter(item => item[field] === value).length
  const lifecycleGroups = ['ACTIVE_VALID', 'EXPIRED', 'DELETED', 'ARCHIVED', 'HARD_DEAD', 'SUPERSEDED_DUPLICATE', 'INACTIVE_VALID', 'STALE_DERIVED_STATE', 'LIFECYCLE_UNKNOWN']
  const lifecycle = Object.fromEntries(lifecycleGroups.map(state => [state, counts('lifecycle_state', state)]))
  const firstFailure: Record<string, number> = {}
  for (const item of decisions) {
    const key = item.lifecycle_state !== 'ACTIVE_VALID' ? `LIFECYCLE_${item.lifecycle_state}`
      : item.matching_row_state === 'NOT_READY' ? `MATCH_ROW_${item.matching_row_reason}`
      : item.matching_row_state === 'UNKNOWN' ? 'MATCH_ROW_UNKNOWN'
      : item.source_operational_state === 'CONFLICT' ? 'SOURCE_POLICY_ALIAS_CONFLICT'
      : item.source_policy_alias_conflicts.includes('matching_enabled') ? 'SOURCE_POLICY_ALIAS_CONFLICT'
      : item.source_matching_operational_state === 'DENIED' ? 'SOURCE_MATCHING_DISABLED'
      : item.source_matching_operational_state === 'UNKNOWN' ? 'SOURCE_MATCHING_UNKNOWN'
      : item.source_operational_state === 'DISABLED' ? 'SOURCE_DISABLED'
      : item.source_operational_state === 'UNKNOWN' ? 'SOURCE_OPERATIONAL_UNKNOWN'
      : item.source_operational_state !== 'ENABLED' ? `SOURCE_${item.source_operational_state}` : 'FINAL_MATCHING_UNIVERSE'
    firstFailure[key] = (firstFailure[key] || 0) + 1
  }
  const lifecycleUnresolved = decisions.filter(item => ['LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE'].includes(item.lifecycle_state))
  const perSource = new Map<string, OpportunityUniverseDecision[]>()
  for (const item of decisions) { const source = String(item.provenance.source || 'UNKNOWN'); perSource.set(source, [...(perSource.get(source) || []), item]) }
  return {
    TOTAL_INVENTORY: decisions.length, lifecycle, ACTIVE_VALID: lifecycle.ACTIVE_VALID,
    INACTIVE_VALID: lifecycle.INACTIVE_VALID, STALE_DERIVED_STATE: lifecycle.STALE_DERIVED_STATE,
    LIFECYCLE_UNKNOWN: lifecycle.LIFECYCLE_UNKNOWN,
    CATALOG_UNIVERSE: counts('catalog_state', 'READY'), MATCH_ROW_READY: counts('matching_row_state', 'READY'),
    MATCH_ROW_NOT_READY: counts('matching_row_state', 'NOT_READY'), MATCH_ROW_UNKNOWN: counts('matching_row_state', 'UNKNOWN'),
    SOURCE_PERMISSION_ALLOWED: counts('source_matching_state', 'ALLOWED'), SOURCE_MATCH_ALLOWED: counts('final_matching_state', 'READY'), FINAL_MATCHING_UNIVERSE: counts('final_matching_state', 'READY'),
    SEO_UNIVERSE: counts('seo_state', 'READY'), SEO_ROW_READY: counts('seo_row_state', 'READY'),
    SEO_ROW_NOT_READY: counts('seo_row_state', 'NOT_READY'), SEO_ROW_UNKNOWN: counts('seo_row_state', 'UNKNOWN'),
    SEO_EFFECTIVE_READY: counts('seo_state', 'READY'),
    lifecycle_recovery: Object.fromEntries(['RECOVERABLE_NOW','REFRESH_REQUIRED','CONTENT_NOT_READY','SYSTEM_ERROR','EXPLICITLY_INACTIVE'].map(state => [state, decisions.filter(item => item.lifecycle_recovery_class === state).length])),
    TOP_LIFECYCLE_UNRESOLVED_REASONS: decisions.reduce((counts, item) => { if (item.lifecycle_unresolved_reason) counts[item.lifecycle_unresolved_reason] = (counts[item.lifecycle_unresolved_reason] || 0) + 1; return counts }, {} as Record<string, number>),
    SEO_PERMISSION_UNKNOWN_READY_ROWS: decisions.filter(item => item.seo_row_state === 'READY' && (item.provenance.consumer_permission_states as any)?.seo === 'UNKNOWN').length,
    SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE: decisions.filter(item => item.seo_content_readiness_independent_of_lifecycle === 'READY').length,
    SEO_CONTENT_READY_WHILE_LIFECYCLE_UNRESOLVED: lifecycleUnresolved.filter(item => item.seo_content_readiness_independent_of_lifecycle === 'READY').length,
    LIFECYCLE_UNRESOLVED_TOTAL: lifecycleUnresolved.length,
    LIFECYCLE_RECOVERABLE_NOW: lifecycleUnresolved.filter(item => item.lifecycle_recovery_class === 'RECOVERABLE_NOW').length,
    LIFECYCLE_REFRESH_REQUIRED: lifecycleUnresolved.filter(item => item.lifecycle_recovery_class === 'REFRESH_REQUIRED').length,
    LIFECYCLE_CONTENT_NOT_READY: lifecycleUnresolved.filter(item => item.lifecycle_recovery_class === 'CONTENT_NOT_READY').length,
    LIFECYCLE_SYSTEM_ERROR: lifecycleUnresolved.filter(item => item.lifecycle_recovery_class === 'SYSTEM_ERROR').length,
    TOP_LIFECYCLE_UNRESOLVED_REASONS: lifecycleUnresolved.reduce((counts, item) => { const reason = item.lifecycle_unresolved_reason || 'LIFECYCLE_EVIDENCE_INSUFFICIENT'; counts[reason] = (counts[reason] || 0) + 1; return counts }, {} as Record<string, number>),
    LIFECYCLE_RECOVERY_PER_SOURCE: [...perSource.entries()].map(([source, rows]) => { const unresolved = rows.filter(item => ['LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE'].includes(item.lifecycle_state)); return { source, lifecycle_unresolved_total: unresolved.length, seo_content_ready_while_lifecycle_unresolved: unresolved.filter(item => item.seo_content_readiness_independent_of_lifecycle === 'READY').length, recovery: unresolved.reduce((counts, item) => { if (item.lifecycle_recovery_class !== 'NOT_UNRESOLVED') counts[item.lifecycle_recovery_class] = (counts[item.lifecycle_recovery_class] || 0) + 1; return counts }, {} as Record<string, number>), top_reasons: unresolved.reduce((counts, item) => { const reason = item.lifecycle_unresolved_reason || 'LIFECYCLE_EVIDENCE_INSUFFICIENT'; counts[reason] = (counts[reason] || 0) + 1; return counts }, {} as Record<string, number>) } }),
    TOP_SEO_BLOCK_REASONS: decisions.reduce((reasons, item) => { if (item.seo_state !== 'READY') reasons[item.seo_effective_reason] = (reasons[item.seo_effective_reason] || 0) + 1; return reasons }, {} as Record<string, number>),
    ALERT_UNIVERSE: counts('alerts_state', 'READY'),
    PROFESSIONAL_THIN: counts('professional_readiness', 'PROFESSIONAL_THIN'), SOURCE_POLICY_UNKNOWN: counts('source_matching_state', 'UNKNOWN'),
    ROUTING_UNRESOLVED_ROWS: decisions.filter(item => item.unresolved_dimensions.length > 0).length,
    ROWS_WITH_ANY_SOURCE_PERMISSION_UNKNOWN: decisions.filter(item => item.source_permission_unknown_dimensions.length > 0).length,
    SOURCE_PERMISSION_UNKNOWN_DIMENSION_CLAIMS: decisions.reduce((sum, item) => sum + item.source_permission_unknown_dimensions.length, 0),
    first_failure: firstFailure, reconciliation_difference: decisions.length - Object.values(firstFailure).reduce((sum, count) => sum + count, 0),
  }
}
