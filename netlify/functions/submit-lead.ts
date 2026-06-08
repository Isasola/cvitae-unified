import { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" }

  try {
    const { name, email, company } = JSON.parse(event.body || "{}")
    if (!email || !company) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email y empresa requeridos" }) }
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase.from("recruiter_leads").insert({
      name: name || null,
      email: email.trim().toLowerCase(),
      company_name: company.trim(),
      source: "landing_b2b",
    })

    if (error) {
      if (error.code === "23505") {  // duplicado
        return { statusCode: 200, body: JSON.stringify({ success: false, error: "Este email ya está registrado." }) }
      }
      throw error
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
