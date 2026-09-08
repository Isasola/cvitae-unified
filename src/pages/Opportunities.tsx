import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { ArrowRight, CalendarDays, Clock, Filter, Globe, MapPin, Search, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { Eyebrow } from '@/components/cv/visuals'
import { supabase } from '@/lib/supabase'
import { AdSlot } from '@/components/cv/AdSlot'

type Category = 'Todas' | 'Becas' | 'Financiación' | 'Programas' | 'Experiencias'

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
}

const TYPE_LABELS: Record<string, string> = {
  scholarship: 'Beca', fellowship: 'Fellowship', grant: 'Grant',
  seed_capital: 'Capital semilla', accelerator: 'Aceleradora', incubator: 'Incubadora',
  startup_competition: 'Competencia', research_funding: 'Investigación',
  training: 'Formación', exchange_program: 'Intercambio',
  volunteering: 'Voluntariado', tender: 'Licitación',
}

const TYPE_ACCENT: Record<string, string> = {
  scholarship: '#c9a84c', fellowship: '#c9a84c',
  grant: '#60a5fa', seed_capital: '#60a5fa', research_funding: '#60a5fa',
  accelerator: '#a78bfa', incubator: '#a78bfa', startup_competition: '#a78bfa',
  exchange_program: '#34d399', volunteering: '#34d399', training: '#34d399',
}

const CATEGORY_TYPES: Record<Exclude<Category, 'Todas'>, string[]> = {
  Becas: ['scholarship', 'fellowship'],
  Financiación: ['grant', 'seed_capital', 'research_funding', 'tender'],
  Programas: ['accelerator', 'incubator', 'startup_competition', 'training'],
  Experiencias: ['exchange_program', 'volunteering'],
}

const kindToType = (kind: string | null) => ({
  empleo: 'job', pasantia: 'internship', beca: 'scholarship', voluntariado: 'volunteering',
  curso: 'training', intercambio: 'exchange_program', concurso: 'startup_competition',
  programa: 'grant', conferencia: 'training',
}[kind || ''] || '')

const clean = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline)
  if (days === null) return <span className="flex shrink-0 items-center gap-1 text-white/35">Ver detalle <ArrowRight className="h-3 w-3" /></span>
  if (days <= 7) return (
    <span className="flex shrink-0 items-center gap-1 text-red-400">
      <Zap className="h-3 w-3" />
      {days <= 0 ? 'Cierra hoy' : `${days}d restantes`}
    </span>
  )
  if (days <= 30) return (
    <span className="flex shrink-0 items-center gap-1 text-amber-400/80">
      <Clock className="h-3 w-3" />
      {days}d restantes
    </span>
  )
  return (
    <span className="flex shrink-0 items-center gap-1 text-white/40">
      <CalendarDays className="h-3 w-3" />
      Hasta {new Date(deadline).toLocaleDateString('es-PY', { day: 'numeric', month: 'short' })}
    </span>
  )
}

export default function Opportunities() {
  const [items, setItems] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [category, setCategory] = useState<Category>('Todas')
  const [query, setQuery] = useState('')

  useEffect(() => {
    supabase
      .from('opportunities')
      .select('id,slug,title,organization,location,opportunity_type,opportunity_kind,deadline,funding_type,fully_funded,source')
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .eq('catalog_eligible', true)
      .is('deleted_at', null)
      .is('archived_at', null)
      .or(`deadline.is.null,deadline.gte.${new Date().toISOString()}`)
      .order('deadline', { ascending: true, nullsFirst: false })
      .limit(250)
      .then(({ data, error: loadError }) => {
        if (loadError) setError('No pudimos cargar las oportunidades. Intentá nuevamente en unos minutos.')
        else setItems((data || []) as Opportunity[])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const needle = clean(query).toLocaleLowerCase('es')
    return items.filter(item => {
      const type = item.opportunity_type || kindToType(item.opportunity_kind)
      const categoryMatch = category === 'Todas'
        || CATEGORY_TYPES[category].includes(type)
        || (category === 'Programas' && item.opportunity_kind === 'programa')
      const text = `${item.title} ${item.organization || ''} ${item.location || ''} ${TYPE_LABELS[type] || type}`.toLocaleLowerCase('es')
      return categoryMatch && (!needle || text.includes(needle))
    })
  }, [category, items, query])

  const stats = useMemo(() => ({
    total: items.length,
    funded: items.filter(i => i.fully_funded).length,
    closingSoon: items.filter(i => { const d = daysUntil(i.deadline); return d !== null && d <= 14 }).length,
  }), [items])

  return (
    <>
      <Helmet>
        <title>Becas y oportunidades para Paraguay | CVitae</title>
        <meta name="description" content="Becas, grants, aceleradoras, intercambios y programas vigentes verificados para personas y emprendimientos de Paraguay." />
        <link rel="canonical" href="https://cvitae.lat/oportunidades" />
        <meta property="og:title" content="Becas y oportunidades para Paraguay | CVitae" />
        <meta property="og:description" content="Oportunidades verificadas con elegibilidad y fecha de cierre claras." />
        <meta property="og:url" content="https://cvitae.lat/oportunidades" />
      </Helmet>
      <SiteShell>
        <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">

          {/* Header */}
          <header className="max-w-3xl">
            <Eyebrow>Oportunidades verificadas</Eyebrow>
            <h1 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">
              Más que empleos:<br className="hidden sm:block" /> oportunidades para avanzar.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Becas, financiación y programas con convocatoria comprobable. Solo mostramos registros aprobados con elegibilidad y fecha de cierre claras.
            </p>
          </header>

          {/* Stats bar */}
          {!loading && items.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-px overflow-hidden border border-white/[0.07]">
              <div className="flex min-w-[120px] flex-1 flex-col bg-white/[0.02] px-5 py-3">
                <span className="text-2xl font-light tabular-nums text-cream">{stats.total}</span>
                <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/35">disponibles</span>
              </div>
              <div className="flex min-w-[120px] flex-1 flex-col bg-white/[0.02] px-5 py-3">
                <span className="text-2xl font-light tabular-nums text-[#c9a84c]">{stats.funded}</span>
                <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/35">financiación total</span>
              </div>
              <div className="flex min-w-[120px] flex-1 flex-col bg-white/[0.02] px-5 py-3">
                <span className={`text-2xl font-light tabular-nums ${stats.closingSoon > 0 ? 'text-amber-400' : 'text-cream'}`}>{stats.closingSoon}</span>
                <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/35">cierran en 14 días</span>
              </div>
              <div className="hidden flex-1 items-center gap-2 bg-white/[0.02] px-5 py-3 sm:flex">
                <ShieldCheck className="h-4 w-4 text-emerald-400/60" />
                <span className="text-[11px] text-white/40">Solo registros verificados</span>
              </div>
            </div>
          )}

          {/* Filters */}
          <section className="mt-6 border-y border-white/8 py-5" aria-label="Filtros de oportunidades">
            <label className="relative block max-w-2xl">
              <span className="sr-only">Buscar oportunidad u organización</span>
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Beca, programa, organización o país"
                className="h-12 w-full border border-white/10 bg-white/[0.025] pl-11 pr-4 text-sm text-cream outline-none placeholder:text-white/25 focus:border-[#c9a84c]/45 transition"
              />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Filter className="mr-1 h-4 w-4 text-white/25" />
              {(['Todas', 'Becas', 'Financiación', 'Programas', 'Experiencias'] as Category[]).map(option => (
                <button
                  key={option}
                  onClick={() => setCategory(option)}
                  className={`border px-3 py-1.5 text-xs transition ${
                    category === option
                      ? 'border-[#c9a84c]/55 bg-[#c9a84c]/10 text-[#dbc16f]'
                      : 'border-white/10 text-white/45 hover:border-white/20 hover:text-white/70'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </section>

          <div className="mt-4 flex items-center justify-between gap-4 text-xs text-white/35">
            <span>{loading ? 'Consultando fuentes…' : `${filtered.length} oportunidades`}</span>
            {!loading && query && (
              <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/60 transition">
                Limpiar búsqueda ×
              </button>
            )}
          </div>

          {/* Grid */}
          {error ? (
            <div className="mt-6 border border-red-400/20 bg-red-400/[0.04] p-6 text-sm text-red-200" role="alert">{error}</div>
          ) : loading ? (
            <div className="mt-4 grid gap-px overflow-hidden border border-white/8 bg-white/8 md:grid-cols-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="bg-[#0b0b0b] p-5">
                  <div className="mb-3 h-3 w-16 animate-pulse bg-white/10" />
                  <div className="mb-2 h-5 w-3/4 animate-pulse bg-white/10" />
                  <div className="h-4 w-1/2 animate-pulse bg-white/[0.06]" />
                  <div className="mt-8 h-px w-full bg-white/[0.05]" />
                  <div className="mt-3 flex justify-between">
                    <div className="h-3 w-24 animate-pulse bg-white/[0.06]" />
                    <div className="h-3 w-20 animate-pulse bg-white/[0.06]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-6 border border-white/8 px-6 py-14 text-center">
              <Globe className="mx-auto mb-4 h-8 w-8 text-white/15" />
              <p className="text-cream">{items.length === 0 ? 'Todavía no hay oportunidades publicadas en este catálogo.' : 'No hay oportunidades verificadas con estos filtros.'}</p>
              <p className="mt-2 text-sm text-white/40">Solo mostramos fichas activas, vigentes y verificadas.</p>
              <button onClick={() => { setQuery(''); setCategory('Todas') }} className="mt-4 text-sm text-[#c9a84c] hover:underline transition">
                Limpiar filtros
              </button>
            </div>
          ) : (
            <section className="mt-4 grid gap-px overflow-hidden border border-white/8 bg-white/8 md:grid-cols-2">
              {filtered.map(item => {
                const type = item.opportunity_type || kindToType(item.opportunity_kind)
                const accent = TYPE_ACCENT[type] || '#c9a84c'
                const days = daysUntil(item.deadline)
                const isUrgent = days !== null && days <= 7
                const isFullyFunded = item.fully_funded

                return (
                  <Link
                    key={item.id}
                    href={`/oportunidades/${item.slug || item.id}`}
                    className={`group relative flex min-h-[11rem] flex-col bg-[#0a0a0a] p-5 transition-all duration-200 hover:-translate-y-px hover:bg-[#0f0f0f] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a84c] ${isFullyFunded ? 'ring-1 ring-inset ring-[#c9a84c]/10' : ''}`}
                  >
                    {/* Accent left border */}
                    <div
                      className="absolute left-0 top-0 h-full w-[3px] opacity-60 transition group-hover:opacity-100"
                      style={{ backgroundColor: accent }}
                    />

                    {/* Top row: type + badges */}
                    <div className="flex items-start justify-between gap-3 pl-2">
                      <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: accent }}>
                        {TYPE_LABELS[type] || type.replaceAll('_', ' ')}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {isUrgent && (
                          <span className="flex items-center gap-1 border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-red-400">
                            <Zap className="h-2.5 w-2.5" />urgente
                          </span>
                        )}
                        {isFullyFunded && (
                          <span className="flex items-center gap-1 border border-[#c9a84c]/25 bg-[#c9a84c]/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#c9a84c]/80">
                            <Sparkles className="h-2.5 w-2.5" />financiada
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title + org */}
                    <h2 className="mt-2.5 pl-2 font-display text-lg leading-snug text-cream transition group-hover:text-white">
                      {clean(item.title)}
                    </h2>
                    <p className="mt-1 pl-2 text-sm text-white/50">
                      {clean(item.organization) || 'Organización internacional'}
                    </p>

                    {/* Footer */}
                    <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-white/[0.06] pl-2 pt-3.5 text-xs">
                      <span className="flex min-w-0 items-center gap-1 text-white/40">
                        <MapPin className="h-3 w-3 shrink-0 text-white/25" />
                        <span className="truncate">{clean(item.location) || 'Elegibilidad internacional'}</span>
                      </span>
                      <DeadlineBadge deadline={item.deadline} />
                    </div>
                  </Link>
                )
              })}
            </section>
          )}

          {/* Market nav */}
          <nav className="mt-10 border-t border-white/8 pt-8" aria-label="Mercados por región">
            <p className="mb-4 text-[10px] uppercase tracking-widest text-white/25">Explorar por mercado</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/oportunidades/paraguay" className="group flex items-center justify-between border border-white/8 bg-white/[0.02] px-5 py-4 transition hover:border-[#c9a84c]/30 hover:bg-white/[0.04]">
                <div>
                  <p className="text-sm font-medium text-cream group-hover:text-white">Paraguay</p>
                  <p className="mt-0.5 text-xs text-white/40">Empleos y fuentes locales verificadas</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:text-[#c9a84c]" />
              </Link>
              <Link href="/oportunidades/latam" className="group flex items-center justify-between border border-white/8 bg-white/[0.02] px-5 py-4 transition hover:border-[#c9a84c]/30 hover:bg-white/[0.04]">
                <div>
                  <p className="text-sm font-medium text-cream group-hover:text-white">América Latina</p>
                  <p className="mt-0.5 text-xs text-white/40">Becas y programas internacionales LATAM</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:text-[#c9a84c]" />
              </Link>
            </div>
          </nav>

          <AdSlot placement="opportunities-feed" />
        </main>
      </SiteShell>
    </>
  )
}
