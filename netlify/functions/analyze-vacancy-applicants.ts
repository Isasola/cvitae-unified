import { Handler } from '@netlify/functions'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { makeSupabaseAdmin } from './_supabase'

const MODEL_ID = 'global.anthropic.claude-sonnet-4-6'
const ANALYSIS_VERSION = 'vacancy-fit-v2'
const bedrock = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

function extractJSON(text: string): any {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (block) return JSON.parse(block[1].trim())
  const object = text.match(/\{[\s\S]*\}/)
  if (object) return JSON.parse(object[0])
  return JSON.parse(text.trim())
}

async function callBedrock(system: string, user: string, maxTokens: number): Promise<string> {
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  }))
  const parsed = JSON.parse(new TextDecoder().decode(response.body))
  return parsed.content[0]?.text ?? ''
}

const SYSTEM = 'Sos un director de RRHH latinoamericano experto. Respondés ÚNICAMENTE con JSON válido y bien formateado, sin texto adicional ni markdown.'

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let reservedOperation: { tokenId: string; operationId: string } | null = null
  try {
    const { token, vacancy_id, operation_id } = JSON.parse(event.body || '{}')
    if (!token?.trim() || !vacancy_id || typeof operation_id !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'token, vacancy_id y operation_id requeridos' }) }
    }
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(operation_id)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'operation_id inválido' }) }
    }

    const supabase = makeSupabaseAdmin()
    const { data: tokenData, error: tokenError } = await supabase
      .from('recruiter_tokens')
      .select('id, token_balance')
      .eq('access_token', token.trim())
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .single()
    if (tokenError || !tokenData) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Token inválido' }) }
    }

    const { data: vacancy, error: vacancyError } = await supabase
      .from('recruiter_vacancies')
      .select('id, title, description, requirements, company')
      .eq('id', vacancy_id)
      .eq('recruiter_token_id', tokenData.id)
      .single()
    if (vacancyError || !vacancy) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Vacante no encontrada o sin acceso' }) }
    }

    // Queue claim and credit reservation are one transaction. Parallel clicks
    // cannot claim or charge the same application twice.
    const { data: claim, error: claimError } = await supabase.rpc('claim_vacancy_review_batch', {
      p_recruiter_token_id: String(tokenData.id),
      p_vacancy_id: vacancy_id,
      p_operation_id: operation_id,
    })
    if (claimError) throw new Error(`No se pudo iniciar la tanda: ${claimError.message}`)
    if (claim?.status === 'completed') {
      return { statusCode: 200, body: JSON.stringify({ ...(claim.result || {}), idempotent: true, new_balance: claim.balance }) }
    }
    if (claim?.status === 'empty') {
      return {
        statusCode: 200,
        body: JSON.stringify({ results: [], summary: null, analyzed: 0, failed: 0, complete: true, message: 'No quedan CVs pendientes de análisis', new_balance: claim.balance }),
      }
    }
    if (claim?.status === 'insufficient') {
      return {
        statusCode: 402,
        body: JSON.stringify({ error: `Necesitás ${claim.required ?? 1} créditos para analizar la siguiente tanda. Saldo actual: ${claim.balance ?? 0}.`, required: claim.required ?? null, new_balance: claim.balance ?? 0 }),
      }
    }
    if (claim?.status !== 'claimed') {
      return { statusCode: 409, body: JSON.stringify({ error: 'Esta tanda ya está en curso. Esperá unos minutos antes de reintentar.', operation_status: claim?.status || 'unknown' }) }
    }
    reservedOperation = { tokenId: String(tokenData.id), operationId: operation_id }

    const candidateIds = Array.isArray(claim.candidate_ids) ? claim.candidate_ids : []
    const { data: applicants, error: applicantError } = await supabase
      .from('vacancy_applications')
      .select('id, name, email, cv_text, cover_letter')
      .in('id', candidateIds)
      .eq('vacancy_id', vacancy_id)
      .order('applied_at', { ascending: true })
    if (applicantError || !applicants || applicants.length !== candidateIds.length) {
      throw new Error(`No se pudo reconstruir la tanda reclamada: ${applicantError?.message || 'cantidad inconsistente'}`)
    }

    const { data: priorFinalists } = await supabase
      .from('vacancy_applications')
      .select('name, fit_score, ats_score, key_matches, key_gaps')
      .eq('vacancy_id', vacancy_id)
      .eq('progressive_shortlist', true)
      .order('progressive_rank', { ascending: true })
      .limit(30)

    const jobContext = `PUESTO: ${vacancy.title}\nEMPRESA: ${vacancy.company}\nDESCRIPCIÓN:\n${vacancy.description}\nREQUISITOS:\n${vacancy.requirements}`
    const analyses = await mapWithConcurrency(applicants, 3, async (applicant) => {
      try {
        const raw = await callBedrock(
          SYSTEM,
          `Evaluá únicamente la evidencia de este CV contra el puesto. No infieras edad, género, origen, salud, situación familiar ni otra característica protegida. No inventes experiencia ni penalices datos ausentes que no sean requisitos explícitos.\n\n${jobContext}\n\nCV DEL CANDIDATO (${applicant.name}):\n${(applicant.cv_text || '').substring(0, 4000)}${applicant.cover_letter ? `\n\nCARTA DE INTERÉS:\n${applicant.cover_letter}` : ''}\n\nRespondé ÚNICAMENTE con JSON válido:\n{\n  "atsScore": <0-100, legibilidad y estructura general del CV>,\n  "fitScore": <0-100, evidencia de adecuación específica al puesto>,\n  "summary": "3-4 líneas sobre evidencia y adecuación",\n  "strengths": ["fortaleza con evidencia", "..."],\n  "keyMatches": ["requisito explícito respaldado por el CV", "..."],\n  "keyGaps": ["requisito explícito sin evidencia suficiente", "..."]\n}`,
          1200,
        )
        const result = extractJSON(raw)
        return { applicantId: applicant.id, name: applicant.name, email: applicant.email, result, ok: true }
      } catch (error: any) {
        console.error(`Analysis failed for ${applicant.name}:`, error.message)
        return { applicantId: applicant.id, name: applicant.name, email: applicant.email, result: null, ok: false }
      }
    })
    const successful = analyses.filter((row) => row.ok && row.result)

    let summary = null
    if (successful.length >= 2) {
      const ranked = [...successful].sort((a, b) => (b.result.fitScore ?? 0) - (a.result.fitScore ?? 0))
      const currentText = ranked.map((row, index) =>
        `${index + 1}. ${row.name} | Fit: ${row.result.fitScore}/100 | ATS: ${row.result.atsScore}/100\nMatches: ${(row.result.keyMatches || []).join(', ') || '—'}\nBrechas: ${(row.result.keyGaps || []).join(', ') || '—'}`
      ).join('\n\n')
      const previousText = (priorFinalists || []).length > 0
        ? (priorFinalists || []).map((row: any, index: number) =>
            `${index + 1}. ${row.name} | Fit: ${row.fit_score}/100 | ATS: ${row.ats_score}/100\nMatches: ${(row.key_matches || []).join(', ') || '—'}\nBrechas: ${(row.key_gaps || []).join(', ') || '—'}`
          ).join('\n\n')
        : 'Primera tanda: todavía no hay finalistas anteriores.'
      try {
        summary = extractJSON(await callBedrock(
          SYSTEM,
          `Revisaste una nueva tanda de ${ranked.length} candidatos para "${vacancy.title}" en ${vacancy.company}.\n\n${jobContext}\n\nNUEVA TANDA:\n${currentText}\n\nFINALISTAS DE TANDAS ANTERIORES:\n${previousText}\n\nCompará la nueva tanda con los finalistas anteriores. Conservá como recomendables a todos los perfiles fuertes; admití empates y no sugieras rechazo automático. Respondé con JSON:\n{\n  "executiveSummary": "comparación del pool en 3-4 oraciones",\n  "topPick": "perfiles prioritarios y por qué, admitiendo varios fuertes",\n  "callList": ["todos los nombres fuertes que conviene entrevistar"],\n  "redFlag": "alerta verificable o null",\n  "nextStep": "siguiente paso de entrevistas y verificación humana; el ranking no decide la contratación"\n}`,
          1200,
        ))
      } catch (error: any) {
        console.error('Summary generation failed:', error.message)
      }
    }

    const ranked = successful.map((row) => ({
      applicantId: row.applicantId,
      name: row.name,
      email: row.email,
      atsScore: row.result.atsScore,
      fitScore: row.result.fitScore,
      recommendation: (row.result.fitScore ?? 0) >= 75 ? 'Llamar' : (row.result.fitScore ?? 0) >= 50 ? 'Considerar' : 'Revisado',
      summary: row.result.summary,
      strengths: row.result.strengths || [],
      keyMatches: row.result.keyMatches || [],
      keyGaps: row.result.keyGaps || [],
    })).sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))

    const responsePayload = {
      results: ranked,
      summary,
      analyzed: successful.length,
      failed: applicants.length - successful.length,
      batchNumber: claim.batch_number,
    }
    const databaseResults = successful.map((row) => ({
      applicant_id: row.applicantId,
      ats_score: row.result.atsScore ?? null,
      fit_score: row.result.fitScore ?? null,
      ai_summary: row.result.summary ?? null,
      strengths: row.result.strengths ?? [],
      key_matches: row.result.keyMatches ?? [],
      key_gaps: row.result.keyGaps ?? [],
      analysis_model: MODEL_ID,
      analysis_version: ANALYSIS_VERSION,
    }))
    const { data: settlement, error: settlementError } = await supabase.rpc('settle_vacancy_review_batch', {
      p_recruiter_token_id: String(tokenData.id),
      p_operation_id: operation_id,
      p_results: databaseResults,
      p_response: responsePayload,
      p_summary: summary,
    })
    if (settlementError || settlement?.status !== 'completed') {
      throw new Error(`No se pudo cerrar la tanda: ${settlementError?.message || settlement?.status || 'unknown'}`)
    }
    reservedOperation = null

    return {
      statusCode: 200,
      body: JSON.stringify({ ...(settlement.result || responsePayload), new_balance: settlement.balance, charged: settlement.charged, refunded: settlement.refunded }),
    }
  } catch (error: any) {
    let operationStatus: string | null = null
    if (reservedOperation) {
      const { data: refund, error: refundError } = await makeSupabaseAdmin().rpc('refund_vacancy_review_batch', {
        p_recruiter_token_id: reservedOperation.tokenId,
        p_operation_id: reservedOperation.operationId,
        p_error_summary: String(error?.message || error).slice(0, 1000),
      })
      if (refundError) console.error('vacancy batch refund error:', refundError.message)
      operationStatus = refund?.status || null
    }
    console.error('analyze-vacancy-applicants error:', error.message)
    return { statusCode: 500, body: JSON.stringify({ error: error.message, operation_status: operationStatus, retryable: operationStatus === 'refunded' }) }
  }
}

export { handler }
