import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

    const prompt = `Sos un experto en redacción de CVs para el mercado latinoamericano, especializado en formato híbrido ATS-friendly.

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

Respondé ÚNICAMENTE con el CV en markdown, sin explicaciones, sin texto antes ni después.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const cvMarkdown = message.content[0].type === 'text' ? message.content[0].text : ''

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ cv: cvMarkdown }),
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
