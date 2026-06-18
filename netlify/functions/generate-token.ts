import { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { email, token_balance, plan_type } = JSON.parse(event.body || "{}")
    const token = `REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${new Date().getFullYear()}`

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
    const { error } = await supabase.from("recruiter_tokens").insert([{
      email,
      token_balance: token_balance || 10,
      access_token: token,
      plan_type: plan_type || "starter",
      is_active: true
    }])

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    return { statusCode: 200, body: JSON.stringify({ token }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Error interno" }) }
  }
}

export { handler }
