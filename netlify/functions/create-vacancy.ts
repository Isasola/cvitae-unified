// ⚠️ Netlify Free: límite 10s. Para migrar a Lambda: scripts/deploy-lambda.sh
import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 60)
}

function randomSuffix(n = 6): string {
  return Math.random().toString(36).substring(2, 2 + n).toUpperCase()
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  try {
    const { token, title, description, requirements, location, modality, salary_range, company_name, rubro, tags } = JSON.parse(event.body || "{}")

    // Validate required fields
    if (!token?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Token requerido" }) }
    }
    if (!title?.trim() || !description?.trim() || !requirements?.trim() || !location?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos requeridos: título, descripción, requisitos, ubicación, empresa" }) }
    }

    const supabase = makeSupabaseAdmin()

    // Validate recruiter token
    const { data: tokenData, error: tokenError } = await supabase
      .from("recruiter_tokens")
      .select("id, company_name, is_active, token_balance, verification_status")
      .eq("access_token", token.trim())
      .eq("is_active", true)
      .single()

    if (tokenError || !tokenData) {
      return { statusCode: 403, body: JSON.stringify({ error: "Token inválido o inactivo" }) }
    }
    if (tokenData.verification_status !== "verified") {
      return { statusCode: 403, body: JSON.stringify({ error: "La empresa debe completar y aprobar su verificación antes de publicar vacantes" }) }
    }

    const verifiedCompanyName = String(tokenData.company_name || "").trim()
    if (!verifiedCompanyName) {
      return { statusCode: 409, body: JSON.stringify({ error: "La empresa verificada no tiene un nombre registrado" }) }
    }

    // Generate unique slug: kebab(title) + random suffix
    const baseSlug = toKebab(title)
    const slug = `${baseSlug}-${randomSuffix()}`

    const { data: vacancy, error: insertError } = await supabase
      .from("recruiter_vacancies")
      .insert({
        title: title.trim(),
        description: description.trim(),
        requirements: requirements.trim(),
        location: location.trim(),
        modality: modality || "Presencial",
        salary_range: salary_range?.trim() || null,
        company: verifiedCompanyName,
        slug,
        recruiter_token_id: tokenData.id,   // real column name in DB
        is_active: true,
      })
      .select("id, slug")
      .single()

    if (insertError) {
      console.error("create-vacancy insert error:", insertError.message)
      return { statusCode: 500, body: JSON.stringify({ error: "Error al crear la vacante: " + insertError.message }) }
    }

    // Mirror to opportunities table so B2C candidates can find it in matching + Alertas
    const { error: mirrorError } = await supabase.from("opportunities").insert({
      title: title.trim(),
      organization: verifiedCompanyName,
      description: description.trim(),
      location: location.trim(),
      modality: modality || "Presencial",
      type: modality || "Presencial",
      rubro: rubro?.trim() || "General",
      tags: tags || [],
      application_url: `${process.env.SITE_URL || "https://cvitae.lat"}/vacante/${vacancy.slug}`,
      recruiter_vacancy_id: vacancy.id,
      source: "recruiter_b2b",
      source_authority: "original",
      original_source_verified: true,
      opportunity_kind: "empleo",
      opportunity_type: "job",
      country_code: "PY",
      verification_status: "verified",
      verification_score: 100,
      verification_reasons: ["empresa verificada", "vacante creada en CVitae"],
      reviewed_at: new Date().toISOString(),
      reviewed_by: `verified_recruiter:${tokenData.id}`,
      is_active: true,
    })

    if (mirrorError) {
      console.error("mirror to opportunities failed:", mirrorError.message)
      await supabase.from("recruiter_vacancies").update({ is_active: false }).eq("id", vacancy.id).eq("recruiter_token_id", tokenData.id)
      return { statusCode: 500, body: JSON.stringify({ error: "No se pudo publicar la vacante de forma consistente. No quedó activa; intentá nuevamente." }) }
    }

    const vacancyUrl = `${process.env.SITE_URL || "https://cvitae.lat"}/vacante/${vacancy.slug}`

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        slug: vacancy.slug,
        url: vacancyUrl,
        id: vacancy.id,
      }),
    }
  } catch (err: any) {
    console.error("create-vacancy error:", err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
