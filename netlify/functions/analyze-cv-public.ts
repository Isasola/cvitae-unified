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
      max_tokens: 1600,
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

    const prompt = `Analizá este CV como consultor senior de RR.HH. El candidato quiere saber qué tan competitivo está y cómo mejorar para conseguir entrevistas.

RÚBRICA (atsScore 0-100):
- 90-100: CV ejemplar — estructura clara, verbos de acción, logros concretos, keywords del sector, sin errores
- 75-89: Buen CV — ordenado y legible, le faltan algunos detalles o métricas
- 60-74: CV promedio — cumple lo básico pero con secciones vagas o incompletas
- 40-59: Por debajo del promedio — secciones importantes débiles o información incompleta
- 0-39: CV con problemas graves — difícil de leer, datos clave ausentes, no apto para sistemas ATS

CV A ANALIZAR:
${cvText.slice(0, 6000)}

Respondé ÚNICAMENTE con JSON válido con esta estructura exacta:
{
  "atsScore": <0-100 según la rúbrica>,
  "nombre": "<nombre detectado o null>",
  "rolDetectado": "<título profesional principal detectado>",
  "careerLevel": <"junior"|"semi-senior"|"senior"|"gerencial">,
  "recommendation": <"Listo para postular"|"Mejorable"|"Necesita trabajo">,
  "strengths": ["<fortaleza concreta y específica 1>", "<fortaleza 2>", "<fortaleza 3>"],
  "criticalImprovements": [
    "<Área — qué hacer exactamente (ej: Resumen profesional — Agregá 3-4 líneas al inicio con tu perfil y lo que buscás)>",
    "<Área — qué hacer exactamente>",
    "<Área — qué hacer exactamente>"
  ],
  "missingKeywords": ["<keyword ATS relevante ausente 1>", "<keyword 2>", "<keyword 3>"],
  "quickWins": [
    "<mejora concreta que puede hacer hoy en 10 minutos>",
    "<mejora concreta 2>"
  ]
}`

    const responseText = await invokeModel(
      "Sos un consultor senior de Recursos Humanos especializado en el mercado laboral latinoamericano (con énfasis en Paraguay: Código del Trabajo Ley N° 213/93, IPS, MTESS). Conocés cómo evalúan los CVs los sistemas ATS y los reclutadores de pymes. Sabés qué diferencia a un candidato que consigue entrevistas del que no. Respondés ÚNICAMENTE con JSON válido y bien formateado, sin texto adicional, sin markdown, sin bloques de código.",
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
