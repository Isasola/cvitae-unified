import registry from '../generated/source-intelligence-registry.json'
import { alertsReadiness, catalogReadiness, jobPostingReadiness, matchingReadiness, seoReadiness, type OpportunityTruthInput, type ReadinessResult } from './opportunity-truth'
import { sourcePermissionDimensionTruth, sourcePermissionTruth } from './source-permission-truth'

export type SourcePolicyRow = {
  source: string; is_enabled?: boolean | null; catalog_enabled?: boolean | null
  matching_enabled?: boolean | null; alerts_enabled?: boolean | null; seo_enabled?: boolean | null
  registry_certified?: boolean | null; registry_adapter_version?: string | null
  registry_policy_hash?: string | null; registry_synced_at?: string | null
  web_catalog_allowed?: boolean | null; search_engine_indexing_allowed?: boolean | null
  google_jobs_distribution_allowed?: boolean | null; third_party_job_distribution_allowed?: boolean | null
  source_attribution_required?: boolean | null
  /** Explicit operator intent projected from existing admin_policy_events. */
  consumer_switch_overrides?: Partial<Record<'source' | 'catalog' | 'matching' | 'alerts' | 'seo', boolean | null>>
}
export type CapabilityState = 'ALLOWED' | 'DENIED' | 'UNKNOWN'
export type AdminSwitchState = 'ENABLED' | 'DISABLED' | 'UNKNOWN' | 'LEGACY_CONFIG_DISABLED'
export type PolicyDecision = {
  allowed: boolean; canonicalSource: string; rowReadiness: ReadinessResult
  capabilityState: CapabilityState; adminSwitchState: AdminSwitchState
  storedGateState: 'TRUE' | 'FALSE' | 'UNKNOWN' | 'NOT_APPLICABLE'
  reasons: string[]
  permissionReasons: string[]
  permissionRole: 'ADVISORY_FIRST_PARTY' | 'EXTERNAL_DISTRIBUTION_GATE'
  temporaryException: null
}
const profiles = (registry as any).sources as Array<{ canonical_source:string; emitted_aliases:string[]; producer_execution?: {state:string; entrypoints:string[]; operational_default:string} }>

export function sourceProducerExecution(raw: string) {
  return profiles.find(item => item.canonical_source === canonicalSource(raw))?.producer_execution
    || { state:'NO_EXECUTABLE_PRODUCER', entrypoints:[] as string[], operational_default:'INACTIVE' }
}

/** Registry execution capability is operational evidence, never a consumer grant. */
export function registeredSourceOperationalDefault(raw: string): boolean {
  return sourceProducerExecution(raw).state === 'EXECUTABLE_PRODUCER'
}

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
export function effectiveSourceSwitches<T extends SourcePolicyRow>(row: T, _permissionResolver = sourcePermissionTruth): T {
  const effective = { ...row }
  if (row.consumer_switch_overrides?.source !== undefined) effective.is_enabled = row.consumer_switch_overrides.source
  else if (registeredSourceOperationalDefault(row.source)) effective.is_enabled = true
  if (!registeredSourceOperationalDefault(row.source)) effective.is_enabled = false
  for (const consumer of ['catalog', 'matching', 'alerts', 'seo'] as const) {
    const field = `${consumer}_enabled` as const
    const override = row.consumer_switch_overrides?.[consumer]
    if (override !== undefined) effective[field] = override
    else if (effective.is_enabled === true) effective[field] = true
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
const capabilityFor = (canonical: string, consumer: Consumer, _policy: SourcePolicyRow | undefined, permissionResolver = sourcePermissionDimensionTruth): CapabilityState => {
  // Missing operational configuration cannot erase explicit permission evidence.
  const capability = (dimension: Parameters<typeof sourcePermissionDimensionTruth>[1]): CapabilityState => {
    const state = permissionResolver(canonical, dimension).state
    return state === 'NOT_APPLICABLE' ? 'UNKNOWN' : state
  }
  if (consumer === 'catalog' || consumer === 'matching' || consumer === 'alerts' || consumer === 'seo') return capability(consumer === 'seo' ? 'seo_index' : consumer)
  if (consumer === 'googleJobs' || consumer === 'jobPosting') return capability('google_jobs')
  if (consumer === 'thirdParty') return capability('third_party_distribution')
  return capability('seo_index')
}
const decision = (canonicalSource: string, consumer: Consumer, rowReadiness: ReadinessResult, policy: SourcePolicyRow | undefined, admin: Array<boolean | null | undefined>, live: boolean, storedGate: unknown, storedApplicable = true, extraReasons: string[] = [], permissionResolver = sourcePermissionDimensionTruth): PolicyDecision => {
  const policyFound = Boolean(policy)
  const capabilityState = capabilityFor(canonicalSource, consumer, policy, permissionResolver)
  const adminSwitchState = legacySwitchState(policy, admin)
  const projectionSwitch = consumer === 'catalog' ? policy?.catalog_enabled : consumer === 'matching' ? policy?.matching_enabled : consumer === 'alerts' ? policy?.alerts_enabled : consumer === 'seo' || consumer === 'jobPosting' ? policy?.seo_enabled : true
  const firstParty = ['catalog','matching','alerts','seo'].includes(consumer)
  const permissionReasons = [
    ...(!firstParty && capabilityState !== 'ALLOWED' ? [`${consumer === 'googleJobs' || consumer === 'jobPosting' ? 'GOOGLE_JOBS' : 'THIRD_PARTY'}_SOURCE_PERMISSION_${capabilityState}`] : []),
    ...(capabilityState === 'ALLOWED' ? [] : [capabilityState === 'UNKNOWN' ? 'SOURCE_CAPABILITY_UNKNOWN' : 'SOURCE_CAPABILITY_DENIED']),
    ...(capabilityState === 'UNKNOWN' ? [`SOURCE_${consumer.toUpperCase()}_PERMISSION_UNKNOWN`] : capabilityState === 'DENIED' ? [`SOURCE_${consumer.toUpperCase()}_PERMISSION_DENIED`] : []),
  ]
  const reasons = [
    ...(policyFound ? [] : ['SOURCE_POLICY_UNKNOWN']),
    ...(registeredSourceOperationalDefault(canonicalSource) ? [] : ['NO_EXECUTABLE_PRODUCER']),
    ...(rowReadiness.state === 'READY' ? [] : rowReadiness.reasons),
    ...(policy?.is_enabled === true ? [] : [policy ? 'SOURCE_DISABLED' : 'SOURCE_SWITCH_UNKNOWN']),
    ...(['catalog', 'matching', 'alerts', 'seo', 'jobPosting'].includes(consumer) && projectionSwitch !== true
      ? [projectionSwitch === false ? `SOURCE_${consumer.toUpperCase()}_OPERATOR_DISABLED` : `SOURCE_${consumer.toUpperCase()}_SWITCH_UNKNOWN`] : []),
    ...(live ? [] : ['ROW_LIFECYCLE_NOT_ROUTABLE']),
    ...extraReasons,
  ]
  // First-party organic SEO is gated by lifecycle, row facts and global source
  // operation. Canonical permission remains diagnostic; external distribution
  // uses its own JobPosting/Google Jobs decisions below.
  const effectiveReasons = firstParty ? reasons : [...reasons, ...permissionReasons]
  return { allowed: effectiveReasons.length === 0 && (firstParty || capabilityState === 'ALLOWED'), canonicalSource, rowReadiness, capabilityState, adminSwitchState, storedGateState: storedGateState(storedGate, storedApplicable), reasons: effectiveReasons, permissionReasons,
    permissionRole: firstParty ? 'ADVISORY_FIRST_PARTY' : 'EXTERNAL_DISTRIBUTION_GATE', temporaryException: null }
}

/** One fail-closed evaluation for runtime/build projections. Canonical DB row wins over legacy alias rows. */
export function evaluateOpportunityDistribution(row: OpportunityTruthInput & Record<string, any>, rows: SourcePolicyRow[], asOf = new Date(), permissionResolver = sourcePermissionDimensionTruth) {
  const canonical = canonicalSource(row.source)
  const resolved = sourcePolicyForCanonical(row.source, rows)
  const policy = resolved.policy
  const conflictReason = (consumer: Consumer) => {
    const fields: Array<keyof SourcePolicyConflicts> = consumer === 'catalog' ? ['is_enabled', 'catalog_enabled']
      : consumer === 'matching' ? ['is_enabled', 'matching_enabled']
      : consumer === 'alerts' ? ['is_enabled', 'alerts_enabled']
      : consumer === 'seo' ? ['is_enabled', 'seo_enabled']
      : consumer === 'jobPosting' ? ['is_enabled', 'seo_enabled']
      : ['is_enabled']
    return fields.some(field => resolved.conflicts[field]) ? ['SOURCE_POLICY_ALIAS_CONFLICT'] : []
  }
  const live = row.is_active === true && row.verification_status === 'verified' && !row.deleted_at && !row.archived_at
  const sourceOn = policy?.is_enabled === true
  const catalog = decision(canonical, 'catalog', catalogReadiness(row), policy, [policy?.catalog_enabled], live, row.catalog_eligible, true, conflictReason('catalog'), permissionResolver)
  const matching = decision(canonical, 'matching', matchingReadiness(row), policy, [policy?.matching_enabled], live, row.match_eligible, true, conflictReason('matching'), permissionResolver)
  const alerts = decision(canonical, 'alerts', alertsReadiness(row), policy, [policy?.alerts_enabled], live, row.alerts_eligible, true, conflictReason('alerts'), permissionResolver)
  const seo = decision(canonical, 'seo', seoReadiness(row, asOf), policy, [policy?.seo_enabled], live, row.seo_eligible, true, conflictReason('seo'), permissionResolver)
  const jobPosting = decision(canonical, 'jobPosting', jobPostingReadiness(row), policy, [policy?.seo_enabled], live, row.jobposting_validity, row.jobposting_validity !== undefined, conflictReason('jobPosting'), permissionResolver)
  const googleJobs = decision(canonical, 'googleJobs', jobPostingReadiness(row), policy, [], live, row.jobposting_validity, row.jobposting_validity !== undefined, conflictReason('googleJobs'), permissionResolver)
  // There is deliberately no third-party emitter in this product yet. Even a
  // future affirmative source permission cannot become delivery permission by
  // accident before a dedicated connector is implemented and reviewed.
  const thirdParty = decision(canonical, 'thirdParty', jobPostingReadiness(row), policy, [], live, undefined, false, ['THIRD_PARTY_DELIVERY_UNAVAILABLE', ...conflictReason('thirdParty')], permissionResolver)
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
