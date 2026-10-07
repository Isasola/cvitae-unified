import type { Handler } from '@netlify/functions'
import { makeSupabaseAdmin } from './_supabase'
import { canonicalOpportunityPath } from '../../src/lib/opportunity-truth'
import { fetchAllPages } from '../../src/lib/paged-fetch.js'
import { seoUniversePages } from '../../src/lib/seo-universe-fetch.js'
import { STATIC_PUBLIC_SITEMAP_ROUTES } from '../../src/lib/static-sitemap-routes.js'
import { canonicalSitemapRows, sitemapIndexEntries as sitemapIndexEntriesForUniverse } from '../../src/lib/sitemap-universe.js'

const SITE_URL = 'https://cvitae.lat'; const PAGE_SIZE = 1000
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const response = (body: string) => ({ statusCode: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }, body })
const urlset = (rows: Array<{ canonical_path: string; updated_at?: string | null }>) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map(row => `  <url><loc>${esc(`${SITE_URL}${row.canonical_path}`)}</loc><lastmod>${(row.updated_at || new Date().toISOString()).slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join('\n')}\n</urlset>`

export function opportunitySitemapPage(path: string, inventory: Array<{ canonical_path:string; updated_at?:string | null }>) {
  const scalable = /^\/sitemap-opportunities\/(\d+)\.xml$/.exec(path)
  const legacy = /^\/sitemap-opportunities-(\d+)\.xml$/.exec(path)
  const match = scalable || legacy
  if (!match || !/^[1-9]\d*$/.test(match[1])) return { statusCode:404, body:'Unknown sitemap' }
  const page = Number(match[1]); const parts = Math.ceil(inventory.length / PAGE_SIZE)
  if (legacy && page !== 1) return { statusCode:404, body:'Unknown sitemap' }
  if (page > parts) return { statusCode:404, body:'Unknown sitemap' }
  return response(urlset(inventory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)))
}
export function sitemapIndexEntries(inventoryLength: number, blogLength = 0, vacancyLength = 0): string[] { return sitemapIndexEntriesForUniverse(inventoryLength, blogLength, vacancyLength, PAGE_SIZE) }
export function singletonSitemapPage(path: string, expectedPath: string, rows: Array<{ canonical_path:string; updated_at?:string | null }>) {
  return path === expectedPath && rows.length ? response(urlset(rows)) : { statusCode:404, body:'Unknown sitemap' }
}
export async function opportunitySitemapPageFromUniverse(supabase: ReturnType<typeof makeSupabaseAdmin>, path: string) {
  const scalable = /^\/sitemap-opportunities\/(\d+)\.xml$/.exec(path)
  const legacy = /^\/sitemap-opportunities-(\d+)\.xml$/.exec(path)
  const match = scalable || legacy
  if (!match || !/^[1-9]\d*$/.test(match[1]) || (legacy && match[1] !== '1')) return { statusCode:404, body:'Unknown sitemap' }
  const page = Number(match[1])
  if (!Number.isSafeInteger(page)) return { statusCode:404, body:'Unknown sitemap' }
  const start = (page - 1) * PAGE_SIZE
  const rows: Array<{ canonical_path:string; updated_at:string | null }> = []
  let position = 0
  for await (const batch of seoUniversePages(supabase, 'id,slug,opportunity_type,opportunity_kind,type,updated_at,created_at')) {
    for (const row of batch) {
      if (position++ < start) continue
      rows.push({ canonical_path: canonicalOpportunityPath(row.slug, row.opportunity_type || row.opportunity_kind || row.type), updated_at: row.updated_at || row.created_at || null })
      if (rows.length === PAGE_SIZE) return response(urlset(rows))
    }
  }
  return rows.length ? response(urlset(rows)) : { statusCode:404, body:'Unknown sitemap' }
}

export async function opportunitySitemapSize(supabase: ReturnType<typeof makeSupabaseAdmin>) {
  let size = 0
  for await (const batch of seoUniversePages(supabase, 'id')) size += batch.length
  return size
}
async function publicRows(supabase: ReturnType<typeof makeSupabaseAdmin>, table: 'content_hub' | 'recruiter_vacancies', prefix: '/blog' | '/vacante') {
  const rows = await fetchAllPages(PAGE_SIZE, async (offset, size) => {
    const orderColumn = table === 'recruiter_vacancies' ? 'created_at' : 'updated_at'
    const columns = table === 'recruiter_vacancies' ? 'id,slug,created_at' : 'id,slug,created_at,updated_at'
    let query: any = supabase.from(table).select(columns).not('slug', 'is', null).order(orderColumn, { ascending:false }).order('id', { ascending:true }).range(offset, offset + size - 1)
    query = table === 'content_hub' ? query.eq('tipo', 'blog').eq('is_active', true) : query.eq('is_active', true)
    const { data, error } = await query; if (error) throw error
    return data || []
  })
  return canonicalSitemapRows(prefix, rows)
}

export const handler: Handler = async (event) => {
  try {
    const supabase = makeSupabaseAdmin(); const path = event.path || '/sitemap.xml'
    if (path === '/sitemap-static.xml') return response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${STATIC_PUBLIC_SITEMAP_ROUTES.map(route => `<url><loc>${esc(`${SITE_URL}${route.url}`)}</loc></url>`).join('')}</urlset>`)
    if (/^\/sitemap-opportunities(?:\/|-)\d+\.xml$/.test(path)) return await opportunitySitemapPageFromUniverse(supabase, path)
    if (path === '/sitemap-blog.xml') return singletonSitemapPage(path, '/sitemap-blog.xml', await publicRows(supabase, 'content_hub', '/blog'))
    if (path === '/sitemap-vacancies.xml') return singletonSitemapPage(path, '/sitemap-vacancies.xml', await publicRows(supabase, 'recruiter_vacancies', '/vacante'))
    if (path !== '/sitemap.xml') return { statusCode:404, body:'Unknown sitemap' }
    const [opportunityCount, { count: blogCount, error: blogCountError }, { count: vacancyCount, error: vacancyCountError }] = await Promise.all([
      opportunitySitemapSize(supabase),
      supabase.from('content_hub').select('id', { count: 'exact', head: true }).eq('tipo', 'blog').eq('is_active', true).not('slug', 'is', null),
      supabase.from('recruiter_vacancies').select('id', { count: 'exact', head: true }).eq('is_active', true).not('slug', 'is', null),
    ])
    if (blogCountError || vacancyCountError) throw blogCountError || vacancyCountError
    if (path === '/sitemap.xml') {
      const today = new Date().toISOString().slice(0,10); const entries = sitemapIndexEntries(opportunityCount || 0, blogCount || 0, vacancyCount || 0)
      return response(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(name => `  <sitemap><loc>${SITE_URL}/${name}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>`)
    }
    return { statusCode:404, body:'Unknown sitemap' }
  } catch (error) { console.error('[sitemap]', error); return { statusCode: 500, body: '<!-- sitemap generation failed -->' } }
}
