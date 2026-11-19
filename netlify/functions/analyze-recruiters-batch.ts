import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

// The browser batch flow intentionally sends one idempotent operation per CV to
// analyze-cv-candidate. Keeping the old all-in-one endpoint active would bypass
// the credit ledger and make retries chargeable more than once.
const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  try {
    const { token } = JSON.parse(event.body || "{}")
    if (typeof token !== "string" || !token.trim()) {
      return { statusCode: 401, body: JSON.stringify({ error: "Token de empresa requerido" }) }
    }

    const { data: recruiter } = await makeSupabaseAdmin()
      .from("recruiter_tokens")
      .select("id")
      .eq("access_token", token.trim())
      .eq("is_active", true)
      .eq("verification_status", "verified")
      .maybeSingle()

    if (!recruiter) {
      return { statusCode: 403, body: JSON.stringify({ error: "Empresa no verificada o acceso inactivo" }) }
    }

    return {
      statusCode: 410,
      body: JSON.stringify({
        error: "Endpoint masivo anterior desactivado. Usá una operación idempotente por CV desde /empresas/masivo.",
      }),
    }
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Solicitud inválida" }) }
  }
}

export { handler }
