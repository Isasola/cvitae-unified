import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message)
}

const state = read('src/components/cv/PublicState.tsx')
const jobs = read('src/pages/Jobs.tsx')
const opportunities = read('src/pages/Opportunities.tsx')
const shell = read('src/components/cv/SiteShell.tsx')
const notFound = read('src/pages/NotFound.tsx')
const dashboard = read('src/hub/Dashboard.tsx')

for (const primitive of ['PageLoadingState', 'PageEmptyState', 'PageErrorState']) {
  assert(state.includes(`export function ${primitive}`), `Falta primitive compartido ${primitive}`)
}
for (const page of [jobs, opportunities]) {
  assert(page.includes('PublicState'), 'Jobs y Oportunidades deben reutilizar estados compartidos')
  assert(page.includes('PageLoadingState') && page.includes('PageEmptyState') && page.includes('PageErrorState'), 'Cada listado debe separar loading, empty y error')
  assert(page.includes('onRetry='), 'Los errores de listado deben ofrecer reintento')
}
assert(state.includes('role="status"') && state.includes('role="alert"'), 'Estados deben ser accesibles y semánticamente distintos')
assert(shell.includes("{ href: '/empleos', label: 'Empleos' }") && shell.includes("{ href: '/oportunidades', label: 'Becas y programas' }"), 'La navegación pública debe mantener descubrimiento')
assert(shell.includes("{ href: '/mi-carrera', label: 'Mi carrera' }") && shell.includes("{ href: '/empresas', label: 'Para empresas' }"), 'Mi Carrera y empresas deben seguir alcanzables')
assert(shell.includes('md:hidden') && shell.includes('min-h-11'), 'La navegación móvil debe permanecer acotada y tocable')
assert(notFound.includes("import { SiteShell }") && notFound.includes('Ver empleos') && notFound.includes('Ver oportunidades') && notFound.includes('Volver al inicio'), '404 debe conservar continuidad pública y recuperación')
assert(!dashboard.includes('Score de Empleabilidad') && !dashboard.includes('score de empleabilidad'), 'Dashboard no debe presentarse principalmente como score')
assert(/employabilityScore|ATS|matching|matches/i.test(dashboard), 'La capacidad ATS/matching debe seguir contextualizada')
assert(!state.includes('analytics') && !state.includes('schema') && !state.includes('supabase'), 'El primitive no debe crear otra verdad de analytics o datos')

console.log('Item 57: estados compartidos, navegación, 404 y copy de Dashboard verificados.')
