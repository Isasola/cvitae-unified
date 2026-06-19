import { useState, useEffect, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Search, MapPin, Lock,
  Bell, BookOpen, ArrowRight, Target,
  Mail, ExternalLink, ChevronRight,
} from 'lucide-react'
import { GrowthLine, CompatibilityTrace, Connector, Eyebrow } from '@/components/cv/visuals'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'

const MATCH_BATCH_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/match-batch'
const WA_NUMBER = '595992954169'

const ease = [0.22, 1, 0.36, 1] as const

interface MatchItem {
  id: string; slug: string; titulo: string; categoria: string
  ubicacion: string; organization: string; application_url: string
  skillsScore: number; seniorityScore: number; locationScore: number
  finalScore: number; vacancySkills: string[]
}
interface CourseRecommendation {
  skill: string; course: string; platform: string; url: string; why: string
}

// ─── Empty state ──────────────────────────────────────────────────────────────

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
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease }}
      className="relative overflow-hidden rounded-3xl border border-white/8 bg-[#0a0a0a] p-10"
    >
      <GrowthLine className="absolute -top-4 left-0 right-0 h-32 opacity-60" />
      <div className="relative">
        <Eyebrow>Bienvenida a CVitae</Eyebrow>
        <h2 className="font-display mt-2 max-w-2xl text-4xl leading-tight text-cream">
          Tu carrera, <em>trazada</em> por una IA que conoce el mercado paraguayo.
        </h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Subí tu CV y CVitae lo analiza, te da un Score de Empleabilidad, te matchea con
          empleos, becas y diplomados reales, y te traza una ruta concreta para crecer.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {pillars.map((p, i) => (
            <motion.div
              key={p.n}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, ease }}
              className="glass-panel p-4"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-display italic text-sm text-gold">{p.n}</span>
                <div>
                  <p className="font-display text-base text-cream">{p.t}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.d}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="tu@email.com" disabled={loading}
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] pl-10 pr-3 py-2.5 text-sm text-cream placeholder:text-muted-foreground outline-none focus:border-[#c9a84c]/50 transition"
            />
          </div>
          <button
            onClick={handleLogin} disabled={loading || !email.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-50"
          >
            {loading ? 'Enviando…' : 'Entrar con email'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {message && <p className="mt-2 text-sm text-[#c9a84c]">{message}</p>}
        <p className="mt-3 text-[11px] text-muted-foreground">Sin contraseñas. Te mandamos un enlace mágico al email.</p>
      </div>
    </motion.div>
  )
}

// ─── Loader state ─────────────────────────────────────────────────────────────

function LoaderState({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="rounded-3xl border border-white/8 bg-[#0a0a0a] p-10"
    >
      <Eyebrow>Trazando tu trayecto</Eyebrow>
      <h2 className="font-display mt-2 text-3xl text-cream">Un momento…</h2>
      <p className="mt-1 text-muted-foreground">Estamos leyendo tu carrera, paso a paso.</p>
      <div className="relative mt-8 h-20">
        <GrowthLine className="absolute inset-0 h-full w-full" />
      </div>
      <ul className="mt-6 space-y-3">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-3 text-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${
              i < currentStep ? 'bg-[#c9a84c]' : i === currentStep ? 'bg-[#c9a84c] animate-pulse' : 'bg-white/15'
            }`} />
            <span className={i <= currentStep ? 'text-cream' : 'text-muted-foreground'}>
              {label}{i === currentStep ? '…' : ''}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

// ─── Incomplete profile ───────────────────────────────────────────────────────

function IncompleteState({ score }: { score: number }) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/8 bg-[#0a0a0a] p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Eyebrow>Antes de ver oportunidades</Eyebrow>
            <h2 className="font-display mt-2 text-3xl text-cream">
              Tu perfil está al <em>{score}%</em>.
            </h2>
            <p className="mt-2 max-w-lg text-muted-foreground">
              Completá experiencia y skills para que CVitae trace mejores matches y te
              vuelva más visible para las empresas del ecosistema.
            </p>
          </div>
          <a
            href="/mi-carrera/perfil"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
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
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease }}
      className="relative overflow-hidden rounded-3xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.04] p-6"
    >
      <div className="flex items-start gap-4">
        <div className="hidden h-10 w-10 shrink-0 place-items-center rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/15 sm:grid">
          <Target className="h-4 w-4 text-[#c9a84c]" />
        </div>
        <div className="min-w-0 flex-1">
          <Eyebrow>Tu próximo paso</Eyebrow>
          <h3 className="font-display mt-1 text-xl leading-snug text-cream sm:text-2xl">{label}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        </div>
        <a
          href={href}
          className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#c9a84c] px-3 text-xs font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] sm:inline-flex"
        >
          Ir <ArrowRight className="h-3 w-3" />
        </a>
      </div>
      <a
        href={href}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c9a84c] py-2 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] sm:hidden"
      >
        Ir <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </motion.div>
  )
}

// ─── Score hero ───────────────────────────────────────────────────────────────

function ScoreHero({ score }: { score: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.7, ease }}
      className="relative overflow-hidden rounded-3xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.03] p-7"
    >
      <div className="absolute -inset-2 -z-10 rounded-[2rem] bg-gradient-to-br from-[#c9a84c]/10 via-transparent to-transparent blur-2xl" />
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow>Score de empleabilidad</Eyebrow>
          <h2 className="font-display mt-1 text-5xl text-cream">
            {score}<span className="align-top text-2xl">/100</span>
          </h2>
        </div>
        <div className="hidden w-1/2 sm:block">
          <GrowthLine variant="score" className="h-24 w-full" />
          <div className="mt-1 flex justify-between px-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Ene</span><span>Mar</span><span>May</span><span>Hoy</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Opportunity card ─────────────────────────────────────────────────────────

function OpportunityCard({ m, featured }: { m: MatchItem; featured?: boolean }) {
  return (
    <article
      className={`rounded-2xl border p-5 transition-all hover:border-[#c9a84c]/25 ${
        featured ? 'border-[#c9a84c]/25 bg-[#c9a84c]/[0.03]' : 'glass-panel'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {featured && (
            <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#c9a84c]">
              <Sparkles className="h-3 w-3" /> Match destacado
            </div>
          )}
          <h4 className="font-display text-lg text-cream truncate sm:text-xl">{m.titulo}</h4>
          <p className="text-sm text-muted-foreground">{m.organization}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {m.ubicacion}</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5">{m.categoria}</span>
          </div>
        </div>
        <div className={featured ? 'w-full sm:w-56' : 'w-44'}>
          <CompatibilityTrace score={m.finalScore} />
          <div className="mt-3 flex gap-2">
            <a
              href={`/oportunidades/${m.slug}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#c9a84c] px-3 py-1.5 text-xs font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
            >
              Postular <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`/oportunidades/${m.slug}`}
              className="inline-flex items-center justify-center rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-cream"
            >
              Detalle
            </a>
          </div>
        </div>
      </div>
    </article>
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
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="space-y-6">
        <AnimatePresence mode="wait">
          {authLoading ? (
            <motion.div key="loading" className="flex items-center justify-center py-32">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c9a84c] border-t-transparent" />
            </motion.div>
          ) : !user ? (
            <motion.div key="empty"><EmptyState /></motion.div>
          ) : hasProfile === false ? (
            <motion.div key="incomplete"><IncompleteState score={30} /></motion.div>
          ) : loadingMatches ? (
            <motion.div key="loader"><LoaderState steps={loaderSteps} currentStep={currentLoaderStep} /></motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
                {/* Main column */}
                <div className="space-y-5">
                  {employabilityScore > 0 && <ScoreHero score={employabilityScore} />}
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
                      <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" />
                      <h3 className="font-display mb-2 text-lg text-cream">No encontramos matches aún</h3>
                      <p className="mx-auto mb-6 max-w-xs text-sm text-muted-foreground">
                        Completá tu perfil con más habilidades para ver oportunidades.
                      </p>
                      <a href="/mi-carrera/perfil" className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-4 text-sm text-cream transition hover:border-white/25">
                        Mejorar perfil
                      </a>
                    </div>
                  ) : (
                    <>
                      <OpportunityCard m={matches[0]} featured />
                      <div className="space-y-3">
                        {matches.slice(1, 5).map((m) => (
                          <OpportunityCard key={m.id} m={m} />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Sidebar */}
                <aside className="space-y-5">
                  {/* Visibility hint */}
                  <div className="glass-panel p-5">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#c9a84c]">
                      Del otro lado del ecosistema
                    </div>
                    <p className="font-display mt-2 text-base leading-snug text-cream">
                      Tu perfil optimizado te hace visible para empresas que buscan talento en CVitae.
                    </p>
                  </div>

                  {/* Missing skills */}
                  <div className="glass-panel p-5">
                    <h4 className="font-display text-lg text-cream">Habilidades faltantes</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">Para subir tu compatibilidad media</p>
                    <ul className="mt-4 space-y-2">
                      {missingSkills.length === 0 ? (
                        <li className="text-xs italic text-muted-foreground">Calculando…</li>
                      ) : missingSkills.map((s, i) => (
                        <li key={s} className="flex items-center gap-3 text-sm text-cream">
                          <span className="w-4 font-display italic text-xs text-[#c9a84c]">0{i + 1}</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Courses */}
                  <div className="glass-panel p-5">
                    <div className="flex items-center justify-between">
                      <h4 className="font-display text-lg text-cream">Cursos recomendados</h4>
                      <span className="rounded-full border border-[#c9a84c]/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#c9a84c]">IA</span>
                    </div>
                    {loadingCourses ? (
                      <div className="mt-4 space-y-2">
                        {[1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-md bg-cream/5" />)}
                      </div>
                    ) : courses.length > 0 ? (
                      <div className="mt-4 flex">
                        <Connector />
                        <div className="flex-1 space-y-4">
                          {courses.map((c, i) => (
                            <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="group block">
                              <div className="flex items-center gap-2">
                                <BookOpen className="h-3.5 w-3.5 text-[#c9a84c]" />
                                <p className="text-sm text-cream transition-colors group-hover:text-[#c9a84c]">{c.course}</p>
                              </div>
                              <p className="pl-[22px] text-[11px] text-muted-foreground">{c.platform} · {c.why}</p>
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs italic text-muted-foreground">Completá tu perfil para ver cursos personalizados.</p>
                    )}
                  </div>

                  {/* Alerts (soon) */}
                  <div className="glass-panel p-5 opacity-60">
                    <div className="flex items-center justify-between">
                      <h4 className="inline-flex items-center gap-2 font-display text-lg text-cream">
                        <Bell className="h-4 w-4 text-[#c9a84c]" /> Alertas proactivas
                      </h4>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Pronto</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Te avisaremos cuando aparezcan vacantes nuevas que encajen.</p>
                  </div>

                  {/* Premium */}
                  {!isSubscribed && (
                    <div className="rounded-2xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.04] p-5">
                      <Lock className="h-4 w-4 text-[#c9a84c]" />
                      <h4 className="font-display mt-2 text-xl text-cream">Llegaste a tu límite diario.</h4>
                      <p className="mt-1 text-xs text-muted-foreground">Con CVitae Premium ves todos tus matches sin pausa.</p>
                      <a
                        href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola! Quiero activar mi suscripción a CVitae Pro por USD 9/mes.')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c9a84c] py-2 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
                      >
                        Probar Premium
                      </a>
                    </div>
                  )}
                </aside>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  )
}
