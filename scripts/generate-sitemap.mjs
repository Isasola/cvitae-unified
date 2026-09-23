import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { STATIC_PUBLIC_SITEMAP_ROUTES } from '../src/lib/static-sitemap-routes.js'
import { fetchAllPages } from '../src/lib/paged-fetch.js'
import { canonicalSitemapRows } from '../src/lib/sitemap-universe.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')
const SITE_URL = 'https://cvitae.lat'
const seoInventoryPath = path.join(__dirname, '..', 'generated', 'public-seo-inventory.json')
if (!fs.existsSync(seoInventoryPath)) throw new Error('seo_inventory_missing')
const seoInventory = JSON.parse(fs.readFileSync(seoInventoryPath, 'utf8'))
if (!seoInventory.generated_at || !Array.isArray(seoInventory.rows)) throw new Error('seo_inventory_invalid')
if (Date.now() - Date.parse(seoInventory.generated_at) > 24 * 60 * 60 * 1000) throw new Error('seo_inventory_stale')
if (seoInventory.rows.length === 0 && process.env.SEO_INVENTORY_ALLOW_EMPTY !== 'true') throw new Error('seo_inventory_empty')
const allowedSeoPaths = new Set((seoInventory.rows || []).map(row => row.canonical_path))

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { realtime: { transport: WebSocket } })
  : null
if (!fs.existsSync(distPath)) fs.mkdirSync(distPath, { recursive: true })

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function fetchPublicRows(table, prefix) {
  if (!supabase) return []
  const rows = await fetchAllPages(1000, async (offset, size) => {
    let query = supabase.from(table).select('id,slug,created_at,updated_at').not('slug', 'is', null).order('updated_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + size - 1)
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

  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
  sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

  const staticPages = STATIC_PUBLIC_SITEMAP_ROUTES

  staticPages.forEach(p => {
    sitemap += `  <url>\n    <loc>${esc(`${SITE_URL}${p.url}`)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`
  })

  blogPosts.forEach(post => {
    const lastmod = post.updated_at?.split('T')[0] || today
    sitemap += `  <url>\n    <loc>${esc(`${SITE_URL}${post.canonical_path}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`
  })

  const seenSlugs = new Set()
  jobs?.forEach(job => {
    if (!job.slug) return
    const key = job.canonical_path
    if (!allowedSeoPaths.has(key)) return
    if (seenSlugs.has(key)) return
    seenSlugs.add(key)
    const lastmod = job.updated_at?.split('T')[0] || today
    const priority = key.startsWith('/empleos/') ? '0.8' : '0.7'
    sitemap += `  <url>\n    <loc>${esc(`${SITE_URL}${key}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`
  })

  vacancies.forEach(v => {
    const lastmod = v.updated_at?.split('T')[0] || today
    sitemap += `  <url>\n    <loc>${esc(`${SITE_URL}${v.canonical_path}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`
  })

  sitemap += '</urlset>'
  fs.writeFileSync(path.join(distPath, 'sitemap.xml'), sitemap)
  console.log(`✅ Sitemap generado con ${(blogPosts?.length || 0) + jobs.length + staticPages.length + (vacancies?.length || 0)} URLs en ${SITE_URL}`)
}

generate().catch((error) => {
  console.error(error)
  process.exit(1)
})
