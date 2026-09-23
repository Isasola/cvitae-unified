import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const prerender = read('scripts/prerender.mjs')
const admin = read('netlify/functions/admin-data.ts')
const jobs = read('src/pages/Jobs.tsx')
const alertas = read('src/hub/Alertas.tsx')

// These byte-pattern remnants are never valid user-facing text in the
// generated prerender surface. Alertas is intentionally excluded: it owns a
// literal repair map for historical payloads and must retain those inputs.
const obviousMojibake = /[\u00c3\u00c2\u00e2\u00f0\u0178\u201c\u008d]/
assert.doesNotMatch(prerender, obviousMojibake, 'prerender user-facing text has no mojibake markers')
assert.ok(alertas.includes('\u00c3'), 'Alertas retains its intentional mojibake repair-map literals')

assert.ok(admin.includes('La oportunidad cambió mientras la revisabas. Recargá antes de decidir.'))
assert.ok(admin.includes('Verificá la convocatoria en su fuente original antes de aprobarla'))
assert.ok(!admin.includes('La oportunidad cambiÃ³ mientras la revisabas.'))
assert.ok(!admin.includes('VerificÃ¡ la convocatoria en su fuente original antes de aprobarla'))

assert.ok(!jobs.includes("cleanLocation(job.location) || 'Paraguay'"), 'unknown job location is not presented as Paraguay')
assert.ok(!prerender.includes("vacancy.location || 'Paraguay'"), 'vacancy fallback description never invents Paraguay')

console.log('verify_text_integrity_item49: PASS prerender=utf8 admin_errors=utf8 unknown_location=honest alertas=repair-map-allowed')
