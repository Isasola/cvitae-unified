import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  analyticsAiRequested,
  analyticsGeminiConfigured,
  CLOSED_ANALYTICS_RANGES,
} from '../netlify/functions/lib/admin-analytics-policy'
import { callGemini } from '../netlify/functions/admin-analytics'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string) => readFileSync(join(root, path), 'utf8')

assert.equal(analyticsAiRequested({}), false, 'Cargar métricas no debe solicitar IA')
assert.equal(analyticsAiRequested({ includeAi: false }), false, 'Un refresh determinístico no debe solicitar IA')
assert.equal(analyticsAiRequested({ includeAi: true }), true, 'El botón de análisis debe habilitar una llamada')
assert.equal(analyticsAiRequested({ question: '  ' }), false, 'Una pregunta vacía no debe habilitar IA')
assert.equal(analyticsAiRequested({ question: '¿Qué cambió?' }), true, 'Una pregunta explícita debe habilitar una llamada')
assert.equal(analyticsGeminiConfigured(undefined), false)
assert.equal(analyticsGeminiConfigured('  '), false)
assert.equal(analyticsGeminiConfigured('test-key'), true)

assert.deepEqual(CLOSED_ANALYTICS_RANGES.current7d, { startDate: '7daysAgo', endDate: 'yesterday' })
assert.deepEqual(CLOSED_ANALYTICS_RANGES.previous7d, { startDate: '14daysAgo', endDate: '8daysAgo' })

let providerCalls = 0
const providerFailure = await callGemini('test-key', 'fixture without PII', async () => {
  providerCalls += 1
  return new Response('rate limited', { status: 429 })
})
assert.equal(providerCalls, 1, 'Una acción explícita debe producir como máximo una llamada Gemini')
assert.deepEqual(providerFailure, { code: 'http_error', message: 'HTTP 429', httpStatus: 429 })

const backend = read('netlify/functions/admin-analytics.ts')
const frontend = read('src/components/admin/AdminGrowthCenter.tsx')
const runtimeGeminiSection = backend.lastIndexOf('// ── Gemini')
const responseSection = backend.lastIndexOf('// ── Response')
assert(backend.indexOf('const dataset =') < runtimeGeminiSection, 'Las métricas deben construirse antes de Gemini')
assert(runtimeGeminiSection < responseSection, 'Un fallo Gemini debe conservar la respuesta determinística')
assert.equal((backend.match(/await callGemini\(/g) || []).length, 1, 'El endpoint no debe encadenar llamadas Gemini')
assert(frontend.includes("fetchData(launchMode ? 'launch' : 'standard', parsed, false)"), 'Montar Analytics debe usar includeAi=false')
assert(frontend.includes("fetchData(launchMode ? 'launch' : 'standard', launchEvents, true)"), 'El botón explícito debe usar includeAi=true')
assert(!frontend.includes('import.meta.env.VITE_GEMINI'), 'El frontend no debe consultar una API key')

console.log('PASS verify-admin-analytics: GA4 usa períodos cerrados; Gemini es lazy, acotado y reporta estado server-side')
