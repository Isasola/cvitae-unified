import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const handler: Handler = async (event) => {
  const supabase = makeSupabaseAdmin()
  const { data } = await supabase.from("content_hub").select("*").eq("tipo", "oportunidad").eq("is_active", true).limit(50)
  return { statusCode: 200, body: JSON.stringify({ opportunities: data }) }
}

export { handler }
