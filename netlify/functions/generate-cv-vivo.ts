import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { makeSupabaseAdmin } from "./_supabase"

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
  const response = await bedrockClient.send(command)
  const result = JSON.parse(new TextDecoder().decode(response.body))
  return result.content[0]?.text ?? ""
}

export const handler = async (event: any) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }

  try {
    const { profile, vacancy } = JSON.parse(event.body)
    const supabase = makeSupabaseAdmin()

    // Buscar en caché (menos de 7 días)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const vacancyId = vacancy ? (vacancy.id || vacancy.slug) : 'base_cv'

    const { data: cached } = await supabase
      .from('generated_cvs')
      .select('cv_markdown')
      .eq('user_id', profile.user_id)
      .eq('vacancy_id', vacancyId)
      .gte('created_at', sevenDaysAgo)
      .maybeSingle()

    if (cached) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ cv: cached.cv_markdown, fromCache: true }),
      }
    }

    const isBaseCV = !vacancy

    const prompt = isBaseCV
      ? `Generá un CV profesional híbrido ATS-friendly en markdown para este candidato. El CV debe:
- Estar en español
- Resaltar sus habilidades y experiencia de forma clara y profesional
- Usar métricas y logros concretos donde sea posible
- Ser 100% legible por sistemas ATS (sin tablas, sin columnas, texto plano estructurado)

ESTRUCTURA OBLIGATORIA (en este orden exacto):
# [NOMBRE COMPLETO]
[título profesional] | [email] | [teléfono] | [ubicación] | [LinkedIn si existe]

## Resumen Profesional
[3-4 líneas con su propuesta de valor y logros principales]

## Habilidades
**Técnicas:** [lista de habilidades técnicas]
**Blandas:** [lista de habilidades blandas]

## Experiencia Profesional
### [Cargo] — [Empresa] | [Período]
- [Logro medible con verbo de acción]
- [Logro medible con verbo de acción]

## Educación
### [Título] — [Institución] | [Año]

## Idiomas
- [Idioma]: [Nivel]

PERFIL DEL CANDIDATO:
${JSON.stringify(profile, null, 2)}

REGLAS DE ESTILO OBLIGATORIAS:
- Todo el CV en PRIMERA PERSONA. Verbos: "Lideré", "Desarrollé", "Implementé", "Gestioné", "Aumenté X%", "Reduje", "Coordiné", "Diseñé", "Logré"
- Nunca uses tercera persona ("Profesional con experiencia en..." está MAL. "Cuento con experiencia en..." está BIEN)
- Incluí métricas reales o estimadas en cada logro: porcentajes, cantidades, períodos de tiempo
- El resumen profesional debe empezar con "Soy..." o "Cuento con..."

Respondé ÚNICAMENTE con el CV en markdown, sin explicaciones, sin texto antes ni después.`
      : `Sos un experto en redacción de CVs para el mercado latinoamericano, especializado en formato híbrido ATS-friendly.

Generá un CV profesional en markdown adaptado específicamente para esta vacante. El CV debe:
- Usar las palabras clave exactas de la descripción de la vacante
- Resaltar las habilidades del candidato que coinciden con lo que pide la vacante
- Reordenar y reescribir el resumen profesional para que conecte directamente con el puesto
- Incluir métricas y logros concretos donde sea posible
- Ser 100% legible por sistemas ATS (sin tablas, sin columnas, texto plano estructurado)
- Estar en español

ESTRUCTURA OBLIGATORIA (en este orden exacto):
# [NOMBRE COMPLETO]
[título profesional adaptado al puesto] | [email] | [teléfono] | [ubicación] | [LinkedIn si existe]

## Resumen Profesional
[3-4 líneas con palabras clave de la vacante, logros cuantificables, propuesta de valor]

## Habilidades
**Técnicas:** [lista priorizando las que pide la vacante]
**Blandas:** [lista relevante para el puesto]

## Experiencia Profesional
### [Cargo] — [Empresa] | [Período]
- [Logro medible con verbo de acción]
- [Logro medible con verbo de acción]

## Educación
### [Título] — [Institución] | [Año]

## Idiomas
- [Idioma]: [Nivel]

PERFIL DEL CANDIDATO:
${JSON.stringify(profile, null, 2)}

VACANTE:
Título: ${vacancy.titulo}
Categoría: ${vacancy.categoria}
Ubicación: ${vacancy.ubicacion}
Descripción: ${vacancy.cuerpo || vacancy.titulo}
Habilidades requeridas: ${vacancy.vacancySkills?.join(', ') || 'No especificadas'}

REGLAS DE ESTILO OBLIGATORIAS:
- Todo el CV en PRIMERA PERSONA. Verbos: "Lideré", "Desarrollé", "Implementé", "Gestioné", "Aumenté X%", "Reduje", "Coordiné", "Diseñé", "Logré"
- Nunca uses tercera persona ("Profesional con experiencia en..." está MAL. "Cuento con experiencia en..." está BIEN)
- Incluí métricas reales o estimadas en cada logro: porcentajes, cantidades, períodos de tiempo
- El resumen profesional debe empezar con "Soy..." o "Cuento con..."

Respondé ÚNICAMENTE con el CV en markdown, sin explicaciones, sin texto antes ni después.`

    const cvMarkdown = await invokeModel(prompt, 1500)

    // Si es vacante externa (pegada por el candidato), guardarla en opportunities para enriquecer el pool
    if (!isBaseCV && vacancy?.id === 'custom' && vacancy?.cuerpo?.length > 20) {
      await supabase.from('opportunities').insert({
        titulo: vacancy.titulo || 'Vacante sin título',
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

    // Guardar en caché
    await supabase.from('generated_cvs').upsert({
      user_id: profile.user_id,
      vacancy_id: vacancyId,
      cv_markdown: cvMarkdown,
    }, { onConflict: 'user_id,vacancy_id' })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ cv: cvMarkdown, fromCache: false }),
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
