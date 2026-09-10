import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

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

function randomSuffix(n = 6): string {
  return Math.random().toString(36).substring(2, 2 + n).toUpperCase()
}

function safeError(error: any) {
  return {
    code: error?.code || "unknown",
    message: error?.message || "unknown error",
    details: error?.details || null,
    hint: error?.hint || null,
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
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
    } = JSON.parse(event.body || "{}")

    if (!token?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Token requerido" }) }
    }
    if (!title?.trim() || !description?.trim() || !requirements?.trim() || !location?.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Faltan campos requeridos: título, descripción, requisitos, ubicación" }),
      }
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

    const slug = `${toKebab(title)}-${randomSuffix()}`
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
    })

    if (createError || !vacancy?.success || !vacancy?.id || !vacancy?.opportunity_id) {
      const internalMessage = String(createError?.message || "")
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
        statusCode: 500,
        body: JSON.stringify({
          error: "No se pudo publicar la vacante de forma consistente. No quedó activa; intentá nuevamente.",
        }),
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, slug: vacancy.slug, url: vacancy.url, id: vacancy.id }),
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
