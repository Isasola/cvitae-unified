import { Handler } from "@netlify/functions"
import * as pdfParse from "pdf-parse"
import { makeSupabaseAdmin } from "./_supabase"

const SITE_URL = process.env.SITE_URL || "https://cvitae.lat"
const RESEND_KEY = process.env.RESEND_API_KEY

async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY) {
    console.error("RESEND_API_KEY not set — skipping email")
    return false
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CVitae <noreply@cvitae.lat>", to: [to], subject, html }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error("Resend error", res.status, body)
    }
    return res.ok
  } catch (e: any) {
    console.error("Resend fetch error:", e.message)
    return false
  }
}

async function extractCvText(base64: string): Promise<string> {
  try {
    const buf = Buffer.from(base64, "base64")
    const data = await pdfParse.default(buf)
    return (data.text || "").substring(0, 8000)
  } catch {
    return ""
  }
}

function buildMagicLinkEmail(name: string, magicLink: string): string {
  const firstName = name?.split(" ")[0] || "hola"
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Tu acceso a CVitae</title></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;color:#f5f4f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background-color:#111110;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:22px;font-weight:900;letter-spacing:-0.02em;color:#c9a84c;">CV<em style="font-weight:400;font-style:italic;">itae</em></p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.16em;color:rgba(255,255,255,0.35);">Tu postulación fue enviada</p>
          <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;line-height:1.2;color:#f5f4f0;">
            ${firstName}, tu acceso<br>está listo.
          </h1>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.55);">
            Tu postulación fue enviada con éxito. Accedé a tu perfil para ver el estado y completar tu información para futuras oportunidades.
          </p>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background-color:#c9a84c;border-radius:50px;text-align:center;">
              <a href="${magicLink}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#0a0a0a;text-decoration:none;letter-spacing:0.01em;">
                Acceder a mi perfil →
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);line-height:1.5;">
            Este link expira en 24 horas. Si no postulaste a ninguna vacante, ignorá este mensaje.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">CVitae · <a href="https://cvitae.lat" style="color:rgba(255,255,255,0.2);">cvitae.lat</a> · Asunción, Paraguay</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" }

  try {
    const body = JSON.parse(event.body || "{}")
    const { name, email, company, company_name, source, cv_base64, cv_file_name, cover_letter } = body

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email requerido" }) }
    }

    const isVacancyApplication = source?.startsWith("vacante:")
    const resolvedCompany = (company_name || company || "").trim() || "Candidato individual"
    const supabase = makeSupabaseAdmin()

    // ── B2B lead flow (non-vacancy)
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

      await sendResendEmail(
        "contacto@cvitae.lat",
        `🎯 Nuevo lead Beta: ${resolvedCompany} (${email})`,
        `<h2>Nuevo lead en la landing</h2>
         <p><strong>Nombre:</strong> ${name || "No indicó"}</p>
         <p><strong>Email:</strong> ${email}</p>
         <p><strong>Empresa:</strong> ${resolvedCompany}</p>`
      )

      return { statusCode: 200, body: JSON.stringify({ success: true }) }
    }

    // ── Vacancy application flow
    const vacancySlug = source.replace("vacante:", "")
    const normalizedEmail = email.trim().toLowerCase()

    // 1. Extract CV text for analysis (runs in parallel with profile upsert)
    const cvText = cv_base64 ? await extractCvText(cv_base64) : ""

    // 2. Look up vacancy id
    const { data: vacancyRow } = await supabase
      .from("recruiter_vacancies")
      .select("id, title, recruiter_token_id")
      .eq("slug", vacancySlug)
      .single()

    // 3. Save application record (separate from user profile)
    const { error: appError } = await supabase
      .from("vacancy_applications")
      .insert({
        vacancy_id: vacancyRow?.id || null,
        vacancy_slug: vacancySlug,
        name: name || "",
        email: normalizedEmail,
        cv_text: cvText || null,
        cv_file_name: cv_file_name || null,
        cover_letter: cover_letter || null,
      })

    if (appError) {
      console.error("insert vacancy_applications:", appError.message)
    }

    // Notify recruiter when a new application arrives
    if (vacancyRow?.recruiter_token_id && !appError) {
      try {
        const { data: tokenRow } = await supabase
          .from("recruiter_tokens")
          .select("email, company_name")
          .eq("id", vacancyRow.recruiter_token_id)
          .single()

        if (tokenRow?.email) {
          await sendResendEmail(
            tokenRow.email,
            `Nueva postulación: ${name || "Candidato"} — ${vacancyRow.title || vacancySlug}`,
            `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Nueva postulación</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;color:#f5f4f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#111110;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 36px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.02em;color:#c9a84c;">CV<em style="font-weight:400;font-style:italic;">itae</em></p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:rgba(255,255,255,0.35);">Nueva postulación recibida</p>
          <h1 style="margin:0 0 18px;font-size:22px;font-weight:700;line-height:1.25;color:#f5f4f0;">
            ${name || "Un candidato"} se postuló a<br><em style="font-style:italic;font-weight:400;">${vacancyRow.title || vacancySlug}</em>
          </h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:rgba(255,255,255,0.5);">
            Ingresá al panel para ver el CV y analizar al candidato.
          </p>
          <table cellpadding="0" cellspacing="0">
            <tr><td style="background:#c9a84c;border-radius:50px;">
              <a href="${SITE_URL}/empresas" style="display:inline-block;padding:12px 28px;font-size:13px;font-weight:600;color:#0a0a0a;text-decoration:none;">
                Ver postulante →
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:18px 36px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">CVitae · cvitae.lat · Asunción, Paraguay</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
          )
        }
      } catch (e: any) {
        console.error("recruiter notification email failed:", e.message)
      }
    }

    // 4. Upsert candidate into user_master_profiles
    const profilePayload: Record<string, any> = {
      email: normalizedEmail,
      full_name: name || null,
      updated_at: new Date().toISOString(),
    }
    const profileData: Record<string, any> = { vacancy_slug: vacancySlug }
    if (cover_letter) profileData.cover_letter = cover_letter
    if (cv_file_name) profileData.cv_file_name = cv_file_name
    profilePayload.profile_data = profileData

    const { error: upsertError } = await supabase
      .from("user_master_profiles")
      .upsert(profilePayload, { onConflict: "email", ignoreDuplicates: false })

    if (upsertError) {
      console.error("upsert user_master_profiles:", upsertError.message)
    }

    // 2. Generate magic link via admin API (no email sent by Supabase)
    let magicLinkSent = false
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo: `${SITE_URL}/mi-carrera/perfil`,
          data: { full_name: name || "", vacancy_slug: vacancySlug },
        },
      })

      if (!linkError && linkData?.properties?.action_link) {
        const magicLink = linkData.properties.action_link
        const emailHtml = buildMagicLinkEmail(name || "", magicLink)
        magicLinkSent = await sendResendEmail(
          normalizedEmail,
          "Tu acceso a CVitae está listo ✦",
          emailHtml
        )

        // Fallback: if Resend fails, use Supabase OTP as backup
        if (!magicLinkSent) {
          console.error("Resend failed — falling back to Supabase OTP")
          const { error: otpError } = await supabase.auth.signInWithOtp({
            email: normalizedEmail,
            options: {
              shouldCreateUser: true,
              emailRedirectTo: `${SITE_URL}/mi-carrera/perfil`,
            },
          })
          if (!otpError) magicLinkSent = true
        }
      } else {
        // generateLink failed, fall back to OTP
        console.error("generateLink error:", linkError?.message)
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: `${SITE_URL}/mi-carrera/perfil`,
          },
        })
        if (!otpError) magicLinkSent = true
      }
    } catch (err: any) {
      console.error("magic link flow error:", err.message)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        magicLinkSent,
        message: "Postulación recibida. Revisá tu email para acceder a tu perfil.",
      }),
    }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
