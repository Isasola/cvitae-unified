import { createHash } from 'node:crypto'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { observeAiCall } from './lib/ai-telemetry'
import { makeSupabaseAdmin } from './_supabase'
import {
  authenticatedUser,
  consumeRateLimit,
  jsonResponse,
  rateLimitHeaders,
  rejectInvalidOrigin,
  securityHeaders,
} from './lib/b2c-security'

const MODEL_ID = 'global.anthropic.claude-sonnet-4-6'
const RUBRIC_VERSION = 'ats-v1'
const CATEGORY_KEYS = [
  'parsing_structure',
  'essential_sections',
  'clarity_concision',
  'evidence_impact',
  'relevance_keywords',
] as const
const EVIDENCE_CATEGORIES = new Set([
  'identity', 'title', 'summary', 'skill', 'course', 'experience',
  'achievement', 'education', 'language', 'contact', 'other',
])

const bedrock = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

function cleanText(value: unknown, max = 1000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanCvText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, 50_000)
}

function clamp(value: unknown, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : min
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function extractJSON(value: string): any {
  const codeBlock = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (codeBlock) return JSON.parse(codeBlock[1])
  const object = value.match(/\{[\s\S]*\}/)
  return JSON.parse(object?.[0] || value)
}

export function normalizeAtsResult(input: any) {
  const receivedScores = new Map(array(input?.categoryScores).map((item) => [String(item?.key || ''), item]))
  const categoryScores = CATEGORY_KEYS.map((key) => {
    const item: any = receivedScores.get(key) || {}
    return {
      key,
      score: clamp(item.score, 0, 20),
      max: 20,
      reason: cleanText(item.reason, 500) || 'No se encontró evidencia suficiente para asignar más puntos.',
      evidence: cleanText(item.evidence, 300) || null,
    }
  })

  const strengths = array(input?.strengths).slice(0, 5).map((item) => ({
    title: cleanText(item?.title, 160),
    evidence: cleanText(item?.evidence, 300),
  })).filter((item) => item.title && item.evidence)

  const blockers = array(input?.blockers).slice(0, 6).map((item) => ({
    severity: ['critical', 'high', 'medium'].includes(item?.severity) ? item.severity : 'medium',
    issue: cleanText(item?.issue, 240),
    evidence: cleanText(item?.evidence, 300) || 'No se encontró el dato en el texto extraído.',
    whyItMatters: cleanText(item?.whyItMatters, 500),
    nextAction: cleanText(item?.nextAction, 500),
  })).filter((item) => item.issue && item.whyItMatters && item.nextAction)

  const quickWins = array(input?.quickWins).slice(0, 6).map((item) => ({
    action: cleanText(item?.action, 300),
    expectedEffect: cleanText(item?.expectedEffect, 400),
  })).filter((item) => item.action && item.expectedEffect)

  const keywordObservations = array(input?.keywordObservations).slice(0, 6).map((item) => ({
    term: cleanText(item?.term, 100),
    observation: cleanText(item?.observation, 400),
  })).filter((item) => item.term && item.observation)

  const questions = array(input?.questions).slice(0, 8).map((item) => {
    const category = cleanText(item?.category, 40)
    return {
      question: cleanText(item?.question, 500),
      whyAsked: cleanText(item?.whyAsked, 800),
      suggestedContext: cleanText(item?.suggestedContext, 500) || null,
      category: EVIDENCE_CATEGORIES.has(category) ? category : 'other',
      priority: clamp(item?.priority, 1, 3),
    }
  }).filter((item) => item.question.length >= 10 && item.whyAsked.length >= 5)

  return { categoryScores, strengths, blockers, quickWins, keywordObservations, questions }
}

async function invokeModel(cvText: string) {
  const prompt = `Analizá el texto extraído de este CV con la rúbrica ATS de CVitae.

ALCANCE Y VERDAD:
- No afirmes que simulás un ATS específico ni prometas entrevistas.
- Evaluá solamente señales observables en el texto extraído. Si el formato visual no puede verificarse, decilo.
- No inventes empleos, logros, métricas, fechas, habilidades, títulos ni palabras clave.
- Una ausencia significa "no aparece en el texto", no que la persona carezca de esa experiencia.
- Las preguntas deben aclarar información faltante o ambigua. Nunca deben sugerir una respuesta falsa.
- No pidas datos sensibles ni información protegida (edad, foto, estado civil, religión, salud, origen étnico).
- Sin una vacante concreta, relevancia_keywords evalúa precisión del vocabulario profesional, no keywords universales.

Respondé ÚNICAMENTE con JSON válido en este esquema:
{
  "categoryScores": [
    {"key":"parsing_structure","score":0,"reason":"...","evidence":"fragmento breve o null"},
    {"key":"essential_sections","score":0,"reason":"...","evidence":"..."},
    {"key":"clarity_concision","score":0,"reason":"...","evidence":"..."},
    {"key":"evidence_impact","score":0,"reason":"...","evidence":"..."},
    {"key":"relevance_keywords","score":0,"reason":"...","evidence":"..."}
  ],
  "strengths":[{"title":"...","evidence":"fragmento del CV"}],
  "blockers":[{"severity":"critical|high|medium","issue":"...","evidence":"...","whyItMatters":"...","nextAction":"..."}],
  "quickWins":[{"action":"...","expectedEffect":"..."}],
  "keywordObservations":[{"term":"...","observation":"..."}],
  "questions":[{"question":"...","whyAsked":"...","suggestedContext":"qué tipo de dato ayudaría, sin proponer cifras","category":"achievement|experience|education|skill|language|contact|summary|title|course|other","priority":1}]
}

Cada dimensión vale de 0 a 20. Devolvé las cinco exactamente una vez. Máximo 8 preguntas, priorizadas; omití preguntas que el CV ya responde claramente.

CV EXTRAÍDO:
${cvText}`

  const response = await observeAiCall({ provider: 'bedrock', model: MODEL_ID, feature: 'cv_ats_diagnostic', trigger: 'user_action', actor: 'user' }, () => bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 3000,
      system: 'Sos un auditor de CV riguroso. Respondés solamente JSON válido y fundamentás cada conclusión en el texto recibido.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })))
  const decoded = JSON.parse(new TextDecoder().decode(response.body))
  return normalizeAtsResult(extractJSON(decoded.content?.[0]?.text || '{}'))
}

const ASSESSMENT_FIELDS = 'id,source_kind,source_label,source_version_id,content_hash,rubric_version,overall_score,category_scores,strengths,blockers,quick_wins,keyword_observations,analysis_model,created_at'
const QUESTION_FIELDS = 'id,assessment_id,position,priority,category,question,why_asked,suggested_context,status,answer_text,evidence_id,answered_at,created_at,updated_at'

async function loadWorkspace(supabase: any, userId: string) {
  const [{ data: assessments, error: assessmentError }, { data: versions, error: versionError }] = await Promise.all([
    supabase.from('cv_ats_assessments').select(ASSESSMENT_FIELDS)
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(12),
    supabase.from('generated_cvs')
      .select('id,vacancy_id,version_number,label,generation_kind,created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
  ])
  if (assessmentError) throw assessmentError
  if (versionError) throw versionError

  const assessmentIds = (assessments || []).map((item: any) => item.id)
  let questions: any[] = []
  if (assessmentIds.length) {
    const { data, error } = await supabase.from('cv_ats_questions').select(QUESTION_FIELDS)
      .eq('user_id', userId).in('assessment_id', assessmentIds).order('position', { ascending: true })
    if (error) throw error
    questions = data || []
  }

  return {
    rubricVersion: RUBRIC_VERSION,
    rubricNotice: 'Diagnóstico orientativo basado en señales observables. Cada ATS y cada vacante pueden aplicar reglas diferentes.',
    assessments: (assessments || []).map((assessment: any) => ({
      ...assessment,
      questions: questions.filter((question) => question.assessment_id === assessment.id),
    })),
    versions: versions || [],
    openQuestionCount: questions.filter((question) =>
      question.status === 'open' && question.assessment_id === assessments?.[0]?.id
    ).length,
  }
}

export const handler = async (event: any) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: securityHeaders(event), body: '' }
  if (event.httpMethod !== 'POST') return jsonResponse(event, 405, { error: 'Método no permitido' })
  if (!event.body || event.body.length > 250_000) return jsonResponse(event, 413, { error: 'La solicitud supera el límite permitido' })

  try {
    const authResult = await authenticatedUser(event)
    if (!authResult.user) return jsonResponse(event, 401, { error: authResult.error })
    const user = authResult.user
    const body = JSON.parse(event.body || '{}')
    const action = cleanText(body.action || 'overview', 40)
    const supabase = makeSupabaseAdmin()

    if (action === 'notification_count') {
      const { data: latest, error: latestError } = await supabase.from('cv_ats_assessments')
        .select('id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (latestError) throw latestError
      if (!latest) return jsonResponse(event, 200, { openQuestionCount: 0 })
      const { count, error: countError } = await supabase.from('cv_ats_questions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('assessment_id', latest.id).eq('status', 'open')
      if (countError) throw countError
      return jsonResponse(event, 200, { openQuestionCount: count || 0 })
    }

    if (action === 'overview') return jsonResponse(event, 200, await loadWorkspace(supabase, user.id))

    if (action === 'analyze') {
      const sourceKind = body.sourceKind === 'generated_cv' ? 'generated_cv' : body.sourceKind === 'uploaded_cv' ? 'uploaded_cv' : null
      if (!sourceKind) return jsonResponse(event, 400, { error: 'Origen del CV inválido' })

      let cvText = cleanCvText(body.cvText)
      let sourceLabel = cleanText(body.sourceLabel, 240) || 'CV cargado'
      let sourceVersionId: string | null = null
      if (sourceKind === 'generated_cv') {
        sourceVersionId = cleanText(body.sourceVersionId, 80)
        const { data: version, error } = await supabase.from('generated_cvs')
          .select('id,label,version_number,cv_markdown').eq('id', sourceVersionId).eq('user_id', user.id).maybeSingle()
        if (error) throw error
        if (!version) return jsonResponse(event, 404, { error: 'Versión del CV no encontrada' })
        cvText = cleanCvText(version.cv_markdown)
        sourceLabel = `${version.label} · v${version.version_number}`
      }
      if (cvText.length < 120) return jsonResponse(event, 400, { error: 'El CV no contiene suficiente texto para un diagnóstico confiable' })

      const contentHash = createHash('sha256').update(cvText).digest('hex')
      const { data: existing, error: existingError } = await supabase.from('cv_ats_assessments')
        .select('id').eq('user_id', user.id).eq('content_hash', contentHash).eq('rubric_version', RUBRIC_VERSION).maybeSingle()
      if (existingError) throw existingError
      if (existing) return jsonResponse(event, 200, { ...(await loadWorkspace(supabase, user.id)), idempotent: true })

      const rateLimit = await consumeRateLimit({
        scope: 'b2c-ats-diagnostic', subject: user.id, limit: 8, windowSeconds: 24 * 60 * 60,
      })
      if (!rateLimit.allowed) {
        return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de diagnósticos. Volvé a intentarlo más tarde.' }, rateLimitHeaders(rateLimit))
      }

      const result = await invokeModel(cvText)
      const { data: profile, error: profileError } = await supabase.from('user_master_profiles')
        .select('id').eq('user_id', user.id).maybeSingle()
      if (profileError) throw profileError
      const { error: createError } = await supabase.rpc('create_cv_ats_assessment', {
        p_user_id: user.id,
        p_profile_id: profile?.id || null,
        p_source_kind: sourceKind,
        p_source_label: sourceLabel,
        p_source_version_id: sourceVersionId,
        p_content_hash: contentHash,
        p_category_scores: result.categoryScores,
        p_strengths: result.strengths,
        p_blockers: result.blockers,
        p_quick_wins: result.quickWins,
        p_keyword_observations: result.keywordObservations,
        p_questions: result.questions,
        p_analysis_model: MODEL_ID,
      })
      if (createError) throw createError
      return jsonResponse(event, 200, { ...(await loadWorkspace(supabase, user.id)), idempotent: false }, rateLimitHeaders(rateLimit))
    }

    if (action === 'review_question') {
      const limit = await consumeRateLimit({
        scope: 'b2c-ats-question-review', subject: user.id, limit: 80, windowSeconds: 60 * 60,
      })
      if (!limit.allowed) return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de respuestas.' }, rateLimitHeaders(limit))
      const questionId = cleanText(body.questionId, 80)
      const decision = body.decision === 'answered' ? 'answered' : body.decision === 'skipped' ? 'skipped' : null
      if (!questionId || !decision) return jsonResponse(event, 400, { error: 'Revisión inválida' })
      const answer = cleanText(body.answer, 2000)
      if (decision === 'answered' && answer.length < 2) return jsonResponse(event, 400, { error: 'Escribí una respuesta o marcá No aplica' })
      const { error } = await supabase.rpc('review_cv_ats_question', {
        p_user_id: user.id, p_question_id: questionId, p_decision: decision, p_answer: answer || null,
      })
      if (error) {
        if (String(error.message || '').includes('question not found')) return jsonResponse(event, 404, { error: 'Pregunta no encontrada' })
        throw error
      }
      return jsonResponse(event, 200, await loadWorkspace(supabase, user.id), rateLimitHeaders(limit))
    }

    return jsonResponse(event, 400, { error: 'Acción desconocida' })
  } catch (error: any) {
    console.error('cv-ats-workspace error:', error?.message || error)
    const unavailable = String(error?.message || '').startsWith('Rate limit unavailable')
    return jsonResponse(event, unavailable ? 503 : 500, {
      error: unavailable
        ? 'El servicio está temporalmente ocupado. Intentá nuevamente en unos minutos.'
        : 'No pudimos completar el diagnóstico ATS.',
    })
  }
}
