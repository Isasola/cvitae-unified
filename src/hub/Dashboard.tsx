import { useState, useEffect, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  Sparkles, UserCircle, Search, Briefcase, MapPin, Lock,
  ExternalLink, Bell, BookOpen, Eye, ChevronRight, Target,
  Upload, Mail, ExternalLink as ExternalLinkIcon, ArrowRight,
} from 'lucide-react'
import { GlassCard, GoldButton, Badge, MatchArc } from '@/components/cvitae/UI-Elements'
import { GrowthLine, CompatibilityTrace, Connector, Eyebrow } from '@/components/cv/visuals'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'
import { analytics } from '@/lib/analytics'
import emailjs from 'emailjs-com'

const MATCH_BATCH_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/match-batch'
const WA_NUMBER = '595992954169'

interface MatchItem {
  id: string; slug: string; titulo: string; categoria: string
  ubicacion: string; organization: string; application_url: string
  skillsScore: number; seniorityScore: number; locationScore: number
  finalScore: number; vacancySkills: string[]
}
interface CourseRecommendation {
  skill: string; course: string; platform: string; url: string; why: string
}

// ─── Empty state (no session) ─────────────────────────────────────────────────

function EmptyState() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email.trim()) return
    setLoading(true); setError(''); setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: 'https://cvitae.lat/auth/callback' },
      })
      if (error) throw error
      setMessage('Revisá tu correo y hacé clic en el enlace mágico.')
    } catch (err: any) {
      setError(err.message || 'Error al enviar el enlace')
    } finally {
      setLoading(false)
    }
  }

  const pillars = [
    { n: '01', t: 'Analiza tu CV', d: 'La IA lee tu trayectoria y te da un Score de Empleabilidad.' },
    { n: '02', t: 'Te matchea', d: 'Con empleos, becas, diplomados y concursos reales en Paraguay.' },
    { n: '03', t: 'Traza tu ruta', d: 'Habilidades, cursos y certificaciones puntuales para crecer.' },
    { n: '04', t: 'Te hace visible', d: 'Las empresas que buscan talento en CVitae te encuentran.' },
  ]

  return (
    <div className="editorial-panel p-10 relative overflow-hidden">
      <GrowthLine className="absolute -top-4 left-0 right-0 h-32 opacity-60" />
      <div className="relative">
        <Eyebrow>Bienvenida a CVitae</Eyebrow>
        <h2 className="font-display text-4xl mt-2 text-cream max-w-2xl leading-tight">
          Tu carrera, <em>trazada</em> por una IA que conoce el mercado paraguayo.
        </h2>
        <p className="text-muted-foreground mt-4 max-w-xl">
          Subí tu CV y CVitae lo analiza, te da un Score de Empleabilidad, te matchea con
          empleos, becas y diplomados reales, y te traza una ruta concreta para crecer.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-7">
          {pillars.map((p) => (
            <div key={p.n} className="glass-panel p-4">
              <div className="flex items-baseline gap-3">
                <span className="font-display italic text-gold text-sm">{p.n}</span>
                <div>
                  <p className="font-display text-base text-cream">{p.t}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.d}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-xl">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="tu@email.com"
              disabled={loading}
              className="w-full glass-panel pl-10 pr-3 py-2.5 text-sm text-cream placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold"
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={loading || !email.trim()}
            className="inline-flex items-center justify-center gap-2 bg-gold text-ink hover:bg-gold-soft h-10 px-5 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Enviando…' : 'Entrar con email'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        {message && <p className="text-gold text-sm mt-2">{message}</p>}
        <p className="text-[11px] text-muted-foreground mt-3">Sin contraseñas. Te mandamos un enlace mágico al email.</p>
      </div>
    </div>
  )
}

// ─── Loader state ─────────────────────────────────────────────────────────────

function LoaderState({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div className="editorial-panel p-10">
      <Eyebrow>Trazando tu trayecto</Eyebrow>
      <h2 className="font-display text-3xl mt-2 text-cream">Un momento…</h2>
      <p className="text-muted-foreground mt-1">Estamos leyendo tu carrera, paso a paso.</p>
      <div className="relative mt-8 h-20">
        <GrowthLine className="absolute inset-0 w-full h-full" />
      </div>
      <ul className="mt-6 space-y-3">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-3 text-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${
              i < currentStep ? 'bg-gold' : i === currentStep ? 'bg-gold animate-pulse' : 'bg-muted'
            }`} />
            <span className={i <= currentStep ? 'text-cream' : 'text-muted-foreground'}>
              {label}{i === currentStep ? '…' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Incomplete profile state ─────────────────────────────────────────────────

function IncompleteState({ score }: { score: number }) {
  return (
    <div className="space-y-5">
      <div className="editorial-panel p-8">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <Eyebrow>Antes de ver oportunidades</Eyebrow>
            <h2 className="font-display text-3xl mt-2 text-cream">
              Tu perfil está al <em>{score}%</em>.
            </h2>
            <p className="text-muted-foreground mt-2 max-w-lg">
              Completá experiencia y skills para que CVitae trace mejores matches y te
              vuelva más visible para las empresas del ecosistema.
            </p>
          </div>
          <a
            href="/mi-carrera/perfil"
            className="inline-flex items-center gap-2 bg-gold text-ink hover:bg-gold-soft h-10 px-5 rounded-md text-sm font-medium transition-colors"
          >
            Completar perfil
          </a>
        </div>
        <div className="mt-6">
          <CompatibilityTrace score={score} label="Completitud del perfil" />
        </div>
      </div>
    </div>
  )
}

// ─── Next step block ──────────────────────────────────────────────────────────

function NextStep({ label, detail, href }: { label: string; detail: string; href: string }) {
  return (
    <div className="gold-panel p-6 relative overflow-hidden">
      <div className="flex items-start gap-4">
        <div className="hidden sm:grid h-10 w-10 place-items-center rounded-full bg-gold/15 border border-gold/40 shrink-0">
          <Target className="h-4 w-4 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <Eyebrow>Tu próximo paso</Eyebrow>
          <h3 className="font-display text-xl sm:text-2xl mt-1 text-cream leading-snug">
            {label}
          </h3>
          <p className="text-sm text-muted-foreground mt-2">{detail}</p>
        </div>
        <a
          href={href}
          className="hidden sm:inline-flex items-center gap-1.5 bg-gold text-ink hover:bg-gold-soft h-8 px-3 rounded-md text-xs font-medium transition-colors shrink-0"
        >
          Ir <ArrowRight className="h-3 w-3" />
        </a>
      </div>
      <a
        href={href}
        className="mt-4 w-full sm:hidden inline-flex items-center justify-center gap-2 bg-gold text-ink hover:bg-gold-soft h-9 rounded-md text-sm font-medium transition-colors"
      >
        Ir <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

// ─── Visibility hint ──────────────────────────────────────────────────────────

function VisibilityHint() {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gold">
        <Eye className="h-3 w-3" /> Del otro lado del ecosistema
      </div>
      <p className="font-display text-base text-cream mt-2 leading-snug">
        Tu perfil optimizado te hace visible para empresas que buscan talento en CVitae.
      </p>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function deriveScore(matches: MatchItem[]): number {
  if (matches.length === 0) return 0
  const top3 = matches.slice(0, 3)
  return Math.round(top3.reduce((acc, m) => acc + m.finalScore, 0) / top3.length)
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [matches, setMatches] = useState<MatchItem[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [profileSkills, setProfileSkills] = useState<string[]>([])
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)
  const [currentLoaderStep, setCurrentLoaderStep] = useState(0)
  const [courses, setCourses] = useState<CourseRecommendation[]>([])
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [profile, setProfile] = useState<any>(null)

  const loaderSteps = ['Leyendo tu perfil', 'Cargando vacantes activas', 'Calculando compatibilidad', 'Ordenando recomendaciones']

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { setUser(session.user); setAuthLoading(false); return }
      for (let i = 0; i < 4; i++) {
        await new Promise(r => setTimeout(r, 1000))
        const { data: { session: s } } = await supabase.auth.getSession()
        if (s) { setUser(s.user); setAuthLoading(false); return }
      }
      setUser(null); setAuthLoading(false)
    }
    init()
    const subscription = auth.onAuthStateChange((u) => { setUser(u); setAuthLoading(false) })
    return () => { subscription?.unsubscribe() }
  }, [])

  useEffect(() => {
    if (user) {
      supabase.from('user_master_profiles').select('id').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => setHasProfile(!!data))
    }
  }, [user])

  useEffect(() => {
    let interval: any
    if (loadingMatches) {
      setCurrentLoaderStep(0)
      interval = setInterval(() => setCurrentLoaderStep(prev => prev < loaderSteps.length - 1 ? prev + 1 : prev), 2000)
    }
    return () => clearInterval(interval)
  }, [loadingMatches])

  useEffect(() => { if (user) loadMatches() }, [user])

  const loadMatches = async () => {
    setLoadingMatches(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No autorizado')
      const response = await fetch(MATCH_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error')
      setMatches(data.matches || [])
      setProfileSkills(data.profileSkills || [])
      setIsSubscribed(data.is_subscribed || false)
      const { data: prof } = await supabase.from('user_master_profiles')
        .select('professional_title, profile_data').eq('user_id', user.id).maybeSingle()
      setProfile(prof)
      if (data.profileSkills?.length > 0) loadGeminiCourses(data.profileSkills, data.matches || [], token)
    } catch { /* silencioso */ } finally {
      setLoadingMatches(false)
    }
  }

  const loadGeminiCourses = async (skills: string[], allMatches: any[], token: string) => {
    setLoadingCourses(true)
    try {
      const allVacancySkills: string[] = []
      allMatches.slice(0, 5).forEach((m: any) => {
        m.vacancySkills?.forEach((s: string) => {
          if (!skills.some((ps: string) => ps.toLowerCase() === s.toLowerCase())) allVacancySkills.push(s)
        })
      })
      const freq: Record<string, number> = {}
      allVacancySkills.forEach(s => { freq[s] = (freq[s] || 0) + 1 })
      const missingSkills = Object.entries(freq).sort(([, a], [, b]) => b - a).slice(0, 4).map(([s]) => s)
      if (missingSkills.length === 0) return
      const res = await fetch('/.netlify/functions/gemini-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ profileSkills: skills, missingSkills, profileTitle: profile?.professional_title || '' }),
      })
      if (!res.ok) return
      const data = await res.json()
      setCourses(data.courses || [])
    } catch { /* silencioso */ } finally {
      setLoadingCourses(false)
    }
  }

  const missingSkills = useMemo(() => {
    const allVacancySkills: string[] = []
    matches.slice(0, 5).forEach(m => {
      m.vacancySkills?.forEach(s => {
        if (!profileSkills.some(ps => ps.toLowerCase() === s.toLowerCase())) allVacancySkills.push(s)
      })
    })
    const freq: Record<string, number> = {}
    allVacancySkills.forEach(s => { freq[s] = (freq[s] || 0) + 1 })
    return Object.entries(freq).sort(([, a], [, b]) => b - a).slice(0, 4).map(([s]) => s)
  }, [matches, profileSkills])

  const employabilityScore = useMemo(() => deriveScore(matches), [matches])

  const nextStep = useMemo(() => {
    if (!hasProfile) return { label: 'Completar mi perfil', detail: 'Necesitamos tus habilidades para encontrarte el trabajo ideal.', href: '/mi-carrera/perfil' }
    if (missingSkills.length > 0) return { label: `Sumá ${missingSkills[0]}`, detail: `Agregar esta skill puede mejorar tu score significativamente.`, href: '/mi-carrera/perfil' }
    if (matches.length === 0) return { label: 'Explorar oportunidades', detail: 'No encontramos matches aún. Explorá oportunidades manualmente.', href: '/oportunidades' }
    return { label: 'Generá tu CV Vivo', detail: 'Creá un CV adaptado por IA para tu mejor oportunidad actual.', href: '/mi-carrera/cv' }
  }, [hasProfile, missingSkills, matches])

  return (
    <DashboardLayout>
      <Helmet>
        <title>Mi Carrera | CVitae</title>
        <meta name="description" content="Tu dashboard con matching de oportunidades, score de empleabilidad y recomendaciones con IA." />
      </Helmet>

      <div className="space-y-6">
        {authLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !user ? (
          <EmptyState />
        ) : hasProfile === false ? (
          <IncompleteState score={30} />
        ) : loadingMatches ? (
          <LoaderState steps={loaderSteps} currentStep={currentLoaderStep} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
            {/* Main column */}
            <div className="space-y-5">
              {/* Score hero */}
              {employabilityScore > 0 && (
                <div className="gold-panel p-7 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div>
                      <Eyebrow>Score de empleabilidad</Eyebrow>
                      <h2 className="font-display text-5xl mt-1 text-cream">
                        {employabilityScore}<span className="text-2xl align-top">/100</span>
                      </h2>
                    </div>
                    <div className="hidden sm:block w-1/2">
                      <GrowthLine variant="score" className="w-full h-24" />
                      <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground mt-1 px-1">
                        <span>Ene</span><span>Mar</span><span>May</span><span>Hoy</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <NextStep {...nextStep} />

              <div className="flex items-baseline justify-between pt-2">
                <h3 className="font-display text-2xl text-cream">
                  Oportunidades <em>para vos</em>
                </h3>
                {matches.length > 0 && (
                  <span className="text-xs text-muted-foreground">{matches.length} encontradas hoy</span>
                )}
              </div>

              {matches.length === 0 ? (
                <div className="glass-panel p-10 text-center">
                  <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="font-display text-lg text-cream mb-2">No encontramos matches aún</h3>
                  <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
                    Completá tu perfil con más habilidades para ver oportunidades.
                  </p>
                  <a href="/mi-carrera/perfil" className="inline-flex items-center gap-2 border border-border text-cream hover:bg-cream/5 h-9 px-4 rounded-md text-sm transition-colors">
                    Mejorar perfil
                  </a>
                </div>
              ) : (
                <>
                  {/* Featured */}
                  <article className="gold-panel p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-gold">
                          <Sparkles className="h-3 w-3" /> Match destacado
                        </div>
                        <h4 className="font-display text-2xl mt-1.5 text-cream truncate">{matches[0].titulo}</h4>
                        <p className="text-sm text-muted-foreground mt-0.5">{matches[0].organization}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {matches[0].ubicacion}</span>
                          <span className="inline-flex items-center gap-1 border border-border px-2 py-0.5 rounded-full">{matches[0].categoria}</span>
                        </div>
                      </div>
                      <div className="w-full sm:w-56">
                        <CompatibilityTrace score={matches[0].finalScore} />
                        <div className="mt-3 flex gap-2">
                          <a href={`/oportunidades/${matches[0].slug}`} className="flex-1 inline-flex items-center justify-center gap-1.5 bg-gold text-ink hover:bg-gold-soft h-8 rounded-md text-xs font-medium transition-colors">
                            Postular <ExternalLink className="h-3 w-3" />
                          </a>
                          <a href={`/oportunidades/${matches[0].slug}`} className="inline-flex items-center justify-center text-muted-foreground hover:text-cream hover:bg-cream/5 h-8 px-3 rounded-md text-xs transition-colors">
                            Ver detalle
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>

                  {/* Rest */}
                  <div className="space-y-3">
                    {matches.slice(1, 5).map((m) => (
                      <article key={m.id} className="glass-panel p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-display text-lg text-cream truncate">{m.titulo}</h4>
                            <p className="text-xs text-muted-foreground">{m.organization}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {m.ubicacion}</span>
                              <span className="border border-border px-2 py-0.5 rounded-full">{m.categoria}</span>
                            </div>
                          </div>
                          <div className="w-44">
                            <CompatibilityTrace score={m.finalScore} />
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-border/40 flex gap-2">
                          <a href={`/oportunidades/${m.slug}`} className="inline-flex items-center gap-1.5 bg-gold text-ink hover:bg-gold-soft h-7 px-3 rounded-md text-xs font-medium transition-colors">
                            Postular <ExternalLink className="h-3 w-3" />
                          </a>
                          <a href={`/oportunidades/${m.slug}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-cream hover:bg-cream/5 h-7 px-2 rounded-md text-xs transition-colors">
                            Ver detalle
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Sidebar */}
            <aside className="space-y-5">
              <VisibilityHint />

              <div className="glass-panel p-5">
                <h4 className="font-display text-lg text-cream">Habilidades faltantes</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Para subir tu compatibilidad media</p>
                <ul className="mt-4 space-y-2">
                  {missingSkills.length === 0 ? (
                    <li className="text-xs text-muted-foreground italic">Calculando…</li>
                  ) : missingSkills.map((s, i) => (
                    <li key={s} className="flex items-center gap-3 text-sm text-cream">
                      <span className="font-display italic text-gold text-xs w-4">0{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="glass-panel p-5">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-lg text-cream">Cursos recomendados</h4>
                  <span className="text-[10px] uppercase tracking-wider border border-gold/30 text-gold px-2 py-0.5 rounded-full">IA</span>
                </div>
                {loadingCourses ? (
                  <div className="mt-4 space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-10 bg-cream/5 rounded-md animate-pulse" />)}
                  </div>
                ) : courses.length > 0 ? (
                  <div className="mt-4 flex">
                    <Connector />
                    <div className="flex-1 space-y-4">
                      {courses.map((c, i) => (
                        <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="block group">
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-3.5 w-3.5 text-gold" />
                            <p className="text-sm text-cream group-hover:text-gold transition-colors">{c.course}</p>
                          </div>
                          <p className="text-[11px] text-muted-foreground pl-[22px]">{c.platform} · {c.why}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-3 italic">Completá tu perfil para ver cursos personalizados.</p>
                )}
              </div>

              <div className="glass-panel p-5 opacity-70">
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-lg text-cream inline-flex items-center gap-2">
                    <Bell className="h-4 w-4 text-gold" /> Alertas proactivas
                  </h4>
                  <span className="text-[10px] uppercase tracking-wider border border-border text-muted-foreground px-2 py-0.5 rounded-full">Pronto</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Te avisaremos cuando aparezcan vacantes nuevas que encajen.</p>
              </div>

              {!isSubscribed && (
                <div className="gold-panel p-5">
                  <Lock className="h-4 w-4 text-gold" />
                  <h4 className="font-display text-xl text-cream mt-2">Llegaste a tu límite diario.</h4>
                  <p className="text-xs text-muted-foreground mt-1">Con CVitae Premium ves todos tus matches sin pausa.</p>
                  <a
                    href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola! Quiero activar mi suscripción a CVitae Pro por USD 9/mes.')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-gold text-ink hover:bg-gold-soft h-9 rounded-md text-sm font-medium transition-colors"
                  >
                    Probar Premium
                  </a>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
