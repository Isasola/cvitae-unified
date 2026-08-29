import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"
import { getGoogleReportingMetrics } from "./lib/google-reporting"
import { runSeoPipeline } from "./lib/seo-pipeline-runner"
import { classifyOpportunity } from "../../src/lib/seo/classify"
import { enqueueIndexingEvent } from "./lib/indexing-queue"
import { selectBatchMutationCandidates, validateBatchApprovalSnapshot } from "./lib/batch-review-snapshot"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { reconcileSources } from "./lib/source-reconciliation"

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

  const headerPassword = event.headers['x-admin-password'] || event.headers['authorization']?.replace('Bearer ', '')
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
      const status = String(payload?.status || "pending")
      const source = String(payload?.source || "all")
      const search = String(payload?.search || "").trim()
      let query = supabase
        .from("opportunities")
        .select("id,slug,title,organization,location,country_code,city,department,type,opportunity_kind,opportunity_type,rubro,description,application_url,source,source_authority,original_source_url,original_source_verified,eligible_countries,eligible_regions,deadline,is_active,verification_status,verification_score,verification_reasons,verification_note,reviewed_at,reviewed_by,catalog_eligible,match_eligible,alerts_eligible,seo_eligible,policy_overrides,archived_at,deleted_at,deletion_reason,deletion_review_status,deletion_requested_at,created_at,updated_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(100)
      if (status !== "all") query = query.eq("verification_status", status)
      if (source !== "all") query = query.eq("source", source)
      if (payload?.lifecycle === "deletion_pending") query = query.eq("deletion_review_status", "pending").is("deleted_at", null)
      else if (payload?.lifecycle === "archived") query = query.not("archived_at", "is", null).is("deleted_at", null)
      else if (payload?.lifecycle === "deleted") query = query.not("deleted_at", "is", null)
      else query = query.is("archived_at", null).is("deleted_at", null)
      if (search) query = query.or(`title.ilike.%${search.replace(/[%_,()]/g, "")}%,organization.ilike.%${search.replace(/[%_,()]/g, "")}%`)
      const { data, error, count } = await query
      if (error) throw error
      const { data: sources } = await supabase.from("opportunity_sources").select("*").order("display_name")
      return { statusCode: 200, body: JSON.stringify({ data: data || [], count: count || 0, sources: sources || [] }) }
    }

    if (action === "list_control_center") {
      const [controlsRes, sourcesRes, opportunitiesRes] = await Promise.all([
        supabase.from("scraper_controls").select("*").order("scraper_name"),
        supabase.from("opportunity_sources").select("*").order("display_name"),
        supabase.from("opportunities").select("source,verification_status,catalog_eligible,match_eligible,alerts_eligible,seo_eligible,deleted_at").limit(5000),
      ])
      if (controlsRes.error) throw controlsRes.error
      if (sourcesRes.error) throw sourcesRes.error
      const sourceStats: Record<string, any> = {}
      for (const row of opportunitiesRes.data || []) {
        const key = row.source || "unknown"
        const stats = sourceStats[key] ||= { total: 0, pending: 0, verified: 0, quarantined: 0, deleted: 0 }
        stats.total++
        if (row.deleted_at) stats.deleted++
        else if (row.verification_status in stats) stats[row.verification_status]++
      }
      let reconciliation: any[] = []
      try {
        const registry = JSON.parse(readFileSync(resolve(process.cwd(), "scrapers/source_registry.json"), "utf8"))
        const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/scrapers.yml"), "utf8")
        reconciliation = reconcileSources(registry.sources || [], workflow, controlsRes.data || [], sourcesRes.data || [])
      } catch (error: any) {
        console.error("[source-reconciliation]", error?.message || error)
      }
      return { statusCode: 200, body: JSON.stringify({ controls: controlsRes.data || [], sources: sourcesRes.data || [], sourceStats, reconciliation }) }
    }

    if (action === "opportunity_review_summary") {
      const statuses = ["pending", "in_review", "verified", "rejected", "quarantined"]
      const [results, rowsRes] = await Promise.all([
        Promise.all(statuses.map(status => supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("verification_status", status))),
        supabase.from("opportunities").select("opportunity_kind,is_active,catalog_eligible,archived_at,deleted_at,deletion_review_status").limit(5000),
      ])
      if (rowsRes.error) throw rowsRes.error
      const byType: Record<string, number> = {}
      let published = 0, archived = 0, deleted = 0, deletionPending = 0
      for (const row of rowsRes.data || []) {
        const type = String(row.opportunity_kind || "sin_tipo").trim().toLowerCase()
        byType[type] = (byType[type] || 0) + 1
        if (row.is_active && row.catalog_eligible && !row.archived_at && !row.deleted_at) published++
        if (row.archived_at) archived++
        if (row.deleted_at) deleted++
        if (row.deletion_review_status === "pending" && !row.deleted_at) deletionPending++
      }
      return {
        statusCode: 200,
        body: JSON.stringify({
          summary: Object.fromEntries(statuses.map((status, index) => [status, results[index].count || 0])),
          inventory: { total: (rowsRes.data || []).length, published, archived, deleted, deletion_pending: deletionPending, by_type: byType },
        }),
      }
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
          .select("id,run_id,scraper_id,scraper_name,script_path,trigger_type,status,exit_code,found_count,valid_count,unique_count,inserted_count,updated_count,duplicate_count,rejected_count,warning_count,error_count,error_summary,github_run_url,started_at,finished_at,duration_seconds")
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
      const [totalRes, activeRes, enrollmentsRes] = await Promise.all([
        supabase.from("founding_beta_enrollments").select("id", { count: "exact", head: true }).eq("program", "founding_50"),
        supabase.from("founding_beta_enrollments").select("id", { count: "exact", head: true })
          .in("status", ["accepted", "active"]).eq("program", "founding_50"),
        supabase.from("founding_beta_enrollments")
          .select("id, user_id, email, status, offered_at, accepted_at, activated_at, benefit_end, dismissed_count, created_at")
          .eq("program", "founding_50")
          .order("created_at", { ascending: false })
          .limit(100),
      ])
      if (enrollmentsRes.error) throw enrollmentsRes.error
      return {
        statusCode: 200,
        body: JSON.stringify({
          program: "founding_50",
          limit: 50,
          total_enrolled: totalRes.count || 0,
          total_active: activeRes.count || 0,
          slots_remaining: Math.max(0, 50 - (activeRes.count || 0)),
          enrollments: enrollmentsRes.data || [],
        })
      }
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

      const [foundingRes, eventsRes, emailsRes, acquisitionRes] = await Promise.all([
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
      ])

      return {
        statusCode: 200,
        body: JSON.stringify({
          profile,
          auth_email: authEmail,  // canonical email from auth.users when profile.email is null
          founding_beta: foundingRes.data || null,
          events: eventsRes.data || [],
          emails_sent: emailsRes.data || [],
          acquisition: acquisitionRes.data || null,
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

    if (action === "delete_content") {
      if (!payload?.id) return { statusCode: 400, body: JSON.stringify({ error: "id requerido" }) }
      const { error } = await supabase.from("content_hub").delete().eq("id", payload.id)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
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
      const reviewedAt = new Date().toISOString()
      const features = payload.features && typeof payload.features === "object" ? payload.features : {}
      const verified = payload.status === "verified"
      const reviewUpdate: Record<string, any> = {
        verification_status: payload.status,
        verification_score: score,
        verification_reasons: criteria,
        verification_note: note,
        reviewed_at: reviewedAt,
        reviewed_by: "admin",
        is_active: verified,
        catalog_eligible: verified && features.catalog !== false,
        match_eligible: verified && features.matching !== false,
        alerts_eligible: verified && features.alerts !== false,
        seo_eligible: verified && features.seo !== false,
        policy_overrides: verified ? features : {},
      }
      if (forceVerified) reviewUpdate.original_source_verified = true
      const { error } = await supabase.from("opportunities").update(reviewUpdate).eq("id", payload.id)
      if (error) throw error
      const { error: auditError } = await supabase.from("opportunity_review_events").insert({
        opportunity_id: payload.id,
        previous_status: current.verification_status,
        new_status: payload.status,
        criteria,
        note,
        actor: "admin",
      })
      if (auditError) throw auditError
      // Fire SEO pipeline after approval — failures never block the approve response
      if (verified && process.env.SEO_PIPELINE_V2 === "true") {
        const dryRun = process.env.SEO_DRY_RUN !== "false"
        runSeoPipeline(supabase, payload.id, dryRun).catch(err =>
          console.error("[seo-pipeline] fire-and-forget error", payload.id, err?.message)
        )
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true, reviewed_at: reviewedAt }) }
    }

    if (action === "update_opportunity") {
      if (!payload?.id || !payload.data || typeof payload.data !== "object") return { statusCode: 400, body: JSON.stringify({ error: "Datos inválidos" }) }
      const allowed = ["title", "organization", "location", "country_code", "department", "city", "type", "opportunity_kind", "opportunity_type", "rubro", "description", "application_url", "source_authority", "original_source_url", "original_source_verified"]
      const update = Object.fromEntries(Object.entries(payload.data).filter(([key]) => allowed.includes(key)).map(([key, value]) => [key, typeof value === "string" ? value.trim().slice(0, key === "description" ? 4000 : 2000) : value]))
      if (!update.title && "title" in update) return { statusCode: 400, body: JSON.stringify({ error: "El título no puede quedar vacío" }) }
      const { error } = await supabase.from("opportunities").update(update).eq("id", payload.id)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
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
      update.updated_at = new Date().toISOString(); update.updated_by = "admin"
      const { error } = await supabase.from("scraper_controls").update(update).eq("scraper_id", payload.scraper_id)
      if (error) throw error
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "update_source_policy") {
      if (!payload?.source || !payload.data) return { statusCode: 400, body: JSON.stringify({ error: "Fuente inválida" }) }
      const allowed = ["display_name", "trust_level", "auto_verify", "is_enabled", "catalog_enabled", "matching_enabled", "alerts_enabled", "seo_enabled", "allowed_country_codes", "allowed_opportunity_types", "max_items_per_day", "retention_days", "verification_criteria", "notes"]
      const update: Record<string, any> = Object.fromEntries(Object.entries(payload.data).filter(([key]) => allowed.includes(key)))
      update.updated_at = new Date().toISOString(); update.updated_by = "admin"
      const { error } = await supabase.from("opportunity_sources").update(update).eq("source", payload.source)
      if (error) throw error
      const propagation: Record<string, boolean> = {}
      if ("catalog_enabled" in update) propagation.catalog_eligible = update.catalog_enabled === true
      if ("matching_enabled" in update) propagation.match_eligible = update.matching_enabled === true
      if ("alerts_enabled" in update) propagation.alerts_eligible = update.alerts_enabled === true
      if ("seo_enabled" in update) propagation.seo_eligible = update.seo_enabled === true
      if (Object.keys(propagation).length) {
        const { error: propagationError } = await supabase.from("opportunities").update(propagation)
          .eq("source", payload.source).eq("verification_status", "verified").eq("is_active", true).is("deleted_at", null)
        if (propagationError) throw propagationError
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "review_recruiter") {
      if (!payload?.id || !["verified", "rejected", "in_review", "pending"].includes(payload.status)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Estado de empresa inválido" }) }
      }
      const verified = payload.status === "verified"
      const { data: current, error: currentError } = await supabase.from("recruiter_tokens")
        .select("id,verification_status").eq("id", payload.id).single()
      if (currentError || !current) throw currentError || new Error("Empresa no encontrada")
      const update: Record<string, any> = {
        verification_status: payload.status,
        verified_at: verified ? new Date().toISOString() : null,
        verified_by: verified ? "admin" : null,
        is_active: verified,
      }
      if (payload.verification_data && typeof payload.verification_data === "object") update.verification_data = payload.verification_data
      const { error } = await supabase.from("recruiter_tokens").update(update).eq("id", payload.id)
      if (error) throw error
      const { error: auditError } = await supabase.from("recruiter_review_events").insert({
        recruiter_token_id: payload.id,
        previous_status: current.verification_status,
        new_status: payload.status,
        note: String(payload.note || "").slice(0, 1000) || null,
        actor: "admin",
      })
      if (auditError) throw auditError
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
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
      const reviewedAt = new Date().toISOString()

      let candidateQuery = supabase
        .from("opportunities")
        .select("id,source_authority,original_source_verified,verification_status,catalog_eligible,match_eligible,alerts_eligible,seo_eligible")
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

      // Source-level trust: if catalog_enabled=true the admin already blessed this aggregator source
      const { data: sourceConfig } = await supabase
        .from("opportunity_sources")
        .select("catalog_enabled")
        .eq("source", source)
        .maybeSingle()
      const sourceTrusted = sourceConfig?.catalog_enabled === true

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
      const verified = status === "verified"
      const { error: updateError } = await supabase
        .from("opportunities")
        .update({
          verification_status: status,
          verification_note: note,
          reviewed_at: reviewedAt,
          reviewed_by: "admin_batch",
          is_active: verified,
          catalog_eligible: verified && features.catalog === true,
          match_eligible: verified && features.matching === true,
          alerts_eligible: verified && features.alerts === true,
          seo_eligible: verified && features.seo === true,
          policy_overrides: verified ? features : {},
        })
        .in("id", ids)
      if (updateError) throw updateError

      const auditRows = ids.map(id => ({
        opportunity_id: id,
        previous_status: candidates.find(c => c.id === id)?.verification_status || "unknown",
        new_status: status,
        criteria: verified
          ? [
              "batch_review",
              `snapshot:${String(payload.idempotency_key).slice(0, 120)}`,
              `review:${String((payload.review_snapshot || []).find((item: any) => String(item.id) === String(id))?.recommendation || "unknown")}`,
              `rules:${String((payload.review_snapshot || []).find((item: any) => String(item.id) === String(id))?.rules_version || "unknown").slice(0, 80)}`,
              `flags_before:${JSON.stringify({ catalog: candidates.find(c => c.id === id)?.catalog_eligible, matching: candidates.find(c => c.id === id)?.match_eligible, alerts: candidates.find(c => c.id === id)?.alerts_eligible, seo: candidates.find(c => c.id === id)?.seo_eligible })}`,
              `flags_after:${JSON.stringify(features)}`,
            ]
          : ["batch_review"],
        note: note || `Revisión en lote — fuente: ${source}`,
        actor: "admin_batch",
      }))
      const { error: auditError } = await supabase.from("opportunity_review_events").insert(auditRows)
      if (auditError) throw auditError

      return { statusCode: 200, body: JSON.stringify({ ok: true, processed: ids.length, skipped, reviewed_at: reviewedAt }) }
    }

    if (action === "batch_review_preview") {
      if (!payload?.source) {
        return { statusCode: 400, body: JSON.stringify({ error: "source requerido" }) }
      }
      const previewSource = String(payload.source)
      const { data: previewCandidates, error: previewError } = await supabase
        .from("opportunities")
        .select("id,title,organization,source_authority,original_source_url,original_source_verified,verification_status")
        .eq("source", previewSource)
        .in("verification_status", ["pending", "in_review"])
        .is("deleted_at", null)
        .limit(500)
      if (previewError) throw previewError

      // Source-level trust: trusted aggregators are eligible for batch approval
      const { data: previewSourceConfig } = await supabase
        .from("opportunity_sources")
        .select("catalog_enabled")
        .eq("source", previewSource)
        .maybeSingle()
      const previewSourceTrusted = previewSourceConfig?.catalog_enabled === true

      const eligible: any[] = []
      const ineligible: any[] = []
      for (const c of (previewCandidates || [])) {
        if (c.source_authority === "original" || c.original_source_verified || previewSourceTrusted) {
          eligible.push({ id: c.id, title: c.title, organization: c.organization, source_authority: c.source_authority, original_source_url: c.original_source_url })
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

    return { statusCode: 400, body: JSON.stringify({ error: "Acción desconocida" }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
