import { makeSupabaseAdmin } from './_supabase'
import {
  authenticatedUser,
  consumeRateLimit,
  jsonResponse,
  rateLimitHeaders,
  rejectInvalidOrigin,
  securityHeaders,
} from './lib/b2c-security'
import {
  confirmedEvidence,
  evidenceFromExtraction,
  evidenceFromProfile,
  syncEvidence,
} from './lib/cv-evidence'

const VERSION_FIELDS = 'id,vacancy_id,version_number,parent_version_id,label,generation_kind,cv_markdown,evidence_snapshot,vacancy_snapshot,content_hash,user_attested,created_at,updated_at'

async function loadWorkspace(supabase: any, user: any) {
  const { data: profile, error: profileError } = await supabase
    .from('user_master_profiles')
    .select('id,user_id,full_name,professional_title,summary,profile_data,updated_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profileError) throw profileError

  if (profile) {
    await syncEvidence(supabase, user.id, profile.id, evidenceFromProfile(profile), 'profile')
  }

  const [{ data: evidence, error: evidenceError }, { data: versions, error: versionsError }] = await Promise.all([
    supabase
      .from('cv_evidence_items')
      .select('id,category,claim,confirmed_value,context,source_kind,source_label,status,active,reviewed_at,created_at,updated_at')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('status', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('generated_cvs')
      .select(VERSION_FIELDS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  if (evidenceError) throw evidenceError
  if (versionsError) throw versionsError

  return {
    profileExists: Boolean(profile),
    profileUpdatedAt: profile?.updated_at || null,
    evidence: evidence || [],
    versions: versions || [],
  }
}

async function mutationLimit(event: any, userId: string) {
  const limit = await consumeRateLimit({
    scope: 'b2c-cv-workspace-mutations',
    subject: userId,
    limit: 120,
    windowSeconds: 60 * 60,
  })
  if (!limit.allowed) {
    return jsonResponse(
      event,
      429,
      { error: 'Alcanzaste el límite temporal de cambios. Volvé a intentarlo más tarde.' },
      rateLimitHeaders(limit),
    )
  }
  return null
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
    const action = String(body.action || 'overview')
    const supabase = makeSupabaseAdmin()

    if (action === 'overview') {
      return jsonResponse(event, 200, await loadWorkspace(supabase, user))
    }

    const limited = await mutationLimit(event, user.id)
    if (limited) return limited

    if (action === 'import_extraction') {
      const { data: profile, error: profileError } = await supabase
        .from('user_master_profiles').select('id').eq('user_id', user.id).maybeSingle()
      if (profileError) throw profileError
      const drafts = evidenceFromExtraction(body.extracted, String(body.sourceFileName || 'CV cargado'))
      if (!drafts.length) return jsonResponse(event, 400, { error: 'No encontramos evidencias para revisar' })
      await syncEvidence(supabase, user.id, profile?.id || null, drafts)
      return jsonResponse(event, 200, { imported: drafts.length })
    }

    if (action === 'review_evidence') {
      const evidenceId = String(body.evidenceId || '')
      const decision = body.decision === 'confirmed' ? 'confirmed' : body.decision === 'rejected' ? 'rejected' : null
      const confirmedValue = String(body.confirmedValue || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
      if (!evidenceId || !decision) return jsonResponse(event, 400, { error: 'Revisión inválida' })
      const { data: item, error } = await supabase
        .from('cv_evidence_items')
        .update({
          status: decision,
          confirmed_value: decision === 'confirmed' ? confirmedValue || null : null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', evidenceId)
        .eq('user_id', user.id)
        .eq('active', true)
        .select('id,status,confirmed_value,reviewed_at')
        .maybeSingle()
      if (error) throw error
      if (!item) return jsonResponse(event, 404, { error: 'Evidencia no encontrada' })
      return jsonResponse(event, 200, { evidence: item })
    }

    if (action === 'review_all') {
      const evidenceIds = Array.isArray(body.evidenceIds)
        ? [...new Set(body.evidenceIds.map(String).filter(Boolean))].slice(0, 150)
        : []
      if (!evidenceIds.length) return jsonResponse(event, 400, { error: 'No hay evidencias para confirmar' })
      const { error } = await supabase
        .from('cv_evidence_items')
        .update({ status: 'confirmed', reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('active', true)
        .eq('status', 'pending')
        .in('id', evidenceIds)
      if (error) throw error
      return jsonResponse(event, 200, { confirmed: evidenceIds.length })
    }

    if (action === 'save_manual_version') {
      const cvMarkdown = String(body.cvMarkdown || '').trim()
      if (body.attested !== true) return jsonResponse(event, 400, { error: 'Confirmá que los cambios son reales antes de guardar' })
      if (cvMarkdown.length < 40 || cvMarkdown.length > 100_000) return jsonResponse(event, 400, { error: 'Contenido del CV inválido' })
      const evidence = await confirmedEvidence(supabase, user.id)
      const { data, error } = await supabase.rpc('create_cv_version', {
        p_user_id: user.id,
        p_vacancy_id: String(body.vacancyId || 'base_cv'),
        p_cv_markdown: cvMarkdown,
        p_label: String(body.label || 'Edición confirmada'),
        p_generation_kind: 'manual',
        p_parent_version_id: body.parentVersionId || null,
        p_evidence_snapshot: evidence,
        p_vacancy_snapshot: body.vacancySnapshot || {},
        p_user_attested: true,
      })
      if (error) throw error
      return jsonResponse(event, 200, { version: Array.isArray(data) ? data[0] : data })
    }

    if (action === 'restore_version') {
      const sourceVersionId = String(body.versionId || '')
      const { data: source, error: sourceError } = await supabase
        .from('generated_cvs')
        .select(VERSION_FIELDS)
        .eq('id', sourceVersionId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (sourceError) throw sourceError
      if (!source) return jsonResponse(event, 404, { error: 'Versión no encontrada' })
      const { data, error } = await supabase.rpc('create_cv_version', {
        p_user_id: user.id,
        p_vacancy_id: source.vacancy_id,
        p_cv_markdown: source.cv_markdown,
        p_label: `Restaurada desde v${source.version_number}`,
        p_generation_kind: 'restored',
        p_parent_version_id: source.id,
        p_evidence_snapshot: source.evidence_snapshot || [],
        p_vacancy_snapshot: source.vacancy_snapshot || {},
        p_user_attested: source.user_attested || false,
      })
      if (error) throw error
      return jsonResponse(event, 200, { version: Array.isArray(data) ? data[0] : data })
    }

    return jsonResponse(event, 400, { error: 'Acción desconocida' })
  } catch (error: any) {
    console.error('cv-workspace error:', error?.message || error)
    const unavailable = String(error?.message || '').startsWith('Rate limit unavailable')
    return jsonResponse(event, unavailable ? 503 : 500, {
      error: unavailable
        ? 'El servicio está temporalmente ocupado. Intentá nuevamente en unos minutos.'
        : 'No pudimos actualizar el espacio de tu CV.',
    })
  }
}
