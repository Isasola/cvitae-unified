import { readFileSync } from 'node:fs'
import { handler as analyzeVacancyApplicants } from '../netlify/functions/analyze-vacancy-applicants'
import { handler as validateRecruiterToken } from '../netlify/functions/validate-recruiter-token'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const migration = readFileSync(new URL('../supabase/migrations/202608130012_progressive_vacancy_review.sql', import.meta.url), 'utf8')
const endpoint = readFileSync(new URL('../netlify/functions/analyze-vacancy-applicants.ts', import.meta.url), 'utf8')
const recruiterPanel = readFileSync(new URL('../src/pages/Recruiters.tsx', import.meta.url), 'utf8')
const recruiterApi = readFileSync(new URL('../netlify/functions/validate-recruiter-token.ts', import.meta.url), 'utf8')

assert(migration.includes('LIMIT 30'), 'Cada reclamo debe estar limitado a una tanda de 30')
assert(migration.includes('FOR UPDATE SKIP LOCKED'), 'La cola debe impedir que dos operaciones reclamen los mismos candidatos')
assert(migration.includes('pg_advisory_xact_lock'), 'La numeración de tandas debe quedar serializada por vacante')
assert(migration.includes("fit_score >= 75 THEN true"), 'Todos los perfiles fuertes deben conservarse aunque superen el top orientativo')
assert(migration.includes("ranked.retained_rank <= 10"), 'Los mejores no fuertes deben compararse progresivamente entre tandas')
assert(migration.includes("recruiter_action"), 'La migración debe documentar que el ranking no modifica la decisión humana')
assert(!migration.includes("SET recruiter_action = 'rejected'"), 'La revisión progresiva nunca debe rechazar candidatos')
assert(migration.includes('UNIQUE (recruiter_token_id, operation_id)'), 'Cada tanda debe ser idempotente por operación')
assert(migration.includes('refund_vacancy_review_batch'), 'Un fallo debe devolver créditos y liberar la tanda')

assert(endpoint.includes("rpc('claim_vacancy_review_batch'"), 'El endpoint debe reclamar cola y créditos atómicamente')
assert(endpoint.includes("rpc('settle_vacancy_review_batch'"), 'El endpoint debe cerrar la tanda transaccionalmente')
assert(endpoint.includes("rpc('refund_vacancy_review_batch'"), 'El endpoint debe devolver la reserva al fallar')
assert(!endpoint.includes('force'), 'La acción progresiva no debe reanalizar candidatos ya cobrados')
assert(endpoint.includes('No infieras edad, género, origen'), 'La evaluación debe excluir características protegidas')

assert(recruiterApi.includes('.range(from, to)'), 'El panel debe paginar sin truncar la base a 100 candidatos')
assert(recruiterApi.includes('has_more'), 'La API debe indicar si quedan candidatos para cargar')
assert(typeof validateRecruiterToken === 'function', 'La API paginada de postulantes debe compilar como función Netlify')
assert(recruiterPanel.includes('Analizar siguiente tanda'), 'El CTA debe continuar la cola en vez de reanalizar todo')
assert(recruiterPanel.includes('Cargar más candidatos'), 'La empresa debe poder recorrer todo el pool')
assert(!recruiterPanel.includes("'Re-analizar todos'"), 'El panel no debe ofrecer el reanálisis masivo accidental')
assert(recruiterPanel.includes("recommendation === 'No llamar' ? 'Revisado'"), 'Los resultados legacy no deben mostrarse como rechazo automático')

const missingOperation = await analyzeVacancyApplicants({
  httpMethod: 'POST', headers: {},
  body: JSON.stringify({ token: 'token-de-prueba', vacancy_id: 'vacante-de-prueba' }),
} as any, {} as any)
assert(missingOperation?.statusCode === 400, 'La tanda debe exigir operation_id antes de acceder a base de datos o IA')

console.log('Progressive vacancy review checks passed: queue, idempotency, refund, pagination, human decision and strong-candidate retention.')
