import { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const handler: Handler = async (event) => {
  const { token } = JSON.parse(event.body || "{}")
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await supabase.from("recruiter_tokens").select("*").eq("access_token", token).eq("is_active", true).single()
  if (data && data.token_balance > 0) return { statusCode: 200, body: JSON.stringify({ valid: true, balance: data.token_balance }) }
  return { statusCode: 200, body: JSON.stringify({ valid: false }) }
}

export { handler }
