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
const SECTIONS = new Set(['header', 'summary', 'skills', 'experience', 'education', 'courses_languages', 'other'])
const KINDS = new Set(['name', 'headline', 'paragraph', 'bullet'])
const REQUIREMENT_STATUS = new Set(['supported', 'partial', 'not_evidenced'])
const REQUIREMENT_IMPORTANCE = new Set(['essential', 'preferred', 'context'])
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
    .replace(/<[^>]*>/g, ' ')
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

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function numericTokens(value: string): string[] {
  return value.match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?%?(?![\p{L}\p{N}])/gu) || []
}

function hash(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
}

function evidenceHash(evidence: GroundingEvidence[]): string {
  return hash(evidence.map((item) => ({ id: item.id, value: item.value })).sort((a, b) => a.id.localeCompare(b.id)))
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

function validateBackedText(text: string, ids: string[], evidenceById: Map<string, GroundingEvidence>): boolean {
  const supportingText = ids.map((id) => evidenceById.get(id)?.value || '').join(' ')
  return numericTokens(text).every((token) => normalized(supportingText).includes(normalized(token)))
}

export function normalizeApplicationResult(
  input: any,
  allowedEvidence: GroundingEvidence[],
  sourceMarkdown: string,
  opportunityText: string,
) {
  const evidenceById = new Map(allowedEvidence.map((item) => [item.id, item]))
  const sourceNormalized = normalized(sourceMarkdown)
  const opportunityNormalized = normalized(opportunityText)
  const requirements: any[] = []
  const requirementSeen = new Set<string>()

  for (const raw of list(input?.requirements).slice(0, 24)) {
    const text = plain(raw?.text, 600)
    if (!text || !opportunityNormalized.includes(normalized(text))) continue
    const signature = normalized(text)
    if (requirementSeen.has(signature)) continue
    const importance = REQUIREMENT_IMPORTANCE.has(String(raw?.importance)) ? String(raw.importance) : 'context'
    let status = REQUIREMENT_STATUS.has(String(raw?.status)) ? String(raw.status) : 'not_evidenced'
    const rawIds = [...new Set(list(raw?.evidenceIds).map(String))]
    const evidenceIds = rawIds.filter((id) => evidenceById.has(id)).slice(0, 8)
    if (evidenceIds.length !== rawIds.length) continue
    if (status !== 'not_evidenced' && !evidenceIds.length) status = 'not_evidenced'
    if (status === 'not_evidenced' && evidenceIds.length) status = 'partial'
    requirementSeen.add(signature)
    requirements.push({
      id: `requirement-${requirements.length + 1}`,
      text,
      importance,
      status,
      evidenceIds,
      evidence: evidenceIds.map((id) => evidenceById.get(id)),
      explanation: status === 'supported'
        ? 'Encontramos evidencia confirmada que respalda este requisito.'
        : status === 'partial'
          ? 'Hay evidencia relacionada, pero no permite afirmar una coincidencia completa.'
          : 'No encontramos evidencia confirmada para afirmar este requisito.',
    })
  }
  if (requirements.length < 2) throw new Error('La preparación no identificó suficientes requisitos verificables')

  const blocks: any[] = []
  const blockSeen = new Set<string>()
  for (const raw of list(input?.cvBlocks).slice(0, 60)) {
    const section = SECTIONS.has(String(raw?.section)) ? String(raw.section) : 'other'
    const kind = KINDS.has(String(raw?.kind)) ? String(raw.kind) : 'paragraph'
    const text = plain(raw?.text, 1200)
    if (!text || /\b(?:por confirmar|pendiente de completar|placeholder|n\/?a|xxx+)\b/i.test(text)) continue
    const rawIds = [...new Set(list(raw?.evidenceIds).map(String))]
    const evidenceIds = rawIds.filter((id) => evidenceById.has(id)).slice(0, 8)
    if (!evidenceIds.length || evidenceIds.length !== rawIds.length) continue
    if (!validateBackedText(text, evidenceIds, evidenceById)) continue
    if (kind === 'name' && !evidenceIds.some((id) => evidenceById.get(id)?.category === 'identity')) continue
    const signature = `${section}:${kind}:${normalized(text)}`
    if (blockSeen.has(signature)) continue
    const excerpt = plain(raw?.sourceExcerpt, 500)
    blockSeen.add(signature)
    blocks.push({
      section,
      kind,
      text,
      evidenceIds,
      sourceExcerpt: excerpt && sourceNormalized.includes(normalized(excerpt)) ? excerpt : null,
    })
  }
  if (blocks.length < 3 || !blocks.some((block) => block.kind === 'name')) {
    throw new Error('La preparación no produjo un CV suficientemente respaldado')
  }

  const coverParts: any[] = []
  for (const raw of list(input?.coverBlocks).slice(0, 12)) {
    const rawIds = [...new Set(list(raw?.evidenceIds).map(String))]
    const evidenceIds = rawIds.filter((id) => evidenceById.has(id)).slice(0, 8)
    if (!evidenceIds.length || evidenceIds.length !== rawIds.length) continue
    coverParts.push({ evidenceIds, evidence: evidenceIds.map((id) => evidenceById.get(id)) })
  }
  if (coverParts.length < 2) throw new Error('La preparación no produjo un mensaje suficientemente respaldado')
  const coverEvidence = [...new Set(coverParts.flatMap((item) => item.evidenceIds))]
    .map((id) => evidenceById.get(id))
    .filter(Boolean)
    .slice(0, 8) as GroundingEvidence[]
  if (coverEvidence.length < 2) throw new Error('La preparación no seleccionó suficientes evidencias para el mensaje')
  const coverMessage = [
    'Hola.',
    'Me interesa esta oportunidad. Para contextualizar mi perfil, comparto información que confirmé personalmente:',
    ...coverEvidence.map((item) => `- ${item.value}`),
    'Quedo disponible para conversar y ampliar estos antecedentes.',
  ].join('\n\n')

  const weight = (importance: string) => importance === 'essential' ? 2 : importance === 'preferred' ? 1 : 0.5
  const value = (status: string) => status === 'supported' ? 1 : status === 'partial' ? 0.5 : 0
  const totalWeight = requirements.reduce((sum, item) => sum + weight(item.importance), 0)
  const coveredWeight = requirements.reduce((sum, item) => sum + weight(item.importance) * value(item.status), 0)
  const coverageScore = totalWeight ? Math.round((coveredWeight / totalWeight) * 100) : 0
  const counts = {
    supported: requirements.filter((item) => item.status === 'supported').length,
    partial: requirements.filter((item) => item.status === 'partial').length,
    not_evidenced: requirements.filter((item) => item.status === 'not_evidenced').length,
  }
  const missingEssential = requirements.filter((item) => item.importance === 'essential' && item.status === 'not_evidenced')
  const missingRequirements = requirements.filter((item) => item.status === 'not_evidenced')
  const checklist = [
    { id: 'review-official', label: 'Revisar nuevamente las bases y la fecha en la fuente oficial', kind: 'official' },
    { id: 'verify-contact', label: 'Verificar que los datos de contacto del CV estén vigentes', kind: 'document' },
    { id: 'download-cv', label: 'Descargar y revisar la versión adaptada del CV', kind: 'document' },
    { id: 'copy-message', label: 'Personalizar y copiar el mensaje de presentación', kind: 'document' },
    ...missingRequirements.slice(0, 8).map((item, index) => ({
      id: `gap-${index + 1}`,
      label: `Preparar una respuesta honesta sobre: ${item.text}`,
      kind: 'gap',
    })),
  ]

  return {
    requirements,
    fitSummary: {
      coverage_score: coverageScore,
      ...counts,
      total: requirements.length,
      missing_essential: missingEssential.length,
      label: coverageScore >= 80 && !missingEssential.length
        ? 'Respaldo sólido'
        : coverageScore >= 55
          ? 'Respaldo parcial'
          : 'Conviene revisar brechas',
      disclaimer: 'Mide cobertura documental, no probabilidad de contratación ni elegibilidad final.',
    },
    tailoredCvMarkdown: renderMarkdown(blocks),
    cvBlocks: blocks,
    coverMessage,
    coverBlocks: coverEvidence.map((item) => ({ evidenceIds: [item.id], evidence: [item] })),
    checklist,
    safetyChecks: {
      passed: true,
      valid_evidence_references: true,
      numeric_candidate_claims_backed: true,
      cover_message_rendered_by_server: true,
      requirements_copied_from_opportunity: true,
      missing_requirements_not_presented_as_candidate_facts: true,
      source_excerpts_verified: true,
      placeholders_removed: true,
      cv_block_count: blocks.length,
      requirement_count: requirements.length,
    },
  }
}

async function invokeModel(sourceMarkdown: string, evidence: GroundingEvidence[], opportunity: any) {
  const opportunityText = [opportunity.title, opportunity.organization, opportunity.description, ...(opportunity.tags || [])].filter(Boolean).join('\n')
  const prompt = `Prepará documentos para una postulación laboral en español.

OPORTUNIDAD VERIFICADA:
${JSON.stringify({
    title: opportunity.title,
    organization: opportunity.organization,
    location: opportunity.location,
    description: opportunity.description,
    tags: opportunity.tags,
    deadline: opportunity.deadline,
  }, null, 2)}

CV DE ORIGEN (sirve para comparar redacción; NO autoriza hechos):
${sourceMarkdown}

EVIDENCIAS CONFIRMADAS AUTORIZADAS:
${JSON.stringify(evidence, null, 2)}

REGLAS OBLIGATORIAS:
- Extraé requisitos como fragmentos textuales exactos de la oportunidad. No los reformules.
- Clasificá cada requisito como essential, preferred o context.
- supported requiere evidencia directa; partial significa relacionada pero insuficiente; not_evidenced no lleva evidencia.
- Cada afirmación del CV y del mensaje debe citar evidenceIds existentes.
- Usá exclusivamente hechos de las evidencias confirmadas. El CV de origen no autoriza hechos adicionales.
- No inventes ni infieras empresas, cargos, fechas, responsabilidades, habilidades, niveles, logros, cantidades, porcentajes o resultados.
- Una palabra de la vacante solo puede presentarse como habilidad del candidato si aparece en evidencia confirmada.
- Conservá literalmente las cifras respaldadas. Omití secciones sin evidencia y no uses placeholders.
- El bloque kind=name debe citar evidencia de identidad.
- El mensaje debe ser breve, natural y editable; no debe afirmar que cumple requisitos no respaldados.
- No prometas entrevistas ni calcules un score. El servidor calcula cobertura de forma determinista.
- No incluyas markdown dentro de los bloques; el servidor construirá el CV.

Respondé ÚNICAMENTE JSON válido:
{
  "requirements":[{"text":"fragmento exacto de la oportunidad","importance":"essential|preferred|context","status":"supported|partial|not_evidenced","evidenceIds":["id"]}],
  "cvBlocks":[{"section":"header|summary|skills|experience|education|courses_languages|other","kind":"name|headline|paragraph|bullet","text":"texto","evidenceIds":["id"],"sourceExcerpt":"fragmento exacto del CV o null"}],
  "coverBlocks":[{"text":"párrafo breve","evidenceIds":["id"]}]
}

Texto total de la oportunidad para copiar requisitos literalmente:
${opportunityText}`

  const response = await observeAiCall({ provider: 'bedrock', model: MODEL_ID, feature: 'application_workspace', trigger: 'user_action', actor: 'user' }, () => bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 6500,
      system: 'Sos un asistente de postulación riguroso. Nunca completás hechos del candidato y respondés JSON válido.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })))
  const decoded = JSON.parse(new TextDecoder().decode(response.body))
  return extractJSON(decoded.content?.[0]?.text || '{}')
}

const VERSION_FIELDS = 'id,vacancy_id,version_number,parent_version_id,label,generation_kind,cv_markdown,evidence_snapshot,vacancy_snapshot,content_hash,user_attested,created_at'
const WORKSPACE_FIELDS = 'id,opportunity_id,source_version_id,source_content_hash,status,opportunity_snapshot,application_url_snapshot,requirement_analysis,fit_summary,tailored_cv_markdown,cover_message,evidence_snapshot,checklist,checklist_progress,safety_checks,prepared_version_id,accepted_at,opened_at,submitted_self_reported_at,archived_at,created_at,updated_at'
const OPPORTUNITY_FIELDS = 'id,slug,title,organization,location,description,tags,deadline,application_url,source,opportunity_kind,updated_at,verification_status,is_active,catalog_eligible,deleted_at,archived_at'

async function loadOpportunity(supabase: any, selector: { id?: string; slug?: string }) {
  let query = supabase.from('opportunities').select(OPPORTUNITY_FIELDS)
    .eq('is_active', true).eq('verification_status', 'verified').eq('catalog_eligible', true)
    .is('deleted_at', null).is('archived_at', null)
  if (selector.id) query = query.eq('id', selector.id)
  else if (selector.slug) query = query.eq('slug', selector.slug)
  else return null
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data || (data.deadline && new Date(data.deadline).getTime() < Date.now())) return null
  try {
    const url = new URL(data.application_url)
    if (!['http:', 'https:'].includes(url.protocol)) return null
  } catch {
    return null
  }
  return data
}

async function loadWorkspace(supabase: any, user: any, opportunity: any = null) {
  const { data: profile, error: profileError } = await supabase.from('user_master_profiles')
    .select('id,user_id,full_name,professional_title,summary,profile_data,updated_at')
    .eq('user_id', user.id).maybeSingle()
  if (profileError) throw profileError
  if (profile) await syncEvidence(supabase, user.id, profile.id, evidenceFromProfile(profile), 'profile')

  let workspacesQuery = supabase.from('application_workspaces').select(WORKSPACE_FIELDS)
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
  if (opportunity) workspacesQuery = workspacesQuery.eq('opportunity_id', opportunity.id)
  const [versionsResult, workspacesResult, pendingResult, confirmedResult] = await Promise.all([
    supabase.from('generated_cvs').select(VERSION_FIELDS).eq('user_id', user.id).order('created_at', { ascending: false }).limit(40),
    workspacesQuery,
    supabase.from('cv_evidence_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true).eq('status', 'pending'),
    supabase.from('cv_evidence_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true).eq('status', 'confirmed'),
  ])
  if (versionsResult.error) throw versionsResult.error
  if (workspacesResult.error) throw workspacesResult.error
  if (pendingResult.error) throw pendingResult.error
  if (confirmedResult.error) throw confirmedResult.error
  return {
    profileExists: Boolean(profile),
    opportunity,
    versions: versionsResult.data || [],
    workspaces: workspacesResult.data || [],
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
  if (!event.body || event.body.length > 220_000) return jsonResponse(event, 413, { error: 'La solicitud supera el límite permitido' })

  try {
    const authResult = await authenticatedUser(event)
    if (!authResult.user) return jsonResponse(event, 401, { error: authResult.error })
    const user = authResult.user
    const body = JSON.parse(event.body || '{}')
    const action = plain(body.action || 'overview', 40)
    const opportunityId = plain(body.opportunityId, 220)
    const opportunitySlug = plain(body.opportunitySlug, 260)
    const supabase = makeSupabaseAdmin()
    const opportunity = opportunityId || opportunitySlug
      ? await loadOpportunity(supabase, { id: opportunityId || undefined, slug: opportunitySlug || undefined })
      : null

    if ((opportunityId || opportunitySlug) && !opportunity) {
      return jsonResponse(event, 404, { error: 'La oportunidad ya no está disponible para preparar una postulación' })
    }
    if (action === 'overview') return jsonResponse(event, 200, await loadWorkspace(supabase, user, opportunity))

    if (action === 'prepare') {
      if (!opportunity) return jsonResponse(event, 400, { error: 'Elegí una oportunidad válida' })
      const sourceVersionId = plain(body.sourceVersionId, 80)
      if (!sourceVersionId) return jsonResponse(event, 400, { error: 'Elegí la versión del CV que querés usar' })
      const { data: sourceVersion, error: sourceError } = await supabase.from('generated_cvs')
        .select(VERSION_FIELDS).eq('id', sourceVersionId).eq('user_id', user.id).maybeSingle()
      if (sourceError) throw sourceError
      if (!sourceVersion) return jsonResponse(event, 404, { error: 'Versión de CV no encontrada' })

      const { data: profile, error: profileError } = await supabase.from('user_master_profiles')
        .select('id,user_id,full_name,professional_title,summary,profile_data').eq('user_id', user.id).maybeSingle()
      if (profileError) throw profileError
      if (!profile) return jsonResponse(event, 404, { error: 'Completá tu perfil antes de preparar una postulación' })
      await syncEvidence(supabase, user.id, profile.id, evidenceFromProfile(profile), 'profile')
      const [{ count: pendingCount, error: pendingError }, confirmed] = await Promise.all([
        supabase.from('cv_evidence_items').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('active', true).eq('status', 'pending'),
        confirmedEvidence(supabase, user.id),
      ])
      if (pendingError) throw pendingError
      if ((pendingCount || 0) > 0) return jsonResponse(event, 409, { error: 'Confirmá o rechazá las evidencias pendientes antes de preparar documentos.', evidence_review_required: true, pending: pendingCount })
      if (!confirmed.length) return jsonResponse(event, 409, { error: 'Confirmá al menos una evidencia real antes de preparar documentos.', evidence_review_required: true, pending: 0 })

      const grounding: GroundingEvidence[] = [
        ...confirmed.map((item: any) => ({ id: String(item.id), category: item.category, value: plain(item.value), context: item.context, source: item.source })),
        ...(user.email ? [{ id: 'account-email', category: 'contact', value: String(user.email), context: 'Correo de la cuenta', source: 'Cuenta autenticada' }] : []),
      ]
      const currentEvidenceHash = evidenceHash(grounding)
      const opportunitySnapshot = {
        id: opportunity.id,
        slug: opportunity.slug,
        title: opportunity.title,
        organization: opportunity.organization,
        location: opportunity.location,
        deadline: opportunity.deadline,
        source: opportunity.source,
        kind: opportunity.opportunity_kind,
        updated_at: opportunity.updated_at,
      }
      const opportunityFingerprint = hash({
        ...opportunitySnapshot,
        description: opportunity.description,
        tags: opportunity.tags,
        application_url: opportunity.application_url,
        updated_at: opportunity.updated_at,
      })
      const { data: existing, error: existingError } = await supabase.from('application_workspaces').select(WORKSPACE_FIELDS)
        .eq('user_id', user.id).eq('opportunity_id', opportunity.id).eq('source_version_id', sourceVersion.id)
        .eq('source_content_hash', sourceVersion.content_hash).eq('evidence_hash', currentEvidenceHash)
        .eq('opportunity_fingerprint', opportunityFingerprint).maybeSingle()
      if (existingError) throw existingError
      if (existing) return jsonResponse(event, 200, { ...(await loadWorkspace(supabase, user, opportunity)), workspaceId: existing.id, idempotent: true })

      const rateLimit = await consumeRateLimit({ scope: 'b2c-application-prep', subject: user.id, limit: 6, windowSeconds: 24 * 60 * 60 })
      if (!rateLimit.allowed) return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de preparaciones. Volvé a intentarlo más tarde.' }, rateLimitHeaders(rateLimit))
      const modelResult = await invokeModel(sourceVersion.cv_markdown, grounding, opportunity)
      const opportunityText = [opportunity.title, opportunity.organization, opportunity.description, ...(opportunity.tags || [])].filter(Boolean).join('\n')
      const normalizedResult = normalizeApplicationResult(modelResult, grounding, sourceVersion.cv_markdown, opportunityText)

      const { data: created, error: insertError } = await supabase.from('application_workspaces').insert({
        user_id: user.id,
        opportunity_id: opportunity.id,
        source_version_id: sourceVersion.id,
        source_content_hash: sourceVersion.content_hash,
        evidence_hash: currentEvidenceHash,
        opportunity_fingerprint: opportunityFingerprint,
        status: 'draft',
        opportunity_snapshot: opportunitySnapshot,
        application_url_snapshot: opportunity.application_url,
        requirement_analysis: normalizedResult.requirements,
        fit_summary: normalizedResult.fitSummary,
        tailored_cv_markdown: normalizedResult.tailoredCvMarkdown,
        cover_message: normalizedResult.coverMessage,
        evidence_snapshot: grounding,
        checklist: normalizedResult.checklist,
        safety_checks: normalizedResult.safetyChecks,
        analysis_model: MODEL_ID,
      }).select('id').single()
      if (insertError) throw insertError
      return jsonResponse(event, 200, { ...(await loadWorkspace(supabase, user, opportunity)), workspaceId: created.id, idempotent: false }, rateLimitHeaders(rateLimit))
    }

    const workspaceId = plain(body.workspaceId, 80)
    if (!workspaceId) return jsonResponse(event, 400, { error: 'Expediente inválido' })

    if (action === 'accept') {
      if (body.attested !== true) return jsonResponse(event, 400, { error: 'Revisá los documentos y confirmá su veracidad antes de aceptarlos' })
      const rateLimit = await consumeRateLimit({ scope: 'b2c-application-actions', subject: user.id, limit: 60, windowSeconds: 60 * 60 })
      if (!rateLimit.allowed) return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de cambios.' }, rateLimitHeaders(rateLimit))
      const { data, error } = await supabase.rpc('accept_application_workspace', { p_user_id: user.id, p_workspace_id: workspaceId, p_attested: true })
      if (error) {
        const message = String(error.message || '')
        if (message.includes('no longer available')) return jsonResponse(event, 409, { error: 'La oportunidad venció o dejó de estar disponible. No se creó una versión nueva.' })
        if (message.includes('not found')) return jsonResponse(event, 404, { error: 'Expediente no encontrado' })
        throw error
      }
      return jsonResponse(event, 200, { ...(await loadWorkspace(supabase, user, opportunity)), accepted: Array.isArray(data) ? data[0] : data }, rateLimitHeaders(rateLimit))
    }

    if (action === 'checklist') {
      const progress = body.progress && typeof body.progress === 'object' && !Array.isArray(body.progress) ? body.progress : null
      if (!progress) return jsonResponse(event, 400, { error: 'Progreso inválido' })
      const { error } = await supabase.rpc('update_application_checklist', { p_user_id: user.id, p_workspace_id: workspaceId, p_progress: progress })
      if (error) throw error
      return jsonResponse(event, 200, await loadWorkspace(supabase, user, opportunity))
    }

    if (action === 'opened' || action === 'submitted' || action === 'archived') {
      const { data, error } = await supabase.rpc('advance_application_workspace', { p_user_id: user.id, p_workspace_id: workspaceId, p_action: action })
      if (error) {
        if (String(error.message || '').includes('not ready')) return jsonResponse(event, 409, { error: 'Primero aceptá los documentos de la postulación' })
        throw error
      }
      return jsonResponse(event, 200, { ...(await loadWorkspace(supabase, user, opportunity)), transition: Array.isArray(data) ? data[0] : data })
    }

    return jsonResponse(event, 400, { error: 'Acción desconocida' })
  } catch (error: any) {
    console.error('application-workspace error:', error?.message || error)
    const message = String(error?.message || '')
    const unavailable = message.startsWith('Rate limit unavailable')
    const validation = message.startsWith('La preparación')
    return jsonResponse(event, unavailable ? 503 : validation ? 422 : 500, {
      error: unavailable
        ? 'El servicio está temporalmente ocupado. Intentá nuevamente en unos minutos.'
        : validation
          ? 'La preparación automática no superó los controles de evidencia. No se guardó ningún documento.'
          : 'No pudimos preparar la postulación en este momento.',
    })
  }
}
