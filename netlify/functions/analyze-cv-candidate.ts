import { Handler } from "@netlify/functions"
import Anthropic from "@anthropic-ai/sdk"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
}

function extractJSON(text: string): any {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) return JSON.parse(codeBlockMatch[1].trim())
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return JSON.parse(jsonMatch[0])
  return JSON.parse(text.trim())
}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { cvText, mode } = JSON.parse(event.body || '{}')
    
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
    
    if (!cvText || String(cvText).trim().length < 20) {
      return { 
        statusCode: 400, 
        headers: corsHeaders, 
        body: JSON.stringify({ error: 'CV text is required and must have at least 20 characters' }) 
      }
    }

    const client = new Anthropic({ apiKey })
    
    let prompt = ''
    if (mode === 'extract') {
      prompt = `Extraé la información del siguiente CV y respondé ÚNICAMENTE con este JSON válido, sin texto extra, sin markdown, sin comillas adicionales:
{
  "full_name": "nombre completo",
  "email": "email detectado o vacío",
  "professional_title": "título profesional",
  "skills": ["skill1", "skill2"],
  "location": "ciudad, país",
  "seniority": "junior",
  "education": [{ "institution": "nombre", "degree": "carrera", "year": 2020 }],
  "experience": [{ "company": "empresa", "position": "cargo", "years": 2, "achievements": ["logro"] }],
  "languages": [{ "language": "idioma", "level": "nivel" }]
}
CV:
${cvText}`
    } else {
      prompt = `Analizá este CV para el mercado laboral paraguayo y latinoamericano. Respondé ÚNICAMENTE con este JSON sin texto extra:
{
  "atsScore": 75,
  "strengths": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],
  "criticalImprovements": ["mejora 1", "mejora 2", "mejora 3"],
  "missingKeywords": ["keyword1", "keyword2"],
  "summary": "resumen breve del perfil en 2 oraciones"
}
CV:
${cvText}`
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    
    let analysis
    try {
      analysis = extractJSON(responseText)
    } catch {
      analysis = mode === 'extract' 
        ? { full_name: '', email: '', professional_title: '', skills: [], location: '', seniority: 'junior', education: [], experience: [], languages: [] }
        : { atsScore: 50, strengths: [], criticalImprovements: ['No se pudo analizar el CV correctamente'], missingKeywords: [], summary: '' }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(analysis),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message || 'Error interno del servidor' }),
    }
  }
}

export { handler }
