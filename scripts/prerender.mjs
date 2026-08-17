import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SITE_URL = 'https://cvitae.lat'
const distDir = join(process.cwd(), 'dist')

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

const isSafeRouteSegment = value => /^[a-z0-9][a-z0-9._-]*$/i.test(String(value || ''))

const EMPLOYMENT_TYPE_MAPPING = {
  'tiempo completo': 'FULL_TIME', 'full time': 'FULL_TIME', 'full-time': 'FULL_TIME',
  'medio tiempo': 'PART_TIME', 'part time': 'PART_TIME', 'part-time': 'PART_TIME',
  'jornada parcial': 'PART_TIME',
  'freelance': 'CONTRACTOR', 'contratista': 'CONTRACTOR', 'contractor': 'CONTRACTOR',
  'temporal': 'TEMPORARY', 'temporary': 'TEMPORARY',
  'pasantia': 'INTERN', 'pasantía': 'INTERN', 'internship': 'INTERN', 'intern': 'INTERN',
  'practicante': 'INTERN', 'trainee': 'INTERN',
  'voluntario': 'VOLUNTEER', 'voluntariado': 'VOLUNTEER', 'volunteer': 'VOLUNTEER',
  'otro': 'OTHER', 'other': 'OTHER',
}
const GOOGLE_ET_VALID = new Set(['FULL_TIME','PART_TIME','CONTRACTOR','TEMPORARY','INTERN','VOLUNTEER','PER_DIEM','OTHER'])
const toGoogleEmploymentType = raw => {
  if (!raw) return undefined
  const n = String(raw).trim().toLowerCase()
  if (GOOGLE_ET_VALID.has(n.toUpperCase())) return n.toUpperCase()
  return EMPLOYMENT_TYPE_MAPPING[n] ?? undefined
}

// ── Markdown → snapshot HTML ───────────────────────────────────────────────
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
  return templateHtml
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
  <article>${markdownToSnapshotHtml(post.cuerpo, 5000)}</article>
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
  return `<div style="min-height:100vh;background:#111111">
${snapshotNav('/empleos', '← Empleos')}
<main style="max-width:800px;margin:0 auto;padding:3rem 1.5rem">
  ${job.organization ? `<p style="color:#c9a84c;font-size:.875rem;font-weight:600;margin:0 0 .5rem;font-family:system-ui,sans-serif">${escapeHtml(job.organization)}</p>` : ''}
  <h1 style="font-size:2rem;line-height:1.2;color:#fff;font-weight:700;margin:0 0 1rem;font-family:system-ui,sans-serif">${escapeHtml(job.title)}</h1>
  <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-bottom:1.5rem">
    ${location ? `<span style="font-size:.875rem;color:rgba(232,232,224,.6);font-family:system-ui,sans-serif">📍 ${escapeHtml(location)}</span>` : ''}
    ${empLabel}
  </div>
  <div style="height:1px;background:rgba(255,255,255,.08);margin:1.5rem 0"></div>
  ${job.description ? `<section><h2 style="${H2_STYLE}">Descripción</h2>${markdownToSnapshotHtml(job.description, 2000)}</section>` : ''}
  <div style="margin-top:2.5rem">
    <a href="/empleos" style="color:#c9a84c;text-decoration:none;font-size:.875rem;font-family:system-ui,sans-serif">← Ver más empleos</a>
  </div>
</main>
</div>`
}

function opportunitySnapshotContent(opp) {
  const location = [opp.city, opp.location].filter(Boolean).join(', ') || null
  const deadlineStr = opp.deadline
    ? new Date(opp.deadline).toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
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
  <div style="margin-top:2.5rem">
    <a href="/oportunidades" style="color:#c9a84c;text-decoration:none;font-size:.875rem;font-family:system-ui,sans-serif">← Ver más oportunidades</a>
  </div>
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
  const items = (jobs || []).slice(0, 50).map(j => {
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
  const items = (opps || []).slice(0, 50).map(o => {
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
      snapshot: staticPageSnapshotContent('Política de Privacidad', 'Política de privacidad de CVitae.'),
    },
    {
      path: 'terminos',
      title: 'Términos de Servicio | CVitae',
      desc: 'Condiciones de uso de la plataforma CVitae.',
      snapshot: staticPageSnapshotContent('Términos de Servicio', 'Condiciones de uso de la plataforma CVitae.'),
    },
  ]

  for (const route of staticShells) {
    const routeDir = join(distDir, route.path)
    mkdirSync(routeDir, { recursive: true })
    const ldTag = route.ld ? `\n<script type="application/ld+json">${JSON.stringify(route.ld).replace(/</g, '\\u003c')}</script>` : ''
    const metaTags = `<title>${route.title}</title>
<meta name="description" content="${escapeHtml(route.desc)}">
<link rel="canonical" href="${SITE_URL}/${route.path}">
<meta property="og:title" content="${route.title}">
<meta property="og:description" content="${escapeHtml(route.desc)}">
<meta property="og:url" content="${SITE_URL}/${route.path}">${ldTag}`
    writeFileSync(join(routeDir, 'index.html'), injectPage(templateHtml, metaTags, route.snapshot))
  }

  // ── 4. Dynamic routes — need Supabase ────────────────────────────────────
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase vars not set — static shells generated; dynamic routes skipped.')
    console.log('Prerender completado (sin Supabase)')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  let posts = [], jobs = [], nonJobOpps = [], contentHubOpps = []
  try {
    ;[{ data: posts }, { data: jobs }, { data: nonJobOpps }, { data: contentHubOpps }] = await Promise.all([
      supabase.from('content_hub')
        .select('slug,titulo,cuerpo,created_at,imagen_url,categoria')
        .eq('tipo', 'blog').eq('is_active', true),
      supabase.from('opportunities')
        .select('slug,title,organization,location,city,description,created_at,updated_at,type,opportunity_type')
        .eq('is_active', true).eq('verification_status', 'verified').eq('catalog_eligible', true)
        .in('opportunity_type', ['job', 'internship', 'consultancy'])
        .is('deleted_at', null).not('slug', 'is', null)
        .order('updated_at', { ascending: false }).limit(1000),
      supabase.from('opportunities')
        .select('slug,title,organization,location,city,description,opportunity_type,deadline,updated_at')
        .eq('is_active', true).eq('verification_status', 'verified').eq('catalog_eligible', true)
        .not('opportunity_type', 'in', '(job,internship,consultancy)')
        .is('deleted_at', null).not('slug', 'is', null)
        .limit(200),
      supabase.from('content_hub')
        .select('slug,titulo,cuerpo,categoria,ubicacion')
        .in('tipo', ['oportunidad', 'empleo', 'beca'])
        .eq('is_active', true).order('created_at', { ascending: false }).limit(100),
    ])
  } catch (err) {
    console.error('[prerender] Supabase fetch error:', err?.message)
  }

  posts = posts || []
  jobs = jobs || []
  nonJobOpps = nonJobOpps || []
  contentHubOpps = contentHubOpps || []

  // ── Blog index (overwrite shell with real list) ──────────────────────────
  {
    const blogLd = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog CVitae', url: `${SITE_URL}/blog`, description: 'Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay.', publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL } }
    const meta = `<title>Blog de Carrera | CVitae</title>
<meta name="description" content="Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay.">
<link rel="canonical" href="${SITE_URL}/blog">
<meta property="og:title" content="Blog de Carrera | CVitae">
<meta property="og:description" content="Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay.">
<meta property="og:url" content="${SITE_URL}/blog">
<script type="application/ld+json">${JSON.stringify(blogLd).replace(/</g, '\\u003c')}</script>`
    mkdirSync(join(distDir, 'blog'), { recursive: true })
    writeFileSync(join(distDir, 'blog', 'index.html'), injectPage(templateHtml, meta, blogIndexSnapshotContent(posts)))
  }

  // ── Blog posts ────────────────────────────────────────────────────────────
  let blogCount = 0
  const blogDir = join(distDir, 'blog')
  mkdirSync(blogDir, { recursive: true })
  for (const post of posts) {
    if (!post.slug || !isSafeRouteSegment(post.slug)) { console.warn('Skip blog slug:', post.slug); continue }
    const title = post.titulo || 'Blog'
    const excerpt = (post.cuerpo || '').replace(/[#*`>_~\[\]!]/g, '').replace(/\(https?:[^)]+\)/g, '').substring(0, 160)
    const datePublished = (post.created_at || '').split('T')[0] || ''
    const imageUrl = post.imagen_url || `${SITE_URL}/og-image.jpg`
    const canonical = `${SITE_URL}/blog/${post.slug}`
    const ld = {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: title, description: excerpt, url: canonical,
      datePublished, image: imageUrl,
      author: { '@type': 'Organization', name: 'CVitae', url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'CVitae', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` } },
    }
    const metaTags = `<title>${escapeHtml(title)} | CVitae</title>
<meta name="description" content="${escapeHtml(excerpt)}">
<meta property="og:title" content="${escapeHtml(title)} | CVitae">
<meta property="og:description" content="${escapeHtml(excerpt)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="${imageUrl}">
<link rel="canonical" href="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
    const postDir = join(blogDir, post.slug)
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
<script type="application/ld+json">${JSON.stringify(empLd).replace(/</g, '\\u003c')}</script>`
    mkdirSync(join(distDir, 'empleos'), { recursive: true })
    writeFileSync(join(distDir, 'empleos', 'index.html'), injectPage(templateHtml, meta, empleosIndexSnapshotContent(jobs)))
  }

  // ── Individual jobs ───────────────────────────────────────────────────────
  let jobCount = 0
  const jobsDir = join(distDir, 'empleos')
  for (const job of jobs) {
    if (!job.slug || !isSafeRouteSegment(job.slug)) { console.warn('Skip job slug:', job.slug); continue }
    const title = (job.title || '').trim()
    if (!title) continue
    const description = (job.description || '').trim()
    const descExcerpt = description.replace(/[#*`>]/g, '').substring(0, 160) || `${title} en ${job.location || 'Paraguay'}.`
    const canonical = `${SITE_URL}/empleos/${job.slug}`
    const realOrg = (job.organization || '').trim()
    const canEmitJobPosting = description.length >= 50 && realOrg.length > 0
    const ld = canEmitJobPosting ? {
      '@context': 'https://schema.org', '@type': 'JobPosting', title,
      description, datePosted: job.created_at,
      hiringOrganization: { '@type': 'Organization', name: realOrg },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.city || job.location || 'Paraguay', addressCountry: 'PY' } },
      employmentType: toGoogleEmploymentType(job.type), directApply: false, url: canonical,
    } : {
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: title, url: canonical, description: descExcerpt,
    }
    const metaTags = `<title>${escapeHtml(title)} | CVitae</title>
<meta name="description" content="${escapeHtml(descExcerpt)}">
<meta property="og:title" content="${escapeHtml(title)} | CVitae">
<meta property="og:description" content="${escapeHtml(descExcerpt)}">
<meta property="og:url" content="${canonical}">
<link rel="canonical" href="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
    const jobDir = join(jobsDir, job.slug)
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
<script type="application/ld+json">${JSON.stringify(oppLd).replace(/</g, '\\u003c')}</script>`
    mkdirSync(join(distDir, 'oportunidades'), { recursive: true })
    writeFileSync(join(distDir, 'oportunidades', 'index.html'), injectPage(templateHtml, meta, oportunidadesIndexSnapshotContent(nonJobOpps)))
  }

  // ── Non-job opportunities ─────────────────────────────────────────────────
  let oppCount = 0
  const oppsDir = join(distDir, 'oportunidades')
  const writtenOppSlugs = new Set()
  const SCHOLARSHIP_TYPES = new Set(['scholarship', 'fellowship', 'grant', 'research_funding'])

  for (const opp of nonJobOpps) {
    if (!opp.slug || !isSafeRouteSegment(opp.slug)) { console.warn('Skip opp slug:', opp.slug); continue }
    const title = (opp.title || '').trim()
    if (!title) continue
    const desc = (opp.description || `${title} en ${opp.location || 'Paraguay'}.`).replace(/[#*`>]/g, '').substring(0, 160)
    const canonical = `${SITE_URL}/oportunidades/${opp.slug}`
    const ldType = SCHOLARSHIP_TYPES.has(opp.opportunity_type) ? 'Scholarship' : 'LearningResource'
    const ld = {
      '@context': 'https://schema.org', '@type': ldType,
      name: title, description: desc, url: canonical,
      ...(opp.deadline ? { validThrough: opp.deadline } : {}),
      ...(opp.organization ? { provider: { '@type': 'Organization', name: opp.organization } } : {}),
    }
    const metaTags = `<title>${escapeHtml(title)} | CVitae</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:title" content="${escapeHtml(title)} | CVitae">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${canonical}">
<link rel="canonical" href="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
    const oppDir = join(oppsDir, opp.slug)
    mkdirSync(oppDir, { recursive: true })
    writeFileSync(join(oppDir, 'index.html'), injectPage(templateHtml, metaTags, opportunitySnapshotContent(opp)))
    writtenOppSlugs.add(opp.slug)
    oppCount++
  }

  // ── content_hub oportunidades (legacy, dedup) ─────────────────────────────
  for (const opp of contentHubOpps) {
    if (!opp.slug || !isSafeRouteSegment(opp.slug) || writtenOppSlugs.has(opp.slug)) continue
    const title = (opp.titulo || '').trim()
    if (!title) { console.warn('Skip content_hub opp without title:', opp.slug); continue }
    const excerpt = (opp.cuerpo || '').replace(/[#*`>]/g, '').substring(0, 160)
    const canonical = `${SITE_URL}/oportunidades/${opp.slug}`
    const metaTags = `<title>${escapeHtml(title)} | CVitae</title>
<meta name="description" content="${escapeHtml(excerpt || `${title} en ${opp.ubicacion || 'Paraguay'}.`)}">
<meta property="og:title" content="${escapeHtml(title)} | CVitae">
<meta property="og:url" content="${canonical}">
<link rel="canonical" href="${canonical}">`
    const snapshotOpp = { title, organization: null, location: opp.ubicacion, city: null, description: opp.cuerpo, deadline: null }
    const oppDir = join(oppsDir, opp.slug)
    mkdirSync(oppDir, { recursive: true })
    writeFileSync(join(oppDir, 'index.html'), injectPage(templateHtml, metaTags, opportunitySnapshotContent(snapshotOpp)))
    oppCount++
  }

  console.log(`Prerender completado — blog: ${blogCount}, empleos: ${jobCount}, oportunidades: ${oppCount}`)
}

prerender().catch(err => { console.error('[prerender] Fatal error:', err); process.exit(1) })
