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

  const nowIso = new Date().toISOString()
  const { data: jobs } = await supabase
    .from('opportunities').select('slug, updated_at, opportunity_type, deadline')
    .eq('is_active', true)
    .eq('verification_status', 'verified')
    .eq('catalog_eligible', true)
    .is('deleted_at', null)
    .is('archived_at', null)
    .not('slug', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(2000)

  const { data: vacancies } = await supabase
    .from('recruiter_vacancies').select('slug, updated_at')
    .eq('is_active', true)
    .not('slug', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(500)

  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

  const staticPages = [
    { url: '/', priority: '1.0', freq: 'daily' },
    { url: '/empleos', priority: '0.9', freq: 'daily' },
    { url: '/oportunidades', priority: '0.9', freq: 'daily' },
    { url: '/blog', priority: '0.8', freq: 'weekly' },
    { url: '/sobre-cvitae', priority: '0.6', freq: 'monthly' },
    { url: '/privacy', priority: '0.3', freq: 'monthly' },
    { url: '/terminos', priority: '0.3', freq: 'yearly' },
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

  const JOB_TYPES = new Set(['job', 'internship', 'consultancy'])
  const seenSlugs = new Set()
  jobs?.forEach(job => {
    if (!job.slug) return
    if (job.deadline && job.deadline < nowIso) return // expired
    const isJob = JOB_TYPES.has(job.opportunity_type || '')
    const prefix = isJob ? '/empleos' : '/oportunidades'
    const key = `${prefix}/${job.slug}`
    if (seenSlugs.has(key)) return
    seenSlugs.add(key)
    const lastmod = job.updated_at?.split('T')[0] || today
    const priority = isJob ? '0.8' : '0.7'
    sitemap += `  <url>\n    <loc>${SITE_URL}${key}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`
  })

  vacancies?.forEach(v => {
    const lastmod = v.updated_at?.split('T')[0] || today
    sitemap += `  <url>\n    <loc>${SITE_URL}/vacante/${v.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`
  })

  sitemap += '</urlset>'
  fs.writeFileSync(path.join(distPath, 'sitemap.xml'), sitemap)
  console.log(`✅ Sitemap generado con ${(blogPosts?.length || 0) + (opportunities?.length || 0) + staticPages.length} URLs en ${SITE_URL}`)
}

generate().catch(console.error)
