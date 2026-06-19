import { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const handler: Handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await supabase.from("content_hub").select("*").eq("tipo", "oportunidad").eq("is_active", true).limit(50)
  return { statusCode: 200, body: JSON.stringify({ opportunities: data }) }
}

export { handler }
