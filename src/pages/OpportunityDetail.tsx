import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'wouter'
import { toGoogleEmploymentType } from '@/lib/seo/employment-type'
import { safeExternalUrl } from '@/lib/safe-url'
import { ArrowLeft, Building2, CalendarDays, ExternalLink, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { supabase } from '@/lib/supabase'
import { analytics } from '@/lib/analytics'

interface Opportunity {
  id: string
  slug: string
  title: string
  organization: string | null
  location: string | null
  type: string | null
  description: string | null
  opportunity_type: string | null
  application_url: string
  source: string | null
  deadline: string | null
  funding_type: string | null
  funding_amount: number | null
  currency: string | null
  fully_funded: boolean | null
  eligible_countries: string[] | null
  eligible_regions: string[] | null
  education_level: string | null
  updated_at: string
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
  const [item, setItem] = useState<Opportunity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    supabase
      .from('opportunities')
      .select('id,slug,title,organization,location,type,description,opportunity_type,application_url,source,deadline,funding_type,funding_amount,currency,fully_funded,eligible_countries,eligible_regions,education_level,updated_at')
      .eq('slug', slug)
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .eq('catalog_eligible', true)
      .is('deleted_at', null)
      .is('archived_at', null)
      .or(`deadline.is.null,deadline.gte.${new Date().toISOString()}`)
      .maybeSingle()
      .then(({ data }) => {
        const loaded = data as Opportunity | null
        setItem(loaded)
        if (loaded) analytics.opportunityViewed(loaded.id, loaded.source || 'unknown')
        setLoading(false)
      })
  }, [slug])

  if (loading) return <SiteShell><main className="mx-auto min-h-[60vh] max-w-5xl px-6 py-20 text-sm text-white/40">Cargando oportunidad…</main></SiteShell>
  if (!item) return <SiteShell><main className="mx-auto min-h-[60vh] max-w-5xl px-6 py-20"><p className="text-cream">Esta oportunidad ya no está activa o no existe.</p><Link href="/oportunidades" className="mt-4 inline-block text-sm text-[#c9a84c]">Volver a oportunidades</Link></main></SiteShell>

  const type = LABELS[item.opportunity_type || ''] || clean(item.opportunity_type).replaceAll('_', ' ') || 'Oportunidad'
  const eligibility = [...(item.eligible_countries || []), ...(item.eligible_regions || [])].join(', ')
  const title = `${clean(item.title)} | CVitae`
  const description = `${type} de ${clean(item.organization) || 'una organización verificada'}. Revisá elegibilidad, fecha y postulación en CVitae.`
  const funding = item.funding_amount ? `${item.currency || ''} ${Number(item.funding_amount).toLocaleString('es-PY')}`.trim() : clean(item.funding_type)
  const SCHOLARSHIP_TYPES = ['scholarship', 'fellowship', 'grant', 'research_funding']
  const JOB_TYPES = ['job', 'internship', 'consultancy', 'empleo']
  const isJobPosting = !SCHOLARSHIP_TYPES.includes(item.opportunity_type || '')
  // For JobPosting use canonical /empleos/ if it's a job type, otherwise /oportunidades/
  const isJobType = JOB_TYPES.includes(item.opportunity_type || '')
  const canonicalUrl = isJobType
    ? `https://cvitae.lat/empleos/${item.slug}`
    : `https://cvitae.lat/oportunidades/${item.slug}`
  const realDescription = clean(item.description)
  const realOrg = clean(item.organization)
  // JobPosting requires real description + real org — never emit with synthetic fallbacks
  const canEmitJobPosting = isJobPosting && realDescription.length >= 100 && realOrg.length > 0

  let structuredData: Record<string, unknown>
  if (canEmitJobPosting) {
    const googleEmploymentType = toGoogleEmploymentType(item.type)
    structuredData = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: clean(item.title),
      description: realDescription,
      url: canonicalUrl,
      datePosted: item.updated_at,
      validThrough: item.deadline || undefined,
      hiringOrganization: { '@type': 'Organization', name: realOrg },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: clean(item.location) || eligibility || 'Paraguay', addressCountry: 'PY' } },
      directApply: false,
      ...(googleEmploymentType ? { employmentType: googleEmploymentType } : {}),
    }
  } else if (!isJobPosting) {
    structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Scholarship',
      name: clean(item.title),
      description: realDescription || description,
      url: canonicalUrl,
      validThrough: item.deadline || undefined,
      provider: { '@type': 'Organization', name: realOrg || 'Organización verificada' },
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
                <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{clean(item.location) || eligibility || 'Consultar elegibilidad'}</span>
                {item.deadline && <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Cierra {new Date(item.deadline).toLocaleDateString('es-PY')}</span>}
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
                <p>Fuente: {clean(item.source) || 'No informada'}</p>
              </div>
            </aside>
          </article>
        </main>
      </SiteShell>
    </>
  )
}
