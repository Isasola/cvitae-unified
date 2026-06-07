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

    // FIX: columna correcta es token_key (no access_token)
    const { data, error } = await supabase
      .from("recruiter_tokens")
      .select("id, token_key, credits_remaining, company_name, is_active")
      .eq("token_key", token.trim())
      .eq("is_active", true)
      .single()

    if (error || !data) {
      return { statusCode: 200, body: JSON.stringify({ valid: false, error: "Token inválido o inactivo" }) }
    }

    if (data.credits_remaining <= 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: "Sin créditos disponibles. Contactá a CVitae para recargar." }),
      }
    }

    // Acción: guardar análisis + descontar crédito
    if (action === "save_analysis" && analysisData) {
      const { error: insertError } = await supabase
        .from("recruiter_analyses")
        .insert({
          token_id: data.id,
          company_name: data.company_name,
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
          .update({ credits_remaining: data.credits_remaining - 1 })
          .eq("id", data.id)
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ saved: !insertError, new_balance: data.credits_remaining - 1 }),
      }
    }

    // Acción: obtener historial
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

    // Acción: toggle estrella
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

    // Default: solo validar
    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        balance: data.credits_remaining,
        company_name: data.company_name || "Empresa",
        token_id: data.id,
      }),
    }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ valid: false, error: err.message }) }
  }
}

export { handler }
