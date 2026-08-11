import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SITE_URL = 'https://cvitae.lat'
const distDir = join(process.cwd(), 'dist')
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))
const isSafeRouteSegment = value => /^[a-z0-9][a-z0-9._-]*$/i.test(String(value || ''))

async function prerender() {
  if (!existsSync(join(distDir, 'index.html'))) {
    console.error('dist/index.html no existe.')
    process.exit(0)
  }
  const templateHtml = readFileSync(join(distDir, 'index.html'), 'utf-8')

  const homeFallback = `<main aria-label="CVitae">
  <section>
    <p>Gratis · Paraguay y Latinoamérica</p>
    <h1>Analizá tu CV gratis. Después, encontrá el trabajo que te corresponde.</h1>
    <p>Subí tu CV y recibí en segundos un score ATS, fortalezas y mejoras concretas.</p>
    <ol><li>CV</li><li>Perfil entendido</li><li>Matches</li><li>Próxima acción</li></ol>
    <p><a href="#analizador">Analizar mi CV gratis</a> · <a href="/mi-carrera">Crear mi perfil</a></p>
  </section>
  <section id="analizador"><h2>Tu score ATS real, en segundos</h2><p>Análisis inicial sin crear una cuenta.</p></section>
  <section><h2>Inteligencia profesional para avanzar</h2><p>Matching de oportunidades, CV adaptado, alertas y recomendaciones para candidatos.</p></section>
  <section><h2>Herramientas para empresas</h2><p>Análisis de CVs, ranking comparativo y evaluación explicable para revisión humana.</p><a href="/empresas">Conocer la solución para empresas</a></section>
  <nav aria-label="Secciones principales"><a href="/oportunidades">Oportunidades</a> · <a href="/blog">Blog</a> · <a href="/sobre-cvitae">Sobre CVitae</a></nav>
</main>`
  writeFileSync(join(distDir, 'index.html'), templateHtml.replace('<div id="root"></div>', `<div id="root">${homeFallback}</div>`))

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Variables de Supabase no definidas: home estática generada; se omiten rutas dinámicas.')
    return
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  const { data: posts } = await supabase
    .from('content_hub').select('slug, titulo, cuerpo')
    .eq('tipo', 'blog').eq('is_active', true)

  const blogDir = join(distDir, 'blog')
  if (!existsSync(blogDir)) mkdirSync(blogDir, { recursive: true })

  if (posts) {
    for (const post of posts) {
      if (!isSafeRouteSegment(post.slug)) {
        console.warn(`Se omite blog con slug inseguro: ${post.slug}`)
        continue
      }
      const postDir = join(blogDir, post.slug)
      if (!existsSync(postDir)) mkdirSync(postDir, { recursive: true })
      const excerpt = (post.cuerpo || '').replace(/[#*`>]/g, '').substring(0, 160)
      const title = post.titulo || 'Blog'
      const metaTags = `<title>${title} | CVitae</title>
<meta name="description" content="${excerpt}">
<meta property="og:title" content="${title} | CVitae">
<meta property="og:description" content="${excerpt}">
<meta property="og:url" content="${SITE_URL}/blog/${post.slug}">
<meta property="og:type" content="article">
<link rel="canonical" href="${SITE_URL}/blog/${post.slug}">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"${title.replace(/"/g, '\\"')}","description":"${excerpt.replace(/"/g, '\\"')}","url":"${SITE_URL}/blog/${post.slug}","publisher":{"@type":"Organization","name":"CVitae","url":"${SITE_URL}"}}</script>`
      const html = templateHtml.replace(
        '<title>CVitae | Tu Agente de Carrera Inteligente para Paraguay</title>',
        metaTags
      )
      writeFileSync(join(postDir, 'index.html'), html)
    }
  }

  const { data: opps } = await supabase
    .from('content_hub').select('slug, titulo, cuerpo, categoria, ubicacion')
    .in('tipo', ['oportunidad', 'empleo', 'beca'])
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(100)

  const oppsDir = join(distDir, 'oportunidades')
  if (!existsSync(oppsDir)) mkdirSync(oppsDir, { recursive: true })

  if (opps) {
    for (const opp of opps) {
      if (!isSafeRouteSegment(opp.slug)) {
        console.warn(`Se omite oportunidad con slug inseguro: ${opp.slug}`)
        continue
      }
      const oppDir = join(oppsDir, opp.slug)
      if (!existsSync(oppDir)) mkdirSync(oppDir, { recursive: true })
      const excerpt = (opp.cuerpo || '').replace(/[#*`>]/g, '').substring(0, 160)
      const title = opp.titulo || 'Oportunidad'
      const metaTags = `<title>${title} | CVitae</title>
<meta name="description" content="${excerpt || `${title} en ${opp.ubicacion || 'Paraguay'}.`}">
<meta property="og:title" content="${title} | CVitae">
<meta property="og:url" content="${SITE_URL}/oportunidades/${opp.slug}">
<link rel="canonical" href="${SITE_URL}/oportunidades/${opp.slug}">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"${title.replace(/"/g, '\\"')}","description":"${excerpt.replace(/"/g, '\\"')}","jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"${(opp.ubicacion || 'Paraguay').replace(/"/g, '\\"')}","addressCountry":"PY"}},"hiringOrganization":{"@type":"Organization","name":"CVitae","sameAs":"${SITE_URL}"}}</script>`
      const html = templateHtml.replace(
        '<title>CVitae | Tu Agente de Carrera Inteligente para Paraguay</title>',
        metaTags
      )
      writeFileSync(join(oppDir, 'index.html'), html)
    }
  }

  const { data: jobs } = await supabase
    .from('opportunities')
    .select('slug,title,organization,location,description,created_at,updated_at,type')
    .eq('is_active', true)
    .eq('verification_status', 'verified')
    .eq('seo_eligible', true)
    .is('deleted_at', null)
    .not('slug', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1000)

  const jobsDir = join(distDir, 'empleos')
  if (!existsSync(jobsDir)) mkdirSync(jobsDir, { recursive: true })

  if (jobs) {
    for (const job of jobs) {
      if (!isSafeRouteSegment(job.slug)) {
        console.warn(`Se omite empleo con slug inseguro: ${job.slug}`)
        continue
      }
      const jobDir = join(jobsDir, job.slug)
      if (!existsSync(jobDir)) mkdirSync(jobDir, { recursive: true })
      const title = job.title || 'Empleo en Paraguay'
      const description = (job.description || `${title} en ${job.location || 'Paraguay'}.`).replace(/[#*`>]/g, '').substring(0, 160)
      const canonical = `${SITE_URL}/empleos/${job.slug}`
      const structuredData = {
        '@context': 'https://schema.org', '@type': 'JobPosting', title,
        description: job.description || description, datePosted: job.created_at,
        hiringOrganization: { '@type': 'Organization', name: job.organization || 'Empresa no informada' },
        jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location || 'Paraguay', addressCountry: 'PY' } },
        employmentType: job.type || undefined, directApply: false, url: canonical,
      }
      const metaTags = `<title>${escapeHtml(title)} | CVitae</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)} | CVitae">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<link rel="canonical" href="${canonical}">
<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>`
      const html = templateHtml.replace('<title>CVitae | Tu Agente de Carrera Inteligente para Paraguay</title>', metaTags)
      writeFileSync(join(jobDir, 'index.html'), html)
    }
  }

  const staticRoutes = [
    { path: 'empleos', title: 'Empleos en Paraguay actualizados | CVitae', desc: 'Vacantes laborales de Paraguay reunidas, deduplicadas y revisadas diariamente.' },
    { path: 'blog', title: 'Blog de Carrera | CVitae', desc: 'Consejos y guías para impulsar tu carrera en Paraguay.' },
    { path: 'about', title: 'Sobre CVitae | Agente de Carrera con IA', desc: 'La historia y misión de CVitae, el primer agente de carrera con IA para Paraguay.' },
    { path: 'privacy', title: 'Política de Privacidad | CVitae', desc: 'Política de privacidad de CVitae.' },
    { path: 'oportunidades', title: 'Oportunidades Laborales en Paraguay | CVitae', desc: 'Empleos, becas y oportunidades de crecimiento en Paraguay y Latinoamérica.' },
  ]

  for (const route of staticRoutes) {
    const routeDir = join(distDir, route.path)
    if (!existsSync(routeDir)) mkdirSync(routeDir, { recursive: true })
    const routeHtml = join(routeDir, 'index.html')
    if (!existsSync(routeHtml)) {
      const metaTags = `<title>${route.title}</title>
<meta name="description" content="${route.desc}">
<link rel="canonical" href="${SITE_URL}/${route.path}">`
      const html = templateHtml.replace(
        '<title>CVitae | Tu Agente de Carrera Inteligente para Paraguay</title>',
        metaTags
      )
      writeFileSync(routeHtml, html)
    }
  }

  console.log('🚀 Prerender completado')
}

prerender().catch(err => { console.error(err); process.exit(1) })
