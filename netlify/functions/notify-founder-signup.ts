// netlify/functions/notify-founder-signup.ts
// Admin/internal endpoint to notify the founder of a new B2C signup.
// Email logic lives in lib/founding-mailer — no duplication.

import { Handler } from "@netlify/functions"
import { Resend } from "resend"
import { notifyFounder } from "./lib/founding-mailer"

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

  const { user_email, user_name, signup_at, source } = body
  if (!user_email) {
    return { statusCode: 400, body: JSON.stringify({ error: "user_email requerido" }) }
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    await notifyFounder({ userEmail: user_email, userName: user_name, signupAt: signup_at, source, resend })
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error("[notify-founder-signup] error", err.message)
    return { statusCode: 500, body: JSON.stringify({ error: "Error al enviar notificación" }) }
  }
}
