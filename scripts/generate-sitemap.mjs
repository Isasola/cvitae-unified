import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { STATIC_PUBLIC_SITEMAP_ROUTES } from '../src/lib/static-sitemap-routes.js'
import { fetchAllPages } from '../src/lib/paged-fetch.js'
import { canonicalSitemapRows, sitemapIndexEntries } from '../src/lib/sitemap-universe.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')
const SITE_URL = 'https://cvitae.lat'
const seoInventoryPath = path.join(__dirname, '..', 'generated', 'public-seo-inventory.json')
if (!fs.existsSync(seoInventoryPath)) throw new Error('seo_inventory_missing')
const seoInventory = JSON.parse(fs.readFileSync(seoInventoryPath, 'utf8'))
if (!seoInventory.generated_at || !Array.isArray(seoInventory.rows)) throw new Error('seo_inventory_invalid')
if (Date.now() - Date.parse(seoInventory.generated_at) > 24 * 60 * 60 * 1000) throw new Error('seo_inventory_stale')
if (seoInventory.rows.length === 0 && process.env.SEO_INVENTORY_ALLOW_EMPTY !== 'true') throw new Error('seo_inventory_empty')
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { realtime: { transport: WebSocket } })
  : null
if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true })

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const PAGE_SIZE = 1000

function urlsetXml(rows, today) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map(row => `  <url>\n    <loc>${esc(`${SITE_URL}${row.canonical_path || row.url}`)}</loc>\n    <lastmod>${(row.updated_at || today).slice(0, 10)}</lastmod>\n    <changefreq>${row.freq || 'weekly'}</changefreq>\n    <priority>${row.priority || '0.7'}</priority>\n  </url>`).join('\n')}\n</urlset>`
}

async function fetchPublicRows(table, prefix) {
  if (!supabase) return []
  const rows = await fetchAllPages(1000, async (offset, size) => {
    const orderColumn = table === 'recruiter_vacancies' ? 'created_at' : 'updated_at'
    const columns = table === 'recruiter_vacancies' ? 'id,slug,created_at' : 'id,slug,created_at,updated_at'
    let query = supabase.from(table).select(columns).not('slug', 'is', null).order(orderColumn, { ascending: false }).order('id', { ascending: true }).range(offset, offset + size - 1)
    query = table === 'content_hub' ? query.eq('tipo', 'blog').eq('is_active', true) : query.eq('is_active', true)
    const { data, error } = await query
    if (error) throw error
    return data || []
  })
  return canonicalSitemapRows(prefix, rows)
}

async function generate() {
  const today = new Date().toISOString().split('T')[0]
  const blogPosts = await fetchPublicRows('content_hub', '/blog')

  // Opportunity URLs are exclusively the pre-filtered effective SEO inventory.
  const jobs = seoInventory.rows || []

  const vacancies = await fetchPublicRows('recruiter_vacancies', '/vacante')

  const staticPages = STATIC_PUBLIC_SITEMAP_ROUTES
  const staticRows = staticPages.map(route => ({ ...route, canonical_path: route.url, updated_at: today }))
  fs.writeFileSync(path.join(distPath, 'sitemap-static.xml'), urlsetXml(staticRows, today))
  if (blogPosts.length) fs.writeFileSync(path.join(distPath, 'sitemap-blog.xml'), urlsetXml(blogPosts, today))
  if (vacancies.length) fs.writeFileSync(path.join(distPath, 'sitemap-vacancies.xml'), urlsetXml(vacancies, today))

  for (let page = 1; page <= Math.ceil(jobs.length / PAGE_SIZE); page += 1) {
    const rows = jobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(job => ({
      canonical_path: job.canonical_path,
      updated_at: job.updated_at,
      priority: job.canonical_path?.startsWith('/empleos/') ? '0.8' : '0.7',
    }))
    const pagePath = path.join(distPath, 'sitemap-opportunities', `${page}.xml`)
    fs.mkdirSync(path.dirname(pagePath), { recursive: true })
    fs.writeFileSync(pagePath, urlsetXml(rows, today))
    if (page === 1) fs.writeFileSync(path.join(distPath, 'sitemap-opportunities-1.xml'), urlsetXml(rows, today))
  }

  const entries = sitemapIndexEntries(jobs.length, blogPosts.length, vacancies.length, PAGE_SIZE)
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(name => `  <sitemap><loc>${esc(`${SITE_URL}/${name}`)}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>`
  fs.writeFileSync(path.join(distPath, 'sitemap.xml'), sitemap)
  console.log(`✅ Sitemap generado con ${(blogPosts?.length || 0) + jobs.length + staticPages.length + (vacancies?.length || 0)} URLs en ${SITE_URL}`)
}

generate().catch((error) => {
  console.error(error)
  process.exit(1)
})
