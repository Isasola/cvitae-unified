import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const exists = (path: string) => existsSync(new URL(path, root))
const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message)
}

const consent = read('src/lib/consent.ts')
const slot = read('src/components/cv/AdSlot.tsx')
const env = read('.env.example')
const index = read('index.html')
const routePolicy = read('src/lib/ad-route-policy.ts')
const presentation = read('src/components/cvitae/OpportunityPresentation.tsx')

assert(consent.includes("VITE_GOOGLE_ADSENSE_READY === 'true'"), 'AdSense necesita el gate operativo')
assert(consent.includes("VITE_GOOGLE_CERTIFIED_CMP_READY === 'true'"), 'AdSense necesita CMP certificada')
assert(consent.includes('preferences?.advertising && adsReady'), 'AdSense necesita consentimiento publicitario')
assert(env.includes('VITE_GOOGLE_ADSENSE_READY=false') && env.includes('VITE_GOOGLE_CERTIFIED_CMP_READY=false'), 'La configuración por defecto debe apagar anuncios')
assert(env.includes('VITE_ADSENSE_PREVIEW=false'), 'La vista previa debe estar apagada por defecto')
assert(slot.includes('if (!active) return null'), 'Un slot apagado no debe producir markup ni espacio')
assert(slot.includes('aria-label="Publicidad"') && slot.includes('data-ad-placement'), 'Un slot futuro debe ser distinguible')
assert(!index.includes('pagead2.googlesyndication.com') && !index.includes('googletagmanager.com/gtag/js'), 'No debe haber scripts publicitarios estaticos')
assert(!exists('public/ads.txt'), 'No debe inventarse ads.txt sin publisher configurado')
assert(!presentation.includes('AdSlot'), 'El CTA de postulación no debe contener publicidad')

for (const privatePage of [
  'src/hub/ApplicationWorkspace.tsx', 'src/hub/ProfileBuilder.tsx', 'src/hub/Dashboard.tsx',
  'src/pages/AuthCallback.tsx', 'src/pages/Admin.tsx', 'src/pages/Recruiters.tsx',
]) assert(!read(privatePage).includes('AdSlot'), `No debe haber publicidad en ${privatePage}`)

for (const detail of ['src/pages/JobDetail.tsx', 'src/pages/OpportunityDetail.tsx', 'src/pages/VacantePage.tsx']) {
  assert(!read(detail).includes('AdSlot'), `El detalle ${detail} no debe colocar un slot junto al CTA`) 
}

for (const marker of ['/empleos/:slug', '/oportunidades/:slug', '/blog/*', '/mi-carrera/*', '/auth/*', '/admin/*']) {
  assert(routePolicy.includes(marker), `Falta clasificación de ruta ${marker}`)
}
assert(routePolicy.includes('ADS_FUTURE_ALLOWED') && routePolicy.includes('ADS_NOT_APPROPRIATE') && routePolicy.includes('ADS_UNDECIDED'), 'La política de rutas debe distinguir los tres estados')

const forbidden = [
  'src/hub/ApplicationWorkspace.tsx', 'src/hub/ProfileBuilder.tsx', 'src/pages/AuthCallback.tsx',
].map(read).join('\n')
assert(!/pagead2\.googlesyndication\.com|adsbygoogle/i.test(forbidden), 'No debe cargarse una red publicitaria en workflows privados')

console.log('Item 56.8: política de anuncios, consentimiento y slots apagados verificados.')
