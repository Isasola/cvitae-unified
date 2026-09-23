import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useParams } from 'wouter'
import { canonicalOpportunityPathForRow, canonicalOpportunityUrlForRow } from '@/lib/opportunity-truth'
import { aggregatedJobPosting } from '@/lib/factual-job-posting'
import { safeExternalUrl } from '@/lib/safe-url'
import { ArrowLeft, Briefcase, Building2, CalendarDays, ExternalLink, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { loadPublicOpportunities } from '@/lib/public-source-policy'
import { analytics } from '@/lib/analytics'

interface Job {
  id: string
  slug: string
  title: string
  organization: string | null
  location: string | null
  city: string | null
  department: string | null
  country_code: string | null
  type: string | null
  opportunity_type: string | null
  opportunity_kind?: string | null
  deadline: string | null
  rubro: string | null
  description: string | null
  application_url: string
  source: string | null
  source_url: string | null
  created_at: string
  updated_at: string
  distribution?: { seo?: { allowed: boolean }; jobPosting?: { allowed: boolean }; googleJobs?: { allowed: boolean }; sourceAttributionRequired?: boolean }
}

const clean = (value: string | null | undefined) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

export default function JobDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [, setLocation] = useLocation()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    void loadPublicOpportunities<Job>('all', slug).then(data => {
      const loaded = data as Job | null
      if (loaded && canonicalOpportunityPathForRow(loaded) !== `/empleos/${loaded.slug}`) { setLocation(canonicalOpportunityPathForRow(loaded), { replace: true }); return }
      setJob(loaded); if (loaded) analytics.opportunityViewed(loaded.id, loaded.source || 'unknown')
    }).finally(() => setLoading(false))
  }, [slug])

  if (loading) return <SiteShell><main className="mx-auto min-h-[60vh] max-w-4xl px-6 py-20 text-sm text-white/40">Cargando empleo…</main></SiteShell>
  if (!job) return <><Helmet><meta name="robots" content="noindex,follow" /></Helmet><SiteShell><main className="mx-auto min-h-[60vh] max-w-4xl px-6 py-20"><p className="text-cream">Este empleo ya no está activo o no existe.</p><Link href="/empleos" className="mt-4 inline-block text-sm text-[#c9a84c]">Volver a empleos</Link></main></SiteShell></>

  const title = `${clean(job.title)} | CVitae`
  const description = clean(job.description) || clean(job.title)
  const canonical = canonicalOpportunityUrlForRow(job)

  const factual = aggregatedJobPosting(job, canonical)
  const structuredData = factual.structuredData ?? {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: clean(job.title),
    url: canonical,
    description,
  }

  const apply = () => {
    analytics.applyClicked(job.id, job.source || 'unknown')
    window.open(safeExternalUrl(job.application_url), '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <Helmet>
        {job.distribution?.seo?.allowed !== true && <meta name="robots" content="noindex,follow" />}
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content="https://cvitae.lat/og-image.jpg" />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>
      <SiteShell>
        <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <Link href="/empleos" className="inline-flex items-center gap-2 text-sm text-white/40 transition hover:text-cream"><ArrowLeft className="h-4 w-4" />Volver a empleos</Link>
          <article className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">{clean(job.rubro) || 'Empleo'}</p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight text-cream sm:text-5xl">{clean(job.title)}</h1>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/45">
                <span className="flex items-center gap-2"><Building2 className="h-4 w-4" />{clean(job.organization) || 'Empresa no informada'}</span>
                <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{clean(job.location) || 'Ubicaci\u00f3n no informada'}</span>
                <span className="flex items-center gap-2"><Briefcase className="h-4 w-4" />{clean(job.type) || 'Empleo'}</span>
              </div>
              <section className="mt-9 border-t border-white/8 pt-7">
                <h2 className="font-display text-2xl text-cream">Descripción</h2>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/55">{clean(job.description) || 'La fuente original no proporcionó una descripción completa. Revisá los requisitos antes de postularte.'}</p>
              </section>
            </div>
            <aside className="h-fit border border-white/8 bg-white/[0.018] p-5 lg:sticky lg:top-24">
              <Link href={`/mi-carrera/postular/${job.slug}`} className="flex w-full items-center justify-center gap-2 bg-[#c9a84c] px-4 py-3 text-sm font-semibold text-[#090909] transition hover:bg-[#dfc36e]">Preparar mi postulación <Sparkles className="h-4 w-4" /></Link>
              <button onClick={apply} className="mt-2 flex w-full items-center justify-center gap-2 border border-white/10 px-4 py-2.5 text-xs text-white/55 transition hover:border-white/25 hover:text-cream">Ir directamente a la fuente <ExternalLink className="h-3.5 w-3.5" /></button>
              <p className="mt-3 text-[11px] leading-relaxed text-white/35">Adaptá tu CV con evidencias confirmadas y prepará el mensaje antes de abrir el formulario externo.</p>
              <div className="mt-5 space-y-3 border-t border-white/8 pt-4 text-xs leading-relaxed text-white/35">
                <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />CVitae organiza la vacante; verificá condiciones y datos con la fuente original.</p>
                {job.deadline && <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Cierra {new Date(job.deadline).toLocaleDateString('es-PY')}</p>}
                <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Revisada {new Date(job.updated_at).toLocaleDateString('es-PY')}</p>
                {job.distribution?.sourceAttributionRequired && job.source_url ? <p>Fuente original: <a href={safeExternalUrl(job.source_url)} target="_blank" rel="noopener noreferrer" className="text-[#c9a84c] hover:underline">Ver fuente</a></p> : <p>Fuente: {clean(job.source) || 'No informada'}</p>}
              </div>
            </aside>
          </article>
        </main>
      </SiteShell>
    </>
  )
}
