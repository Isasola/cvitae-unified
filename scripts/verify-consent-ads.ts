import { readFileSync } from 'node:fs'

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const index = read('index.html')
const main = read('src/main.tsx')
const app = read('src/App.tsx')
const consent = read('src/lib/consent.ts')
const analytics = read('src/lib/analytics.ts')
const banner = read('src/components/cv/CookiePreferences.tsx')
const adSlot = read('src/components/cv/AdSlot.tsx')
const jobs = read('src/pages/Jobs.tsx')
const opportunities = read('src/pages/Opportunities.tsx')
const blog = read('src/pages/BlogPost.tsx')
const envExample = read('.env.example')

assert(!index.includes('googletagmanager.com/gtag/js'), 'Analytics no debe cargarse estáticamente antes del consentimiento')
assert(!index.includes('pagead2.googlesyndication.com'), 'AdSense no debe cargarse estáticamente')
assert(main.indexOf('initializeConsentMode()') < main.indexOf('ReactDOM.createRoot'), 'El consentimiento predeterminado debe establecerse antes de montar la aplicación')
assert(consent.includes("ad_storage: 'denied'") && consent.includes("analytics_storage: 'denied'"), 'Google Consent Mode debe comenzar denegado')
assert(consent.includes('Advanced Consent Mode') && consent.includes('VITE_GA_MEASUREMENT_ID'), 'GA4 debe inicializarse en modo avanzado bajo el estado de consentimiento')
assert(consent.includes('dataLayer?.push(arguments)'), 'gtag debe conservar el objeto Arguments que consume el script oficial')
assert(!consent.includes('dataLayer?.push(args)'), 'gtag no debe convertir sus comandos a Array')
assert(consent.includes('function googleCommand(...command: unknown[])'), 'googleCommand debe preservar la aridad de cada comando, especialmente js')
assert(consent.includes('analyticsLocationSafe()'), 'GA4 no debe cargar en URLs que puedan contener credenciales o PII')
assert(analytics.includes("readConsent()?.analytics === true"), 'Los eventos personalizados deben exigir consentimiento explícito')
assert(!main.includes("'page_view'") && !app.includes("'page_view'") && !consent.includes("'page_view'"), 'Enhanced Measurement debe seguir siendo el único responsable de page_view SPA')
assert(consent.includes('preferences?.advertising && adsReady'), 'AdSense debe exigir consentimiento y habilitación operativa')
assert(consent.includes("VITE_GOOGLE_ADSENSE_READY === 'true'"), 'Debe existir un interruptor de seguridad independiente')
assert(banner.includes('Solo necesarias') && banner.includes('Aceptar todas') && banner.includes('Guardar selección'), 'El aviso debe ofrecer opciones equivalentes y granulares')
assert(banner.includes('Ninguna elección limita las herramientas profesionales'), 'Rechazar cookies no debe bloquear las funciones del producto')
assert(adSlot.includes('aria-label="Publicidad"') && adSlot.includes('data-ad-placement'), 'Cada anuncio debe distinguirse del contenido')
assert((jobs.match(/<AdSlot/g) || []).length === 1, 'Empleos debe tener como máximo un espacio publicitario')
assert((opportunities.match(/<AdSlot/g) || []).length === 1, 'Oportunidades debe tener como máximo un espacio publicitario')
assert((blog.match(/<AdSlot/g) || []).length === 1, 'Un artículo debe tener como máximo un espacio publicitario')

for (const privatePage of [
  'src/hub/Dashboard.tsx', 'src/hub/ProfileBuilder.tsx', 'src/hub/JobMatcher.tsx',
  'src/hub/CVVivo.tsx', 'src/hub/ATSDiagnostic.tsx', 'src/hub/CVRewrite.tsx',
  'src/hub/ApplicationWorkspace.tsx', 'src/hub/LearningPlan.tsx',
  'src/pages/Recruiters.tsx', 'src/pages/BatchAnalysis.tsx',
]) {
  assert(!read(privatePage).includes('AdSlot'), `No debe haber publicidad en ${privatePage}`)
}

assert(envExample.includes('VITE_GOOGLE_ADSENSE_READY=false'), 'La configuración de ejemplo debe mantener AdSense apagado')
assert(envExample.includes('VITE_ADSENSE_PREVIEW=false'), 'La vista previa no debe quedar activa en producción')

console.log('Consentimiento y publicidad: 33 verificaciones focalizadas superadas.')
