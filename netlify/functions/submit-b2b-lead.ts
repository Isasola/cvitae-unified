import { Handler } from "@netlify/functions"
import { Resend } from "resend"
import { makeSupabaseAdmin } from "./_supabase"

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

  const { name, email, company, cv_volume, message } = body

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return { statusCode: 400, body: JSON.stringify({ error: "Nombre requerido" }) }
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email inválido" }) }
  }
  if (!company || typeof company !== "string" || company.trim().length < 2) {
    return { statusCode: 400, body: JSON.stringify({ error: "Empresa requerida" }) }
  }

  const supabase = makeSupabaseAdmin()

  // Save to b2b_prospects table
  await supabase.from("b2b_prospects").upsert({
    contact_name: name.trim(),
    contact_email: email.trim(),
    company_name: company.trim(),
    source: "landing_b2b",
    notes: message ? String(message).trim().slice(0, 500) : (cv_volume ? `CVs por proceso: ${cv_volume}` : null),
  }, { onConflict: "contact_email" }).select()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#f5f0e8;font-family:system-ui,sans-serif;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="color:#c9a84c;font-weight:bold;font-size:12px;letter-spacing:0.14em;margin-bottom:16px">
      LEAD B2B — CVitae
    </div>
    <div style="background:#111;padding:20px;margin-bottom:20px;border-left:3px solid #c9a84c">
      <div style="color:#a0a0a0;line-height:2">
        <div><strong style="color:#f5f0e8">Nombre:</strong> ${name.trim()}</div>
        <div><strong style="color:#f5f0e8">Email:</strong> ${email.trim()}</div>
        <div><strong style="color:#f5f0e8">Empresa:</strong> ${company.trim()}</div>
        ${cv_volume ? `<div><strong style="color:#f5f0e8">CVs por proceso:</strong> ${cv_volume}</div>` : ""}
      </div>
    </div>
    ${message ? `
    <div style="background:#0f0f0f;padding:20px;border:1px solid #1a1a1a;margin-bottom:20px">
      <p style="color:#777;font-size:11px;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.1em">Mensaje</p>
      <p style="color:#e0e0d8;line-height:1.8;white-space:pre-wrap;margin:0">${String(message).trim()}</p>
    </div>` : ""}
    <a href="mailto:${email.trim()}?subject=CVitae — Probemos juntos"
       style="display:inline-block;background:#c9a84c;color:#0a0a0a;font-weight:700;font-size:13px;padding:12px 24px;text-decoration:none">
      Contactar a ${name.trim()} →
    </a>
    <p style="color:#333;font-size:11px;margin-top:24px">CVitae · cvitae.lat/empresas</p>
  </div>
</body>
</html>`

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: "CVitae B2B <noreply@cvitae.lat>",
      to: ["contacto@cvitae.lat"],
      replyTo: email.trim(),
      subject: `[CVitae B2B] ${company.trim()} — ${name.trim()}`,
      html,
    })
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error("[submit-b2b-lead] send error", err?.message)
    // Still return 200 — data was saved to DB even if email failed
    return { statusCode: 200, body: JSON.stringify({ ok: true, emailFailed: true }) }
  }
}
