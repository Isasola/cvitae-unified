import { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" }

  const SUPABASE_URL = process.env.SUPABASE_URL!
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { action, orderId } = JSON.parse(event.body || "{}")

  try {
    if (action === "list") {
      const { data } = await supabase.from("pedidos").select("*").order("fecha_creacion", { ascending: false })
      return { statusCode: 200, body: JSON.stringify({ orders: data }) }
    }
    if (action === "approve") {
      await supabase.from("pedidos").update({ status: "approved", estado: "habilitado" }).eq("id", orderId)
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }
    if (action === "delete") {
      await supabase.from("pedidos").delete().eq("id", orderId)
      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
  return { statusCode: 400, body: JSON.stringify({ error: "Acción desconocida" }) }
}

export { handler }
