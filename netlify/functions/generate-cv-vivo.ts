import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { observeAiCall } from './lib/ai-telemetry'
import { createHash } from 'node:crypto'
import { makeSupabaseAdmin } from "./_supabase"
import {
  authenticatedUser,
  consumeRateLimit,
  jsonResponse,
  rateLimitHeaders,
  rejectInvalidOrigin,
  securityHeaders,
} from "./lib/b2c-security"
import { confirmedEvidence, evidenceFromProfile, syncEvidence } from './lib/cv-evidence'

const MODEL_ID = "global.anthropic.claude-sonnet-4-6"
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

async function invokeModel(userPrompt: string, maxTokens: number): Promise<string> {
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userPrompt }],
    }),
  })
  const response = await observeAiCall({ provider: 'bedrock', model: MODEL_ID, feature: 'cv_vivo_generation', trigger: 'user_action', actor: 'user' }, () => bedrockClient.send(command))
  const result = JSON.parse(new TextDecoder().decode(response.body))
  return result.content[0]?.text ?? ""
}

export const handler = async (event: any) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError
  const corsHeaders = securityHeaders(event)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { error: 'Método no permitido' })
  }

  try {
    if (!event.body || event.body.length > 100_000) {
      return jsonResponse(event, 413, { error: 'La solicitud supera el límite permitido' })
    }
    const authResult = await authenticatedUser(event)
    if (!authResult.user) {
      return jsonResponse(event, 401, { error: authResult.error })
    }
    const user = authResult.user
    const {
      vacancy: requestedVacancy,
      force = false,
      parentVersionId = null,
    } = JSON.parse(event.body)
    const supabase = makeSupabaseAdmin()

    const { data: storedProfile, error: profileError } = await supabase
      .from('user_master_profiles')
      .select('id,user_id,full_name,professional_title,summary,profile_data,is_subscribed,updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!storedProfile) {
      return jsonResponse(event, 404, { error: 'Completá tu perfil antes de generar un CV' })
    }
    const profile = { ...storedProfile, email: user.email || null, user_id: user.id }
    await syncEvidence(supabase, user.id, storedProfile.id, evidenceFromProfile(storedProfile), 'profile')

    let vacancy: any = null
    if (requestedVacancy) {
      if (requestedVacancy.id === 'custom') {
        const customDescription = String(requestedVacancy.cuerpo || '').replace(/\u0000/g, '').trim().slice(0, 12_000)
        if (customDescription.length < 20) {
          return jsonResponse(event, 400, { error: 'La descripción de la vacante es demasiado corta' })
        }
        vacancy = {
          id: 'custom',
          titulo: String(requestedVacancy.titulo || 'Vacante personalizada').trim().slice(0, 160),
          cuerpo: customDescription,
          categoria: 'Vacante externa',
          ubicacion: '',
          vacancySkills: [],
        }
      } else {
        const vacancyId = String(requestedVacancy.id || '').trim().slice(0, 200)
        if (!vacancyId) return jsonResponse(event, 400, { error: 'Vacante inválida' })
        const { data: storedVacancy, error: vacancyError } = await supabase
          .from('opportunities')
          .select('id,title,description,rubro,location,tags,verification_status,is_active,match_eligible')
          .eq('id', vacancyId)
          .eq('is_active', true)
          .eq('verification_status', 'verified')
          .eq('match_eligible', true)
          .maybeSingle()
        if (vacancyError) throw vacancyError
        if (!storedVacancy) {
          return jsonResponse(event, 404, { error: 'La vacante ya no está disponible para adaptación' })
        }
        vacancy = {
          id: storedVacancy.id,
          titulo: storedVacancy.title,
          cuerpo: storedVacancy.description,
          categoria: storedVacancy.rubro,
          ubicacion: storedVacancy.location,
          vacancySkills: storedVacancy.tags || [],
        }
      }
    }

    const vacancyId = vacancy?.id === 'custom'
      ? `custom-${createHash('sha256').update(`${vacancy.titulo}:${vacancy.cuerpo}`).digest('hex').slice(0, 20)}`
      : vacancy ? (vacancy.id || vacancy.slug) : 'base_cv'

    const { data: latestVersion, error: latestError } = await supabase
      .from('generated_cvs')
      .select('id,vacancy_id,version_number,parent_version_id,label,generation_kind,cv_markdown,evidence_snapshot,vacancy_snapshot,content_hash,user_attested,created_at,updated_at')
      .eq('user_id', profile.user_id)
      .eq('vacancy_id', vacancyId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw latestError

    if (latestVersion && force !== true) {
      return jsonResponse(event, 200, {
        cv: latestVersion.cv_markdown,
        version: latestVersion,
        fromCache: true,
      })
    }

    const [{ count: pendingCount, error: pendingError }, confirmed] = await Promise.all([
      supabase
        .from('cv_evidence_items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('active', true)
        .eq('status', 'pending'),
      confirmedEvidence(supabase, user.id),
    ])
    if (pendingError) throw pendingError
    if ((pendingCount || 0) > 0) {
      return jsonResponse(event, 409, {
        error: 'Revisá las evidencias pendientes antes de generar una versión nueva.',
        evidence_review_required: true,
        pending: pendingCount,
      })
    }
    if (!confirmed.length) {
      return jsonResponse(event, 409, {
        error: 'Confirmá al menos una evidencia real antes de generar tu CV.',
        evidence_review_required: true,
        pending: 0,
      })
    }

    const generationEvidence = [
      ...confirmed,
      ...(user.email ? [{ category: 'contact', value: user.email, context: 'Correo de la cuenta', source: 'Cuenta autenticada' }] : []),
    ]

    const rateLimit = await consumeRateLimit({
      scope: 'b2c-cv-generation',
      subject: user.id,
      limit: 12,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      return jsonResponse(
        event,
        429,
        { error: 'Alcanzaste el límite temporal de generaciones. Volvé a intentarlo más tarde.' },
        rateLimitHeaders(rateLimit),
      )
    }

    const isBaseCV = !vacancy

    const vacancyContext = vacancy ? `
VACANTE OBJETIVO:
- Título: ${vacancy.titulo}
- Categoría: ${vacancy.categoria}
- Ubicación: ${vacancy.ubicacion}
- Descripción: ${vacancy.cuerpo || vacancy.titulo}
- Habilidades requeridas: ${vacancy.vacancySkills?.join(', ') || 'No especificadas'}
` : ''

    const prompt = `Generá un CV profesional ATS-friendly en markdown y en español.
${isBaseCV ? 'Es una versión general del CV.' : 'Adaptalo a la vacante objetivo sin modificar los hechos del candidato.'}

EVIDENCIAS CONFIRMADAS POR EL USUARIO:
${JSON.stringify(generationEvidence, null, 2)}
${vacancyContext}
REGLAS DE VERACIDAD — PRIORIDAD MÁXIMA:
- Usá exclusivamente hechos presentes en EVIDENCIAS CONFIRMADAS.
- Nunca inventes ni estimes porcentajes, cantidades, fechas, períodos, cargos, empresas, estudios, certificaciones, idiomas, niveles o responsabilidades.
- Una palabra clave de la vacante solo puede incluirse como habilidad del candidato si aparece en sus evidencias confirmadas.
- Podés mejorar claridad, orden y redacción sin cambiar el significado factual.
- Si no hay evidencia para una sección, omití esa sección; no uses placeholders ni texto como "por confirmar".
- Conservá literalmente toda cifra confirmada. No redondees ni amplifiques resultados.
- No presentes inferencias como experiencia real.

ESTRUCTURA PREFERIDA CUANDO EXISTA EVIDENCIA:
# [Nombre]
[Título y datos de contacto confirmados]

## Resumen Profesional
[Síntesis fiel de la evidencia, sin afirmaciones nuevas]

## Habilidades
[Solo habilidades confirmadas]

## Experiencia Profesional
[Solo cargos, empresas, períodos y logros confirmados]

## Educación
[Solo formación confirmada]

## Cursos e Idiomas
[Solo elementos confirmados]

Respondé ÚNICAMENTE con el CV en markdown, sin explicaciones ni texto adicional.`

    const cvMarkdown = await invokeModel(prompt, 1500)

    // Si es vacante externa (pegada por el candidato), guardarla en opportunities para enriquecer el pool
    if (!isBaseCV && vacancy?.id === 'custom' && vacancy?.cuerpo?.length > 20) {
      await supabase.from('opportunities').insert({
        title: vacancy.titulo || 'Vacante sin título',
        organization: 'Empresa externa',
        description: vacancy.cuerpo,
        rubro: 'General',
        type: 'Tiempo completo',
        source: 'imported_b2c',
        is_active: false, // no aparece en el matching público hasta que un admin la valide
      }).then(({ error }) => {
        if (error) console.error("import external vacancy failed:", error.message)
      })
    }

    const vacancySnapshot = vacancy ? {
      id: vacancy.id,
      title: vacancy.titulo,
      category: vacancy.categoria,
      location: vacancy.ubicacion,
    } : {}
    const { data: versionRows, error: versionError } = await supabase.rpc('create_cv_version', {
      p_user_id: user.id,
      p_vacancy_id: vacancyId,
      p_cv_markdown: cvMarkdown,
      p_label: isBaseCV ? 'CV general' : `Adaptado a ${vacancy.titulo}`,
      p_generation_kind: isBaseCV ? 'base' : 'adapted',
      p_parent_version_id: parentVersionId || latestVersion?.id || null,
      p_evidence_snapshot: generationEvidence,
      p_vacancy_snapshot: vacancySnapshot,
      p_user_attested: true,
    })
    if (versionError) throw versionError
    const version = Array.isArray(versionRows) ? versionRows[0] : versionRows

    return jsonResponse(event, 200, { cv: cvMarkdown, version, fromCache: false })
  } catch (err: any) {
    console.error('generate-cv-vivo error:', err?.message || err)
    const unavailable = String(err?.message || '').startsWith('Rate limit unavailable')
    return jsonResponse(event, unavailable ? 503 : 500, {
      error: unavailable
        ? 'El servicio está temporalmente ocupado. Intentá nuevamente en unos minutos.'
        : 'No pudimos generar el CV en este momento. Intentá nuevamente.',
    })
  }
}
