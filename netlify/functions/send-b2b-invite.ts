import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const RESEND_KEY = process.env.RESEND_API_KEY

async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY) { console.error("RESEND_API_KEY not set"); return false }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CVitae <contacto@cvitae.lat>", to, subject, html }),
    })
    return res.ok
  } catch (e) { console.error("Resend error:", e); return false }
}

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function randomCode(n: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  const { password, prospect_id } = JSON.parse(event.body || "{}")

  if (password !== ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }
  }
  if (!prospect_id) {
    return { statusCode: 400, body: JSON.stringify({ error: "prospect_id requerido" }) }
  }

  const supabase = makeSupabaseAdmin()

  try {
    // Load prospect
    const { data: prospect, error: pErr } = await supabase
      .from("b2b_prospects")
      .select("*")
      .eq("id", prospect_id)
      .single()
    if (pErr || !prospect) return { statusCode: 404, body: JSON.stringify({ error: "Prospect no encontrado" }) }

    // Generate token
    const slug = slugify(prospect.company_name || "empresa")
    const token = `cvitae-b2b-${slug}-${randomCode(6)}`

    // Insert into recruiter_tokens
    const { error: tokenErr } = await supabase.from("recruiter_tokens").insert({
      access_token: token,
      email: prospect.email,
      company_name: prospect.company_name || prospect.email,
      token_balance: 999,
      plan_type: "trial",
      is_active: true,
      created_at: new Date().toISOString(),
    })
    if (tokenErr) throw new Error(`Error creando token: ${tokenErr.message}`)

    // Update prospect status
    await supabase.from("b2b_prospects").update({
      status: "invited",
      invited_at: new Date().toISOString(),
      token: token,
    }).eq("id", prospect_id)

    // Send invitation email
    const activationUrl = `https://cvitae.lat/empresas?token=${encodeURIComponent(token)}`
    const contactName = prospect.contact_name || "Equipo de RRHH"
    const companyName = prospect.company_name || prospect.email

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <span style="font-family:Georgia,serif;font-size:1.5rem;font-weight:900;color:#c9a84c;letter-spacing:-0.5px;">CV<em style="font-style:italic;font-weight:400;">itae</em></span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Invitación exclusiva</p>
          <h1 style="margin:0 0 24px;font-size:1.75rem;font-weight:700;color:#ffffff;line-height:1.2;">
            ${companyName}, probá CVitae gratis durante 1 mes.
          </h1>

          <p style="margin:0 0 20px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.7;">
            Hola ${contactName}, ¡gracias por tu interés en CVitae! Estamos invitando a empresas seleccionadas a probar nuestra plataforma de RRHH con IA sin costo durante un mes completo.
          </p>

          <p style="margin:0 0 20px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.7;">
            Con CVitae para empresas podés:
          </p>

          <ul style="margin:0 0 28px;padding:0 0 0 20px;color:rgba(255,255,255,0.65);font-size:14px;line-height:2;">
            <li>Analizar CVs con IA y recibir ranking comparativo automático</li>
            <li>Crear vacantes con link de postulación propio</li>
            <li>Filtrar candidatos por score, skills y recomendación de IA</li>
            <li>Exportar tu banco de talento a CSV</li>
          </ul>

          <p style="margin:0 0 24px;font-size:14px;color:rgba(201,168,76,0.9);background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:8px;padding:16px;">
            Tu acceso incluye <strong>1 mes gratis</strong> con créditos ilimitados. A cambio, nos encantaría recibir tu feedback para seguir mejorando la herramienta.
          </p>

          <!-- CTA -->
          <div style="text-align:center;margin:36px 0;">
            <a href="${activationUrl}" style="display:inline-block;background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:16px 40px;border-radius:100px;font-weight:600;font-size:15px;letter-spacing:0.02em;">
              Activar mi acceso gratuito →
            </a>
          </div>

          <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.3);">O copiá este token en cvitae.lat/empresas:</p>
          <code style="display:block;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 16px;font-size:14px;color:#c9a84c;word-break:break-all;">${token}</code>

          <p style="margin:32px 0 0;font-size:13px;color:rgba(255,255,255,0.3);line-height:1.6;">
            Cualquier consulta respondé este mail o escribinos a <a href="mailto:contacto@cvitae.lat" style="color:#c9a84c;">contacto@cvitae.lat</a>.
            Tu feedback nos ayuda a construir la mejor herramienta de RRHH de Paraguay.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);">CVitae · Asunción, Paraguay · <a href="https://cvitae.lat" style="color:rgba(201,168,76,0.5);">cvitae.lat</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    await sendResendEmail(prospect.email, `${companyName}: Tu acceso gratuito a CVitae está listo`, html)

    return { statusCode: 200, body: JSON.stringify({ ok: true, token }) }
  } catch (err: any) {
    console.error("send-b2b-invite error:", err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
