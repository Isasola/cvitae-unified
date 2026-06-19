import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation } from 'wouter'
import { MapPin, Calendar, ArrowRight } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { GrowthLine, Eyebrow } from '@/components/cv/visuals'
import { supabase } from '@/lib/supabase'

interface Opportunity {
  id: string
  titulo: string
  slug: string
  categoria: string
  tipo: string
  ubicacion: string
  fecha_vencimiento: string
  is_active: boolean
  metadata?: { application_url?: string; organization?: string }
}

const cats = ['Todas', 'Becas', 'Foros'] as const
type Cat = (typeof cats)[number]

export default function Opportunities() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<Cat>('Todas')

  useEffect(() => {
    supabase
      .from('content_hub')
      .select('*')
      .eq('is_active', true)
      .in('tipo', ['beca', 'foro'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { setOpportunities(data || []); setLoading(false) })
  }, [])

  const filtered = opportunities.filter((o) =>
    cat === 'Todas' ? true : cat === 'Becas' ? o.tipo === 'beca' : o.tipo === 'foro'
  )

  return (
    <>
      <Helmet>
        <title>Oportunidades Laborales Paraguay | CVitae</title>
        <meta name="description" content="Becas, empleos, foros y eventos seleccionados para profesionales paraguayos y latinoamericanos." />
      </Helmet>
      <SiteShell>
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="relative">
            <Eyebrow>Oportunidades</Eyebrow>
            <h1 className="font-display text-4xl sm:text-5xl mt-2 text-cream">
              Lo que pasa en <em>tu carrera</em> esta semana.
            </h1>
            <p className="text-muted-foreground mt-3 max-w-xl">
              Becas, foros y empleos curados a mano y validados por la IA. Todo lo que
              normalmente se pierde en grupos de WhatsApp, acá en un solo lugar.
            </p>
            <GrowthLine className="absolute -bottom-6 left-0 right-0 h-10 opacity-40" />
          </div>

          <div className="mt-10 flex gap-1 p-1 glass-panel w-fit">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`px-4 py-1.5 text-xs rounded-md transition-colors ${
                  cat === c ? 'bg-gold text-ink' : 'text-muted-foreground hover:text-cream'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="mt-10 flex justify-center">
              <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="mt-10 text-center text-muted-foreground">No hay oportunidades en esta categoría todavía.</p>
          ) : (
            <div className="mt-6 space-y-3">
              {filtered.map((o) => (
                <Link
                  key={o.id}
                  href={`/oportunidades/${o.slug}`}
                  className="glass-panel p-6 flex flex-wrap items-center gap-4 hover:border-gold/40 transition-colors block"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider border border-gold/30 text-gold px-2 py-0.5 rounded-full">
                        {o.tipo === 'beca' ? 'Beca' : 'Foro'}
                      </span>
                    </div>
                    <h3 className="font-display text-xl text-cream mt-2 truncate">{o.titulo}</h3>
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {o.ubicacion}</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Vence {new Date(o.fecha_vencimiento).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </SiteShell>
    </>
  )
}
