import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'wouter'
import { ArrowLeft, Briefcase, Building2, CalendarDays, ExternalLink, MapPin, ShieldCheck } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { supabase } from '@/lib/supabase'
import { analytics } from '@/lib/analytics'

interface Job {
  id: string
  slug: string
  title: string
  organization: string | null
  location: string | null
  type: string | null
  rubro: string | null
  description: string | null
  application_url: string
  source: string | null
  created_at: string
  updated_at: string
}

const clean = (value: string | null | undefined) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

export default function JobDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    supabase
      .from('opportunities')
      .select('id,slug,title,organization,location,type,rubro,description,application_url,source,created_at,updated_at')
      .eq('slug', slug)
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .eq('catalog_eligible', true)
      .in('opportunity_type', ['job', 'internship', 'consultancy'])
      .is('deleted_at', null)
      .is('archived_at', null)
      .maybeSingle()
      .then(({ data }) => {
        const loaded = data as Job | null
        setJob(loaded)
        if (loaded) analytics.opportunityViewed(loaded.id, loaded.source || 'unknown')
        setLoading(false)
      })
  }, [slug])

  if (loading) return <SiteShell><main className="mx-auto min-h-[60vh] max-w-4xl px-6 py-20 text-sm text-white/40">Cargando empleo…</main></SiteShell>
  if (!job) return <SiteShell><main className="mx-auto min-h-[60vh] max-w-4xl px-6 py-20"><p className="text-cream">Este empleo ya no está activo o no existe.</p><Link href="/empleos" className="mt-4 inline-block text-sm text-[#c9a84c]">Volver a empleos</Link></main></SiteShell>

  const title = `${clean(job.title)} | CVitae`
  const description = `${clean(job.title)} en ${clean(job.organization) || 'Paraguay'}. Consultá los detalles y postulá desde la fuente original.`
  const canonical = `https://cvitae.lat/empleos/${job.slug}`
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: clean(job.title),
    description: clean(job.description) || description,
    datePosted: job.created_at,
    employmentType: clean(job.type) || undefined,
    hiringOrganization: { '@type': 'Organization', name: clean(job.organization) || 'Empresa no informada' },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: clean(job.location) || 'Paraguay', addressCountry: 'PY' } },
    directApply: false,
    url: canonical,
  }

  const apply = () => {
    analytics.applyClicked(job.id, job.source || 'unknown')
    window.open(job.application_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
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
                <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{clean(job.location) || 'Paraguay'}</span>
                <span className="flex items-center gap-2"><Briefcase className="h-4 w-4" />{clean(job.type) || 'Empleo'}</span>
              </div>
              <section className="mt-9 border-t border-white/8 pt-7">
                <h2 className="font-display text-2xl text-cream">Descripción</h2>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/55">{clean(job.description) || 'La fuente original no proporcionó una descripción completa. Revisá los requisitos antes de postularte.'}</p>
              </section>
            </div>
            <aside className="h-fit border border-white/8 bg-white/[0.018] p-5 lg:sticky lg:top-24">
              <button onClick={apply} className="flex w-full items-center justify-center gap-2 bg-[#c9a84c] px-4 py-3 text-sm font-semibold text-[#090909] transition hover:bg-[#dfc36e]">Postular en la fuente <ExternalLink className="h-4 w-4" /></button>
              <div className="mt-5 space-y-3 border-t border-white/8 pt-4 text-xs leading-relaxed text-white/35">
                <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />CVitae organiza la vacante; verificá condiciones y datos con la fuente original.</p>
                <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Revisada {new Date(job.updated_at).toLocaleDateString('es-PY')}</p>
                <p>Fuente: {clean(job.source) || 'No informada'}</p>
              </div>
            </aside>
          </article>
        </main>
      </SiteShell>
    </>
  )
}
