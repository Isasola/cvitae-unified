import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')
const sitemapPath = path.join(distPath, 'sitemap.xml')
const SITE_URL = 'https://cvitae-py.netlify.app'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Variables de Supabase no definidas para sitemap')
  process.exit(0)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true })

async function generate() {
  const { data: blogPosts } = await supabase.from('content_hub').select('slug').eq('tipo', 'blog').eq('is_active', true)
  const { data: opportunities } = await supabase.from('content_hub').select('slug').eq('tipo', 'oportunidad').eq('is_active', true)

  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  const staticPages = ['/', '/oportunidades', '/blog', '/about', '/privacy']
  staticPages.forEach(url => {
    sitemap += `  <url>\n    <loc>${SITE_URL}${url}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`
  })
  if (blogPosts) blogPosts.forEach(post => {
    sitemap += `  <url>\n    <loc>${SITE_URL}/blog/${post.slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`
  })
  if (opportunities) opportunities.forEach(opp => {
    sitemap += `  <url>\n    <loc>${SITE_URL}/oportunidades/${opp.slug}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`
  })
  sitemap += '</urlset>'
  fs.writeFileSync(sitemapPath, sitemap)
  console.log('✅ Sitemap generado')
}

generate().catch(console.error)
