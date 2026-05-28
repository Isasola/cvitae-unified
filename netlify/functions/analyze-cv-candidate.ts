import { Handler } from "@netlify/functions"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ""
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { cvText } = JSON.parse(event.body || "{}")
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

    const client = new Anthropic({ apiKey })
    if (!cvText || cvText.trim().length === 0) return { statusCode: 400, body: JSON.stringify({ error: "CV text is required" }) }

    const prompt = `Analizá este CV y devolvé un JSON con: atsScore (0-100), strengths (array strings), criticalImprovements (array strings). CV: ${cvText}`

    const message = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    })

    const content = message.content[0].type === 'text' ? message.content[0].text : ''
    return {
      statusCode: 200,
      body: content,
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    }
  }
}

export { handler }
