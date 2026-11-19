import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
  if (!ADMIN_PASSWORD) return { statusCode: 500, body: JSON.stringify({ error: "Server misconfigured" }) }

  try {
    const { password, email, company_name, token_balance, plan_type } = JSON.parse(event.body || "{}")

    if (password !== ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }
    }

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email is required" }) }
    }
    const companyName = String(company_name || '').trim()
    if (companyName.length < 2 || companyName.length > 240) {
      return { statusCode: 400, body: JSON.stringify({ error: "Nombre de empresa requerido (2–240 caracteres)" }) }
    }

    const token = `REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${new Date().getFullYear()}`

    const supabase = makeSupabaseAdmin()

    const { error } = await supabase.from("recruiter_tokens").insert([{
      email,
      company_name: companyName,
      token_balance: token_balance || 10,
      access_token: token,
      plan_type: plan_type || "starter",
      is_active: true,
      verification_status: "verified",
    }])

    if (error) {
      console.error("Supabase insert error:", error)
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    }

    return { statusCode: 200, body: JSON.stringify({ token }) }

  } catch (error: any) {
    console.error("generate-token error:", error)
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Internal server error" }) }
  }
}

export { handler }
