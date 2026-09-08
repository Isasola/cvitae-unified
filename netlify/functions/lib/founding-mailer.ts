// netlify/functions/lib/founding-mailer.ts
// Shared email/notification logic for the Founding Beta program.
// Direct Resend + Supabase operations — no internal HTTP self-calls.
// Imported by founding-beta-action, send-founding-email, notify-founder-signup.

import type { SupabaseClient } from "@supabase/supabase-js"
import { Resend } from "resend"

export const FOUNDING_TEMPLATES: Record<string, { subject: string; fromName: string; fromAddress: string }> = {
  "founding_welcome_v1": {
    subject: "Ya sos parte del Founding 50 — y quiero escucharte",
    fromName: "Isaias de CVitae",
    fromAddress: "contacto@cvitae.lat",
  },
  "founding_offer_v1": {
    subject: "Te escribo yo, el fundador de CVitae",
    fromName: "Isaias de CVitae",
    fromAddress: "contacto@cvitae.lat",
  },
}

export function buildFoundingEmailHtml(template: string, data: Record<string, any>): string {
  const name = data.name || "usuario"

  const base = (content: string) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0f0f0f;color:#e8e4dc;font-family:Georgia,serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:48px 28px">
    ${content}
    <div style="margin-top:40px;padding-top:24px;border-top:1px solid #1e1e1e">
      <p style="color:#444;font-size:11px;line-height:1.7;margin:0">
        Isaias Sola · Fundador de CVitae<br>
        <a href="https://cvitae.lat" style="color:#444;text-decoration:none">cvitae.lat</a> · Paraguay
      </p>
    </div>
  </div>
</body>
</html>`

  if (template === "founding_offer_v1") {
    return base(`
    <p style="color:#c9a84c;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 28px">Founding 50 · CVitae</p>
    <p style="font-size:18px;color:#e8e4dc;margin:0 0 24px;line-height:1.5">Hola ${name},</p>
    <p style="color:#a0a0a0;line-height:1.85;margin:0 0 18px;font-size:15px">
      Te escribo yo directamente. Soy Isaias, el fundador de CVitae.
    </p>
    <p style="color:#a0a0a0;line-height:1.85;margin:0 0 18px;font-size:15px">
      Vi que te registraste y creaste tu perfil. Quería agradecerte personalmente por ser de los primeros
      en probar esto, todavía estamos construyendo y cada usuario que llega en esta etapa importa mucho.
    </p>
    <p style="color:#a0a0a0;line-height:1.85;margin:0 0 18px;font-size:15px">
      Por eso quiero darte acceso al <strong style="color:#c9a84c">Founding 50</strong>: los primeros 50 usuarios
      que van a tener 6 meses de Pro sin costo, sin tarjeta y sin auto-renovación. No es un descuento automático,
      es una invitación directa mía.
    </p>
    <p style="color:#a0a0a0;line-height:1.85;margin:0 0 32px;font-size:15px">
      Usá la plataforma, contame qué funciona y qué no. Si tenés alguna sugerencia o algo que no anduvo bien,
      respondé directamente a este correo — lo leo yo.
    </p>
    <a href="https://cvitae.lat/mi-carrera"
       style="background:#c9a84c;color:#0a0a0a;font-weight:700;font-size:14px;padding:14px 28px;text-decoration:none;display:inline-block;letter-spacing:0.03em">
      Ver mi oferta →
    </a>
    <p style="color:#a0a0a0;line-height:1.85;margin:32px 0 0;font-size:15px">
      Gracias de nuevo,<br>
      <strong style="color:#e8e4dc">Isaias</strong>
    </p>`)
  }

  if (template === "founding_welcome_v1") {
    return base(`
    <p style="color:#c9a84c;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;margin:0 0 28px">Founding 50 · CVitae</p>
    <p style="font-size:18px;color:#e8e4dc;margin:0 0 24px;line-height:1.5">Hola ${name},</p>
    <p style="color:#a0a0a0;line-height:1.85;margin:0 0 18px;font-size:15px">
      ¡Ya sos parte del Founding 50 de CVitae!
    </p>
    <p style="color:#a0a0a0;line-height:1.85;margin:0 0 18px;font-size:15px">
      Tus <strong style="color:#c9a84c">6 meses de Pro están activados desde hoy</strong>.
      Sin tarjeta, sin renovación automática, sin letra chica.
    </p>
    <p style="color:#a0a0a0;line-height:1.85;margin:0 0 18px;font-size:15px">
      Siendo uno de los primeros 50, tu experiencia con la plataforma es la que más me importa ahora mismo.
      Si algo no funciona, si hay algo que esperabas y no encontraste, o si simplemente se te ocurre algo que
      haría esto mejor — respondé este correo. Lo leo yo personalmente.
    </p>
    <p style="color:#a0a0a0;line-height:1.85;margin:0 0 32px;font-size:15px">
      Gracias por estar en esto desde el principio.
    </p>
    <a href="https://cvitae.lat/mi-carrera"
       style="background:#c9a84c;color:#0a0a0a;font-weight:700;font-size:14px;padding:14px 28px;text-decoration:none;display:inline-block;letter-spacing:0.03em">
      Ir a mi carrera →
    </a>
    <p style="color:#a0a0a0;line-height:1.85;margin:32px 0 0;font-size:15px">
      <strong style="color:#e8e4dc">Isaias</strong>
    </p>`)
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
