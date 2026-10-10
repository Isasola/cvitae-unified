// ⚠️ Netlify Free: límite 10s. Para migrar a Lambda: scripts/deploy-lambda.sh
import { Handler } from "@netlify/functions"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { observeAiCall } from './lib/ai-telemetry'
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
  const response = await observeAiCall({ provider: 'bedrock', model: MODEL_ID, feature: 'candidate_comparison', trigger: 'user_action', actor: 'user' }, () => bedrockClient.send(command))
  const result = JSON.parse(new TextDecoder().decode(response.body))
  return result.content[0]?.text ?? ""
}

async function validateRecruiter(token: unknown) {
  if (typeof token !== "string" || !token.trim()) return null
  const { data, error } = await makeSupabaseAdmin()
    .from("recruiter_tokens")
    .select("id")
    .eq("access_token", token.trim())
    .eq("is_active", true)
    .eq("verification_status", "verified")
    .single()
  if (error && error.code !== 'PGRST116') throw new Error('RECRUITER_READ_FAILED')
  return data
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }
  try {
    const body = JSON.parse(event.body || "{}")
    const { token, mode, ids } = body

    // ── Modo batch_summary: recibe resúmenes ya procesados
    if (mode === 'batch_summary') {
      const tokenData = await validateRecruiter(token)
      if (!tokenData) {
        return { statusCode: 403, body: JSON.stringify({ error: "Token de empresa inválido o inactivo" }) }
      }
      const operationIds = body.operation_ids
      if (!Array.isArray(operationIds) || operationIds.length < 2 || operationIds.length > 30
        || operationIds.some((id: any) => typeof id !== 'string') || new Set(operationIds).size !== operationIds.length) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Seleccioná entre 2 y 30 operaciones propias distintas.' }) }
      }
      const { data: operations, error } = await makeSupabaseAdmin().from('recruiter_credit_operations')
        .select('operation_id,metadata,result').eq('recruiter_token_id', String(tokenData.id)).eq('status', 'completed').in('operation_id', operationIds)
      if (error) throw new Error('COMPARISON_READ_FAILED')
      if (!operations || operations.length !== operationIds.length) return { statusCode: 403, body: JSON.stringify({ error: 'Los análisis deben pertenecer a esta empresa y estar completados.' }) }
      const labels = new Set(operations.map((op: any) => String(op.metadata?.vacancy_label || '').trim()))
      if (labels.size !== 1 || labels.has('')) return { statusCode: 409, body: JSON.stringify({ error: 'Los análisis no comparten un contexto de puesto declarado.' }) }
      const jobTitle = [...labels][0]
      const candidates = operations.map((op: any) => ({ ...op.result, name: op.result?.candidateName || 'Candidato' }))
      if (candidates.some((c: any) => !Number.isFinite(c.fitScore) || !c.summary)) return { statusCode: 200, body: JSON.stringify({ abstained: true, finalRecommendation: 'Falta evidencia analizada para comparar.', interviewOrder: [] }) }
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
Comparación de análisis privados del mismo contexto declarado. No representa elegibilidad ni una decisión de contratación.

CANDIDATOS SELECCIONADOS:
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

    // ── Modo head_to_head: compara 2 candidatos específicos contra requisitos de la vacante
    if (mode === 'head_to_head') {
      if (!Array.isArray(body.application_ids) || body.application_ids.length !== 2
        || body.application_ids.some((id: any) => typeof id !== 'string' || !id)
        || new Set(body.application_ids).size !== 2 || typeof body.vacancy_id !== 'string' || !body.vacancy_id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Dos postulaciones distintas y su vacante son obligatorias.' }) }
      }
      if (typeof token !== 'string' || !token.trim()) {
        return { statusCode: 401, body: JSON.stringify({ error: "Token requerido" }) }
      }

      const supabase = makeSupabaseAdmin()

      // Validate token
      const tokenData = await validateRecruiter(token)

      if (!tokenData) {
        return { statusCode: 403, body: JSON.stringify({ error: "Token inválido" }) }
      }

      // Fetch applications and verify they belong to this recruiter's vacancies
      const { data: apps, error: appsError } = await supabase
        .from("vacancy_applications")
        .select("id, name, fit_score, ats_score, strengths, key_matches, key_gaps, ai_summary, recommendation, vacancy_id")
        .in("id", body.application_ids)
      if (appsError) throw new Error('APPLICATIONS_READ_FAILED')

      if (!apps || apps.length < 2) {
        return { statusCode: 400, body: JSON.stringify({ error: "No se encontraron los dos candidatos" }) }
      }

      if (!apps.every((app: any) => app.vacancy_id === body.vacancy_id)) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Ambas postulaciones deben corresponder a la vacante seleccionada.', reason: 'COMPARISON_SCOPE_MISMATCH' }) }
      }

      let vacancyContext = ""
      if (body.vacancy_id) {
        const { data: vac, error: vacError } = await supabase
          .from("recruiter_vacancies")
          .select("title, description, requirements, company")
          .eq("id", body.vacancy_id)
          .eq("recruiter_token_id", tokenData.id)
          .maybeSingle()
        if (vacError) throw new Error('VACANCY_READ_FAILED')
        if (!vac) return { statusCode: 403, body: JSON.stringify({ error: 'Sin acceso a esta vacante.' }) }
        if (vac) {
          vacancyContext = `\nPUESTO: ${vac.title} en ${vac.company}\nDESCRIPCIÓN: ${vac.description}\nREQUISITOS: ${vac.requirements}`
        }
      }
      if (apps.some((app: any) => app.fit_score == null || !app.ai_summary)) {
        return { statusCode: 200, body: JSON.stringify({ mode: 'head_to_head', abstained: true, verdict: 'Falta evidencia analizada. Revisá los CVs antes de comparar.' }) }
      }

      const [a, b] = apps
      const prompt = `Comparación directa entre dos candidatos${vacancyContext ? ` para el puesto:${vacancyContext}` : ""}.

CANDIDATO A — ${a.name}:
- Fit: ${a.fit_score ?? 'sin analizar'}/100 | ATS: ${a.ats_score ?? 'sin analizar'}/100
- Decisión previa: ${a.recommendation ?? 'sin análisis'}
- Fortalezas: ${(a.strengths as string[] | null)?.join(', ') || '—'}
- Skills que encajan: ${(a.key_matches as string[] | null)?.join(', ') || '—'}
- Skills que faltan: ${(a.key_gaps as string[] | null)?.join(', ') || '—'}
- Resumen: ${a.ai_summary || '—'}

CANDIDATO B — ${b.name}:
- Fit: ${b.fit_score ?? 'sin analizar'}/100 | ATS: ${b.ats_score ?? 'sin analizar'}/100
- Decisión previa: ${b.recommendation ?? 'sin análisis'}
- Fortalezas: ${(b.strengths as string[] | null)?.join(', ') || '—'}
- Skills que encajan: ${(b.key_matches as string[] | null)?.join(', ') || '—'}
- Skills que faltan: ${(b.key_gaps as string[] | null)?.join(', ') || '—'}
- Resumen: ${b.ai_summary || '—'}

Respondé ÚNICAMENTE con JSON válido:
{
  "winner": "${a.name}" | "${b.name}" | "empate",
  "verdict": "2-3 oraciones directas sobre quién gana y por qué",
  "a": {
    "name": "${a.name}",
    "advantage": "qué tiene A que B no tiene",
    "weakness": "qué le falta a A comparado con B"
  },
  "b": {
    "name": "${b.name}",
    "advantage": "qué tiene B que A no tiene",
    "weakness": "qué le falta a B comparado con A"
  },
  "hire_recommendation": "aspectos que la persona reclutadora debe corroborar en entrevista; nunca decidir contratación ni rechazo"
}`

      const responseText = await invokeModel(
        "Sos un director de RRHH experto. Respondés ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.",
        prompt,
        1200
      )

      return { statusCode: 200, body: JSON.stringify({ mode: 'head_to_head', ...extractJSON(responseText) }) }
    }

    // ── Modo legacy: comparar por IDs del historial
    if (!Array.isArray(ids) || ids.length < 2 || ids.length > 30 || new Set(ids).size !== ids.length || ids.some((id: any) => typeof id !== 'string')) {
      return { statusCode: 400, body: JSON.stringify({ error: "Se necesitan al menos 2 CVs para comparar" }) }
    }

    const supabase = makeSupabaseAdmin()
    const tokenData = await validateRecruiter(token)
    if (!tokenData) {
      return { statusCode: 403, body: JSON.stringify({ error: "Token de empresa inválido o inactivo" }) }
    }
    const { data: analyses, error: dbError } = await supabase
      .from("recruiter_analyses")
      .select("raw_cv_text, candidate_name, file_name, vacancy_label")
      .in("id", ids)
      .eq("token_id", tokenData.id)

    if (dbError || !analyses || analyses.length !== ids.length) {
      return { statusCode: 403, body: JSON.stringify({ error: "Uno o más CVs no pertenecen a esta empresa" }) }
    }
    const contexts = new Set(analyses.map((item: any) => String(item.vacancy_label || '').trim()))
    if (contexts.size !== 1 || contexts.has('')) return { statusCode: 409, body: JSON.stringify({ error: 'Seleccioná análisis del mismo puesto declarado.' }) }
    if (analyses.some((item: any) => !item.raw_cv_text?.trim())) return { statusCode: 200, body: JSON.stringify({ abstained: true, top3: [], finalRecommendation: 'Falta evidencia para comparar.' }) }

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
    return { statusCode: 503, body: JSON.stringify({ error: 'No pudimos completar la comparación. Reintentá.', reason: 'COMPARISON_UNAVAILABLE' }) }
  }
}

export { handler }
