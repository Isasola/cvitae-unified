import { readFileSync } from 'node:fs'
import { handler } from '../netlify/functions/submit-feedback'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const invoke = (body: unknown, headers: Record<string, string> = {}) => handler({
  httpMethod: 'POST', headers, body: JSON.stringify(body),
})

const wrongMethod = await handler({ httpMethod: 'GET', headers: {}, body: null })
assert(wrongMethod.statusCode === 405, 'El endpoint debe rechazar métodos distintos de POST')

const invalidOrigin = await invoke({ audience: 'b2c' }, { origin: 'https://evil.example' })
assert(invalidOrigin.statusCode === 403, 'El endpoint debe rechazar orígenes no autorizados')

const invalidClassification = await invoke({
  audience: 'unknown', category: 'arbitrary', severity: 'critical', feature: 'CV',
  message: 'Este mensaje tiene longitud suficiente.', pagePath: '/mi-carrera/cv',
})
assert(invalidClassification.statusCode === 400, 'La clasificación debe estar cerrada a valores permitidos')

const shortMessage = await invoke({
  audience: 'b2c', category: 'bug', severity: 'major', feature: 'CV',
  message: 'Muy corto', pagePath: '/mi-carrera/cv',
})
assert(shortMessage.statusCode === 400, 'Debe exigir una descripción útil antes de acceder a base de datos')

const invalidEmail = await invoke({
  audience: 'b2b', category: 'bug', severity: 'major', feature: 'Acceso',
  message: 'No puedo iniciar sesión con mi acceso empresarial.', pagePath: '/empresas', email: 'correo-invalido',
})
assert(invalidEmail.statusCode === 400, 'Debe validar el email opcional')

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const endpoint = read('netlify/functions/submit-feedback.ts')
const component = read('src/components/cv/FeedbackReporter.tsx')
const migration = read('supabase/migrations/202608130010_product_feedback.sql')
const adminApi = read('netlify/functions/admin-data.ts')
const admin = read('src/pages/Admin.tsx')
const dashboard = read('src/components/cvitae/DashboardLayout.tsx')
const recruiters = read('src/pages/Recruiters.tsx')
const batch = read('src/pages/BatchAnalysis.tsx')

assert(endpoint.includes("limit: 8") && endpoint.includes("scope: 'product-feedback'"), 'Los reportes deben tener rate limit')
assert(endpoint.includes('escapeHtml') && endpoint.includes('replace(/[&<>\'\"]'), 'La notificación debe escapar HTML aportado por usuarios')
assert(endpoint.includes('viewport:') && endpoint.includes('userAgent:') && !endpoint.includes('...body.context'), 'El contexto debe construirse desde una lista cerrada')
assert(endpoint.includes(".eq('access_token', recruiterToken)"), 'Un reporte B2B autenticado debe vincularse a la empresa validada')
assert(endpoint.includes("from('product_feedback').insert(report)"), 'La base debe ser la fuente de verdad antes del correo')
assert(component.includes('No adjuntamos automáticamente tu CV'), 'La interfaz debe explicar qué datos no captura')
assert(component.includes('data.reference') && component.includes('Reporte guardado'), 'El usuario debe recibir una referencia')
assert(dashboard.includes('<FeedbackReporter audience="b2c"'), 'El reportero debe estar disponible en todo B2C')
assert(recruiters.includes('<FeedbackReporter audience="b2b"'), 'El reportero debe estar disponible en el portal B2B')
assert(batch.includes('feature="Análisis masivo B2B"'), 'El análisis masivo debe identificar su contexto')
assert(migration.includes('product_feedback_events') && migration.includes('previous_status'), 'Los cambios de estado deben ser auditables')
assert(migration.includes('deleted_product_feedback'), 'El borrado de cuenta B2C debe incluir sus reportes')
assert(adminApi.includes('list_product_feedback') && adminApi.includes('update_product_feedback'), 'El admin debe listar y gestionar reportes')
assert(admin.includes("id: 'feedback'") && admin.includes('Errores y mejoras reportadas'), 'El admin debe exponer una bandeja operativa')

console.log('Reportes de producto: 19 verificaciones focalizadas superadas.')
