import { Handler } from "@netlify/functions"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { makeSupabaseAdmin } from "./_supabase"

const MODEL_ID = "global.anthropic.claude-sonnet-4-6"
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

function extractJSON(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlock) return JSON.parse(codeBlock[1].trim())
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return JSON.parse(jsonMatch[0])
  return JSON.parse(text.trim())
}

async function invokeModel(system: string | null, userPrompt: string, maxTokens: number): Promise<string> {
  const body: any = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: userPrompt }],
  }
  if (system) body.system = system

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  })
  const response = await bedrockClient.send(command)
  const result = JSON.parse(new TextDecoder().decode(response.body))
  return result.content[0]?.text ?? ""
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }
  try {
    const body = JSON.parse(event.body || "{}")
    const { token, mode, jobTitle, jobDescription, topN, candidates, ids } = body

    // ── Modo batch_summary: recibe resúmenes ya procesados
    if (mode === 'batch_summary' && candidates?.length >= 2) {
      const candidatesText = candidates.map((c: any, i: number) =>
        `Candidato ${i + 1}: ${c.name}
  - Fit: ${c.fitScore}/100 | ATS: ${c.atsScore}/100 | Decisión: ${c.recommendation}
  - Skills que encajan: ${c.keyMatches?.join(', ') || 'ninguno'}
  - Skills faltantes: ${c.keyGaps?.join(', ') || 'ninguno'}
  - Resumen: ${c.summary}`
      ).join('\n\n')

      const responseText = await invokeModel(
        "Sos un director de RRHH experto. Respondés ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.",
        `Sos un director de RRHH revisando candidatos para: "${jobTitle}".

DESCRIPCIÓN DEL PUESTO:
${jobDescription || 'No especificada'}

TOP ${topN || 5} CANDIDATOS:
${candidatesText}

Respondé ÚNICAMENTE con JSON:
{
  "finalRecommendation": "a quién entrevistar primero y por qué, mencionando nombres (2-4 oraciones)",
  "hiringInsight": "diagnóstico general del pool de candidatos (3-5 oraciones)",
  "interviewOrder": ["nombre 1", "nombre 2", "nombre 3"]
}`,
        1000
      )

      return { statusCode: 200, body: JSON.stringify(extractJSON(responseText)) }
    }

    // ── Modo legacy: comparar por IDs del historial
    if (!ids || !Array.isArray(ids) || ids.length < 2) {
      return { statusCode: 400, body: JSON.stringify({ error: "Se necesitan al menos 2 CVs para comparar" }) }
    }

    const supabase = makeSupabaseAdmin()
    const { data: analyses, error: dbError } = await supabase
      .from("recruiter_analyses")
      .select("raw_cv_text, candidate_name, file_name")
      .in("id", ids)

    if (dbError || !analyses) throw new Error("Error obteniendo los CVs del historial")

    const cvsString = analyses.map((a, i) =>
      `Candidato ${i + 1} (${a.candidate_name || a.file_name}):\n${a.raw_cv_text.substring(0, 2000)}`
    ).join("\n\n")

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

    const responseText = await invokeModel(null, prompt, 2000)
    return { statusCode: 200, body: JSON.stringify(extractJSON(responseText)) }

  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}

export { handler }
