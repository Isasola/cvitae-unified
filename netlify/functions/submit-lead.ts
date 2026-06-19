import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" }

  try {
    const body = JSON.parse(event.body || "{}")
    const { name, email, company, company_name, source, cv_base64, cv_file_name } = body

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email requerido" }) }
    }

    const isVacancyApplication = source?.startsWith("vacante:")
    const resolvedCompany = (company_name || company || "").trim() || "Candidato individual"

    const supabase = makeSupabaseAdmin()

    // ── B2B lead flow (non-vacancy, requires a company name)
    if (!isVacancyApplication) {
      if (!resolvedCompany || resolvedCompany === "Candidato individual") {
        return { statusCode: 400, body: JSON.stringify({ error: "Email y empresa requeridos" }) }
      }

      const { error } = await supabase.from("recruiter_leads").insert({
        name: name || null,
        email: email.trim().toLowerCase(),
        company_name: resolvedCompany,
        source: source || "landing_b2b",
      })

      if (error) {
        if (error.code === "23505") {
          return { statusCode: 200, body: JSON.stringify({ success: false, error: "Este email ya está registrado." }) }
        }
        throw error
      }

      try {
        if (process.env.RESEND_API_KEY) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "CVitae <noreply@cvitae.lat>",
              to: ["contacto@cvitae.lat"],
              subject: `🎯 Nuevo lead Beta: ${resolvedCompany} (${email})`,
              html: `
                <h2>Nuevo lead en la landing</h2>
                <p><strong>Nombre:</strong> ${name || "No indicó"}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Empresa:</strong> ${resolvedCompany}</p>
                <p><strong>Fecha:</strong> ${new Date().toLocaleString("es-PY")}</p>
              `,
            }),
          })
        }
      } catch { /* silencioso */ }

      return { statusCode: 200, body: JSON.stringify({ success: true }) }
    }

    // ── Vacancy application flow
    const vacancySlug = source.replace("vacante:", "")
    const normalizedEmail = email.trim().toLowerCase()

    // 1. Upsert candidate profile (no auth required — service role)
    const profilePayload: Record<string, any> = {
      email: normalizedEmail,
      full_name: name || null,
      source: source,
      updated_at: new Date().toISOString(),
    }
    if (cv_file_name) profilePayload.cv_file_name = cv_file_name
    // Store raw base64 only if small enough (< 1 MB) to avoid row bloat
    if (cv_base64 && cv_base64.length < 1_400_000) profilePayload.cv_raw_base64 = cv_base64

    const { error: upsertError } = await supabase
      .from("user_master_profiles")
      .upsert(profilePayload, { onConflict: "email", ignoreDuplicates: false })

    if (upsertError) {
      console.error("upsert user_master_profiles:", upsertError.message)
      // Non-fatal — continue with the rest of the flow
    }

    // 2. Send magic link so the candidate can complete their profile
    let magicLinkSent = false
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${process.env.SITE_URL || "https://cvitae.lat"}/mi-carrera/perfil`,
          data: {
            full_name: name || "",
            vacancy_slug: vacancySlug,
          },
        },
      })
      if (!otpError) magicLinkSent = true
    } catch { /* silencioso — no bloquea la postulación */ }

    // 3. Optional Resend notification to internal team
    try {
      if (process.env.RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "CVitae <noreply@cvitae.lat>",
            to: ["contacto@cvitae.lat"],
            subject: `📋 Nueva postulación: ${vacancySlug} (${normalizedEmail})`,
            html: `
              <h2>Nueva postulación a vacante</h2>
              <p><strong>Vacante:</strong> ${vacancySlug}</p>
              <p><strong>Nombre:</strong> ${name || "No indicó"}</p>
              <p><strong>Email:</strong> ${normalizedEmail}</p>
              <p><strong>CV adjunto:</strong> ${cv_file_name || "No"}</p>
              <p><strong>Fecha:</strong> ${new Date().toLocaleString("es-PY")}</p>
            `,
          }),
        })
      }
    } catch { /* silencioso */ }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        magicLinkSent,
        message: magicLinkSent
          ? "Postulación recibida. Te enviamos un link para completar tu perfil."
          : "Postulación recibida.",
      }),
    }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
