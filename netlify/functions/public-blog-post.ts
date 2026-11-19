import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { isCurrentPublicBlog, isValidPublicBlogSlug, publicBlogExclusionReason } from '../../src/lib/public-blog-contract'

const SITE_URL = 'https://cvitae.lat'
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!))

export function parseBlogSlug(value: unknown): string | null { return isValidPublicBlogSlug(String(value ?? '')) ? String(value) : null }

function markdownInline(value: string): string {
  const safe = escapeHtml(value)
  return safe
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

type BlogRenderOptions = {
  related?: Record<string, any>[]
  ads?: { ready?: boolean; cmpReady?: boolean; client?: string; slot?: string }
  measurementId?: string
  asOf?: number
}

const imageUrl = (value: unknown) => {
  const url = String(value || '').trim()
  if (/^https:\/\//i.test(url)) return url
  return /^\/(?!\/)/.test(url) ? `${SITE_URL}${url}` : ''
}
const plainText = (value: unknown) => String(value || '').replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*`_>~]/g, '').replace(/\s+/g, ' ').trim()
const formatDate = (value: unknown) => {
  const date = new Date(String(value || ''))
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : ''
}
const readMinutes = (value: unknown) => Math.max(1, Math.ceil(plainText(value).split(/\s+/).filter(Boolean).length / 200))
const pageStyles = `<style>
:root{color-scheme:dark;--ink:#0b0b0b;--panel:#121212;--text:#f4f0e7;--muted:#a5a19a;--gold:#d5b453;--line:rgba(255,255,255,.09)}
*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--text);font:16px/1.7 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}.site-header{border-bottom:1px solid var(--line);background:rgba(11,11,11,.94)}
.nav{max-width:1152px;margin:auto;padding:17px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}.brand{display:grid;color:var(--text);font-weight:700;letter-spacing:.03em}.brand small{font-size:10px;color:var(--muted);font-weight:400;letter-spacing:.1em;text-transform:uppercase}.nav-links,.nav-actions{display:flex;align-items:center;gap:22px;flex-wrap:wrap}.nav-links a,.nav-actions a{font-size:13px;color:#b7b2a8}.nav-actions .primary{background:var(--gold);color:#17130a;padding:8px 13px;font-weight:650}
.page{max-width:1120px;margin:auto;padding:42px 24px 90px}.article-wrap{max-width:820px;margin:auto}.back{display:inline-block;color:#aaa;font-size:13px;margin:0 0 34px}.eyebrow{display:flex;gap:14px;align-items:center;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:16px}.eyebrow .category{color:var(--gold);border:1px solid rgba(213,180,83,.35);padding:4px 9px}.article-head{margin-bottom:32px}.article-head h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(2.35rem,6vw,3.25rem);line-height:1.08;letter-spacing:-.035em;margin:0 0 19px}.article-meta{font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap}.article-image{display:block;width:100%;height:auto;max-height:560px;object-fit:cover;border:1px solid var(--line);margin:0 0 36px}.prose{font-size:17px;line-height:1.9;color:#d0cec8}.prose h2,.prose h3,.prose h4{font-family:Georgia,"Times New Roman",serif;color:var(--text);line-height:1.25;margin:46px 0 18px}.prose h2{font-size:27px;border-bottom:1px solid rgba(213,180,83,.18);padding-bottom:12px}.prose h3{font-size:22px}.prose p{margin:0 0 23px}.prose li{margin:7px 0}.prose ul,.prose ol{padding-left:25px;margin:18px 0 25px}.prose blockquote{margin:28px 0;padding:14px 22px;border-left:3px solid var(--gold);background:rgba(255,255,255,.025);color:#aaa}.prose hr{border:0;border-top:1px solid var(--line);margin:40px 0}.prose code{font: .88em ui-monospace,monospace;color:var(--gold);background:rgba(255,255,255,.06);padding:2px 5px}.next-step{margin:56px 0 0;padding:27px 0;border-top:1px solid var(--line)}.next-step p{color:var(--muted);margin:0 0 14px}.button-row{display:flex;gap:10px;flex-wrap:wrap}.button-row a{padding:9px 14px;border:1px solid var(--line);font-size:13px}.button-row a.primary{background:var(--gold);color:#17130a;border-color:var(--gold)}.ad-slot{max-width:820px;margin:45px auto 0;border-block:1px solid var(--line);padding:13px 0;min-height:30px}.ad-slot-label{text-align:center;color:#79756e;font-size:9px;text-transform:uppercase;letter-spacing:.2em;margin:0 0 8px}.related{margin:48px auto 0;max-width:820px;border-top:1px solid var(--line);padding-top:30px}.related h2{font-size:11px;font-weight:400;text-transform:uppercase;letter-spacing:.18em;color:#8c8880}.related-grid,.blog-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.related-card,.blog-card{border:1px solid var(--line);padding:17px;background:linear-gradient(145deg,rgba(255,255,255,.025),transparent)}.related-card h3,.blog-card h2{font-family:Georgia,"Times New Roman",serif;font-size:18px;line-height:1.35;margin:8px 0}.related-card img,.blog-card img{width:100%;aspect-ratio:16/9;object-fit:cover;margin-bottom:10px}.blog-card p{font-size:13px;color:var(--muted);margin:0}.site-footer{border-top:1px solid var(--line);padding:34px 24px;color:#aaa}.footer-inner{max-width:1120px;margin:auto;display:flex;justify-content:space-between;gap:22px;flex-wrap:wrap}.footer-links{display:flex;gap:18px;flex-wrap:wrap;font-size:12px}.footer-links a{color:#aaa}.empty{color:var(--muted);padding:35px 0}
@media(max-width:680px){.nav{padding:14px 18px}.nav-links{gap:13px}.nav-actions{display:none}.page{padding:30px 18px 70px}.prose{font-size:16px}.article-meta{gap:9px}}
</style>`

function analyticsRuntime(measurementId = process.env.VITE_GA_MEASUREMENT_ID || 'G-BZ16ZLP8ZZ') {
  const id = /^G-[A-Z0-9]+$/i.test(String(measurementId).trim()) ? String(measurementId).trim() : ''
  if (!id) return ''
  return `<script>(function(){var p=new URLSearchParams(location.search);for(var k of p.keys()){if(!/^(utm_(source|medium|campaign|term|content)|gclid|fbclid)$/i.test(k))return}if(location.pathname==='/auth/callback'||location.hash)return;window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments)}window.gtag=window.gtag||gtag;gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});try{var c=JSON.parse(localStorage.getItem('cvitae_consent_v1')||'null');if(c&&c.version===1&&typeof c.analytics==='boolean'&&typeof c.advertising==='boolean'){gtag('consent','update',{analytics_storage:c.analytics?'granted':'denied',ad_storage:c.advertising?'granted':'denied',ad_user_data:c.advertising?'granted':'denied',ad_personalization:c.advertising?'granted':'denied'})}}catch(e){}if(!document.getElementById('cvitae-ga4')){var s=document.createElement('script');s.id='cvitae-ga4';s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}';s.onload=function(){gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true})};document.head.appendChild(s)}})();</script>`
}

function consentedAdSlot(options: BlogRenderOptions['ads'] = {}) {
  const ready = options?.ready ?? process.env.VITE_GOOGLE_ADSENSE_READY === 'true'
  const cmpReady = options?.cmpReady ?? process.env.VITE_GOOGLE_CERTIFIED_CMP_READY === 'true'
  const client = String(options?.client ?? process.env.VITE_GOOGLE_ADSENSE_CLIENT ?? '').trim()
  const slot = String(options?.slot ?? process.env.VITE_ADSENSE_SLOT_BLOG ?? '').trim()
  if (!ready || !cmpReady || !/^ca-pub-\d+$/.test(client) || !/^\d+$/.test(slot)) return ''
  return `<aside class="ad-slot" aria-label="Publicidad" data-ad-placement="blog-end" style="display:none"><p class="ad-slot-label">Publicidad</p><ins class="adsbygoogle block min-h-24" data-ad-client="${escapeHtml(client)}" data-ad-slot="${escapeHtml(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins></aside>
<script>(function(){var box=document.querySelector('[data-ad-placement="blog-end"]');var ins=box&&box.querySelector('ins.adsbygoogle');if(!box||!ins)return;function allowed(c){return !!(c&&c.version===1&&c.advertising===true)}function activate(c){if(!allowed(c)){box.style.display='none';return}box.style.display='block';var id='cvitae-adsense';var s=document.getElementById(id);function push(){try{(window.adsbygoogle=window.adsbygoogle||[]).push({})}catch(e){}}if(s){push();return}s=document.createElement('script');s.id=id;s.async=true;s.crossOrigin='anonymous';s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}';s.onload=push;document.head.appendChild(s)}try{activate(JSON.parse(localStorage.getItem('cvitae_consent_v1')||'null'))}catch(e){}window.addEventListener('cvitae:consent-changed',function(e){activate(e.detail)})})();</script>`
}

function renderHeader() {
  return `<header class="site-header"><nav class="nav" aria-label="Navegación principal"><a class="brand" href="/" aria-label="CVitae, inicio">CVitae<small>Tu próximo paso</small></a><div class="nav-links"><a href="/">Inicio</a><a href="/oportunidades">Oportunidades</a><a href="/blog">Blog</a><a href="/empresas">Empresas</a></div><div class="nav-actions"><a href="/mi-carrera">Iniciar sesión</a><a class="primary" href="/mi-carrera">Empezá gratis</a></div></nav></header>`
}

function renderFooter() {
  return `<footer class="site-footer"><div class="footer-inner"><span>CVitae · Empoderando el talento paraguayo.</span><nav class="footer-links" aria-label="Enlaces del pie"><a href="/oportunidades">Oportunidades</a><a href="/empresas">Empresas</a><a href="/privacy">Privacidad</a><a href="/terminos">Términos</a><a href="/cookies">Preferencias de cookies</a><a href="/contacto">Contacto</a></nav></div></footer>`
}

function renderMarkdown(value: string) {
  const output: string[] = []
  let list: 'ul' | 'ol' | null = null
  let quote: string[] = []
  let h2Count = 0
  const closeList = () => { if (list) output.push(`</${list}>`); list = null }
  const closeQuote = () => { if (quote.length) { output.push(`<blockquote>${quote.map(line => `<p>${markdownInline(line)}</p>`).join('')}</blockquote>`); quote = [] } }
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) { closeList(); closeQuote(); continue }
    if (/^```/.test(line)) { closeList(); closeQuote(); continue }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line)
    const unordered = /^[-*+]\s+(.+)$/.exec(line)
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line)
    const quoteLine = /^>\s?(.*)$/.exec(line)
    if (quoteLine) { closeList(); quote.push(quoteLine[1]); continue }
    closeQuote()
    if (heading) {
      closeList()
      const level = Math.min(4, heading[1].length)
      output.push(`<h${level}>${markdownInline(heading[2])}</h${level}>`)
      if (level === 2 && ++h2Count === 2) output.push('<aside class="inline-cta" style="margin:36px 0;padding:23px;border:1px solid rgba(213,180,83,.3);background:rgba(255,255,255,.02)"><p style="margin:0 0 8px;color:#f4f0e7;font-weight:600">\u00bfBusc\u00e1s trabajo o una beca en Paraguay?</p><p style="margin:0 0 8px;color:#a5a19a">Analiz\u00e1 tu CV gratis y descubr\u00ed oportunidades que coinciden con tu perfil.</p><a href="/mi-carrera" style="display:inline-block;margin-top:8px;padding:9px 14px;background:#d5b453;color:#17130a;font-size:13px;font-weight:600">Empezar gratis \u2192</a></aside>')
    }
    else if (unordered || ordered) { const kind = unordered ? 'ul' : 'ol'; if (list !== kind) { closeList(); list = kind; output.push(`<${list}>`) }; output.push(`<li>${markdownInline((unordered || ordered)![1])}</li>`) }
    else if (/^(---+|\*\*\*+)$/.test(line)) { closeList(); output.push('<hr>') }
    else { closeList(); output.push(`<p>${markdownInline(line)}</p>`) }
  }
  closeList(); closeQuote()
  return output.join('\n')
}

function pageStart(title: string, description: string, canonical: string, schema: unknown, type: string, image?: string, measurementId?: string) {
  const safeImage = imageUrl(image)
  return `<!doctype html><html lang="es-PY"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | CVitae</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow">
<link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="${escapeHtml(type)}"><meta property="og:title" content="${escapeHtml(title)} | CVitae"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${safeImage ? `<meta property="og:image" content="${escapeHtml(safeImage)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>${pageStyles}${analyticsRuntime(measurementId)}</head><body>`
}

export function renderApprovedBlogHtml(row: Record<string, any>, options: BlogRenderOptions = {}): string {
  if (!isCurrentPublicBlog(row, options.asOf ?? Date.now())) return '<!doctype html><html lang="es-PY"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>404 | CVitae</title></head><body><h1>Artículo no disponible</h1></body></html>'
  const canonical = `${SITE_URL}/blog/${encodeURIComponent(String(row.slug))}`
  const title = String(row.titulo)
  const body = String(row.cuerpo || '')
  const excerpt = plainText(body).slice(0, 160)
  const author = String(row.metadata?.author_name || 'Equipo editorial de CVitae')
  const date = formatDate(row.created_at)
  const modified = formatDate(row.updated_at || row.created_at)
  const image = imageUrl(row.imagen_url)
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting', '@id': `${canonical}#article`,
        headline: title, description: excerpt, url: canonical,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        ...(date ? { datePublished: row.created_at } : {}), ...(modified ? { dateModified: row.updated_at || row.created_at } : {}),
        ...(image ? { image } : {}), inLanguage: 'es-PY', articleSection: row.categoria || 'Blog',
        author: { '@type': 'Organization', name: author, url: `${SITE_URL}/sobre-cvitae` },
        publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` } },
      },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
        { '@type': 'ListItem', position: 3, name: title, item: canonical },
      ] },
    ],
  }
  const related = (options.related || []).filter(item => isCurrentPublicBlog(item) && item.id !== row.id).slice(0, 3)
  const relatedHtml = related.length ? `<section class="related" aria-labelledby="related-title"><h2 id="related-title">Artículos relacionados</h2><div class="related-grid">${related.map(item => {
    const img = imageUrl(item.imagen_url)
    return `<article class="related-card">${img ? `<a href="/blog/${encodeURIComponent(item.slug)}"><img src="${escapeHtml(img)}" alt="${escapeHtml(item.titulo)}"></a>` : ''}<h3><a href="/blog/${encodeURIComponent(item.slug)}">${escapeHtml(item.titulo)}</a></h3><span class="article-meta">${escapeHtml(item.categoria || 'Blog')}</span></article>`
  }).join('')}</div></section>` : ''
  return `${pageStart(title, excerpt, canonical, schema, 'article', image, options.measurementId)}${renderHeader()}<main class="page"><div class="article-wrap"><a class="back" href="/blog">← Volver al blog</a><article><header class="article-head"><div class="eyebrow"><span class="category">${escapeHtml(row.categoria || 'Blog')}</span><span>${escapeHtml(date)}</span><span>${readMinutes(body)} min de lectura</span></div><h1>${escapeHtml(title)}</h1><div class="article-meta"><span>Por ${escapeHtml(author)}</span>${modified ? `<span>Actualizado ${escapeHtml(modified)}</span>` : ''}</div></header>${image ? `<img class="article-image" src="${escapeHtml(image)}" alt="${escapeHtml(title)}">` : ''}<div class="prose">${renderMarkdown(body)}</div><section class="next-step"><p>Siguiente paso · Aplicá lo aprendido a tu perfil o explorá oportunidades verificadas.</p><div class="button-row"><a class="primary" href="/mi-carrera">Revisar mi perfil</a><a href="/oportunidades">Explorar oportunidades</a><a href="/blog">Más artículos</a></div></section></article>${consentedAdSlot(options.ads)}${relatedHtml}</div></main>${renderFooter()}</body></html>`
}

export function renderPublicBlogListHtml(rows: Record<string, any>[], options: Pick<BlogRenderOptions, 'measurementId' | 'asOf'> = {}): string {
  const currentRows = rows.filter(row => isCurrentPublicBlog(row, options.asOf ?? Date.now()))
  const items = currentRows.map((row, index) => ({ '@type': 'ListItem', position: index + 1, url: `${SITE_URL}/blog/${encodeURIComponent(row.slug)}`, name: String(row.titulo) }))
  const schema = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog CVitae', url: `${SITE_URL}/blog`, blogPost: items }
  const cards = currentRows.map(row => {
    const title = escapeHtml(row.titulo)
    const slug = encodeURIComponent(String(row.slug))
    const excerpt = escapeHtml(plainText(row.cuerpo).slice(0, 180))
    const image = imageUrl(row.imagen_url)
    return `<article class="blog-card">${image ? `<a href="/blog/${slug}"><img src="${escapeHtml(image)}" alt="${title}"></a>` : ''}<span class="article-meta">${escapeHtml(row.categoria || 'Blog')} · ${escapeHtml(formatDate(row.created_at))}</span><h2><a href="/blog/${slug}">${title}</a></h2><p>${excerpt}</p><p><a href="/blog/${slug}">Leer artículo →</a></p></article>`
  }).join('')
  return `${pageStart('Blog', 'Ideas, guías y datos sobre carrera y mercado laboral en Paraguay y Latinoamérica.', `${SITE_URL}/blog`, schema, 'website', undefined, options.measurementId)}${renderHeader()}<main class="page"><section aria-labelledby="blog-title"><p class="eyebrow">CVitae · Carrera y mercado laboral</p><h1 id="blog-title" style="font:clamp(2.5rem,7vw,4rem) Georgia,serif;line-height:1.05;margin:0 0 14px">Ideas para crecer con intención.</h1><p style="color:var(--muted);max-width:620px;margin:0 0 38px">Guías prácticas, análisis del mercado y conversaciones sobre carrera, IA y trabajo en Paraguay y Latinoamérica.</p>${cards ? `<div class="blog-grid">${cards}</div>` : '<p class="empty">No hay artículos publicados todavía.</p>'}</section></main>${renderFooter()}</body></html>`
}

function identity(event: HandlerEvent): string | null {
  const direct = /^\/blog\/([^/]+)\/?$/.exec(event.path || '')
  if (direct) {
    try { return parseBlogSlug(decodeURIComponent(direct[1])) } catch { return null }
  }
  if (!/^\/.netlify\/functions\/public-blog-post\/?$/.test(event.path || '')) return null
  const params = new URLSearchParams(event.rawQuery ?? '')
  const values = params.getAll('slug')
  if (!values.length && event.rawQuery == null && event.queryStringParameters?.slug) values.push(event.queryStringParameters.slug)
  return values.length === 1 ? parseBlogSlug(values[0]) : null
}

const currentPublished = (row: Record<string, any> | null, today = new Date()) => isCurrentPublicBlog(row, today.getTime())

type ReadPost = (slug: string) => Promise<Record<string, any> | null>
type ReadPosts = () => Promise<Record<string, any>[]>

async function readPublishedBlogPost(slug: string): Promise<Record<string, any> | null> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('PUBLIC_SUPABASE_READ_CONFIGURATION_REQUIRED')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabase.from('content_hub')
    .select('id,tipo,is_active,titulo,slug,cuerpo,categoria,created_at,updated_at,fecha_vencimiento,imagen_url,metadata')
    .eq('tipo', 'blog').eq('is_active', true).eq('slug', slug).maybeSingle()
  if (error) throw error
  return data || null
}

async function readPublishedBlogPosts(): Promise<Record<string, any>[]> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('PUBLIC_SUPABASE_READ_CONFIGURATION_REQUIRED')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const result: Record<string, any>[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('content_hub')
      .select('id,tipo,titulo,slug,cuerpo,categoria,created_at,updated_at,fecha_vencimiento,imagen_url,metadata,is_active')
      .eq('tipo', 'blog').eq('is_active', true).order('created_at', { ascending: false }).order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    result.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return result.filter(row => currentPublished(row))
}

type ReadRelated = (current: Record<string, any>) => Promise<Record<string, any>[]>

async function readPublishedRelatedPosts(current: Record<string, any>): Promise<Record<string, any>[]> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('PUBLIC_SUPABASE_READ_CONFIGURATION_REQUIRED')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  let query = supabase.from('content_hub')
    .select('id,tipo,is_active,titulo,slug,categoria,created_at,updated_at,fecha_vencimiento,imagen_url,metadata')
    .eq('tipo', 'blog').eq('is_active', true).neq('id', current.id)
    .order('created_at', { ascending: false }).order('id', { ascending: true }).limit(12)
  if (current.categoria) query = query.eq('categoria', current.categoria)
  const { data, error } = await query
  if (error) throw error
  return (data || []).filter(row => currentPublished(row)).slice(0, 3)
}

export function createPublicBlogPostHandler(readPost: ReadPost = readPublishedBlogPost, now: () => Date = () => new Date(), readPosts: ReadPosts = readPublishedBlogPosts, readRelated: ReadRelated = readPublishedRelatedPosts) {
  return async (event: HandlerEvent): Promise<HandlerResponse> => {
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers: { ...headers, Allow: 'GET' } }
    const functionRoute = /^\/.netlify\/functions\/public-blog-post\/?$/.test(event.path || '')
    const params = new URLSearchParams(event.rawQuery ?? '')
    const listRoute = /^\/blog\/?$/.test(event.path || '') || (functionRoute && params.get('view') === 'list')
    if (listRoute) {
      try {
        const candidates = await readPosts()
        const checkedAt = now().getTime()
        const invalidExpiry = candidates.filter(row => publicBlogExclusionReason(row, checkedAt) === 'BLOG_EXPIRY_INVALID')
        if (invalidExpiry.length) console.error('[public-blog-post:invalid-expiry]', JSON.stringify({ count: invalidExpiry.length, ids: invalidExpiry.map(row => row.id).filter(Boolean) }))
        const rows = candidates.filter(row => currentPublished(row, new Date(checkedAt)))
        return { statusCode: 200, headers, body: renderPublicBlogListHtml(rows, { measurementId: process.env.VITE_GA_MEASUREMENT_ID, asOf: checkedAt }) }
      } catch (error) {
        console.error('[public-blog-post:list]', error)
        return { statusCode: 503, headers: { ...headers, 'X-Robots-Tag': 'noindex' }, body: '<!doctype html><title>Blog temporalmente no disponible</title><meta name="robots" content="noindex"><h1>Intentá de nuevo más tarde</h1>' }
      }
    }
    const slug = identity(event)
    if (!slug) return { statusCode: 404, headers: { ...headers, 'X-Robots-Tag': 'noindex, nofollow' }, body: '<!doctype html><title>404</title><meta name="robots" content="noindex,nofollow"><h1>Artículo no encontrado</h1>' }
    try {
      const row = await readPost(slug)
      const checkedAt = now().getTime()
      if (row && publicBlogExclusionReason(row, checkedAt) === 'BLOG_EXPIRY_INVALID') console.error('[public-blog-post:invalid-expiry]', JSON.stringify({ id: row.id || null, slug: row.slug || null }))
      if (!currentPublished(row, new Date(checkedAt))) return { statusCode: 404, headers: { ...headers, 'X-Robots-Tag': 'noindex, nofollow' }, body: '<!doctype html><title>404</title><meta name="robots" content="noindex,nofollow"><h1>Artículo no disponible</h1>' }
      if (row.slug !== slug) return { statusCode: 301, headers: { Location: `/blog/${encodeURIComponent(row.slug)}`, 'Cache-Control': 'no-store' } }
      let related: Record<string, any>[] = []
      try { related = await readRelated(row) } catch (error) { console.error('[public-blog-post:related]', error) }
      return { statusCode: 200, headers, body: renderApprovedBlogHtml(row, { related, measurementId: process.env.VITE_GA_MEASUREMENT_ID, asOf: checkedAt }) }
    } catch (error) {
      console.error('[public-blog-post]', error)
      return { statusCode: 503, headers: { ...headers, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, body: '<!doctype html><title>Blog temporalmente no disponible</title><h1>Intentá de nuevo más tarde</h1>' }
    }
  }
}

export const handler: Handler = async (event) => createPublicBlogPostHandler()(event)
