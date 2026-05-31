export const handler = async (event: any) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { profileSkills, missingSkills } = JSON.parse(event.body || '{}')
    if (!missingSkills?.length) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ courses: [] }) }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')

    const prompt = `Sos un asesor de carrera experto en el mercado laboral de Paraguay y Latinoamérica.

El usuario tiene estas habilidades: ${profileSkills.join(', ')}
Le faltan estas habilidades para mejorar su empleabilidad: ${missingSkills.join(', ')}

Recomendá exactamente ${missingSkills.length} cursos online (uno por habilidad faltante). Priorizá cursos en español, gratuitos o económicos, disponibles en Udemy, Coursera o YouTube.

Respondé ÚNICAMENTE con este JSON válido, sin texto extra ni markdown:
[
  {
    "skill": "nombre exacto de la habilidad faltante",
    "course": "nombre real y específico del curso",
    "platform": "Udemy|Coursera|YouTube|LinkedIn Learning",
    "url": "URL real de búsqueda: https://www.udemy.com/courses/search/?q=SKILL o https://www.coursera.org/search?query=SKILL o https://www.youtube.com/results?search_query=SKILL+curso+español",
    "why": "una línea explicando por qué este curso ayuda específicamente a este perfil"
  }
]`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
        }),
      }
    )

    if (!response.ok) throw new Error('Error llamando a Gemini')

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    const clean = text.replace(/```json|```/g, '').trim()

    let courses = []
    try {
      courses = JSON.parse(clean)
    } catch {
      courses = []
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ courses }),
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message, courses: [] }),
    }
  }
}
