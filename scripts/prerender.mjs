import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SITE_URL = 'https://cvitae.lat'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ Variables de Supabase no definidas')
  process.exit(0)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const distDir = join(process.cwd(), 'dist')

async function prerender() {
  if (!existsSync(join(distDir, 'index.html'))) {
    console.error('dist/index.html no existe.')
    process.exit(0)
  }
  const templateHtml = readFileSync(join(distDir, 'index.html'), 'utf-8')

  const { data: posts } = await supabase
    .from('content_hub').select('slug, titulo, cuerpo')
    .eq('tipo', 'blog').eq('is_active', true)

  const blogDir = join(distDir, 'blog')
  if (!existsSync(blogDir)) mkdirSync(blogDir, { recursive: true })

  if (posts) {
    for (const post of posts) {
      if (!post.slug) continue
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
      if (!opp.slug) continue
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

  const staticRoutes = [
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

prerender().catch(err => { console.error(err); process.exit(0) })
