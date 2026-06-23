export const handler = async (event: any) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { profileSkills, missingSkills, profileTitle, profileSeniority, careerRoute } = JSON.parse(event.body || '{}')
    if (!missingSkills?.length) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ courses: [] }) }

    const ROUTE_LABELS: Record<string, string> = {
      'empleo-local':   'conseguir empleo en empresas locales en Paraguay',
      'remoto':         'conseguir trabajo remoto con empresas internacionales',
      'beca-posgrado':  'acceder a una beca de posgrado o especialización en el exterior',
      'organismos':     'trabajar en organismos internacionales (ONU, BID, OEA, PNUD)',
      'emprendimiento': 'lanzar un emprendimiento y acceder a capital semilla o aceleradoras',
      'cambio-area':    'hacer un cambio de área o reconversión profesional',
    }
    const routeContext = careerRoute && ROUTE_LABELS[careerRoute]
      ? `El objetivo principal del usuario es: ${ROUTE_LABELS[careerRoute]}.`
      : 'El objetivo del usuario no está definido — recomendá habilidades de alto impacto laboral general.'

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY no configurada')

    const prompt = `Sos un asesor de carrera senior especializado en el mercado laboral de Paraguay y Latinoamérica, con conocimiento actualizado de tendencias 2024-2025.

PERFIL DEL USUARIO:
- Título: ${profileTitle || 'Profesional'}
- Nivel: ${profileSeniority || 'Semi-Senior'}
- Habilidades actuales: ${profileSkills?.join(', ') || 'No especificadas'}
- Habilidades que le faltan según el mercado: ${missingSkills.join(', ')}

OBJETIVO DE CARRERA:
${routeContext}

Tu tarea: Recomendá ${Math.min(missingSkills.length, 4)} recursos de aprendizaje (cursos, certificaciones o recursos) — uno por habilidad faltante prioritaria.

Cada recomendación DEBE estar alineada con el objetivo de carrera del usuario. No recomendés cursos genéricos — explicá concretamente cómo esa habilidad lleva al usuario más cerca de su objetivo.

Para cada recomendación considerá:
1. Qué demanda el mercado objetivo HOY (local, remoto, organismos, etc. según el objetivo)
2. Cómo esa habilidad complementa lo que el usuario YA sabe
3. El impacto concreto en sus chances de lograr el objetivo (estimá un % de mejora realista)
4. Que sea accesible (gratuito o económico, en español preferentemente)

Respondé ÚNICAMENTE con este JSON válido, sin texto extra ni markdown:
[
  {
    "skill": "nombre de la habilidad faltante",
    "course": "nombre real y específico del curso o recurso",
    "platform": "Udemy|Coursera|YouTube|LinkedIn Learning|Google|Microsoft",
    "url": "URL de búsqueda real: https://www.udemy.com/courses/search/?q=TERMINO o https://www.coursera.org/search?query=TERMINO o https://www.youtube.com/results?search_query=TERMINO+curso+español",
    "level": "Básico|Intermedio|Avanzado",
    "duration": "estimación: ej. 8 horas, 4 semanas",
    "impact": "Dominar [skill] puede aumentar tus chances de conseguir empleo en un X% porque [razón específica basada en el mercado paraguayo]",
    "why": "Con tu objetivo de [objetivo de carrera] y tu experiencia en [habilidades actuales], agregar [skill] te permite [beneficio concreto y específico para ese objetivo]"
  }
]`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1500,
          },
        }),
      }
    )

    if (!response.ok) {
      const errBody = await response.text()
      // Fallback a Haiku si Gemini falla
      console.error(`Gemini error ${response.status}: ${errBody}`)
      return useFallbackHaiku(profileSkills, missingSkills, profileTitle, profileSeniority, careerRoute, corsHeaders)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    const clean = text.replace(/```json|```/g, '').trim()
    let courses = []
    try {
      courses = JSON.parse(clean)
    } catch {
      return useFallbackHaiku(profileSkills, missingSkills, profileTitle, profileSeniority, careerRoute, corsHeaders)
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ courses }),
    }
  } catch (err: any) {
    console.error('gemini-courses error:', err.message)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message, courses: [] }),
    }
  }
}

async function useFallbackHaiku(
  profileSkills: string[],
  missingSkills: string[],
  profileTitle: string,
  profileSeniority: string,
  careerRoute: string,
  corsHeaders: any
) {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) throw new Error('Sin API key de fallback')

    const routeHint = careerRoute ? ` Su objetivo es: ${careerRoute}.` : ''

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Sos asesor de carrera para Paraguay. El usuario es ${profileTitle || 'profesional'} ${profileSeniority || ''} con skills: ${profileSkills?.join(', ')}.${routeHint} Le faltan: ${missingSkills.join(', ')}. Recomendá ${Math.min(missingSkills.length, 4)} cursos online accesibles alineados con su objetivo. Respondé SOLO con JSON array: [{"skill":"...","course":"...","platform":"Udemy|Coursera|YouTube","url":"URL de búsqueda real","level":"Básico|Intermedio","duration":"X horas","impact":"Puede mejorar tus chances un X%","why":"Con tu objetivo de... y tu experiencia en..."}]`
        }],
      }),
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || '[]'
    const clean = text.replace(/```json|```/g, '').trim()
    const courses = JSON.parse(clean)
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ courses, fallback: true }),
    }
  } catch {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ courses: [] }),
    }
  }
}
