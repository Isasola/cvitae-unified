import { readFileSync } from 'node:fs'
import { percentChange } from '../netlify/functions/lib/google-reporting'

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(percentChange(120, 100) === 20, 'La comparación debe expresar crecimiento porcentual')
assert(percentChange(80, 100) === -20, 'La comparación debe expresar caída porcentual')
assert(percentChange(10, 0) === null, 'Una base cero no debe producir infinito ni un porcentaje engañoso')

process.env.ADMIN_PASSWORD = 'admin-operations-test'
const { handler } = await import('../netlify/functions/admin-data')
const { zonedDayStart } = await import('../netlify/functions/admin-data')
assert(zonedDayStart(new Date('2026-08-13T02:30:00.000Z')).toISOString() === '2026-08-12T03:00:00.000Z', 'Antes de medianoche local debe pertenecer al día paraguayo anterior')
assert(zonedDayStart(new Date('2026-08-13T04:00:00.000Z')).toISOString() === '2026-08-13T03:00:00.000Z', 'El inicio debe respetar el offset real de America/Asuncion')
const wrongMethod = await handler({ httpMethod: 'GET' } as any, {} as any)
assert(wrongMethod.statusCode === 405, 'El Admin debe rechazar métodos distintos de POST')
const unauthorized = await handler({ httpMethod: 'POST', body: JSON.stringify({ password: 'incorrecta', action: 'metrics' }) } as any, {} as any)
assert(unauthorized.statusCode === 401, 'Las métricas operativas deben permanecer detrás de la autenticación administrativa')

const api = read('netlify/functions/admin-data.ts')
const google = read('netlify/functions/lib/google-reporting.ts')
const admin = read('src/pages/Admin.tsx')
const migration = read('supabase/migrations/202608130011_admin_operations_brief.sql')
const docs = read('docs/ADMIN-OPERATIONS.md')

assert(api.includes('admin_daily_growth') && api.includes('queues:'), 'El brief debe usar crecimiento agregado y colas reales')
assert(api.includes('zonedDayStart') && api.includes('America/Asuncion'), 'Los cortes diarios deben usar la zona IANA de Paraguay')
assert(!api.includes('setUTCHours(4'), 'El día paraguayo no puede depender de UTC-4 fijo')
assert(api.includes('allDuplicates') && api.includes('outcome_reason'), 'Duplicados, cero resultados y fallos deben distinguirse')
assert(api.includes('ingestionToday') && api.includes('newToday:'), 'El Admin debe informar el resultado de las ejecuciones del día')
assert(api.includes('count: "exact", head: true') && api.includes('alertStatuses.map'), 'Los estados de alertas deben contarse sin un límite de filas')
assert(migration.includes("AT TIME ZONE 'America/Asuncion'") && migration.includes('REVOKE ALL'), 'La serie diaria debe ser privada y consistente con Paraguay')

assert(google.includes('56daysAgo') && google.includes('29daysAgo'), 'GA4 debe comparar contra los 28 días anteriores')
assert(google.includes('topLandingPages') && google.includes('topChannels'), 'GA4 debe aportar canales y landing pages, no sólo totales')
assert(google.includes('topQueries') && google.includes('topPages') && google.includes('dimensions: ["date"]'), 'Search Console debe aportar consultas, páginas y tendencia')
assert(google.includes('dataState: "final"') && google.includes('reportCache'), 'Google debe usar datos cerrados y limitar consumo de API')

assert(admin.includes('COLA DE DECISIONES') && admin.includes('operationsQueue'), 'El brief debe priorizar decisiones sobre métricas decorativas')
assert(admin.includes('CRECIMIENTO · 14 DÍAS') && admin.includes('opportunitiesVerified'), 'El Admin debe mostrar crecimiento diario y verificación')
assert(admin.includes('outcome_reason') && admin.includes('SIN NOVEDADES'), 'La UI debe explicar el resultado real de cada scraper')
assert(admin.includes('GA4 NUEVOS') && admin.includes('PÁGINAS SEARCH'), 'La adquisición debe ser más profunda que cuatro contadores')
assert(!admin.includes('Sistema operativo · scrapers activos · emails verificados'), 'El Admin no debe declarar salud sin evidencia')
assert(docs.includes('no representa la salud del scraper') && docs.includes('Verificación posterior al despliegue'), 'El procedimiento operativo debe conservar la semántica y el smoke test')

console.log('Admin operativo: 24 verificaciones focalizadas superadas.')
