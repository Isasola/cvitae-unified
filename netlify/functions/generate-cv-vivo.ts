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

function stableJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

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
      language: requestedLanguage = 'es',
    } = JSON.parse(event.body)
    const lang = ['es', 'en', 'pt'].includes(requestedLanguage) ? requestedLanguage as 'es' | 'en' | 'pt' : 'es'
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
          .from('opportunity_final_matching_universe')
          .select('id,title,description,rubro,location,tags')
          .eq('id', vacancyId)
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

    const vacancySnapshot = vacancy ? {
      id: vacancy.id,
      title: vacancy.titulo,
      category: vacancy.categoria,
      location: vacancy.ubicacion,
      description: vacancy.cuerpo || '',
      skills: vacancy.vacancySkills || [],
    } : {}
    const { data: latestVersion, error: latestError } = await supabase
      .from('generated_cvs')
      .select('id,vacancy_id,version_number,parent_version_id,label,generation_kind,cv_markdown,evidence_snapshot,vacancy_snapshot,content_hash,user_attested,created_at,updated_at')
      .eq('user_id', profile.user_id)
      .eq('vacancy_id', vacancyId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw latestError

    // A cached document is reusable only for the exact currently-confirmed
    // evidence and exact vacancy snapshot. Pending/revoked evidence is checked
    // above and an updated vacancy cannot silently reuse an older adaptation.
    if (latestVersion && force !== true
      && stableJson(latestVersion.evidence_snapshot || []) === stableJson(generationEvidence)
      && stableJson(latestVersion.vacancy_snapshot || {}) === stableJson(vacancySnapshot)) {
      return jsonResponse(event, 200, { cv: latestVersion.cv_markdown, version: latestVersion, fromCache: true })
    }

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

    const LANG_CONFIG = {
      es: {
        instruction: 'Generá un CV profesional ATS-friendly en markdown, escrito íntegramente en **español**.',
        adapt: 'Adaptalo a la vacante objetivo sin modificar los hechos del candidato.',
        base: 'Es una versión general del CV.',
        sections: {
          summary: 'Resumen Profesional',
          skills: 'Competencias y Habilidades',
          results: 'Resultados y Logros',
          experience: 'Experiencia Profesional',
          education: 'Educación y Formación',
          courses: 'Cursos y Certificaciones',
          languages: 'Idiomas',
        },
        dateHint: 'Mes Año – Mes Año (ej: Enero 2022 – Actualidad)',
        vacancy: 'VACANTE OBJETIVO',
        evidence: 'EVIDENCIAS CONFIRMADAS POR EL USUARIO',
        rules: 'REGLAS DE VERACIDAD — PRIORIDAD MÁXIMA',
        structure: 'ESTRUCTURA PREFERIDA CUANDO EXISTA EVIDENCIA',
        footer: 'Respondé ÚNICAMENTE con el CV en markdown, sin explicaciones ni texto adicional.',
      },
      en: {
        instruction: 'Generate a professional ATS-friendly CV in markdown, written entirely in **English**.',
        adapt: 'Tailor it to the target vacancy without modifying the candidate\'s facts.',
        base: 'This is a general-purpose CV version.',
        sections: {
          summary: 'Professional Summary',
          skills: 'Skills & Competencies',
          results: 'Key Achievements',
          experience: 'Work Experience',
          education: 'Education',
          courses: 'Certifications & Training',
          languages: 'Languages',
        },
        dateHint: 'Month Year – Month Year (e.g., January 2022 – Present)',
        vacancy: 'TARGET VACANCY',
        evidence: 'USER-CONFIRMED EVIDENCE',
        rules: 'TRUTH RULES — HIGHEST PRIORITY',
        structure: 'PREFERRED STRUCTURE WHEN EVIDENCE EXISTS',
        footer: 'Reply ONLY with the CV in markdown, no explanations or additional text.',
      },
      pt: {
        instruction: 'Gere um currículo profissional e ATS-friendly em markdown, escrito inteiramente em **português**.',
        adapt: 'Adapte-o à vaga alvo sem modificar os fatos do candidato.',
        base: 'Esta é uma versão geral do currículo.',
        sections: {
          summary: 'Resumo Profissional',
          skills: 'Competências e Habilidades',
          results: 'Resultados e Conquistas',
          experience: 'Experiência Profissional',
          education: 'Educação e Formação',
          courses: 'Cursos e Certificações',
          languages: 'Idiomas',
        },
        dateHint: 'Mês Ano – Mês Ano (ex: Janeiro 2022 – Presente)',
        vacancy: 'VAGA ALVO',
        evidence: 'EVIDÊNCIAS CONFIRMADAS PELO USUÁRIO',
        rules: 'REGRAS DE VERACIDADE — PRIORIDADE MÁXIMA',
        structure: 'ESTRUTURA PREFERIDA QUANDO HOUVER EVIDÊNCIA',
        footer: 'Responda SOMENTE com o currículo em markdown, sem explicações ou texto adicional.',
      },
    }
    const lc = LANG_CONFIG[lang]
    const { sections: sec } = lc

    const vacancyContext = vacancy ? `
${lc.vacancy}:
- ${lang === 'en' ? 'Title' : lang === 'pt' ? 'Título' : 'Título'}: ${vacancy.titulo}
- ${lang === 'en' ? 'Category' : lang === 'pt' ? 'Categoria' : 'Categoría'}: ${vacancy.categoria}
- ${lang === 'en' ? 'Location' : lang === 'pt' ? 'Localização' : 'Ubicación'}: ${vacancy.ubicacion}
- ${lang === 'en' ? 'Description' : lang === 'pt' ? 'Descrição' : 'Descripción'}: ${vacancy.cuerpo || vacancy.titulo}
- ${lang === 'en' ? 'Required skills' : lang === 'pt' ? 'Habilidades requeridas' : 'Habilidades requeridas'}: ${vacancy.vacancySkills?.join(', ') || (lang === 'en' ? 'Not specified' : 'No especificadas')}
` : ''

    const prompt = `${lc.instruction}
${isBaseCV ? lc.base : lc.adapt}

${lc.evidence}:
${JSON.stringify(generationEvidence, null, 2)}
${vacancyContext}
${lc.rules}:
- ${lang === 'en' ? 'Use exclusively facts present in CONFIRMED EVIDENCE.' : lang === 'pt' ? 'Use exclusivamente fatos presentes nas EVIDÊNCIAS CONFIRMADAS.' : 'Usá exclusivamente hechos presentes en EVIDENCIAS CONFIRMADAS.'}
- ${lang === 'en' ? 'Never invent or estimate percentages, quantities, dates, periods, roles, companies, studies, certifications, languages, levels or responsibilities.' : lang === 'pt' ? 'Nunca invente nem estime percentuais, quantidades, datas, períodos, cargos, empresas, estudos, certificações, idiomas, níveis ou responsabilidades.' : 'Nunca inventes ni estimes porcentajes, cantidades, fechas, períodos, cargos, empresas, estudios, certificaciones, idiomas, niveles o responsabilidades.'}
- ${lang === 'en' ? 'A vacancy keyword may only appear as a candidate skill if it is present in confirmed evidence.' : lang === 'pt' ? 'Uma palavra-chave da vaga só pode ser incluída como habilidade do candidato se estiver nas evidências confirmadas.' : 'Una palabra clave de la vacante solo puede incluirse como habilidad si aparece en sus evidencias confirmadas.'}
- ${lang === 'en' ? 'You may improve clarity, order and phrasing without changing factual meaning.' : lang === 'pt' ? 'Pode melhorar clareza, ordem e redação sem alterar o significado factual.' : 'Podés mejorar claridad, orden y redacción sin cambiar el significado factual.'}
- ${lang === 'en' ? 'If there is no evidence for a section, omit it entirely — no placeholders.' : lang === 'pt' ? 'Se não houver evidência para uma seção, omita-a completamente — sem marcadores.' : 'Si no hay evidencia para una sección, omití esa sección; no uses placeholders.'}
- ${lang === 'en' ? 'Preserve all confirmed figures literally. Do not round or amplify results.' : lang === 'pt' ? 'Preserve literalmente todos os números confirmados. Não arredonde nem amplifique resultados.' : 'Conservá literalmente toda cifra confirmada. No redondees ni amplifiques resultados.'}
- ${lang === 'en' ? 'Use date format: ' : lang === 'pt' ? 'Use o formato de data: ' : 'Usá el formato de fecha: '}${lc.dateHint}
- ATS: ${lang === 'en' ? 'Use standard section names, avoid special characters in headings, keep single-column linear structure.' : lang === 'pt' ? 'Use nomes de seção padrão, evite caracteres especiais nos títulos, mantenha estrutura linear de coluna única.' : 'Usá nombres de sección estándar, evitá caracteres especiales en encabezados, mantené estructura de columna única.'}

${lc.structure}:
# [${lang === 'en' ? 'Full Name' : lang === 'pt' ? 'Nome Completo' : 'Nombre Completo'}]
[${lang === 'en' ? 'Professional title' : lang === 'pt' ? 'Título profissional' : 'Título profesional'}]
[${lang === 'en' ? 'City · Phone · Email · Portfolio' : lang === 'pt' ? 'Cidade · Telefone · Email · Portfólio' : 'Ciudad · Teléfono · Email · Proyecto/Portfolio'}]

## ${sec.summary}
[${lang === 'en' ? 'Faithful synthesis of evidence, 3-4 sentences, no new claims' : lang === 'pt' ? 'Síntese fiel da evidência, 3-4 frases, sem novas afirmações' : 'Síntesis fiel de la evidencia, 3-4 oraciones, sin afirmaciones nuevas'}]

## ${sec.skills}
[${lang === 'en' ? 'Confirmed skills only — list format, grouped by category if possible' : lang === 'pt' ? 'Apenas habilidades confirmadas — formato de lista, agrupadas por categoria se possível' : 'Solo habilidades confirmadas — formato de lista, agrupadas por categoría si es posible'}]

${lang === 'en' ? '## ' + sec.results + '\n[Only if achievement evidence with metrics exists — big numbers (15+, 500+) stand out to recruiters]' : lang === 'pt' ? '## ' + sec.results + '\n[Apenas se houver evidência de conquistas com métricas — números grandes (15+, 500+) se destacam para recrutadores]' : '## ' + sec.results + '\n[Solo si hay evidencia de logros con métricas — cifras grandes (15+, 500+) destacan ante reclutadores]'}

## ${sec.experience}
[${lang === 'en' ? '### Job Title | Company\nDates · Location\n- Confirmed achievement bullet\n- Use action verbs (Led, Built, Coordinated)' : lang === 'pt' ? '### Cargo | Empresa\nDatas · Localização\n- Bullet de conquista confirmada\n- Use verbos de ação (Liderou, Desenvolveu, Coordenou)' : '### Cargo | Empresa\nFechas · Ubicación\n- Bullet de logro confirmado\n- Usá verbos de acción (Lideré, Construí, Coordiné)'}]

## ${sec.education}
[${lang === 'en' ? '**Degree** | Institution · Year' : lang === 'pt' ? '**Grau** | Instituição · Ano' : '**Título** | Institución · Año'}]

## ${sec.courses}
[${lang === 'en' ? 'Course · Institution · Year (only confirmed)' : lang === 'pt' ? 'Curso · Instituição · Ano (apenas confirmados)' : 'Curso · Institución · Año (solo confirmados)'}]

## ${sec.languages}
[${lang === 'en' ? 'Language: Level (e.g., English: Native, Spanish: C1)' : lang === 'pt' ? 'Idioma: Nível (ex: Português: Nativo, Inglês: C1)' : 'Idioma: Nivel (ej: Español: Nativo, Inglés: C1)'}]

${lc.footer}`

    const cvMarkdown = await invokeModel(prompt, 1500)

    const { data: versionRows, error: versionError } = await supabase.rpc('create_cv_version', {
      p_user_id: user.id,
      p_vacancy_id: vacancyId,
      p_cv_markdown: cvMarkdown,
      p_label: isBaseCV ? 'CV general' : `Adaptado a ${vacancy.titulo}`,
      p_generation_kind: isBaseCV ? 'base' : 'adapted',
      p_parent_version_id: parentVersionId || latestVersion?.id || null,
      p_evidence_snapshot: generationEvidence,
      p_vacancy_snapshot: vacancySnapshot,
      // Model output is a reviewable draft. Only the explicit
      // save_manual_version action may create a user-attested version.
      p_user_attested: false,
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
