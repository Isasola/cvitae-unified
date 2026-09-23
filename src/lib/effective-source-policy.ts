import registry from '../generated/source-intelligence-registry.json'
import { alertsReadiness, catalogReadiness, jobPostingReadiness, matchingReadiness, seoReadiness, type OpportunityTruthInput, type ReadinessResult } from './opportunity-truth'

export type SourcePolicyRow = {
  source: string; is_enabled?: boolean | null; catalog_enabled?: boolean | null
  matching_enabled?: boolean | null; alerts_enabled?: boolean | null; seo_enabled?: boolean | null
  registry_certified?: boolean | null; registry_adapter_version?: string | null
  registry_policy_hash?: string | null; registry_synced_at?: string | null
  web_catalog_allowed?: boolean | null; search_engine_indexing_allowed?: boolean | null
  google_jobs_distribution_allowed?: boolean | null; third_party_job_distribution_allowed?: boolean | null
  source_attribution_required?: boolean | null
}
export type CapabilityState = 'ALLOWED' | 'DENIED' | 'UNKNOWN'
export type AdminSwitchState = 'ENABLED' | 'DISABLED' | 'UNKNOWN' | 'LEGACY_CONFIG_DISABLED'
export type PolicyDecision = {
  allowed: boolean; canonicalSource: string; rowReadiness: ReadinessResult
  capabilityState: CapabilityState; adminSwitchState: AdminSwitchState
  storedGateState: 'TRUE' | 'FALSE' | 'UNKNOWN' | 'NOT_APPLICABLE'
  reasons: string[]
}
const profiles = (registry as any).sources as Array<{ canonical_source:string; emitted_aliases:string[] }>

/** Exact Registry V2 aliases only. Unknown raw IDs remain themselves and fail closed. */
export function canonicalSource(raw: string | null | undefined): string {
  const key = String(raw || '').trim().toLowerCase()
  if (!key) return ''
  return profiles.find(profile => profile.canonical_source === key || profile.emitted_aliases.includes(key))?.canonical_source || key
}
type Consumer = 'catalog' | 'matching' | 'alerts' | 'seo' | 'jobPosting' | 'googleJobs' | 'thirdParty'

/**
 * This is source-policy evidence, not a source-specific routing shortcut.
 * The known Himalayas API terms explicitly restrict search distribution; no
 * legacy false switch is promoted to a contractual restriction for any other
 * source. Add future entries only with source-policy evidence.
 */
const EXPLICIT_CONSUMER_DENIALS: Record<string, Partial<Record<Consumer, true>>> = {
  himalayas: { seo: true, jobPosting: true, googleJobs: true, thirdParty: true },
}

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
  if (EXPLICIT_CONSUMER_DENIALS[canonical]?.[consumer]) return 'DENIED'
  // Unlike CVitae-owned surfaces, third-party distribution requires an
  // affirmative source permission. It is still not deliverable until a
  // connector exists; that operational absence is represented separately.
  if (consumer === 'thirdParty') return policy.third_party_job_distribution_allowed === true ? 'ALLOWED' : 'DENIED'
  // Product policy permits ordinary known sources per consumer unless there is
  // an explicit restriction. DB booleans are retained as configuration/audit
  // evidence but are not treated as contractual denial.
  return 'ALLOWED'
}
const decision = (canonicalSource: string, consumer: Consumer, rowReadiness: ReadinessResult, policy: SourcePolicyRow | undefined, admin: Array<boolean | null | undefined>, live: boolean, storedGate: unknown, storedApplicable = true, extraReasons: string[] = []): PolicyDecision => {
  const policyFound = Boolean(policy)
  const capabilityState = capabilityFor(canonicalSource, consumer, policy)
  const adminSwitchState = legacySwitchState(policy, admin)
  const reasons = [
    ...(policyFound ? [] : ['SOURCE_POLICY_UNKNOWN']),
    ...(rowReadiness.state === 'READY' ? [] : rowReadiness.reasons),
    ...(capabilityState === 'ALLOWED' ? [] : [capabilityState === 'UNKNOWN' ? 'SOURCE_CAPABILITY_UNKNOWN' : 'SOURCE_CAPABILITY_DENIED']),
    ...(policy?.is_enabled === true ? [] : [policy ? 'SOURCE_DISABLED' : 'SOURCE_SWITCH_UNKNOWN']),
    ...(live ? [] : ['ROW_LIFECYCLE_NOT_ROUTABLE']),
    ...extraReasons,
  ]
  return { allowed: reasons.length === 0, canonicalSource, rowReadiness, capabilityState, adminSwitchState, storedGateState: storedGateState(storedGate, storedApplicable), reasons }
}

/** One fail-closed evaluation for runtime/build projections. Canonical DB row wins over legacy alias rows. */
export function evaluateOpportunityDistribution(row: OpportunityTruthInput & Record<string, any>, rows: SourcePolicyRow[]) {
  const canonical = canonicalSource(row.source)
  const policy = rows.find(item => String(item.source).toLowerCase() === canonical)
  const live = row.is_active === true && row.verification_status === 'verified' && !row.deleted_at && !row.archived_at
  const sourceOn = policy?.is_enabled === true
  const catalog = decision(canonical, 'catalog', catalogReadiness(row), policy, [policy?.catalog_enabled], live, row.catalog_eligible)
  const matching = decision(canonical, 'matching', matchingReadiness(row), policy, [policy?.matching_enabled], live, row.match_eligible)
  const alerts = decision(canonical, 'alerts', alertsReadiness(row), policy, [policy?.alerts_enabled], live, row.alerts_eligible)
  const seo = decision(canonical, 'seo', seoReadiness(row), policy, [policy?.seo_enabled], live, row.seo_eligible)
  const jobPosting = decision(canonical, 'jobPosting', jobPostingReadiness(row), policy, [policy?.seo_enabled], live, row.jobposting_validity, row.jobposting_validity !== undefined)
  const googleJobs = decision(canonical, 'googleJobs', jobPostingReadiness(row), policy, [policy?.seo_enabled], live, row.jobposting_validity, row.jobposting_validity !== undefined)
  // There is deliberately no third-party emitter in this product yet. Even a
  // future affirmative source permission cannot become delivery permission by
  // accident before a dedicated connector is implemented and reviewed.
  const thirdParty = decision(canonical, 'thirdParty', jobPostingReadiness(row), policy, [policy?.third_party_job_distribution_allowed], live, undefined, false, ['THIRD_PARTY_DELIVERY_UNAVAILABLE'])
  return { canonicalSource: canonical, policyFound: Boolean(policy), sourceOn, catalog, matching, alerts, seo, jobPosting, googleJobs, thirdParty }
}

/** Public/build-safe projection. Every onward-distribution consumer reads this shape. */
export function publicDistributionProjection(row: OpportunityTruthInput & Record<string, any>, rows: SourcePolicyRow[]) {
  const decision = evaluateOpportunityDistribution(row, rows)
  return {
    canonicalSource: decision.canonicalSource,
    sourceAttributionRequired: policyForProjection(rows, decision.canonicalSource)?.source_attribution_required === true,
    seo: decision.seo,
    jobPosting: decision.jobPosting,
    googleJobs: decision.googleJobs,
    thirdParty: decision.thirdParty,
  }
}

function policyForProjection(rows: SourcePolicyRow[], canonical: string): SourcePolicyRow | undefined {
  return rows.find(item => String(item.source).toLowerCase() === canonical)
}
