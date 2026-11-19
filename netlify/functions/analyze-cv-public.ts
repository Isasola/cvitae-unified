import { Handler } from "@netlify/functions"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { observeAiCall } from './lib/ai-telemetry'
import {
  clientIp,
  consumeRateLimit,
  jsonResponse,
  rateLimitHeaders,
  rejectInvalidOrigin,
  securityHeaders,
} from "./lib/b2c-security"

// AWS Bedrock requires the version suffix for Claude Haiku 4.5 inference profiles.
const MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

const RATE_LIMIT = 10
const WINDOW_SECONDS = 60 * 60

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
  const response = await observeAiCall({ provider: 'bedrock', model: MODEL_ID, feature: 'public_cv_analysis', trigger: 'user_action', actor: 'user' }, () => bedrockClient.send(command))
  const result = JSON.parse(new TextDecoder().decode(response.body))
  return result.content[0]?.text ?? ""
}

const handler: Handler = async (event) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: securityHeaders(event), body: "" }
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(event, 405, { error: "Método no permitido" })
  }

  try {
    const rateLimit = await consumeRateLimit({
      scope: "b2c-public-cv-analysis",
      subject: clientIp(event),
      limit: RATE_LIMIT,
      windowSeconds: WINDOW_SECONDS,
    })
    if (!rateLimit.allowed) {
      return jsonResponse(
        event,
        429,
        { error: "Límite de análisis alcanzado. Volvé a intentarlo más tarde." },
        rateLimitHeaders(rateLimit),
      )
    }

    const { cvText } = JSON.parse(event.body || "{}")
    if (!cvText?.trim() || cvText.trim().length < 50) {
      return jsonResponse(event, 400, { error: "El texto del CV es muy corto o está vacío." })
    }
    if (cvText.trim().length > 50_000) {
      return jsonResponse(event, 413, { error: "El texto del CV supera el límite permitido." })
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
    return jsonResponse(event, 200, result)
  } catch (error: any) {
    console.error("analyze-cv-public error:", error.message)
    const unavailable = String(error?.message || "").startsWith("Rate limit unavailable")
    return jsonResponse(event, unavailable ? 503 : 500, {
      error: unavailable
        ? "El servicio está temporalmente ocupado. Intentá nuevamente en unos minutos."
        : "Error al analizar el CV. Intentá de nuevo.",
    })
  }
}

export { handler }
