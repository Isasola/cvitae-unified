import { makeSupabaseAdmin } from './_supabase'
import {
  authenticatedUser,
  consumeRateLimit,
  jsonResponse,
  rateLimitHeaders,
  rejectInvalidOrigin,
  securityHeaders,
} from './lib/b2c-security'

export const handler = async (event: any) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: securityHeaders(event), body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { error: 'Método no permitido' })
  }

  try {
    const authResult = await authenticatedUser(event)
    if (!authResult.user) return jsonResponse(event, 401, { error: authResult.error })
    const user = authResult.user
    const body = JSON.parse(event.body || '{}')
    if (body.confirmation !== 'ELIMINAR') {
      return jsonResponse(event, 400, { error: 'Confirmación inválida' })
    }

    const rateLimit = await consumeRateLimit({
      scope: 'b2c-account-deletion',
      subject: user.id,
      limit: 3,
      windowSeconds: 24 * 60 * 60,
    })
    if (!rateLimit.allowed) {
      return jsonResponse(
        event,
        429,
        { error: 'La solicitud ya fue procesada o alcanzó su límite temporal.' },
        rateLimitHeaders(rateLimit),
      )
    }

    const supabase = makeSupabaseAdmin()
    const normalizedEmail = String(user.email || '').trim().toLowerCase()
    const { error: dataError } = await supabase.rpc('delete_b2c_user_data', {
      p_user_id: user.id,
      p_email: normalizedEmail || null,
    })
    if (dataError) throw dataError

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id)
    if (authDeleteError) throw authDeleteError

    return jsonResponse(event, 200, { deleted: true })
  } catch (error: any) {
    console.error('delete-b2c-account error:', error?.message || error)
    const unavailable = String(error?.message || '').startsWith('Rate limit unavailable')
    return jsonResponse(event, unavailable ? 503 : 500, {
      error: unavailable
        ? 'El servicio está temporalmente ocupado. Intentá nuevamente en unos minutos.'
        : 'No pudimos completar la eliminación. Escribinos a cvitaeparaguay@gmail.com para finalizarla.',
    })
  }
}
