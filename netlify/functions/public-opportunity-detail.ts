import type { HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions'
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
  const canonical = row ? canonicalOpportunityUrlForRow(row as any) : ''
  const title = row ? `${row.title} | CVitae` : unavailable ? 'Oportunidad no disponible | CVitae' : 'Página no encontrada | CVitae'
  const description = row ? String(row.description || row.title).replace(/<[^>]*>/g, ' ').trim() : 'Esta oportunidad no está disponible.'
  const schema = row ? aggregatedJobPosting(row, canonical).structuredData ?? {
    '@context': 'https://schema.org', '@type': publicOpportunitySchemaType(row, false),
    name: row.title, url: canonical, description,
    ...(row.organization ? { provider: { '@type': 'Organization', name: row.organization } } : {}),
  } : null
  const metadata = `<title>${escapeHtml(title)}</title>
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
<meta name="robots" content="${row?.distribution?.seo?.allowed === true ? 'index,follow' : 'noindex,follow'}">
<meta name="description" content="${escapeHtml(description.slice(0, 160))}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description.slice(0, 160))}">
${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : ''}
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

/** Decode only the slug segment; never normalize traversal into another route. */
export function parsePublicDetailPath(pathname: string) {
  const match = /^\/(empleos|oportunidades)\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  try {
    const slug = decodeURIComponent(match[2])
    return validSlug(slug) ? { family: match[1], slug } : null
  } catch { return null }
}

const validSlug = (slug: string) => /^[a-z0-9][a-z0-9._-]*$/i.test(slug) && !['.', '..'].includes(slug)

function publicDetailIdentity(event: HandlerEvent) {
  // In function rewrites Netlify's legacy event.path preserves the incoming
  // public path. Queries must never replace that public identity.
  if (!/^\/\.netlify\/functions\/public-opportunity-detail\/?$/.test(event.path)) {
    return parsePublicDetailPath(event.path)
  }
  // Direct endpoint compatibility only. Keep duplicate parameters observable.
  const query = new URLSearchParams(event.rawQuery ?? '')
  if (event.rawQuery == null) {
    for (const [name, value] of Object.entries(event.queryStringParameters || {})) {
      for (const item of event.multiValueQueryStringParameters?.[name] || (value == null ? [] : [value])) query.append(name, item)
    }
  }
  const slug = query.get('slug') || ''
  const family = query.get('family') || ''
  return query.getAll('slug').length === 1 && query.getAll('family').length === 1 &&
    ['empleos', 'oportunidades'].includes(family) && validSlug(slug) ? { family, slug } : null
}

export function createPublicDetailHandler(
  readPublic = createPublicOpportunitiesHandler(),
  template = () => readFileSync(resolve(process.cwd(), 'dist/index.html'), 'utf8'),
): (event: HandlerEvent) => Promise<HandlerResponse> {
  return async (event) => {
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers: { Allow: 'GET' } }
    const identity = publicDetailIdentity(event)
    if (!identity) return { statusCode: 404, headers, body: publicDetailHtml(template(), null) }
    const { slug, family } = identity
    // Adapt only the transport: the existing public resolver remains the authority.
    const result = await readPublic({ ...event, queryStringParameters: { mode: 'all', slug } }, {} as HandlerContext, () => {}) as any
    if (result.statusCode !== 200) return {
      statusCode: result.statusCode, headers,
      body: publicDetailHtml(template(), null, result.statusCode !== 404),
    }
    const row = JSON.parse(result.body)
    const canonicalPath = canonicalOpportunityPathForRow(row)
    if (canonicalPath !== `/${family}/${slug}`) return { statusCode: 301,
      headers: { Location: canonicalPath, 'Cache-Control': 'no-store' } }
    return { statusCode: 200, headers, body: publicDetailHtml(template(), row) }
  }
}

export const handler = createPublicDetailHandler()
