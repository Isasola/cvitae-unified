import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" }
  const { email, source } = JSON.parse(event.body || "{}")
  if (!email) return { statusCode: 400, body: "Email requerido" }

  const supabase = makeSupabaseAdmin()
  const { error } = await supabase.from("newsletter_subscribers").insert({ email, source })
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  return { statusCode: 200, body: JSON.stringify({ success: true }) }
}

export { handler }
