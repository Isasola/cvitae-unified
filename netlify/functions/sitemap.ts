import type { Handler } from '@netlify/functions'
import { makeSupabaseAdmin } from './_supabase'
import { buildEffectiveSeoInventory } from '../../src/lib/seo-inventory'
import { fetchAllPages } from '../../src/lib/paged-fetch.js'
import { STATIC_PUBLIC_SITEMAP_ROUTES } from '../../src/lib/static-sitemap-routes.js'
import { canonicalSitemapRows, sitemapIndexEntries as sitemapIndexEntriesForUniverse } from '../../src/lib/sitemap-universe.js'

const SITE_URL = 'https://cvitae.lat'; const PAGE_SIZE = 1000
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const response = (body: string) => ({ statusCode: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }, body })
const urlset = (rows: Array<{ canonical_path: string; updated_at?: string | null }>) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map(row => `  <url><loc>${esc(`${SITE_URL}${row.canonical_path}`)}</loc><lastmod>${(row.updated_at || new Date().toISOString()).slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join('\n')}\n</urlset>`

async function effectiveInventory(supabase: ReturnType<typeof makeSupabaseAdmin>, policies: any[]) {
  const rows = await fetchAllPages(PAGE_SIZE, async (offset, size) => {
    const { data, error } = await supabase.from('opportunities').select('id,slug,title,organization,description,location,country_code,eligible_countries,eligible_regions,remote_scope,tags,deadline,application_url,source_url,source,opportunity_type,opportunity_kind,type,created_at,updated_at,is_active,verification_status,catalog_eligible,seo_eligible,seo_status,deleted_at,archived_at').not('slug', 'is', null).order('updated_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + size - 1)
    if (error) throw error
    return data || []
  })
  return buildEffectiveSeoInventory(rows, policies)
}

export function opportunitySitemapPage(path: string, inventory: Array<{ canonical_path:string; updated_at?:string | null }>) {
  const match = /^\/sitemap-opportunities-(\d+)\.xml$/.exec(path)
  if (!match || !/^[1-9]\d*$/.test(match[1])) return { statusCode:404, body:'Unknown sitemap' }
  const page = Number(match[1]); const parts = Math.ceil(inventory.length / PAGE_SIZE)
  if (page > parts) return { statusCode:404, body:'Unknown sitemap' }
  return response(urlset(inventory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)))
}
export function sitemapIndexEntries(inventoryLength: number, blogLength = 0, vacancyLength = 0): string[] { return sitemapIndexEntriesForUniverse(inventoryLength, blogLength, vacancyLength, PAGE_SIZE) }
export function singletonSitemapPage(path: string, expectedPath: string, rows: Array<{ canonical_path:string; updated_at?:string | null }>) {
  return path === expectedPath && rows.length ? response(urlset(rows)) : { statusCode:404, body:'Unknown sitemap' }
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
    const { data: policies, error: policyError } = await supabase.rpc('get_source_distribution_policy')
    if (policyError) throw policyError
    const [inventory, blogs, vacancies] = await Promise.all([effectiveInventory(supabase, policies || []), publicRows(supabase, 'content_hub', '/blog'), publicRows(supabase, 'recruiter_vacancies', '/vacante')])
    if (path === '/sitemap.xml') {
      const today = new Date().toISOString().slice(0,10); const entries = sitemapIndexEntries(inventory.length, blogs.length, vacancies.length)
      return response(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(name => `  <sitemap><loc>${SITE_URL}/${name}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>`)
    }
    if (path === '/sitemap-static.xml') return response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${STATIC_PUBLIC_SITEMAP_ROUTES.map(route => `<url><loc>${esc(`${SITE_URL}${route.url}`)}</loc></url>`).join('')}</urlset>`)
    if (path === '/sitemap-blog.xml') return singletonSitemapPage(path, '/sitemap-blog.xml', blogs)
    if (path === '/sitemap-vacancies.xml') return singletonSitemapPage(path, '/sitemap-vacancies.xml', vacancies)
    return opportunitySitemapPage(path, inventory)
  } catch (error) { console.error('[sitemap]', error); return { statusCode: 500, body: '<!-- sitemap generation failed -->' } }
}
