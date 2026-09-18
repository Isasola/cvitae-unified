export type GateStatus = 'PASS' | 'WARNING' | 'FAIL' | 'NOT_APPLICABLE' | 'NOT_EVALUATED'

type Gate = { status: GateStatus, reason_code: string, evidence: Record<string, unknown>, metrics: Record<string, unknown>, observed_at: string | null }
const gate = (status: GateStatus, reason_code: string, metrics: Record<string, unknown> = {}, evidence: Record<string, unknown> = {}, observed_at: string | null = null): Gate => ({ status, reason_code, metrics, evidence, observed_at })
const usable = (value: unknown) => typeof value === 'string' && value.trim().length > 0

/** Read-only source-level projection.  It never promotes, filters or mutates. */
export function evaluateEightGates(profile: any, rows: any[], latestRun: any, observations: any[], enrichmentEvents: any[], rowsScope: 'full_inventory_sample' | 'run_specific' = 'full_inventory_sample') {
  const total = rows.length
  const count = (field: string, minimum = 1) => rows.filter(row => typeof row[field] === 'string' ? row[field].trim().length >= minimum : Boolean(row[field])).length
  const descriptionOk = count('description', 80), organizationOk = count('organization'), locationOk = count('location')
  const countryOk = count('country_code'), appUrlOk = count('application_url'), sourceUrlOk = count('source_url')
  const metrics = latestRun?.extraction_metrics || {}
  const runGates = metrics.eight_gates || {}
  const runAt = latestRun?.finished_at || latestRun?.started_at || null
  const runFailed = latestRun?.status === 'failed' || metrics?.health?.status === 'DEGRADED'
  const runtimeStatus = runFailed ? 'FAIL' : latestRun ? 'PASS' : 'NOT_EVALUATED'
  const discovery = runGates.gate_1 || gate(runtimeStatus, runFailed ? 'PROVIDER_OR_DISCOVERY_FAILED' : latestRun ? 'DISCOVERY_COMPLETED' : 'NO_RUN_EVIDENCE', { found: latestRun?.found_count ?? metrics.found ?? null }, {}, runAt)
  const extracted = runGates.gate_2?.metrics?.fields || null
  const detail = runGates.gate_2 || gate(observations.length ? 'PASS' : 'NOT_EVALUATED', observations.length ? 'DETAIL_OBSERVED' : 'DETAIL_UNPROVEN', { observations: observations.length, extracted_fields: extracted }, {}, observations[0]?.observed_at || null)
  const rejected = Number(latestRun?.rejected_count ?? 0)
  const filters = runGates.gate_3 || gate(latestRun ? (rejected ? 'WARNING' : 'PASS') : 'NOT_EVALUATED', rejected ? 'FILTERED_ROWS' : latestRun ? 'FILTERS_COMPLETED' : 'NO_RUN_EVIDENCE', { rejected, valid: latestRun?.valid_count ?? null }, {}, runAt)
  const qualityFailures: string[] = []
  if (total && descriptionOk < total) qualityFailures.push('CONTENT_INSUFFICIENT')
  if (total && !organizationOk) qualityFailures.push('ORGANIZATION_MISSING')
  if (total && !countryOk && !rows.every(row => row.remote_scope && row.remote_scope !== 'UNKNOWN')) qualityFailures.push('COUNTRY_MISSING')
  if (total && rows.some(row => row.remote_scope === 'UNKNOWN')) qualityFailures.push('ARRANGEMENT_UNKNOWN')
  const quality = gate(!total ? 'NOT_EVALUATED' : qualityFailures.length ? 'FAIL' : 'PASS', qualityFailures[0] || 'NORMALIZED', { total, description_ok: descriptionOk, organization_ok: organizationOk, location_ok: locationOk, country_ok: countryOk, application_url_ok: appUrlOk, source_url_ok: sourceUrlOk, _rows_source: rowsScope }, { reasons: qualityFailures }, null)
  const fieldEvidence = extracted?.description?.extracted || 0
  const provenLost = fieldEvidence > 0 && descriptionOk < Math.max(1, Math.floor(total * .25))
  const persistence = gate(!total ? 'NOT_EVALUATED' : provenLost ? 'FAIL' : (!sourceUrlOk || !descriptionOk) ? 'WARNING' : 'PASS', provenLost ? 'DESCRIPTION_LOST_BEFORE_PERSISTENCE' : (!sourceUrlOk ? 'PERSISTENCE_UNPROVEN_SOURCE_URL_MISSING' : !descriptionOk ? 'PERSISTENCE_UNPROVEN_DESCRIPTION_MISSING' : 'PERSISTED_OK'), { total, description_ok: descriptionOk, source_url_ok: sourceUrlOk, application_url_ok: appUrlOk, enrichment_events: enrichmentEvents.length }, { extracted_description: fieldEvidence || null }, enrichmentEvents[0]?.created_at || runAt)
  const dataHealth = quality.status === 'FAIL' ? 'FAIL' : persistence.status === 'FAIL' ? 'FAIL' : quality.status === 'WARNING' || persistence.status === 'WARNING' ? 'WARNING' : 'PASS'
  const healthOverall = runtimeStatus === 'FAIL' ? 'RUNTIME_FAIL' : quality.status === 'FAIL' ? 'DATA_QUALITY_FAIL' : persistence.status === 'FAIL' ? 'PERSISTENCE_FAIL' : runtimeStatus === 'NOT_EVALUATED' ? 'UNKNOWN' : (quality.status === 'WARNING' || persistence.status === 'WARNING') ? 'PARTIAL' : 'HEALTHY'
  const healthScope = !latestRun ? 'no_run_evidence' : rowsScope
  const health = gate(runtimeStatus === 'FAIL' ? 'FAIL' : dataHealth === 'FAIL' ? 'FAIL' : runtimeStatus === 'NOT_EVALUATED' ? 'NOT_EVALUATED' : dataHealth, runtimeStatus === 'PASS' && dataHealth === 'FAIL' ? 'RUNTIME_PASS_DATA_HEALTH_FAIL' : runtimeStatus === 'FAIL' ? 'RUNTIME_HEALTH_FAIL' : dataHealth === 'PASS' ? 'HEALTHY' : 'DATA_HEALTH_WARNING', { runtime_health: runtimeStatus, data_health: dataHealth, observations: observations.length, overall: healthOverall, scope: healthScope }, {}, runAt)
  const preceding = [discovery, detail, filters, quality, persistence, health]
  const priorFailureIndex = preceding.findIndex(value => value.status === 'FAIL')
  const priorFailure = priorFailureIndex >= 0 ? preceding[priorFailureIndex] : null
  const automationEnabled = profile.automation_enabled !== false
  // Gate 7: use bridge execution evidence when available; policy disabled ≠ technical fail
  const bridge = metrics.automation_bridge as any
  const automation = (() => {
    if (priorFailure) return gate('NOT_EVALUATED', 'BLOCKED_BY_PREVIOUS_GATE', { auto_enabled: Boolean(profile.auto_enabled), automation_enabled: automationEnabled, certified: Boolean(profile.certified) }, { blocked_by_gate: priorFailureIndex + 1, blocked_by_reason: priorFailure.reason_code || null }, runAt)
    if (!automationEnabled) return gate('NOT_APPLICABLE', 'AUTOMATION_DISABLED_BY_POLICY', { auto_enabled: Boolean(profile.auto_enabled), automation_enabled: false, certified: Boolean(profile.certified) }, {}, runAt)
    if (!profile.certified) return gate('NOT_APPLICABLE', 'SOURCE_NOT_CERTIFIED', { auto_enabled: Boolean(profile.auto_enabled), automation_enabled: automationEnabled, certified: false }, {}, runAt)
    if (!profile.auto_enabled) return gate('NOT_APPLICABLE', 'AUTO_DISABLED_BY_POLICY', { auto_enabled: false, automation_enabled: automationEnabled, certified: Boolean(profile.certified) }, {}, runAt)
    if (bridge) {
      if (bridge.status === 'AUTOMATION_BRIDGE_FAILED') return gate('FAIL', 'AUTOMATION_BRIDGE_FAILED', { ...bridge, auto_enabled: true, certified: true }, {}, runAt)
      const nonSystemic = (Number(bridge.human_review) || 0) + (Number(bridge.hold) || 0) > 0
      return gate(nonSystemic ? 'WARNING' : 'PASS', nonSystemic ? 'BRIDGE_NON_SYSTEMIC_REVIEW' : 'AUTOMATION_BRIDGE_EXECUTED', { ...bridge, auto_enabled: true, certified: true }, {}, runAt)
    }
    return gate('PASS', 'READY_FOR_AUTOMATION', { auto_enabled: Boolean(profile.auto_enabled), automation_enabled: automationEnabled, certified: Boolean(profile.certified) }, { blocked_by_gate: null, blocked_by_reason: null }, runAt)
  })()
  const policy = profile.distribution_policy
  const hasPolicy = Boolean(policy && typeof policy === 'object')
  const declared = (key: string) => hasPolicy && Object.prototype.hasOwnProperty.call(policy, key)
  const surface = (key: string, label: string) => !declared(key) ? { surface: label, state: 'POLICY_NOT_DEFINED' } : { surface: label, state: policy[key] ? 'ALLOWED' : 'RESTRICTED' }
  // capability: use DB-level flag from profile if present, otherwise POLICY_NOT_DEFINED
  const capability = (key: string, label: string) => typeof profile[key] === 'boolean' ? { surface: label, state: profile[key] ? 'ALLOWED' : 'RESTRICTED' } : { surface: label, state: 'POLICY_NOT_DEFINED' }
  // catalog requires both web_catalog_allowed (policy) AND catalog_enabled (DB flag)
  const catalogAllowed = declared('web_catalog_allowed') && policy.web_catalog_allowed && (typeof profile.catalog_enabled !== 'boolean' || profile.catalog_enabled)
  // organic_seo: tri-state policy check (search_engine_indexing_allowed)
  //   false  → POLICY_DENIED (source contract prohibits SEO regardless of seo_enabled)
  //   true   → policy permits; fall through to seo_enabled DB flag
  //   null/undefined → legacy; seo_enabled DB flag governs (existing behaviour)
  const seiAllowed = profile.search_engine_indexing_allowed
  const organic_seo = seiAllowed === false
    ? { surface: 'organic_seo', state: 'POLICY_DENIED' }
    : seiAllowed === true
      ? capability('seo_enabled', 'organic_seo')
      : capability('seo_enabled', 'organic_seo')  // null = legacy path
  const surfaces = {
    web_catalog: !declared('web_catalog_allowed') ? { surface: 'web_catalog', state: 'POLICY_NOT_DEFINED' } : { surface: 'web_catalog', state: catalogAllowed ? 'ALLOWED' : 'RESTRICTED' },
    matching: capability('matching_enabled', 'matching'),
    alerts: capability('alerts_enabled', 'alerts'),
    organic_seo,
    google_jobs: surface('google_jobs_distribution_allowed', 'google_jobs'),
    third_party_distribution: surface('third_party_job_distribution_allowed', 'third_party_distribution'),
    attribution_required: !declared('source_attribution_required') ? { surface: 'attribution_required', state: 'POLICY_NOT_DEFINED' } : { surface: 'attribution_required', state: policy.source_attribution_required ? 'REQUIRED' : 'NOT_REQUIRED' },
  }
  const values = Object.values(surfaces).map((value: any) => value.state)
  const allowed = values.filter(value => value === 'ALLOWED').length
  const restricted = values.filter(value => value === 'RESTRICTED').length
  const undefinedPolicies = values.filter(value => value === 'POLICY_NOT_DEFINED').length
  const distribution = gate(
    priorFailure ? 'NOT_EVALUATED' : !hasPolicy || undefinedPolicies === values.length ? 'NOT_EVALUATED' : allowed && (restricted || undefinedPolicies) ? 'WARNING' : allowed ? 'PASS' : restricted ? 'NOT_APPLICABLE' : 'NOT_EVALUATED',
    priorFailure ? 'BLOCKED_BY_PREVIOUS_GATE' : !hasPolicy || undefinedPolicies === values.length ? 'POLICY_NOT_DEFINED' : allowed && (restricted || undefinedPolicies) ? 'PARTIALLY_ALLOWED' : allowed ? 'DISTRIBUTION_ALLOWED_BY_POLICY' : restricted ? 'RESTRICTED_BY_POLICY' : 'POLICY_NOT_DEFINED',
    { surfaces, allowed, restricted, policy_not_defined: undefinedPolicies },
    { blocked_by_gate: priorFailure ? priorFailureIndex + 1 : null, blocked_by_reason: priorFailure?.reason_code || null }, null,
  )
  const context = { source: profile.canonical_source, run_id: latestRun?.run_id || null, opportunity_id: null, adapter_version: latestRun?.adapter_version || profile.adapter_version, semantic_version: profile.semantic_version }
  return { contract: 'source-intelligence:eight-gates:v1', ...context, gates: [discovery, detail, filters, quality, persistence, health, automation, distribution].map(value => ({ ...value, ...context })) }
}
