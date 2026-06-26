import { Handler } from "@netlify/functions"

const RESEND_KEY = process.env.RESEND_API_KEY

async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY) return false
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CVitae Beta <noreply@cvitae.lat>", to: [to], subject, html }),
    })
    return res.ok
  } catch {
    return false
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" }

  try {
    const { message, email, type } = JSON.parse(event.body || "{}")

    if (!message?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Mensaje requerido" }) }
    }

    const timestamp = new Date().toLocaleString("es-PY", { timeZone: "America/Asuncion" })
    const typeLabel = type === "bug" ? "🐛 Bug reportado" : type === "idea" ? "💡 Idea / sugerencia" : "📝 Feedback beta"

    await sendResendEmail(
      "contacto@cvitae.lat",
      `${typeLabel}: ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}`,
      `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Feedback Beta</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;color:#f5f4f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#111110;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 32px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:18px;font-weight:900;color:#c9a84c;">CV<em style="font-weight:400;font-style:italic;">itae</em></p>
          <p style="margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,0.3);">Feedback de Beta</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,0.35);">${typeLabel}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#f5f4f0;white-space:pre-wrap;">${message.trim()}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.3);">Email</span><br>
              <span style="font-size:13px;color:#f5f4f0;">${email || "Anónimo"}</span>
            </td></tr>
            <tr><td style="padding:8px 0;">
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.3);">Fecha</span><br>
              <span style="font-size:13px;color:#f5f4f0;">${timestamp}</span>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">CVitae Beta · cvitae.lat</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
    )

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
