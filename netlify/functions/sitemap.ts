import type { Handler } from '@netlify/functions'
import { makeSupabaseAdmin } from './_supabase'

const SITE_URL = 'https://cvitae.lat'; const PAGE_SIZE = 1000
const JOB_TYPES = new Set(['job', 'internship', 'consultancy'])
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const response = (body: string) => ({ statusCode: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }, body })
const urlset = (rows: Array<{ slug: string; updated_at?: string | null; opportunity_type?: string | null }>) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map(row => { const prefix = JOB_TYPES.has(row.opportunity_type || '') ? 'empleos' : 'oportunidades'; return `  <url><loc>${SITE_URL}/${prefix}/${esc(row.slug)}</loc><lastmod>${(row.updated_at || new Date().toISOString()).slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>` }).join('\n')}\n</urlset>`

export const handler: Handler = async (event) => {
  try {
    const supabase = makeSupabaseAdmin(); const path = event.path || '/sitemap.xml'
    if (path === '/sitemap.xml') {
      const { count, error } = await supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('verification_status', 'verified').eq('catalog_eligible', true).eq('seo_status', 'eligible').is('deleted_at', null).is('archived_at', null)
      if (error) throw error
      const parts = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)); const today = new Date().toISOString().slice(0,10)
      const entries = ['sitemap-static.xml', ...Array.from({ length: parts }, (_, i) => `sitemap-opportunities-${i + 1}.xml`)]
      return response(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(name => `  <sitemap><loc>${SITE_URL}/${name}</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>`)
    }
    if (path === '/sitemap-static.xml') return response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/empleos','/oportunidades','/oportunidades/paraguay','/oportunidades/latam','/blog'].map(p => `<url><loc>${SITE_URL}${p}</loc></url>`).join('')}</urlset>`)
    const part = /^\/sitemap-opportunities-(\d+)\.xml$/.exec(path)?.[1]
    if (!part) return { statusCode: 404, body: 'Unknown sitemap' }
    const start = (Math.max(1, Number(part)) - 1) * PAGE_SIZE
    const { data, error } = await supabase.from('opportunities').select('slug,updated_at,opportunity_type').eq('is_active', true).eq('verification_status', 'verified').eq('catalog_eligible', true).eq('seo_status', 'eligible').is('deleted_at', null).is('archived_at', null).not('slug', 'is', null).order('updated_at', { ascending: false }).range(start, start + PAGE_SIZE - 1)
    if (error) throw error
    return response(urlset(data || []))
  } catch (error) { console.error('[sitemap]', error); return { statusCode: 500, body: '<!-- sitemap generation failed -->' } }
}
