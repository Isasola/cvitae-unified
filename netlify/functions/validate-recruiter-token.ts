import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const RESEND_KEY = process.env.RESEND_API_KEY
const SITE_URL = process.env.SITE_URL || "https://cvitae.lat"

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CVitae <contacto@cvitae.lat>", to: [to], subject, html }),
    })
  } catch { /* non-fatal */ }
}

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
      .select("id, email, company_name, access_token, token_balance, plan_type, plan, plan_expires_at, is_active, verification_status, created_at")
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
          cv_reupload_required: Boolean(a.cv_file_name && !cvDownloadUrl),
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

    // ─── Acción: Listar vacantes del reclutador (activas + cerradas) ───
    if (action === "get_vacancies") {
      const { data: vacancies } = await supabase
        .from("recruiter_vacancies")
        .select("id, title, slug, location, modality, is_active, created_at, vacancy_applications(count)")
        .eq("recruiter_token_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100)

      return {
        statusCode: 200,
        body: JSON.stringify({ vacancies: vacancies || [] }),
      }
    }

    // ─── Acción: Cerrar vacante ───
    if (action === "close_vacancy" && body.vacancy_id) {
      const { data: vac } = await supabase
        .from("recruiter_vacancies")
        .select("id")
        .eq("id", body.vacancy_id)
        .eq("recruiter_token_id", data.id)
        .single()

      if (!vac) {
        return { statusCode: 403, body: JSON.stringify({ error: "Vacante no pertenece a este token" }) }
      }

      await Promise.all([
        supabase.from("recruiter_vacancies").update({ is_active: false }).eq("id", body.vacancy_id),
        supabase.from("opportunities").update({ is_active: false }).eq("recruiter_vacancy_id", body.vacancy_id),
      ])

      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    // ─── Acción: Solicitar recarga de créditos ───
    if (action === "request_credits") {
      const requested = Math.min(500, Math.max(10, Math.floor(Number(body.amount) || 50)))
      await sendEmail(
        "contacto@cvitae.lat",
        `💳 Solicitud de créditos: ${data.company_name || data.email}`,
        `<h2>Solicitud de recarga de créditos</h2>
         <p><strong>Empresa:</strong> ${data.company_name || "Sin nombre"}</p>
         <p><strong>Email:</strong> ${data.email}</p>
         <p><strong>Créditos solicitados:</strong> ${requested}</p>
         <p><strong>Balance actual:</strong> ${data.token_balance}</p>
         <p><a href="${SITE_URL}/admin">Ir al admin →</a></p>`,
      )
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
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
      // Fetch active vacancy IDs once, reuse in all sub-queries (avoids N+1)
      const { data: activeVacRows } = await supabase
        .from("recruiter_vacancies")
        .select("id")
        .eq("recruiter_token_id", data.id)
        .eq("is_active", true)
      const activeIds = activeVacRows?.map((v: any) => v.id) || []

      const [appRes, anaRes, callRes] = await Promise.all([
        activeIds.length
          ? supabase.from("vacancy_applications").select("id", { count: "exact", head: true }).in("vacancy_id", activeIds)
          : Promise.resolve({ count: 0 }),
        supabase.from("recruiter_analyses").select("id", { count: "exact", head: true }).eq("token_id", data.id),
        activeIds.length
          ? supabase.from("vacancy_applications").select("id", { count: "exact", head: true }).eq("recommendation", "Llamar").in("vacancy_id", activeIds)
          : Promise.resolve({ count: 0 }),
      ])

      return {
        statusCode: 200,
        body: JSON.stringify({
          stats: {
            vacantesActivas: activeIds.length,
            totalPostulantes: appRes.count || 0,
            cvsAnalizados: anaRes.count || 0,
            paraLlamar: callRes.count || 0,
          },
        }),
      }
    }

    // ─── Acción: Analytics detallado ───
    if (action === "get_analytics") {
      // Obtener aplicaciones por fuente
      const vacancyIds = (await supabase.from("recruiter_vacancies").select("id").eq("recruiter_token_id", data.id)).data?.map((v: any) => v.id) || []

      const { data: applications } = await supabase
        .from("vacancy_applications")
        .select("id, vacancy_id, applied_at")
        .in("vacancy_id", vacancyIds)

      const directApplications = applications?.filter((a: any) => a.vacancy_id).length || 0

      const { data: analyses } = await supabase
        .from("recruiter_analyses")
        .select("id, file_name")
        .eq("token_id", data.id)

      const manualUploads = analyses?.filter((a: any) => a.file_name).length || 0

      return {
        statusCode: 200,
        body: JSON.stringify({
          analytics: {
            directApplications,
            vacancyLinks: directApplications, // Mismo valor por ahora
            manualUploads,
          },
        }),
      }
    }

    // ─── Acción: Solicitar más saldo ───
    if (action === "request_balance") {
      const RESEND_KEY = process.env.RESEND_API_KEY
      if (RESEND_KEY) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "CVitae <contacto@cvitae.lat>",
              to: ["contacto@cvitae.lat"],
              subject: `🔔 Solicitud de saldo: ${body.company_name || data.company_name}`,
              html: `<h3>Solicitud de recarga de saldo</h3>
                     <p><strong>Empresa:</strong> ${body.company_name || data.company_name}</p>
                     <p><strong>Email:</strong> ${data.email}</p>
                     <p><strong>Token ID:</strong> ${data.id}</p>
                     <p><strong>Balance actual:</strong> ${body.current_balance || data.token_balance} créditos</p>
                     <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-PY')}</p>
                     <hr>
                     <p style="font-size: 12px; color: #666;">Accedé al admin para gestionar: <a href="https://cvitae.lat/admin">cvitae.lat/admin</a></p>`
            }),
          })
        } catch (e) {
          console.error("Error enviando email de solicitud de saldo:", e)
        }
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    // ─── Banco de candidatos: búsqueda cross-llamado (solo SQL, sin Bedrock) ───
    if (action === "get_candidate_bank") {
      const { vacancy_id } = body
      let query = supabase
        .from("recruiter_analyses")
        .select("id,candidate_name,file_name,ats_score,strengths,critical_improvements,vacancy_label,is_starred,created_at")
        .eq("token_id", data.id)
        .order("created_at", { ascending: false })
        .limit(200)
      if (vacancy_id) query = query.eq("vacancy_id", vacancy_id)
      const { data: bank, error: bankErr } = await query
      if (bankErr) throw bankErr
      return { statusCode: 200, body: JSON.stringify({ data: bank || [] }) }
    }

    if (action === "search_candidate_bank") {
      const { query: q } = body
      if (!q || String(q).trim().length < 2) {
        return { statusCode: 400, body: JSON.stringify({ error: "query requerido (mín 2 caracteres)" }) }
      }
      const kw = `%${String(q).trim()}%`
      const { data: results, error: srchErr } = await supabase
        .from("recruiter_analyses")
        .select("id,candidate_name,file_name,ats_score,strengths,critical_improvements,vacancy_label,is_starred,created_at")
        .eq("token_id", data.id)
        .or(`candidate_name.ilike.${kw},vacancy_label.ilike.${kw},strengths.ilike.${kw},critical_improvements.ilike.${kw}`)
        .order("ats_score", { ascending: false })
        .limit(50)
      if (srchErr) throw srchErr
      return { statusCode: 200, body: JSON.stringify({ data: results || [] }) }
    }

    // ─── Legajos ───
    if (action === "create_employee_file") {
      const { employee_name, employee_email, employee_phone, position, hire_date, application_id, notes: empNotes } = body
      if (!employee_name) return { statusCode: 400, body: JSON.stringify({ error: "employee_name requerido" }) }
      const { data: ef, error: efErr } = await supabase.from("employee_files").insert([{
        token_id: data.id,
        employee_name: String(employee_name).trim(),
        employee_email: employee_email ? String(employee_email).trim() : null,
        employee_phone: employee_phone ? String(employee_phone).trim() : null,
        position: position ? String(position).trim() : null,
        hire_date: hire_date || null,
        application_id: application_id || null,
        notes: empNotes ? String(empNotes).trim() : null,
        status: "active",
      }]).select().single()
      if (efErr) throw efErr
      return { statusCode: 200, body: JSON.stringify({ data: ef }) }
    }

    if (action === "get_employee_files") {
      const { data: files, error: filesErr } = await supabase
        .from("employee_files")
        .select("id,employee_name,employee_email,employee_phone,position,hire_date,status,notes,application_id,created_at,updated_at")
        .eq("token_id", data.id)
        .order("employee_name", { ascending: true })
      if (filesErr) throw filesErr
      return { statusCode: 200, body: JSON.stringify({ data: files || [] }) }
    }

    if (action === "update_employee_file") {
      const { file_id, ...fields } = body
      if (!file_id) return { statusCode: 400, body: JSON.stringify({ error: "file_id requerido" }) }
      const allowed = ["employee_name","employee_email","employee_phone","position","hire_date","status","notes"]
      const update: Record<string, any> = { updated_at: new Date().toISOString() }
      for (const k of allowed) { if (k in fields) update[k] = fields[k] }
      const { error: upErr } = await supabase.from("employee_files").update(update).eq("id", file_id).eq("token_id", data.id)
      if (upErr) throw upErr
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "add_employee_document") {
      const { file_id, doc_type, custom_label, file_name, file_url, file_size_kb, notes: docNotes } = body
      if (!file_id || !file_url) return { statusCode: 400, body: JSON.stringify({ error: "file_id y file_url requeridos" }) }
      // verify ownership
      const { data: ef } = await supabase.from("employee_files").select("id").eq("id", file_id).eq("token_id", data.id).single()
      if (!ef) return { statusCode: 403, body: JSON.stringify({ error: "No autorizado" }) }
      const { data: doc, error: docErr } = await supabase.from("employee_documents").insert([{
        employee_file_id: file_id,
        doc_type: doc_type || "otro",
        custom_label: custom_label ? String(custom_label).trim() : null,
        file_name: file_name ? String(file_name).trim() : null,
        file_url: String(file_url).trim(),
        file_size_kb: file_size_kb || null,
        notes: docNotes ? String(docNotes).trim() : null,
      }]).select().single()
      if (docErr) throw docErr
      return { statusCode: 200, body: JSON.stringify({ data: doc }) }
    }

    if (action === "get_employee_documents") {
      const { file_id } = body
      if (!file_id) return { statusCode: 400, body: JSON.stringify({ error: "file_id requerido" }) }
      const { data: ef } = await supabase.from("employee_files").select("id").eq("id", file_id).eq("token_id", data.id).single()
      if (!ef) return { statusCode: 403, body: JSON.stringify({ error: "No autorizado" }) }
      const { data: docs, error: docsErr } = await supabase
        .from("employee_documents").select("*").eq("employee_file_id", file_id).order("uploaded_at", { ascending: false })
      if (docsErr) throw docsErr
      return { statusCode: 200, body: JSON.stringify({ data: docs || [] }) }
    }

    if (action === "add_employee_alert") {
      const { file_id, alert_date, title, notes: alertNotes } = body
      if (!file_id || !alert_date || !title) return { statusCode: 400, body: JSON.stringify({ error: "file_id, alert_date y title requeridos" }) }
      const { data: ef } = await supabase.from("employee_files").select("id").eq("id", file_id).eq("token_id", data.id).single()
      if (!ef) return { statusCode: 403, body: JSON.stringify({ error: "No autorizado" }) }
      const { data: alert, error: aErr } = await supabase.from("employee_alerts").insert([{
        employee_file_id: file_id,
        alert_date,
        title: String(title).trim(),
        notes: alertNotes ? String(alertNotes).trim() : null,
        is_done: false,
      }]).select().single()
      if (aErr) throw aErr
      return { statusCode: 200, body: JSON.stringify({ data: alert }) }
    }

    if (action === "get_employee_alerts") {
      const { file_id, upcoming_only } = body
      if (!file_id) return { statusCode: 400, body: JSON.stringify({ error: "file_id requerido" }) }
      const { data: ef } = await supabase.from("employee_files").select("id").eq("id", file_id).eq("token_id", data.id).single()
      if (!ef) return { statusCode: 403, body: JSON.stringify({ error: "No autorizado" }) }
      let query = supabase.from("employee_alerts").select("*").eq("employee_file_id", file_id).order("alert_date", { ascending: true })
      if (upcoming_only) query = query.eq("is_done", false).gte("alert_date", new Date().toISOString().split("T")[0])
      const { data: alerts, error: alErr } = await query
      if (alErr) throw alErr
      return { statusCode: 200, body: JSON.stringify({ data: alerts || [] }) }
    }

    if (action === "mark_alert_done") {
      const { alert_id } = body
      if (!alert_id) return { statusCode: 400, body: JSON.stringify({ error: "alert_id requerido" }) }
      const { error: doneErr } = await supabase.from("employee_alerts").update({ is_done: true }).eq("id", alert_id)
      if (doneErr) throw doneErr
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    if (action === "get_upload_url") {
      const { file_id, file_name, mime_type } = body
      if (!file_id || !file_name) return { statusCode: 400, body: JSON.stringify({ error: "file_id y file_name requeridos" }) }
      // Verify employee_file belongs to this token
      const { data: ef } = await supabase.from("employee_files").select("id").eq("id", file_id).eq("token_id", data.id).single()
      if (!ef) return { statusCode: 403, body: JSON.stringify({ error: "Legajo no encontrado" }) }
      const sanitized = String(file_name).replace(/[^a-zA-Z0-9._\-áéíóúÁÉÍÓÚüÜñÑ ]/g, "_").replace(/\s+/g, "_").slice(0, 100)
      const storagePath = `${data.id}/${file_id}/${Date.now()}_${sanitized}`
      const { data: uploadData, error: uploadErr } = await supabase.storage.from("employee-documents").createSignedUploadUrl(storagePath)
      if (uploadErr || !uploadData) throw uploadErr || new Error("Error generando URL de subida")
      // Pre-generate signed download URL (10 years = 315360000 seconds)
      const { data: dlData, error: dlErr } = await supabase.storage.from("employee-documents").createSignedUrl(storagePath, 315360000)
      if (dlErr || !dlData?.signedUrl) throw dlErr || new Error("Error generando URL de descarga")
      return { statusCode: 200, body: JSON.stringify({
        uploadUrl: uploadData.signedUrl,
        token: uploadData.token,
        path: storagePath,
        downloadUrl: dlData.signedUrl,
      }) }
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
        plan: data.plan || data.plan_type || "trial",
        plan_expires_at: data.plan_expires_at || null,
      }),
    }
  } catch (err: any) {
    console.error("validate-recruiter-token error:", err.message)
    return { statusCode: 500, body: JSON.stringify({ valid: false, error: err.message }) }
  }
}

export { handler }
