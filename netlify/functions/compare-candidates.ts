import { Handler } from "@netlify/functions"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"

function extractJSON(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlock) return JSON.parse(codeBlock[1].trim())
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return JSON.parse(jsonMatch[0])
  return JSON.parse(text.trim())
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }
  try {
    const body = JSON.parse(event.body || "{}")
    const { token, mode, jobTitle, jobDescription, topN, candidates, ids } = body
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada")
    const client = new Anthropic({ apiKey })

    // ── Modo batch_summary: recibe resúmenes ya procesados
    if (mode === 'batch_summary' && candidates?.length >= 2) {
      const candidatesText = candidates.map((c: any, i: number) =>
        `Candidato ${i + 1}: ${c.name}
  - Fit: ${c.fitScore}/100 | ATS: ${c.atsScore}/100 | Decisión: ${c.recommendation}
  - Skills que encajan: ${c.keyMatches?.join(', ') || 'ninguno'}
  - Skills faltantes: ${c.keyGaps?.join(', ') || 'ninguno'}
  - Resumen: ${c.summary}`
      ).join('\n\n')

      const message = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: "Sos un director de RRHH experto. Respondés ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.",
        messages: [{
          role: "user",
          content: `Sos un director de RRHH revisando candidatos para: "${jobTitle}".

DESCRIPCIÓN DEL PUESTO:
${jobDescription || 'No especificada'}

TOP ${topN || 5} CANDIDATOS:
${candidatesText}

Respondé ÚNICAMENTE con JSON:
{
  "finalRecommendation": "a quién entrevistar primero y por qué, mencionando nombres (2-4 oraciones)",
  "hiringInsight": "diagnóstico general del pool de candidatos (3-5 oraciones)",
  "interviewOrder": ["nombre 1", "nombre 2", "nombre 3"]
}`
        }],
      })

      const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
      return { statusCode: 200, body: JSON.stringify(extractJSON(responseText)) }
    }

    // ── Modo legacy: comparar por IDs del historial
    if (!ids || !Array.isArray(ids) || ids.length < 2) {
      return { statusCode: 400, body: JSON.stringify({ error: "Se necesitan al menos 2 CVs para comparar" }) }
    }

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: analyses, error: dbError } = await supabase
      .from("recruiter_analyses")
      .select("raw_cv_text, candidate_name, file_name")
      .in("id", ids)

    if (dbError || !analyses) throw new Error("Error obteniendo los CVs del historial")

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
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    return { statusCode: 200, body: JSON.stringify(extractJSON(responseText)) }

  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}

export { handler }
