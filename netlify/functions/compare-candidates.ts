import { Handler } from "@netlify/functions"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { ids, token } = JSON.parse(event.body || "{}")
    if (!ids || !Array.isArray(ids) || ids.length < 2) {
      return { statusCode: 400, body: JSON.stringify({ error: "Se necesitan al menos 2 CVs para comparar" }) }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada")

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Buscar los textos de los CVs seleccionados
    const { data: analyses, error: dbError } = await supabase
      .from("recruiter_analyses")
      .select("raw_cv_text, candidate_name, file_name")
      .in("id", ids)

    if (dbError || !analyses) throw new Error("Error obteniendo los CVs del historial")

    const client = new Anthropic({ apiKey })
    let cvsString = analyses.map((a, i) => `Candidato ${i+1} (${a.candidate_name || a.file_name}):\n${a.raw_cv_text.substring(0, 2000)}`).join("\n\n")

    const prompt = `Compará los siguientes ${analyses.length} CVs y seleccioná los 3 mejores. Para cada uno de los 3, indicá:
- nombre del candidato (si se detecta)
- score relativo (0-100)
- fortalezas clave
- por qué fue seleccionado
- una recomendación final sobre a cuál entrevistar primero y por qué.

Devolvé SOLO el JSON con este formato exacto:
{
  "top3": [
    { "name": "...", "score": 85, "strengths": ["...", "..."], "reason": "..." },
    ...
  ],
  "finalRecommendation": "Entrevistar primero a X porque ..."
}

${cvsString}`

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = responseText.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)

    return { statusCode: 200, body: JSON.stringify(result) }
  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}

export { handler }
