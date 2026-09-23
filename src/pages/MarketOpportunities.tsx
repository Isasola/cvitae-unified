import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'wouter'
import { ArrowRight, CalendarDays, Filter, MapPin, Search, ShieldCheck } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { Eyebrow } from '@/components/cv/visuals'
import { loadPublicOpportunities } from '@/lib/public-source-policy'
import { AdSlot } from '@/components/cv/AdSlot'
import { canonicalOpportunityPathForRow } from '@/lib/opportunity-truth'

type MarketKey = 'paraguay' | 'peru' | 'remoto-latam' | 'latam'

interface Opportunity {
  id: string
  slug: string | null
  title: string
  organization: string | null
  location: string | null
  opportunity_type: string | null
  opportunity_kind: string | null
  deadline: string | null
  funding_type: string | null
  fully_funded: boolean | null
  source: string | null
  remote_scope: string | null
  country_code: string | null
  onsite_country: string | null
}

const MARKET_META: Record<MarketKey, {
  eyebrow: string
  title: string
  h1: string
  description: string
  canonical: string
  index: boolean
}> = {
  paraguay: {
    eyebrow: 'Oportunidades Paraguay',
    title: 'Empleos y oportunidades en Paraguay | CVitae',
    h1: 'Oportunidades verificadas para Paraguay.',
    description: 'Empleos, becas, programas y financiación verificados y disponibles para personas en Paraguay. Fuentes oficiales y bolsas de empleo locales.',
    canonical: 'https://cvitae.lat/oportunidades/paraguay',
    index: true,
  },
  peru: {
    eyebrow: 'Oportunidades Perú',
    title: 'Empleos y oportunidades en Perú | CVitae',
    h1: 'Oportunidades verificadas para Perú.',
    description: 'Empleos, becas y programas verificados disponibles para personas en Perú y América Latina.',
    canonical: 'https://cvitae.lat/oportunidades/peru',
    index: false,
  },
  'remoto-latam': {
    eyebrow: 'Empleos Remotos LATAM',
    title: 'Empleos remotos para América Latina | CVitae',
    h1: 'Empleos remotos para LATAM.',
    description: 'Empleos 100% remotos en tecnología, diseño, marketing y más, abiertos a candidatos de América Latina. Fuentes verificadas con visibilidad global.',
    canonical: 'https://cvitae.lat/oportunidades/remoto-latam',
    index: false,
  },
  latam: {
    eyebrow: 'Becas y Programas LATAM',
    title: 'Becas y programas para América Latina | CVitae',
    h1: 'Becas y programas para LATAM.',
    description: 'Becas internacionales, fellowships, intercambios y programas de financiación verificados para candidatos de América Latina.',
    canonical: 'https://cvitae.lat/oportunidades/latam',
    index: true,
  },
}

const TYPE_LABELS: Record<string, string> = {
  scholarship: 'Beca', fellowship: 'Fellowship', grant: 'Grant',
  seed_capital: 'Capital semilla', accelerator: 'Aceleradora', incubator: 'Incubadora',
  startup_competition: 'Competencia', research_funding: 'Investigación',
  training: 'Formación', exchange_program: 'Intercambio',
  volunteering: 'Voluntariado', tender: 'Licitación', job: 'Empleo',
}

const kindToType = (kind: string | null) => ({
  empleo: 'job', pasantia: 'internship', beca: 'scholarship', voluntariado: 'volunteering',
  curso: 'training', intercambio: 'exchange_program', concurso: 'startup_competition',
  programa: 'grant', conferencia: 'training',
}[kind || ''] || '')

const clean = (v: unknown) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const VALID_MARKETS: MarketKey[] = ['paraguay', 'peru', 'remoto-latam', 'latam']

export default function MarketOpportunities() {
  const params = useParams<{ market: string }>()
  const market = (params.market || '').toLowerCase() as MarketKey

  const [items, setItems] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const isValid = VALID_MARKETS.includes(market)
  const meta = MARKET_META[market] ?? MARKET_META['paraguay']

  useEffect(() => {
    if (!isValid) { setLoading(false); return }
    void loadPublicOpportunities<Opportunity[]>('all')
      .then(data => setItems((data || []) as Opportunity[]))
      .catch(() => setError('Public source policy unavailable.'))
      .finally(() => setLoading(false))
  }, [market, isValid])

  const filtered = useMemo(() => {
    const needle = clean(query).toLocaleLowerCase('es')
    return items.filter(item => {
      const text = `${item.title} ${item.organization || ''} ${item.location || ''}`.toLocaleLowerCase('es')
      return !needle || text.includes(needle)
    })
  }, [items, query])

  if (!isValid) {
    return (
      <SiteShell>
        <main className="mx-auto max-w-6xl px-6 py-24 text-center">
          <p className="text-cream">Mercado no encontrado.</p>
          <Link href="/oportunidades" className="mt-4 inline-block text-sm text-[#c9a84c] underline">Ver todas las oportunidades</Link>
        </main>
      </SiteShell>
    )
  }

  return (
    <>
      <Helmet>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <link rel="canonical" href={meta.canonical} />
        {!meta.index && <meta name="robots" content="noindex,follow" />}
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:url" content={meta.canonical} />
      </Helmet>
      <SiteShell>
        <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <header className="max-w-3xl">
            <Eyebrow>{meta.eyebrow}</Eyebrow>
            <h1 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">{meta.h1}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{meta.description}</p>
          </header>

          <div className="mt-8 flex gap-3 text-xs text-white/40">
            <Link href="/oportunidades" className="hover:text-white/70">← Todos los mercados</Link>
          </div>

          <section className="mt-6 border-y border-white/8 py-5" aria-label="Buscar oportunidades">
            <label className="relative block max-w-2xl">
              <span className="sr-only">Buscar oportunidad u organización</span>
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Beca, empresa, programa…" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.025] pl-11 pr-4 text-sm text-cream outline-none placeholder:text-white/25 focus:border-[#c9a84c]/45" />
            </label>
          </section>

          <div className="mt-6 flex items-center justify-between gap-4 text-xs text-white/45">
            <span>{loading ? 'Consultando fuentes…' : `${filtered.length} oportunidades`}</span>
            <span className="hidden items-center gap-1.5 sm:flex"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />Solo registros verificados</span>
          </div>

          {error ? (
            <div className="mt-6 border border-red-400/20 bg-red-400/[0.04] p-6 text-sm text-red-200" role="alert">{error}</div>
          ) : loading ? (
            <div className="mt-6 grid gap-px overflow-hidden border border-white/8 bg-white/8 md:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-48 animate-pulse bg-[#0b0b0b]" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="mt-6 border border-white/8 px-6 py-14 text-center">
              <p className="text-cream">{items.length === 0 ? 'Todavía no hay oportunidades publicadas para este mercado.' : 'Sin resultados para esta búsqueda.'}</p>
              <p className="mt-2 text-sm text-white/40">Las oportunidades en revisión se publican cuando son verificadas.</p>
              <Link href="/oportunidades" className="mt-4 inline-block text-sm text-[#c9a84c] underline">Ver catálogo completo</Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-px overflow-hidden border border-white/8 bg-white/8 md:grid-cols-2">
              {filtered.map(item => {
                const type = item.opportunity_type || kindToType(item.opportunity_kind)
                const typeLabel = TYPE_LABELS[type] || ''
                const href = canonicalOpportunityPathForRow({ ...item, slug: item.slug || item.id })
                return (
                  <Link key={item.id} href={href} className="group flex flex-col justify-between bg-[#0b0b0b] p-6 transition-colors hover:bg-[#111111]">
                    <div>
                      {(typeLabel || item.fully_funded) && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {typeLabel && <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-white/50">{typeLabel}</span>}
                          {item.fully_funded && <span className="rounded-full border border-emerald-400/25 bg-emerald-400/[0.06] px-2.5 py-0.5 text-xs text-emerald-300/80">Beca completa</span>}
                        </div>
                      )}
                      <h2 className="text-sm font-medium leading-snug text-cream group-hover:text-white">{item.title}</h2>
                      {item.organization && <p className="mt-1 text-xs text-white/40">{item.organization}</p>}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/35">
                      {item.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>}
                      {item.deadline && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />Cierra: {item.deadline.slice(0, 10)}</span>}
                      <span className="ml-auto flex items-center gap-1 text-[#c9a84c]/70 group-hover:text-[#c9a84c]">Ver <ArrowRight className="h-3 w-3" /></span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          <div className="mt-8">
            <AdSlot placement="opportunities-feed" />
          </div>
        </main>
      </SiteShell>
    </>
  )
}
