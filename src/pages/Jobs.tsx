import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { Briefcase, MapPin, Search, SlidersHorizontal } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { Eyebrow } from '@/components/cv/visuals'
import { supabase } from '@/lib/supabase'
import { AdSlot } from '@/components/cv/AdSlot'

interface Job {
  id: string
  slug: string | null
  title: string
  organization: string | null
  location: string | null
  type: string | null
  rubro: string | null
  source: string | null
  created_at: string
}

const clean = (value: string | null | undefined) => String(value || '').replace(/\s+/g, ' ').trim()
const cleanLocation = (value: string | null | undefined) => {
  const parts = clean(value).split(',').map(part => part.trim()).filter(Boolean)
  return parts.filter((part, index) => index === 0 || part.toLocaleLowerCase('es') !== parts[index - 1].toLocaleLowerCase('es')).join(', ')
}

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') || '')
  const [area, setArea] = useState('Todas')

  useEffect(() => {
    supabase
      .from('opportunities')
      .select('id,slug,title,organization,location,type,rubro,source,created_at')
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .eq('catalog_eligible', true)
      .in('opportunity_type', ['job', 'internship', 'consultancy'])
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(200)
      .then(({ data, error: loadError }) => {
        if (loadError) setError('No pudimos cargar los empleos. Intentá nuevamente en unos minutos.')
        else setJobs((data || []) as Job[])
        setLoading(false)
      })
  }, [])

  const areas = useMemo(() => ['Todas', ...Array.from(new Set(jobs.map(job => clean(job.rubro)).filter(Boolean))).sort()], [jobs])
  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim()
    return jobs.filter(job => {
      const matchesArea = area === 'Todas' || clean(job.rubro) === area
      const haystack = `${job.title} ${job.organization || ''} ${job.location || ''} ${job.rubro || ''}`.toLowerCase()
      return matchesArea && (!needle || haystack.includes(needle))
    })
  }, [area, jobs, query])

  return (
    <>
      <Helmet>
        <title>Empleos en Paraguay actualizados | CVitae</title>
        <meta name="description" content="Buscá empleos revisados en Paraguay por área, empresa y ubicación. Vacantes reunidas y verificadas por CVitae." />
        <link rel="canonical" href="https://cvitae.lat/empleos" />
        <meta property="og:title" content="Empleos en Paraguay actualizados | CVitae" />
        <meta property="og:description" content="Vacantes de Paraguay reunidas, ordenadas y verificadas antes de mostrarse en el catálogo." />
        <meta property="og:url" content="https://cvitae.lat/empleos" />
      </Helmet>
      <SiteShell>
        <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <header className="max-w-3xl">
            <Eyebrow>Empleos en Paraguay</Eyebrow>
            <h1 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">
              Vacantes reales, en un solo lugar.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Reunimos ofertas de fuentes paraguayas, eliminamos duplicados y revisamos su actualización. La postulación siempre continúa en la fuente original o con la empresa que publicó en CVitae.
            </p>
          </header>

          <section className="mt-9 grid gap-3 border-y border-white/8 py-5 sm:grid-cols-[1fr_280px]" aria-label="Filtros de empleos">
            <label className="relative block">
              <span className="sr-only">Buscar por cargo, empresa o ciudad</span>
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden="true" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Cargo, empresa o ciudad"
                className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.025] pl-11 pr-4 text-sm text-cream outline-none transition placeholder:text-white/25 focus:border-[#c9a84c]/45"
              />
            </label>
            <label className="relative block">
              <span className="sr-only">Filtrar por área</span>
              <SlidersHorizontal className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden="true" />
              <select value={area} onChange={event => setArea(event.target.value)} className="h-12 w-full appearance-none rounded-xl border border-white/10 bg-[#0d0d0d] pl-11 pr-4 text-sm text-cream outline-none transition focus:border-[#c9a84c]/45">
                {areas.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>
          </section>

          <div className="mt-6 flex items-center justify-between gap-4 text-xs text-white/50">
            <span>{loading ? 'Consultando fuentes…' : `${filtered.length} empleos visibles`}</span>
            <span>Catálogo sujeto a revisión continua</span>
          </div>

          {error ? (
            <div className="mt-6 border border-red-400/20 bg-red-400/[0.04] p-6 text-sm text-red-200" role="alert">{error}</div>
          ) : loading ? (
            <div className="mt-6 grid gap-px overflow-hidden border border-white/8 bg-white/8 md:grid-cols-2">
              {[0, 1, 2, 3].map(item => <div key={item} className="h-44 animate-pulse bg-[#0b0b0b]" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-6 border border-white/8 px-6 py-14 text-center">
              <Briefcase className="mx-auto h-7 w-7 text-white/20" aria-hidden="true" />
              <p className="mt-4 text-cream">No encontramos resultados con esos filtros.</p>
              <button onClick={() => { setQuery(''); setArea('Todas') }} className="mt-3 text-sm text-[#c9a84c] hover:underline">Limpiar filtros</button>
            </div>
          ) : (
            <section className="mt-6 grid gap-px overflow-hidden border border-white/8 bg-white/8 md:grid-cols-2" aria-label="Listado de empleos">
              {filtered.map(job => (
                <Link key={job.id} href={`/empleos/${job.slug || job.id}`} className="group bg-[#0a0a0a] p-5 transition hover:bg-[#0e0e0e] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a84c]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[#c9a84c]">{clean(job.rubro) || 'General'}</p>
                      <h2 className="mt-2 font-display text-xl leading-snug text-cream transition group-hover:text-white">{clean(job.title)}</h2>
                      <p className="mt-1 text-sm text-white/60">{clean(job.organization) || 'Empresa no informada'}</p>
                    </div>
                    <span className="shrink-0 border border-white/10 px-2 py-1 text-[9px] uppercase tracking-wider text-white/35">{clean(job.type) || 'Empleo'}</span>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/6 pt-3 text-xs text-white/50">
                    <span className="flex min-w-0 items-center gap-1.5 truncate"><MapPin className="h-3 w-3 shrink-0" />{cleanLocation(job.location) || 'Paraguay'}</span>
                    <span className="shrink-0">Ver detalle →</span>
                  </div>
                </Link>
              ))}
            </section>
          )}
          <AdSlot placement="jobs-feed" />
        </main>
      </SiteShell>
    </>
  )
}
