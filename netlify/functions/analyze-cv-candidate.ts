// ⚠️ Netlify Free: límite 10s. Para migrar a Lambda: scripts/deploy-lambda.sh
import { Handler } from "@netlify/functions"
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { observeAiCall } from './lib/ai-telemetry'
import { makeSupabaseAdmin } from "./_supabase"
import {
  authenticatedUser,
  consumeRateLimit,
  jsonResponse,
  rateLimitHeaders,
  rejectInvalidOrigin,
  securityHeaders,
} from "./lib/b2c-security"

const MODEL_ID_EXTRACT = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
const MODEL_ID_ANALYZE = "global.anthropic.claude-sonnet-4-6"
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

const OPERATION_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/

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
  const response = await observeAiCall({ provider: 'bedrock', model: modelId || MODEL_ID_ANALYZE, feature: 'candidate_cv_analysis', trigger: 'user_action', actor: 'user' }, () => bedrockClient.send(command))
  const result = JSON.parse(new TextDecoder().decode(response.body))
  return result.content[0]?.text ?? ""
}

// ─── Multimodal file extraction ───────────────────────────────────────────────

const BEDROCK_IMAGE_FORMATS: Record<string, string> = {
  jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif',
}
const BEDROCK_DOC_FORMATS = ['pdf', 'docx', 'doc', 'txt', 'md', 'html', 'csv']

const EXTRACT_FILE_SYSTEM =
  "Sos un analista experto de CVs latinoamericano. Respondés ÚNICAMENTE con JSON válido y bien formateado, sin texto adicional, sin markdown."

const EXTRACT_FILE_PROMPT = `Analizá el documento o imagen de CV que se adjunta.

Respondé ÚNICAMENTE con el siguiente JSON (sin texto adicional, sin markdown):
{
  "rawText": "transcripción completa y fiel de todo el texto visible en el CV",
  "extracted": {
    "full_name": "nombre completo o null",
    "email": "email o null",
    "professional_title": "título o cargo profesional o null",
    "skills": ["skill1", "skill2"],
    "location": "ciudad, país o null",
    "seniority": "junior|semi-senior|senior",
    "education": [{"institution": "...", "degree": "...", "year": 2020}],
    "experience": [{"company": "...", "position": "...", "years": 2, "achievements": ["..."]}],
    "languages": [{"language": "...", "level": "básico|intermedio|avanzado|nativo"}]
  }
}

REGLAS CRÍTICAS para extracted:
- Usar SOLO información explícitamente visible en el documento
- Campos no encontrados: null o []
- NUNCA inventar, inferir ni completar información faltante`

async function extractFromFile(
  fileBase64: string,
  fileName: string,
): Promise<{ rawText: string; extracted: any }> {
  const ext = (fileName.toLowerCase().split('.').pop() ?? '').replace(/[^a-z0-9]/g, '')
  const imgFormat = BEDROCK_IMAGE_FORMATS[ext]
  const isDocFormat = BEDROCK_DOC_FORMATS.includes(ext)

  if (!imgFormat && !isDocFormat) throw new Error(`Formato no soportado para análisis multimodal: .${ext}`)

  let responseText: string

  if (imgFormat) {
    // Images → InvokeModelCommand with Anthropic native image block
    const command = new InvokeModelCommand({
      modelId: MODEL_ID_EXTRACT,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2500,
        system: EXTRACT_FILE_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: `image/${imgFormat}`, data: fileBase64 } },
            { type: 'text', text: EXTRACT_FILE_PROMPT },
          ],
        }],
      }),
    })
    const resp = await observeAiCall(
      { provider: 'bedrock', model: MODEL_ID_EXTRACT, feature: 'cv_file_extraction', trigger: 'user_action', actor: 'user' },
      () => bedrockClient.send(command),
    )
    const result = JSON.parse(new TextDecoder().decode(resp.body))
    responseText = result.content[0]?.text ?? ''
  } else {
    // Documents → ConverseCommand with DocumentBlock
    const docFmt = (['pdf', 'docx', 'doc', 'txt', 'md', 'html', 'csv'].includes(ext) ? ext : 'pdf') as any
    const command = new ConverseCommand({
      modelId: MODEL_ID_EXTRACT,
      messages: [{
        role: 'user',
        content: [
          { document: { format: docFmt, name: 'cv', source: { bytes: Buffer.from(fileBase64, 'base64') } } },
          { text: EXTRACT_FILE_PROMPT },
        ] as any,
      }],
      system: [{ text: EXTRACT_FILE_SYSTEM }],
      inferenceConfig: { maxTokens: 2500 },
    })
    const resp = await bedrockClient.send(command)
    responseText = ((resp.output?.message?.content ?? [])[0] as any)?.text ?? ''
  }

  const parsed = extractJSON(responseText)
  if (!parsed || typeof parsed !== 'object') throw new Error('El análisis multimodal no devolvió una respuesta válida')
  return {
    rawText: String(parsed.rawText || ''),
    extracted: parsed.extracted ?? parsed,
  }
}

// ──────────────────────────────────────────────────────────────────────────────

const handler: Handler = async (event) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: securityHeaders(event), body: "" }
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(event, 405, { error: "Método no permitido" })
  }
  let reservedRecruiter: { id: string; operationId: string; balance: number } | null = null
  try {
    const { cvText, mode, jobTitle, jobDescription, recruiterToken, fileName, operationId, fileBase64 } = JSON.parse(event.body || "{}")
    const recruiterMode = mode === 'analyze' || mode === 'batch_analyze'
    if (!recruiterMode) {
      if (mode != null && mode !== 'extract' && mode !== 'b2c_analyze' && mode !== 'extract_file') {
        return jsonResponse(event, 400, { error: "Modo de análisis inválido" })
      }
      const authResult = await authenticatedUser(event)
      if (!authResult.user) {
        return jsonResponse(event, 401, { error: authResult.error })
      }
      const rateLimit = await consumeRateLimit({
        scope: "b2c-authenticated-cv-analysis",
        subject: authResult.user.id,
        limit: 12,
        windowSeconds: 60 * 60,
      })
      if (!rateLimit.allowed) {
        return jsonResponse(
          event,
          429,
          { error: "Alcanzaste el límite temporal de análisis. Volvé a intentarlo más tarde." },
          rateLimitHeaders(rateLimit),
        )
      }
    }
    // ── extract_file mode: multimodal analysis from document or image ─────────
    if (mode === 'extract_file') {
      if (typeof fileBase64 !== 'string' || !fileBase64) {
        return jsonResponse(event, 400, { error: 'El archivo es obligatorio para este modo' })
      }
      if (fileBase64.length > 6_000_000) {
        return jsonResponse(event, 413, { error: 'El archivo supera el límite para análisis multimodal (≈4.5 MB)' })
      }
      const result = await extractFromFile(fileBase64, String(fileName || 'cv.pdf'))
      return jsonResponse(event, 200, result)
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!cvText?.trim()) {
      return jsonResponse(event, 400, { error: "El texto del CV es obligatorio" })
    }
    if (cvText.trim().length > 50_000) {
      return jsonResponse(event, 413, { error: "El texto del CV supera el límite permitido" })
    }

    if (mode === 'analyze' || mode === 'batch_analyze') {
      if (!recruiterToken?.trim()) {
        return jsonResponse(event, 401, { error: "Token de empresa requerido" })
      }
      if (typeof operationId !== 'string' || !OPERATION_ID_RE.test(operationId)) {
        return jsonResponse(event, 400, { error: "operation_id inválido o ausente" })
      }
      const { data: recruiter } = await makeSupabaseAdmin()
        .from("recruiter_tokens")
        .select("id, token_balance")
        .eq("access_token", recruiterToken.trim())
        .eq("is_active", true)
        .eq("verification_status", "verified")
        .single()
      if (!recruiter) {
        return jsonResponse(event, 403, { error: "Token de empresa inválido o inactivo" })
      }
      const { data: reservation, error: reservationError } = await makeSupabaseAdmin().rpc(
        "reserve_recruiter_credit",
        {
          p_recruiter_token_id: String(recruiter.id),
          p_operation_id: operationId,
          p_amount: 1,
          p_metadata: { mode, file_name: fileName || null, vacancy_label: jobTitle || null },
        },
      )
      if (reservationError) throw new Error(`No se pudo reservar el crédito: ${reservationError.message}`)
      if (reservation?.status === 'completed') {
        return jsonResponse(event, 200, {
          ...(reservation.result || {}), saved: true, idempotent: true, new_balance: reservation.balance,
        })
      }
      if (reservation?.status === 'insufficient') {
        return jsonResponse(event, 402, { error: "Sin créditos disponibles", new_balance: reservation.balance })
      }
      if (reservation?.status !== 'reserved') {
        return jsonResponse(event, 409, {
          error: "Esta operación ya está en curso o fue cerrada. Verificá el historial antes de reintentar.",
          operation_status: reservation?.status || 'unknown',
        })
      }
      reservedRecruiter = { id: String(recruiter.id), operationId, balance: Number(reservation.balance) }
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
    if (reservedRecruiter) {
      const { data: completion, error: completionError } = await makeSupabaseAdmin().rpc(
        "complete_recruiter_credit_operation",
        {
          p_recruiter_token_id: reservedRecruiter.id,
          p_operation_id: reservedRecruiter.operationId,
          p_analysis: {
            candidate_name: result.candidateName || fileName || null,
            file_name: fileName || null,
            ats_score: result.atsScore ?? result.fitScore ?? null,
            strengths: result.strengths || [],
            critical_improvements: result.criticalImprovements || [],
            vacancy_label: jobTitle || null,
            raw_cv_text: cvText,
          },
          p_result: result,
        },
      )
      if (completionError || completion?.status !== 'completed') {
        throw new Error(`No se pudo completar la operación: ${completionError?.message || completion?.status || 'unknown'}`)
      }
      return jsonResponse(event, 200, {
        ...(completion.result || result), saved: true, new_balance: completion.balance,
      })
    }
    return jsonResponse(event, 200, result)

  } catch (error: any) {
    let refundStatus: string | null = null
    if (reservedRecruiter) {
      const { data: refund, error: refundError } = await makeSupabaseAdmin().rpc(
        "refund_recruiter_credit_operation",
        {
          p_recruiter_token_id: reservedRecruiter.id,
          p_operation_id: reservedRecruiter.operationId,
          p_error_summary: String(error?.message || error).slice(0, 1000),
        },
      )
      if (refundError) console.error("recruiter credit refund error:", refundError.message)
      refundStatus = refund?.status || null
    }
    console.error("analyze-cv-candidate error:", error.message)
    const unavailable = String(error?.message || "").startsWith("Rate limit unavailable")
    return jsonResponse(event, unavailable ? 503 : 500, {
      error: unavailable
        ? "El servicio está temporalmente ocupado. Intentá nuevamente en unos minutos."
        : "No pudimos completar el análisis. Si se reservó un crédito, el sistema intentó devolverlo.",
      operation_status: refundStatus,
      retryable: unavailable || refundStatus === 'refunded',
    })
  }
}

export { handler }
