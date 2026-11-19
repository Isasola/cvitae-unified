import { randomBytes } from 'node:crypto'
import { makeSupabaseAdmin } from './_supabase'
import {
  authenticatedUser, bearerToken, clientIp, consumeRateLimit, jsonResponse,
  rateLimitHeaders, rejectInvalidOrigin, securityHeaders,
} from './lib/b2c-security'

const CATEGORIES = new Set(['bug', 'data', 'usability', 'suggestion'])
const SEVERITIES = new Set(['blocking', 'major', 'minor', 'suggestion'])
const AUDIENCES = new Set(['b2c', 'b2b', 'public'])

const clean = (value: unknown, limit: number) => String(value ?? '')
  .replace(/[\u0000-\u001f]/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)

const escapeHtml = (value: unknown) => clean(value, 4000).replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character] || character))

function referenceCode() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return `CV-${date}-${randomBytes(4).toString('hex').toUpperCase()}`
}

async function notify(reference: string, report: Record<string, any>) {
  if (!process.env.RESEND_API_KEY) return false
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'CVitae Producto <noreply@cvitae.lat>', to: ['contacto@cvitae.lat'],
        subject: `[${reference}] ${report.audience.toUpperCase()} · ${report.category} · ${report.feature}`,
        html: `<div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#f5f4f0;padding:28px"><h1 style="font-size:18px;color:#c9a84c">${escapeHtml(reference)}</h1><p><strong>Área:</strong> ${escapeHtml(report.audience)} · ${escapeHtml(report.feature)}</p><p><strong>Tipo:</strong> ${escapeHtml(report.category)} · ${escapeHtml(report.severity)}</p><p><strong>Ruta:</strong> ${escapeHtml(report.page_path)}</p><p style="white-space:pre-wrap">${escapeHtml(report.message)}</p>${report.expected_result ? `<p><strong>Resultado esperado:</strong><br>${escapeHtml(report.expected_result)}</p>` : ''}<p><strong>Contacto:</strong> ${escapeHtml(report.contact_email || 'No informado')}</p></div>`,
      }),
    })
    return response.ok
  } catch { return false }
}

export const handler = async (event: any) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: securityHeaders(event), body: '' }
  if (event.httpMethod !== 'POST') return jsonResponse(event, 405, { error: 'Método no permitido' })
  if (!event.body || event.body.length > 20_000) return jsonResponse(event, 413, { error: 'El reporte supera el límite permitido' })

  try {
    const body = JSON.parse(event.body)
    const audience = clean(body.audience, 20)
    const category = clean(body.category, 30)
    const severity = clean(body.severity, 30)
    const feature = clean(body.feature, 80)
    const message = clean(body.message, 3000)
    const expectedResult = clean(body.expectedResult, 1500) || null
    const pagePath = clean(body.pagePath, 500).split('?')[0].split('#')[0]
    const suppliedEmail = clean(body.email, 320).toLowerCase()

    if (!AUDIENCES.has(audience) || !CATEGORIES.has(category) || !SEVERITIES.has(severity)) return jsonResponse(event, 400, { error: 'Clasificación inválida' })
    if (!feature || message.length < 20 || !pagePath.startsWith('/')) return jsonResponse(event, 400, { error: 'Completá el área y describí el problema con al menos 20 caracteres' })
    if (suppliedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail)) return jsonResponse(event, 400, { error: 'El email de contacto no es válido' })

    const supabase = makeSupabaseAdmin()
    let user: any = null
    if (bearerToken(event)) {
      const authenticated = await authenticatedUser(event)
      if (!authenticated.user) return jsonResponse(event, 401, { error: authenticated.error })
      user = authenticated.user
    }

    let recruiter: any = null
    const recruiterToken = clean(body.recruiterToken, 300)
    if (audience === 'b2b' && recruiterToken) {
      const { data, error } = await supabase.from('recruiter_tokens')
        .select('id,email,company_name,is_active').eq('access_token', recruiterToken).maybeSingle()
      if (error) throw error
      if (!data?.is_active) return jsonResponse(event, 401, { error: 'La sesión empresarial no es válida' })
      recruiter = data
    }

    const subject = user?.id || recruiter?.id || clientIp(event)
    const limit = await consumeRateLimit({ scope: 'product-feedback', subject, limit: 8, windowSeconds: 60 * 60 })
    if (!limit.allowed) return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de reportes' }, rateLimitHeaders(limit))

    const reference = referenceCode()
    const report = {
      reference_code: reference,
      audience, category, severity, feature, message,
      expected_result: expectedResult,
      page_path: pagePath,
      user_id: user?.id || null,
      recruiter_token_id: recruiter?.id || null,
      contact_email: clean(user?.email || recruiter?.email || suppliedEmail, 320).toLowerCase() || null,
      context: {
        viewport: {
          width: Math.max(0, Math.min(10_000, Number(body.context?.viewport?.width) || 0)),
          height: Math.max(0, Math.min(10_000, Number(body.context?.viewport?.height) || 0)),
        },
        userAgent: clean(event.headers?.['user-agent'] || event.headers?.['User-Agent'], 300),
        company: clean(recruiter?.company_name, 160) || null,
      },
    }
    const { error } = await supabase.from('product_feedback').insert(report)
    if (error) throw error
    const notified = await notify(reference, report)
    return jsonResponse(event, 201, { success: true, reference, notified }, rateLimitHeaders(limit))
  } catch (error: any) {
    console.error('submit-feedback error:', error?.message || error)
    const unavailable = String(error?.message || '').startsWith('Rate limit unavailable')
    return jsonResponse(event, unavailable ? 503 : 500, { error: unavailable ? 'El servicio está temporalmente ocupado' : 'No pudimos guardar el reporte' })
  }
}
