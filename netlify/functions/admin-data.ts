import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"
import { getGoogleReportingMetrics } from "./lib/google-reporting"
import { runSeoPipeline } from "./lib/seo-pipeline-runner"
import { classifyOpportunity } from "../../src/lib/seo/classify"
import { enqueueIndexingEvent } from "./lib/indexing-queue"
import { selectBatchMutationCandidates, validateBatchApprovalSnapshot } from "./lib/batch-review-snapshot"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { evaluateEightGates } from "./lib/eight-gates"
import { reconcileInventoryRows, reconciliationSummary, mergeReconciliationSummaries, accumulateReconciliationPerSource } from "../../src/lib/inventory-reconciliation"
import { indexRowsBySource, latestRowsByKey, rowsForAliases, scopedMetric, summarizeSourceHealth } from "../../src/lib/source-intelligence-contract"
import { matchingProfileSignature } from "../../shared/matching-profile-signature"
import { SOURCE_PERMISSION_DIMENSIONS, sourcePermissionDimensionTruth } from "../../src/lib/source-permission-truth"

const SOURCE_SCAN_SCRAPERS: Record<string, string> = {
  unjobs: "unjobs_scraper", himalayas: "himalayas_scraper", talentcom: "talentcom_scraper", weworkremotely: "weworkremotely_scraper",
}

// Contract for all admin control-plane write actions.
// Every action that mutates state returns this shape.
interface AdminActionResult {
  status: "ok" | "error" | "blocked" | "no_change"
  executed: boolean
  changed: boolean
  source: string
  action: string
  reason: string
  rows_scanned: number
  rows_changed: number
  started_at: string
  finished_at: string
  event_id: string | null
  error: string | null
  blockers: string[]
}

function sourceIntelligenceRegistry() {
  return JSON.parse(readFileSync(resolve(process.cwd(), "src/generated/source-intelligence-registry.json"), "utf8"))
}

function sourcePermissionSnapshot(source: string) {
  return Object.fromEntries(SOURCE_PERMISSION_DIMENSIONS.map(dimension => [dimension, sourcePermissionDimensionTruth(source, dimension)]))
}

function scraperFieldSurvival() {
  // Generated offline from Registry V2 + the active emitter contracts.  An
  // unavailable diagnostic never changes a source decision; it is reported as
  // UNKNOWN rather than manufactured as a successful field-survival result.
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), "generated/scraper-field-survival.json"), "utf8"))
  } catch {
    return { schema_version: "unavailable", sources: [], field_totals: {} }
  }
}

// Production does not expose requirements/professional_family on every
// schema version. Core truth treats them as optional, so reconciliation must
// not make their absence a read failure.
const RECONCILIATION_FIELDS = "id,source,slug,title,organization,description,tags,opportunity_type,opportunity_kind,is_active,verification_status,catalog_eligible,match_eligible,alerts_eligible,seo_eligible,seo_status,deleted_at,archived_at,embedding,embedding_error"
const RECONCILIATION_POLICY_FIELDS = "source,is_enabled,catalog_enabled,matching_enabled,alerts_enabled,seo_enabled,web_catalog_allowed,search_engine_indexing_allowed,google_jobs_distribution_allowed,third_party_job_distribution_allowed,source_attribution_required"
const RECONCILIATION_PAGE_SIZE = 250
const SOURCE_DIAGNOSTIC_SAMPLE_LIMIT = 2000

function reconciliationAliases(scope: string): string[] | null {
  if (!scope || scope === "all") return null
  const profile = (sourceIntelligenceRegistry().sources || []).find((item: any) => item.canonical_source === scope)
  return profile ? (profile.emitted_aliases || [profile.canonical_source]) : null
}

function reconciliationReasonCounts(summary: any) {
  return Object.fromEntries((summary?.top_reason_codes || []).map((item: any) => [item.reason, item.count]))
}

function reconciliationPatch(decision: any) {
  // Only row-intrinsic, deterministic flags are repaired here. `seo_status`
  // retains its distinct review workflow and is deliberately absent.
  return Object.fromEntries(Object.entries(decision.proposed).filter(([key]) =>
    ["catalog_eligible", "match_eligible", "alerts_eligible", "seo_eligible"].includes(key)
  ))
}

// P0.3: Derive runner IDs from canonical source (e.g. "unjobs" → "unjobs_scraper").
// operational_runner_ids from profile takes precedence when populated.
function runnerIdsFor(profile: any): Set<string> {
  const base = (profile.canonical_source || '').toLowerCase()
  const ids = new Set<string>([base, `${base}_scraper`, `${base}_scrapper`])
  for (const alias of (profile.emitted_aliases || [])) ids.add(String(alias).toLowerCase())
  for (const runnerId of (profile.operational_runner_ids || [])) ids.add(String(runnerId).toLowerCase())
  return ids
}

export async function loadMissingOpportunitySamples(supabase: any, profiles: any[], globalIndex: Map<string, any[]>) {
  const result = new Map<string, { rows: any[], status: 'GLOBAL_SAMPLE' | 'PER_SOURCE_SAMPLE' | 'EMPTY_FULL_DB' | 'UNAVAILABLE' }>()
  const missing = profiles.filter(profile => {
    const aliases = profile.emitted_aliases || [profile.canonical_source]
    return rowsForAliases(globalIndex, aliases).length === 0
  })
  for (const profile of profiles) {
    const aliases = profile.emitted_aliases || [profile.canonical_source]
    const globalRows = rowsForAliases(globalIndex, aliases)
    if (globalRows.length > 0) result.set(profile.canonical_source, { rows: globalRows.slice(0, SOURCE_DIAGNOSTIC_SAMPLE_LIMIT), status: 'GLOBAL_SAMPLE' })
  }
  let cursor = 0
  const worker = async () => {
    while (cursor < missing.length) {
      const profile = missing[cursor++]
      const aliases = profile.emitted_aliases || [profile.canonical_source]
      try {
        const response = await supabase.from("opportunities")
          .select("id,title,source,semantic_fingerprint,match_eligible,description,organization,location,country_code,application_url,source_url,remote_scope")
          .in("source", aliases).is("deleted_at", null).is("archived_at", null)
          .order("id", { ascending: true }).limit(SOURCE_DIAGNOSTIC_SAMPLE_LIMIT)
        const rows = response.error ? [] : (response.data || [])
        result.set(profile.canonical_source, { rows, status: response.error ? 'UNAVAILABLE' : rows.length ? 'PER_SOURCE_SAMPLE' : 'EMPTY_FULL_DB' })
      } catch {
        result.set(profile.canonical_source, { rows: [], status: 'UNAVAILABLE' })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, Math.max(1, missing.length)) }, () => worker()))
  return result
}

export async function sourceIntelligenceSnapshot(supabase: any, dashboard: any, controls: any[] = []) {
  const assemblyStartedAt = Date.now()
  const queryStartedAt = Date.now()
  // Generated from the Python V2 core. This function joins read-only DB facts;
  // aliases, certification and semantics remain owned by that core.
  const registry = sourceIntelligenceRegistry()
  const survival = scraperFieldSurvival()
  const survivalBySource = new Map((survival.sources || []).map((item: any) => [item.canonical_source, item]))
  const stats: Record<string, any> = dashboard?.sources || {}
  const [observationsRes, policyRes, runsRes, fingerprintsRes, enrichmentRes, sourceCapRes, qualityAggRes, telemetryAuditRes] = await Promise.all([
    supabase.from("opportunity_source_observations").select("opportunity_id,source,identity_status,http_status,observed_at").order("observed_at", { ascending: false }).limit(10000),
    supabase.from("opportunity_source_policy_events").select("opportunity_id,source,action,created_at").order("created_at", { ascending: false }).limit(10000),
    supabase.from("scraper_runs").select("id,run_id,scraper_id,status,started_at,finished_at,duration_seconds,error_count,found_count,valid_count,inserted_count,updated_count,unchanged_count,duplicate_count,rejected_count,error_summary,adapter_version,extraction_metrics").order("started_at", { ascending: false }).limit(1000),
    // Do not read embedding vectors: source-level pending counts are only
    // exposed when their lightweight inputs are available.
    supabase.from("opportunities").select("id,title,source,semantic_fingerprint,match_eligible,description,organization,location,country_code,application_url,source_url,remote_scope").is("deleted_at", null).is("archived_at", null).limit(10000),
    supabase.from("opportunity_enrichment_events").select("opportunity_id,source,changed_fields,created_at").order("created_at", { ascending: false }).limit(10000),
    supabase.rpc("get_source_distribution_policy"),
    // P0.1: Full-DB fingerprint pending counts via server-side aggregate.
    supabase.rpc("admin_source_quality_aggregate"),
    supabase.from("source_control_audit_log").select("source,action,result_status,created_at").in("action", ["maintenance_telemetry", "maintenance_telemetry_retry"]).order("created_at", { ascending: false }).limit(1000),
  ])
  const [universeRes, pipelineLedgerRes] = await Promise.all([
    supabase.rpc("get_opportunity_universe_summary"),
    supabase.rpc("admin_opportunity_pipeline_ledger"),
  ])
  const queryDurationMs = Date.now() - queryStartedAt
  const observationRows = observationsRes.error ? [] : (observationsRes.data || [])
  const policyRows = policyRes.error ? [] : (policyRes.data || [])
  const runRows = runsRes.error ? [] : (runsRes.data || [])
  const fingerprintRows = fingerprintsRes.error ? [] : (fingerprintsRes.data || [])
  const enrichmentRows = enrichmentRes.error ? [] : (enrichmentRes.data || [])
  const sourceCapRows: any[] = sourceCapRes.error ? [] : (sourceCapRes.data || [])
  const telemetryAuditRows: any[] = telemetryAuditRes.error ? [] : (telemetryAuditRes.data || [])
  // P0.1: Server-side fingerprint pending counts (full DB, no limit).
  const qualityAgg: Record<string, any> = qualityAggRes.error ? {} : (qualityAggRes.data || {})
  const observationBySource = indexRowsBySource(observationRows)
  const policyBySource = indexRowsBySource(policyRows)
  const fingerprintBySource = indexRowsBySource(fingerprintRows)
  const enrichmentBySource = indexRowsBySource(enrichmentRows)
  const telemetryBySource = indexRowsBySource(telemetryAuditRows)
  const statsBySource = new Map(Object.entries(stats).map(([source, value]) => [source.toLowerCase(), value]))
  const sourceCapBySource = new Map(sourceCapRows.map(item => [String(item.source || '').toLowerCase(), item]))
  const qualityBySource = new Map(Object.entries(qualityAgg).map(([source, value]) => [source.toLowerCase(), value]))
  const runsByRunner = indexRowsBySource(runRows.map(item => ({ ...item, source: item.scraper_id })))
  const controlsByRunner = indexRowsBySource(controls.map(item => ({ ...item, source: item.scraper_id })))
  const sourceOpportunitySamples = await loadMissingOpportunitySamples(supabase, registry.sources || [], fingerprintBySource)
  const knownAliases = new Set<string>((registry.sources || []).flatMap((profile: any) => profile.emitted_aliases || []).map((value: string) => value.toLowerCase()))
  const unresolvedEmittedSources = Object.keys(stats).filter(source => !knownAliases.has(source.toLowerCase()))
  const now = Date.now()
  const sources = (registry.sources || []).map((profile: any) => {
    const aliases = profile.emitted_aliases || [profile.canonical_source]
    const aliasSet = new Set<string>(aliases.map((value: string) => value.toLowerCase()))
    // Merge durable DB capability flags into profile for Gate 8 independent surface display
    const srcCap = aliases.map(alias => sourceCapBySource.get(alias.toLowerCase())).find(Boolean)
      const capabilityFlags = srcCap ? {
        is_enabled: Boolean(srcCap.is_enabled),
        catalog_enabled: Boolean(srcCap.catalog_enabled),
        matching_enabled: Boolean(srcCap.matching_enabled),
        alerts_enabled: Boolean(srcCap.alerts_enabled),
        seo_enabled: Boolean(srcCap.seo_enabled),
        web_catalog_allowed: srcCap.web_catalog_allowed ?? null,
        search_engine_indexing_allowed: srcCap.search_engine_indexing_allowed ?? null,
        google_jobs_distribution_allowed: srcCap.google_jobs_distribution_allowed ?? null,
      } : {}
    const pools = aliases.reduce((acc: any, emitted: string) => {
      const value = statsBySource.get(emitted.toLowerCase()) || {}
      acc.inventory += Number(value.total || 0); acc.catalog += Number(value.catalog || 0)
      acc.matching += Number(value.matching || 0); acc.seo += Number(value.seo || 0)
      acc.thin_description += Number(value.thin_description || 0); acc.missing_country += Number(value.missing_country || 0)
      return acc
    }, { inventory: 0, catalog: 0, matching: 0, seo: 0, thin_description: 0, missing_country: 0 })
    const observationGlobalRows = rowsForAliases(observationBySource, aliases)
    const observationSampleStatus = observationGlobalRows.length > 0 ? 'GLOBAL_SAMPLE' : pools.inventory > 0 ? 'UNAVAILABLE' : 'EMPTY_FULL_DB'
    const observations = latestRowsByKey(rowsForAliases(observationBySource, aliases), 'opportunity_id')
    const ttlMs = Number(profile.freshness_ttl_hours || 0) * 60 * 60 * 1000
    const fresh = observations.filter((item: any) => ttlMs > 0 && now - Date.parse(item.observed_at) <= ttlMs).length
    const stale = observations.length - fresh
    const policyLatest = latestRowsByKey(rowsForAliases(policyBySource, aliases), 'opportunity_id')
    // P0.3: runnerIds includes canonical_source + _scraper/_scrapper variants.
    const runnerIds = runnerIdsFor(profile)
    const runsForSource = [...runnerIds].flatMap(id => runsByRunner.get(id.toLowerCase()) || [])
      .sort((left, right) => Date.parse(String(right.started_at || '')) - Date.parse(String(left.started_at || '')))
    const latestRun = runsForSource[0] || null
    const latestTelemetry = rowsForAliases(telemetryBySource, aliases)[0] || null
    const control = [...runnerIds].flatMap(id => controlsByRunner.get(id.toLowerCase()) || [])[0]
    const extractionHealth = latestRun?.extraction_metrics?.health?.status
    const runFailed = latestRun?.status === "failed" || Boolean(latestRun?.error_summary) || extractionHealth === "DEGRADED"
    const operationalHealthBase = control && control.collection_enabled === false ? "PAUSED"
      : profile.auto_enabled && !profile.certified ? "BLOCKED"
      : runFailed ? "DEGRADED"
      : !latestRun || observations.length === 0 ? "UNKNOWN"
      : "HEALTHY"
    // P0.1: Use full-DB RPC result instead of client-side limited rows.
    const fingerprintPending = aliases.reduce((sum: number, alias: string) => {
      const value = qualityBySource.get(alias.toLowerCase()) as any
      return sum + Number(value?.fingerprint_pending || 0)
    }, 0)
    const latestObservation = observations[0] || null
    const latestPolicyEvent = policyLatest[0] || null
    const latestImpact = latestRun?.extraction_metrics?.reconciliation_impact || latestRun?.extraction_metrics?.impact || null
    const exceptionReasons = [
      ...(profile.blocking_requirements || []).map((reason: string) => `certification:${reason}`),
      ...(runFailed ? ["latest_run_degraded"] : []),
    ]
    const sourceSample = sourceOpportunitySamples.get(profile.canonical_source) || { rows: [], status: 'UNAVAILABLE' as const }
    const sourceRows = sourceSample.rows
    const diagnosticSampleStatus = sourceSample.status === 'EMPTY_FULL_DB' && pools.inventory > 0 ? 'UNAVAILABLE' : sourceSample.status
    const diagnosticSampleUnavailable = diagnosticSampleStatus === 'UNAVAILABLE'
    const enrichmentForSource = rowsForAliases(enrichmentBySource, aliases)
    const eightGates = diagnosticSampleUnavailable
      ? { gates: [], overall_health: 'UNKNOWN', reason_code: 'SOURCE_SAMPLE_UNAVAILABLE', scope: 'UNAVAILABLE' }
      : evaluateEightGates({ ...profile, ...capabilityFlags }, sourceRows, latestRun, observations, enrichmentForSource)
    const gateStatuses = eightGates.gates.map((gate: any) => gate.status)
    const gateEvidenceUnknown = gateStatuses.includes('NOT_EVALUATED')
    const gateDegraded = gateStatuses.includes('WARNING')
    const gateFailed = gateStatuses.includes('FAIL')
    const operationalHealth = ['PAUSED', 'BLOCKED', 'DEGRADED'].includes(operationalHealthBase) ? operationalHealthBase
      : gateFailed ? 'DEGRADED' : gateEvidenceUnknown ? 'UNKNOWN' : gateDegraded ? 'PARTIAL' : operationalHealthBase
    const sourceStatus = !profile.active || operationalHealth === "PAUSED" ? "DISABLED"
      : operationalHealth === "DEGRADED" || gateFailed ? "RED"
      : diagnosticSampleUnavailable || !profile.contract_covered || !profile.certified || operationalHealth === "UNKNOWN" || gateEvidenceUnknown || gateDegraded ? "YELLOW"
      : "GREEN"
    const history = runsForSource.slice(0, 12)
    const previousRun = history[1]
    const latestMetrics = latestRun?.extraction_metrics || {}
    const previousMetrics = previousRun?.extraction_metrics || {}
    const driftFields = ["found", "parsed"]
    const driftSignals = driftFields.filter((field) => Number(previousMetrics[field] || 0) > 0 && Number(latestMetrics[field] || 0) < Number(previousMetrics[field]) * 0.5)
    for (const field of ["description", "source_url"]) {
      const before = Number(previousMetrics?.coverage?.[field] || 0)
      const after = Number(latestMetrics?.coverage?.[field] || 0)
      if (before > 0 && after < before * 0.5) driftSignals.push(`${field}_coverage`)
    }
    return {
      ...profile, ...capabilityFlags, pools,
      source_permission_truth: sourcePermissionSnapshot(profile.canonical_source),
      field_survival: survivalBySource.get(profile.canonical_source) || {
        canonical_source: profile.canonical_source, classification: "UNKNOWN_SOURCE", fields: {}, persistence_transforms: {},
      },
      effective_inventory: {
        catalog_flagged: pools.catalog,
        matching_flagged: pools.matching,
        seo_flagged: pools.seo,
        catalog_effective: Boolean(srcCap?.is_enabled && srcCap?.catalog_enabled && sourcePermissionDimensionTruth(profile.canonical_source, 'catalog').state === 'ALLOWED') ? pools.catalog : 0,
        matching_effective: Boolean(srcCap?.is_enabled && srcCap?.matching_enabled && sourcePermissionDimensionTruth(profile.canonical_source, 'matching').state === 'ALLOWED') ? pools.matching : 0,
        seo_effective: Boolean(srcCap?.is_enabled && srcCap?.seo_enabled && sourcePermissionDimensionTruth(profile.canonical_source, 'seo_index').state === 'ALLOWED') ? pools.seo : 0,
      },
      operational_health: operationalHealth,
      source_status: sourceStatus,
      observation: {
        observed_opportunities: observationSampleStatus === 'UNAVAILABLE' ? null : observations.length,
        ...scopedMetric(observationSampleStatus === 'UNAVAILABLE' ? null : null, observations.length),
        observation_coverage_pct: observationSampleStatus === 'UNAVAILABLE' ? null : pools.inventory ? Math.round(observations.length / pools.inventory * 10000) / 100 : null,
        fresh: observationSampleStatus === 'UNAVAILABLE' ? null : fresh,
        stale: observationSampleStatus === 'UNAVAILABLE' ? null : stale,
        unknown: observationSampleStatus === 'UNAVAILABLE' ? null : Math.max(0, pools.inventory - observations.length),
        sample_status: observationSampleStatus,
        last_observed_at: latestObservation?.observed_at || null,
      },
      policy: {
        hard_dead_evidence: observations.filter((item: any) => ["REMOVED", "DEAD"].includes(item.identity_status) && [404, 410].includes(item.http_status)).length,
        suppressed_count: policyLatest.filter((item: any) => item.action === "SUPPRESS").length,
        restored_count: policyLatest.filter((item: any) => item.action === "RESTORE").length,
        latest_policy_event: latestPolicyEvent?.action || null,
        latest_policy_event_at: latestPolicyEvent?.created_at || null,
        restore_capability: "UNAVAILABLE_PENDING_MIGRATION",
      },
      quality: { thin_description: pools.thin_description, missing_country: pools.missing_country },
      // P0.1: fingerprint_pending now comes from full-DB RPC (not client-side sample).
      semantic: { fingerprint_pending: qualityAggRes.error ? null : fingerprintPending, embedding_pending: null },
      execution: { last_run: latestRun?.started_at || null, last_success: ["success", "healthy"].includes(String(latestRun?.status || "")) ? latestRun.finished_at || latestRun.started_at : null, last_failure: runFailed ? latestRun?.started_at || null : null, adapter_version: latestRun?.adapter_version || profile.adapter_version, circuit_breaker: latestRun?.extraction_metrics?.circuit_breaker || null, telemetry_status: latestTelemetry?.action === "maintenance_telemetry" && latestTelemetry?.result_status === "error" ? "FAILED" : null },
      history,
      drift: previousRun ? { status: driftSignals.length ? "POSSIBLE_SOURCE_DRIFT" : "NO_SIGNIFICANT_DRIFT", compared_run_id: previousRun.run_id, signals: driftSignals } : null,
      recent_rows: sourceRows.slice(0, 20),
      exceptions: exceptionReasons,
      latest_impact: latestImpact,
      maintenance_action: "DRY_RUN_ONLY", apply_enabled: false,
      // P0.6: Explicit scope markers so consumers know where each data section comes from.
      _inventory_scope: { pools: "full_db_rpc", inventory_sampled: sourceRows.length, recent_rows: "client_sample", eight_gates_quality: "client_sample", inventory: "FULL_DB", sample: "SAMPLED", diagnostic_sample: diagnosticSampleStatus, observation_sample: observationSampleStatus },
      eight_gates: eightGates,
    }
  })
  const exceptionGroups: Record<string, { count: number, sources: string[] }> = {}
  for (const source of sources) for (const reason of source.exceptions || []) {
    const group = exceptionGroups[reason] || { count: 0, sources: [] }
    group.count += 1; group.sources.push(source.canonical_source); exceptionGroups[reason] = group
  }
  return { registry: { profile_count: (registry.sources || []).length, emitted_aliases: registry.emitted_aliases, alias_collisions: registry.alias_collisions, ambiguous_patterns: registry.ambiguous_patterns, alias_pattern_conflicts: registry.alias_pattern_conflicts || [], registry_hash: registry.registry_hash, schema_version: registry.schema_version, unresolved_emitted_sources: unresolvedEmittedSources, exception_groups: exceptionGroups, dynamic_metrics_unavailable: { observations: observationsRes.error ? "unavailable" : null, policy: policyRes.error ? "unavailable" : null, runs: runsRes.error ? "unavailable" : null, fingerprints: fingerprintsRes.error ? "unavailable" : null, quality_agg: qualityAggRes.error ? "unavailable" : null, pipeline_ledger: pipelineLedgerRes.error ? "unavailable" : null } }, sources, opportunity_universe: universeRes.error ? null : universeRes.data, opportunity_pipeline_ledger: pipelineLedgerRes.error ? null : pipelineLedgerRes.data, opportunity_universe_error: universeRes.error ? "UNIVERSE_MIGRATION_NOT_APPLIED_OR_UNAVAILABLE" : null, _observability: { source_count: sources.length, query_duration_ms: queryDurationMs, assembly_duration_ms: Date.now() - assemblyStartedAt, sample_sizes: { observations: observationRows.length, policy_events: policyRows.length, runs: runRows.length, fingerprints: fingerprintRows.length, enrichment: enrichmentRows.length, telemetry_audit: telemetryAuditRows.length }, unavailable_metrics: { observations: observationsRes.error ? "unavailable" : null, policy: policyRes.error ? "unavailable" : null, runs: runsRes.error ? "unavailable" : null, fingerprints: fingerprintsRes.error ? "unavailable" : null, quality_agg: qualityAggRes.error ? "unavailable" : null, pipeline_ledger: pipelineLedgerRes.error ? "unavailable" : null } } }
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD env var not configured")

const OPERATIONS_TIME_ZONE = "America/Asuncion"

// These real users must never be marked as test data.
// IDs verified from production audit 2026-08-19.
const PROTECTED_REAL_USERS = new Set([
  "e49a4c2b-8a7e-4d60-845b-c383472012a3", // profile.id: Rosarito Godoy
  "d5892885-2337-4437-a98b-2f8e2878ddca", // auth.id: Rosarito Godoy
  "cff71c8d-8de9-487e-af01-57cbe53390f3", // profile.id: Marcelo Vázquez
  "49ae16ef-2680-4cb2-a709-1deab4a328f3", // auth.id: Marcelo Vázquez
])

export function zonedDayStart(value: Date, timeZone = OPERATIONS_TIME_ZONE): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  })
  const numericParts = (date: Date) => Object.fromEntries(
    formatter.formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]),
  ) as Record<string, number>
  const local = numericParts(value)
  const localMidnightAsUtc = Date.UTC(local.year, local.month - 1, local.day)
  let target = localMidnightAsUtc
  for (let iteration = 0; iteration < 2; iteration++) {
    const represented = numericParts(new Date(target))
    const representedAsUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute, represented.second)
    target = localMidnightAsUtc - (representedAsUtc - target)
  }
  return new Date(target)
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  const headers = event.headers || {}
  const headerPassword = headers['x-admin-password'] || headers['authorization']?.replace('Bearer ', '')
  let body: Record<string, any> = {}
  try { body = JSON.parse(event.body || '{}') } catch { /* empty ok */ }
  const { action, payload } = body
  // body.password is DEPRECATED — new callers must use x-admin-password header
  const password = headerPassword || body.password

  if (password !== ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }
  }

  const supabase = makeSupabaseAdmin()

  try {
    // ── READS ────────────────────────────────────────────────────────────────

    if (action === "list_users") {
      const { data, error } = await supabase
        .from("user_master_profiles")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ data }) }
    }

    if (action === "list_content") {
      const { data, error } = await supabase.from("content_hub").select("*").order("created_at", { ascending: false })
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ data: data || [] }) }
    }

    if (action === "list_skills") {
      const { data, error } = await supabase.from("skill_candidates").select("*").order("mention_count", { ascending: false })
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ data: data || [] }) }
    }

    if (action === "list_tokens") {
      const { data, error } = await supabase.from("recruiter_tokens").select("*").order("created_at", { ascending: false })
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ data: data || [] }) }
    }

    if (action === "metrics") {
      const [usersRes, oppsRes, subsRes, b2bRes, reviewRes, quarantinedRes, feedbackRes, recruiterReviewRes, growthRes] = await Promise.all([
        supabase.from("user_master_profiles").select("id", { count: "exact", head: true }).eq("is_test", false),
        supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("is_active", true).eq("verification_status", "verified").is("deleted_at", null),
        supabase.from("user_master_profiles").select("id", { count: "exact", head: true }).eq("is_subscribed", true).eq("is_test", false),
        supabase.from("recruiter_tokens").select("id", { count: "exact", head: true }).eq("is_active", true).eq("verification_status", "verified"),
        supabase.from("opportunities").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "in_review"]).is("deleted_at", null),
        supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("verification_status", "quarantined").is("deleted_at", null),
        supabase.from("product_feedback").select("id", { count: "exact", head: true }).in("status", ["new", "triaged", "in_progress"]),
        supabase.from("recruiter_tokens").select("id", { count: "exact", head: true }).in("verification_status", ["pending", "in_review"]),
        supabase.rpc("admin_daily_growth", { p_days: 14 }),
      ])
      const required = [usersRes, oppsRes, subsRes, b2bRes, reviewRes, quarantinedRes, feedbackRes, recruiterReviewRes, growthRes]
      const failed = required.find(result => result.error)
      if (failed?.error) throw failed.error
      const growth = (growthRes.data || []).map((row: any) => ({
        day: row.day,
        userSignups: Number(row.user_signups || 0),
        opportunitiesAdded: Number(row.opportunities_added || 0),
        opportunitiesVerified: Number(row.opportunities_verified || 0),
      }))
      const today = growth[growth.length - 1] || { userSignups: 0 }
      const yesterday = growth[growth.length - 2] || { userSignups: 0 }
      const lastSeven = growth.slice(-7)
      return {
        statusCode: 200,
        body: JSON.stringify({
          usuarios: usersRes.count || 0,
          oportunidades: oppsRes.count || 0,
          suscriptores: subsRes.count || 0,
          usuariosHoy: today.userSignups,
          usuariosAyer: yesterday.userSignups,
          usuariosEstaSemana: lastSeven.reduce((total: number, row: any) => total + row.userSignups, 0),
          empresasActivas: b2bRes.count || 0,
          queues: {
            opportunityReview: reviewRes.count || 0,
            quarantined: quarantinedRes.count || 0,
            feedbackOpen: feedbackRes.count || 0,
            recruiterReview: recruiterReviewRes.count || 0,
          },
          growth,
          generatedAt: new Date().toISOString(),
          timeZone: "America/Asuncion",
        }),
      }
    }

    if (action === "external_metrics") {
      const alertStatuses = ["pending", "processing", "sent", "failed", "suppressed"]
      const alertSince = new Date(Date.now() - 7 * 86400000).toISOString()
      const [google, ...alertResults] = await Promise.all([
        getGoogleReportingMetrics().catch((error: any) => ({ configured: true, analytics: null, searchConsole: null, errors: [error.message] })),
        ...alertStatuses.map(status => supabase.from("match_alert_deliveries").select("id", { count: "exact", head: true }).eq("status", status).gte("created_at", alertSince)),
      ])
      const alerts = Object.fromEntries(alertStatuses.map((status, index) => [status, alertResults[index].count || 0]))
      const alertErrors = alertResults.map(result => result.error?.message).filter(Boolean)
      return { statusCode: 200, body: JSON.stringify({ google, alerts: { configured: alertErrors.length === 0, counts: alerts, error: alertErrors.join(" · ") || null, period: "7d" } }) }
    }

    if (action === "list_b2b_prospects") {
      const { data, error } = await supabase
        .from("b2b_prospects")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ data: data || [] }) }
    }

    if (action === "list_product_feedback") {
      const status = String(payload?.status || "all")
      const audience = String(payload?.audience || "all")
      let query = supabase.from("product_feedback")
        .select("id,reference_code,audience,category,severity,status,feature,message,expected_result,page_path,user_id,recruiter_token_id,contact_email,context,admin_note,assigned_to,triaged_at,resolved_at,created_at,updated_at")
        .order("created_at", { ascending: false }).limit(200)
      if (status !== "all") query = query.eq("status", status)
      if (audience !== "all") query = query.eq("audience", audience)
      const { data, error } = await query
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ data: data || [] }) }
    }

    if (action === "list_beta") {
      const { data: bw } = await supabase.from("beta_waitlist").select("*").order("created_at", { ascending: false })
      const { data: rl } = await supabase.from("recruiter_leads").select("*").order("created_at", { ascending: false })
      return { statusCode: 200, body: JSON.stringify({ betaList: bw || [], leads: rl || [] }) }
    }

    if (action === "list_opportunity_reviews") {
      const status = String(payload?.status || "needs_review")
      const source = String(payload?.source || "all")
      const search = String(payload?.search || "").trim()
      const limit = Math.max(10, Math.min(100, Number(payload?.limit) || 50))
      const offset = Math.max(0, Number(payload?.offset) || 0)
      let query = supabase
        .from("opportunities")
        .select("id,slug,title,organization,location,country_code,city,department,type,opportunity_kind,opportunity_type,rubro,description,application_url,source,source_authority,original_source_url,original_source_verified,eligible_countries,eligible_regions,deadline,is_active,verification_status,verification_score,verification_reasons,verification_note,reviewed_at,reviewed_by,catalog_eligible,match_eligible,alerts_eligible,seo_eligible,policy_overrides,archived_at,deleted_at,deletion_reason,deletion_review_status,deletion_requested_at,created_at,updated_at,factory_status,content_fingerprint,semantic_fingerprint,embedding_model,embedding_updated_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)
      if (status === "needs_review") query = query.in("verification_status", ["pending", "in_review"])
      else if (status !== "all") query = query.eq("verification_status", status)
      if (source !== "all") query = query.eq("source", source)
      if (payload?.lifecycle === "deletion_pending") query = query.eq("deletion_review_status", "pending").is("deleted_at", null)
      else if (payload?.lifecycle === "archived") query = query.not("archived_at", "is", null).is("deleted_at", null)
      else if (payload?.lifecycle === "deleted") query = query.not("deleted_at", "is", null)
      else query = query.is("archived_at", null).is("deleted_at", null)
      if (search) query = query.or(`title.ilike.%${search.replace(/[%_,()]/g, "")}%,organization.ilike.%${search.replace(/[%_,()]/g, "")}%`)
      if (payload?.country_filter && payload.country_filter !== 'all') {
        if (payload.country_filter === 'WORLDWIDE') {
          query = query.or('remote_scope.eq.WORLDWIDE,remote_scope.eq.LATAM')
        } else {
          const cf = String(payload.country_filter).replace(/[^A-Z]/g, '')
          query = query.or(`country_code.eq.${cf},onsite_country.eq.${cf}`)
        }
      }
      const { data, error, count } = await query
      if (error) throw error
      const { data: sources } = await supabase.from("opportunity_sources").select("*").order("display_name")
      return { statusCode: 200, body: JSON.stringify({ data: data || [], count: count || 0, sources: sources || [] }) }
    }

    if (action === "list_control_center") {
      const [controlsRes, sourcesRes, dashboardRes] = await Promise.all([
        supabase.from("scraper_controls").select("*").order("scraper_name"),
        supabase.from("opportunity_sources").select("*").order("display_name"),
        supabase.rpc("admin_opportunity_pipeline_dashboard"),
      ])
      if (controlsRes.error) throw controlsRes.error
      if (sourcesRes.error) throw sourcesRes.error
      if (dashboardRes.error) throw dashboardRes.error
      const sourceStats: Record<string, any> = dashboardRes.data?.sources || {}
      // Eight Gates is requested independently so its registry/evidence path can
      // never turn an otherwise usable controls response into a 500.
      return { statusCode: 200, body: JSON.stringify({ controls: controlsRes.data || [], sources: sourcesRes.data || [], sourceStats }) }
    }

    if (action === "source_intelligence_snapshot") {
      // The static registry is generated only by scripts/export_source_intelligence_snapshot.py
      // from Python V2 core. This endpoint merely joins live DB metrics; it owns no source rules.
      const [dashboardRes, controlsRes] = await Promise.all([
        supabase.rpc("admin_opportunity_pipeline_dashboard"),
        supabase.from("scraper_controls").select("scraper_id,collection_enabled"),
      ])
      const { data, error } = dashboardRes
      if (error) throw error
      const snapshot = await sourceIntelligenceSnapshot(supabase, data, controlsRes.error ? [] : (controlsRes.data || []))
      const body = JSON.stringify(snapshot)
      snapshot._observability.response_bytes = Buffer.byteLength(body, "utf8")
      return { statusCode: 200, body: JSON.stringify(snapshot) }
    }

    if (action === "inspect_opportunity_universe") {
      const id = String(payload?.opportunity_id || "").trim()
      if (!id) return { statusCode: 400, body: JSON.stringify({ error: "opportunity_id requerido" }) }
      const [{ data, error }, pipelineResult] = await Promise.all([
        supabase.rpc("get_opportunity_universe_row", { p_opportunity_id: id }),
        supabase.from("opportunity_pipeline_status").select("*").eq("opportunity_id", id).maybeSingle(),
      ])
      if (error) throw error
      if (pipelineResult.error) throw pipelineResult.error
      return { statusCode: 200, body: JSON.stringify({ ...(data || { found: false }), pipeline: pipelineResult.data || null }) }
    }

    if (action === "trigger_source_scan") {
      const source = String(payload?.source || "").toLowerCase()
      const scraper = SOURCE_SCAN_SCRAPERS[source]
      if (!scraper) return { statusCode: 400, body: JSON.stringify({ error: "Esta fuente no admite escaneo manual" }) }
      const token = process.env.GITHUB_ACTIONS_TOKEN
      if (!token) return { statusCode: 503, body: JSON.stringify({ error: "Escaneo manual no configurado: falta GITHUB_ACTIONS_TOKEN en el servidor" }) }
      const requestId = randomUUID()
      const repository = process.env.GITHUB_REPOSITORY_SLUG || "Isasola/cvitae-unified"
      const ref = process.env.SOURCE_SCAN_WORKFLOW_REF || "feature/aws-migration"
      const dispatch = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/scrapers.yml/dispatches`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
        body: JSON.stringify({ ref, inputs: { scraper: source, scan_request_id: requestId } }),
      })
      if (!dispatch.ok) return { statusCode: 502, body: JSON.stringify({ error: `No se pudo encolar el escaneo (${dispatch.status})` }) }
      return { statusCode: 202, body: JSON.stringify({ status: "QUEUED", source, request_id: requestId }) }
    }

    if (action === "source_scan_status") {
      const source = String(payload?.source || "").toLowerCase()
      const scraper = SOURCE_SCAN_SCRAPERS[source]
      const requestId = String(payload?.request_id || "")
      if (!scraper || !requestId) return { statusCode: 400, body: JSON.stringify({ error: "Solicitud de escaneo inválida" }) }
      // P0.2: Query by scan_request_id column (trigger_type:"scan:uuid" is gone).
      const { data, error } = await supabase.from("scraper_runs").select("id,run_id,scraper_id,status,started_at,finished_at,duration_seconds,found_count,valid_count,inserted_count,updated_count,unchanged_count,duplicate_count,rejected_count,error_count,error_summary,extraction_metrics,github_run_url").eq("scan_request_id", requestId).order("started_at", { ascending: false }).limit(1)
      if (error) throw error
      const run = data?.[0]
      if (!run) return { statusCode: 200, body: JSON.stringify({ status: "QUEUED" }) }
      const status = !run.finished_at ? "RUNNING" : run.status === "failed" ? "FAILED" : String(run.error_summary || "").startsWith("[BLOCKED]") ? "BLOCKED" : "COMPLETED"
      return { statusCode: 200, body: JSON.stringify({ status, run, error: status === "FAILED" ? run.error_summary : null }) }
    }

    if (action === "opportunity_review_summary") {
      const { data, error } = await supabase.rpc("admin_opportunity_pipeline_dashboard")
      if (error) throw error
      const counts = data?.counts || {}
      return { statusCode: 200, body: JSON.stringify({
        summary: { pending: counts.pending || 0, in_review: counts.in_review || 0, verified: counts.verified || 0, rejected: counts.rejected || 0, quarantined: counts.quarantined || 0 },
        inventory: { total: counts.total || 0, published: counts.published || 0, archived: 0, deleted: 0, deletion_pending: 0, by_type: data?.types || {} },
        pipeline: data,
      }) }
    }

    if (action === "scraper_report") {
      const now = new Date()
      const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // Business-day boundaries follow the IANA timezone instead of a fixed UTC offset.
      const todayStart = zonedDayStart(now)
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)

      const [totalOppsRes, totalChRes, new24hRes, new7dRes, bySourceRes, todayRes, yesterdayRes, duplicatesRes, runsRes] = await Promise.all([
        supabase.from("opportunities").select("id", { count: "exact", head: true }),
        supabase.from("content_hub").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("opportunities").select("id", { count: "exact", head: true }).gte("created_at", since24h),
        supabase.from("opportunities").select("id", { count: "exact", head: true }).gte("created_at", since7d),
        // GROUP BY source server-side — no limit, no JS aggregation
        supabase.rpc("opportunities_by_source"),
        // new today (since midnight PY)
        supabase.from("opportunities").select("source, created_at").gte("created_at", todayStart.toISOString()),
        // new yesterday
        supabase.from("opportunities")
          .select("source, created_at")
          .gte("created_at", yesterdayStart.toISOString())
          .lt("created_at", todayStart.toISOString()),
        // duplicate count: same title + organization
        supabase.rpc("count_duplicate_opportunities"),
        // Private execution telemetry, newest first. Service-role only.
        supabase
          .from("scraper_runs")
          .select("id,run_id,scraper_id,scraper_name,script_path,trigger_type,status,exit_code,found_count,valid_count,unique_count,inserted_count,updated_count,unchanged_count,duplicate_count,rejected_count,warning_count,error_count,error_summary,github_run_url,started_at,finished_at,duration_seconds")
          .gte("started_at", since7d)
          .order("started_at", { ascending: false })
          .limit(1000),
      ])

      // build per-source today/yesterday maps
      const todayMap: Record<string, number> = {}
      for (const r of (todayRes.data || [])) {
        const s = r.source || "unknown"
        todayMap[s] = (todayMap[s] || 0) + 1
      }
      const yesterdayMap: Record<string, number> = {}
      for (const r of (yesterdayRes.data || [])) {
        const s = r.source || "unknown"
        yesterdayMap[s] = (yesterdayMap[s] || 0) + 1
      }

      const bySource = ((bySourceRes.data || []) as { source: string; total: number; last_seen: string }[])
        .map(row => ({
          source: row.source,
          count: row.total,
          lastSeen: row.last_seen,
          newToday: todayMap[row.source] || 0,
          newYesterday: yesterdayMap[row.source] || 0,
        }))
        .sort((a, b) => b.count - a.count)

      const historyByScraper = new Map<string, any[]>()
      for (const run of (runsRes.data || [])) {
        const history = historyByScraper.get(run.scraper_id) || []
        history.push(run)
        historyByScraper.set(run.scraper_id, history)
      }
      const scraperRuns = [...historyByScraper.values()].map(history => {
        const latest = history[0]
        const operationalStatus = ["failed", "timeout"].includes(latest.status)
          ? "failed"
          : String(latest.error_summary || "").startsWith("[SKIPPED]")
            ? "skipped"
            : String(latest.error_summary || "").startsWith("[BLOCKED]")
              ? "blocked"
              : latest.status === "warning"
                ? "partial_success"
                : latest.status === "healthy"
                  ? "success"
                  : latest.status
        const found = latest.found_count
        const inserted = latest.inserted_count
        const updated = latest.updated_count
        const duplicates = latest.duplicate_count
        const rejected = latest.rejected_count
        const productive = (typeof inserted === "number" && inserted > 0) || (typeof updated === "number" && updated > 0)
        const allDuplicates = typeof found === "number" && found > 0 && inserted === 0 && updated === 0
          && typeof duplicates === "number" && duplicates >= (latest.unique_count || found)
        const rejectedAll = typeof found === "number" && found > 0 && inserted === 0 && updated === 0
          && typeof rejected === "number" && rejected >= found
        const noResults = found === 0 && inserted === 0
        const noCounters = found == null && inserted == null
        const healthStatus = operationalStatus === "failed"
          ? "critical"
          : operationalStatus === "blocked" || rejectedAll
            ? "blocked"
            : operationalStatus === "partial_success" || latest.error_count > 0
              ? "warning"
              : operationalStatus === "skipped"
                ? "idle"
              : noResults || allDuplicates
                ? "idle"
                : noCounters
                  ? "unknown"
                  : "healthy"
        const consecutiveProblems = history.findIndex(run =>
          !["failed", "timeout", "warning"].includes(run.status) && !(run.error_count > 0)
        )
        const lastProductiveRun = history.find(run => (run.inserted_count || 0) > 0 || (run.updated_count || 0) > 0)
        const outcomeReason = healthStatus === "critical" ? (latest.error_summary || "La ejecución terminó con un error técnico")
          : healthStatus === "blocked" ? "Encontró registros, pero todos fueron rechazados"
            : healthStatus === "warning" ? (latest.error_summary || "Terminó con advertencias que requieren revisión")
              : noResults ? "Ejecutó correctamente y la fuente no publicó resultados"
                : allDuplicates ? "Ejecutó correctamente; todo lo encontrado ya existía"
                  : noCounters ? "Ejecutó, pero todavía no emite contadores estructurados"
                    : productive ? "Aportó oportunidades nuevas o actualizaciones"
                      : "Ejecución correcta, sin cambios en la base"
        return {
          ...latest,
          operational_status: operationalStatus,
          health_status: healthStatus,
          productive,
          outcome_reason: outcomeReason,
          insertion_rate: typeof found === "number" && found > 0 && typeof inserted === "number"
            ? Math.round((inserted / found) * 1000) / 10
            : null,
          consecutive_problems: consecutiveProblems === -1 ? history.length : consecutiveProblems,
          last_productive_at: lastProductiveRun?.finished_at || null,
        }
      })
      const severity: Record<string, number> = {
        critical: 0,
        blocked: 1,
        warning: 2,
        unknown: 3,
        idle: 4,
        healthy: 5,
      }
      scraperRuns.sort((a, b) => {
        const statusOrder = (severity[a.health_status] ?? 9) - (severity[b.health_status] ?? 9)
        if (statusOrder !== 0) return statusOrder
        return (b.error_count || 0) - (a.error_count || 0)
      })
      const runSummary = scraperRuns.reduce((acc, run) => {
        acc[run.health_status] = (acc[run.health_status] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      const runsToday = (runsRes.data || []).filter((run: any) => new Date(run.started_at) >= todayStart)
      const ingestionToday = runsToday.reduce((summary: Record<string, number>, run: any) => {
        summary.runs++
        summary.found += Number(run.found_count || 0)
        summary.inserted += Number(run.inserted_count || 0)
        summary.updated += Number(run.updated_count || 0)
        summary.duplicates += Number(run.duplicate_count || 0)
        summary.rejected += Number(run.rejected_count || 0)
        if (["failed", "timeout"].includes(run.status)) summary.failed++
        return summary
      }, { runs: 0, found: 0, inserted: 0, updated: 0, duplicates: 0, rejected: 0, failed: 0 })

      return {
        statusCode: 200,
        body: JSON.stringify({
          totalOpportunities: totalOppsRes.count || 0,
          totalContentHub: totalChRes.count || 0,
          newLast24h: new24hRes.count || 0,
          newLast7d: new7dRes.count || 0,
          newToday: Object.values(todayMap).reduce((total, value) => total + value, 0),
          newYesterday: Object.values(yesterdayMap).reduce((total, value) => total + value, 0),
          duplicates: (duplicatesRes.data as any)?.[0]?.duplicate_count || 0,
          bySource,
          scraperRuns,
          runSummary,
          ingestionToday,
          telemetryAvailable: !runsRes.error,
          generatedAt: now.toISOString(),
          timeZone: OPERATIONS_TIME_ZONE,
          telemetryError: runsRes.error ? "La telemetría todavía no está disponible" : null,
        }),
      }
    }

    if (action === "founding_beta_stats") {
      const [totalRes, grantedRes, pendingRes, enrollmentsRes] = await Promise.all([
        supabase.from("founding_beta_enrollments").select("id", { count: "exact", head: true }).eq("program", "founding_50"),
        // Granted = active + completed (actual cupo usado)
        supabase.from("founding_beta_enrollments").select("id", { count: "exact", head: true })
          .in("status", ["active", "completed"]).eq("program", "founding_50"),
        // Pending = accepted (solicitudes pendientes de aprobación)
        supabase.from("founding_beta_enrollments").select("id", { count: "exact", head: true })
          .eq("status", "accepted").eq("program", "founding_50"),
        supabase.from("founding_beta_enrollments")
          .select("id, user_id, email, status, offered_at, accepted_at, activated_at, benefit_end, dismissed_count, created_at")
          .eq("program", "founding_50")
          .order("created_at", { ascending: false })
          .limit(100),
      ])
      if (enrollmentsRes.error) throw enrollmentsRes.error
      const grantedCount = grantedRes.count || 0
      return {
        statusCode: 200,
        body: JSON.stringify({
          program: "founding_50",
          limit: 50,
          total_enrolled: totalRes.count || 0,
          total_active: grantedCount,
          pending_approval: pendingRes.count || 0,
          slots_remaining: Math.max(0, 50 - grantedCount),
          enrollments: enrollmentsRes.data || [],
        })
      }
    }

    if (action === "founding_approve") {
      if (!payload?.userId) return { statusCode: 400, body: JSON.stringify({ error: "userId requerido" }) }
      const userId = String(payload.userId)

      const { data: result, error: rpcError } = await supabase.rpc("admin_approve_founding_beta", { p_user_id: userId })
      if (rpcError) {
        console.error("[admin-data] founding_approve RPC error", rpcError.message)
        return { statusCode: 500, body: JSON.stringify({ error: rpcError.message }) }
      }
      const outcome = result as any
      if (outcome?.status === "full") {
        return { statusCode: 409, body: JSON.stringify({ error: `Cupo Founding Beta completo: ${outcome.active_count}/50`, program_full: true }) }
      }
      if (outcome?.status === "not_found") {
        return { statusCode: 404, body: JSON.stringify({ error: "No se encontró solicitud para este usuario" }) }
      }
      if (outcome?.status === "invalid_state") {
        return { statusCode: 409, body: JSON.stringify({ error: `No se puede aprobar en estado: ${outcome.current_status}` }) }
      }

      // Send founding_welcome_v1 — idempotent
      try {
        const { Resend } = await import("resend")
        const { sendFoundingEmail } = await import("./lib/founding-mailer")
        const resend = new Resend(process.env.RESEND_API_KEY)
        const welcomeResult = await sendFoundingEmail({ template: "founding_welcome_v1", userId, supabaseAdmin: supabase, resend })
        if (!welcomeResult.ok && !welcomeResult.already_sent) {
          console.error("[admin-data] founding welcome email failed", welcomeResult.error)
        }
      } catch (emailErr: any) {
        console.error("[admin-data] founding_approve email error", emailErr?.message)
      }

      // Notify founder if program just filled up
      if (outcome?.full_after_this) {
        try {
          const { Resend } = await import("resend")
          const { notifyFounderMilestone } = await import("./lib/founding-mailer")
          const resend = new Resend(process.env.RESEND_API_KEY)
          await notifyFounderMilestone({
            event: "founding_accepted",
            userId,
            userEmail: "contacto@cvitae.lat",
            timestamp: new Date().toISOString(),
            details: { note: "Founding Beta completado — 50/50 plazas otorgadas" },
            supabaseAdmin: supabase,
            resend,
          })
        } catch {}
      }

      return { statusCode: 200, body: JSON.stringify({ ok: true, active_count: outcome?.active_count, benefit_end: outcome?.benefit_end }) }
    }

    if (action === "founding_reject") {
      if (!payload?.userId) return { statusCode: 400, body: JSON.stringify({ error: "userId requerido" }) }
      const userId = String(payload.userId)

      const { data: result, error: rpcError } = await supabase.rpc("admin_reject_founding_beta", { p_user_id: userId })
      if (rpcError) {
        console.error("[admin-data] founding_reject RPC error", rpcError.message)
        return { statusCode: 500, body: JSON.stringify({ error: rpcError.message }) }
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "list_users_v2") {
      const limit = Math.min(Number(payload?.limit) || 50, 200)
      const offset = Number(payload?.offset) || 0
      const isTest = payload?.is_test === true ? true : payload?.is_test === false ? false : undefined
      const lifecycle = payload?.lifecycle ? String(payload.lifecycle) : undefined

      let query = supabase
        .from("user_master_profiles")
        .select("id, user_id, full_name, email, is_subscribed, is_test, lifecycle_state, ttfv_seconds, first_value_event, created_at, updated_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)

      if (typeof isTest === "boolean") query = query.eq("is_test", isTest)
      if (lifecycle) query = query.eq("lifecycle_state", lifecycle)

      const { data: profiles, error, count } = await query
      if (error) throw error

      // Enrich with founding beta status
      const userIds = (profiles || []).map((p: any) => p.user_id).filter(Boolean)
      const { data: enrollments } = userIds.length > 0
        ? await supabase.from("founding_beta_enrollments").select("user_id, status, accepted_at, benefit_end").in("user_id", userIds)
        : { data: [] }

      const enrollmentMap = new Map((enrollments || []).map((e: any) => [e.user_id, e]))

      const enriched = (profiles || []).map((p: any) => ({
        ...p,
        founding_beta: enrollmentMap.get(p.user_id) || null,
      }))

      return {
        statusCode: 200,
        body: JSON.stringify({ data: enriched, count: count || 0, offset, limit })
      }
    }

    if (action === "user_detail") {
      if (!payload?.profileId) return { statusCode: 400, body: JSON.stringify({ error: "profileId requerido" }) }
      const profileId = String(payload.profileId)

      const { data: profile, error: profileError } = await supabase
        .from("user_master_profiles")
        .select("*")
        .eq("id", profileId)
        .single()
      if (profileError || !profile) return { statusCode: 404, body: JSON.stringify({ error: "Perfil no encontrado" }) }

      const userId = (profile as any).user_id

      // Resolve canonical auth email (profile.email may be null — auth.users is authoritative)
      let authEmail: string | null = null
      if (!(profile as any).email) {
        const { data: authUser } = await supabase.auth.admin.getUserById(userId)
        authEmail = authUser?.user?.email || null
      }

      const [foundingRes, eventsRes, emailsRes, acquisitionRes, matchingSnapshotRes] = await Promise.all([
        supabase.from("founding_beta_enrollments")
          .select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_events")
          .select("id, event_type, occurred_at, event_data")
          .eq("user_id", userId)
          .order("occurred_at", { ascending: false })
          .limit(50),
        supabase.from("email_log")
          .select("id, template, status, sent_at, resend_id, metadata")
          .eq("user_id", userId)
          .order("sent_at", { ascending: false })
          .limit(20),
        supabase.from("b2c_acquisition")
          .select("source, medium, campaign, landing_page, referrer, created_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.from("matching_diagnostic_snapshots")
          .select("*")
          .eq("user_id", userId)
          .order("run_at", { ascending: false })
          .limit(1),
      ])

      // Derive profile health signals
      const p = profile as any
      const profileData = p.profile_data || {}
      const skills = Array.isArray(profileData.habilidades) ? profileData.habilidades : []
      const hasLocation = Boolean(profileData.location && String(profileData.location).trim().length > 1)
      const hasCv = Boolean(p.cv_storage_path)
      const hasEmbedding = Boolean(p.embedding)
      const hasCvText = Boolean(p.cv_text && String(p.cv_text).trim().length > 50)
      const completeness = [
        Boolean(p.full_name), Boolean(p.professional_title), Boolean(p.summary),
        skills.length > 0, hasLocation, hasCv || hasCvText,
      ].filter(Boolean).length

      const snapshot = matchingSnapshotRes.data?.[0] as any | undefined
      const snapshotError = matchingSnapshotRes.error
      const currentMatchingSignature = matchingProfileSignature(profile)
      const matchingStatus = snapshotError
        ? "ERROR"
        : !snapshot
          ? "NO_RUN"
          : snapshot.run_status === "ERROR"
            ? "ERROR"
            : (Date.now() - new Date(snapshot.run_at).getTime() > 24 * 60 * 60 * 1000 || !snapshot.profile_signature || snapshot.profile_signature !== currentMatchingSignature ? "STALE" : (snapshot.match_count > 0 ? "SUCCESS_WITH_RESULTS" : "SUCCESS_ZERO"))
      const matchCount = snapshot?.match_count ?? null
      const topMatchScore = null

      const warnings: string[] = []
      if (!hasLocation) warnings.push("Sin ubicación — afecta el filtro geográfico del matching")
      if (!hasEmbedding) warnings.push("Sin embedding — matching solo por keywords")
      if (matchingStatus === "ERROR") warnings.push("Error al leer el diagnóstico de matching — no equivale a cero matches")
      else if (matchingStatus === "NO_RUN") warnings.push("Todavía no hay una ejecución de matching para este perfil")
      else if (matchingStatus === "STALE") warnings.push("El diagnóstico de matching está desactualizado")
      else if (snapshot?.coverage_state === "ELIGIBILITY_UNKNOWN") warnings.push("Cero matches confirmados: hay oportunidades potenciales con elegibilidad por confirmar")
      else if (snapshot?.coverage_state === "LOW_RETRIEVAL_COVERAGE") warnings.push("Cobertura de recuperación acotada; no equivale a baja oferta total")
      else if (snapshot?.coverage_state === "PROFESSIONAL_FIT_GAP") warnings.push("No encontramos suficiente evidencia profesional compatible")
      if (!hasCv && !hasCvText) warnings.push("Sin CV cargado")

      return {
        statusCode: 200,
        body: JSON.stringify({
          profile,
          auth_email: authEmail,
          founding_beta: foundingRes.data || null,
          events: eventsRes.data || [],
          emails_sent: emailsRes.data || [],
          acquisition: acquisitionRes.data || null,
          profile_health: {
            skills_count: skills.length,
            has_location: hasLocation,
            has_cv: hasCv,
            cv_uploaded_at: p.cv_uploaded_at || null,
            has_cv_text: hasCvText,
            has_embedding: hasEmbedding,
            completeness_score: completeness,
            completeness_max: 6,
          },
          matching: {
            match_count: matchingStatus === "STALE" ? null : matchCount,
            top_score: topMatchScore,
            last_match_at: snapshot?.run_at || null,
            status: matchingStatus,
            snapshot_profile_signature: snapshot?.profile_signature ?? null,
            potential_scoreable_count: snapshot?.potential_scoreable_count ?? null,
            visible_potential_count: snapshot?.visible_potential_count ?? null,
            diagnostics: snapshot ? {
              primary_retrieval: snapshot.primary_retrieval_count,
              semantic_retrieval: snapshot.semantic_retrieval_count,
              unique_policy_candidates: snapshot.unique_policy_candidates_count,
              source_allowed: snapshot.source_allowed_count,
              professional_evidence_ready: snapshot.professional_evidence_ready_count,
              professional_fit_known: snapshot.professional_fit_known_count,
              eligibility_eligible: snapshot.eligibility_eligible_count,
              eligibility_unknown: snapshot.eligibility_unknown_count,
              eligibility_ineligible: snapshot.eligibility_ineligible_count,
              match: snapshot.match_count,
            potential: snapshot.visible_potential_count,
              abstain: snapshot.abstain_count,
              deny: snapshot.deny_count,
              visible_confirmed: snapshot.visible_confirmed_count,
              coverage_state: snapshot.coverage_state,
              top_reason_codes: snapshot.top_reason_codes,
              embedding_readiness: snapshot.embedding_readiness,
              run_at: snapshot.run_at,
            } : null,
          },
          warnings,
        })
      }
    }

    if (action === "enable_founding_offer") {
      if (!payload?.userId) return { statusCode: 400, body: JSON.stringify({ error: "userId requerido" }) }
      const { error } = await supabase.from("user_master_profiles")
        .update({ founding_offer_enabled: true })
        .eq("user_id", String(payload.userId))
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    // ── WRITES ───────────────────────────────────────────────────────────────

    if (action === "save_content") {
      if (!payload?.data) return { statusCode: 400, body: JSON.stringify({ error: "data requerido" }) }
      const query = payload.id
        ? supabase.from("content_hub").update(payload.data).eq("id", payload.id)
        : supabase.from("content_hub").insert([payload.data])
      const { error } = await query
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "set_content_active") {
      if (!payload?.id || typeof payload.value !== "boolean") return { statusCode: 400, body: JSON.stringify({ error: "Datos inválidos" }) }
      const { error } = await supabase.from("content_hub").update({ is_active: payload.value }).eq("id", payload.id)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "transition_content_approval") {
      const allowed = ["EDIT", "APPROVE", "REJECT", "PUBLISH"]
      if (!payload?.id || !allowed.includes(payload.transition)) return { statusCode: 400, body: JSON.stringify({ error: "Transición inválida" }) }
      const { data: current, error: currentError } = await supabase.from("content_hub").select("id,metadata,is_active").eq("id", payload.id).single()
      if (currentError || !current) throw currentError || new Error("content_not_found")
      const metadata = (current.metadata && typeof current.metadata === "object") ? current.metadata : {}
      const approval = (metadata as any).approval || { status: "PENDING_REVIEW", audit: [] }
      const next: Record<string, string> = { EDIT: "PENDING_REVIEW", APPROVE: "APPROVED", REJECT: "REJECTED", PUBLISH: "PUBLISHED" }
      const valid = (payload.transition === "EDIT" && approval.status === "PENDING_REVIEW") || (payload.transition === "APPROVE" && approval.status === "PENDING_REVIEW") || (payload.transition === "REJECT" && approval.status === "PENDING_REVIEW") || (payload.transition === "PUBLISH" && approval.status === "APPROVED")
      if (!valid) return { statusCode: 409, body: JSON.stringify({ error: "invalid_approval_transition" }) }
      const at = new Date().toISOString(); const actor = "admin"
      const nextApproval = { ...approval, status: next[payload.transition], audit: [...(Array.isArray(approval.audit) ? approval.audit : []), { action: payload.transition, at, actor }] }
      const editable = payload.transition === "EDIT" && payload.data && typeof payload.data === "object" ? payload.data : {}
      const { error } = await supabase.from("content_hub").update({ ...editable, metadata: { ...metadata, approval: nextApproval }, ...(payload.transition === "PUBLISH" ? { is_active: true } : {}) }).eq("id", payload.id)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true, approval: nextApproval }) }
    }

    if (action === "delete_content") {
      if (!payload?.id) return { statusCode: 400, body: JSON.stringify({ error: "id requerido" }) }
      // Content can already be indexed. Admin deletion is therefore a reversible
      // archive; physical deletion requires a separate audited maintenance path.
      const { error } = await supabase.from("content_hub").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", payload.id)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true, archived: true }) }
    }

    if (action === "set_skill_status") {
      if (!payload?.id || !["approved", "rejected"].includes(payload.status)) return { statusCode: 400, body: JSON.stringify({ error: "Datos inválidos" }) }
      const { error } = await supabase.from("skill_candidates").update({ status: payload.status }).eq("id", payload.id)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "review_opportunity") {
      const allowed = ["pending", "in_review", "verified", "rejected", "quarantined"]
      if (!payload?.id || !allowed.includes(payload.status)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Estado de revisión inválido" }) }
      }
      const { data: current, error: currentError } = await supabase
        .from("opportunities").select("id,verification_status,source_authority,original_source_verified").eq("id", payload.id).single()
      if (currentError || !current) throw currentError || new Error("Oportunidad no encontrada")
      const forceVerified = payload.original_source_verified === true
      if (payload.status === "verified" && current.source_authority !== "original" && !current.original_source_verified && !forceVerified) {
        return { statusCode: 409, body: JSON.stringify({ error: "Verificá la convocatoria en su fuente original antes de aprobar una fuente agregadora o de descubrimiento" }) }
      }
      const criteria = Array.isArray(payload.criteria) ? payload.criteria.map(String).slice(0, 20) : []
      const note = String(payload.note || "").trim().slice(0, 1000) || null
      const score = Number.isFinite(Number(payload.score)) ? Math.max(0, Math.min(100, Number(payload.score))) : null
      const features = payload.features && typeof payload.features === "object" ? payload.features : {}
      const verified = payload.status === "verified"
      const { data: reviewResult, error } = await supabase.rpc("admin_review_opportunity_atomic", {
        p_id: String(payload.id),
        p_status: String(payload.status),
        p_criteria: criteria,
        p_note: note,
        p_score: score,
        p_features: features,
        p_original_source_verified: forceVerified,
        p_expected_updated_at: payload.expected_updated_at || null,
        p_actor: "admin",
      })
      if (error) {
        if (String(error.message).includes("stale_opportunity")) return { statusCode: 409, body: JSON.stringify({ error: "La oportunidad cambió mientras la revisabas. Recargá antes de decidir." }) }
        if (String(error.message).includes("original_source_required")) return { statusCode: 409, body: JSON.stringify({ error: "Verificá la convocatoria en su fuente original antes de aprobarla" }) }
        throw error
      }
      // Fire SEO pipeline after approval — failures never block the approve response
      if (verified && process.env.SEO_PIPELINE_V2 === "true") {
        const dryRun = process.env.SEO_DRY_RUN !== "false"
        runSeoPipeline(supabase, payload.id, dryRun).catch(err =>
          console.error("[seo-pipeline] fire-and-forget error", payload.id, err?.message)
        )
      }
      return { statusCode: 200, body: JSON.stringify(reviewResult || { ok: true }) }
    }

    if (action === "update_opportunity") {
      if (!payload?.id || !payload.data || typeof payload.data !== "object") return { statusCode: 400, body: JSON.stringify({ error: "Datos inválidos" }) }
      const allowed = ["title", "organization", "location", "country_code", "department", "city", "type", "opportunity_kind", "opportunity_type", "rubro", "description", "application_url", "source_authority", "original_source_url", "original_source_verified"]
      const update = Object.fromEntries(Object.entries(payload.data).filter(([key]) => allowed.includes(key)).map(([key, value]) => [key, typeof value === "string" ? value.trim().slice(0, key === "description" ? 4000 : 2000) : value]))
      if (!update.title && "title" in update) return { statusCode: 400, body: JSON.stringify({ error: "El título no puede quedar vacío" }) }
      const { data: updateResult, error } = await supabase.rpc("admin_update_opportunity_atomic", {
        p_id: String(payload.id),
        p_changes: update,
        p_expected_updated_at: payload.expected_updated_at || null,
        p_actor: "admin",
      })
      if (error) {
        if (String(error.message).includes("stale_opportunity")) return { statusCode: 409, body: JSON.stringify({ error: "La oportunidad cambió. Recargá antes de guardar." }) }
        throw error
      }
      return { statusCode: 200, body: JSON.stringify(updateResult || { ok: true }) }
    }

    if (action === "execute_automation_transition") {
      // This is deliberately a one-row server-side bridge. React never sees
      // the service-role credential; the SQL RPC re-reads projection, health,
      // freshness, optimistic lock and idempotency under its transaction.
      const request = payload?.request
      const keys = ["p_opportunity_id", "p_expected_updated_at", "p_expected_registry_hash", "p_expected_semantic_version", "p_policy_version", "p_decision", "p_reason_codes", "p_allowed_actions", "p_idempotency_key", "p_execution_id", "p_runtime_run_id"]
      if (!request || typeof request !== "object" || Object.keys(request).length !== keys.length || !keys.every(key => key in request)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Solicitud de transición inválida" }) }
      }
      if (request.p_decision !== "AUTO_PROMOTE" || typeof request.p_opportunity_id !== "string" || !request.p_opportunity_id || !Array.isArray(request.p_reason_codes) || typeof request.p_allowed_actions !== "object" || !request.p_allowed_actions) {
        return { statusCode: 400, body: JSON.stringify({ error: "La transición requiere AUTO_PROMOTE de una sola oportunidad" }) }
      }
      const { data, error } = await supabase.rpc("apply_opportunity_automation_transition", request)
      if (error) return { statusCode: 409, body: JSON.stringify({ error: error.message || "Transición rechazada por gates runtime" }) }
      return { statusCode: 200, body: JSON.stringify(data) }
    }

    if (action === "set_opportunity_lifecycle") {
      if (!payload?.id || !["archive", "request_delete", "confirm_delete", "cancel_delete", "restore"].includes(payload.mode)) return { statusCode: 400, body: JSON.stringify({ error: "Acción inválida" }) }
      const now = new Date().toISOString()
      const { data: current, error: currentError } = await supabase.from("opportunities")
        .select("id,slug,opportunity_type,deletion_review_status").eq("id", payload.id).single()
      if (currentError || !current) throw currentError || new Error("Oportunidad no encontrada")
      if (payload.mode === "confirm_delete" && current.deletion_review_status !== "pending") {
        return { statusCode: 409, body: JSON.stringify({ error: "Primero debés solicitar y revisar la eliminación" }) }
      }
      const update = payload.mode === "archive"
        ? { archived_at: now, is_active: false, catalog_eligible: false, match_eligible: false, alerts_eligible: false, seo_eligible: false }
        : payload.mode === "request_delete"
          ? { deletion_review_status: "pending", deletion_requested_at: now, deletion_requested_by: "admin", deletion_reason: String(payload.reason || "Pendiente de revisión").slice(0, 500), verification_status: "in_review", is_active: false, catalog_eligible: false, match_eligible: false, alerts_eligible: false, seo_eligible: false }
          : payload.mode === "confirm_delete"
            ? { deleted_at: now, deletion_review_status: "approved", deletion_reviewed_at: now, deletion_reviewed_by: "admin", is_active: false, catalog_eligible: false, match_eligible: false, alerts_eligible: false, seo_eligible: false }
            : payload.mode === "cancel_delete"
              ? { deletion_review_status: "cancelled", deletion_reviewed_at: now, deletion_reviewed_by: "admin", deletion_reason: null, verification_status: "in_review" }
              : { archived_at: null, deleted_at: null, deletion_reason: null, deletion_review_status: null, deletion_requested_at: null, deletion_requested_by: null, deletion_reviewed_at: null, deletion_reviewed_by: null, verification_status: "in_review", is_active: false, catalog_eligible: false, match_eligible: false, alerts_eligible: false, seo_eligible: false }
      const { error } = await supabase.from("opportunities").update(update).eq("id", payload.id)
      if (error) throw error
      if ((payload.mode === "archive" || payload.mode === "confirm_delete") && (current as any).slug) {
        const oppType = (current as any).opportunity_type
        const urlPrefix = ["job", "internship", "consultancy"].includes(oppType) ? "empleos" : "oportunidades"
        enqueueIndexingEvent({
          url: `https://cvitae.lat/${urlPrefix}/${(current as any).slug}`,
          opportunityId: payload.id,
          eventType: "URL_DELETED",
          supabase,
        }).catch(err => console.error("[lifecycle] URL_DELETED enqueue error", err?.message))
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "update_scraper_control") {
      if (!payload?.scraper_id || !payload.data) return { statusCode: 400, body: JSON.stringify({ error: "Control inválido" }) }
      const allowed = ["collection_enabled", "max_items_per_run", "max_runtime_seconds", "consecutive_failures_before_pause", "auto_pause_on_failure", "require_review", "allowed_country_codes", "notes", "paused_reason"]
      const update: Record<string, any> = Object.fromEntries(Object.entries(payload.data).filter(([key]) => allowed.includes(key)))
      if ("max_items_per_run" in update) update.max_items_per_run = Math.max(1, Math.min(5000, Number(update.max_items_per_run)))
      if ("max_runtime_seconds" in update) update.max_runtime_seconds = Math.max(30, Math.min(3600, Number(update.max_runtime_seconds)))
      if ("consecutive_failures_before_pause" in update) update.consecutive_failures_before_pause = Math.max(1, Math.min(20, Number(update.consecutive_failures_before_pause)))
      const { data: result, error } = await supabase.rpc("admin_update_scraper_control_atomic", {
        p_scraper_id: String(payload.scraper_id),
        p_changes: update,
        p_expected_updated_at: payload.expected_updated_at || null,
        p_actor: "admin",
      })
      if (error) {
        if (String(error.message).includes("stale_scraper_control")) return { statusCode: 409, body: JSON.stringify({ error: "El control cambio. Recarga antes de guardar." }) }
        throw error
      }
      return { statusCode: 200, body: JSON.stringify(result || { ok: true }) }
    }

    if (action === "preview_source_policy") {
      if (!payload?.source || !payload.data || typeof payload.data !== "object") return { statusCode: 400, body: JSON.stringify({ error: "Fuente inválida" }) }
      const { data: current, error: sourceError } = await supabase.from("opportunity_sources").select("*").eq("source", payload.source).single()
      if (sourceError || !current) throw sourceError || new Error("Fuente no encontrada")
      const { count, error: countError } = await supabase.from("opportunities").select("id", { count: "exact", head: true })
        .eq("source", payload.source).eq("verification_status", "verified").eq("is_active", true).is("deleted_at", null)
      if (countError) throw countError
      return { statusCode: 200, body: JSON.stringify({ current, changes: payload.data, impacted_rows: count || 0 }) }
    }

    if (action === "update_source_policy") {
      if (!payload?.source || !payload.data) return { statusCode: 400, body: JSON.stringify({ error: "Fuente inválida" }) }
      const allowed = ["display_name", "source_tier", "trust_level", "auto_verify", "is_enabled", "catalog_enabled", "matching_enabled", "alerts_enabled", "seo_enabled", "allowed_country_codes", "allowed_opportunity_types", "max_items_per_day", "retention_days", "verification_criteria", "notes"]
      const update: Record<string, any> = Object.fromEntries(Object.entries(payload.data).filter(([key]) => allowed.includes(key)))
      const { data: result, error } = await supabase.rpc("admin_update_source_policy_atomic", {
        p_source: String(payload.source),
        p_changes: update,
        p_expected_updated_at: payload.expected_updated_at || null,
        p_actor: "admin",
      })
      if (error) {
        if (String(error.message).includes("stale_source_policy")) return { statusCode: 409, body: JSON.stringify({ error: "La política cambió. Recargá antes de guardar." }) }
        throw error
      }
      return { statusCode: 200, body: JSON.stringify(result || { ok: true }) }
    }

    if (action === "review_recruiter") {
      if (!payload?.id || !["verified", "rejected", "in_review", "pending"].includes(payload.status)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Estado de empresa inválido" }) }
      }
      const { data: result, error } = await supabase.rpc("admin_review_recruiter_atomic", {
        p_id: String(payload.id),
        p_status: String(payload.status),
        p_verification_data: payload.verification_data && typeof payload.verification_data === "object" ? payload.verification_data : null,
        p_note: String(payload.note || "").slice(0, 1000) || null,
        p_expected_updated_at: payload.expected_updated_at || null,
        p_actor: "admin",
      })
      if (error) {
        if (String(error.message).includes("stale_recruiter")) return { statusCode: 409, body: JSON.stringify({ error: "La empresa cambio. Recarga antes de decidir." }) }
        throw error
      }
      return { statusCode: 200, body: JSON.stringify(result || { ok: true }) }
    }

    if (action === "update_product_feedback") {
      if (!payload?.id || !["new", "triaged", "in_progress", "resolved", "closed"].includes(payload.status)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Estado de reporte inválido" }) }
      }
      const { error } = await supabase.rpc("update_product_feedback", {
        p_feedback_id: payload.id,
        p_status: payload.status,
        p_note: String(payload.note || "").slice(0, 3000),
        p_assigned_to: String(payload.assignedTo || "").slice(0, 120),
        p_actor: "admin",
      })
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "toggle_subscribed") {
      if (!payload?.userId) return { statusCode: 400, body: JSON.stringify({ error: "userId requerido" }) }
      const { userId, value } = payload
      const { error } = await supabase
        .from("user_master_profiles")
        .update({ is_subscribed: value })
        .eq("user_id", userId)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "toggle_test") {
      if (!payload?.userId) return { statusCode: 400, body: JSON.stringify({ error: "userId requerido" }) }
      const { userId, value } = payload
      const { error } = await supabase
        .from("user_master_profiles")
        .update({ is_test: value })
        .eq("user_id", userId)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "preview_mark_test") {
      if (!payload?.profileId) return { statusCode: 400, body: JSON.stringify({ error: "profileId requerido" }) }
      const profileId = String(payload.profileId)

      const { data: profile, error } = await supabase
        .from("user_master_profiles")
        .select("id, user_id, full_name, email, is_test")
        .eq("id", profileId)
        .single()
      if (error || !profile) return { statusCode: 404, body: JSON.stringify({ error: "Perfil no encontrado" }) }

      const protected_ = PROTECTED_REAL_USERS.has(profile.id) || PROTECTED_REAL_USERS.has(profile.user_id)
      const wouldSetTo = typeof payload.value === "boolean" ? payload.value : !profile.is_test

      return {
        statusCode: 200,
        body: JSON.stringify({
          preview: {
            profileId: profile.id,
            name: profile.full_name || profile.email || "(sin nombre)",
            currentIsTest: profile.is_test,
            wouldSetTo,
            protected: protected_,
            protectedReason: protected_ ? "Este usuario es un cliente real confirmado. No puede marcarse como test." : null,
          }
        })
      }
    }

    if (action === "execute_mark_test") {
      if (!payload?.profileId || typeof payload.value !== "boolean") {
        return { statusCode: 400, body: JSON.stringify({ error: "profileId y value (boolean) requeridos" }) }
      }
      const profileId = String(payload.profileId)

      // Re-fetch to get user_id for the guard check
      const { data: profile, error: fetchError } = await supabase
        .from("user_master_profiles")
        .select("id, user_id")
        .eq("id", profileId)
        .single()
      if (fetchError || !profile) return { statusCode: 404, body: JSON.stringify({ error: "Perfil no encontrado" }) }

      if (PROTECTED_REAL_USERS.has(profile.id) || PROTECTED_REAL_USERS.has(profile.user_id)) {
        return {
          statusCode: 403,
          body: JSON.stringify({ error: "Este usuario es un cliente real confirmado y está protegido. No puede marcarse como test." })
        }
      }

      const { error } = await supabase
        .from("user_master_profiles")
        .update({ is_test: payload.value })
        .eq("id", profileId)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "mark_beta_invited") {
      if (!payload?.id) return { statusCode: 400, body: JSON.stringify({ error: "id requerido" }) }
      const { id } = payload
      const { error } = await supabase
        .from("beta_waitlist")
        .update({ status: "invited", invited_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "send_admin_message") {
      const { userId, subject, message } = payload || {}
      if (!userId || !String(subject || "").trim() || !String(message || "").trim()) {
        return { statusCode: 400, body: JSON.stringify({ error: "userId, subject y message son requeridos" }) }
      }
      const { data: profile, error: profileError } = await supabase
        .from("user_master_profiles")
        .select("email, full_name")
        .eq("id", String(userId))
        .maybeSingle()
      if (profileError) throw profileError
      if (!profile?.email) {
        return { statusCode: 404, body: JSON.stringify({ error: "Usuario no encontrado o sin email" }) }
      }
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) {
        return { statusCode: 500, body: JSON.stringify({ error: "Servicio de email no configurado" }) }
      }
      const htmlBody = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")
      const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111"><p>${htmlBody}</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0"/><p style="font-size:12px;color:#888">Mensaje enviado por el equipo de CVitae · <a href="https://cvitae.lat">cvitae.lat</a></p></div>`
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "CVitae <contacto@cvitae.lat>", to: [profile.email], subject: String(subject).trim(), html }),
      })
      if (!sendRes.ok) {
        const errBody = await sendRes.text()
        return { statusCode: 502, body: JSON.stringify({ error: `Error al enviar email: ${errBody}` }) }
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true, to: profile.email }) }
    }

    if (action === "batch_review_by_source") {
      const allowed = ["rejected", "quarantined"]
      const batchVerify = payload?.status === "verified"
      if (!payload?.source || (!batchVerify && !allowed.includes(payload.status))) {
        return { statusCode: 400, body: JSON.stringify({ error: "source y status (verified | rejected | quarantined) requeridos" }) }
      }
      const source = String(payload.source)
      const status = String(payload.status) as "verified" | "rejected" | "quarantined"
      const note = String(payload.note || "").trim().slice(0, 1000) || null
      const features = payload.features && typeof payload.features === "object" ? payload.features : {}
      const fromStatuses: string[] = Array.isArray(payload.from_statuses) ? payload.from_statuses.map(String) : ["in_review", "pending"]
      const requestedIds = Array.isArray(payload.ids) ? [...new Set(payload.ids.map(String))] : []
      if (requestedIds.length > 500) return { statusCode: 400, body: JSON.stringify({ error: "El lote no puede superar 500 IDs" }) }
      const maxBatch = requestedIds.length || Math.min(Number(payload.limit) || 200, 500)

      let candidateQuery = supabase
        .from("opportunities")
        .select("id,updated_at,source_authority,original_source_verified,verification_status,catalog_eligible,match_eligible,alerts_eligible,seo_eligible")
        .eq("source", source)
        .in("verification_status", fromStatuses)
        .is("deleted_at", null)
      if (requestedIds.length) candidateQuery = candidateQuery.in("id", requestedIds)
      const { data: candidates, error: fetchError } = await candidateQuery
        .limit(maxBatch)
      if (fetchError) throw fetchError
      if (!candidates || candidates.length === 0) {
        return { statusCode: 200, body: JSON.stringify({ ok: true, processed: 0, skipped: 0, message: "No hay registros elegibles para ese filtro" }) }
      }

      // Distribution and provenance are independent: catalog access never implies trust.
      const { data: sourceConfig } = await supabase
        .from("opportunity_sources")
        .select("trust_level,is_enabled")
        .eq("source", source)
        .maybeSingle()
      const sourceTrusted = sourceConfig?.trust_level === "trusted" && sourceConfig?.is_enabled === true

      let toProcess = candidates
      let skipped = 0
      let validatedIds: string[] | null = null
      if (status === "verified") {
        const validation = validateBatchApprovalSnapshot(candidates as any, payload, sourceTrusted)
        if (!validation.ok) return { statusCode: validation.status, body: JSON.stringify({ error: validation.error, stale_ids: validation.staleIds }) }
        validatedIds = validation.ids
        const eligible = candidates.filter(c => c.source_authority === "original" || c.original_source_verified || sourceTrusted)
        skipped = candidates.length - eligible.length
        toProcess = eligible
        if (eligible.length === 0) {
          return { statusCode: 409, body: JSON.stringify({ error: "No hay registros en el estado correcto para esta fuente. Revisá los filtros o verificá si la fuente está habilitada en el control de fuentes.", skipped: candidates.length }) }
        }
      }

      // Mutation consumes the IDs returned by snapshot validation, never a live source filter.
      if (validatedIds) {
        toProcess = selectBatchMutationCandidates(candidates, validatedIds)
        skipped = 0
      } else if (requestedIds.length) {
        toProcess = selectBatchMutationCandidates(candidates, requestedIds)
      }

      const ids = toProcess.map(c => c.id)
      const mutationSnapshot = status === "verified"
        ? payload.review_snapshot
        : toProcess.map(candidate => ({ id: candidate.id, record_updated_at: candidate.updated_at }))
      const auditNote = [
        note || `Revisión en lote — fuente: ${source}`,
        payload.idempotency_key ? `snapshot:${String(payload.idempotency_key).slice(0, 120)}` : null,
      ].filter(Boolean).join(" | ").slice(0, 1000)
      const { data: batchResult, error: updateError } = await supabase.rpc("admin_batch_review_opportunities_atomic", {
        p_ids: ids,
        p_status: status,
        p_note: auditNote,
        p_features: features,
        p_review_snapshot: mutationSnapshot,
        p_actor: "admin_batch",
      })
      if (updateError) {
        if (String(updateError.message).includes("stale_batch")) return { statusCode: 409, body: JSON.stringify({ error: "El lote cambió mientras se procesaba. Generá un preview nuevo." }) }
        throw updateError
      }

      return { statusCode: 200, body: JSON.stringify({ ...(batchResult || { ok: true, processed: ids.length }), skipped }) }
    }

    if (action === "batch_review_preview") {
      if (!payload?.source) {
        return { statusCode: 400, body: JSON.stringify({ error: "source requerido" }) }
      }
      const previewSource = String(payload.source)
      const { data: previewCandidates, error: previewError } = await supabase
        .from("opportunities")
        .select("id,title,organization,source_authority,original_source_url,original_source_verified,verification_status,updated_at")
        .eq("source", previewSource)
        .in("verification_status", ["pending", "in_review"])
        .is("deleted_at", null)
        .limit(500)
      if (previewError) throw previewError

      // Source-level trust: trusted aggregators are eligible for batch approval
      const { data: previewSourceConfig } = await supabase
        .from("opportunity_sources")
        .select("trust_level,is_enabled")
        .eq("source", previewSource)
        .maybeSingle()
      const previewSourceTrusted = previewSourceConfig?.trust_level === "trusted" && previewSourceConfig?.is_enabled === true

      const eligible: any[] = []
      const ineligible: any[] = []
      for (const c of (previewCandidates || [])) {
        if (c.source_authority === "original" || c.original_source_verified || previewSourceTrusted) {
          eligible.push({ id: c.id, title: c.title, organization: c.organization, source_authority: c.source_authority, original_source_url: c.original_source_url, updated_at: c.updated_at })
        } else {
          ineligible.push({ id: c.id, title: c.title, reason: "aggregator_no_url" })
        }
      }
      return { statusCode: 200, body: JSON.stringify({ eligible, ineligible, source_trusted: previewSourceTrusted }) }
    }

    if (action === "auto_approve_classified") {
      if (!["preview", "confirm"].includes(payload?.mode)) {
        return { statusCode: 400, body: JSON.stringify({ error: "mode debe ser 'preview' o 'confirm'" }) }
      }
      const BATCH_LIMIT = 25
      const now = new Date().toISOString()

      if (payload.mode === "preview") {
        const { data: candidates, error: candError } = await supabase
          .from("opportunities")
          .select("id,slug,title,description,organization,location,city,type,opportunity_type,opportunity_kind,application_url,deadline,source,source_authority,original_source_verified,is_active,verification_status,deleted_at,archived_at,created_at")
          .in("verification_status", ["pending", "in_review"])
          .eq("is_active", false)
          .is("deleted_at", null)
          .is("archived_at", null)
          .limit(BATCH_LIMIT)
        if (candError) throw candError

        const evaluated = (candidates || []).map((c: any) => {
          const cls = classifyOpportunity({
            id: c.id, slug: c.slug, title: c.title, description: c.description,
            organization: c.organization, location: c.location, city: c.city,
            type: c.type, opportunity_type: c.opportunity_type, opportunity_kind: c.opportunity_kind,
            application_url: c.application_url, deadline: c.deadline, source: c.source,
            is_active: c.is_active, verification_status: c.verification_status,
            deleted_at: c.deleted_at, archived_at: c.archived_at, created_at: c.created_at,
          })
          // Authority gate: original source must be verified regardless of classifier trust
          const authoritySafe = c.source_authority === "original" || c.original_source_verified === true
          if (cls.publicationDecision === "AUTO_APPROVE" && !authoritySafe) {
            cls.reasons.push({ code: "AUTHORITY_UNVERIFIED", message: "Fuente no verificada en origen — requiere revisión manual", severity: "review" as const })
            return { id: c.id, title: c.title, source: c.source,
              publicationDecision: "REVIEW" as const, reasons: cls.reasons }
          }
          return { id: c.id, title: c.title, source: c.source,
            publicationDecision: cls.publicationDecision, reasons: cls.reasons }
        })

        const autoApproveIds = evaluated.filter(e => e.publicationDecision === "AUTO_APPROVE").map(e => e.id)
        return { statusCode: 200, body: JSON.stringify({
          evaluated: evaluated.length,
          autoApprove: autoApproveIds.length,
          review: evaluated.filter(e => e.publicationDecision === "REVIEW").length,
          blocked: evaluated.filter(e => e.publicationDecision === "BLOCK").length,
          batchLimit: BATCH_LIMIT,
          autoApproveIds,
          items: evaluated,
        }) }
      }

      // confirm — only processes IDs from the preview; re-fetches and re-classifies each
      // The legacy classifier remains useful as a read-only preview. Confirmation must
      // use bulk_verify_opportunities, which enforces an immutable snapshot, Review Bot
      // evidence, explicit feature flags and an idempotency key.
      return { statusCode: 409, body: JSON.stringify({
        error: "La confirmación automática fue retirada. Usá el preview seguro de aprobación masiva.",
        requiredAction: "bulk_verify_opportunities",
      }) }

      const rawIds = Array.isArray(payload.candidateIds) ? payload.candidateIds : []
      const candidateIds = rawIds
        .filter((id: any) => typeof id === "string" && id.trim())
        .slice(0, BATCH_LIMIT)
      if (!candidateIds.length) {
        return { statusCode: 400, body: JSON.stringify({ error: "candidateIds vacío o inválido" }) }
      }

      // Re-fetch current DB state — never trust caller-provided classification data
      const { data: freshRecords, error: fetchErr } = await supabase
        .from("opportunities")
        .select("id,slug,title,description,organization,location,city,type,opportunity_type,opportunity_kind,application_url,deadline,source,source_authority,original_source_verified,is_active,verification_status,deleted_at,archived_at,created_at")
        .in("id", candidateIds)
        .in("verification_status", ["pending", "in_review"])
        .eq("is_active", false)
        .is("deleted_at", null)
        .is("archived_at", null)
      if (fetchErr) throw fetchErr

      const confirmed: string[] = []
      const skipped: string[] = []
      for (const c of (freshRecords || [])) {
        // Authority gate: skip if source is unverified — regardless of classifier output
        const authoritySafe = c.source_authority === "original" || c.original_source_verified === true
        if (!authoritySafe) { skipped.push(c.id); continue }
        // Re-classify against current data — skip if no longer AUTO_APPROVE
        const reCheck = classifyOpportunity({
          id: c.id, slug: c.slug, title: c.title, description: c.description,
          organization: c.organization, location: c.location, city: c.city,
          type: c.type, opportunity_type: c.opportunity_type, opportunity_kind: c.opportunity_kind,
          application_url: c.application_url, deadline: c.deadline, source: c.source,
          is_active: c.is_active, verification_status: c.verification_status,
          deleted_at: c.deleted_at, archived_at: c.archived_at, created_at: c.created_at,
        })
        if (reCheck.publicationDecision !== "AUTO_APPROVE") { skipped.push(c.id); continue }
        const reviewUpdate: Record<string, any> = {
          verification_status: "verified", verification_score: null,
          verification_reasons: ["auto_classify"],
          verification_note: "Auto-aprobado por clasificador determinístico — fuente confiable, campos requeridos completos",
          reviewed_at: now, reviewed_by: "system",
          is_active: true, catalog_eligible: true, match_eligible: true,
          alerts_eligible: true, seo_eligible: true,
          policy_overrides: {},
        }
        const { error: updateErr } = await supabase.from("opportunities").update(reviewUpdate).eq("id", c.id)
        if (updateErr) { skipped.push(c.id); continue }
        await supabase.from("opportunity_review_events").insert({
          opportunity_id: c.id,
          previous_status: c.verification_status,
          new_status: "verified",
          criteria: ["auto_classify"],
          note: "Auto-aprobado por clasificador determinístico",
          actor: "system",
        })
        if (process.env.SEO_PIPELINE_V2 === "true") {
          const dryRun = process.env.SEO_DRY_RUN !== "false"
          runSeoPipeline(supabase, c.id, dryRun).catch(err =>
            console.error("[auto-approve] seo-pipeline error", c.id, err?.message)
          )
        }
        confirmed.push(c.id)
      }
      // IDs sent by client but not found/eligible in DB = also skipped
      const notFound = candidateIds.filter((id: string) => !freshRecords?.some((r: any) => r.id === id))
      return { statusCode: 200, body: JSON.stringify({
        confirmed: confirmed.length, skipped: skipped.length + notFound.length,
      }) }
    }

    if (action === "get_source_catalog") {
      // Lightweight catalog of all 105 canonical sources: profile metadata + live DB
      // capability flags. No Eight Gates computation — cheaper than source_intelligence_snapshot.
      const registry = sourceIntelligenceRegistry()
      const { data: capRows, error: capErr } = await supabase.rpc("get_source_distribution_policy")
      const caps: Record<string, any> = {}
      if (!capErr && capRows) {
        for (const row of capRows) caps[String(row.source || "").toLowerCase()] = row
      }
      const catalog = (registry.sources || []).map((profile: any) => {
        const aliases: string[] = (profile.emitted_aliases || [profile.canonical_source]).map((v: string) => v.toLowerCase())
        const cap = aliases.map((a: string) => caps[a]).find(Boolean) || null
        return {
          source: profile.canonical_source,
          display_name: profile.display_name || profile.canonical_source,
          source_family: profile.source_family,
          certified: Boolean(profile.certified),
          auto_enabled: Boolean(profile.auto_enabled),
          contract_covered: Boolean(profile.contract_covered),
          adapter_version: profile.adapter_version,
          search_engine_indexing_allowed: cap?.search_engine_indexing_allowed ?? null,
          seo_enabled: cap?.seo_enabled ?? null,
          catalog_enabled: cap?.catalog_enabled ?? null,
          matching_enabled: cap?.matching_enabled ?? null,
          web_catalog_allowed: cap?.web_catalog_allowed ?? (profile.distribution_policy?.web_catalog_allowed ?? null),
          source_permission_truth: sourcePermissionSnapshot(profile.canonical_source),
        }
      })
      return { statusCode: 200, body: JSON.stringify({ catalog, total: catalog.length, fetched_at: new Date().toISOString() }) }
    }

    if (action === "enable_seo_for_source") {
      // Server-side guarded SEO enablement. Refuses if preconditions are not met.
      // Never mass-enables: source must be named explicitly.
      const startedAt = new Date().toISOString()
      const targetSource = String(payload?.source || "").toLowerCase()
      if (!targetSource) return { statusCode: 400, body: JSON.stringify({ error: "source requerido" }) }
      const blockers: string[] = []

      // P1: source must exist in registry and be V2_CERTIFIED
      const registry = sourceIntelligenceRegistry()
      const profile = (registry.sources || []).find((s: any) => s.canonical_source === targetSource)
      if (!profile) blockers.push("SOURCE_NOT_IN_REGISTRY")
      else if (!profile.certified) blockers.push("SOURCE_NOT_CERTIFIED")

      // Canonical evidence, not distribution_policy booleans or legacy DB flags,
      // is authority for source permission.
      const { data: capRow } = await supabase.from("opportunity_sources").select("source,seo_enabled,search_engine_indexing_allowed,web_catalog_allowed,catalog_enabled").eq("source", targetSource).maybeSingle()
      const seoPermission = sourcePermissionDimensionTruth(targetSource, 'seo_index')
      const catalogPermission = sourcePermissionDimensionTruth(targetSource, 'catalog')
      if (seoPermission.state === 'DENIED') blockers.push("POLICY_DENIED_BY_SOURCE_CONTRACT")
      else if (seoPermission.state !== 'ALLOWED') blockers.push("SOURCE_PERMISSION_NOT_EVIDENCED")

      // P3: must not already be enabled
      if (capRow?.seo_enabled === true) blockers.push("ALREADY_ENABLED")

      // P4: web_catalog_allowed is a prerequisite for SEO (content must be catalog-worthy first)
      if (catalogPermission.state !== 'ALLOWED') blockers.push(catalogPermission.state === 'DENIED' ? "WEB_CATALOG_NOT_ALLOWED" : "CATALOG_PERMISSION_NOT_EVIDENCED")

      // P5: minimum inventory — at least 50 live rows for the source
      const { count: liveCount } = await supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("source", targetSource).is("deleted_at", null).is("archived_at", null)
      if ((liveCount ?? 0) < 50) blockers.push(`INSUFFICIENT_INVENTORY_${liveCount ?? 0}`)

      // P6: Eight Gates G1-G6 must not be in terminal FAIL (need snapshot)
      const { data: latestRun } = await supabase.from("scraper_runs").select("status,extraction_metrics,finished_at").eq("scraper_id", targetSource + "_scraper").order("started_at", { ascending: false }).limit(1).maybeSingle()
      if (latestRun?.status === "failed") blockers.push("LATEST_RUN_FAILED")

      const finishedAt = new Date().toISOString()
      if (blockers.length > 0) {
        const { data: blockedAuditRow } = await supabase.from("source_control_audit_log").insert({
          action: "enable_seo_for_source", source: targetSource,
          admin_note: String(payload?.admin_note || "").trim() || null,
          result_status: "blocked", blockers,
          before_state: { seo_enabled: capRow?.seo_enabled ?? null, source_seo_permission: seoPermission.state, source_catalog_permission: catalogPermission.state },
          after_state: null,
          result_detail: `Bloqueado: ${blockers.join(", ")}`,
        }).select("id").maybeSingle()
        const result: AdminActionResult = {
          status: "blocked", executed: false, changed: false, source: targetSource,
          action: "enable_seo_for_source", reason: `Bloqueado por ${blockers.length} precondición(es)`,
          rows_scanned: 1, rows_changed: 0, started_at: startedAt, finished_at: finishedAt,
          event_id: (blockedAuditRow as any)?.id || null, error: null, blockers,
        }
        return { statusCode: 200, body: JSON.stringify(result) }
      }

      const { error: updateErr } = await supabase.from("opportunity_sources").update({ seo_enabled: true }).eq("source", targetSource)
      if (updateErr) {
        const result: AdminActionResult = {
          status: "error", executed: true, changed: false, source: targetSource,
          action: "enable_seo_for_source", reason: updateErr.message,
          rows_scanned: 1, rows_changed: 0, started_at: startedAt, finished_at: new Date().toISOString(),
          event_id: null, error: updateErr.message, blockers: [],
        }
        return { statusCode: 500, body: JSON.stringify(result) }
      }

      const { data: auditRowSeo } = await supabase.from("source_control_audit_log").insert({
        action: "enable_seo_for_source", source: targetSource,
        admin_note: String(payload?.admin_note || "").trim() || null,
        result_status: "ok", blockers: [],
        before_state: { seo_enabled: false },
        after_state: { seo_enabled: true },
        result_detail: "Todas las precondiciones cumplidas — seo_enabled=true",
      }).select("id").maybeSingle()

      const result: AdminActionResult = {
        status: "ok", executed: true, changed: true, source: targetSource,
        action: "enable_seo_for_source", reason: "Todas las precondiciones cumplidas — seo_enabled=true",
        rows_scanned: 1, rows_changed: 1, started_at: startedAt, finished_at: new Date().toISOString(),
        event_id: (auditRowSeo as any)?.id || null, error: null, blockers: [],
      }
      return { statusCode: 200, body: JSON.stringify(result) }
    }

    if (action === "get_source_stats") {
      // Per-canonical-source inventory stats: aliases summed, no Eight Gates computation.
      const [dashRes, capRes] = await Promise.all([
        supabase.rpc("admin_opportunity_pipeline_dashboard"),
        supabase.rpc("get_source_distribution_policy"),
      ])
      const statsMap: Record<string, any> = dashRes.data?.sources || {}
      const caps: Record<string, any> = {}
      for (const row of (capRes.data || [])) caps[String(row.source || "").toLowerCase()] = row
      const registry = sourceIntelligenceRegistry()
      const result = (registry.sources || []).map((profile: any) => {
        const aliases: string[] = (profile.emitted_aliases || [profile.canonical_source]).map((v: string) => v.toLowerCase())
        const pools = aliases.reduce((acc: any, alias: string) => {
          const statKey = Object.keys(statsMap).find(k => k.toLowerCase() === alias)
          const v = statsMap[alias] || (statKey ? statsMap[statKey] : {}) || {}
          acc.inventory += Number(v.total || 0)
          acc.catalog += Number(v.catalog || 0)
          acc.matching += Number(v.matching || 0)
          acc.seo += Number(v.seo || 0)
          return acc
        }, { inventory: 0, catalog: 0, matching: 0, seo: 0 })
        const cap = aliases.map((a: string) => caps[a]).find(Boolean) || null
        return {
          source: profile.canonical_source,
          display_name: profile.display_name || profile.canonical_source,
          implementation_state: profile.implementation_state || "NOT_IMPLEMENTED",
          source_family: profile.source_family || null,
          certified: Boolean(profile.certified),
          auto_enabled: Boolean(profile.auto_enabled),
          alias_count: aliases.length,
          inventory: pools.inventory,
          catalog: pools.catalog,
          matching: pools.matching,
          seo: pools.seo,
          seo_enabled: cap?.seo_enabled ?? null,
          catalog_enabled: cap?.catalog_enabled ?? null,
          matching_enabled: cap?.matching_enabled ?? null,
          search_engine_indexing_allowed: cap?.search_engine_indexing_allowed ?? null,
          web_catalog_allowed: cap?.web_catalog_allowed ?? (profile.distribution_policy?.web_catalog_allowed ?? null),
          source_permission_truth: sourcePermissionSnapshot(profile.canonical_source),
        }
      })
      return { statusCode: 200, body: JSON.stringify({ stats: result, total: result.length, generated_at: new Date().toISOString() }) }
    }

    if (["preview_inventory_reconciliation", "apply_inventory_reconciliation", "resume_inventory_reconciliation"].includes(action)) {
      return { statusCode: 410, body: JSON.stringify({ error: "REPLACED_BY_CANONICAL_OPPORTUNITY_UNIVERSE_COMMAND", dry_run: "pnpm.cmd exec tsx scripts/reconcile_opportunity_universe.ts", apply: "requires explicit approved prod-apply.sql bundle" }) }
    }

    if (action === "preview_inventory_reconciliation") {
      // This is dry-run against every row in the selected scraper scope. The
      // job record is durable so an explicit, later APPLY can use its identity;
      // no opportunity row is written by this action.
      const targetSource = String(payload?.source || "").trim().toLowerCase()
      const aliases = reconciliationAliases(targetSource)
      if (targetSource && !aliases) return { statusCode: 404, body: JSON.stringify({ error: "Fuente canónica no registrada" }) }
      const policiesRes = await supabase.rpc("get_source_distribution_policy")
      if (policiesRes.error) throw policiesRes.error
      const summaries: any[] = []; const perSource: Record<string, any> = {}; const sample: any[] = []; const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        let query = supabase.from("opportunities").select(RECONCILIATION_FIELDS).not("source", "is", null).order("id", { ascending: true }).range(offset, offset + pageSize - 1)
        if (aliases) query = query.in("source", aliases)
        const { data, error } = await query
        if (error) throw error
        const pageDecisions = reconcileInventoryRows(data || [], policiesRes.data || [])
        summaries.push(reconciliationSummary(pageDecisions))
        // Accumulate counters only; no full source inventory remains in memory.
        accumulateReconciliationPerSource(perSource, pageDecisions)
        if (sample.length < 100) sample.push(...pageDecisions.slice(0, 100 - sample.length))
        if (!data?.length || data.length < pageSize) break
      }
      const summary = mergeReconciliationSummaries(summaries)
      const source_totals = perSource
      const accounted_total = Object.values(source_totals).reduce((total: number, item: any) => total + Number(item.total_examined || 0), 0)
      const explained_rows = summary.total_examined - Number(summary.unexplained || 0)
      const unexplained_rows = Number(summary.unexplained || 0)
      const knownCanonical = new Set((sourceIntelligenceRegistry().sources || []).map((item: any) => item.canonical_source))
      const unknown_sources = Object.keys(source_totals).filter(source => !knownCanonical.has(source))
      const reconciliation_id = randomUUID(); const generated_at = new Date().toISOString()
      const { error: jobError } = await supabase.from("inventory_reconciliation_jobs").insert({
        reconciliation_id, source_scope: targetSource || "all", mode: "DRY_RUN", status: "SUCCESS", cursor_offset: 0,
        // Execution counters deliberately remain empty for a preview.  APPLY
        // owns these fields and starts at zero, while the complete dry-run is
        // preserved under metadata.preview for approval and auditability.
        page_size: RECONCILIATION_PAGE_SIZE, started_at: generated_at, finished_at: generated_at, examined: 0,
        would_change: 0, changed: 0, unchanged: 0, failed: 0, reason_counts: {},
        actor: "admin", metadata: { preview: summary, per_source: perSource, source_totals, accounted_total, explained_rows, unexplained_rows, unknown_sources, sample },
      })
      if (jobError) throw jobError
      return { statusCode: 200, body: JSON.stringify({ mode: "DRY_RUN", reconciliation_id, source: targetSource || "all", cursor: 0, resumable: false, blocked: summary.total_examined - summary.catalog_allowed, ...summary, per_source: perSource, source_totals, accounted_total, explained_rows, unexplained_rows, unknown_sources, decisions: sample, generated_at }) }
    }

    if (action === "apply_inventory_reconciliation" || action === "resume_inventory_reconciliation") {
      const reconciliationId = String(payload?.reconciliation_id || "").trim()
      if (!reconciliationId) return { statusCode: 400, body: JSON.stringify({ error: "reconciliation_id requerido" }) }
      if (action === "apply_inventory_reconciliation" && payload?.confirm !== true) return { statusCode: 409, body: JSON.stringify({ error: "confirm=true requerido; el preview no aplica cambios automáticamente" }) }
      const { data: job, error: jobError } = await supabase.from("inventory_reconciliation_jobs").select("*").eq("reconciliation_id", reconciliationId).maybeSingle()
      if (jobError) throw jobError
      if (!job) return { statusCode: 404, body: JSON.stringify({ error: "Reconciliación no encontrada" }) }
      // A RUNNING job with a durable checkpoint is recoverable after a client
      // interruption. It is not labelled PARTIAL during ordinary chunks.
      if (action === "resume_inventory_reconciliation" && !["PARTIAL", "FAILED", "RUNNING"].includes(job.status)) return { statusCode: 409, body: JSON.stringify({ error: "Sólo se puede reanudar una reconciliación interrumpida" }) }
      if (action === "apply_inventory_reconciliation" && !["SUCCESS", "PARTIAL", "FAILED"].includes(job.status)) return { statusCode: 409, body: JSON.stringify({ error: "Estado de reconciliación no aplicable" }) }
      const aliases = reconciliationAliases(String(job.source_scope || "all"))
      if (job.source_scope !== "all" && !aliases) return { statusCode: 409, body: JSON.stringify({ error: "Fuente canónica de reconciliación no registrada" }) }
      const { data: policies, error: policyError } = await supabase.rpc("get_source_distribution_policy")
      if (policyError) throw policyError
      const startingApply = job.mode === "DRY_RUN"
      const cursor = startingApply ? 0 : Number(job.cursor_offset || 0)
      let query = supabase.from("opportunities").select(RECONCILIATION_FIELDS).not("source", "is", null).order("id", { ascending: true }).range(cursor, cursor + Number(job.page_size || RECONCILIATION_PAGE_SIZE) - 1)
      if (aliases) query = query.in("source", aliases)
      const { data: rows, error: rowsError } = await query
      if (rowsError) throw rowsError
      const decisions = reconcileInventoryRows(rows || [], policies || [])
      let changedThisChunk = 0; let failedThisChunk = 0
      for (const decision of decisions) {
        if (!decision.changed_fields.length) continue
        const { error } = await supabase.from("opportunities").update(reconciliationPatch(decision)).eq("id", decision.id)
        if (error) { failedThisChunk += 1; continue }
        changedThisChunk += 1
      }
      const chunkSummary = reconciliationSummary(decisions)
      const nextCursor = cursor + (rows || []).length
      const complete = (rows || []).length < Number(job.page_size || RECONCILIATION_PAGE_SIZE)
      const status = failedThisChunk ? "PARTIAL" : complete ? "SUCCESS" : "RUNNING"
      const now = new Date().toISOString()
      const priorReasons = startingApply ? {} : (job.reason_counts || {}); const chunkReasons = reconciliationReasonCounts(chunkSummary)
      const reason_counts = { ...priorReasons }
      for (const [reason, count] of Object.entries(chunkReasons)) reason_counts[reason] = Number(reason_counts[reason] || 0) + Number(count)
      const patch = {
        mode: "APPLY", status, cursor_offset: nextCursor, updated_at: now, finished_at: complete ? now : null,
        started_at: startingApply ? now : (job.started_at || now), examined: (startingApply ? 0 : Number(job.examined || 0)) + decisions.length,
        would_change: (startingApply ? 0 : Number(job.would_change || 0)) + chunkSummary.would_change,
        changed: (startingApply ? 0 : Number(job.changed || 0)) + changedThisChunk, unchanged: (startingApply ? 0 : Number(job.unchanged || 0)) + chunkSummary.unchanged,
        failed: (startingApply ? 0 : Number(job.failed || 0)) + failedThisChunk, reason_counts,
        last_error: failedThisChunk ? `No se actualizaron ${failedThisChunk} fila(s) del chunk` : null,
        metadata: { ...(job.metadata || {}), apply_started_at: startingApply ? now : job.metadata?.apply_started_at },
      }
      const { error: updateJobError } = await supabase.from("inventory_reconciliation_jobs").update(patch).eq("reconciliation_id", reconciliationId)
      if (updateJobError) throw updateJobError
      return { statusCode: 200, body: JSON.stringify({ reconciliation_id: reconciliationId, source: job.source_scope, mode: "APPLY", status, resumable: status === "PARTIAL" || status === "FAILED", cursor: nextCursor, chunk: { examined: decisions.length, changed: changedThisChunk, failed: failedThisChunk }, ...patch }) }
    }

    if (action === "retry_maintenance_telemetry") {
      const source = String(payload?.source || "").trim().toLowerCase()
      if (!source) return { statusCode: 400, body: JSON.stringify({ error: "source requerido" }) }
      const { data: failedEvent, error: eventError } = await supabase.from("source_control_audit_log")
        .select("id,before_state,created_at").eq("source", source).eq("action", "maintenance_telemetry").eq("result_status", "error")
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
      if (eventError) throw eventError
      if (!failedEvent?.before_state) return { statusCode: 404, body: JSON.stringify({ error: "No hay telemetría fallida reintentable para esta fuente" }) }
      const telemetry = failedEvent.before_state as Record<string, any>
      // This boundary only persists the preserved telemetry payload. It does
      // not invoke a scraper, maintenance process, embedding, or mutation.
      const { data: existingTelemetry, error: existingError } = await supabase.from("scraper_runs").select("id").eq("run_id", telemetry.run_id).limit(1)
      if (existingError) throw existingError
      if (existingTelemetry?.length) return { statusCode: 200, body: JSON.stringify({ status: "SUCCESS", source, telemetry_run_id: telemetry.run_id, retry_of: failedEvent.id, maintenance_rerun: false, already_persisted: true }) }
      const { error: insertError } = await supabase.from("scraper_runs").insert(telemetry)
      if (insertError) throw insertError
      const { error: auditError } = await supabase.from("source_control_audit_log").insert({
        action: "maintenance_telemetry_retry", source, actor: "admin", result_status: "ok", blockers: [],
        before_state: { retry_of: failedEvent.id }, after_state: { telemetry_run_id: telemetry.run_id }, result_detail: "Telemetry persisted without re-running maintenance",
      })
      if (auditError) throw auditError
      return { statusCode: 200, body: JSON.stringify({ status: "SUCCESS", source, telemetry_run_id: telemetry.run_id, retry_of: failedEvent.id, maintenance_rerun: false }) }
    }

    if (action === "approve_search_indexing_policy") {
      // Approve (NULL→TRUE) the search engine indexing policy for a source.
      // FALSE is immutable by this action — contractual prohibition cannot be removed here.
      // Requires explicit admin_note for the audit record.
      const startedAt = new Date().toISOString()
      const targetSource = String(payload?.source || "").toLowerCase()
      const adminNote = String(payload?.admin_note || "").trim()
      if (!targetSource) return { statusCode: 400, body: JSON.stringify({ error: "source requerido" }) }
      if (!adminNote) return { statusCode: 400, body: JSON.stringify({ error: "admin_note requerido para la aprobación de política" }) }

      const registry = sourceIntelligenceRegistry()
      const profile = (registry.sources || []).find((s: any) => s.canonical_source === targetSource)
      if (!profile) {
        return { statusCode: 404, body: JSON.stringify({ error: "Fuente no encontrada en el registro" }) }
      }

      const seoPermission = sourcePermissionDimensionTruth(targetSource, 'seo_index')
      if (seoPermission.state !== 'ALLOWED') {
        const blocker = seoPermission.state === 'DENIED' ? 'POLICY_DENIED_IMMUTABLE' : 'SOURCE_PERMISSION_NOT_EVIDENCED'
        const result: AdminActionResult = {
          status: 'blocked', executed: false, changed: false, source: targetSource,
          action: 'approve_search_indexing_policy', reason: seoPermission.reason,
          rows_scanned: 1, rows_changed: 0, started_at: startedAt, finished_at: new Date().toISOString(),
          event_id: null, error: null, blockers: [blocker],
        }
        return { statusCode: 200, body: JSON.stringify(result) }
      }

      const { data: capRow } = await supabase.from("opportunity_sources")
        .select("source,search_engine_indexing_allowed,seo_enabled")
        .eq("source", targetSource).maybeSingle()

      const beforeState = { search_engine_indexing_allowed: capRow?.search_engine_indexing_allowed ?? null }

      if (seoPermission.state === 'ALLOWED' && capRow?.search_engine_indexing_allowed === true) {
        const result: AdminActionResult = {
          status: "no_change", executed: false, changed: false, source: targetSource,
          action: "approve_search_indexing_policy", reason: "La política ya está aprobada (TRUE)",
          rows_scanned: 1, rows_changed: 0, started_at: startedAt, finished_at: new Date().toISOString(),
          event_id: null, error: null, blockers: [],
        }
        return { statusCode: 200, body: JSON.stringify(result) }
      }

      const { error: updateErr } = await supabase.from("opportunity_sources")
        .update({ search_engine_indexing_allowed: true }).eq("source", targetSource)
      if (updateErr) {
        return { statusCode: 500, body: JSON.stringify({ error: updateErr.message }) }
      }

      const { data: auditRow } = await supabase.from("source_control_audit_log").insert({
        action: "approve_search_indexing_policy", source: targetSource, admin_note: adminNote,
        result_status: "ok", blockers: [],
        before_state: beforeState,
        after_state: { search_engine_indexing_allowed: true },
        result_detail: "Política SEO aprobada explícitamente — NULL→TRUE",
      }).select("id").maybeSingle()

      const result: AdminActionResult = {
        status: "ok", executed: true, changed: true, source: targetSource,
        action: "approve_search_indexing_policy",
        reason: "search_engine_indexing_allowed actualizado a TRUE",
        rows_scanned: 1, rows_changed: 1, started_at: startedAt, finished_at: new Date().toISOString(),
        event_id: (auditRow as any)?.id || null, error: null, blockers: [],
      }
      return { statusCode: 200, body: JSON.stringify(result) }
    }

    if (action === "diagnose_source") {
      // Read-only diagnostic for a single source: runs Eight Gates evaluation on live DB state.
      // Does not mutate anything.
      const targetSource = String(payload?.source || "").toLowerCase()
      if (!targetSource) return { statusCode: 400, body: JSON.stringify({ error: "source requerido" }) }

      const registry = sourceIntelligenceRegistry()
      const profile = (registry.sources || []).find((s: any) => s.canonical_source === targetSource)
      if (!profile) {
        return { statusCode: 404, body: JSON.stringify({ error: "Fuente no encontrada en el registro" }) }
      }

      const aliases: string[] = (profile.emitted_aliases || [profile.canonical_source]).map((v: string) => v.toLowerCase())
      const aliasSet = new Set<string>(aliases)

      // P0.3: Use shared runnerIdsFor to include _scraper/_scrapper variants.
      const diagRunnerIds = [...runnerIdsFor(profile)]
      const [runsRes, sourceRowsRes, observationsRes, enrichmentRes, capRes] = await Promise.all([
        supabase.from("scraper_runs").select("id,run_id,scraper_id,status,started_at,finished_at,error_count,found_count,valid_count,inserted_count,updated_count,unchanged_count,duplicate_count,rejected_count,error_summary,adapter_version,extraction_metrics")
          .in("scraper_id", diagRunnerIds)
          .order("started_at", { ascending: false }).limit(5),
        supabase.from("opportunities").select("id,source,semantic_fingerprint,match_eligible,description,organization,location,country_code,application_url,source_url,remote_scope", { count: "exact" })
          .in("source", aliases).is("deleted_at", null).is("archived_at", null).limit(2000),
        supabase.from("opportunity_source_observations").select("opportunity_id,source,identity_status,http_status,observed_at", { count: "exact" })
          .in("source", aliases).order("observed_at", { ascending: false }).limit(2000),
        supabase.from("opportunity_enrichment_events").select("opportunity_id,source,changed_fields,created_at")
          .in("source", aliases).order("created_at", { ascending: false }).limit(1000),
        supabase.from("opportunity_sources").select("source,catalog_enabled,matching_enabled,alerts_enabled,seo_enabled,search_engine_indexing_allowed")
          .in("source", aliases).limit(10),
      ])

      const latestRun = runsRes.data?.[0] || null
      const sourceRows = sourceRowsRes.data || []
      const observations = observationsRes.data || []
      const enrichmentRows = enrichmentRes.data || []

      const capRow = (capRes.data || []).find((r: any) => aliasSet.has(String(r.source || "").toLowerCase()))
      const capabilityFlags = capRow ? {
        catalog_enabled: capRow.catalog_enabled ?? null,
        matching_enabled: capRow.matching_enabled ?? null,
        alerts_enabled: capRow.alerts_enabled ?? null,
        seo_enabled: capRow.seo_enabled ?? null,
        search_engine_indexing_allowed: capRow.search_engine_indexing_allowed ?? null,
      } : {}

      const eightGates = evaluateEightGates({ ...profile, ...capabilityFlags }, sourceRows, latestRun, observations, enrichmentRows)

      const healthSummary = summarizeSourceHealth(eightGates.gates)

      const runSummary = latestRun ? {
        run_id: latestRun.run_id,
        status: latestRun.status,
        started_at: latestRun.started_at,
        finished_at: latestRun.finished_at,
        discovered: latestRun.found_count ?? null,
        normalized: latestRun.valid_count ?? null,
        persisted: (latestRun.inserted_count ?? 0) + (latestRun.updated_count ?? 0),
        inserted: latestRun.inserted_count ?? null,
        updated: latestRun.updated_count ?? null,
      } : null

      const totalActive = typeof sourceRowsRes.count === "number" ? sourceRowsRes.count : null
      const inventorySampled = sourceRows.length
      const runPersisted = runSummary ? runSummary.persisted : null
      const runCoveragePct = (runPersisted !== null && typeof totalActive === "number" && totalActive > 0)
        ? Math.round((runPersisted / totalActive) * 10000) / 100
        : null
      const reconciliation = {
        run_coverage_pct: runCoveragePct,
        full_inventory_total_active: totalActive,
        inventory_sampled: inventorySampled,
        inventory_scope: typeof totalActive === "number" ? "FULL_DB" : "UNAVAILABLE",
        run_persisted: runPersisted,
        note: inventorySampled >= 2000 ? "inventory_sample_capped_2000" : null,
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          source: targetSource,
          display_name: profile.display_name || targetSource,
        overall_health: healthSummary.overall_health,
        first_non_confirmed_required_stage: healthSummary.first_non_confirmed_required_stage < 0 ? null : { gate: healthSummary.first_non_confirmed_required_stage + 1, status: eightGates.gates[healthSummary.first_non_confirmed_required_stage].status, reason: eightGates.gates[healthSummary.first_non_confirmed_required_stage].reason_code },
          failing_gates: healthSummary.failing_gates,
          warning_gates: healthSummary.warning_gates,
          not_evaluated_gates: healthSummary.not_evaluated_gates,
          eight_gates: eightGates,
          run_summary: runSummary,
          reconciliation,
          latest_run: latestRun ? { run_id: latestRun.run_id, status: latestRun.status, started_at: latestRun.started_at } : null,
          inventory: totalActive,
          inventory_sampled: inventorySampled,
          observations: observations.length,
          observations_total: typeof observationsRes.count === "number" ? observationsRes.count : null,
          observations_sampled: observations.length,
          _scope: { inventory: typeof totalActive === "number" ? "FULL_DB" : "UNAVAILABLE", inventory_sample: "SAMPLED", observations: typeof observationsRes.count === "number" ? "FULL_DB" : "UNAVAILABLE", observations_sample: "SAMPLED", eight_gates: "SAMPLED" },
          diagnosed_at: new Date().toISOString(),
        }),
      }
    }

    if (action === "update_source_tier") {
      const source = String(payload?.source || "")
      const tier = String(payload?.tier || "A")
      if (!source) throw new Error("source required")
      if (!["SS", "S", "A", "B"].includes(tier)) throw new Error("tier inválido")
      const { data: result, error } = await supabase.rpc("admin_update_source_policy_atomic", {
        p_source: source,
        p_changes: { source_tier: tier },
        p_expected_updated_at: payload.expected_updated_at || null,
        p_actor: "admin",
      })
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify(result || { ok: true }) }
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Acción desconocida" }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
