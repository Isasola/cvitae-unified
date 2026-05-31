import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')
const SITE_URL = 'https://cvitae.lat'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Variables de Supabase no definidas')
  process.exit(0)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true })

async function generate() {
  const today = new Date().toISOString().split('T')[0]

  const { data: blogPosts } = await supabase
    .from('content_hub').select('slug, created_at')
    .eq('tipo', 'blog').eq('is_active', true)

  const { data: opportunities } = await supabase
    .from('content_hub').select('slug, created_at')
    .in('tipo', ['oportunidad', 'empleo', 'beca'])
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(200)

  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

  const staticPages = [
    { url: '/', priority: '1.0', freq: 'daily' },
    { url: '/oportunidades', priority: '0.9', freq: 'daily' },
    { url: '/blog', priority: '0.8', freq: 'weekly' },
    { url: '/about', priority: '0.6', freq: 'monthly' },
    { url: '/privacy', priority: '0.3', freq: 'monthly' },
  ]

  staticPages.forEach(p => {
    sitemap += `  <url>\n    <loc>${SITE_URL}${p.url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`
  })

  blogPosts?.forEach(post => {
    const lastmod = post.created_at?.split('T')[0] || today
    sitemap += `  <url>\n    <loc>${SITE_URL}/blog/${post.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`
  })

  opportunities?.forEach(opp => {
    const lastmod = opp.created_at?.split('T')[0] || today
    sitemap += `  <url>\n    <loc>${SITE_URL}/oportunidades/${opp.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`
  })

  sitemap += '</urlset>'
  fs.writeFileSync(path.join(distPath, 'sitemap.xml'), sitemap)
  console.log(`✅ Sitemap generado con ${(blogPosts?.length || 0) + (opportunities?.length || 0) + staticPages.length} URLs en ${SITE_URL}`)
}

generate().catch(console.error)
