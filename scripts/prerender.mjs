import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { console.warn('⚠️ Variables de Supabase no definidas'); process.exit(0) }

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const distDir = join(process.cwd(), 'dist')

async function prerender() {
  if (!existsSync(join(distDir, 'index.html'))) {
    console.error('dist/index.html no existe. Corré el build primero.')
    process.exit(0)
  }
  const templateHtml = readFileSync(join(distDir, 'index.html'), 'utf-8')

  const { data: posts } = await supabase.from('content_hub').select('slug, titulo, cuerpo').eq('tipo', 'blog').eq('is_active', true)
  if (!posts || posts.length === 0) { console.log('No hay posts'); }

  const blogDir = join(distDir, 'blog')
  if (!existsSync(blogDir)) mkdirSync(blogDir, { recursive: true })

  if (posts) {
    for (const post of posts) {
      if (!post.slug) continue
      const postDir = join(blogDir, post.slug)
      if (!existsSync(postDir)) mkdirSync(postDir, { recursive: true })
      
      const excerpt = (post.cuerpo || '').replace(/[#*`>]/g, '').substring(0, 160)
      const title = post.titulo || 'Blog'
      const metaTags = `<title>${title} | CVitae</title><meta name="description" content="${excerpt}"><meta property="og:title" content="${title}"><meta property="og:description" content="${excerpt}"><link rel="canonical" href="https://cvitae-py.netlify.app/blog/${post.slug}">`
      const html = templateHtml.replace('<title>CVitae</title>', metaTags)
      
      writeFileSync(join(postDir, 'index.html'), html)
    }
  }

  const staticRoutes = ['blog', 'about', 'privacy', 'oportunidades', 'mi-carrera']
  for (const route of staticRoutes) {
    const routeDir = join(distDir, route)
    if (!existsSync(routeDir)) mkdirSync(routeDir, { recursive: true })
    const routeHtml = join(routeDir, 'index.html')
    if (!existsSync(routeHtml)) writeFileSync(routeHtml, templateHtml)
  }
  console.log('🚀 Prerender completado')
}

prerender().catch(err => { console.error(err); process.exit(0) })
