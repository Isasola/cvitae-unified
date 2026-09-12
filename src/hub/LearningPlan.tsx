import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  ArrowRight, BookOpen, Check, CheckCircle2, Circle, ExternalLink, GraduationCap,
  HelpCircle, History, Loader2, LockKeyhole, PlayCircle, RefreshCw, Route, Save, ShieldCheck, X,
} from 'lucide-react'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'

const MATCH_BATCH_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/match-batch'

type Recommendation = {
  id: string
  skill: string
  priority: number
  status: 'suggested' | 'in_progress' | 'completed' | 'dismissed'
  title: string
  platform: string
  providerKey: string
  url: string
  learningFocus: string
  why: string
  level: string
  language: string
  sources: Array<{ id: string; slug: string; title: string; organization?: string | null }>
  fallback: boolean
  completedAt?: string | null
}

type PlanData = {
  recommendations: Recommendation[]
  stats: { total: number; suggested: number; inProgress: number; completed: number }
  notice?: string
  intent?: CareerIntent
}

type CareerIntent = {
  career_route: string
  desired_role_1y: string
  career_interests: string[]
  liked_opportunity_ids: string[]
}

const INTENT_ROUTES = [
  ['empleo-local', 'Quiero trabajar en Paraguay'],
  ['remoto', 'Quiero un empleo remoto'],
  ['freelance', 'Quiero trabajar freelance'],
  ['beca-posgrado', 'Quiero una beca o posgrado'],
  ['organismos', 'Quiero entrar a un organismo internacional'],
  ['emprendimiento', 'Quiero emprender'],
  ['cambio-area', 'Quiero cambiar de área'],
] as const

const PLAN_CACHE_VERSION = 1
const PLAN_CACHE_TTL = 15 * 60 * 1000

function planCacheKey(userId: string) {
  return `cvitae:learning-plan:v${PLAN_CACHE_VERSION}:${userId}`
}

function readPlanCache(userId: string): PlanData | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(planCacheKey(userId)) || 'null')
    if (!cached || cached.version !== PLAN_CACHE_VERSION || Date.now() - cached.storedAt > PLAN_CACHE_TTL) return null
    return cached.data as PlanData
  } catch {
    return null
  }
}

function writePlanCache(userId: string, data: PlanData) {
  try {
    sessionStorage.setItem(planCacheKey(userId), JSON.stringify({ version: PLAN_CACHE_VERSION, storedAt: Date.now(), data }))
  } catch {
    // La caché acelera la experiencia, pero el plan funciona sin storage local.
  }
}

const STATUS = {
  suggested: { label: 'Sugerida', icon: Circle, className: 'text-white/40 border-white/10' },
  in_progress: { label: 'En curso', icon: PlayCircle, className: 'text-amber-100 border-amber-300/25' },
  completed: { label: 'Completada', icon: CheckCircle2, className: 'text-emerald-200 border-emerald-400/25' },
  dismissed: { label: 'Descartada', icon: X, className: 'text-white/30 border-white/8' },
}

export default function LearningPlan() {
  const [user, setUser] = useState<any>(undefined)
  const [data, setData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [changing, setChanging] = useState('')
  const [error, setError] = useState('')
  const [savingIntent, setSavingIntent] = useState(false)
  const [intent, setIntent] = useState<CareerIntent>({ career_route: '', desired_role_1y: '', career_interests: [], liked_opportunity_ids: [] })
  const GUIDE_KEY = 'cvitae_guide_b2c_learning_plan_v1_completed'
  const [guideOpen, setGuideOpen] = useState(() => localStorage.getItem(GUIDE_KEY) !== 'true')

  const current = useMemo(() => (data?.recommendations || []).filter((item) => item.status !== 'dismissed'), [data])
  const completed = current.filter((item) => item.status === 'completed').length
  const progress = current.length ? Math.round((completed / current.length) * 100) : 0
  const explorationLinks = useMemo(() => {
    const links: Array<{ title: string; detail: string; href: string; external?: boolean }> = []
    const intentText = `${intent.desired_role_1y} ${intent.career_interests.join(' ')}`.toLocaleLowerCase('es')
    if (intent.career_route === 'beca-posgrado') links.push({ title: 'Becas verificadas para LATAM', detail: 'Convocatorias y programas con fuente y vigencia revisadas.', href: '/oportunidades/latam' })
    if (intent.career_route === 'freelance') links.push({ title: 'Proyectos y contratos freelance', detail: 'Explorá oportunidades remotas que mencionan proyectos o contratación independiente.', href: '/trabajos?q=freelance' })
    if (/\b(aws|amazon web services|cloud|nube)\b/.test(intentText)) links.push({ title: 'AWS Skill Builder', detail: 'Rutas y cursos oficiales de AWS; verificá precio e idioma en el proveedor.', href: 'https://skillbuilder.aws/', external: true })
    return links
  }, [intent])

  useEffect(() => { auth.getUser().then((next) => setUser(next || null)) }, [])
  useEffect(() => {
    if (user) {
      const cached = readPlanCache(user.id)
      if (cached) {
        setData(cached)
        if (cached.intent) setIntent(cached.intent)
        setLoading(false)
      }
      loadOverview(!cached)
    }
    else if (user === null) setLoading(false)
  }, [user])
  useEffect(() => {
    if (user?.id && data) writePlanCache(user.id, data)
  }, [user?.id, data])

  const call = async (body: Record<string, any>) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Tu sesión expiró. Volvé a ingresar.')
    const response = await fetch('/.netlify/functions/gemini-courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'No pudimos actualizar tu plan')
    return payload as PlanData
  }

  const loadOverview = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const next = await call({ action: 'overview' })
      setData(next)
      if (next.intent) setIntent(next.intent)
    }
    catch (caught: any) { setError(caught?.message || 'No pudimos cargar tu plan.') }
    finally { if (showLoader) setLoading(false) }
  }

  const refreshPlan = async () => {
    if (!intent.career_route && !intent.desired_role_1y.trim()) {
      setError('Primero contanos qué querés conseguir o dónde querés estar en un año.')
      return
    }
    setRefreshing(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Tu sesión expiró. Volvé a ingresar.')
      const savedIntent = await persistIntent(session.access_token)
      setIntent(savedIntent)
      const matchResponse = await fetch(MATCH_BATCH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` } })
      const matchData = await matchResponse.json()
      if (!matchResponse.ok) throw new Error(matchData.error || 'No pudimos recalcular tus brechas')
      const likedIds = new Set(savedIntent.liked_opportunity_ids)
      const likedMatches = (matchData.matches || []).filter((item: any) => likedIds.has(String(item.id)))
      const missingSkills = [...new Set([
        ...likedMatches.flatMap((item: any) => item.missingSkills || []),
        ...(matchData.missingSkills || []),
      ].map((skill) => String(skill).trim()).filter(Boolean))].slice(0, 6)
      const opportunityIds = [...new Set([
        ...savedIntent.liked_opportunity_ids,
        ...(matchData.matches || []).map((item: any) => String(item.id)),
      ])].slice(0, 20)
      const next = await call({
        action: 'recommend',
        missingSkills,
        opportunityIds,
      })
      setData(next)
      if (next.intent) setIntent(next.intent)
    } catch (caught: any) {
      setError(caught?.message || 'No pudimos actualizar tu plan.')
    } finally {
      setRefreshing(false)
    }
  }

  const persistIntent = async (accessToken: string): Promise<CareerIntent> => {
    const normalizedIntent = {
      ...intent,
      desired_role_1y: intent.desired_role_1y.trim(),
      career_interests: intent.career_interests.map(item => item.trim()).filter(Boolean).slice(0, 12),
    }
    const response = await fetch('/.netlify/functions/b2c-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'save_intent', intent: normalizedIntent }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || 'No pudimos guardar tu norte profesional')
    const profileData = payload.profile?.profile_data || {}
    return {
      ...normalizedIntent,
      career_route: profileData.career_route || normalizedIntent.career_route,
      desired_role_1y: profileData.desired_role_1y || normalizedIntent.desired_role_1y,
      career_interests: profileData.career_interests || normalizedIntent.career_interests,
      liked_opportunity_ids: profileData.liked_opportunity_ids || normalizedIntent.liked_opportunity_ids,
    }
  }

  const saveIntent = async () => {
    setSavingIntent(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Tu sesión expiró. Volvé a ingresar.')
      const savedIntent = await persistIntent(session.access_token)
      setIntent(savedIntent)
      setData(current => current ? { ...current, intent: savedIntent } : current)
    } catch (caught: any) {
      setError(caught?.message || 'No pudimos guardar tu norte profesional.')
    } finally {
      setSavingIntent(false)
    }
  }

  const changeStatus = async (recommendationId: string, status: string) => {
    setChanging(recommendationId)
    setError('')
    try { setData(await call({ action: 'status', recommendationId, status })) }
    catch (caught: any) { setError(caught?.message || 'No pudimos guardar el avance.') }
    finally { setChanging('') }
  }

  if (loading || user === undefined) return <DashboardLayout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#c9a84c]" /></div></DashboardLayout>
  if (!user) return <DashboardLayout><div className="mx-auto max-w-xl rounded-3xl border border-white/8 bg-white/[0.02] p-8 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-[#c9a84c]" /><h1 className="font-display mt-4 text-3xl text-cream">Tu plan es privado</h1><p className="mt-3 text-sm text-white/45">Ingresá a Mi Carrera para relacionar oportunidades con un plan de aprendizaje.</p><a href="/mi-carrera" className="mt-6 inline-flex rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-black">Ingresar</a></div></DashboardLayout>

  return (
    <DashboardLayout>
      <Helmet><title>Plan de aprendizaje | CVitae</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div><p className="text-[10px] uppercase tracking-[0.24em] text-[#c9a84c]">Brechas convertidas en acciones</p><h1 className="font-display mt-3 text-4xl leading-tight text-cream sm:text-5xl">Tu próxima habilidad.<br /><em className="font-normal text-white">Con una razón para aprenderla.</em></h1><p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/45">El plan usa brechas observadas en oportunidades verificadas. Los enlaces llevan a catálogos oficiales o búsquedas controladas; revisá precio, idioma y condiciones en el proveedor.</p></div>
          <button type="button" onClick={refreshPlan} disabled={refreshing} className="inline-flex h-11 self-start items-center gap-2 rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-black disabled:opacity-40">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar con mis matches</button>
        </header>

        <section className="rounded-3xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.025] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a84c]">Tu norte profesional</p>
              <h2 className="font-display mt-2 text-3xl text-cream">Decinos a dónde querés llegar.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">El CV muestra tu punto de partida. Estas respuestas y las oportunidades que marques con el corazón le dicen a Gemini hacia dónde construir el plan.</p>
            </div>
            {intent.liked_opportunity_ids.length > 0 && <span className="shrink-0 rounded-full border border-rose-300/20 bg-rose-300/[0.06] px-3 py-1.5 text-xs text-rose-100">{intent.liked_opportunity_ids.length} de tu interés</span>}
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {INTENT_ROUTES.map(([value, label]) => <button key={value} type="button" onClick={() => setIntent(current => ({ ...current, career_route: value }))} className={`rounded-xl border px-4 py-3 text-left text-sm transition ${intent.career_route === value ? 'border-[#c9a84c]/55 bg-[#c9a84c]/10 text-[#e6cf8a]' : 'border-white/8 bg-black/15 text-white/50 hover:border-white/15 hover:text-white/75'}`}>{label}</button>)}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="text-sm text-white/65">¿Qué te gusta hacer?
              <input value={intent.career_interests.join(', ')} onChange={event => setIntent(current => ({ ...current, career_interests: event.target.value.split(',').map(item => item.trimStart()) }))} placeholder="Ej: analizar datos, escribir, ayudar a clientes" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-cream outline-none focus:border-[#c9a84c]/45" />
              <span className="mt-1.5 block text-[11px] text-white/30">Separá los intereses con comas. No se guardan como skills del CV.</span>
            </label>
            <label className="text-sm text-white/65">En un año quiero ser o estar...
              <textarea value={intent.desired_role_1y} onChange={event => setIntent(current => ({ ...current, desired_role_1y: event.target.value }))} maxLength={300} rows={3} placeholder="Ej: trabajando como analista de datos junior en una empresa remota" className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-cream outline-none focus:border-[#c9a84c]/45" />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={saveIntent} disabled={savingIntent || (!intent.career_route && !intent.desired_role_1y.trim())} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-black disabled:opacity-40">{savingIntent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar mi norte</button>
            <p className="text-xs text-white/30">Después, actualizá el plan para recalcular el puente desde tu experiencia actual.</p>
          </div>
        </section>

        {explorationLinks.length > 0 && <section className="grid gap-3 md:grid-cols-2" aria-label="Recursos relacionados con tu meta">
          {explorationLinks.map(link => <a key={link.href} href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener noreferrer' : undefined} className="group rounded-2xl border border-white/8 bg-white/[0.018] p-5 transition hover:border-[#c9a84c]/25">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-cream">{link.title}</p><p className="mt-1.5 text-xs leading-relaxed text-white/40">{link.detail}</p></div><ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-white/25 transition group-hover:text-[#c9a84c]" /></div>
          </a>)}
        </section>}

        {error && <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-100">{error}</div>}
        {data?.notice && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100">{data.notice}</div>}

        {current.length ? <>
          <section className="grid overflow-hidden rounded-3xl border border-white/8 bg-white/[0.018] lg:grid-cols-[240px_1fr]">
            <div className="border-b border-white/8 p-7 lg:border-b-0 lg:border-r"><div className="relative mx-auto flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(#c9a84c ${progress}%, rgba(255,255,255,.07) 0)` }}><div className="flex h-[122px] w-[122px] flex-col items-center justify-center rounded-full bg-[#0a0a0a]"><span className="font-display text-4xl text-cream">{progress}%</span><span className="mt-1 text-[9px] uppercase tracking-wider text-white/30">recorrido</span></div></div><p className="mt-5 text-center text-sm text-cream">{completed} de {current.length} completadas</p></div>
            <div className="p-7 sm:p-9"><div className="flex items-center gap-3"><Route className="h-5 w-5 text-[#c9a84c]" /><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">Mapa actual</p><h2 className="font-display text-3xl text-cream">Una ruta, no una lista de enlaces</h2></div></div><div className="mt-7 grid gap-3 sm:grid-cols-3"><Stat value={data?.stats.suggested || 0} label="Por empezar" /><Stat value={data?.stats.inProgress || 0} label="En curso" /><Stat value={data?.stats.completed || 0} label="Completadas" /></div></div>
          </section>

          <section className="relative space-y-4 before:absolute before:bottom-8 before:left-[27px] before:top-8 before:w-px before:bg-gradient-to-b before:from-[#c9a84c]/60 before:via-white/10 before:to-emerald-400/40 sm:before:left-[39px]">
            {[...current].sort((a, b) => a.priority - b.priority).map((item, index) => {
              const state = STATUS[item.status]
              const StatusIcon = state.icon
              return <article key={item.id} className={`relative grid gap-5 rounded-3xl border bg-[#080808] p-5 sm:grid-cols-[52px_1fr_auto] sm:p-7 ${item.status === 'completed' ? 'border-emerald-400/20' : item.status === 'in_progress' ? 'border-[#c9a84c]/25' : 'border-white/8'}`}>
                <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[#c9a84c]/25 bg-[#11100c] font-display text-sm text-[#c9a84c]">{String(index + 1).padStart(2, '0')}</div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-wider ${state.className}`}><StatusIcon className="h-3 w-3" />{state.label}</span><span className="rounded-full border border-white/8 px-2.5 py-1 text-[9px] uppercase tracking-wider text-white/30">{item.level}</span><span className="rounded-full border border-white/8 px-2.5 py-1 text-[9px] uppercase tracking-wider text-white/30">{item.platform}</span></div><h3 className="font-display mt-4 text-2xl text-cream">{item.title}</h3><p className="mt-2 text-sm leading-relaxed text-white/55">{item.learningFocus}</p><div className="mt-5 border-l border-[#c9a84c]/35 pl-4"><p className="text-xs leading-relaxed text-white/40">{item.why}</p><p className="mt-2 text-[10px] text-white/25">Respaldada por {item.sources.length} {item.sources.length === 1 ? 'oportunidad' : 'oportunidades'} activas.</p></div>{item.sources.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{item.sources.slice(0, 3).map((source) => <a key={source.id} href={`/oportunidades/${source.slug}`} className="rounded-full border border-white/8 px-3 py-1.5 text-[10px] text-white/40 transition hover:text-[#c9a84c]">{source.title}</a>)}</div>}</div>
                <div className="flex flex-row flex-wrap items-start gap-2 sm:w-44 sm:flex-col"><a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => item.status === 'suggested' && changeStatus(item.id, 'in_progress')} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-4 text-xs font-medium text-black sm:w-full">Abrir catálogo <ExternalLink className="h-3.5 w-3.5" /></a>{item.status !== 'completed' ? <button type="button" onClick={() => changeStatus(item.id, 'completed')} disabled={changing === item.id} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/10 px-4 text-xs text-white/55 disabled:opacity-40 sm:w-full">{changing === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Marcar completa</button> : <button type="button" onClick={() => changeStatus(item.id, 'in_progress')} disabled={changing === item.id} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-emerald-400/20 px-4 text-xs text-emerald-200 sm:w-full"><History className="h-3.5 w-3.5" /> Reabrir</button>}<button type="button" onClick={() => changeStatus(item.id, 'dismissed')} disabled={changing === item.id} className="text-[10px] text-white/25 transition hover:text-white/50 sm:w-full">No me sirve</button></div>
              </article>
            })}
          </section>
        </> : <section className="rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center"><GraduationCap className="mx-auto h-10 w-10 text-white/20" /><h2 className="font-display mt-5 text-3xl text-cream">Todavía no hay una ruta respaldada</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/40">Actualizá tus matches. Solo crearemos recomendaciones cuando una habilidad ausente aparezca realmente en oportunidades verificadas.</p><button type="button" onClick={refreshPlan} disabled={refreshing} className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-black">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Crear mi plan</button></section>}

        <section className="flex items-start gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.035] p-5"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><div><h2 className="text-sm font-medium text-emerald-100">Enlaces controlados</h2><p className="mt-1 text-xs leading-relaxed text-white/40">Gemini selecciona el enfoque y el proveedor. CVitae construye el enlace desde una lista cerrada de dominios oficiales; el modelo nunca puede insertar una URL.</p></div></section>
      </div>

      <button type="button" onClick={() => setGuideOpen(true)} className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0b0b0b]/95 px-4 py-2.5 text-xs text-white/55 shadow-xl backdrop-blur"><HelpCircle className="h-4 w-4 text-[#c9a84c]" /> Guía</button>
      {guideOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"><div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0b] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">Cómo leer el plan</p><h2 className="font-display mt-2 text-3xl text-cream">Aprender con contexto</h2></div><button type="button" onClick={() => { localStorage.setItem(GUIDE_KEY, 'true'); setGuideOpen(false) }} className="rounded-full border border-white/10 p-2 text-white/40"><X className="h-4 w-4" /></button></div><div className="mt-7 space-y-5">{[['Brecha', 'Debe aparecer en una oportunidad verificada y no figurar ya entre tus habilidades.'], ['Proveedor', 'Gemini elige entre proveedores permitidos; CVitae genera el enlace.'], ['Avance', 'Podés empezar, completar, reabrir o descartar cada paso sin modificar tu perfil.'], ['Resultado', 'Completá el curso y luego agregá la habilidad al perfil solo si realmente la adquiriste.']].map(([title, detail]) => <div key={title} className="flex gap-4"><BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a84c]" /><div><h3 className="text-sm text-cream">{title}</h3><p className="mt-1 text-xs leading-relaxed text-white/40">{detail}</p></div></div>)}</div></div></div>}
    </DashboardLayout>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div className="rounded-2xl border border-white/8 bg-black/20 p-4"><span className="font-display text-3xl text-cream">{value}</span><span className="mt-1 block text-[10px] uppercase tracking-wider text-white/30">{label}</span></div>
}
