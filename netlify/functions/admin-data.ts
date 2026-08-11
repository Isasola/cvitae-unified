import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD env var not configured")

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  const { password, action, payload } = JSON.parse(event.body || "{}")

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
      const now = new Date()
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
      const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
      const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7)

      const [usersRes, oppsRes, subsRes, todayRes, yesterdayRes, weekRes, b2bRes] = await Promise.all([
        supabase.from("user_master_profiles").select("id", { count: "exact", head: true }),
        supabase.from("content_hub").select("id", { count: "exact", head: true }).eq("is_active", true).eq("tipo", "oportunidad"),
        supabase.from("user_master_profiles").select("id", { count: "exact", head: true }).eq("is_subscribed", true),
        supabase.from("user_master_profiles").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
        supabase.from("user_master_profiles").select("id", { count: "exact", head: true }).gte("created_at", yesterdayStart.toISOString()).lt("created_at", todayStart.toISOString()),
        supabase.from("user_master_profiles").select("id", { count: "exact", head: true }).gte("created_at", weekStart.toISOString()),
        supabase.from("recruiter_tokens").select("id", { count: "exact", head: true }).eq("is_active", true),
      ])
      return {
        statusCode: 200,
        body: JSON.stringify({
          usuarios: usersRes.count || 0,
          oportunidades: oppsRes.count || 0,
          suscriptores: subsRes.count || 0,
          usuariosHoy: todayRes.count || 0,
          usuariosAyer: yesterdayRes.count || 0,
          usuariosEstaSemana: weekRes.count || 0,
          empresasActivas: b2bRes.count || 0,
        }),
      }
    }

    if (action === "list_b2b_prospects") {
      const { data, error } = await supabase
        .from("b2b_prospects")
        .select("*")
        .order("created_at", { ascending: false })
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
      return { statusCode: 200, body: JSON.stringify({ controls: controlsRes.data || [], sources: sourcesRes.data || [], sourceStats }) }
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

      // today = from midnight local PY time (UTC-4)
      const todayStart = new Date(now)
      todayStart.setUTCHours(4, 0, 0, 0) // midnight PY = 04:00 UTC
      if (now.getUTCHours() < 4) todayStart.setUTCDate(todayStart.getUTCDate() - 1)
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
        const found = latest.found_count
        const inserted = latest.inserted_count
        const productive = typeof inserted === "number" && inserted > 0
        const rejectedAll = typeof found === "number" && found > 0 && inserted === 0
        const noResults = found === 0 && inserted === 0
        const noCounters = found == null && inserted == null
        const healthStatus = ["failed", "timeout"].includes(latest.status)
          ? "critical"
          : rejectedAll
            ? "blocked"
            : latest.error_count > 0 || latest.status === "warning"
              ? "warning"
              : noResults
                ? "idle"
                : noCounters
                  ? "unknown"
                  : "healthy"
        const consecutiveProblems = history.findIndex(run =>
          run.status === "healthy" && typeof run.inserted_count === "number" && run.inserted_count > 0
        )
        const lastProductiveRun = history.find(run => typeof run.inserted_count === "number" && run.inserted_count > 0)
        return {
          ...latest,
          health_status: healthStatus,
          productive,
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

      return {
        statusCode: 200,
        body: JSON.stringify({
          totalOpportunities: totalOppsRes.count || 0,
          totalContentHub: totalChRes.count || 0,
          newLast24h: new24hRes.count || 0,
          newLast7d: new7dRes.count || 0,
          duplicates: (duplicatesRes.data as any)?.[0]?.duplicate_count || 0,
          bySource,
          scraperRuns,
          runSummary,
          telemetryAvailable: !runsRes.error,
          telemetryError: runsRes.error ? "La telemetría todavía no está disponible" : null,
        }),
      }
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
      if (payload.status === "verified" && current.source_authority !== "original" && !current.original_source_verified) {
        return { statusCode: 409, body: JSON.stringify({ error: "Verificá la convocatoria en su fuente original antes de aprobar una fuente agregadora o de descubrimiento" }) }
      }
      const criteria = Array.isArray(payload.criteria) ? payload.criteria.map(String).slice(0, 20) : []
      const note = String(payload.note || "").trim().slice(0, 1000) || null
      const score = Number.isFinite(Number(payload.score)) ? Math.max(0, Math.min(100, Number(payload.score))) : null
      const reviewedAt = new Date().toISOString()
      const features = payload.features && typeof payload.features === "object" ? payload.features : {}
      const verified = payload.status === "verified"
      const { error } = await supabase.from("opportunities").update({
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
      }).eq("id", payload.id)
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
        .select("id,deletion_review_status").eq("id", payload.id).single()
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

    return { statusCode: 400, body: JSON.stringify({ error: "Acción desconocida" }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
