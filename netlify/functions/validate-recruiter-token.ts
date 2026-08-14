import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const supabase = makeSupabaseAdmin()

  try {
    const body = JSON.parse(event.body || "{}")
    const { token, action, analysisData } = body

    if (!token?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: "Token requerido" }) }
    }

    // Buscar token
    const { data, error } = await supabase
      .from("recruiter_tokens")
      .select("id, email, company_name, access_token, token_balance, plan_type, is_active, verification_status, created_at")
      .eq("access_token", token.trim())
      .eq("is_active", true)
      .eq("verification_status", "verified")
      .single()

    if (error || !data) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: "Token inválido o inactivo" }) }
    }

    // Legacy write path intentionally disabled. Analyses must be created by
    // analyze-cv-candidate so reservation, persistence and ledger stay atomic.
    if (action === "save_analysis" && analysisData) {
      return {
        statusCode: 410,
        body: JSON.stringify({ saved: false, error: "Ruta antigua deshabilitada. Actualizá la aplicación y repetí el análisis." }),
      }
    }

    // ─── Acción: Obtener historial (no requiere créditos) ───
    if (action === "get_history") {
      const { data: history } = await supabase
        .from("recruiter_analyses")
        .select("id, candidate_name, file_name, ats_score, strengths, critical_improvements, vacancy_label, is_starred, created_at")
        .eq("token_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100)

      return {
        statusCode: 200,
        body: JSON.stringify({ history: history || [] }),
      }
    }

    // ─── Acción: Toggle estrella (no requiere créditos) ───
    if (action === "toggle_star" && body.analysis_id) {
      const { data: analysis } = await supabase
        .from("recruiter_analyses")
        .select("is_starred")
        .eq("id", body.analysis_id)
        .eq("token_id", data.id)
        .single()

      if (analysis) {
        await supabase
          .from("recruiter_analyses")
          .update({ is_starred: !analysis.is_starred })
          .eq("id", body.analysis_id)
          .eq("token_id", data.id)
      }

      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    // ─── Acción: Listar postulantes de una vacante ───
    if (action === "get_applicants" && body.vacancy_id) {
      // verify vacancy belongs to this token
      const { data: vac } = await supabase
        .from("recruiter_vacancies")
        .select("id")
        .eq("id", body.vacancy_id)
        .eq("recruiter_token_id", data.id)
        .single()

      if (!vac) {
        return { statusCode: 403, body: JSON.stringify({ error: "Vacante no pertenece a este token" }) }
      }

      const page = Math.max(0, Math.floor(Number(body.page) || 0))
      const pageSize = Math.min(100, Math.max(20, Math.floor(Number(body.page_size) || 60)))
      const from = page * pageSize
      const to = from + pageSize - 1
      const { data: applicants, count: totalApplicants } = await supabase
        .from("vacancy_applications")
        .select("id, name, email, cv_file_name, cv_storage_path, cv_parse_status, cover_letter, cv_text, ats_score, fit_score, recommendation, ai_summary, strengths, key_matches, key_gaps, analyzed_at, applied_at, recruiter_action, recruiter_notes, review_status, review_batch_number, batch_selected, progressive_shortlist, progressive_rank, triage_tier, selection_reason", { count: "exact" })
        .eq("vacancy_id", body.vacancy_id)
        .order("progressive_shortlist", { ascending: false })
        .order("progressive_rank", { ascending: true, nullsFirst: false })
        .order("applied_at", { ascending: false })
        .range(from, to)

      const countRows = async (configure: (query: any) => any) => {
        const base = supabase.from("vacancy_applications").select("id", { count: "exact", head: true }).eq("vacancy_id", body.vacancy_id)
        const { count } = await configure(base)
        return count || 0
      }
      const [analyzedCount, pendingCount, manualCount, strongCount, shortlistCount, batchesResult] = await Promise.all([
        countRows(query => query.eq("review_status", "analyzed")),
        countRows(query => query.in("review_status", ["pending", "failed", "processing"]).not("cv_text", "is", null)),
        countRows(query => query.is("cv_text", null)),
        countRows(query => query.eq("triage_tier", "strong")),
        countRows(query => query.eq("progressive_shortlist", true)),
        supabase.from("vacancy_review_batches").select("id", { count: "exact", head: true }).eq("vacancy_id", body.vacancy_id).eq("status", "completed"),
      ])

      // Enrich with B2C badges
      const emails = (applicants || []).map((a: any) => a.email).filter(Boolean)
      let badgesByEmail: Record<string, string[]> = {}

      if (emails.length > 0) {
        const { data: profiles } = await supabase
          .from("user_master_profiles")
          .select("email, profile_data")
          .in("email", emails)

        if (profiles) {
          for (const p of profiles) {
            badgesByEmail[p.email] = p.profile_data?.badges || []
          }
        }
      }

      const enrichedApplicants = await Promise.all((applicants || []).map(async (a: any) => {
        let cvDownloadUrl: string | null = null
        if (a.cv_storage_path) {
          const { data: signed } = await supabase.storage.from("candidate-cvs").createSignedUrl(a.cv_storage_path, 600)
          cvDownloadUrl = signed?.signedUrl || null
        }
        const { cv_storage_path: _privatePath, ...safeApplicant } = a
        return {
          ...safeApplicant,
          cv_download_url: cvDownloadUrl,
          badges: badgesByEmail[a.email] || [],
        }
      }))

      return {
        statusCode: 200,
        body: JSON.stringify({
          applicants: enrichedApplicants,
          pagination: {
            page,
            page_size: pageSize,
            total: totalApplicants || 0,
            has_more: from + enrichedApplicants.length < (totalApplicants || 0),
          },
          review: {
            total: totalApplicants || 0,
            analyzed: analyzedCount,
            pending: pendingCount,
            manual_review: manualCount,
            strong: strongCount,
            shortlist: shortlistCount,
            batches_completed: batchesResult.count || 0,
          },
        }),
      }
    }

    // ─── Acción: Listar vacantes del reclutador ───
    if (action === "get_vacancies") {
      const { data: vacancies } = await supabase
        .from("recruiter_vacancies")
        .select("id, title, slug, location, modality, is_active, created_at, vacancy_applications(count)")
        .eq("recruiter_token_id", data.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50)

      return {
        statusCode: 200,
        body: JSON.stringify({ vacancies: vacancies || [] }),
      }
    }

    // ─── Acción: Actualizar estado de postulante ───
    if (action === "update_application_status" && body.application_id) {
      const validActions = ['pending', 'contacted', 'interviewing', 'hired', 'rejected']
      if (!validActions.includes(body.recruiter_action)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Estado inválido. Valores permitidos: pending, contacted, interviewing, hired, rejected" }) }
      }

      // Verificar que la aplicación pertenece a una vacante de este token
      const { data: app } = await supabase
        .from("vacancy_applications")
        .select("id, vacancy_id")
        .eq("id", body.application_id)
        .single()

      if (!app) {
        return { statusCode: 404, body: JSON.stringify({ error: "Postulación no encontrada" }) }
      }

      const { data: vac } = await supabase
        .from("recruiter_vacancies")
        .select("id")
        .eq("id", app.vacancy_id)
        .eq("recruiter_token_id", data.id)
        .single()

      if (!vac) {
        return { statusCode: 403, body: JSON.stringify({ error: "Sin acceso a esta postulación" }) }
      }

      const updatePayload: Record<string, any> = { recruiter_action: body.recruiter_action }
      if (body.recruiter_notes !== undefined) updatePayload.recruiter_notes = body.recruiter_notes

      const { error: updateError } = await supabase
        .from("vacancy_applications")
        .update(updatePayload)
        .eq("id", body.application_id)

      if (updateError) {
        return { statusCode: 500, body: JSON.stringify({ error: updateError.message }) }
      }

      return { statusCode: 200, body: JSON.stringify({ ok: true, recruiter_action: body.recruiter_action }) }
    }

    // ─── Acción: Dashboard stats ───
    if (action === "get_dashboard_stats") {
      const [vacRes, appRes, anaRes, callRes] = await Promise.all([
        supabase.from("recruiter_vacancies").select("id", { count: "exact", head: true }).eq("recruiter_token_id", data.id).eq("is_active", true),
        supabase.from("vacancy_applications").select("id", { count: "exact", head: true }).in(
          "vacancy_id",
          (await supabase.from("recruiter_vacancies").select("id").eq("recruiter_token_id", data.id)).data?.map((v: any) => v.id) || []
        ),
        supabase.from("recruiter_analyses").select("id", { count: "exact", head: true }).eq("token_id", data.id),
        supabase.from("vacancy_applications").select("id", { count: "exact", head: true }).eq("recommendation", "Llamar").in(
          "vacancy_id",
          (await supabase.from("recruiter_vacancies").select("id").eq("recruiter_token_id", data.id)).data?.map((v: any) => v.id) || []
        ),
      ])
      return {
        statusCode: 200,
        body: JSON.stringify({
          stats: {
            vacantesActivas: vacRes.count || 0,
            totalPostulantes: appRes.count || 0,
            cvsAnalizados: anaRes.count || 0,
            paraLlamar: callRes.count || 0,
          },
        }),
      }
    }

    // ─── Validación simple / inicio de sesión ───
    // Auto-activate prospect if was invited
    supabase.from("b2b_prospects").update({ status: "activated", activated_at: new Date().toISOString() }).eq("status", "invited").ilike("email", data.email).then(() => {})

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        balance: data.token_balance,
        company_name: data.company_name || "Sin nombre",
        token_id: data.id,
      }),
    }
  } catch (err: any) {
    console.error("validate-recruiter-token error:", err.message)
    return { statusCode: 500, body: JSON.stringify({ valid: false, error: err.message }) }
  }
}

export { handler }
