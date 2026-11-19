import fs from 'node:fs'

const title = 'CVitae | Empleos, oportunidades y CV en Paraguay y LATAM'
const description = 'Encontrá empleos, becas y otras oportunidades en Paraguay y LATAM. CVitae las compara con tu experiencia y te ayuda a adaptar tu CV sin inventar experiencia.'
const h1 = 'Encontrá oportunidades y prepará mejores'
const read = (path: string) => fs.readFileSync(path, 'utf8')
const requireText = (source: string, value: string, label: string) => {
  if (!source.includes(value)) throw new Error(`${label}: missing ${value}`)
}

const index = read('index.html')
const landing = read('src/pages/LandingPage.tsx')
const prerender = read('scripts/prerender.mjs')
const staticRoutes = read('src/lib/static-sitemap-routes.js')
requireText(index, `<title>${title}</title>`, 'index title')
requireText(index, `content="${description}"`, 'index description')
requireText(index, `og:title" content="${title}"`, 'index OG title')
requireText(index, 'name="twitter:title" content="CVitae | Empleos, oportunidades y CV en Paraguay y LATAM"', 'twitter title')
requireText(landing, `<title>${title}</title>`, 'runtime title')
requireText(landing, `content="${description}"`, 'runtime description')
requireText(landing, `content="${title}"`, 'runtime OG title')
requireText(landing, h1, 'runtime H1')
requireText(prerender, '<h1>Encontrá oportunidades y prepará mejores postulaciones.</h1>', 'prerender H1')
requireText(prerender, 'CVitae reúne empleos, becas y otras oportunidades', 'prerender positioning')
requireText(index, '"name": "CVitae"', 'Organization/WebSite name')
requireText(index, 'rel="canonical" href="https://cvitae.lat"', 'home canonical')
requireText(index, 'name="robots" content="index, follow"', 'home robots')
requireText(index, 'href="/favicon.svg"', 'favicon reference')
if (!fs.existsSync('public/favicon.svg')) throw new Error('public favicon missing')
if (index.includes('<title>CVitae — Analizá tu CV gratis con IA')) throw new Error('old home title still governs index')
if (landing.includes('<title>CVitae — Analizá tu CV gratis con IA')) throw new Error('old home title still governs runtime')
requireText(landing, 'score ATS', 'contextual ATS capability')
requireText(landing, 'con IA', 'contextual IA capability')
requireText(staticRoutes, "{ url: '/',", 'home sitemap route')

if (fs.existsSync('dist/index.html')) {
  const dist = read('dist/index.html')
  requireText(dist, `<title>${title}</title>`, 'built title')
  requireText(dist, `content="${description}"`, 'built description')
  requireText(dist, '<h1>Encontrá oportunidades y prepará mejores postulaciones.</h1>', 'built prerender H1')
  requireText(dist, 'href="/favicon.svg"', 'built favicon reference')
  if (!fs.existsSync('dist/favicon.svg')) throw new Error('favicon not copied to dist')
}

console.log('verify_brand_serp_item56_7: PASS')
