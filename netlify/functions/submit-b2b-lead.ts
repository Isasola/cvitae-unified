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

  const { name, email, company, phone, country, processes_per_month, message } = body

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

  const notes = [
    phone ? `Tel: ${String(phone).trim()}` : null,
    country ? `País: ${String(country).trim()}` : null,
    processes_per_month ? `Procesos/mes: ${processes_per_month}` : null,
    message ? String(message).trim().slice(0, 400) : null,
  ].filter(Boolean).join(" · ")

  await supabase.from("b2b_prospects").upsert({
    contact_name: name.trim(),
    contact_email: email.trim(),
    company_name: company.trim(),
    source: "landing_b2b",
    notes: notes || null,
  }, { onConflict: "contact_email" }).select()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#f5f0e8;font-family:system-ui,sans-serif;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="color:#c9a84c;font-weight:bold;font-size:12px;letter-spacing:0.14em;margin-bottom:16px">
      🏢 LEAD B2B — CVitae
    </div>
    <div style="background:#111;padding:20px;margin-bottom:20px;border-left:3px solid #c9a84c">
      <div style="color:#a0a0a0;line-height:2.2">
        <div><strong style="color:#f5f0e8">Empresa:</strong> ${company.trim()}</div>
        <div><strong style="color:#f5f0e8">Contacto:</strong> ${name.trim()}</div>
        <div><strong style="color:#f5f0e8">Email:</strong> ${email.trim()}</div>
        ${phone ? `<div><strong style="color:#f5f0e8">Teléfono:</strong> ${String(phone).trim()}</div>` : ""}
        ${country ? `<div><strong style="color:#f5f0e8">País:</strong> ${String(country).trim()}</div>` : ""}
        ${processes_per_month ? `<div><strong style="color:#f5f0e8">Procesos/mes:</strong> ${processes_per_month}</div>` : ""}
      </div>
    </div>
    ${message ? `
    <div style="background:#0f0f0f;padding:16px;border:1px solid #1a1a1a;margin-bottom:20px">
      <p style="color:#777;font-size:11px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.1em">Mensaje</p>
      <p style="color:#e0e0d8;line-height:1.8;white-space:pre-wrap;margin:0">${String(message).trim()}</p>
    </div>` : ""}
    <div style="background:#0f0f0f;padding:16px;border:1px solid #1a1a1a;margin-bottom:20px">
      <p style="color:#777;font-size:11px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.1em">Qué incluye CVitae B2B</p>
      <ul style="color:#a0a0a0;line-height:2;margin:0;padding-left:16px;font-size:13px">
        <li>Publicación de vacantes con link único y SEO en cvitae.lat</li>
        <li>Filtro IA masivo de CVs con score, fortalezas y brechas</li>
        <li>Análisis en tandas + comparación de finalistas</li>
        <li>Banco privado de candidatos reutilizable entre llamados</li>
        <li>Búsqueda en banco por keyword o descripción de puesto</li>
        <li>Legajo digital por empleado (documentos + recordatorios)</li>
        <li>Adaptable a Paraguay y otros países</li>
      </ul>
    </div>
    <a href="mailto:${email.trim()}?subject=CVitae B2B — Hablemos"
       style="display:inline-block;background:#c9a84c;color:#0a0a0a;font-weight:700;font-size:13px;padding:12px 24px;text-decoration:none">
      Contactar a ${name.trim()} →
    </a>
    <p style="color:#444;font-size:11px;margin-top:24px">CVitae · cvitae.lat/empresas</p>
  </div>
</body>
</html>`

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: "CVitae B2B <noreply@cvitae.lat>",
      to: ["contacto@cvitae.lat"],
      replyTo: email.trim(),
      subject: `[Lead B2B] ${company.trim()} — ${country ? String(country).trim() + " — " : ""}${processes_per_month || "?"} procesos/mes`,
      html,
    })
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error("[submit-b2b-lead] send error", err?.message)
    return { statusCode: 200, body: JSON.stringify({ ok: true, emailFailed: true }) }
  }
}
