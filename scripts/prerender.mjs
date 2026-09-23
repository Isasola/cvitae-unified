import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fetchAllPages } from '../src/lib/paged-fetch.js'
import { canonicalSitemapRows } from '../src/lib/sitemap-universe.js'
import { aggregatedJobPosting, factualJobPosting } from '../src/lib/factual-job-posting.shared.js'
import { toGoogleEmploymentType } from '../src/lib/seo/employment-type.shared.js'
import { deadlineLifecycle, isScholarshipLike } from '../src/lib/opportunity-truth.ts'
import { safeExternalUrl } from '../src/lib/safe-url.ts'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SITE_URL = 'https://cvitae.lat'
const distDir = join(process.cwd(), 'dist')
const seoInventoryPath = join(process.cwd(), 'generated', 'public-seo-inventory.json')
const publicFixturePath = process.env.PRERENDER_PUBLIC_FIXTURE
if (!existsSync(seoInventoryPath)) throw new Error('seo_inventory_missing')
const seoInventory = JSON.parse(readFileSync(seoInventoryPath, 'utf8'))
if (!seoInventory.generated_at || !Array.isArray(seoInventory.rows)) throw new Error('seo_inventory_invalid')
if (Date.now() - Date.parse(seoInventory.generated_at) > 24 * 60 * 60 * 1000) throw new Error('seo_inventory_stale')
if (seoInventory.rows.length === 0 && process.env.SEO_INVENTORY_ALLOW_EMPTY !== 'true') throw new Error('seo_inventory_empty')

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

const isSafeRouteSegment = value => /^[a-z0-9][a-z0-9._-]*$/i.test(String(value || ''))
const routeParts = canonicalPath => {
  const parts = String(canonicalPath || '').split('/').filter(Boolean)
  if (parts.length !== 2 || !isSafeRouteSegment(parts[0]) || !isSafeRouteSegment(parts[1])) throw new Error(`unsafe_canonical_path:${canonicalPath}`)
  return parts
}

function canonicalPublicRows(prefix, rows) {
  const rowsByPath = new Map()
  for (const row of rows) {
    const canonicalPath = `${prefix}/${String(row.slug || '').trim()}`
    if (!rowsByPath.has(canonicalPath)) rowsByPath.set(canonicalPath, row)
  }
  return canonicalSitemapRows(prefix, rows).map(({ canonical_path }) => ({ ...rowsByPath.get(canonical_path), canonical_path }))
}

async function fetchCanonicalPublicRows(supabase, table, prefix, columns, orderColumn = 'updated_at') {
  const rows = await fetchAllPages(1000, async (offset, size) => {
    let query = supabase.from(table).select(columns).not('slug', 'is', null).order(orderColumn, { ascending: false }).order('id', { ascending: true }).range(offset, offset + size - 1)
    query = table === 'content_hub' ? query.eq('tipo', 'blog').eq('is_active', true) : query.eq('is_active', true)
    const { data, error } = await query
    if (error) throw error
    return data || []
  })
  return canonicalPublicRows(prefix, rows)
}

function stripInlineMarkdown(text) {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

const P_STYLE = 'margin:0 0 1rem;line-height:1.8;color:rgba(232,232,224,.75);font-size:.9375rem;font-family:system-ui,sans-serif'
const H2_STYLE = 'font-size:1.375rem;font-weight:700;color:#fff;margin:2rem 0 .75rem;line-height:1.25;font-family:system-ui,sans-serif'
const H3_STYLE = 'font-size:1.125rem;font-weight:600;color:#e8e8e0;margin:1.5rem 0 .5rem;font-family:system-ui,sans-serif'
const LI_STYLE = 'margin-bottom:.4rem;color:rgba(232,232,224,.75);font-size:.9375rem;font-family:system-ui,sans-serif'
const BQ_STYLE = 'border-left:2px solid rgba(201,168,76,.5);margin:1rem 0;padding:.5rem 1rem;color:rgba(232,232,224,.6);font-style:italic;font-family:system-ui,sans-serif'

function markdownToSnapshotHtml(md, maxChars = 4000) {
  if (!md) return ''
  const raw = md.substring(0, maxChars)
  const lines = raw.split('\n')
  const parts = []
  let inUl = false, inOl = false

  const closeList = () => {
    if (inUl) { parts.push('</ul>'); inUl = false }
    if (inOl) { parts.push('</ol>'); inOl = false }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (/^#{1}\s/.test(line)) continue // skip h1 (already in header)

    if (/^#{2}\s/.test(line)) {
      closeList()
      parts.push(`<h2 style="${H2_STYLE}">${escapeHtml(stripInlineMarkdown(line.replace(/^##\s/, '')))}</h2>`)
      continue
    }

    if (/^#{3}\s/.test(line)) {
      closeList()
      parts.push(`<h3 style="${H3_STYLE}">${escapeHtml(stripInlineMarkdown(line.replace(/^###\s/, '')))}</h3>`)
      continue
    }

    if (/^>\s?/.test(line)) {
      closeList()
      parts.push(`<blockquote style="${BQ_STYLE}">${escapeHtml(stripInlineMarkdown(line.replace(/^>\s?/, '')))}</blockquote>`)
      continue
    }

    if (/^[-*+]\s/.test(line)) {
      if (!inUl) { closeList(); parts.push('<ul style="margin:0 0 1rem;padding-left:1.5rem">'); inUl = true }
      parts.push(`<li style="${LI_STYLE}">${escapeHtml(stripInlineMarkdown(line.replace(/^[-*+]\s/, '')))}</li>`)
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      if (!inOl) { closeList(); parts.push('<ol style="margin:0 0 1rem;padding-left:1.5rem">'); inOl = true }
      parts.push(`<li style="${LI_STYLE}">${escapeHtml(stripInlineMarkdown(line.replace(/^\d+\.\s/, '')))}</li>`)
      continue
    }

    closeList()
    if (line.trim() === '') continue // blank line between paragraphs

    parts.push(`<p style="${P_STYLE}">${escapeHtml(stripInlineMarkdown(line))}</p>`)
  }

  closeList()
  return parts.join('\n')
}

// ── Core helpers ───────────────────────────────────────────────────────────
function injectPage(templateHtml, metaTagsBlock, contentHtml) {
  // Strip template-level canonical and robots BEFORE injecting metaTagsBlock so the injected
  // page-specific tags are the sole authority. The home page (index.html) is not processed here
  // and retains its own canonical/robots from the template.
  const cleaned = templateHtml
    .replace(/<link[^>]+rel="canonical"[^>]*>\s*/g, '')
    .replace(/<meta[^>]+name="robots"[^>]*>\s*/g, '')
  return cleaned
    .replace('<title>CVitae | Tu Agente de Carrera Inteligente para Paraguay</title>', metaTagsBlock)
    .replace('<div id="root"></div>', `<div id="root">${contentHtml}</div>`)
}

function snapshotNav(backHref, backLabel) {
  const back = backHref
    ? `<a href="${backHref}" style="color:rgba(201,168,76,.7);text-decoration:none;font-size:.875rem;font-family:system-ui,sans-serif;margin-left:auto">${escapeHtml(backLabel || '← Volver')}</a>`
    : ''
  return `<nav style="background:#111;border-bottom:1px solid rgba(255,255,255,.08);padding:.75rem 1.5rem;display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap">
  <a href="/" style="color:#c9a84c;font-weight:700;text-decoration:none;font-family:system-ui,sans-serif;font-size:1rem">CVitae</a>
  <a href="/empleos" style="color:rgba(232,232,224,.5);text-decoration:none;font-size:.875rem;font-family:system-ui,sans-serif">Empleos</a>
  <a href="/oportunidades" style="color:rgba(232,232,224,.5);text-decoration:none;font-size:.875rem;font-family:system-ui,sans-serif">Oportunidades</a>
  <a href="/blog" style="color:rgba(232,232,224,.5);text-decoration:none;font-size:.875rem;font-family:system-ui,sans-serif">Blog</a>
  ${back}
</nav>`
}

// ── Content snapshot generators ────────────────────────────────────────────
function blogPostSnapshotContent(post) {
  const dateStr = post.created_at
    ? new Date(post.created_at).toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''
  const categoryBadge = post.categoria
    ? `<span style="font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;color:#c9a84c;border:1px solid rgba(201,168,76,.3);padding:.25rem .75rem;font-family:system-ui,sans-serif">${escapeHtml(post.categoria)}</span>`
    : ''
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav('/blog', '← Blog')}
<main style="max-width:800px;margin:0 auto;padding:3rem 1.5rem">
  ${categoryBadge}
  <h1 style="font-size:2.25rem;line-height:1.15;color:#fff;font-weight:700;margin:1rem 0 .5rem;font-family:system-ui,sans-serif">${escapeHtml(post.titulo)}</h1>
  ${dateStr ? `<time style="font-size:.875rem;color:rgba(232,232,224,.4);font-family:system-ui,sans-serif">${dateStr}</time>` : ''}
  <div style="height:1px;background:rgba(201,168,76,.2);margin:1.5rem 0"></div>
  <p style="font-size:.8125rem;color:rgba(232,232,224,.45);font-family:system-ui,sans-serif">Por ${escapeHtml(post.metadata?.author_name || 'Equipo editorial de CVitae')}</p>
  <article>${markdownToSnapshotHtml(post.cuerpo, 20000)}</article>
  <div style="margin-top:3rem;padding-top:1.5rem;border-top:1px solid rgba(255,255,255,.08)">
    <a href="/blog" style="color:#c9a84c;text-decoration:none;font-size:.875rem;font-family:system-ui,sans-serif">← Ver más artículos</a>
  </div>
</main>
</div>`
}

function jobSnapshotContent(job) {
  const location = [job.city, job.location].filter(Boolean).join(', ') || null
  const empType = toGoogleEmploymentType(job.type)
  const empLabel = empType ? `<span style="font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(232,232,224,.5);border:1px solid rgba(255,255,255,.1);padding:.2rem .6rem;font-family:system-ui,sans-serif">${empType.replace('_', ' ')}</span>` : ''
  const deadlineStr = deadlineLifecycle(job.deadline) === 'OPEN'
    ? new Date(job.deadline).toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const sourceUrl = job.distribution?.sourceAttributionRequired ? safeExternalUrl(job.source_url) : '#'
  const sourceAttribution = sourceUrl !== '#' ? `<p style="margin:1rem 0 0;font-size:.8125rem;font-family:system-ui,sans-serif"><a href="${escapeHtml(sourceUrl)}" rel="noopener noreferrer">Fuente original</a></p>` : ''
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav('/empleos', '← Empleos')}
<main style="max-width:800px;margin:0 auto;padding:3rem 1.5rem">
  ${job.organization ? `<p style="color:#c9a84c;font-size:.875rem;font-weight:600;margin:0 0 .5rem;font-family:system-ui,sans-serif">${escapeHtml(job.organization)}</p>` : ''}
  <h1 style="font-size:2rem;line-height:1.2;color:#fff;font-weight:700;margin:0 0 1rem;font-family:system-ui,sans-serif">${escapeHtml(job.title)}</h1>
  <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-bottom:1.5rem">
    ${location ? `<span style="font-size:.875rem;color:rgba(232,232,224,.6);font-family:system-ui,sans-serif">📍 ${escapeHtml(location)}</span>` : ''}
    ${empLabel}
    ${deadlineStr ? `<span style="font-size:.875rem;color:rgba(232,232,224,.6);font-family:system-ui,sans-serif">Hasta ${escapeHtml(deadlineStr)}</span>` : ""}
  </div>
  <div style="height:1px;background:rgba(255,255,255,.08);margin:1.5rem 0"></div>
  ${job.description ? `<section><h2 style="${H2_STYLE}">Descripción</h2>${markdownToSnapshotHtml(job.description, 2000)}</section>` : ''}
  ${sourceAttribution}
  <div style="margin-top:2.5rem">
    <a href="/empleos" style="color:#c9a84c;text-decoration:none;font-size:.875rem;font-family:system-ui,sans-serif">← Ver más empleos</a>
  </div>
</main>
</div>`
}

function opportunitySnapshotContent(opp) {
  const location = [opp.city, opp.location].filter(Boolean).join(', ') || null
  const deadlineStr = deadlineLifecycle(opp.deadline) === 'OPEN'
    ? new Date(opp.deadline).toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const sourceUrl = opp.distribution?.sourceAttributionRequired ? safeExternalUrl(opp.source_url) : '#'
  const sourceAttribution = sourceUrl !== '#' ? `<p style="margin:1rem 0 0;font-size:.8125rem;font-family:system-ui,sans-serif"><a href="${escapeHtml(sourceUrl)}" rel="noopener noreferrer">Fuente original</a></p>` : ''
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav('/oportunidades', '← Oportunidades')}
<main style="max-width:800px;margin:0 auto;padding:3rem 1.5rem">
  ${opp.organization ? `<p style="color:#c9a84c;font-size:.875rem;font-weight:600;margin:0 0 .5rem;font-family:system-ui,sans-serif">${escapeHtml(opp.organization)}</p>` : ''}
  <h1 style="font-size:2rem;line-height:1.2;color:#fff;font-weight:700;margin:0 0 1rem;font-family:system-ui,sans-serif">${escapeHtml(opp.title)}</h1>
  <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1.5rem">
    ${location ? `<span style="font-size:.875rem;color:rgba(232,232,224,.6);font-family:system-ui,sans-serif">📍 ${escapeHtml(location)}</span>` : ''}
    ${deadlineStr ? `<span style="font-size:.875rem;color:rgba(232,232,224,.6);font-family:system-ui,sans-serif">⏳ Hasta ${escapeHtml(deadlineStr)}</span>` : ''}
  </div>
  <div style="height:1px;background:rgba(255,255,255,.08);margin:1.5rem 0"></div>
  ${opp.description ? `<section><h2 style="${H2_STYLE}">Descripción</h2>${markdownToSnapshotHtml(opp.description, 2000)}</section>` : ''}
  ${sourceAttribution}
  <div style="margin-top:2.5rem">
    <a href="/oportunidades" style="color:#c9a84c;text-decoration:none;font-size:.875rem;font-family:system-ui,sans-serif">← Ver más oportunidades</a>
  </div>
</main>
</div>`
}

function vacancySnapshotContent(vacancy) {
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav('/empleos', '← Empleos')}
<main style="max-width:800px;margin:0 auto;padding:3rem 1.5rem">
  ${vacancy.company ? `<p style="color:#c9a84c;font-size:.875rem;font-weight:600;margin:0 0 .5rem;font-family:system-ui,sans-serif">${escapeHtml(vacancy.company)}</p>` : ''}
  <h1 style="font-size:2rem;line-height:1.2;color:#fff;font-weight:700;margin:0 0 1rem;font-family:system-ui,sans-serif">${escapeHtml(vacancy.title)}</h1>
  ${vacancy.location ? `<p style="font-size:.875rem;color:rgba(232,232,224,.6);font-family:system-ui,sans-serif">📍 ${escapeHtml(vacancy.location)}</p>` : ''}
  <div style="height:1px;background:rgba(255,255,255,.08);margin:1.5rem 0"></div>
  ${vacancy.description ? `<section><h2 style="${H2_STYLE}">Descripción</h2>${markdownToSnapshotHtml(vacancy.description, 2000)}</section>` : ''}
</main>
</div>`
}

function blogIndexSnapshotContent(posts) {
  const items = (posts || []).map(p => {
    const excerpt = (p.cuerpo || '').replace(/[#*`_>~\[\]!]/g, '').replace(/\(https?:[^)]+\)/g, '').substring(0, 140)
    return `<li style="border-bottom:1px solid rgba(255,255,255,.06);padding:1.25rem 0">
  <a href="/blog/${escapeHtml(p.slug)}" style="color:#e8e8e0;text-decoration:none;display:block">
    <h2 style="font-size:1.1rem;color:#fff;margin:0 0 .35rem;font-family:system-ui,sans-serif;font-weight:600">${escapeHtml(p.titulo)}</h2>
    ${excerpt ? `<p style="font-size:.875rem;color:rgba(232,232,224,.5);margin:0;font-family:system-ui,sans-serif;line-height:1.5">${escapeHtml(excerpt)}…</p>` : ''}
  </a>
</li>`
  }).join('\n')
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav()}
<main style="max-width:900px;margin:0 auto;padding:3rem 1.5rem">
  <h1 style="font-size:2.5rem;color:#fff;font-weight:700;margin:0 0 .75rem;font-family:system-ui,sans-serif">Blog CVitae</h1>
  <p style="font-size:1rem;color:rgba(232,232,224,.6);margin:0 0 2.5rem;font-family:system-ui,sans-serif">Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay.</p>
  ${items ? `<ul style="list-style:none;padding:0;margin:0">${items}</ul>` : '<p style="color:rgba(232,232,224,.5);font-family:system-ui,sans-serif">Próximamente…</p>'}
</main>
</div>`
}

function empleosIndexSnapshotContent(jobs) {
  const items = (jobs || []).slice(0, 150).map(j => {
    const meta = [j.organization, j.city || j.location].filter(Boolean).join(' · ')
    return `<li style="border-bottom:1px solid rgba(255,255,255,.06);padding:1.1rem 0">
  <a href="/empleos/${escapeHtml(j.slug)}" style="color:#e8e8e0;text-decoration:none;display:block">
    <h2 style="font-size:1rem;color:#fff;margin:0 0 .2rem;font-family:system-ui,sans-serif;font-weight:600">${escapeHtml(j.title)}</h2>
    ${meta ? `<p style="font-size:.8125rem;color:rgba(232,232,224,.45);margin:0;font-family:system-ui,sans-serif">${escapeHtml(meta)}</p>` : ''}
  </a>
</li>`
  }).join('\n')
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav()}
<main style="max-width:900px;margin:0 auto;padding:3rem 1.5rem">
  <h1 style="font-size:2.5rem;color:#fff;font-weight:700;margin:0 0 .75rem;font-family:system-ui,sans-serif">Empleos en Paraguay</h1>
  <p style="font-size:1rem;color:rgba(232,232,224,.6);margin:0 0 2.5rem;font-family:system-ui,sans-serif">Vacantes laborales verificadas de Paraguay y Latinoamérica, actualizadas diariamente.</p>
  ${items ? `<ul style="list-style:none;padding:0;margin:0">${items}</ul>` : '<p style="color:rgba(232,232,224,.5);font-family:system-ui,sans-serif">Sin empleos disponibles en este momento.</p>'}
</main>
</div>`
}

function oportunidadesIndexSnapshotContent(opps) {
  const items = (opps || []).slice(0, 150).map(o => {
    const meta = [o.organization, o.city || o.location].filter(Boolean).join(' · ')
    return `<li style="border-bottom:1px solid rgba(255,255,255,.06);padding:1.1rem 0">
  <a href="/oportunidades/${escapeHtml(o.slug)}" style="color:#e8e8e0;text-decoration:none;display:block">
    <h2 style="font-size:1rem;color:#fff;margin:0 0 .2rem;font-family:system-ui,sans-serif;font-weight:600">${escapeHtml(o.title)}</h2>
    ${meta ? `<p style="font-size:.8125rem;color:rgba(232,232,224,.45);margin:0;font-family:system-ui,sans-serif">${escapeHtml(meta)}</p>` : ''}
  </a>
</li>`
  }).join('\n')
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav()}
<main style="max-width:900px;margin:0 auto;padding:3rem 1.5rem">
  <h1 style="font-size:2.5rem;color:#fff;font-weight:700;margin:0 0 .75rem;font-family:system-ui,sans-serif">Oportunidades</h1>
  <p style="font-size:1rem;color:rgba(232,232,224,.6);margin:0 0 2.5rem;font-family:system-ui,sans-serif">Becas, fellowships, aceleradoras y empleos verificados para Paraguay y Latinoamérica.</p>
  ${items ? `<ul style="list-style:none;padding:0;margin:0">${items}</ul>` : '<p style="color:rgba(232,232,224,.5);font-family:system-ui,sans-serif">Sin oportunidades disponibles en este momento.</p>'}
</main>
</div>`
}

function staticPageSnapshotContent(title, desc, bodyHtml = '') {
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav()}
<main style="max-width:800px;margin:0 auto;padding:3rem 1.5rem">
  <h1 style="font-size:2rem;color:#fff;font-weight:700;margin:0 0 .75rem;font-family:system-ui,sans-serif">${escapeHtml(title)}</h1>
  <p style="font-size:1rem;color:rgba(232,232,224,.6);margin:0 0 2rem;font-family:system-ui,sans-serif">${escapeHtml(desc)}</p>
  ${bodyHtml}
</main>
</div>`
}

const MARKET_SNAPSHOT_META = {
  paraguay: { eyebrow: 'Oportunidades Paraguay', h1: 'Oportunidades verificadas para Paraguay.', desc: 'Empleos, becas, programas y financiación verificados para personas en Paraguay.' },
  latam: { eyebrow: 'Becas y Programas LATAM', h1: 'Becas y programas para LATAM.', desc: 'Becas internacionales, fellowships y programas verificados para América Latina.' },
  peru: { eyebrow: 'Oportunidades Perú', h1: 'Oportunidades verificadas para Perú.', desc: 'Empleos, becas y programas verificados disponibles para personas en Perú y América Latina.' },
  'remoto-latam': { eyebrow: 'Empleos Remotos LATAM', h1: 'Empleos remotos para LATAM.', desc: 'Empleos 100% remotos abiertos a candidatos de América Latina.' },
}

function marketSnapshotContent(market) {
  const m = MARKET_SNAPSHOT_META[market] || MARKET_SNAPSHOT_META.paraguay
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav('/oportunidades', '← Oportunidades')}
<main style="max-width:900px;margin:0 auto;padding:3rem 1.5rem">
  <p style="font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;color:#c9a84c;font-family:system-ui,sans-serif">${escapeHtml(m.eyebrow)}</p>
  <h1 style="font-size:2rem;color:#fff;font-weight:700;margin:.75rem 0 1rem;font-family:system-ui,sans-serif">${escapeHtml(m.h1)}</h1>
  <p style="font-size:1rem;color:rgba(232,232,224,.6);margin:0 0 2rem;font-family:system-ui,sans-serif">${escapeHtml(m.desc)}</p>
  <p style="font-size:.875rem;color:rgba(232,232,224,.4);font-family:system-ui,sans-serif">Consultando oportunidades verificadas…</p>
</main>
</div>`
}

// ── Main ───────────────────────────────────────────────────────────────────
async function prerender() {
  if (!existsSync(join(distDir, 'index.html'))) {
    console.error('dist/index.html no existe.')
    process.exit(0)
  }
  const templateHtml = readFileSync(join(distDir, 'index.html'), 'utf-8')

  // ── 1. Home with static fallback ─────────────────────────────────────────
  const homeFallback = `<main aria-label="CVitae" data-prerender>
  <section>
    <p>Gratis · Paraguay y Latinoamérica</p>
    <h1>Analizá tu CV gratis. Después, encontrá el trabajo que te corresponde.</h1>
    <p>Subí tu CV y recibí en segundos un score ATS, fortalezas y mejoras concretas.</p>
    <ol><li>CV</li><li>Perfil entendido</li><li>Matches</li><li>Próxima acción</li></ol>
    <p><a href="#analizador">Analizar mi CV gratis</a> · <a href="/mi-carrera">Crear mi perfil</a></p>
  </section>
  <section id="analizador"><h2>Tu score ATS real, en segundos</h2><p>Análisis inicial sin crear una cuenta.</p></section>
  <section><h2>Inteligencia profesional para avanzar</h2><p>Matching de oportunidades, CV adaptado, alertas y recomendaciones para candidatos.</p></section>
  <section><h2>Herramientas para empresas</h2><p>Análisis de CVs, ranking comparativo y evaluación explicable para revisión humana.</p><a href="/empresas">Conocer la solución para empresas</a></section>
  <nav aria-label="Secciones principales"><a href="/oportunidades">Oportunidades</a> · <a href="/blog">Blog</a> · <a href="/sobre-cvitae">Sobre CVitae</a></nav>
</main>`
  writeFileSync(join(distDir, 'index.html'), templateHtml.replace('<div id="root"></div>', `<div id="root">${homeFallback}</div>`))

  // ── 2. 404.html ──────────────────────────────────────────────────────────
  const notFoundMeta = `<title>Página no encontrada | CVitae</title>
<meta name="description" content="La página que buscás no existe en CVitae.">
<link rel="canonical" href="${SITE_URL}">
<meta name="robots" content="noindex,nofollow">`
  const notFoundContent = `<main style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;font-family:system-ui;color:#e8e8e0;background:#111;gap:1rem"><h1 style="font-size:2rem;font-weight:700">404</h1><p style="color:#ffffff60">Esta página no existe o fue removida.</p><a href="/" style="color:#c9a84c;text-decoration:none;font-size:.875rem">← Volver al inicio</a></main>`
  writeFileSync(join(distDir, '404.html'), injectPage(templateHtml, notFoundMeta, notFoundContent))

  // ── 3. Static shells — always, no Supabase needed ────────────────────────
  const staticShells = [
    {
      path: 'blog',
      title: 'Blog de Carrera | CVitae',
      desc: 'Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay.',
      ld: { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog CVitae', url: `${SITE_URL}/blog`, description: 'Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay.', publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL } },
      snapshot: blogIndexSnapshotContent([]),
    },
    {
      path: 'empleos',
      title: 'Empleos en Paraguay actualizados | CVitae',
      desc: 'Vacantes laborales de Paraguay reunidas, deduplicadas y revisadas diariamente.',
      ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Empleos en Paraguay', url: `${SITE_URL}/empleos`, description: 'Catálogo de empleos verificados de Paraguay y Latinoamérica.', publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL } },
      snapshot: empleosIndexSnapshotContent([]),
    },
    {
      path: 'oportunidades',
      title: 'Oportunidades Laborales en Paraguay | CVitae',
      desc: 'Empleos, becas y oportunidades de crecimiento en Paraguay y Latinoamérica.',
      ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Oportunidades en Paraguay y LATAM', url: `${SITE_URL}/oportunidades`, description: 'Becas, fellowships, aceleradoras y empleos verificados para Paraguay y Latinoamérica.', publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL } },
      snapshot: oportunidadesIndexSnapshotContent([]),
    },
    {
      path: 'sobre-cvitae',
      title: 'Sobre CVitae | Agente de Carrera con IA para Paraguay',
      desc: 'Conocé la misión de CVitae: conectar talento paraguayo con las mejores oportunidades usando inteligencia artificial.',
      ld: { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'Sobre CVitae', url: `${SITE_URL}/sobre-cvitae`, description: 'CVitae es el primer agente de carrera con IA para Paraguay y Latinoamérica.', publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL } },
      snapshot: staticPageSnapshotContent(
        'Sobre CVitae',
        'El primer agente de carrera con inteligencia artificial para Paraguay y Latinoamérica.',
        `<ul style="list-style:none;padding:0;margin:0">
  <li style="${LI_STYLE};padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.06)">Centraliza oportunidades laborales verificadas de múltiples fuentes.</li>
  <li style="${LI_STYLE};padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.06)">Analiza CVs con IA y adapta el curriculum a cada vacante específica.</li>
  <li style="${LI_STYLE};padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.06)">Envía alertas proactivas cuando aparecen oportunidades relevantes para el perfil del usuario.</li>
  <li style="${LI_STYLE};padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.06)">Reconocida como Top 100 Moonshot Paraguay 2026.</li>
  <li style="${LI_STYLE};padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.06)">Beta gratuita para candidatos.</li>
  <li style="${LI_STYLE};padding:.5rem 0">Portal B2B para empresas con análisis masivo de candidatos.</li>
</ul>`
      ),
    },
    {
      path: 'privacy',
      title: 'Política de Privacidad | CVitae',
      desc: 'Política de privacidad de CVitae.',
      snapshot: staticPageSnapshotContent('Política de Privacidad', 'Cómo CVitae trata y protege los datos de cuentas, perfiles, CV y postulaciones.', `
        <h2 style="${H2_STYLE}">Datos y finalidad</h2><p style="${P_STYLE}">Tratamos los datos que proporcionás al crear una cuenta, completar tu perfil, analizar un CV, configurar alertas o postularte para prestar esas funciones. No vendemos datos personales.</p>
        <h2 style="${H2_STYLE}">CV, inteligencia artificial y proveedores</h2><p style="${P_STYLE}">Los documentos y datos profesionales pueden procesarse mediante infraestructura de Supabase, AWS y servicios de IA indicados en la política completa. Las postulaciones se comparten con la empresa responsable del proceso.</p>
        <h2 style="${H2_STYLE}">Cookies y medición</h2><p style="${P_STYLE}">Las preferencias permiten aceptar, rechazar o cambiar la medición y la publicidad. Los servicios no esenciales permanecen sujetos a la elección del visitante.</p>
        <h2 style="${H2_STYLE}">Tus derechos y contacto</h2><p style="${P_STYLE}">Podés rectificar o eliminar el perfil desde Configuración y contactar a cvitaeparaguay@gmail.com para consultas o solicitudes relacionadas con tus datos.</p>`),
    },
    {
      path: 'terminos',
      title: 'Términos de Servicio | CVitae',
      desc: 'Condiciones de uso de la plataforma CVitae.',
      snapshot: staticPageSnapshotContent('Términos de Servicio', 'Condiciones de uso de la plataforma CVitae.', `<p style="${P_STYLE}">Al utilizar CVitae aceptás las condiciones aplicables al procesamiento de perfiles y CV, las recomendaciones asistidas por IA, las postulaciones y las etapas gratuitas o pagas informadas en el producto.</p><p style="${P_STYLE}">Tu CV sigue siendo de tu propiedad. Las recomendaciones requieren revisión humana y no garantizan empleo, admisión ni selección.</p>`),
    },
    {
      path: 'cookies',
      title: 'Política de Cookies | CVitae',
      desc: 'Cómo CVitae utiliza cookies necesarias, Analytics y publicidad, y cómo administrar tus preferencias.',
      snapshot: staticPageSnapshotContent('Política de Cookies', 'Cómo administrar las cookies y tecnologías de medición de CVitae.', `
        <h2 style="${H2_STYLE}">Cookies necesarias</h2><p style="${P_STYLE}">Sostienen la sesión, la seguridad y las funciones que solicitás.</p>
        <h2 style="${H2_STYLE}">Analytics y publicidad</h2><p style="${P_STYLE}">Google Analytics ayuda a entender el uso del sitio. La publicidad permanece desactivada hasta contar con configuración operativa y consentimiento aplicable.</p>
        <h2 style="${H2_STYLE}">Cambiar tu decisión</h2><p style="${P_STYLE}">Podés reabrir Preferencias de cookies desde el pie de página para aceptar, rechazar o modificar tus opciones.</p>`),
    },
    // Market opportunity pages — prerendered so Netlify serves correct SEO HTML before JS
    {
      path: 'oportunidades/paraguay',
      title: 'Empleos y oportunidades en Paraguay | CVitae',
      desc: 'Empleos, becas, programas y financiación verificados y disponibles para personas en Paraguay.',
      index: true,
      snapshot: marketSnapshotContent('paraguay'),
    },
    {
      path: 'oportunidades/latam',
      title: 'Becas y programas para América Latina | CVitae',
      desc: 'Becas internacionales, fellowships, intercambios y programas verificados para candidatos de América Latina.',
      index: true,
      snapshot: marketSnapshotContent('latam'),
    },
    {
      path: 'oportunidades/peru',
      title: 'Empleos y oportunidades en Perú | CVitae',
      desc: 'Empleos, becas y programas verificados disponibles para personas en Perú y América Latina.',
      index: false,
      snapshot: marketSnapshotContent('peru'),
    },
    {
      path: 'oportunidades/remoto-latam',
      title: 'Empleos remotos para América Latina | CVitae',
      desc: 'Empleos 100% remotos en tecnología, diseño y marketing, abiertos a candidatos de América Latina.',
      index: false,
      snapshot: marketSnapshotContent('remoto-latam'),
    },
  ]

  for (const route of staticShells) {
    const routeDir = join(distDir, route.path)
    mkdirSync(routeDir, { recursive: true })
    const ldTag = route.ld ? `\n<script type="application/ld+json">${JSON.stringify(route.ld).replace(/</g, '\\u003c')}</script>` : ''
    const robotsTag = route.index === false ? '\n<meta name="robots" content="noindex,follow">' : ''
    const metaTags = `<title>${route.title}</title>
<meta name="description" content="${escapeHtml(route.desc)}">
<link rel="canonical" href="${SITE_URL}/${route.path}">
<meta property="og:title" content="${route.title}">
<meta property="og:description" content="${escapeHtml(route.desc)}">
<meta property="og:url" content="${SITE_URL}/${route.path}">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE_URL}/og-image.jpg">${ldTag}${robotsTag}`
    writeFileSync(join(routeDir, 'index.html'), injectPage(templateHtml, metaTags, route.snapshot))
  }

  // ── 4. Dynamic routes — need Supabase ────────────────────────────────────
  const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { transport: WebSocket } })
    : null

  let posts = [], vacancies = []
  let jobs = (seoInventory.rows || []).filter(row => row.canonical_path?.startsWith('/empleos/'))
  let nonJobOpps = (seoInventory.rows || []).filter(row => row.canonical_path?.startsWith('/oportunidades/'))
  if (publicFixturePath) {
    const fixture = JSON.parse(readFileSync(publicFixturePath, 'utf8'))
    if (!Array.isArray(fixture.blogs) || !Array.isArray(fixture.vacancies)) throw new Error('prerender_public_fixture_invalid')
    posts = canonicalPublicRows('/blog', fixture.blogs.filter(row => row.is_active !== false))
    vacancies = canonicalPublicRows('/vacante', fixture.vacancies.filter(row => row.is_active !== false))
  } else if (supabase) {
    ;[posts, vacancies] = await Promise.all([
      fetchCanonicalPublicRows(supabase, 'content_hub', '/blog', 'id,slug,titulo,cuerpo,created_at,updated_at,imagen_url,categoria,metadata'),
      fetchCanonicalPublicRows(supabase, 'recruiter_vacancies', '/vacante', 'id,slug,title,company,location,modality,description,requirements,salary_range,created_at', 'created_at'),
    ])
  }

  jobs = jobs || []
  nonJobOpps = nonJobOpps || []

  // ── Blog index (overwrite shell with real list) ──────────────────────────
  {
    const blogLd = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog CVitae', url: `${SITE_URL}/blog`, description: 'Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay.', publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL } }
    const meta = `<title>Blog de Carrera | CVitae</title>
<meta name="description" content="Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay.">
<link rel="canonical" href="${SITE_URL}/blog">
<meta property="og:title" content="Blog de Carrera | CVitae">
<meta property="og:description" content="Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay.">
<meta property="og:url" content="${SITE_URL}/blog">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE_URL}/og-image.jpg">
<script type="application/ld+json">${JSON.stringify(blogLd).replace(/</g, '\\u003c')}</script>`
    mkdirSync(join(distDir, 'blog'), { recursive: true })
    writeFileSync(join(distDir, 'blog', 'index.html'), injectPage(templateHtml, meta, blogIndexSnapshotContent(posts)))
  }

  // ── Blog posts ────────────────────────────────────────────────────────────
  let blogCount = 0
  const blogDir = join(distDir, 'blog')
  mkdirSync(blogDir, { recursive: true })
  for (const post of posts) {
    const [family, slug] = routeParts(post.canonical_path)
    if (family !== 'blog') throw new Error(`unexpected_blog_canonical_path:${post.canonical_path}`)
    const title = post.titulo || 'Blog'
    const excerpt = (post.cuerpo || '').replace(/[#*`>_~\[\]!]/g, '').replace(/\(https?:[^)]+\)/g, '').substring(0, 160)
    const datePublished = post.created_at || ''
    const dateModified = post.updated_at || post.created_at || ''
    const imageUrl = post.imagen_url || `${SITE_URL}/og-image.jpg`
    const canonical = `${SITE_URL}${post.canonical_path}`
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BlogPosting', '@id': `${canonical}#article`,
          headline: title, description: excerpt, url: canonical,
          mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
          datePublished, dateModified, image: imageUrl,
          inLanguage: 'es-PY', articleSection: post.categoria || undefined,
          author: { '@type': 'Organization', name: post.metadata?.author_name || 'Equipo editorial de CVitae', url: `${SITE_URL}/sobre-cvitae` },
          publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` } },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
            { '@type': 'ListItem', position: 3, name: title, item: canonical },
          ],
        },
      ],
    }
    const metaTags = `<title>${escapeHtml(title)} | CVitae</title>
<meta name="description" content="${escapeHtml(excerpt)}">
<meta property="og:title" content="${escapeHtml(title)} | CVitae">
<meta property="og:description" content="${escapeHtml(excerpt)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${imageUrl}">
<meta property="article:published_time" content="${escapeHtml(datePublished)}">
<meta property="article:modified_time" content="${escapeHtml(dateModified)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
    const postDir = join(distDir, family, slug)
    mkdirSync(postDir, { recursive: true })
    writeFileSync(join(postDir, 'index.html'), injectPage(templateHtml, metaTags, blogPostSnapshotContent(post)))
    blogCount++
  }

  // ── Empleos index (overwrite with real list) ──────────────────────────────
  {
    const empLd = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Empleos en Paraguay', url: `${SITE_URL}/empleos`, description: 'Catálogo de empleos verificados de Paraguay y Latinoamérica.', publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL } }
    const meta = `<title>Empleos en Paraguay actualizados | CVitae</title>
<meta name="description" content="Vacantes laborales de Paraguay reunidas, deduplicadas y revisadas diariamente.">
<link rel="canonical" href="${SITE_URL}/empleos">
<meta property="og:title" content="Empleos en Paraguay | CVitae">
<meta property="og:description" content="Vacantes laborales de Paraguay reunidas, deduplicadas y revisadas diariamente.">
<meta property="og:url" content="${SITE_URL}/empleos">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE_URL}/og-image.jpg">
<script type="application/ld+json">${JSON.stringify(empLd).replace(/</g, '\\u003c')}</script>`
    mkdirSync(join(distDir, 'empleos'), { recursive: true })
    writeFileSync(join(distDir, 'empleos', 'index.html'), injectPage(templateHtml, meta, empleosIndexSnapshotContent(jobs)))
  }

  // ── Individual jobs ───────────────────────────────────────────────────────
  let jobCount = 0
  for (const job of jobs) {
    const [family, slug] = routeParts(job.canonical_path)
    if (family !== 'empleos') throw new Error(`unexpected_job_canonical_path:${job.canonical_path}`)
    const title = (job.title || '').trim()
    if (!title) throw new Error(`inventory_job_missing_title:${job.canonical_path}`)
    const description = (job.description || '').trim()
    const descExcerpt = description.replace(/[#*`>]/g, '').substring(0, 160) || title
    const canonical = `${SITE_URL}${job.canonical_path}`
    const realOrg = (job.organization || '').trim()
    const factual = aggregatedJobPosting(job, canonical)
    const ld = factual.structuredData ?? {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      url: canonical,
      description: descExcerpt,
    }
    const metaTags = `<title>${escapeHtml(title)} | CVitae</title>
<meta name="description" content="${escapeHtml(descExcerpt)}">
<meta property="og:title" content="${escapeHtml(title)} | CVitae">
<meta property="og:description" content="${escapeHtml(descExcerpt)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${SITE_URL}/og-image.jpg">
<link rel="canonical" href="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
    const jobDir = join(distDir, family, slug)
    mkdirSync(jobDir, { recursive: true })
    writeFileSync(join(jobDir, 'index.html'), injectPage(templateHtml, metaTags, jobSnapshotContent(job)))
    jobCount++
  }

  // ── Oportunidades index (overwrite with real list) ────────────────────────
  {
    const oppLd = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Oportunidades en Paraguay y LATAM', url: `${SITE_URL}/oportunidades`, description: 'Becas, fellowships, aceleradoras y empleos verificados para Paraguay y Latinoamérica.', publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL } }
    const meta = `<title>Oportunidades Laborales en Paraguay | CVitae</title>
<meta name="description" content="Empleos, becas y oportunidades de crecimiento en Paraguay y Latinoamérica.">
<link rel="canonical" href="${SITE_URL}/oportunidades">
<meta property="og:title" content="Oportunidades en Paraguay | CVitae">
<meta property="og:description" content="Empleos, becas y oportunidades de crecimiento en Paraguay y Latinoamérica.">
<meta property="og:url" content="${SITE_URL}/oportunidades">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE_URL}/og-image.jpg">
<script type="application/ld+json">${JSON.stringify(oppLd).replace(/</g, '\\u003c')}</script>`
    mkdirSync(join(distDir, 'oportunidades'), { recursive: true })
    writeFileSync(join(distDir, 'oportunidades', 'index.html'), injectPage(templateHtml, meta, oportunidadesIndexSnapshotContent(nonJobOpps)))
  }

  // ── Non-job opportunities ─────────────────────────────────────────────────
  let oppCount = 0
  for (const opp of nonJobOpps) {
    const [family, slug] = routeParts(opp.canonical_path)
    if (family !== 'oportunidades') throw new Error(`unexpected_opportunity_canonical_path:${opp.canonical_path}`)
    const title = (opp.title || '').trim()
    if (!title) throw new Error(`inventory_opportunity_missing_title:${opp.canonical_path}`)
    const desc = (opp.description || title).replace(/[#*`>]/g, '').substring(0, 160)
    const canonical = `${SITE_URL}${opp.canonical_path}`
    const ldType = isScholarshipLike(opp) ? 'Scholarship' : 'WebPage'
    const ld = {
      '@context': 'https://schema.org', '@type': ldType,
      name: title, description: desc, url: canonical,
      ...(deadlineLifecycle(opp.deadline) === 'OPEN' ? { validThrough: opp.deadline } : {}),
      ...(opp.organization ? { provider: { '@type': 'Organization', name: opp.organization } } : {}),
    }
    const metaTags = `<title>${escapeHtml(title)} | CVitae</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:title" content="${escapeHtml(title)} | CVitae">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${SITE_URL}/og-image.jpg">
<link rel="canonical" href="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
    const oppDir = join(distDir, family, slug)
    mkdirSync(oppDir, { recursive: true })
    writeFileSync(join(oppDir, 'index.html'), injectPage(templateHtml, metaTags, opportunitySnapshotContent(opp)))
    oppCount++
  }

  let vacancyCount = 0
  for (const vacancy of vacancies) {
    const [family, slug] = routeParts(vacancy.canonical_path)
    if (family !== 'vacante') throw new Error(`unexpected_vacancy_canonical_path:${vacancy.canonical_path}`)
    const title = (vacancy.title || '').trim()
    if (!title) throw new Error(`vacancy_missing_title:${vacancy.canonical_path}`)
    const canonical = `${SITE_URL}${vacancy.canonical_path}`
    const description = (vacancy.description || title).replace(/[#*`>]/g, '').substring(0, 160)
    const factual = factualJobPosting(
      {
        ...vacancy,
        opportunity_type: 'job',
        first_party_direct_apply: true,
      },
      canonical,
    )
    const ld = factual.structuredData ?? {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonical,
    }
    const metaTags = `<title>${escapeHtml(title)} · CVitae</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)} · CVitae">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<link rel="canonical" href="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
    const vacancyDir = join(distDir, family, slug)
    mkdirSync(vacancyDir, { recursive: true })
    writeFileSync(join(vacancyDir, 'index.html'), injectPage(templateHtml, metaTags, vacancySnapshotContent(vacancy)))
    vacancyCount++
  }

  console.log(`Prerender completed — blog: ${blogCount}, jobs: ${jobCount}, opportunities: ${oppCount}, vacancies: ${vacancyCount}`)
}

prerender().catch(err => { console.error('[prerender] Fatal error:', err); process.exit(1) })
