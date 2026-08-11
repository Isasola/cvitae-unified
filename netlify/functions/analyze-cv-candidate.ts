// ⚠️ Netlify Free: límite 10s. Para migrar a Lambda: scripts/deploy-lambda.sh
import { Handler } from "@netlify/functions"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { makeSupabaseAdmin } from "./_supabase"

// AWS Bedrock requires the version suffix for Claude Haiku 4.5 inference profiles.
const MODEL_ID_EXTRACT = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
const MODEL_ID_ANALYZE = "global.anthropic.claude-sonnet-4-6"
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

async function invokeModel(system: string, userPrompt: string, maxTokens: number, modelId?: string): Promise<string> {
  const command = new InvokeModelCommand({
    modelId: modelId || MODEL_ID_ANALYZE,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
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
  try {
    const { cvText, mode, jobTitle, jobDescription, recruiterToken } = JSON.parse(event.body || "{}")
    if (!cvText?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "CV text is required" }) }
    }
    if (cvText.trim().length > 50_000) {
      return { statusCode: 400, body: JSON.stringify({ error: "El texto del CV supera el límite permitido" }) }
    }

    if (mode === 'analyze' || mode === 'batch_analyze') {
      if (!recruiterToken?.trim()) {
        return { statusCode: 401, body: JSON.stringify({ error: "Token de empresa requerido" }) }
      }
      const { data: recruiter } = await makeSupabaseAdmin()
        .from("recruiter_tokens")
        .select("id, token_balance")
        .eq("access_token", recruiterToken.trim())
        .eq("is_active", true)
        .eq("verification_status", "verified")
        .single()
      if (!recruiter) {
        return { statusCode: 403, body: JSON.stringify({ error: "Token de empresa inválido o inactivo" }) }
      }
      if ((recruiter.token_balance ?? 0) <= 0) {
        return { statusCode: 402, body: JSON.stringify({ error: "Sin créditos disponibles" }) }
      }
    }

    let prompt = ""

    if (mode === 'extract') {
      prompt = `Extraé la información del siguiente CV. Respondé ÚNICAMENTE con JSON válido, sin texto extra ni markdown.
{
  "full_name": "nombre completo o null",
  "email": "email o null",
  "professional_title": "título profesional",
  "skills": ["skill1", "skill2"],
  "location": "ciudad, país o null",
  "seniority": "junior|semi-senior|senior",
  "education": [{ "institution": "...", "degree": "...", "year": 2020 }],
  "experience": [{ "company": "...", "position": "...", "years": 2, "achievements": ["..."] }],
  "languages": [{ "language": "...", "level": "básico|intermedio|avanzado|nativo" }]
}
CV:
${cvText}`

    } else if (mode === 'batch_analyze') {
      prompt = `Sos un reclutador experto evaluando un CV para el siguiente puesto.

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
  "criticalImprovements": ["debilidad 1", "debilidad 2", "debilidad 3"],
  "keyMatches": ["skill que tiene Y el puesto requiere", ...máx 5],
  "keyGaps": ["skill que el puesto requiere Y NO tiene", ...máx 5]
}`

    } else {
      prompt = `Analizá este CV como reclutador experto. Respondé ÚNICAMENTE con JSON válido:
{
  "atsScore": <0-100>,
  "recommendation": <"Llamar"|"Considerar"|"No llamar">,
  "summary": "máximo 4 líneas resumiendo el perfil",
  "strengths": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],
  "criticalImprovements": ["mejora 1", "mejora 2", "mejora 3"]
}
CV:
${cvText}`
    }

    const responseText = await invokeModel(
      "Sos un reclutador experto latinoamericano. Respondés ÚNICAMENTE con JSON válido y bien formateado, sin texto adicional, sin markdown.",
      prompt,
      mode === 'batch_analyze' ? 1500 : 1000,
      mode === 'extract' ? MODEL_ID_EXTRACT : MODEL_ID_ANALYZE
    )
    const result = extractJSON(responseText)
    return { statusCode: 200, body: JSON.stringify(result) }

  } catch (error: any) {
    console.error("analyze-cv-candidate error:", error.message)
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}

export { handler }
