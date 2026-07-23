// ⚠️ Netlify Free: límite 10s. Para migrar a Lambda: scripts/deploy-lambda.sh
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

async function validateRecruiter(token: unknown) {
  if (typeof token !== "string" || !token.trim()) return null
  const { data } = await makeSupabaseAdmin()
    .from("recruiter_tokens")
    .select("id")
    .eq("access_token", token.trim())
    .eq("is_active", true)
    .single()
  return data
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
      const tokenData = await validateRecruiter(token)
      if (!tokenData) {
        return { statusCode: 403, body: JSON.stringify({ error: "Token de empresa inválido o inactivo" }) }
      }
      if (candidates.length > 30) {
        return { statusCode: 400, body: JSON.stringify({ error: "Máximo 30 candidatos por comparación" }) }
      }
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

    // ── Modo head_to_head: compara 2 candidatos específicos contra requisitos de la vacante
    if (mode === 'head_to_head' && body.application_ids?.length === 2) {
      if (!token?.trim()) {
        return { statusCode: 401, body: JSON.stringify({ error: "Token requerido" }) }
      }

      const supabase = makeSupabaseAdmin()

      // Validate token
      const tokenData = await validateRecruiter(token)

      if (!tokenData) {
        return { statusCode: 403, body: JSON.stringify({ error: "Token inválido" }) }
      }

      // Fetch applications and verify they belong to this recruiter's vacancies
      const { data: apps } = await supabase
        .from("vacancy_applications")
        .select("id, name, fit_score, ats_score, strengths, key_matches, key_gaps, ai_summary, recommendation, vacancy_id")
        .in("id", body.application_ids)

      if (!apps || apps.length < 2) {
        return { statusCode: 400, body: JSON.stringify({ error: "No se encontraron los dos candidatos" }) }
      }

      // Verify ownership: both vacancy_ids must belong to this recruiter token
      const vacancyIds = [...new Set(apps.map((a: any) => a.vacancy_id).filter(Boolean))]
      if (vacancyIds.length > 0) {
        const { data: ownedVacancies } = await supabase
          .from("recruiter_vacancies")
          .select("id")
          .in("id", vacancyIds)
          .eq("recruiter_token_id", tokenData.id)

        const ownedIds = new Set((ownedVacancies || []).map((v: any) => v.id))
        const allOwned = apps.every((a: any) => !a.vacancy_id || ownedIds.has(a.vacancy_id))
        if (!allOwned) {
          return { statusCode: 403, body: JSON.stringify({ error: "Sin acceso a una o más postulaciones" }) }
        }
      }

      let vacancyContext = ""
      if (body.vacancy_id) {
        const { data: vac } = await supabase
          .from("recruiter_vacancies")
          .select("title, description, requirements, company")
          .eq("id", body.vacancy_id)
          .eq("recruiter_token_id", tokenData.id)
          .single()
        if (vac) {
          vacancyContext = `\nPUESTO: ${vac.title} en ${vac.company}\nDESCRIPCIÓN: ${vac.description}\nREQUISITOS: ${vac.requirements}`
        }
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
  "hire_recommendation": "recomendación concreta de 1-2 oraciones sobre a quién contratar"
}`

      const responseText = await invokeModel(
        "Sos un director de RRHH experto. Respondés ÚNICAMENTE con JSON válido, sin texto adicional ni markdown.",
        prompt,
        1200
      )

      return { statusCode: 200, body: JSON.stringify({ mode: 'head_to_head', ...extractJSON(responseText) }) }
    }

    // ── Modo legacy: comparar por IDs del historial
    if (!ids || !Array.isArray(ids) || ids.length < 2) {
      return { statusCode: 400, body: JSON.stringify({ error: "Se necesitan al menos 2 CVs para comparar" }) }
    }

    const supabase = makeSupabaseAdmin()
    const tokenData = await validateRecruiter(token)
    if (!tokenData) {
      return { statusCode: 403, body: JSON.stringify({ error: "Token de empresa inválido o inactivo" }) }
    }
    const { data: analyses, error: dbError } = await supabase
      .from("recruiter_analyses")
      .select("raw_cv_text, candidate_name, file_name")
      .in("id", ids)
      .eq("token_id", tokenData.id)

    if (dbError || !analyses || analyses.length !== ids.length) {
      return { statusCode: 403, body: JSON.stringify({ error: "Uno o más CVs no pertenecen a esta empresa" }) }
    }

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
