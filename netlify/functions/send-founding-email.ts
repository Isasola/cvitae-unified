// netlify/functions/send-founding-email.ts
// Admin-authenticated endpoint to send Founding Beta emails.
// All email logic lives in lib/founding-mailer — no duplication.

import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"
import { Resend } from "resend"
import { FOUNDING_TEMPLATES, sendFoundingEmail } from "./lib/founding-mailer"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD not configured")

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const password = event.headers['x-admin-password'] || event.headers['authorization']?.replace('Bearer ', '')
  if (password !== ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }
  }

  let body: Record<string, any> = {}
  try { body = JSON.parse(event.body || "{}") } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido" }) }
  }

  const { template, user_id, recipient_email, recipient_name, force } = body

  if (!template || !FOUNDING_TEMPLATES[template]) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Template inválido: ${template}. Válidos: ${Object.keys(FOUNDING_TEMPLATES).join(", ")}` })
    }
  }
  if (!user_id) {
    return { statusCode: 400, body: JSON.stringify({ error: "user_id requerido" }) }
  }

  const supabase = makeSupabaseAdmin()
  const resend = new Resend(process.env.RESEND_API_KEY)

  const result = await sendFoundingEmail({
    template,
    userId: user_id,
    recipientEmail: recipient_email,
    recipientName: recipient_name,
    force: force || false,
    supabaseAdmin: supabase,
    resend,
  })

  if (result.already_sent) {
    return {
      statusCode: 409,
      body: JSON.stringify({
        error: `Ya se envió el template "${template}" a este usuario. Usá force=true para reenviar.`,
        already_sent_at: result.already_sent_at,
      })
    }
  }

  if (!result.ok) {
    const isUserError = result.error?.includes("resolver") || result.error?.includes("inválido")
    return { statusCode: isUserError ? 400 : 500, body: JSON.stringify({ error: result.error }) }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
