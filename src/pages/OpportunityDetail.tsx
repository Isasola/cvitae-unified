import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useParams } from 'wouter'
import { canonicalOpportunityPathForRow, canonicalOpportunityUrlForRow, deadlineLifecycle, publicOpportunitySchemaType } from '@/lib/opportunity-truth'
import { aggregatedJobPosting } from '@/lib/factual-job-posting'
import { safeExternalUrl } from '@/lib/safe-url'
import { ArrowLeft, Building2, CalendarDays, ExternalLink, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { loadPublicOpportunities } from '@/lib/public-source-policy'
import { analytics } from '@/lib/analytics'

interface Opportunity {
  id: string
  slug: string
  title: string
  organization: string | null
  location: string | null
  city: string | null
  department: string | null
  country_code: string | null
  type: string | null
  description: string | null
  opportunity_type: string | null
  opportunity_kind?: string | null
  application_url: string
  source: string | null
  source_url?: string | null
  deadline: string | null
  funding_type: string | null
  funding_amount: number | null
  currency: string | null
  fully_funded: boolean | null
  eligible_countries: string[] | null
  eligible_regions: string[] | null
  education_level: string | null
  updated_at: string
  distribution?: { seo?: { allowed: boolean }; jobPosting?: { allowed: boolean }; googleJobs?: { allowed: boolean }; sourceAttributionRequired?: boolean }
}

const LABELS: Record<string, string> = {
  scholarship: 'Beca', fellowship: 'Fellowship', grant: 'Grant', seed_capital: 'Capital semilla',
  accelerator: 'Aceleradora', incubator: 'Incubadora', startup_competition: 'Competencia',
  research_funding: 'Financiación de investigación', training: 'Formación',
  exchange_program: 'Intercambio', volunteering: 'Voluntariado', tender: 'Licitación',
}
const clean = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

export default function OpportunityDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [, setLocation] = useLocation()
  const [item, setItem] = useState<Opportunity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    void loadPublicOpportunities<Opportunity>('all', slug).then(data => {
      const loaded = data as Opportunity | null
      if (loaded && canonicalOpportunityPathForRow(loaded) !== `/oportunidades/${loaded.slug}`) { setLocation(canonicalOpportunityPathForRow(loaded), { replace: true }); return }
      setItem(loaded); if (loaded) analytics.opportunityViewed(loaded.id, loaded.source || 'unknown')
    }).finally(() => setLoading(false))
  }, [slug])

  if (loading) return <SiteShell><main className="mx-auto min-h-[60vh] max-w-5xl px-6 py-20 text-sm text-white/40">Cargando oportunidad…</main></SiteShell>
  if (!item) return <><Helmet><meta name="robots" content="noindex,follow" /></Helmet><SiteShell><main className="mx-auto min-h-[60vh] max-w-5xl px-6 py-20"><p className="text-cream">Esta oportunidad ya no está activa o no existe.</p><Link href="/oportunidades" className="mt-4 inline-block text-sm text-[#c9a84c]">Volver a oportunidades</Link></main></SiteShell></>

  const type = LABELS[item.opportunity_type || ''] || clean(item.opportunity_type).replaceAll('_', ' ') || 'Oportunidad'
  const eligibility = [...(item.eligible_countries || []), ...(item.eligible_regions || [])].join(', ')
  const title = `${clean(item.title)} | CVitae`
  const description = clean(item.description) || clean(item.title)
  const funding = item.funding_amount ? `${item.currency || ''} ${Number(item.funding_amount).toLocaleString('es-PY')}`.trim() : clean(item.funding_type)
  const canonicalUrl = canonicalOpportunityUrlForRow(item)
  const realDescription = clean(item.description)
  const realOrg = clean(item.organization)
  const deadlineState = deadlineLifecycle(item.deadline)
  const factual = aggregatedJobPosting(item, canonicalUrl)
  const canEmitJobPosting = factual.state === 'READY'
  const schemaType = publicOpportunitySchemaType(item, canEmitJobPosting)

  let structuredData: Record<string, unknown>
  if (schemaType === 'JobPosting' && factual.structuredData) {
    structuredData = factual.structuredData
  } else if (schemaType === 'Scholarship') {
    structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Scholarship',
      name: clean(item.title),
      description: realDescription || description,
      url: canonicalUrl,
      ...(deadlineState === 'OPEN' ? { validThrough: item.deadline } : {}),
      ...(realOrg ? { provider: { '@type': 'Organization', name: realOrg } } : {}),
    }
  } else {
    // Job type but missing required fields — fall back to WebPage
    structuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: clean(item.title),
      url: canonicalUrl,
      description,
    }
  }

  const apply = () => {
    analytics.applyClicked(item.id, item.source || 'unknown')
    window.open(safeExternalUrl(item.application_url), '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <Helmet>
        {item.distribution?.seo?.allowed !== true && <meta name="robots" content="noindex,follow" />}
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content="https://cvitae.lat/og-image.jpg" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>
      <SiteShell>
        <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <Link href="/oportunidades" className="inline-flex items-center gap-2 text-sm text-white/40 transition hover:text-cream"><ArrowLeft className="h-4 w-4" />Volver a oportunidades</Link>
          <article className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">{type}</p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight text-cream sm:text-5xl">{clean(item.title)}</h1>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/45">
                <span className="flex items-center gap-2"><Building2 className="h-4 w-4" />{clean(item.organization) || 'Organización no informada'}</span>
                <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{clean(item.location) || 'Ubicaci\u00f3n no informada'}</span>
                {deadlineState === 'OPEN' && <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Cierra {new Date(item.deadline).toLocaleDateString('es-PY')}</span>}
              </div>

              {(funding || eligibility || item.education_level) && (
                <dl className="mt-8 grid gap-px overflow-hidden border border-white/8 bg-white/8 sm:grid-cols-3">
                  <div className="bg-[#0a0a0a] p-4"><dt className="text-[10px] uppercase tracking-wider text-white/30">Financiación</dt><dd className="mt-2 text-sm text-cream">{item.fully_funded ? 'Financiación total' : funding || 'No informada'}</dd></div>
                  <div className="bg-[#0a0a0a] p-4"><dt className="text-[10px] uppercase tracking-wider text-white/30">Elegibilidad</dt><dd className="mt-2 text-sm text-cream">{eligibility || 'Revisar bases'}</dd></div>
                  <div className="bg-[#0a0a0a] p-4"><dt className="text-[10px] uppercase tracking-wider text-white/30">Nivel</dt><dd className="mt-2 text-sm text-cream">{clean(item.education_level) || 'No especificado'}</dd></div>
                </dl>
              )}

              <section className="mt-9 border-t border-white/8 pt-7">
                <h2 className="font-display text-2xl text-cream">Información de la convocatoria</h2>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/55">{clean(item.description) || 'La fuente no proporcionó una descripción completa. Revisá las bases antes de postular.'}</p>
              </section>
            </div>

            <aside className="h-fit border border-white/8 bg-white/[0.018] p-5 lg:sticky lg:top-24">
              <Link href={`/mi-carrera/postular/${item.slug}`} className="flex w-full items-center justify-center gap-2 bg-[#c9a84c] px-4 py-3 text-sm font-semibold text-[#090909] transition hover:bg-[#dfc36e]">Preparar mi postulación <Sparkles className="h-4 w-4" /></Link>
              <button onClick={apply} className="mt-2 flex w-full items-center justify-center gap-2 border border-white/10 px-4 py-2.5 text-xs text-white/55 transition hover:border-white/25 hover:text-cream">Ir directamente al sitio <ExternalLink className="h-3.5 w-3.5" /></button>
              <p className="mt-3 text-[11px] leading-relaxed text-white/35">Podés adaptar tu CV con evidencias reales, preparar el mensaje y revisar brechas antes de abrir el formulario oficial.</p>
              <div className="mt-5 space-y-3 border-t border-white/8 pt-4 text-xs leading-relaxed text-white/35">
                <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />Esta ficha pasó por revisión, pero las bases de la organización son siempre la referencia final.</p>
                <p>Revisada {new Date(item.updated_at).toLocaleDateString('es-PY')}</p>
                {item.distribution?.sourceAttributionRequired && item.source_url ? <p>Fuente original: <a href={safeExternalUrl(item.source_url)} target="_blank" rel="noopener noreferrer" className="text-[#c9a84c] hover:underline">Ver fuente</a></p> : <p>Fuente: {clean(item.source) || 'No informada'}</p>}
              </div>
            </aside>
          </article>
        </main>
      </SiteShell>
    </>
  )
}
