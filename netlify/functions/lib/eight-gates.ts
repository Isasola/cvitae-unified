import { sourcePermissionDimensionTruth, sourcePermissionEvidenceClass } from '../../../src/lib/source-permission-truth'

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
  // G4–G6: use run-specific evidence when Python scraper computed it (quality_metrics present).
  // Fall back to full-inventory row computation only when run-specific gates are absent.
  const hasRunSpecificG46 = Boolean((runGates.gate_4 as any)?.metrics?._rows_source === 'run_specific')
  const qualityFailures: string[] = []
  if (total && descriptionOk < total) qualityFailures.push('CONTENT_INSUFFICIENT')
  if (total && !organizationOk) qualityFailures.push('ORGANIZATION_MISSING')
  if (total && !countryOk && !rows.every(row => row.remote_scope && row.remote_scope !== 'UNKNOWN')) qualityFailures.push('COUNTRY_MISSING')
  if (total && rows.some(row => row.remote_scope === 'UNKNOWN')) qualityFailures.push('ARRANGEMENT_UNKNOWN')
  const inventoryQuality = gate(!total ? 'NOT_EVALUATED' : qualityFailures.length ? 'FAIL' : 'PASS', qualityFailures[0] || 'NORMALIZED', { total, description_ok: descriptionOk, organization_ok: organizationOk, location_ok: locationOk, country_ok: countryOk, application_url_ok: appUrlOk, source_url_ok: sourceUrlOk, _rows_source: rowsScope }, { reasons: qualityFailures }, null)
  const quality = hasRunSpecificG46 ? runGates.gate_4 as any as Gate : inventoryQuality
  const fieldEvidence = extracted?.description?.extracted || 0
  const provenLost = fieldEvidence > 0 && descriptionOk < Math.max(1, Math.floor(total * .25))
  const inventoryPersistence = gate(!total ? 'NOT_EVALUATED' : provenLost ? 'FAIL' : (!sourceUrlOk || !descriptionOk) ? 'WARNING' : 'PASS', provenLost ? 'DESCRIPTION_LOST_BEFORE_PERSISTENCE' : (!sourceUrlOk ? 'PERSISTENCE_UNPROVEN_SOURCE_URL_MISSING' : !descriptionOk ? 'PERSISTENCE_UNPROVEN_DESCRIPTION_MISSING' : 'PERSISTED_OK'), { total, description_ok: descriptionOk, source_url_ok: sourceUrlOk, application_url_ok: appUrlOk, enrichment_events: enrichmentEvents.length }, { extracted_description: fieldEvidence || null }, enrichmentEvents[0]?.created_at || runAt)
  const persistence = hasRunSpecificG46 && runGates.gate_5 ? runGates.gate_5 as any as Gate : inventoryPersistence
  const missingEvidence = [discovery.status, detail.status, filters.status, runtimeStatus, quality.status, persistence.status].some(status => status === 'NOT_EVALUATED')
  const dataHealth = [quality.status, persistence.status].includes('FAIL') ? 'FAIL' : [quality.status, persistence.status].includes('NOT_EVALUATED') ? 'NOT_EVALUATED' : [quality.status, persistence.status].includes('WARNING') ? 'WARNING' : 'PASS'
  const healthOverall = runtimeStatus === 'FAIL' ? 'RUNTIME_FAIL' : quality.status === 'FAIL' ? 'DATA_QUALITY_FAIL' : persistence.status === 'FAIL' ? 'PERSISTENCE_FAIL' : missingEvidence ? 'UNKNOWN' : (quality.status === 'WARNING' || persistence.status === 'WARNING') ? 'PARTIAL' : 'HEALTHY'
  const healthScope = !latestRun ? 'no_run_evidence' : hasRunSpecificG46 ? 'run_specific' : rowsScope
  const inventoryHealth = gate(runtimeStatus === 'FAIL' ? 'FAIL' : dataHealth === 'FAIL' ? 'FAIL' : missingEvidence ? 'NOT_EVALUATED' : dataHealth, missingEvidence ? 'HEALTH_EVIDENCE_INCOMPLETE' : runtimeStatus === 'PASS' && dataHealth === 'FAIL' ? 'RUNTIME_PASS_DATA_HEALTH_FAIL' : runtimeStatus === 'FAIL' ? 'RUNTIME_HEALTH_FAIL' : dataHealth === 'PASS' ? 'HEALTHY' : 'DATA_HEALTH_WARNING', { runtime_health: runtimeStatus, data_health: dataHealth, observations: observations.length, overall: healthOverall, scope: healthScope }, {}, runAt)
  const healthPrior = [discovery, detail, filters, quality, persistence]
  const healthPriorFailure = healthPrior.findIndex(value => value.status === 'FAIL')
  const healthPriorMissing = healthPrior.findIndex(value => value.status === 'NOT_EVALUATED')
  const health = healthPriorFailure >= 0 || healthPriorMissing >= 0
    ? gate('NOT_EVALUATED', healthPriorFailure >= 0 ? 'BLOCKED_BY_PREVIOUS_FAILURE' : 'BLOCKED_BY_MISSING_EVIDENCE', {}, { blocked_by_gate: (healthPriorFailure >= 0 ? healthPriorFailure : healthPriorMissing) + 1 }, runAt)
    : hasRunSpecificG46 && runGates.gate_6 ? runGates.gate_6 as any as Gate : inventoryHealth
  const preceding = [discovery, detail, filters, quality, persistence, health]
  const priorFailureIndex = preceding.findIndex(value => value.status === 'FAIL')
  const priorFailure = priorFailureIndex >= 0 ? preceding[priorFailureIndex] : null
  const missingEvidenceIndex = preceding.findIndex(value => value.status === 'NOT_EVALUATED')
  const priorUnconfirmedIndex = priorFailureIndex >= 0 ? priorFailureIndex : missingEvidenceIndex
  const priorUnconfirmed = priorUnconfirmedIndex >= 0 ? preceding[priorUnconfirmedIndex] : null
  const automationEnabled = profile.automation_enabled !== false
  // Gate 7: use bridge execution evidence when available; policy disabled ≠ technical fail
  const bridge = metrics.automation_bridge as any
  const automation = (() => {
    if (!automationEnabled) return gate('NOT_APPLICABLE', 'AUTOMATION_DISABLED_BY_POLICY', { auto_enabled: Boolean(profile.auto_enabled), automation_enabled: false, certified: Boolean(profile.certified) }, {}, runAt)
    if (!profile.certified) return gate('NOT_APPLICABLE', 'SOURCE_NOT_CERTIFIED', { auto_enabled: Boolean(profile.auto_enabled), automation_enabled: automationEnabled, certified: false }, {}, runAt)
    if (!profile.auto_enabled) return gate('NOT_APPLICABLE', 'AUTO_DISABLED_BY_POLICY', { auto_enabled: false, automation_enabled: automationEnabled, certified: Boolean(profile.certified) }, {}, runAt)
    if (priorUnconfirmed) return gate('NOT_EVALUATED', priorFailure ? 'BLOCKED_BY_PREVIOUS_FAILURE' : 'BLOCKED_BY_MISSING_EVIDENCE', { auto_enabled: true, automation_enabled: true, certified: true }, { blocked_by_gate: priorUnconfirmedIndex + 1, blocked_by_reason: priorUnconfirmed.reason_code || null }, runAt)
    if (bridge) {
      if (bridge.status === 'AUTOMATION_BRIDGE_FAILED') return gate('FAIL', 'AUTOMATION_BRIDGE_FAILED', { ...bridge, auto_enabled: true, certified: true }, {}, runAt)
      const nonSystemic = (Number(bridge.human_review) || 0) + (Number(bridge.hold) || 0) > 0
      return gate(nonSystemic ? 'WARNING' : 'PASS', nonSystemic ? 'BRIDGE_NON_SYSTEMIC_REVIEW' : 'AUTOMATION_BRIDGE_EXECUTED', { ...bridge, auto_enabled: true, certified: true }, {}, runAt)
    }
    return gate('PASS', 'READY_FOR_AUTOMATION', { auto_enabled: Boolean(profile.auto_enabled), automation_enabled: automationEnabled, certified: Boolean(profile.certified) }, { blocked_by_gate: null, blocked_by_reason: null }, runAt)
  })()
  const permission = (dimension: Parameters<typeof sourcePermissionDimensionTruth>[1]) => sourcePermissionDimensionTruth(profile.canonical_source, dimension)
  const surface = (dimension: Parameters<typeof sourcePermissionDimensionTruth>[1], label: string, operational?: boolean | null) => {
    const evidence = permission(dimension)
    return { surface: label, permission_role: ['catalog','matching','alerts','seo_index'].includes(dimension) ? 'ADVISORY_FIRST_PARTY' : 'SPECIFIC_DIMENSION', state: evidence.state, reason: evidence.reason, provenance: evidence.provenance,
      evidence_class: sourcePermissionEvidenceClass(evidence),
      operational_state: operational === true ? 'ENABLED' : operational === false ? 'DISABLED' : 'UNKNOWN' }
  }
  const attribution = permission('attribution_requirement')
  const surfaces = {
    collect: surface('collect', 'collect'),
    detail_fetch: surface('detail_fetch', 'detail_fetch'),
    web_catalog: surface('catalog', 'web_catalog', profile.catalog_enabled),
    matching: surface('matching', 'matching', profile.matching_enabled),
    alerts: surface('alerts', 'alerts', profile.alerts_enabled),
    organic_seo: surface('seo_index', 'organic_seo', profile.seo_enabled),
    google_jobs: surface('google_jobs', 'google_jobs'),
    third_party_distribution: surface('third_party_distribution', 'third_party_distribution'),
    application_routing: surface('application_routing', 'application_routing'),
    attribution_required: { surface: 'attribution_required', state: attribution.state,
      required: attribution.state === 'ALLOWED' && /required/i.test(attribution.notes),
      reason: attribution.reason, provenance: attribution.provenance },
  }
  const values = Object.values(surfaces).map((value: any) => value.state)
  const allowed = values.filter(value => value === 'ALLOWED').length
  const restricted = values.filter(value => value === 'DENIED').length
  const undefinedPolicies = values.filter(value => value === 'UNKNOWN').length
  const distribution = gate(
    priorUnconfirmed ? 'NOT_EVALUATED' : undefinedPolicies === values.length ? 'NOT_EVALUATED' : allowed && (restricted || undefinedPolicies) ? 'WARNING' : allowed ? 'PASS' : restricted ? 'NOT_APPLICABLE' : 'NOT_EVALUATED',
    priorUnconfirmed ? (priorFailure ? 'BLOCKED_BY_PREVIOUS_FAILURE' : 'BLOCKED_BY_MISSING_EVIDENCE') : undefinedPolicies === values.length ? 'SOURCE_PERMISSION_UNKNOWN' : allowed && (restricted || undefinedPolicies) ? 'MIXED_PERMISSION_STATES' : allowed ? 'DISTRIBUTION_ALLOWED_BY_EVIDENCE' : restricted ? 'RESTRICTED_BY_EVIDENCE' : 'SOURCE_PERMISSION_UNKNOWN',
    { surfaces, allowed, restricted, permission_unknown: undefinedPolicies },
    { blocked_by_gate: priorUnconfirmed ? priorUnconfirmedIndex + 1 : null, blocked_by_reason: priorUnconfirmed?.reason_code || null }, null,
  )
  const context = { source: profile.canonical_source, run_id: latestRun?.run_id || null, opportunity_id: null, adapter_version: latestRun?.adapter_version || 'NOT_REPORTED', expected_adapter_version: profile.adapter_version, semantic_version: profile.semantic_version }
  return { contract: 'source-intelligence:eight-gates:v1', ...context, gates: [discovery, detail, filters, quality, persistence, health, automation, distribution].map(value => ({ ...value, ...context })) }
}
