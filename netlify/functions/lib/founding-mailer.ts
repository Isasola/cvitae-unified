// netlify/functions/lib/founding-mailer.ts
// Shared email/notification logic for the Founding Beta program.
// Direct Resend + Supabase operations — no internal HTTP self-calls.
// Imported by founding-beta-action, send-founding-email, notify-founder-signup.

import type { SupabaseClient } from "@supabase/supabase-js"
import { Resend } from "resend"

export const FOUNDING_TEMPLATES: Record<string, { subject: string; fromName: string; fromAddress: string }> = {
  "founding_welcome_v1": {
    subject: "¡Sos parte del Founding 50 de CVitae! 🎉",
    fromName: "Isaias de CVitae",
    fromAddress: "contacto@cvitae.lat",
  },
  "founding_offer_v1": {
    subject: "Te reservamos un lugar en el Founding 50",
    fromName: "CVitae",
    fromAddress: "noreply@cvitae.lat",
  },
}

export function buildFoundingEmailHtml(template: string, data: Record<string, any>): string {
  const name = data.name || "usuario"

  if (template === "founding_welcome_v1") {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0a0a;color:#f5f0e8;font-family:system-ui,sans-serif;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px">
    <div style="margin-bottom:32px">
      <span style="background:#c9a84c15;border:1px solid #c9a84c50;color:#c9a84c;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px">FOUNDING 50</span>
    </div>
    <h1 style="font-size:28px;font-weight:700;color:#f5f0e8;margin:0 0 16px">¡Hola ${name}, sos parte del Founding 50!</h1>
    <p style="color:#a0a0a0;line-height:1.7;margin:0 0 20px">
      Gracias por unirte como uno de los primeros 50 usuarios de CVitae.
      Tu cuenta ya tiene <strong style="color:#c9a84c">6 meses de Pro activados</strong>, sin tarjeta, sin auto-renovación.
    </p>
    <p style="color:#a0a0a0;line-height:1.7;margin:0 0 20px">
      Como Founding User, tu feedback construye CVitae. Si algo no funciona como esperás,
      o si tenés ideas, respondé este correo directamente.
    </p>
    <div style="margin:32px 0">
      <a href="https://cvitae.lat/mi-carrera" style="background:#c9a84c;color:#0a0a0a;font-weight:600;font-size:14px;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block">
        Ir a mi carrera →
      </a>
    </div>
    <p style="color:#555;font-size:12px;line-height:1.6">
      CVitae · cvitae.lat · Paraguay<br>
      Recibís este correo porque sos parte del programa Founding 50.
    </p>
  </div>
</body>
</html>`
  }

  if (template === "founding_offer_v1") {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0a0a0a;color:#f5f0e8;font-family:system-ui,sans-serif;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px">
    <div style="margin-bottom:32px">
      <span style="background:#c9a84c15;border:1px solid #c9a84c50;color:#c9a84c;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px">FOUNDING 50</span>
    </div>
    <h1 style="font-size:28px;font-weight:700;color:#f5f0e8;margin:0 0 16px">Te reservamos un lugar, ${name}</h1>
    <p style="color:#a0a0a0;line-height:1.7;margin:0 0 20px">
      CVitae está construyendo su base de usuarios y queremos que seas de los primeros 50.
      Solo tenés que entrar a tu dashboard y aceptar la invitación.
    </p>
    <p style="color:#a0a0a0;line-height:1.7;margin:0 0 20px">
      El beneficio es <strong style="color:#c9a84c">6 meses de Pro gratis</strong>,
      sin tarjeta requerida y sin renovación automática.
    </p>
    <div style="margin:32px 0">
      <a href="https://cvitae.lat/mi-carrera" style="background:#c9a84c;color:#0a0a0a;font-weight:600;font-size:14px;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block">
        Ver mi oferta →
      </a>
    </div>
    <p style="color:#555;font-size:12px;line-height:1.6">
      CVitae · cvitae.lat · Paraguay<br>
      Recibís este correo porque creaste una cuenta en CVitae.
    </p>
  </div>
</body>
</html>`
  }

  return `<p>Hola ${name},</p><p>Este es un correo de CVitae.</p>`
}

export async function sendFoundingEmail({
  template,
  userId,
  recipientEmail,
  recipientName,
  force = false,
  supabaseAdmin,
  resend,
}: {
  template: string
  userId: string
  recipientEmail?: string
  recipientName?: string
  force?: boolean
  supabaseAdmin: SupabaseClient
  resend: Resend
}): Promise<{ ok: boolean; already_sent?: boolean; already_sent_at?: string; error?: string }> {
  if (!FOUNDING_TEMPLATES[template]) {
    return { ok: false, error: `Template inválido: ${template}` }
  }

  // Resolve canonical email from auth.users when not provided
  if (!recipientEmail) {
    const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (authUserError || !authUser?.user?.email) {
      return { ok: false, error: "No se pudo resolver el email del usuario" }
    }
    recipientEmail = authUser.user.email
    if (!recipientName) {
      const { data: profile } = await supabaseAdmin
        .from("user_master_profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle()
      recipientName = profile?.full_name || undefined
    }
  }

  // Dedup check using idempotency_key
  const stableKey = `${template}:${userId}:v1`
  if (!force) {
    const { data: existing } = await supabaseAdmin
      .from("email_log")
      .select("id, sent_at")
      .eq("idempotency_key", stableKey)
      .maybeSingle()
    if (existing) {
      return { ok: true, already_sent: true, already_sent_at: existing.sent_at }
    }
  }

  const templateConfig = FOUNDING_TEMPLATES[template]
  const html = buildFoundingEmailHtml(template, { name: recipientName || "usuario" })
  const idempotencyKey = force ? `${template}:${userId}:forced_${Date.now()}` : stableKey

  let resendId: string | null = null
  let status: "sent" | "failed" = "sent"

  try {
    const result = await resend.emails.send({
      from: `${templateConfig.fromName} <${templateConfig.fromAddress}>`,
      to: [recipientEmail],
      subject: templateConfig.subject,
      html,
    })
    resendId = (result.data as any)?.id || null
  } catch (err: any) {
    console.error("[founding-mailer] Resend error", err.message)
    status = "failed"
  }

  // Log send attempt regardless of success/failure
  const { error: logError } = await supabaseAdmin.from("email_log").insert({
    user_id: userId,
    template,
    recipient_email: recipientEmail,
    subject: templateConfig.subject,
    status,
    resend_id: resendId,
    idempotency_key: idempotencyKey,
    metadata: { template_version: template, force: force || false },
  })
  if (logError) console.error("[founding-mailer] log error", logError.message)

  return { ok: status === "sent" }
}

export async function notifyFounder({
  userEmail,
  userName,
  signupAt,
  source,
  resend,
}: {
  userEmail: string
  userName?: string
  signupAt?: string
  source?: string
  resend: Resend
}): Promise<void> {
  const signupTime = signupAt
    ? new Date(signupAt).toLocaleString("es-PY", { timeZone: "America/Asuncion" })
    : "recién"
  const html = `
<div style="font-family:monospace;background:#0a0a0a;color:#f5f0e8;padding:20px;border-radius:8px;max-width:480px">
  <div style="color:#c9a84c;font-weight:bold;margin-bottom:12px">Nuevo usuario — CVitae</div>
  <div style="color:#a0a0a0;line-height:1.8">
    <div><strong style="color:#f5f0e8">Email:</strong> ${userEmail}</div>
    ${userName ? `<div><strong style="color:#f5f0e8">Nombre:</strong> ${userName}</div>` : ''}
    <div><strong style="color:#f5f0e8">Fecha:</strong> ${signupTime}</div>
    ${source ? `<div><strong style="color:#f5f0e8">Origen:</strong> ${source}</div>` : ''}
  </div>
  <div style="margin-top:16px">
    <a href="https://cvitae.lat/admin" style="color:#c9a84c;text-decoration:none;font-size:12px">Ver en Admin →</a>
  </div>
</div>`

  await resend.emails.send({
    from: "CVitae Sistema <noreply@cvitae.lat>",
    to: ["contacto@cvitae.lat"],
    subject: `[CVitae] Nuevo usuario: ${userEmail}`,
    html,
  })
}

type FounderMilestoneEvent = "founding_offered" | "founding_accepted" | "first_value"

function buildFounderMilestoneEmail(
  event: FounderMilestoneEvent,
  data: { userEmail: string; userName?: string; timestamp: string; details?: Record<string, any> }
): { subject: string; html: string } {
  const name = data.userName || data.userEmail
  const ts = new Date(data.timestamp).toLocaleString("es-PY", { timeZone: "America/Asuncion" })
  const adminLink = "https://cvitae.lat/admin"

  if (event === "founding_offered") {
    return {
      subject: `[CVitae] ${name} recibió la oferta Founding`,
      html: `
<div style="font-family:monospace;background:#0a0a0a;color:#f5f0e8;padding:20px;border-radius:8px;max-width:520px">
  <div style="color:#c9a84c;font-weight:bold;margin-bottom:12px">FOUNDING OFFERED — CVitae</div>
  <div style="color:#a0a0a0;line-height:1.8">
    <div><strong style="color:#f5f0e8">Nombre:</strong> ${name}</div>
    <div><strong style="color:#f5f0e8">Email:</strong> ${data.userEmail}</div>
    <div><strong style="color:#f5f0e8">Evento:</strong> FOUNDING OFFERED</div>
    <div><strong style="color:#f5f0e8">Timestamp:</strong> ${ts}</div>
    <div><strong style="color:#f5f0e8">Plan actual:</strong> FREE → oferta pendiente</div>
  </div>
  <div style="margin-top:16px">
    <a href="${adminLink}" style="color:#c9a84c;text-decoration:none;font-size:12px">Admin / Customer 360 →</a>
  </div>
</div>`,
    }
  }

  if (event === "founding_accepted") {
    const d = data.details || {}
    const acceptedTs = d.accepted_at
      ? new Date(d.accepted_at).toLocaleString("es-PY", { timeZone: "America/Asuncion" })
      : ts
    return {
      subject: `[CVitae] ${name} aceptó Founding — 6 meses Pro activos`,
      html: `
<div style="font-family:monospace;background:#0a0a0a;color:#f5f0e8;padding:20px;border-radius:8px;max-width:520px">
  <div style="color:#c9a84c;font-weight:bold;margin-bottom:12px">FOUNDING ACCEPTED — CVitae</div>
  <div style="color:#a0a0a0;line-height:1.8">
    <div><strong style="color:#f5f0e8">Nombre:</strong> ${name}</div>
    <div><strong style="color:#f5f0e8">Email:</strong> ${data.userEmail}</div>
    <div><strong style="color:#f5f0e8">Evento:</strong> FOUNDING ACCEPTED</div>
    <div><strong style="color:#f5f0e8">Aceptado:</strong> ${acceptedTs}</div>
    <div><strong style="color:#f5f0e8">Beneficio inicio:</strong> ${d.benefit_start || "—"}</div>
    <div><strong style="color:#f5f0e8">Beneficio fin:</strong> ${d.benefit_end || "—"}</div>
    <div><strong style="color:#f5f0e8">Plan actual:</strong> PRO (6 meses)</div>
  </div>
  <div style="margin-top:16px">
    <a href="${adminLink}" style="color:#c9a84c;text-decoration:none;font-size:12px">Admin / Customer 360 →</a>
  </div>
</div>`,
    }
  }

  // first_value
  const d = data.details || {}
  const ttfvStr = d.ttfv_seconds != null ? `${d.ttfv_seconds}s` : "—"
  return {
    subject: `[CVitae] ${name} alcanzó su primer valor`,
    html: `
<div style="font-family:monospace;background:#0a0a0a;color:#f5f0e8;padding:20px;border-radius:8px;max-width:520px">
  <div style="color:#c9a84c;font-weight:bold;margin-bottom:12px">FIRST VALUE — CVitae</div>
  <div style="color:#a0a0a0;line-height:1.8">
    <div><strong style="color:#f5f0e8">Nombre:</strong> ${name}</div>
    <div><strong style="color:#f5f0e8">Email:</strong> ${data.userEmail}</div>
    <div><strong style="color:#f5f0e8">Evento activador:</strong> ${d.event_type || "primera activación"}</div>
    <div><strong style="color:#f5f0e8">TTFV:</strong> ${ttfvStr}</div>
    <div><strong style="color:#f5f0e8">Timestamp:</strong> ${ts}</div>
    ${d.founding_status ? `<div><strong style="color:#f5f0e8">Founding:</strong> ${d.founding_status}</div>` : ""}
    ${d.plan ? `<div><strong style="color:#f5f0e8">Plan:</strong> ${d.plan}</div>` : ""}
  </div>
  <div style="margin-top:16px">
    <a href="${adminLink}" style="color:#c9a84c;text-decoration:none;font-size:12px">Admin / Customer 360 →</a>
  </div>
</div>`,
  }
}

// Sends an idempotent milestone alert to the founder.
// Idempotency key: founder_<event>:<userId>:v1 — logged in email_log.
// Failure is logged but does NOT affect product state.
export async function notifyFounderMilestone({
  event,
  userId,
  userEmail,
  userName,
  timestamp,
  details,
  supabaseAdmin,
  resend,
}: {
  event: FounderMilestoneEvent
  userId: string
  userEmail: string
  userName?: string
  timestamp?: string
  details?: Record<string, any>
  supabaseAdmin: SupabaseClient
  resend: Resend
}): Promise<{ ok: boolean; already_sent?: boolean }> {
  const idempotencyKey = `founder_${event}:${userId}:v1`
  const now = timestamp || new Date().toISOString()

  const { data: existing } = await supabaseAdmin
    .from("email_log")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
  if (existing) return { ok: true, already_sent: true }

  const { subject, html } = buildFounderMilestoneEmail(event, {
    userEmail,
    userName,
    timestamp: now,
    details,
  })

  let status: "sent" | "failed" = "sent"
  let resendId: string | null = null

  try {
    const result = await resend.emails.send({
      from: "CVitae Sistema <noreply@cvitae.lat>",
      to: ["contacto@cvitae.lat"],
      subject,
      html,
    })
    resendId = (result.data as any)?.id || null
  } catch (err: any) {
    console.error("[founding-mailer] notifyFounderMilestone send error", err.message)
    status = "failed"
  }

  const { error: logError } = await supabaseAdmin.from("email_log").insert({
    user_id: userId,
    template: `founder_milestone_${event}`,
    recipient_email: "contacto@cvitae.lat",
    subject,
    status,
    resend_id: resendId,
    idempotency_key: idempotencyKey,
    metadata: { event, milestone: true },
  })
  if (logError) console.error("[founding-mailer] notifyFounderMilestone log error", logError.message)

  return { ok: status === "sent" }
}
