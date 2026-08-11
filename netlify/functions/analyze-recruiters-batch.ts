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

async function analyzeOne(cvText: string, jobTitle: string, jobDescription: string, fileName: string): Promise<any> {
  const prompt = `Sos un reclutador experto evaluando un CV para el siguiente puesto.

PUESTO: ${jobTitle || 'No especificado'}
DESCRIPCIÓN:
${jobDescription || 'No especificada'}

CV DEL CANDIDATO:
${cvText}

Evaluá este CV en función del puesto. Respondé ÚNICAMENTE con JSON válido:
{
  "candidateName": "nombre detectado o null",
  "atsScore": <0-100, calidad general del CV>,
  "fitScore": <0-100, adecuación específica al puesto>,
  "recommendation": <"Llamar" si fitScore>=75, "Considerar" si fitScore>=50, "No llamar" si fitScore<50>,
  "summary": "3-4 líneas sobre el candidato y su adecuación al puesto",
  "strengths": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],
  "criticalImprovements": ["debilidad 1", "debilidad 2"],
  "keyMatches": ["skill que tiene Y el puesto requiere"],
  "keyGaps": ["skill que el puesto requiere Y NO tiene"]
}`

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1200,
      system: "Sos un reclutador experto latinoamericano. Respondés ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.",
      messages: [{ role: "user", content: prompt }],
    }),
  })

  const response = await bedrockClient.send(command)
  const result = JSON.parse(new TextDecoder().decode(response.body))
  const parsed = extractJSON(result.content[0]?.text ?? "{}")
  return { ...parsed, fileName }
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }
  try {
    const { token, cvTexts, jobTitle, jobDescription } = JSON.parse(event.body || "{}")

    if (typeof token !== "string" || !token.trim()) {
      return { statusCode: 401, body: JSON.stringify({ error: "Token de empresa requerido" }) }
    }

    const { data: recruiter } = await makeSupabaseAdmin()
      .from("recruiter_tokens")
      .select("id")
      .eq("access_token", token.trim())
      .eq("is_active", true)
      .eq("verification_status", "verified")
      .maybeSingle()

    if (!recruiter) {
      return { statusCode: 403, body: JSON.stringify({ error: "Empresa no verificada o acceso inactivo" }) }
    }

    if (!Array.isArray(cvTexts) || cvTexts.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "cvTexts array is required" }) }
    }

    if (cvTexts.length > 30) {
      return { statusCode: 400, body: JSON.stringify({ error: "Máximo 30 CVs por análisis" }) }
    }

    // Parallelizar todos los análisis — de ~90s secuencial a ~3s paralelo
    const invalidCv = cvTexts.some(({ text, fileName }: { text?: unknown; fileName?: unknown }) =>
      typeof text !== "string" || !text.trim() || text.length > 20_000 ||
      typeof fileName !== "string" || fileName.length > 240
    )
    if (invalidCv) {
      return { statusCode: 400, body: JSON.stringify({ error: "Cada CV debe incluir texto válido (máximo 20.000 caracteres) y nombre de archivo" }) }
    }

    const results: PromiseSettledResult<any>[] = new Array(cvTexts.length)
    let cursor = 0
    const workers = Array.from({ length: Math.min(3, cvTexts.length) }, async () => {
      while (cursor < cvTexts.length) {
        const index = cursor++
        const { text, fileName } = cvTexts[index]
        try {
          results[index] = { status: "fulfilled", value: await analyzeOne(text, jobTitle, jobDescription, fileName) }
        } catch (reason) {
          results[index] = { status: "rejected", reason }
        }
      }
    })
    await Promise.all(workers)

    const analyzed = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value
      return {
        fileName: cvTexts[i]?.fileName || `CV-${i + 1}`,
        candidateName: null,
        atsScore: 0,
        fitScore: 0,
        recommendation: "No llamar",
        summary: "Error al procesar este CV.",
        strengths: [],
        criticalImprovements: [],
        keyMatches: [],
        keyGaps: [],
        error: true,
      }
    })

    // Ordenar por fitScore desc
    analyzed.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0))

    return {
      statusCode: 200,
      body: JSON.stringify({ results: analyzed, total: analyzed.length }),
    }
  } catch (error: any) {
    console.error("analyze-recruiters-batch error:", error.message)
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}

export { handler }
