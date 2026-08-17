import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { safeExternalUrl } from '@/lib/safe-url'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, BellOff, MapPin, Briefcase, ExternalLink, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { ProductGuide } from '@/components/cv/ProductGuide'
import { auth, supabase } from '@/lib/supabase'

const ease = [0.22, 1, 0.36, 1] as const

interface Opportunity {
  id: string
  title: string
  organization: string
  location: string
  type: string
  rubro: string
  tags: string[]
  application_url: string
  matchScore: number
  matchReasons: string[]
}

function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€/g, '"').replace(/â€"/g, '–').replace(/â€"/g, '—')
    .replace(/Ã©/g, 'é').replace(/Ã¡/g, 'á').replace(/Ã­/g, 'í').replace(/Ã³/g, 'ó').replace(/Ãº/g, 'ú')
    .replace(/[\u{0080}-\u{009F}]/gu, '').trim()
}

function OpportunityCard({ opp }: { opp: Opportunity }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease }}
      className="glass-card rounded-2xl p-5 hover:border-[#c9a84c]/25 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.18em] border border-[#c9a84c]/30 text-[#c9a84c] px-2 py-0.5 rounded-full">
              {opp.rubro}
            </span>
            <span className="text-[10px] text-white/30">{opp.type}</span>
          </div>
          <h3 className="mt-2 font-display text-lg text-white leading-tight">{cleanText(opp.title)}</h3>
          <p className="text-sm font-light text-white/55 mt-0.5">{cleanText(opp.organization)}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-white/35">
            <span className="flex items-center gap-1"><MapPin size={11} />{opp.location}</span>
            <span className="flex items-center gap-1"><Briefcase size={11} />{opp.type}</span>
          </div>
          {opp.matchReasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {opp.matchReasons.slice(0, 4).map(r => (
                <span key={r} className="text-[10px] bg-white/[0.04] border border-white/8 rounded-full px-2 py-0.5 text-white/50">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <p className="font-display text-2xl text-[#c9a84c]">{opp.matchScore}%</p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/30">match</p>
          </div>
          <a
            href={safeExternalUrl(opp.application_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/50 transition hover:border-[#c9a84c]/40 hover:text-[#c9a84c]"
          >
            Ver <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </motion.div>
  )
}

export default function Alertas() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [matches, setMatches] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState('')
  const [noProfile, setNoProfile] = useState(false)

  useEffect(() => {
    auth.getUser().then(async (u) => {
      if (!u) { setLoading(false); return }
      setUser(u)

      const { data: prof } = await supabase
        .from('user_master_profiles')
        .select('id, full_name, profile_data, match_alerts_enabled, email')
        .eq('user_id', u.id)
        .maybeSingle()

      if (!prof) { setNoProfile(true); setLoading(false); return }

      setProfile(prof)
      setSubscribed(!!prof.match_alerts_enabled)

      const skills: string[] = prof.profile_data?.habilidades || []

      if (skills.length === 0) { setLoading(false); return }

      const { data: result, error: matchError } = await supabase.functions.invoke('match-batch', {
        body: { mode: 'alerts' },
      })
      if (matchError) throw matchError

      setMatches((result?.matches || []).map((match: any) => ({
        id: match.id,
        title: match.titulo,
        organization: match.organization,
        location: match.ubicacion,
        type: match.categoria,
        rubro: match.categoria,
        tags: match.vacancySkills || [],
        application_url: match.application_url,
        matchScore: match.finalScore,
        matchReasons: match.matchedSkills || [],
      })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const toggleSubscription = async () => {
    if (!profile) return
    setToggling(true)
    const newVal = !subscribed
    setToggleError('')
    const { error } = await supabase
      .from('user_master_profiles')
      .update({ match_alerts_enabled: newVal })
      .eq('id', profile.id)
    if (error) setToggleError('No pudimos guardar tu preferencia. Intentá nuevamente.')
    else setSubscribed(newVal)
    setToggling(false)
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Alertas de Empleo | CVitae</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40 mb-4">
            <span className="h-px w-8 bg-white/20" /> Alertas de empleo
          </div>
          <h1 className="font-display text-3xl text-white">Oportunidades para <em className="italic font-normal">tu perfil</em>.</h1>
          <p className="mt-2 text-sm font-light text-white/50 max-w-lg">
            Basado en tus habilidades, esto es lo que encontramos hoy. Activá las alertas para recibir por email los matches nuevos realmente altos.
          </p>
        </div>

        {/* Subscribe toggle */}
        {!loading && profile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl p-5 mb-8 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
                subscribed ? 'border-[#c9a84c]/40 bg-[#c9a84c]/10' : 'border-white/10 bg-white/[0.03]'
              }`}>
                {subscribed
                  ? <Bell strokeWidth={1.5} className="h-4 w-4 text-[#c9a84c]" />
                  : <BellOff strokeWidth={1.5} className="h-4 w-4 text-white/30" />
                }
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {subscribed ? 'Alertas activas' : 'Alertas desactivadas'}
                </p>
                <p className="text-xs font-light text-white/40">
                  {subscribed
                    ? `Recibirás novedades en ${profile.email || user?.email || 'tu email'}`
                    : 'Activá para recibir oportunidades verificadas con match muy alto'
                  }
                </p>
              </div>
            </div>
            <button
              onClick={toggleSubscription}
              disabled={toggling}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all ${
                subscribed
                  ? 'border border-white/10 text-white/50 hover:border-white/25 hover:text-white'
                  : 'bg-[#c9a84c] text-[#0a0a0a] hover:shadow-[0_0_30px_-4px_rgba(201,168,76,0.5)]'
              } disabled:opacity-50`}
            >
              {toggling ? <Loader2 strokeWidth={1.5} className="h-3.5 w-3.5 animate-spin" /> : null}
              {subscribed ? 'Desactivar' : 'Activar alertas'}
            </button>
          </motion.div>
        )}
        {toggleError && <p className="mb-6 text-sm text-red-400" role="alert">{toggleError}</p>}

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-[#c9a84c]" />
          </div>
        ) : noProfile ? (
          <div className="glass-card rounded-2xl py-16 text-center">
            <Sparkles strokeWidth={1.25} className="mx-auto mb-4 h-10 w-10 text-white/20" />
            <p className="text-white font-display text-xl mb-2">Completá tu perfil primero</p>
            <p className="text-sm font-light text-white/45 mb-6">
              Para mostrarte matches necesitamos saber tus habilidades.
            </p>
            <Link
              href="/mi-carrera/perfil"
              className="inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
            >
              Completar perfil
            </Link>
          </div>
        ) : (profile?.profile_data?.habilidades?.length ?? 0) === 0 ? (
          <div className="glass-card rounded-2xl py-16 text-center">
            <Bell strokeWidth={1.25} className="mx-auto mb-4 h-10 w-10 text-white/20" />
            <p className="text-white font-display text-xl mb-2">Agregá habilidades a tu perfil</p>
            <p className="text-sm font-light text-white/45 mb-6">
              Las alertas se basan en tus skills para encontrar el mejor match.
            </p>
            <Link
              href="/mi-carrera/perfil"
              className="inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
            >
              Agregar habilidades
            </Link>
          </div>
        ) : matches.length === 0 ? (
          <div className="glass-card rounded-2xl py-16 text-center">
            <CheckCircle2 strokeWidth={1.25} className="mx-auto mb-4 h-10 w-10 text-white/20" />
            <p className="text-white font-display text-xl mb-2">Todo al día</p>
            <p className="text-sm font-light text-white/45">
              No encontramos nuevas oportunidades con tus skills hoy. Volvé a revisar pronto.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40 mb-2">
                <span className="h-px w-8 bg-white/20" /> {matches.length} oportunidades que coinciden con tu perfil
              </div>
              {matches.map(opp => (
                <OpportunityCard key={opp.id} opp={opp} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
      <ProductGuide
        storageKey="b2c_alerts_v1"
        label="Alertas"
        steps={[
          { title: 'Activá el permiso', description: 'CVitae sólo envía avisos si activás las alertas. Podés desactivarlas en cualquier momento desde esta pantalla.' },
          { title: 'Recibí sólo matches muy altos', description: 'El correo se reserva para oportunidades verificadas que superan tu umbral; cada oportunidad se envía una sola vez.' },
          { title: 'Mantené tu perfil al día', description: 'Tus habilidades, título y ubicación cambian el resultado. Revisalos si los avisos dejan de ser relevantes.' },
        ]}
      />
    </DashboardLayout>
  )
}
