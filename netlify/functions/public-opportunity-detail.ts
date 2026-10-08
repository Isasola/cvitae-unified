import type { Handler } from '@netlify/functions'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicOpportunitiesHandler } from './public-opportunities'
import { canonicalOpportunityPathForRow, canonicalOpportunityUrlForRow, publicOpportunitySchemaType } from '../../src/lib/opportunity-truth'
import { aggregatedJobPosting } from '../../src/lib/factual-job-posting'
import { safeExternalUrl } from '../../src/lib/safe-url'

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))

/** The built template supplies this deploy's assets, never another deploy's shell. */
export function publicDetailHtml(template: string, row: Record<string, any> | null, unavailable = false) {
  const canonical = row ? canonicalOpportunityUrlForRow(row as any) : 'https://cvitae.lat'
  const title = row ? `${row.title} | CVitae` : unavailable ? 'Oportunidad no disponible | CVitae' : 'Página no encontrada | CVitae'
  const description = row ? String(row.description || row.title).replace(/<[^>]*>/g, ' ').trim() : 'Esta oportunidad no está disponible.'
  const schema = row ? aggregatedJobPosting(row, canonical).structuredData ?? {
    '@context': 'https://schema.org', '@type': publicOpportunitySchemaType(row, false),
    name: row.title, url: canonical, description,
    ...(row.organization ? { provider: { '@type': 'Organization', name: row.organization } } : {}),
  } : null
  const metadata = `<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta name="robots" content="${row?.distribution?.seo?.allowed === true ? 'index,follow' : 'noindex,follow'}">
<meta name="description" content="${escapeHtml(description.slice(0, 160))}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description.slice(0, 160))}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:image" content="https://cvitae.lat/og-image.jpg">
${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>` : ''}`
  const original = row?.source_url ? safeExternalUrl(row.source_url) : null
  const content = row ? `<main><article><h1>${escapeHtml(row.title)}</h1>
${row.organization ? `<p>${escapeHtml(row.organization)}</p>` : ''}
<section><h2>Descripción</h2><p style="white-space:pre-wrap">${escapeHtml(description)}</p></section>
${original && original !== '#' ? `<p>Fuente: <a href="${escapeHtml(original)}" rel="noopener noreferrer">${escapeHtml(row.distribution?.canonicalSource || row.source)}</a></p>` : ''}
</article></main>` : `<main><h1>${unavailable ? 'No disponible' : '404'}</h1><p>${escapeHtml(description)}</p><a href="/empleos">Volver a empleos</a></main>`
  // Remove the Home snapshot/metadata while retaining compiled module/style
  // assets. React then uses the exact same public resolver during hydration.
  return template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\b[^>]*(?:\bname=["'](?:description|robots|twitter:[^"']+)["']|\bproperty=["']og:[^"']+["'])[^>]*>/gi, '')
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace('</head>', `${metadata.replace(/<(meta|link|script)\b/g, '<$1 data-rh="true"')}</head>`)
    .replace(/<body\b([^>]*)>[\s\S]*?<\/body>/i, `<body$1><div id="root">${content}</div></body>`)
}

export function createPublicDetailHandler(
  readPublic = createPublicOpportunitiesHandler(),
  template = () => readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8'),
): Handler {
  return async (event, context) => {
    const { slug = '', family = '' } = event.queryStringParameters || {}
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(slug) || !['empleos', 'oportunidades'].includes(family)) {
      return { statusCode: 404, headers, body: publicDetailHtml(template(), null) }
    }
    const result = await readPublic({ ...event, queryStringParameters: { mode: 'all', slug } }, context, () => {}) as any
    if (result.statusCode !== 200) return {
      statusCode: result.statusCode, headers,
      body: publicDetailHtml(template(), null, result.statusCode !== 404),
    }
    const row = JSON.parse(result.body)
    const canonicalPath = canonicalOpportunityPathForRow(row)
    if (canonicalPath !== `/${family}/${slug}`) return { statusCode: 301,
      headers: { Location: canonicalPath, 'Cache-Control': 'no-store' }, body: '' }
    return { statusCode: 200, headers, body: publicDetailHtml(template(), row) }
  }
}

export const handler = createPublicDetailHandler()
