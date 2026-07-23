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
        // duplicate count: same titulo + organization
        supabase.rpc("count_duplicate_opportunities"),
        // Private execution telemetry, newest first. Service-role only.
        supabase
          .from("scraper_runs")
          .select("id,run_id,scraper_id,scraper_name,script_path,trigger_type,status,exit_code,found_count,inserted_count,warning_count,error_count,error_summary,github_run_url,started_at,finished_at,duration_seconds")
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

      const latestByScraper = new Map<string, any>()
      for (const run of (runsRes.data || [])) {
        if (!latestByScraper.has(run.scraper_id)) latestByScraper.set(run.scraper_id, run)
      }
      const severity: Record<string, number> = {
        failed: 0,
        timeout: 1,
        warning: 2,
        running: 3,
        healthy: 4,
      }
      const scraperRuns = [...latestByScraper.values()].sort((a, b) => {
        const statusOrder = (severity[a.status] ?? 9) - (severity[b.status] ?? 9)
        if (statusOrder !== 0) return statusOrder
        return (b.error_count || 0) - (a.error_count || 0)
      })
      const runSummary = scraperRuns.reduce((acc, run) => {
        acc[run.status] = (acc[run.status] || 0) + 1
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
