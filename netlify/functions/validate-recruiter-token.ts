import { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  )

  try {
    const body = JSON.parse(event.body || "{}")
    const { token, action, analysisData } = body

    if (!token?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: "Token requerido" }) }
    }

    // Buscar token
    const { data, error } = await supabase
      .from("recruiter_tokens")
      .select("id, access_token, token_balance, is_active, metadata")
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

    // ─── Validación simple o inicio de sesión (siempre permitido) ───
    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        balance: data.token_balance,
        company_name: (data.metadata as any)?.company_name || "Empresa",
        token_id: data.id,
      }),
    }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ valid: false, error: err.message }) }
  }
}

export { handler }
