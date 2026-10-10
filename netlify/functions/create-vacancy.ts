import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"
import { createHash } from 'node:crypto'

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 60)
}

function safeError(error: any) {
  return {
    code: error?.code || "unknown",
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  let body: any
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido', reason: 'INVALID_INPUT' }) }
  }
  try {
    const {
      token,
      title,
      description,
      requirements,
      location,
      modality,
      salary_range,
      rubro,
      tags,
      operation_id,
    } = body || {}

    if (typeof token !== 'string' || !token.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Token requerido" }) }
    }
    if (![title, description, requirements, location, modality].every(value => typeof value === 'string' && value.trim())
      || title.length > 200 || description.length > 30000 || requirements.length > 15000 || location.length > 500
      || (salary_range != null && (typeof salary_range !== 'string' || salary_range.length > 1000))
      || (rubro != null && (typeof rubro !== 'string' || rubro.length > 200))
      || (tags != null && (!Array.isArray(tags) || tags.length > 40 || tags.some((tag: any) => typeof tag !== 'string' || tag.length > 100)))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Faltan campos requeridos: título, descripción, requisitos, ubicación" }),
      }
    }
    if (typeof operation_id !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(operation_id)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'La publicación requiere una operación válida. Recargá el formulario.', reason: 'OPERATION_ID_REQUIRED' }) }
    }

    const supabase = makeSupabaseAdmin()

    // Keep this preflight for useful 403/409 responses. The RPC repeats the
    // authorization check inside the transaction so it cannot become stale.
    const { data: tokenData, error: tokenError } = await supabase
      .from("recruiter_tokens")
      .select("id, company_name, is_active, verification_status")
      .eq("access_token", token.trim())
      .eq("is_active", true)
      .single()

    if (tokenError || !tokenData) {
      console.warn("[create-vacancy][TOKEN_INVALID]", safeError(tokenError))
      return { statusCode: 403, body: JSON.stringify({ error: "Token inválido o inactivo" }) }
    }
    if (tokenData.verification_status !== "verified") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "La empresa debe completar y aprobar su verificación antes de publicar vacantes" }),
      }
    }
    if (!String(tokenData.company_name || "").trim()) {
      return { statusCode: 409, body: JSON.stringify({ error: "La empresa verificada no tiene un nombre registrado" }) }
    }

    // Stable across timeout/retry/reload; company identity is part of the key.
    // The DB owns durable idempotency and rejects changed input for the same key.
    const suffix = createHash('sha256').update(`${tokenData.id}:${operation_id}`).digest('hex').slice(0, 16)
    const slug = `${toKebab(title) || 'vacante'}-${suffix}`
    const vacancyUrl = `${process.env.SITE_URL || "https://cvitae.lat"}/vacante/${slug}`

    // Both inserts live in one PostgreSQL transaction. An error rolls back
    // the recruiter vacancy and the B2C opportunity mirror together.
    const { data: vacancy, error: createError } = await supabase.rpc("create_recruiter_vacancy_atomic", {
      p_recruiter_token_id: String(tokenData.id),
      p_title: title.trim(),
      p_description: description.trim(),
      p_requirements: requirements.trim(),
      p_location: location.trim(),
      p_modality: modality?.trim() || "Presencial",
      p_salary_range: salary_range?.trim() || null,
      p_slug: slug,
      p_rubro: rubro?.trim() || "General",
      p_tags: Array.isArray(tags) ? tags.map(String) : [],
      p_application_url: vacancyUrl,
      p_operation_id: operation_id,
    })

    if (createError || !vacancy?.success || !vacancy?.id || !vacancy?.opportunity_id) {
      const internalMessage = String(createError?.message || "")
      const reason = internalMessage.includes('operation_conflict') ? 'OPERATION_CONFLICT'
        : internalMessage.includes('invalid_recruiter') ? 'RECRUITER_NOT_AUTHORIZED'
        : createError?.code === '23505' ? 'IDENTITY_COLLISION'
        : createError?.code === 'PGRST202' || createError?.code === '42883' ? 'SCHEMA_NOT_READY'
        : 'PUBLICATION_UNCONFIRMED'
      const failureStage = internalMessage.includes("RECRUITER_VACANCY_INSERT_FAILED")
        ? "INSERT_FAILED"
        : internalMessage.includes("OPPORTUNITY_MIRROR_INSERT_FAILED")
          ? "MIRROR_INSERT_FAILED"
          : createError
            ? "RPC_FAILED"
            : "CONSISTENCY_CHECK_FAILED"
      console.error("[create-vacancy][ATOMIC_CREATE_FAILED]", {
        ...safeError(createError),
        failure_stage: failureStage,
        result_complete: Boolean(vacancy?.success && vacancy?.id && vacancy?.opportunity_id),
      })
      return {
        statusCode: reason === 'RECRUITER_NOT_AUTHORIZED' ? 403 : ['OPERATION_CONFLICT', 'IDENTITY_COLLISION'].includes(reason) ? 409 : 503,
        body: JSON.stringify({
          error: 'No pudimos confirmar la publicación. Reintentá la misma operación para recuperar su resultado.',
          reason, stage: failureStage,
        }),
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, slug: vacancy.slug, url: vacancy.url, id: vacancy.id, idempotent: vacancy.idempotent === true,
        distribution: 'PENDING_INDEPENDENT_GATES' }),
    }
  } catch (error: any) {
    console.error("[create-vacancy][UNEXPECTED_ERROR]", safeError(error))
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "No se pudo procesar la publicación. Intentá nuevamente." }),
    }
  }
}

export { handler }
