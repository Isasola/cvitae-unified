import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { ArrowRight, CalendarDays, Filter, MapPin, Search, ShieldCheck } from 'lucide-react'
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
          <header className="max-w-3xl">
            <Eyebrow>Oportunidades verificadas</Eyebrow>
            <h1 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">Más que empleos: oportunidades para avanzar.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">Becas, financiación y programas con una convocatoria comprobable. Mostramos únicamente oportunidades aprobadas y aclaramos quién puede postular.</p>
          </header>

          <section className="mt-9 border-y border-white/8 py-5" aria-label="Filtros de oportunidades">
            <label className="relative block max-w-2xl">
              <span className="sr-only">Buscar oportunidad u organización</span>
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Beca, programa, organización o país" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.025] pl-11 pr-4 text-sm text-cream outline-none placeholder:text-white/25 focus:border-[#c9a84c]/45" />
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Filter className="mr-1 h-4 w-4 text-white/25" />
              {(['Todas', 'Becas', 'Financiación', 'Programas', 'Experiencias'] as Category[]).map(option => (
                <button key={option} onClick={() => setCategory(option)} className={`rounded-full border px-3 py-1.5 text-xs transition ${category === option ? 'border-[#c9a84c]/55 bg-[#c9a84c]/10 text-[#dbc16f]' : 'border-white/10 text-white/45 hover:border-white/20 hover:text-white/70'}`}>{option}</button>
              ))}
            </div>
          </section>

          <div className="mt-6 flex items-center justify-between gap-4 text-xs text-white/45">
            <span>{loading ? 'Consultando fuentes…' : `${filtered.length} oportunidades visibles`}</span>
            <span className="hidden items-center gap-1.5 sm:flex"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />Solo registros verificados</span>
          </div>

          {error ? (
            <div className="mt-6 border border-red-400/20 bg-red-400/[0.04] p-6 text-sm text-red-200" role="alert">{error}</div>
          ) : loading ? (
            <div className="mt-6 grid gap-px overflow-hidden border border-white/8 bg-white/8 md:grid-cols-2">{[0, 1, 2, 3].map(item => <div key={item} className="h-48 animate-pulse bg-[#0b0b0b]" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="mt-6 border border-white/8 px-6 py-14 text-center">
              <p className="text-cream">{items.length === 0 ? 'Todavía no hay oportunidades publicadas en este catálogo.' : 'No hay oportunidades verificadas con estos filtros.'}</p>
              <p className="mt-2 text-sm text-white/40">Sólo mostramos fichas activas, vigentes y verificadas. Las fuentes en revisión no aparecen hasta confirmar el enlace, la elegibilidad y la fecha de cierre.</p>
              <button onClick={() => { setQuery(''); setCategory('Todas') }} className="mt-4 text-sm text-[#c9a84c] hover:underline">Limpiar filtros</button>
            </div>
          ) : (
            <section className="mt-6 grid gap-px overflow-hidden border border-white/8 bg-white/8 md:grid-cols-2">
              {filtered.map(item => {
                const type = item.opportunity_type || ''
                return (
                  <Link key={item.id} href={`/oportunidades/${item.slug || item.id}`} className="group flex min-h-48 flex-col bg-[#0a0a0a] p-5 transition hover:bg-[#0e0e0e] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a84c]">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[10px] uppercase tracking-[0.16em] text-[#c9a84c]">{TYPE_LABELS[type] || type.replaceAll('_', ' ')}</span>
                      {item.fully_funded && <span className="border border-emerald-400/20 px-2 py-1 text-[9px] uppercase tracking-wider text-emerald-300/70">Financiación total</span>}
                    </div>
                    <h2 className="mt-3 font-display text-xl leading-snug text-cream transition group-hover:text-white">{clean(item.title)}</h2>
                    <p className="mt-1 text-sm text-white/55">{clean(item.organization) || 'Organización no informada'}</p>
                    <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-white/6 pt-4 text-xs text-white/45">
                      <span className="flex min-w-0 items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" />{clean(item.location) || 'Elegibilidad internacional'}</span>
                      <span className="flex shrink-0 items-center gap-1.5">{item.deadline ? <><CalendarDays className="h-3 w-3" />Hasta {new Date(item.deadline).toLocaleDateString('es-PY')}</> : <>Ver detalle <ArrowRight className="h-3 w-3" /></>}</span>
                    </div>
                  </Link>
                )
              })}
            </section>
          )}
          <AdSlot placement="opportunities-feed" />
        </main>
      </SiteShell>
    </>
  )
}
