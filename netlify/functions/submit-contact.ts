import { Handler } from "@netlify/functions"
import { Resend } from "resend"

const TYPE_LABELS: Record<string, string> = {
  empresa: "Quiero aparecer",
  sugerencia: "Sugerencia",
  otro: "Otro",
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  let body: Record<string, any> = {}
  try {
    body = JSON.parse(event.body || "{}")
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido" }) }
  }

  const { type, name, email, message, url } = body

  if (!["empresa", "sugerencia", "otro"].includes(type)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Tipo inválido" }) }
  }
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return { statusCode: 400, body: JSON.stringify({ error: "Nombre requerido" }) }
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email inválido" }) }
  }
  if (!message || typeof message !== "string" || message.trim().length < 10) {
    return { statusCode: 400, body: JSON.stringify({ error: "Mensaje demasiado corto (mínimo 10 caracteres)" }) }
  }
  if (message.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: "Mensaje demasiado largo (máximo 2000 caracteres)" }) }
  }

  const typeLabel = TYPE_LABELS[type] || type
  const urlRow = url ? `<div><strong style="color:#f5f0e8">URL:</strong> <a href="${url}" style="color:#c9a84c">${url}</a></div>` : ""

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#f5f0e8;font-family:system-ui,sans-serif;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="color:#c9a84c;font-weight:bold;font-size:12px;letter-spacing:0.14em;margin-bottom:16px">
      CONTACTO — CVitae
    </div>
    <div style="background:#111;padding:20px;margin-bottom:20px;border-left:3px solid #c9a84c">
      <div style="color:#a0a0a0;line-height:2">
        <div><strong style="color:#f5f0e8">Tipo:</strong> ${typeLabel}</div>
        <div><strong style="color:#f5f0e8">Nombre:</strong> ${name.trim()}</div>
        <div><strong style="color:#f5f0e8">Email:</strong> ${email.trim()}</div>
        ${urlRow}
      </div>
    </div>
    <div style="background:#0f0f0f;padding:20px;border:1px solid #1a1a1a;margin-bottom:20px">
      <p style="color:#777;font-size:11px;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.1em">Mensaje</p>
      <p style="color:#e0e0d8;line-height:1.8;white-space:pre-wrap;margin:0">${message.trim()}</p>
    </div>
    <a href="mailto:${email.trim()}?subject=Re: tu mensaje en CVitae"
       style="display:inline-block;background:#c9a84c;color:#0a0a0a;font-weight:700;font-size:13px;padding:12px 24px;text-decoration:none">
      Responder a ${name.trim()} →
    </a>
    <p style="color:#333;font-size:11px;margin-top:24px">CVitae · cvitae.lat</p>
  </div>
</body>
</html>`

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: "CVitae Contacto <noreply@cvitae.lat>",
      to: ["contacto@cvitae.lat"],
      replyTo: email.trim(),
      subject: `[CVitae Contacto] ${typeLabel.toUpperCase()}: ${name.trim()} — ${email.trim()}`,
      html,
    })
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error("[submit-contact] send error", err?.message)
    return { statusCode: 500, body: JSON.stringify({ error: "Error al enviar el mensaje. Intentá de nuevo." }) }
  }
}
