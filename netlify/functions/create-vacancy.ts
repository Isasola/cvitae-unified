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
    if (!title?.trim() || !description?.trim() || !requirements?.trim() || !location?.trim() || !company_name?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "Faltan campos requeridos: título, descripción, requisitos, ubicación, empresa" }) }
    }

    const supabase = makeSupabaseAdmin()

    // Validate recruiter token
    const { data: tokenData, error: tokenError } = await supabase
      .from("recruiter_tokens")
      .select("id, is_active, token_balance")
      .eq("access_token", token.trim())
      .eq("is_active", true)
      .single()

    if (tokenError || !tokenData) {
      return { statusCode: 403, body: JSON.stringify({ error: "Token inválido o inactivo" }) }
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
        company: company_name.trim(),       // real column name in DB
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
    await supabase.from("opportunities").insert({
      titulo: title.trim(),
      organization: company_name.trim(),
      description: description.trim(),
      location: location.trim(),
      modality: modality || "Presencial",
      type: modality || "Presencial",
      rubro: rubro?.trim() || "General",
      tags: tags || [],
      application_url: `${process.env.SITE_URL || "https://cvitae.lat"}/vacante/${vacancy.slug}`,
      recruiter_vacancy_id: vacancy.id,
      source: "recruiter_b2b",
      is_active: true,
    }).then(({ error }) => {
      if (error) console.error("mirror to opportunities failed:", error.message)
    })

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
