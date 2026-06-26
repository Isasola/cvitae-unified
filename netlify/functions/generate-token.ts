import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
  if (!ADMIN_PASSWORD) return { statusCode: 500, body: JSON.stringify({ error: "Server misconfigured" }) }

  try {
    const { password, email, token_balance, plan_type } = JSON.parse(event.body || "{}")

    if (password !== ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }
    }

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email is required" }) }
    }

    const token = `REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${new Date().getFullYear()}`

    const supabase = makeSupabaseAdmin()

    const { error } = await supabase.from("recruiter_tokens").insert([{
      email,
      token_balance: token_balance || 10,
      access_token: token,
      plan_type: plan_type || "starter",
      is_active: true
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
