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
import { confirmedEvidence, evidenceFromProfile, syncEvidence } from './lib/cv-evidence'

const MODEL_ID = 'global.anthropic.claude-sonnet-4-6'
const OBJECTIVES = new Set(['ats_clarity', 'concise', 'impact_clarity'])
const SECTIONS = new Set(['header', 'summary', 'skills', 'experience', 'education', 'courses_languages', 'other'])
const KINDS = new Set(['name', 'headline', 'paragraph', 'bullet'])
const SECTION_HEADINGS: Record<string, string> = {
  summary: 'Resumen Profesional',
  skills: 'Habilidades',
  experience: 'Experiencia Profesional',
  education: 'Educación',
  courses_languages: 'Cursos e Idiomas',
  other: 'Información adicional',
}

const bedrock = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

type GroundingEvidence = {
  id: string
  category: string
  value: string
  context?: string | null
  source?: string | null
}

function plain(value: unknown, max = 2000): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function list(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function extractJSON(value: string): any {
  const codeBlock = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (codeBlock) return JSON.parse(codeBlock[1])
  const object = value.match(/\{[\s\S]*\}/)
  return JSON.parse(object?.[0] || value)
}

function normalizedForSearch(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function numericTokens(value: string): string[] {
  return value.match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?%?(?![\p{L}\p{N}])/gu) || []
}

function evidenceHash(evidence: GroundingEvidence[]): string {
  return createHash('sha256').update(JSON.stringify(
    evidence.map((item) => ({ id: item.id, value: item.value })).sort((a, b) => a.id.localeCompare(b.id)),
  )).digest('hex')
}

function renderMarkdown(blocks: any[]): string {
  const parts: string[] = []
  let currentSection = ''
  for (const block of blocks) {
    if (block.section !== currentSection) {
      currentSection = block.section
      if (currentSection !== 'header') parts.push(`## ${SECTION_HEADINGS[currentSection] || SECTION_HEADINGS.other}`)
    }
    if (block.kind === 'name') parts.push(`# ${block.text}`)
    else if (block.kind === 'bullet') parts.push(`- ${block.text}`)
    else parts.push(block.text)
  }
  return parts.join('\n\n').trim()
}

export function normalizeRewriteResult(input: any, allowedEvidence: GroundingEvidence[], sourceMarkdown: string) {
  const evidenceById = new Map(allowedEvidence.map((item) => [item.id, item]))
  const sourceNormalized = normalizedForSearch(sourceMarkdown)
  const seen = new Set<string>()
  const blocks: any[] = []

  for (const raw of list(input?.blocks).slice(0, 60)) {
    const section = SECTIONS.has(String(raw?.section)) ? String(raw.section) : 'other'
    const kind = KINDS.has(String(raw?.kind)) ? String(raw.kind) : 'paragraph'
    const text = plain(raw?.text, 1200)
    if (!text || /\b(?:por confirmar|pendiente de completar|placeholder|n\/?a|xxx+)\b/i.test(text)) continue
    const ids = [...new Set(list(raw?.evidenceIds).map(String))].filter((id) => evidenceById.has(id)).slice(0, 8)
    if (!ids.length || ids.length !== new Set(list(raw?.evidenceIds).map(String)).size) continue
    const signature = `${section}:${kind}:${text.toLowerCase()}`
    if (seen.has(signature)) continue

    const supportingText = ids.map((id) => evidenceById.get(id)?.value || '').join(' ')
    const unsupportedNumbers = numericTokens(text).filter((token) =>
      !normalizedForSearch(supportingText).includes(normalizedForSearch(token)),
    )
    if (unsupportedNumbers.length) continue

    if (kind === 'name' && !ids.some((id) => evidenceById.get(id)?.category === 'identity')) continue
    const requestedExcerpt = plain(raw?.sourceExcerpt, 500)
    const sourceExcerpt = requestedExcerpt && sourceNormalized.includes(normalizedForSearch(requestedExcerpt))
      ? requestedExcerpt
      : null
    const reason = plain(raw?.reason, 500) || 'Mejora de claridad sin cambiar el significado factual.'
    seen.add(signature)
    blocks.push({ section, kind, text, evidenceIds: ids, sourceExcerpt, reason })
  }

  if (blocks.length < 3) throw new Error('La propuesta no produjo suficientes bloques respaldados')
  if (!blocks.some((block) => block.kind === 'name')) throw new Error('La propuesta no incluyó una identidad respaldada')

  const markdown = renderMarkdown(blocks)
  if (markdown.length < 40) throw new Error('La propuesta resultó demasiado corta')
  const changes = blocks.map((block, index) => ({
    id: `change-${index + 1}`,
    section: block.section,
    kind: block.kind,
    before: block.sourceExcerpt,
    after: block.text,
    reason: block.reason,
    evidence: block.evidenceIds.map((id: string) => evidenceById.get(id)),
  }))

  return {
    title: plain(input?.title, 160) || 'Propuesta de reescritura',
    summary: plain(input?.summary, 600) || 'Reorganiza y aclara el CV usando únicamente evidencia confirmada.',
    markdown,
    changes,
    safetyChecks: {
      passed: true,
      valid_evidence_references: true,
      numeric_claims_backed: true,
      displayed_source_excerpts_verified: true,
      placeholders_removed: true,
      block_count: blocks.length,
    },
  }
}

async function invokeModel(sourceMarkdown: string, objective: string, evidence: GroundingEvidence[], diagnostic: any) {
  const objectiveText: Record<string, string> = {
    ats_clarity: 'Priorizar lectura ATS, estructura simple, títulos previsibles y lenguaje directo.',
    concise: 'Reducir redundancias y conservar solo contenido útil, sin perder hechos confirmados.',
    impact_clarity: 'Explicar mejor responsabilidades y resultados ya confirmados, sin agregar métricas ni inferencias.',
  }
  const prompt = `Prepará una propuesta de reescritura de CV en español.

OBJETIVO:
${objectiveText[objective]}

CV DE ORIGEN (solo sirve para comparar orden y redacción; NO es una fuente autorizada de hechos):
${sourceMarkdown}

EVIDENCIAS CONFIRMADAS AUTORIZADAS:
${JSON.stringify(evidence, null, 2)}

DIAGNÓSTICO ORIENTATIVO (consejos, NO hechos del candidato):
${JSON.stringify(diagnostic || {}, null, 2)}

REGLAS OBLIGATORIAS:
- Cada bloque del CV debe tener uno o más evidenceIds existentes en EVIDENCIAS CONFIRMADAS.
- Usá exclusivamente hechos sustentados por esas evidencias. El CV de origen no autoriza hechos adicionales.
- No inventes, estimes, completes ni infieras empresas, cargos, fechas, períodos, responsabilidades, herramientas, niveles, certificaciones, idiomas, resultados, porcentajes o cantidades.
- Conservá literalmente toda cifra confirmada. No redondees ni amplifiques.
- No conviertas una habilidad en experiencia ni una tarea en logro.
- Podés mejorar gramática, claridad, orden y concisión sin cambiar el significado.
- Si falta evidencia para una sección, omitila. No uses placeholders.
- sourceExcerpt es opcional. Si lo usás, debe ser una copia textual exacta y breve del CV DE ORIGEN.
- reason explica el cambio editorial; no debe prometer entrevistas ni aumentos de score.
- El bloque kind=name debe citar una evidencia de identidad.
- No incluyas markdown: el servidor construirá el documento.

Respondé ÚNICAMENTE JSON válido:
{
  "title":"nombre breve de la propuesta",
  "summary":"qué mejora editorialmente, sin promesas",
  "blocks":[
    {
      "section":"header|summary|skills|experience|education|courses_languages|other",
      "kind":"name|headline|paragraph|bullet",
      "text":"texto reescrito",
      "evidenceIds":["uuid o id autorizado"],
      "sourceExcerpt":"fragmento exacto del CV original o null",
      "reason":"motivo editorial"
    }
  ]
}`

  const response = await observeAiCall({ provider: 'bedrock', model: MODEL_ID, feature: 'cv_rewrite_workspace', trigger: 'user_action', actor: 'user' }, () => bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 5000,
      system: 'Sos un editor de CV riguroso. Solo reescribís hechos autorizados y respondés JSON válido.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })))
  const decoded = JSON.parse(new TextDecoder().decode(response.body))
  return extractJSON(decoded.content?.[0]?.text || '{}')
}

const VERSION_FIELDS = 'id,vacancy_id,version_number,parent_version_id,label,generation_kind,cv_markdown,evidence_snapshot,vacancy_snapshot,content_hash,user_attested,created_at'
const PROPOSAL_FIELDS = 'id,source_version_id,source_content_hash,evidence_hash,objective,status,proposal_markdown,changes,evidence_snapshot,diagnostic_snapshot,safety_checks,analysis_model,accepted_version_id,accepted_at,discarded_at,created_at,updated_at'

async function loadWorkspace(supabase: any, user: any) {
  const { data: profile, error: profileError } = await supabase.from('user_master_profiles')
    .select('id,user_id,full_name,professional_title,summary,profile_data,updated_at')
    .eq('user_id', user.id).maybeSingle()
  if (profileError) throw profileError
  if (profile) await syncEvidence(supabase, user.id, profile.id, evidenceFromProfile(profile), 'profile')

  const [versionsResult, proposalsResult, pendingResult, confirmedResult] = await Promise.all([
    supabase.from('generated_cvs').select(VERSION_FIELDS).eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    supabase.from('cv_rewrite_proposals').select(PROPOSAL_FIELDS).eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('cv_evidence_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true).eq('status', 'pending'),
    supabase.from('cv_evidence_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true).eq('status', 'confirmed'),
  ])
  if (versionsResult.error) throw versionsResult.error
  if (proposalsResult.error) throw proposalsResult.error
  if (pendingResult.error) throw pendingResult.error
  if (confirmedResult.error) throw confirmedResult.error
  return {
    profileExists: Boolean(profile),
    versions: versionsResult.data || [],
    proposals: proposalsResult.data || [],
    evidenceReadiness: {
      pending: pendingResult.count || 0,
      confirmed: confirmedResult.count || 0,
      ready: (pendingResult.count || 0) === 0 && (confirmedResult.count || 0) > 0,
    },
  }
}

export const handler = async (event: any) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: securityHeaders(event), body: '' }
  if (event.httpMethod !== 'POST') return jsonResponse(event, 405, { error: 'Método no permitido' })
  if (!event.body || event.body.length > 200_000) return jsonResponse(event, 413, { error: 'La solicitud supera el límite permitido' })

  try {
    const authResult = await authenticatedUser(event)
    if (!authResult.user) return jsonResponse(event, 401, { error: authResult.error })
    const user = authResult.user
    const body = JSON.parse(event.body || '{}')
    const action = plain(body.action || 'overview', 40)
    const supabase = makeSupabaseAdmin()

    if (action === 'overview') return jsonResponse(event, 200, await loadWorkspace(supabase, user))

    if (action === 'create') {
      const sourceVersionId = plain(body.sourceVersionId, 80)
      const objective = plain(body.objective, 40)
      if (!sourceVersionId || !OBJECTIVES.has(objective)) return jsonResponse(event, 400, { error: 'Configuración de reescritura inválida' })

      const { data: sourceVersion, error: sourceError } = await supabase.from('generated_cvs')
        .select(VERSION_FIELDS).eq('id', sourceVersionId).eq('user_id', user.id).maybeSingle()
      if (sourceError) throw sourceError
      if (!sourceVersion) return jsonResponse(event, 404, { error: 'Versión de origen no encontrada' })

      const { data: profile, error: profileError } = await supabase.from('user_master_profiles')
        .select('id,user_id,full_name,professional_title,summary,profile_data').eq('user_id', user.id).maybeSingle()
      if (profileError) throw profileError
      if (!profile) return jsonResponse(event, 404, { error: 'Completá tu perfil antes de mejorar el CV' })
      await syncEvidence(supabase, user.id, profile.id, evidenceFromProfile(profile), 'profile')

      const [{ count: pendingCount, error: pendingError }, confirmed] = await Promise.all([
        supabase.from('cv_evidence_items').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('active', true).eq('status', 'pending'),
        confirmedEvidence(supabase, user.id),
      ])
      if (pendingError) throw pendingError
      if ((pendingCount || 0) > 0) return jsonResponse(event, 409, { error: 'Confirmá o rechazá las evidencias pendientes antes de reescribir.', evidence_review_required: true, pending: pendingCount })
      if (!confirmed.length) return jsonResponse(event, 409, { error: 'Confirmá al menos una evidencia real antes de reescribir.', evidence_review_required: true, pending: 0 })

      const grounding: GroundingEvidence[] = [
        ...confirmed.map((item: any) => ({ id: String(item.id), category: item.category, value: plain(item.value), context: item.context, source: item.source })),
        ...(user.email ? [{ id: 'account-email', category: 'contact', value: String(user.email), context: 'Correo de la cuenta', source: 'Cuenta autenticada' }] : []),
      ]
      const currentEvidenceHash = evidenceHash(grounding)
      const { data: existing, error: existingError } = await supabase.from('cv_rewrite_proposals').select(PROPOSAL_FIELDS)
        .eq('user_id', user.id).eq('source_version_id', sourceVersion.id)
        .eq('source_content_hash', sourceVersion.content_hash).eq('evidence_hash', currentEvidenceHash)
        .eq('objective', objective).maybeSingle()
      if (existingError) throw existingError
      if (existing) {
        if (existing.status === 'discarded') {
          const { error: reopenError } = await supabase.from('cv_rewrite_proposals')
            .update({ status: 'draft', discarded_at: null, updated_at: new Date().toISOString() })
            .eq('id', existing.id).eq('user_id', user.id)
          if (reopenError) throw reopenError
        }
        return jsonResponse(event, 200, { ...(await loadWorkspace(supabase, user)), proposalId: existing.id, idempotent: true })
      }

      const rateLimit = await consumeRateLimit({ scope: 'b2c-cv-rewrite', subject: user.id, limit: 6, windowSeconds: 24 * 60 * 60 })
      if (!rateLimit.allowed) return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de propuestas. Volvé a intentarlo más tarde.' }, rateLimitHeaders(rateLimit))

      const { data: diagnostic, error: diagnosticError } = await supabase.from('cv_ats_assessments')
        .select('id,overall_score,category_scores,blockers,quick_wins,keyword_observations,created_at')
        .eq('user_id', user.id).eq('source_version_id', sourceVersion.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (diagnosticError) throw diagnosticError
      const modelResult = await invokeModel(sourceVersion.cv_markdown, objective, grounding, diagnostic || {})
      const normalized = normalizeRewriteResult(modelResult, grounding, sourceVersion.cv_markdown)
      const evidenceSnapshot = grounding.map((item) => ({ ...item }))

      const { data: proposal, error: insertError } = await supabase.from('cv_rewrite_proposals').insert({
        user_id: user.id,
        source_version_id: sourceVersion.id,
        source_content_hash: sourceVersion.content_hash,
        evidence_hash: currentEvidenceHash,
        objective,
        status: 'draft',
        proposal_markdown: normalized.markdown,
        changes: normalized.changes,
        evidence_snapshot: evidenceSnapshot,
        diagnostic_snapshot: diagnostic || {},
        safety_checks: normalized.safetyChecks,
        analysis_model: MODEL_ID,
      }).select('id').single()
      if (insertError) throw insertError
      return jsonResponse(event, 200, { ...(await loadWorkspace(supabase, user)), proposalId: proposal.id, idempotent: false }, rateLimitHeaders(rateLimit))
    }

    if (action === 'accept') {
      const proposalId = plain(body.proposalId, 80)
      if (!proposalId || body.attested !== true) return jsonResponse(event, 400, { error: 'Revisá la propuesta y confirmá su veracidad antes de aceptarla' })
      const rateLimit = await consumeRateLimit({ scope: 'b2c-cv-rewrite-actions', subject: user.id, limit: 40, windowSeconds: 60 * 60 })
      if (!rateLimit.allowed) return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de cambios.' }, rateLimitHeaders(rateLimit))
      const { data, error } = await supabase.rpc('accept_cv_rewrite_proposal', { p_user_id: user.id, p_proposal_id: proposalId, p_attested: true })
      if (error) {
        if (String(error.message || '').includes('not found')) return jsonResponse(event, 404, { error: 'Propuesta no encontrada' })
        throw error
      }
      return jsonResponse(event, 200, { ...(await loadWorkspace(supabase, user)), accepted: Array.isArray(data) ? data[0] : data }, rateLimitHeaders(rateLimit))
    }

    if (action === 'discard') {
      const proposalId = plain(body.proposalId, 80)
      if (!proposalId) return jsonResponse(event, 400, { error: 'Propuesta inválida' })
      const { error } = await supabase.rpc('discard_cv_rewrite_proposal', { p_user_id: user.id, p_proposal_id: proposalId })
      if (error) {
        if (String(error.message || '').includes('not available')) return jsonResponse(event, 409, { error: 'La propuesta ya no está disponible' })
        throw error
      }
      return jsonResponse(event, 200, await loadWorkspace(supabase, user))
    }

    return jsonResponse(event, 400, { error: 'Acción desconocida' })
  } catch (error: any) {
    console.error('cv-rewrite-workspace error:', error?.message || error)
    const unavailable = String(error?.message || '').startsWith('Rate limit unavailable')
    const validation = String(error?.message || '').startsWith('La propuesta')
    return jsonResponse(event, unavailable ? 503 : validation ? 422 : 500, {
      error: unavailable
        ? 'El servicio está temporalmente ocupado. Intentá nuevamente en unos minutos.'
        : validation
          ? 'La propuesta automática no superó los controles de evidencia. No se guardó ningún cambio.'
          : 'No pudimos preparar la reescritura en este momento.',
    })
  }
}
