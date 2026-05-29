import { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" }
  const { email, balance, plan } = JSON.parse(event.body || "{}")
  const token = `REC-${Math.random().toString(36).substring(2,8).toUpperCase()}-${new Date().getFullYear()}`

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await supabase.from("recruiter_tokens").insert([{
    email, token_balance: balance, access_token: token, plan_type: plan, is_active: true
  }])
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  return { statusCode: 200, body: JSON.stringify({ token }) }
}

export { handler }
