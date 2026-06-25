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
      .select("id, email, company_name, access_token, token_balance, plan_type, is_active, created_at")
      .eq("access_token", token.trim())
      .eq("is_active", true)
      .single()

    if (error || !data) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: "Token inválido o inactivo" }) }
    }

    // ─── Acción: Guardar análisis (requiere créditos) ───
    if (action === "save_analysis" && analysisData) {
      if (data.token_balance <= 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({ error: "Sin créditos disponibles. Contactá a CVitae para recargar." }),
        }
      }

      const { error: insertError } = await supabase
        .from("recruiter_analyses")
        .insert({
          token_id: data.id,
          candidate_name: analysisData.candidate_name || null,
          file_name: analysisData.file_name || null,
          ats_score: analysisData.ats_score,
          strengths: analysisData.strengths || [],
          critical_improvements: analysisData.critical_improvements || [],
          vacancy_label: analysisData.vacancy_label || null,
          raw_cv_text: analysisData.raw_cv_text || null,
          is_starred: false,
          created_at: new Date().toISOString()
        })

      if (!insertError) {
        await supabase
          .from("recruiter_tokens")
          .update({ token_balance: data.token_balance - 1 })
          .eq("id", data.id)
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ saved: !insertError, new_balance: data.token_balance - 1 }),
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

      const { data: applicants } = await supabase
        .from("vacancy_applications")
        .select("id, name, email, cv_file_name, cover_letter, cv_text, ats_score, fit_score, recommendation, ai_summary, strengths, key_matches, key_gaps, analyzed_at, applied_at, recruiter_action, recruiter_notes")
        .eq("vacancy_id", body.vacancy_id)
        .order("applied_at", { ascending: false })
        .limit(100)

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

      const enrichedApplicants = (applicants || []).map((a: any) => ({
        ...a,
        badges: badgesByEmail[a.email] || [],
      }))

      return {
        statusCode: 200,
        body: JSON.stringify({ applicants: enrichedApplicants }),
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

    // ─── Validación simple / inicio de sesión ───
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
