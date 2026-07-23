import { makeSupabaseAnon } from './_supabase'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
}

const ROUTE_LABELS: Record<string, string> = {
  'empleo-local': 'conseguir empleo en empresas de Paraguay',
  'remoto': 'conseguir trabajo remoto con empresas internacionales',
  'beca-posgrado': 'acceder a una beca o posgrado',
  'organismos': 'trabajar en organismos internacionales',
  'emprendimiento': 'lanzar o hacer crecer un emprendimiento',
  'cambio-area': 'hacer una reconversión profesional',
}

const COURSE_SCHEMA = {
  type: 'ARRAY',
  maxItems: 4,
  items: {
    type: 'OBJECT',
    required: ['skill', 'course', 'platform', 'why'],
    properties: {
      skill: { type: 'STRING' },
      course: { type: 'STRING' },
      platform: { type: 'STRING', enum: ['Coursera', 'YouTube', 'Google', 'Microsoft', 'LinkedIn Learning', 'Udemy'] },
      why: { type: 'STRING' },
    },
  },
}

function cleanText(value: unknown, maxLength = 160): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function cleanList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, limit)
}

function courseSearchUrl(platform: string, skill: string): string {
  const query = encodeURIComponent(`${skill} curso español`)
  if (platform === 'YouTube') return `https://www.youtube.com/results?search_query=${query}`
  if (platform === 'Google') return `https://grow.google/intl/es/courses-and-tools/`
  if (platform === 'Microsoft') return `https://learn.microsoft.com/es-es/training/browse/?terms=${encodeURIComponent(skill)}`
  if (platform === 'LinkedIn Learning') return `https://www.linkedin.com/learning/search?keywords=${encodeURIComponent(skill)}`
  if (platform === 'Udemy') return `https://www.udemy.com/courses/search/?q=${encodeURIComponent(skill)}`
  return `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`
}

function deterministicCourses(missingSkills: string[]) {
  return missingSkills.slice(0, 4).map((skill, index) => {
    const platform = index % 2 === 0 ? 'Coursera' : 'YouTube'
    return {
      skill,
      course: `Formación práctica en ${skill}`,
      platform,
      url: courseSearchUrl(platform, skill),
      why: 'Es una brecha frecuente entre las oportunidades que mejor coinciden con tu perfil.',
    }
  })
}

function normalizeCourses(raw: unknown, missingSkills: string[]) {
  if (!Array.isArray(raw)) return deterministicCourses(missingSkills)
  const allowedSkills = missingSkills.map((skill) => skill.toLowerCase())
  const courses = raw.slice(0, 4).map((item: any, index) => {
    const proposedSkill = cleanText(item?.skill, 80)
    const skillIndex = allowedSkills.findIndex((skill) =>
      skill === proposedSkill.toLowerCase() ||
      skill.includes(proposedSkill.toLowerCase()) ||
      proposedSkill.toLowerCase().includes(skill),
    )
    const skill = skillIndex >= 0 ? missingSkills[skillIndex] : missingSkills[index]
    if (!skill) return null
    const platform = ['Coursera', 'YouTube', 'Google', 'Microsoft', 'LinkedIn Learning', 'Udemy']
      .includes(item?.platform) ? item.platform : 'Coursera'
    return {
      skill,
      course: cleanText(item?.course, 120) || `Formación práctica en ${skill}`,
      platform,
      url: courseSearchUrl(platform, skill),
      why: cleanText(item?.why, 220) || 'Ayuda a cerrar una brecha detectada en tus oportunidades prioritarias.',
    }
  }).filter(Boolean)
  return courses.length ? courses : deterministicCourses(missingSkills)
}

export const handler = async (event: any) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const token = String(event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Sesión requerida', courses: [] }) }
    }
    const { data: { user }, error: authError } = await makeSupabaseAnon().auth.getUser(token)
    if (authError || !user) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Sesión inválida', courses: [] }) }
    }

    const body = JSON.parse(event.body || '{}')
    const profileSkills = cleanList(body.profileSkills, 30)
    const missingSkills = cleanList(body.missingSkills, 4)
    const profileTitle = cleanText(body.profileTitle, 120) || 'Profesional'
    const profileSeniority = cleanText(body.profileSeniority, 50) || 'No especificado'
    const careerGoal = ROUTE_LABELS[cleanText(body.careerRoute, 50)] || 'mejorar su empleabilidad'

    if (!missingSkills.length) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ courses: [] }) }
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('gemini-courses: GEMINI_API_KEY is not configured')
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ courses: deterministicCourses(missingSkills), fallback: true }),
      }
    }

    const prompt = `Actuá como asesor de carrera para Paraguay y Latinoamérica.

Perfil:
- Título: ${profileTitle}
- Seniority: ${profileSeniority}
- Habilidades actuales: ${profileSkills.join(', ') || 'No especificadas'}
- Objetivo: ${careerGoal}
- Brechas priorizadas con datos de oportunidades reales: ${missingSkills.join(', ')}

Recomendá exactamente una formación útil por brecha, hasta ${missingSkills.length}.
Priorizá recursos accesibles, prácticos y preferentemente en español.
No inventes métricas, porcentajes, certificaciones ni enlaces.
En "why", explicá en una oración cómo complementa el perfil y acerca al objetivo.
Usá exclusivamente las habilidades de la lista de brechas.`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 1200,
            responseMimeType: 'application/json',
            responseSchema: COURSE_SCHEMA,
          },
        }),
      },
    )

    if (!response.ok) {
      console.error(`Gemini courses failed with status ${response.status}`)
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ courses: deterministicCourses(missingSkills), fallback: true }),
      }
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
    let parsed: unknown = []
    try {
      parsed = JSON.parse(text)
    } catch {
      console.error('Gemini courses returned invalid structured output')
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ courses: normalizeCourses(parsed, missingSkills) }),
    }
  } catch (error: any) {
    console.error('gemini-courses error:', error?.message || error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'No pudimos generar recomendaciones en este momento.', courses: [] }),
    }
  }
}
