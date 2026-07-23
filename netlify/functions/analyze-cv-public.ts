import { Handler } from "@netlify/functions"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"

// AWS Bedrock requires the version suffix for Claude Haiku 4.5 inference profiles.
const MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

// In-memory rate limit: 10 requests/hour per IP
const ipCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10
const WINDOW_MS = 60 * 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipCounts.get(ip)
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

function extractJSON(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlock) return JSON.parse(codeBlock[1].trim())
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return JSON.parse(jsonMatch[0])
  return JSON.parse(text.trim())
}

async function invokeModel(system: string, userPrompt: string): Promise<string> {
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  })
  const response = await bedrockClient.send(command)
  const result = JSON.parse(new TextDecoder().decode(response.body))
  return result.content[0]?.text ?? ""
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const ip = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown"
  if (!checkRateLimit(ip)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: "Límite de análisis alcanzado. Volvé en una hora." }),
    }
  }

  try {
    const { cvText } = JSON.parse(event.body || "{}")
    if (!cvText?.trim() || cvText.trim().length < 50) {
      return { statusCode: 400, body: JSON.stringify({ error: "El texto del CV es muy corto o está vacío." }) }
    }

    const prompt = `Analizá el siguiente CV como experto en reclutamiento y empleabilidad en Latinoamérica.

Primero extraé los datos clave del CV, luego evaluá su calidad técnica para sistemas ATS.

CV:
${cvText.slice(0, 4000)}

Respondé ÚNICAMENTE con JSON válido con esta estructura exacta:
{
  "atsScore": <número 0-100, basado en: formato, keywords, logros cuantificados, estructura, claridad>,
  "nombre": "<nombre detectado o null>",
  "rolDetectado": "<título profesional principal detectado>",
  "strengths": ["<fortaleza concreta 1>", "<fortaleza concreta 2>", "<fortaleza concreta 3>"],
  "criticalImprovements": ["<mejora crítica 1>", "<mejora crítica 2>", "<mejora crítica 3>"],
  "missingKeywords": ["<keyword ATS importante ausente 1>", "<keyword 2>", "<keyword 3>"],
  "recommendation": "<1-2 oraciones directas sobre el estado del CV y el próximo paso más importante>"
}`

    const responseText = await invokeModel(
      "Sos un experto en reclutamiento y optimización de CVs para el mercado latinoamericano. Respondés ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.",
      prompt
    )

    const result = extractJSON(responseText)
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result),
    }
  } catch (error: any) {
    console.error("analyze-cv-public error:", error.message)
    return { statusCode: 500, body: JSON.stringify({ error: "Error al analizar el CV. Intentá de nuevo." }) }
  }
}

export { handler }
