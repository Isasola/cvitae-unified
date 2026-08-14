import { readFileSync } from 'node:fs'
import { handler, normalizeLearningRecommendations } from '../netlify/functions/gemini-courses'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const unauthorized = await handler({
  httpMethod: 'POST',
  headers: {},
  body: JSON.stringify({ action: 'overview' }),
})
assert(unauthorized.statusCode === 401, 'El plan privado debe exigir una sesión válida')

const sources = [
  { id: 'job-1', slug: 'analista-power-bi', title: 'Analista Power BI', organization: 'Empresa A', updated_at: '2026-08-13T10:00:00Z' },
  { id: 'job-2', slug: 'especialista-datos', title: 'Especialista de datos', organization: 'Empresa B', updated_at: '2026-08-13T11:00:00Z' },
]
const normalized = normalizeLearningRecommendations([
  {
    skill: 'Power BI',
    providerKey: 'proveedor_inventado',
    url: 'https://evil.example/curso-inventado',
    title: 'Certificación garantizada inventada',
    learningFocus: 'Modelado, DAX y tableros aplicados a casos reales.',
    why: 'Mejora prioritaria para tus coincidencias.',
    level: 'Intermedio',
  },
  {
    skill: 'AWS',
    providerKey: 'aws_skill_builder',
    url: 'https://evil.example/aws',
    learningFocus: 'Fundamentos de nube y servicios principales.',
    why: 'Brecha observada.',
    level: 'Inicial',
  },
], [
  { skill: 'Power BI', normalizedSkill: 'power bi', sources },
  { skill: 'AWS', normalizedSkill: 'aws', sources: [sources[0]] },
])

assert(normalized.length === 2, 'Debe conservar una recomendación por brecha corroborada')
assert(normalized[0].provider_key === 'microsoft_learn', 'Power BI debe caer en Microsoft Learn si Gemini propone un proveedor inválido')
assert(normalized[1].provider_key === 'aws_skill_builder', 'AWS debe usar el catálogo oficial de AWS')
assert(normalized[0].title === 'Ruta práctica de Power BI', 'El servidor debe construir un título determinista, no aceptar uno inventado')
assert(normalized[0].why === 'Esta brecha aparece en 2 oportunidades verificadas entre tus mejores coincidencias.', 'La justificación debe construirse desde evidencia, no desde texto del modelo')
assert(normalized[0].source_snapshot.length === 2, 'Debe preservar la evidencia de oportunidades')
assert(normalized.every((item) => !item.resource_url.includes('evil.example')), 'Gemini no debe controlar ninguna URL')
assert(normalized.every((item) => [
  'www.skills.google', 'learn.microsoft.com', 'skillbuilder.aws',
  'www.coursera.org', 'www.edx.org', 'www.youtube.com',
].includes(new URL(item.resource_url).hostname)), 'Toda URL debe pertenecer a la lista cerrada')

const endpoint = readFileSync(new URL('../netlify/functions/gemini-courses.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/202608130009_learning_recommendations.sql', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/hub/LearningPlan.tsx', import.meta.url), 'utf8')

assert(endpoint.includes(".eq('is_active', true).eq('verification_status', 'verified')"), 'Las brechas deben provenir de oportunidades activas y verificadas')
assert(endpoint.includes(".eq('match_eligible', true)"), 'Las brechas deben provenir de oportunidades elegibles para matching')
assert(endpoint.includes("normalizedSkill.length < 2"), 'Debe rechazar skills demasiado cortas que generen falsos positivos')
assert(endpoint.includes("insertError.code === '23505'"), 'La recomendación debe tolerar solicitudes concurrentes idempotentes')
assert(migration.includes('learning_recommendations') && migration.includes('update_learning_recommendation_status'), 'El plan y su avance deben persistirse en base de datos')
assert(migration.includes('deleted_learning_recommendations'), 'El borrado de cuenta debe incluir el historial de aprendizaje')
assert(page.includes('/oportunidades/${source.slug}'), 'La evidencia debe enlazar a la ruta canónica de oportunidades')
assert(page.includes("action: 'status'"), 'La interfaz debe guardar los cambios de avance')

console.log('Learning plan: 19 verificaciones focalizadas superadas.')
