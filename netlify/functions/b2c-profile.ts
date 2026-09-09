import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { makeSupabaseAdmin } from './_supabase'
import {
  authenticatedUser,
  consumeRateLimit,
  jsonResponse,
  rateLimitHeaders,
  rejectInvalidOrigin,
  securityHeaders,
} from './lib/b2c-security'

const PROFILE_FIELDS = 'id,user_id,email,full_name,professional_title,summary,profile_data,cv_file_name,cv_storage_path,cv_uploaded_at,is_subscribed,match_alerts_enabled,match_alert_threshold,created_at,updated_at'
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_REQUEST_BYTES = 6 * 1024 * 1024

function normalizedEmail(user: any): string {
  return String(user?.email || '').trim().toLowerCase()
}

function cleanText(value: unknown, max: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => cleanText(item, 120)).filter(Boolean))].slice(0, 100)
}

function safeFileName(value: unknown): string {
  return String(value || 'cv').replace(/[\r\n]/g, '').replace(/[^a-zA-Z0-9._() -]/g, '_').slice(0, 180)
}

export function publicProfile(profile: any) {
  if (!profile) return null
  const { cv_storage_path: _privatePath, ...safe } = profile
  const legacyFileName = profile.cv_file_name || profile.profile_data?.cv_file_name || null
  const hasCv = Boolean(profile.cv_storage_path)
  return {
    ...safe,
    cv_file_name: legacyFileName,
    has_cv: hasCv,
    cv_reupload_required: !hasCv && Boolean(legacyFileName),
  }
}

async function resolveProfile(supabase: any, user: any, create = false) {
  const { data: linked, error: linkedError } = await supabase
    .from('user_master_profiles')
    .select(PROFILE_FIELDS)
    .eq('user_id', user.id)
    .maybeSingle()
  if (linkedError) throw linkedError
  if (linked) return linked

  const email = normalizedEmail(user)
  if (email) {
    const { data: emailRows, error: emailError } = await supabase
      .from('user_master_profiles')
      .select(PROFILE_FIELDS)
      .eq('email', email)
      .limit(2)
    if (emailError) throw emailError

    const orphan = (emailRows || []).find((row: any) => !row.user_id)
    if (orphan) {
      const { data: claimed, error: claimError } = await supabase
        .from('user_master_profiles')
        .update({ user_id: user.id, email, updated_at: new Date().toISOString() })
        .eq('id', orphan.id)
        .is('user_id', null)
        .select(PROFILE_FIELDS)
        .maybeSingle()
      if (claimError) throw claimError
      if (claimed) return claimed
    }
  }

  if (!create) return null
  const { data: created, error: createError } = await supabase
    .from('user_master_profiles')
    .insert({ user_id: user.id, email: email || null })
    .select(PROFILE_FIELDS)
    .single()
  if (createError) throw createError
  return created
}

async function mutationLimit(event: any, userId: string) {
  const limit = await consumeRateLimit({
    scope: 'b2c-profile-mutations',
    subject: userId,
    limit: 40,
    windowSeconds: 60 * 60,
  })
  if (limit.allowed) return null
  return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de cambios.' }, rateLimitHeaders(limit))
}

export const handler = async (event: any) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: securityHeaders(event), body: '' }
  if (event.httpMethod !== 'POST') return jsonResponse(event, 405, { error: 'Método no permitido' })
  if (!event.body || event.body.length > MAX_REQUEST_BYTES) return jsonResponse(event, 413, { error: 'La solicitud supera el límite permitido' })

  try {
    const authResult = await authenticatedUser(event)
    if (!authResult.user) return jsonResponse(event, 401, { error: authResult.error })
    const user = authResult.user
    const body = JSON.parse(event.body || '{}')
    const action = String(body.action || 'status')
    const supabase = makeSupabaseAdmin()

    if (action === 'status') {
      const profile = await resolveProfile(supabase, user, false)
      return jsonResponse(event, 200, { profile: publicProfile(profile) })
    }

    if (action === 'download_cv') {
      const profile = await resolveProfile(supabase, user, false)
      if (!profile?.cv_storage_path) {
        const hadLegacyCv = Boolean(profile?.cv_file_name || profile?.profile_data?.cv_file_name)
        return jsonResponse(event, hadLegacyCv ? 409 : 404, {
          code: hadLegacyCv ? 'CV_REUPLOAD_REQUIRED' : 'CV_NOT_FOUND',
          error: hadLegacyCv
            ? 'El archivo original de este CV no se conservó. Volvé a subirlo para habilitar la descarga.'
            : 'No hay un CV guardado en tu perfil',
        })
      }

      const pathParts = profile.cv_storage_path.split('/')
      const objectName = pathParts.pop()
      const folder = pathParts.join('/')
      const { data: storedObjects, error: listError } = await supabase.storage
        .from('candidate-cvs')
        .list(folder, { search: objectName, limit: 2 })
      if (listError) throw listError
      if (!objectName || !(storedObjects || []).some((item: any) => item.name === objectName)) {
        return jsonResponse(event, 410, {
          code: 'CV_FILE_MISSING',
          error: 'El archivo guardado ya no está disponible. Volvé a subir tu CV para recuperarlo.',
        })
      }
      const { data, error } = await supabase.storage.from('candidate-cvs').createSignedUrl(profile.cv_storage_path, 600)
      if (error || !data?.signedUrl) throw error || new Error('No se pudo crear el enlace de descarga')
      return jsonResponse(event, 200, { url: data.signedUrl, file_name: profile.cv_file_name || 'cv.pdf', expires_in: 600 })
    }

    const limited = await mutationLimit(event, user.id)
    if (limited) return limited

    if (action === 'save') {
      const profile = await resolveProfile(supabase, user, true)
      const incoming = body.profile || {}
      const profileData = {
        ...(profile.profile_data || {}),
        habilidades: cleanStringList(incoming.skills),
        cursos: cleanStringList(incoming.cursos),
        seniority: cleanText(incoming.seniority, 80) || 'Junior',
        location: cleanText(incoming.location, 160),
        modality: cleanText(incoming.modality, 80),
        career_route: cleanText(incoming.career_route, 80),
      }
      const { data: saved, error } = await supabase
        .from('user_master_profiles')
        .update({
          email: normalizedEmail(user) || profile.email,
          full_name: cleanText(incoming.full_name, 180),
          professional_title: cleanText(incoming.professional_title, 180),
          summary: cleanText(incoming.summary, 3000),
          profile_data: profileData,
          embedding: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)
        .eq('user_id', user.id)
        .select(PROFILE_FIELDS)
        .single()
      if (error) throw error
      return jsonResponse(event, 200, { profile: publicProfile(saved) })
    }

    if (action === 'upload_cv') {
      const fileName = safeFileName(body.file_name)
      const extension = fileName.toLowerCase().endsWith('.docx') ? 'docx' : fileName.toLowerCase().endsWith('.pdf') ? 'pdf' : ''
      if (!extension) return jsonResponse(event, 400, { error: 'El archivo debe ser PDF o DOCX' })
      const buffer = Buffer.from(String(body.file_base64 || ''), 'base64')
      if (!buffer.length || buffer.length > MAX_FILE_BYTES) return jsonResponse(event, 413, { error: 'El archivo debe pesar entre 1 byte y 4 MB' })
      const validMagic = extension === 'pdf'
        ? buffer.subarray(0, 5).toString('ascii') === '%PDF-'
        : buffer.subarray(0, 2).toString('ascii') === 'PK'
      if (!validMagic) return jsonResponse(event, 400, { error: 'El contenido del archivo no coincide con su formato' })

      const profile = await resolveProfile(supabase, user, true)
      const storagePath = `profiles/${user.id}/${randomUUID()}.${extension}`
      const contentType = extension === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      const { error: uploadError } = await supabase.storage
        .from('candidate-cvs')
        .upload(storagePath, buffer, { contentType, upsert: false })
      if (uploadError) throw uploadError

      const cvText = String(body.cv_text || '').trim().slice(0, 100_000)
      const uploadedAt = new Date().toISOString()
      const { data: saved, error: saveError } = await supabase
        .from('user_master_profiles')
        .update({
          cv_file_name: fileName,
          cv_storage_path: storagePath,
          cv_text: cvText || null,
          cv_uploaded_at: uploadedAt,
          profile_data: { ...(profile.profile_data || {}), cv_file_name: fileName },
          embedding: null,
          updated_at: uploadedAt,
        })
        .eq('id', profile.id)
        .eq('user_id', user.id)
        .select(PROFILE_FIELDS)
        .single()
      if (saveError) {
        await supabase.storage.from('candidate-cvs').remove([storagePath])
        throw saveError
      }

      if (profile.cv_storage_path && profile.cv_storage_path !== storagePath && profile.cv_storage_path.startsWith(`profiles/${user.id}/`)) {
        await supabase.storage.from('candidate-cvs').remove([profile.cv_storage_path])
      }
      return jsonResponse(event, 200, { profile: publicProfile(saved) })
    }

    return jsonResponse(event, 400, { error: 'Acción inválida' })
  } catch (error: any) {
    console.error('[b2c-profile]', error?.message)
    return jsonResponse(event, 500, { error: 'No pudimos actualizar tu perfil. Intentá nuevamente.' })
  }
}
