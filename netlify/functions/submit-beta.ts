import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

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

function buildConfirmationEmail(name: string): string {
  const firstName = name?.trim().split(" ")[0] || "hola"
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Tu solicitud de acceso a CVitae Beta</title></head>
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
          <p style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.16em;color:rgba(255,255,255,0.35);">Solicitud de acceso Beta recibida</p>
          <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;line-height:1.2;color:#f5f4f0;">
            ${firstName}, recibimos<br>tu solicitud.
          </h1>
          <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.55);">
            Te escribimos en las próximas 48 horas con los detalles para entrar. Mientras tanto, ya podés registrarte con tu CV en CVitae.
          </p>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background-color:#c9a84c;border-radius:50px;text-align:center;">
              <a href="https://cvitae.lat/#registro" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#0a0a0a;text-decoration:none;letter-spacing:0.01em;">
                Registrarme con mi CV →
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);line-height:1.5;">
            Si no solicitaste acceso a CVitae Beta, ignorá este mensaje.
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

function buildNotificationEmail(name: string, email: string, source: string, timestamp: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Nueva solicitud beta B2C</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;color:#f5f4f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#111110;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 36px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.02em;color:#c9a84c;">CV<em style="font-weight:400;font-style:italic;">itae</em></p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.16em;color:rgba(255,255,255,0.35);">Nueva solicitud beta B2C</p>
          <h1 style="margin:0 0 18px;font-size:22px;font-weight:700;line-height:1.25;color:#f5f4f0;">
            Nuevo candidato en la lista de espera
          </h1>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.35);">Nombre</span><br>
              <span style="font-size:15px;color:#f5f4f0;">${name || "No indicó"}</span>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.35);">Email</span><br>
              <span style="font-size:15px;color:#f5f4f0;">${email}</span>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.35);">Fuente</span><br>
              <span style="font-size:15px;color:#f5f4f0;">${source}</span>
            </td></tr>
            <tr><td style="padding:8px 0;">
              <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.35);">Fecha</span><br>
              <span style="font-size:15px;color:#f5f4f0;">${timestamp}</span>
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
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" }

  try {
    const body = JSON.parse(event.body || "{}")
    const { name, email, source } = body

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email requerido" }) }
    }

    const normalizedEmail = email.trim().toLowerCase()
    const supabase = makeSupabaseAdmin()

    // 1. Insert into beta_waitlist
    const { error } = await supabase.from("beta_waitlist").insert({
      name: name?.trim() || null,
      email: normalizedEmail,
      source: source || "landing_b2c",
    })

    if (error) {
      if (error.code === "23505") {
        // Already registered
        return { statusCode: 200, body: JSON.stringify({ already: true }) }
      }
      throw error
    }

    const timestamp = new Date().toLocaleString("es-PY", { timeZone: "America/Asuncion" })

    // 2. Send confirmation email to user
    await sendResendEmail(
      normalizedEmail,
      "Tu solicitud de acceso a CVitae Beta fue recibida ✦",
      buildConfirmationEmail(name || "")
    )

    // 3. Send notification to team
    await sendResendEmail(
      "contacto@cvitae.lat",
      `🌟 Nueva solicitud beta B2C: ${normalizedEmail}`,
      buildNotificationEmail(name || "", normalizedEmail, source || "landing_b2c", timestamp)
    )

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err: any) {
    console.error("submit-beta error:", err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
