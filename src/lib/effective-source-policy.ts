import registry from '../generated/source-intelligence-registry.json'
import { alertsReadiness, catalogReadiness, jobPostingReadiness, matchingReadiness, seoReadiness, type OpportunityTruthInput, type ReadinessResult } from './opportunity-truth'
import { sourcePermissionDimensionTruth, sourcePermissionTruth } from './source-permission-truth'
import { isQualifyingTemporaryLegacySeoRow, temporaryLegacySeoExceptionState } from './temporary-legacy-seo-exception'

export type SourcePolicyRow = {
  source: string; is_enabled?: boolean | null; catalog_enabled?: boolean | null
  matching_enabled?: boolean | null; alerts_enabled?: boolean | null; seo_enabled?: boolean | null
  registry_certified?: boolean | null; registry_adapter_version?: string | null
  registry_policy_hash?: string | null; registry_synced_at?: string | null
  web_catalog_allowed?: boolean | null; search_engine_indexing_allowed?: boolean | null
  google_jobs_distribution_allowed?: boolean | null; third_party_job_distribution_allowed?: boolean | null
  source_attribution_required?: boolean | null
  /** Explicit operator intent projected from existing admin_policy_events. */
  consumer_switch_overrides?: Partial<Record<'catalog' | 'matching' | 'alerts', boolean | null>>
}
export type CapabilityState = 'ALLOWED' | 'DENIED' | 'UNKNOWN'
export type AdminSwitchState = 'ENABLED' | 'DISABLED' | 'UNKNOWN' | 'LEGACY_CONFIG_DISABLED'
export type PolicyDecision = {
  allowed: boolean; canonicalSource: string; rowReadiness: ReadinessResult
  capabilityState: CapabilityState; adminSwitchState: AdminSwitchState
  storedGateState: 'TRUE' | 'FALSE' | 'UNKNOWN' | 'NOT_APPLICABLE'
  reasons: string[]
  permissionReasons: string[]
  temporaryException: (ReturnType<typeof temporaryLegacySeoExceptionState> & { applied: boolean }) | null
}
const profiles = (registry as any).sources as Array<{ canonical_source:string; emitted_aliases:string[] }>

/** Exact Registry V2 aliases only. Unknown raw IDs remain themselves and fail closed. */
export function canonicalSource(raw: string | null | undefined): string {
  const key = String(raw || '').trim().toLowerCase()
  if (!key) return ''
  return profiles.find(profile => profile.canonical_source === key || profile.emitted_aliases.includes(key))?.canonical_source || key
}
const CANONICAL_POLICY_FIELDS: Array<keyof SourcePolicyRow> = [
  // Only operational source switches are aliased here. Legacy permission-like
  // columns are projections/diagnostics and cannot override canonical evidence.
  'is_enabled','matching_enabled','catalog_enabled','alerts_enabled','seo_enabled',
]
export type SourcePolicyConflicts = Record<'is_enabled' | 'matching_enabled' | 'catalog_enabled' | 'alerts_enabled' | 'seo_enabled', boolean>
/** Same normalization as canonical_opportunity_source_policy. Never grants permission. */
export function effectiveSourceSwitches<T extends SourcePolicyRow>(row: T, permissionResolver = sourcePermissionTruth): T {
  const effective = { ...row }
  for (const consumer of ['catalog', 'matching', 'alerts'] as const) {
    const field = `${consumer}_enabled` as const
    const override = row.consumer_switch_overrides?.[consumer]
    if (override !== undefined) effective[field] = override
    else if (row.is_enabled === true && permissionResolver(canonicalSource(row.source), consumer).state === 'ALLOWED') effective[field] = true
  }
  return effective
}
export function sourcePolicyForCanonical(raw: string | null | undefined, rows: SourcePolicyRow[]) {
  const canonical = canonicalSource(raw)
  const aliases = rows.filter(item => canonicalSource(item.source) === canonical).map(item => effectiveSourceSwitches(item))
  const conflicts = Object.fromEntries(CANONICAL_POLICY_FIELDS.map(field => [field, new Set(aliases.map(item => item[field] === true ? 'true' : item[field] === false ? 'false' : 'unknown')).size > 1])) as SourcePolicyConflicts
  const conflict = Object.values(conflicts).some(Boolean)
  if (!aliases.length) return { canonical, policy: undefined, aliases: [] as string[], conflict: false, conflicts }
  const preferred = aliases.find(item => String(item.source).toLowerCase() === canonical) || aliases[0]
  const policy: SourcePolicyRow = { ...preferred }
  for (const field of CANONICAL_POLICY_FIELDS) if (conflicts[field]) (policy as any)[field] = null
  return { canonical, policy, aliases: aliases.map(item => item.source), conflict, conflicts }
}
type Consumer = 'catalog' | 'matching' | 'alerts' | 'seo' | 'jobPosting' | 'googleJobs' | 'thirdParty'

const storedGateState = (value: unknown, applicable = true): PolicyDecision['storedGateState'] => !applicable ? 'NOT_APPLICABLE' : value === true ? 'TRUE' : value === false ? 'FALSE' : 'UNKNOWN'
const legacySwitchState = (policy: SourcePolicyRow | undefined, switches: Array<boolean | null | undefined>): AdminSwitchState => {
  if (!policy) return 'UNKNOWN'
  if (policy.is_enabled !== true) return 'DISABLED'
  // These legacy per-consumer switches were historically copied to each row.
  // They remain diagnostic configuration, never external-permission evidence.
  return switches.some(value => value === false) ? 'LEGACY_CONFIG_DISABLED' : switches.some(value => value == null) ? 'UNKNOWN' : 'ENABLED'
}
const capabilityFor = (canonical: string, consumer: Consumer, policy: SourcePolicyRow | undefined): CapabilityState => {
  if (!policy) return 'UNKNOWN'
  const capability = (dimension: Parameters<typeof sourcePermissionDimensionTruth>[1]): CapabilityState => {
    const state = sourcePermissionDimensionTruth(canonical, dimension).state
    return state === 'NOT_APPLICABLE' ? 'UNKNOWN' : state
  }
  if (consumer === 'catalog' || consumer === 'matching' || consumer === 'alerts' || consumer === 'seo') return sourcePermissionTruth(canonical, consumer).state
  if (consumer === 'googleJobs' || consumer === 'jobPosting') return capability('google_jobs')
  if (consumer === 'thirdParty') return capability('third_party_distribution')
  return capability('seo_index')
}
const decision = (canonicalSource: string, consumer: Consumer, rowReadiness: ReadinessResult, policy: SourcePolicyRow | undefined, admin: Array<boolean | null | undefined>, live: boolean, storedGate: unknown, storedApplicable = true, extraReasons: string[] = [], asOf = new Date(), row?: Record<string, unknown>): PolicyDecision => {
  const policyFound = Boolean(policy)
  const capabilityState = capabilityFor(canonicalSource, consumer, policy)
  const adminSwitchState = legacySwitchState(policy, admin)
  const projectionSwitch = consumer === 'catalog' ? policy?.catalog_enabled : consumer === 'matching' ? policy?.matching_enabled : consumer === 'alerts' ? policy?.alerts_enabled : consumer === 'seo' || consumer === 'jobPosting' ? policy?.seo_enabled : true
  const exceptionState = consumer === 'seo' ? temporaryLegacySeoExceptionState(canonicalSource, asOf) : null
  const temporaryExceptionApplied = Boolean(consumer === 'seo'
    && canonicalSource === 'computrabajo'
    && exceptionState?.state === 'ACTIVE'
    && capabilityState === 'DENIED'
    && rowReadiness.state === 'READY'
    && live
    && isQualifyingTemporaryLegacySeoRow(row || {}, canonicalSource))
  const temporaryException = exceptionState ? { ...exceptionState, applied: temporaryExceptionApplied } : null
  const permissionReasons = [
    ...(capabilityState === 'ALLOWED' ? [] : [capabilityState === 'UNKNOWN' ? 'SOURCE_CAPABILITY_UNKNOWN' : 'SOURCE_CAPABILITY_DENIED']),
    ...(capabilityState === 'UNKNOWN' ? [`SOURCE_${consumer.toUpperCase()}_PERMISSION_UNKNOWN`] : capabilityState === 'DENIED' ? [`SOURCE_${consumer.toUpperCase()}_PERMISSION_DENIED`] : []),
  ]
  const reasons = [
    ...(policyFound ? [] : ['SOURCE_POLICY_UNKNOWN']),
    ...(rowReadiness.state === 'READY' ? [] : rowReadiness.reasons),
    ...(policy?.is_enabled === true ? [] : [policy ? 'SOURCE_DISABLED' : 'SOURCE_SWITCH_UNKNOWN']),
    ...(['catalog', 'matching', 'alerts', 'jobPosting'].includes(consumer) && projectionSwitch !== true
      ? [projectionSwitch === false ? `SOURCE_${consumer.toUpperCase()}_OPERATOR_DISABLED` : `SOURCE_${consumer.toUpperCase()}_SWITCH_UNKNOWN`] : []),
    ...(consumer === 'seo' && projectionSwitch === false ? ['SOURCE_SEO_OPERATOR_DISABLED'] : []),
    ...(live ? [] : ['ROW_LIFECYCLE_NOT_ROUTABLE']),
    ...extraReasons,
  ]
  // First-party organic SEO is gated by lifecycle, row facts and global source
  // operation. Canonical permission remains diagnostic; external distribution
  // uses its own JobPosting/Google Jobs decisions below.
  const effectiveReasons = consumer === 'seo'
    ? [...reasons, ...(capabilityState === 'DENIED' && !temporaryExceptionApplied ? permissionReasons : [])]
    : [...reasons, ...permissionReasons]
  const permissionAllowsRouting = consumer === 'seo' ? capabilityState !== 'DENIED' || temporaryExceptionApplied : capabilityState === 'ALLOWED'
  return { allowed: effectiveReasons.length === 0 && permissionAllowsRouting, canonicalSource, rowReadiness, capabilityState, adminSwitchState, storedGateState: storedGateState(storedGate, storedApplicable), reasons: effectiveReasons, permissionReasons, temporaryException }
}

/** One fail-closed evaluation for runtime/build projections. Canonical DB row wins over legacy alias rows. */
export function evaluateOpportunityDistribution(row: OpportunityTruthInput & Record<string, any>, rows: SourcePolicyRow[], asOf = new Date()) {
  const canonical = canonicalSource(row.source)
  const resolved = sourcePolicyForCanonical(row.source, rows)
  const policy = resolved.policy
  const conflictReason = (consumer: Consumer) => {
    const fields: Array<keyof SourcePolicyConflicts> = consumer === 'catalog' ? ['is_enabled', 'catalog_enabled']
      : consumer === 'matching' ? ['is_enabled', 'matching_enabled']
      : consumer === 'alerts' ? ['is_enabled', 'alerts_enabled']
      : consumer === 'seo' ? ['is_enabled']
      : consumer === 'jobPosting' ? ['is_enabled', 'seo_enabled']
      : ['is_enabled']
    return fields.some(field => resolved.conflicts[field]) ? ['SOURCE_POLICY_ALIAS_CONFLICT'] : []
  }
  const live = row.is_active === true && row.verification_status === 'verified' && !row.deleted_at && !row.archived_at
  const sourceOn = policy?.is_enabled === true
  const catalog = decision(canonical, 'catalog', catalogReadiness(row), policy, [policy?.catalog_enabled], live, row.catalog_eligible, true, conflictReason('catalog'))
  const matching = decision(canonical, 'matching', matchingReadiness(row), policy, [policy?.matching_enabled], live, row.match_eligible, true, conflictReason('matching'))
  const alerts = decision(canonical, 'alerts', alertsReadiness(row), policy, [policy?.alerts_enabled], live, row.alerts_eligible, true, conflictReason('alerts'))
  const seo = decision(canonical, 'seo', seoReadiness(row, asOf), policy, [policy?.seo_enabled], live, row.seo_eligible, true, conflictReason('seo'), asOf, row)
  const jobPosting = decision(canonical, 'jobPosting', jobPostingReadiness(row), policy, [policy?.seo_enabled], live, row.jobposting_validity, row.jobposting_validity !== undefined, conflictReason('jobPosting'), asOf)
  const googleJobs = decision(canonical, 'googleJobs', jobPostingReadiness(row), policy, [], live, row.jobposting_validity, row.jobposting_validity !== undefined, conflictReason('googleJobs'), asOf)
  // There is deliberately no third-party emitter in this product yet. Even a
  // future affirmative source permission cannot become delivery permission by
  // accident before a dedicated connector is implemented and reviewed.
  const thirdParty = decision(canonical, 'thirdParty', jobPostingReadiness(row), policy, [], live, undefined, false, ['THIRD_PARTY_DELIVERY_UNAVAILABLE', ...conflictReason('thirdParty')], asOf)
  return { canonicalSource: canonical, policyFound: Boolean(policy), policyConflict: resolved.conflict, policyConflicts: resolved.conflicts, policyAliases: resolved.aliases, sourceOn, catalog, matching, alerts, seo, jobPosting, googleJobs, thirdParty }
}

/** Public/build-safe projection. Every onward-distribution consumer reads this shape. */
export function publicDistributionProjection(row: OpportunityTruthInput & Record<string, any>, rows: SourcePolicyRow[], asOf = new Date()) {
  const decision = evaluateOpportunityDistribution(row, rows, asOf)
  const applicationRouting = sourcePermissionDimensionTruth(decision.canonicalSource, 'application_routing')
  return {
    canonicalSource: decision.canonicalSource,
    sourceAttributionRequired: sourcePermissionDimensionTruth(decision.canonicalSource, 'attribution_requirement').state === 'ALLOWED',
    sourceAttributionState: sourcePermissionDimensionTruth(decision.canonicalSource, 'attribution_requirement').state,
    applicationRouting: { state: applicationRouting.state, reason: applicationRouting.reason, provenance: applicationRouting.provenance },
    seo: decision.seo,
    jobPosting: decision.jobPosting,
    googleJobs: decision.googleJobs,
    thirdParty: decision.thirdParty,
  }
}
