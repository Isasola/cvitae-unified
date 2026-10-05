import type { Handler } from '@netlify/functions'
import { makeSupabaseAdmin } from './_supabase'
import { buildEffectiveSeoInventory } from '../../src/lib/seo-inventory'
import { canonicalOpportunityPath } from '../../src/lib/opportunity-truth'
import { fetchAllPages } from '../../src/lib/paged-fetch.js'
import { STATIC_PUBLIC_SITEMAP_ROUTES } from '../../src/lib/static-sitemap-routes.js'
import { canonicalSitemapRows, sitemapIndexEntries as sitemapIndexEntriesForUniverse } from '../../src/lib/sitemap-universe.js'

const SITE_URL = 'https://cvitae.lat'; const PAGE_SIZE = 1000
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const response = (body: string) => ({ statusCode: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }, body })
const urlset = (rows: Array<{ canonical_path: string; updated_at?: string | null }>) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map(row => `  <url><loc>${esc(`${SITE_URL}${row.canonical_path}`)}</loc><lastmod>${(row.updated_at || new Date().toISOString()).slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join('\n')}\n</urlset>`

async function effectiveInventory(supabase: ReturnType<typeof makeSupabaseAdmin>, policies: any[]) {
  const rows = await fetchAllPages(PAGE_SIZE, async (offset, size) => {
    const { data, error } = await supabase.from('opportunity_seo_universe').select('id,slug,title,organization,description,location,country_code,eligible_countries,eligible_regions,remote_scope,tags,deadline,application_url,source_url,source,opportunity_type,opportunity_kind,type,created_at,updated_at,is_active,verification_status,catalog_eligible,seo_eligible,seo_status,deleted_at,archived_at').not('slug', 'is', null).order('updated_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + size - 1)
    if (error) throw error
    return data || []
  })
  return buildEffectiveSeoInventory(rows, policies)
}

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
async function opportunitySitemapPageFromUniverse(supabase: ReturnType<typeof makeSupabaseAdmin>, path: string) {
  const scalable = /^\/sitemap-opportunities\/(\d+)\.xml$/.exec(path)
  const legacy = /^\/sitemap-opportunities-(\d+)\.xml$/.exec(path)
  const match = scalable || legacy
  if (!match || !/^[1-9]\d*$/.test(match[1]) || (legacy && match[1] !== '1')) return { statusCode:404, body:'Unknown sitemap' }
  const page = Number(match[1])
  const { data, error } = await supabase.from('opportunity_seo_universe')
    .select('slug,opportunity_type,opportunity_kind,type,updated_at,created_at')
    .not('slug', 'is', null)
    .order('updated_at', { ascending: false }).order('id', { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) throw error
  const rows = (data || []).map((row: any) => ({
    canonical_path: canonicalOpportunityPath(row.slug, row.opportunity_type || row.opportunity_kind || row.type),
    updated_at: row.updated_at || row.created_at || null,
  }))
  return rows.length ? response(urlset(rows)) : { statusCode:404, body:'Unknown sitemap' }
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
    if (/^\/sitemap-opportunities(?:\/|-)\d+\.xml$/.test(path)) return opportunitySitemapPageFromUniverse(supabase, path)
    if (path === '/sitemap-blog.xml') return singletonSitemapPage(path, '/sitemap-blog.xml', await publicRows(supabase, 'content_hub', '/blog'))
    if (path === '/sitemap-vacancies.xml') return singletonSitemapPage(path, '/sitemap-vacancies.xml', await publicRows(supabase, 'recruiter_vacancies', '/vacante'))
    if (path !== '/sitemap.xml') return { statusCode:404, body:'Unknown sitemap' }
    const [{ count: opportunityCount, error: opportunityCountError }, { count: blogCount, error: blogCountError }, { count: vacancyCount, error: vacancyCountError }] = await Promise.all([
      supabase.from('opportunity_seo_universe').select('id', { count: 'exact', head: true }).not('slug', 'is', null),
      supabase.from('content_hub').select('id', { count: 'exact', head: true }).eq('tipo', 'blog').eq('is_active', true).not('slug', 'is', null),
      supabase.from('recruiter_vacancies').select('id', { count: 'exact', head: true }).eq('is_active', true).not('slug', 'is', null),
    ])
    if (opportunityCountError || blogCountError || vacancyCountError) throw opportunityCountError || blogCountError || vacancyCountError
    if (path === '/sitemap.xml') {
      const today = new Date().toISOString().slice(0,10); const entries = sitemapIndexEntries(opportunityCount || 0, blogCount || 0, vacancyCount || 0)
      return response(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(name => `  <sitemap><loc>${SITE_URL}/${name}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>`)
    }
    return { statusCode:404, body:'Unknown sitemap' }
  } catch (error) { console.error('[sitemap]', error); return { statusCode: 500, body: '<!-- sitemap generation failed -->' } }
}
