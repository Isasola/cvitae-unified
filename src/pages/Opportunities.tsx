import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation } from 'wouter'
import { MapPin, Calendar, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { GrowthLine, Eyebrow } from '@/components/cv/visuals'
import { supabase, auth } from '@/lib/supabase'

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
  const [user, setUser] = useState<any>(null)
  const [ctaEmail, setCtaEmail] = useState('')
  const [ctaSent, setCtaSent] = useState(false)
  const [ctaSending, setCtaSending] = useState(false)

  useEffect(() => {
    supabase
      .from('content_hub')
      .select('*')
      .eq('is_active', true)
      .in('tipo', ['beca', 'foro'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { setOpportunities(data || []); setLoading(false) })

    auth.getUser().then(setUser)
    const sub = auth.onAuthStateChange(setUser)
    return () => sub.unsubscribe()
  }, [])

  const handleCtaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ctaEmail.trim()) return
    setCtaSending(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: ctaEmail.trim().toLowerCase(),
        options: { emailRedirectTo: 'https://cvitae.lat/mi-carrera/perfil' },
      })
      if (!error) setCtaSent(true)
    } finally {
      setCtaSending(false)
    }
  }

  const filtered = opportunities.filter((o) =>
    cat === 'Todas' ? true : cat === 'Becas' ? o.tipo === 'beca' : o.tipo === 'foro'
  )

  return (
    <>
      <Helmet>
        <title>Oportunidades Laborales Paraguay | CVitae</title>
        <meta name="description" content="Becas, empleos, foros y eventos seleccionados para profesionales paraguayos y latinoamericanos." />
        <link rel="canonical" href="https://cvitae.lat/oportunidades" />
        <meta property="og:title" content="Oportunidades Laborales Paraguay | CVitae" />
        <meta property="og:description" content="Becas, empleos, foros y eventos curados para profesionales paraguayos y latinoamericanos." />
        <meta property="og:url" content="https://cvitae.lat/oportunidades" />
        <meta property="og:type" content="website" />
      </Helmet>
      <SiteShell>
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="mb-6">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-cream transition-colors">
              <ArrowLeft className="h-4 w-4" /> Inicio
            </Link>
          </div>
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

          {/* CTA — connect with email+CV for personalised matches */}
          {!user && (
            <div className="mt-8 glass-panel p-6 border border-gold/20 bg-gradient-to-br from-gold/5 to-transparent">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4 text-gold" />
                    <span className="text-xs uppercase tracking-widest text-gold">Oportunidades personalizadas</span>
                  </div>
                  <p className="text-cream font-medium">
                    Conectá tu correo y CV para ver oportunidades que encajan con tu perfil.
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    CVitae analiza tu experiencia y te muestra automáticamente las vacantes, becas y foros más relevantes para vos.
                  </p>
                </div>
                {ctaSent ? (
                  <div className="shrink-0 text-sm text-emerald-400 font-medium">
                    ✓ Revisá tu correo para acceder
                  </div>
                ) : (
                  <form onSubmit={handleCtaSubmit} className="shrink-0 flex gap-2">
                    <input
                      type="email"
                      required
                      value={ctaEmail}
                      onChange={e => setCtaEmail(e.target.value)}
                      placeholder="tu@email.com"
                      className="px-3 py-2 text-sm bg-white/5 border border-white/10 text-cream placeholder-white/30 focus:outline-none focus:border-gold/40 rounded-lg w-48"
                    />
                    <button
                      type="submit"
                      disabled={ctaSending}
                      className="px-4 py-2 text-sm bg-gold text-ink font-medium rounded-lg hover:bg-gold/80 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {ctaSending ? '...' : 'Conectar →'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

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
