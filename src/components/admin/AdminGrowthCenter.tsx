import { useState, useEffect, useCallback, Component, type ReactNode } from 'react'
import {
  RefreshCw, Zap, TrendingUp, Globe, FileText,
  Search, MessageSquare, ChevronDown, ChevronUp, Plus, X, Linkedin
} from 'lucide-react'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[GrowthCenter]', error) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "'JetBrains Mono', 'Courier New', monospace", color: '#fca5a5', border: '1px solid rgba(252,165,165,0.2)', margin: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Error en Growth Intelligence</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 12, fontSize: 11, color: '#fca5a5', cursor: 'pointer', background: 'none', border: '1px solid rgba(252,165,165,0.3)', padding: '4px 12px' }}>
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const MONO = "'JetBrains Mono', 'Courier New', monospace"

type PeriodMetrics = {
  sessions: number
  active_users: number
  pageviews: number
  new_users: number
  bounce_rate: number
  avg_session_duration: number
}

type LaunchEvent = {
  label: string
  time: string
}

type SignalType = 'green' | 'yellow' | 'red' | 'blue' | 'purple'
type ConfidenceLevel = 'high' | 'medium' | 'low'
type PriorityLevel = 'high' | 'medium' | 'low'
type EffortLevel = 'low' | 'medium' | 'high'

type GrowthResponse = {
  dataset: {
    date: string
    mode: string
    cvitae_db: {
      registered_users: number
      new_users_7d: number
      active_opportunities: number
      in_review_count: number
      blog_posts: { titulo: string; slug: string; fecha: string }[]
      b2b_companies: number
      top_sources: [string, number][]
    }
    ga4: {
      today: PeriodMetrics
      yesterday: PeriodMetrics
      last_7d: PeriodMetrics
      prev_7d: PeriodMetrics
      vs_prev_7d_pct: number | null
      top_countries: Array<{
        country: string
        sessions: number
        users: number
        new_users: number
        prev_sessions: number
        delta_pct: number | null
      }>
      traffic_sources: Array<{
        channel: string
        sessions: number
        users: number
        new_users: number
        prev_sessions: number
        delta_pct: number | null
      }>
      top_pages: Array<{
        path: string
        sessions: number
        users: number
        pageviews: number
        avg_duration_sec: number
      }>
      blog_pages: Array<{
        path: string
        sessions: number
        titulo?: string
        slug?: string
        gsc_impressions?: number
        gsc_clicks?: number
        gsc_ctr?: number
        gsc_position?: number
      }>
      daily_trend_last7: Array<{ date: string; sessions: number; users: number }>
    } | null
    search_console: {
      blocked?: boolean
      queries?: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>
      quick_wins?: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>
      top_pages_by_impressions?: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>
    } | null
    anomalies: Array<{ type: string; message: string; severity: 'high' | 'medium' | 'low'; data?: unknown }>
    launch_events: unknown[]
  }
  gemini: {
    executive_summary: string
    signals: Array<{
      type: SignalType
      title: string
      detail: string
      confidence: ConfidenceLevel
      sources: string[]
    }>
    recommendations: Array<{
      priority: PriorityLevel
      title: string
      evidence: string
      impact: string
      effort: EffortLevel
    }>
    seo_quick_wins: Array<{
      query: string
      position: number
      impressions: number
      ctr_pct: number
      recommendation: string
    }>
    blog_insights: Array<{
      identifier: string
      insight: string
      confidence: ConfidenceLevel
    }>
    linkedin_picks: Array<{ title: string; reason: string }>
    answer: string
  } | null
  meta: {
    ga4_available: boolean
    gsc_available: boolean
    gemini_configured: boolean
    gemini_available: boolean
    gemini_error_code: string | null
    gemini_error_message: string | null
    ai_requested: boolean
    mode: string
    generated_at: string
  }
}

type Props = {
  adminPassword: string
}

const CACHE_KEY = 'cvitae_growth_cache'
const CACHE_TS_KEY = 'cvitae_growth_cache_ts'
const LAUNCH_EVENTS_KEY = 'cvitae_launch_events'
const TTL_STANDARD = 30 * 60 * 1000
const TTL_LAUNCH = 5 * 60 * 1000

function fmtDelta(val: number | null, prev: number | null): string {
  if (val === null || prev === null) return '—'
  if (prev < 5) return `${prev} → ${val} (${val - prev >= 0 ? '+' : ''}${val - prev})`
  if (prev === 0) return '—'
  const pct = ((val - prev) / prev) * 100
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`
}

function deltaColor(val: number | null, prev: number | null): string {
  if (val === null || prev === null) return 'rgba(232,232,224,0.3)'
  if (prev === 0) return 'rgba(232,232,224,0.3)'
  const pct = ((val - prev) / prev) * 100
  return pct >= 0 ? '#86efac' : '#fca5a5'
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

function signalEmoji(type: SignalType): string {
  const map: Record<SignalType, string> = {
    green: '🟢',
    yellow: '🟡',
    red: '🔴',
    blue: '🔵',
    purple: '🟣',
  }
  return map[type] ?? '⚪'
}

function signalClasses(type: SignalType): { border: string; bg: string; text: string } {
  const map: Record<SignalType, { border: string; bg: string; text: string }> = {
    green: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.05]', text: 'text-emerald-400' },
    yellow: { border: 'border-amber-500/30', bg: 'bg-amber-500/[0.05]', text: 'text-amber-400' },
    red: { border: 'border-red-500/30', bg: 'bg-red-500/[0.05]', text: 'text-red-400' },
    blue: { border: 'border-blue-500/30', bg: 'bg-blue-500/[0.05]', text: 'text-blue-400' },
    purple: { border: 'border-purple-500/30', bg: 'bg-purple-500/[0.05]', text: 'text-purple-400' },
  }
  return map[type] ?? { border: 'border-white/[0.07]', bg: 'bg-white/[0.04]', text: 'text-[#e8e8e0]' }
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10,
        color: 'rgba(232,232,224,0.3)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 4,
      }}
    >
      {text}
    </div>
  )
}

function AdminGrowthCenter({ adminPassword }: Props) {
  const [data, setData] = useState<GrowthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [questionLoading, setQuestionLoading] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [answerError, setAnswerError] = useState<string | null>(null)
  const [launchMode, setLaunchMode] = useState(false)
  const [launchEvents, setLaunchEvents] = useState<LaunchEvent[]>([])
  const [newEventLabel, setNewEventLabel] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const fetchData = useCallback(
    async (mode: 'standard' | 'launch', events: LaunchEvent[], includeAi = false) => {
      if (includeAi) setAiLoading(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await fetch('/.netlify/functions/admin-analytics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminPassword}`,
          },
          body: JSON.stringify({ mode, launchEvents: events, includeAi }),
        })
        if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
        const json: GrowthResponse = await res.json()
        setData(json)
        const now = new Date().toISOString()
        setCachedAt(now)
        const isProviderError = !json.meta.gemini_available &&
          json.meta.gemini_error_code !== null &&
          json.meta.gemini_error_code !== 'no_key'
        if (isProviderError) {
          localStorage.removeItem(CACHE_KEY)
          localStorage.removeItem(CACHE_TS_KEY)
        } else {
          localStorage.setItem(CACHE_KEY, JSON.stringify(json))
          localStorage.setItem(CACHE_TS_KEY, now)
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Error desconocido')
      } finally {
        setLoading(false)
        setAiLoading(false)
      }
    },
    [adminPassword]
  )

  useEffect(() => {
    const savedEvents = localStorage.getItem(LAUNCH_EVENTS_KEY)
    const parsed: LaunchEvent[] = savedEvents ? JSON.parse(savedEvents) : []
    if (parsed.length > 0) setLaunchEvents(parsed)

    const cached = localStorage.getItem(CACHE_KEY)
    const ts = localStorage.getItem(CACHE_TS_KEY)
    if (cached && ts) {
      try {
        const parsedCache = JSON.parse(cached)
        if (parsedCache?.dataset !== undefined) {
          const age = Date.now() - new Date(ts).getTime()
          const ttl = launchMode ? TTL_LAUNCH : TTL_STANDARD
          if (age < ttl) {
            setData(parsedCache)
            setCachedAt(ts)
            return
          }
        } else {
          localStorage.removeItem(CACHE_KEY)
          localStorage.removeItem(CACHE_TS_KEY)
        }
      } catch {
        localStorage.removeItem(CACHE_KEY)
        localStorage.removeItem(CACHE_TS_KEY)
      }
    }
    // Metrics may load automatically; model analysis never does.
    fetchData(launchMode ? 'launch' : 'standard', parsed, false)
  }, [])

  const handleRefresh = () => {
    fetchData(launchMode ? 'launch' : 'standard', launchEvents, false)
  }

  const handleGenerateAi = () => {
    fetchData(launchMode ? 'launch' : 'standard', launchEvents, true)
  }

  const handleQuestion = async () => {
    if (!question.trim()) return
    setQuestionLoading(true)
    setAnswer(null)
    setAnswerError(null)
    try {
      const res = await fetch('/.netlify/functions/admin-analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminPassword}`,
        },
        body: JSON.stringify({
          mode: launchMode ? 'launch' : 'standard',
            question,
            launchEvents,
            includeAi: true,
        }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json: GrowthResponse = await res.json()
      if (!json.meta.gemini_available) {
        const code = json.meta.gemini_error_code
        const msg = json.meta.gemini_error_message
        if (code === 'no_key') {
          setAnswerError('Gemini no está configurado en el servidor (falta GEMINI_API_KEY)')
        } else if (code === 'http_error') {
          setAnswerError(`Gemini devolvió un error — ${msg ?? 'intenta de nuevo'}`)
        } else if (code === 'empty_response') {
          setAnswerError('Gemini no generó respuesta para esta consulta — intentá reformular la pregunta')
        } else if (code === 'invalid_json') {
          setAnswerError('Gemini respondió en formato inválido — intentá de nuevo')
        } else {
          setAnswerError(msg ?? 'Gemini no disponible')
        }
      } else {
        const ans = json.gemini?.answer ?? ''
        setAnswer(ans.trim() ? ans : 'Gemini no incluyó respuesta a la pregunta')
      }
    } catch (e: unknown) {
      setAnswerError(e instanceof Error ? e.message : 'Error desconocido al contactar el servidor')
    } finally {
      setQuestionLoading(false)
    }
  }

  const addLaunchEvent = () => {
    if (!newEventLabel.trim()) return
    const evt: LaunchEvent = { label: newEventLabel.trim(), time: new Date().toISOString() }
    const updated = [...launchEvents, evt]
    setLaunchEvents(updated)
    localStorage.setItem(LAUNCH_EVENTS_KEY, JSON.stringify(updated))
    setNewEventLabel('')
  }

  const removeLaunchEvent = (idx: number) => {
    const updated = launchEvents.filter((_, i) => i !== idx)
    setLaunchEvents(updated)
    localStorage.setItem(LAUNCH_EVENTS_KEY, JSON.stringify(updated))
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <RefreshCw className="animate-spin" size={32} style={{ color: '#c9a84c' }} />
        <div style={{ fontFamily: MONO, color: 'rgba(232,232,224,0.5)', fontSize: 14 }}>
          Cargando métricas sin IA...
        </div>
      </div>
    )
  }

  const db = data?.dataset?.cvitae_db
  const ga4 = data?.dataset?.ga4
  const gsc = data?.dataset?.search_console
  const gemini = data?.gemini
  const meta = data?.meta

  return (
    <div className="space-y-6 p-4">
      {/* 1. Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel text="admin / analytics" />
          <h1 style={{ fontFamily: MONO, fontSize: 22, color: '#e8e8e0', fontWeight: 700, margin: 0 }}>
            Growth Intelligence
          </h1>
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(232,232,224,0.5)', marginTop: 2 }}>
            Centro de inteligencia de crecimiento
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {cachedAt && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(232,232,224,0.3)' }}>
              Actualizado: {new Date(cachedAt).toLocaleTimeString('es-AR')}
            </span>
          )}
          <button
            onClick={() => setLaunchMode(!launchMode)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded border text-xs transition-all ${
              launchMode
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'border-white/[0.07] hover:border-white/20'
            }`}
            style={{ fontFamily: MONO, color: launchMode ? undefined : 'rgba(232,232,224,0.5)' }}
          >
            <Zap size={12} />
            LAUNCH MODE {launchMode ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={handleGenerateAi}
            disabled={aiLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-purple-400/20 hover:border-purple-400/40 text-xs transition-all disabled:opacity-50"
            style={{ fontFamily: MONO, color: '#c4b5fd' }}
          >
            <Zap size={12} />
            {aiLoading ? 'Generando…' : 'Generar análisis IA'}
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-white/[0.07] hover:border-[#c9a84c]/40 text-xs transition-all"
            style={{ fontFamily: MONO, color: '#c9a84c' }}
          >
            <RefreshCw size={12} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/[0.05] p-4">
          <div style={{ fontFamily: MONO, color: '#fca5a5', fontSize: 13 }}>Error: {error}</div>
        </div>
      )}

      {!data && !error && (
        <div
          className="text-center py-12"
          style={{ color: 'rgba(232,232,224,0.3)', fontFamily: MONO, fontSize: 13 }}
        >
          No hay datos. Hacé click en Actualizar.
        </div>
      )}

      {data && (
        <>
          {/* 2. Availability badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                { label: 'GA4', available: meta?.ga4_available },
                { label: 'Search Console', available: meta?.gsc_available },
                { label: meta?.gemini_configured ? 'Gemini configurado' : 'Gemini sin configurar', available: meta?.gemini_configured === true },
              ] as const
            ).map(({ label, available }) => (
              <span
                key={label}
                className={`px-2 py-0.5 rounded text-xs border ${
                  available
                    ? 'border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-400'
                    : 'border-red-500/20 bg-red-500/[0.03] text-red-400/70'
                }`}
                style={{ fontFamily: MONO }}
              >
                {available ? '✓' : '✗'} {label}
              </span>
            ))}
          </div>

          {/* GA4 not connected banner */}
          {!meta?.ga4_available && (
            <div className="rounded border border-amber-500/30 bg-amber-500/[0.05] px-4 py-3">
              <div style={{ fontFamily: MONO, color: '#fbbf24', fontSize: 12 }}>
                GA4 no conectado — mostrando solo métricas internas
              </div>
            </div>
          )}

          {/* 3. Qué está pasando */}
          <div className="rounded border border-white/[0.07] bg-white/[0.04] p-4">
            <SectionLabel text="resumen ejecutivo" />
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0', marginBottom: 8 }}>
              Qué está pasando
            </div>
            {gemini?.executive_summary ? (
              <div
                className="rounded border p-4"
                style={{
                  borderColor: 'rgba(201,168,76,0.3)',
                  background: 'rgba(201,168,76,0.03)',
                }}
              >
                <p style={{ color: '#e8e8e0', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                  {gemini.executive_summary}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Usuarios registrados', value: db?.registered_users },
                  { label: 'Nuevos (7d)', value: db?.new_users_7d },
                  { label: 'Oportunidades activas', value: db?.active_opportunities },
                  { label: 'En revisión', value: db?.in_review_count },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded border border-white/[0.07] bg-white/[0.04] p-3">
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: 'rgba(232,232,224,0.3)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{ fontFamily: MONO, fontSize: 22, color: '#c9a84c', fontWeight: 700 }}
                    >
                      {value ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Signals */}
          {gemini?.signals && gemini.signals.length > 0 && (
            <div>
              <SectionLabel text="señales" />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0', marginBottom: 8 }}>
                Lo importante hoy
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {gemini.signals.slice(0, 5).map((sig, i) => {
                  const cls = signalClasses(sig.type)
                  return (
                    <div key={i} className={`rounded border p-4 ${cls.border} ${cls.bg}`}>
                      <div className="flex items-start gap-2 mb-2">
                        <span style={{ fontSize: 14, lineHeight: 1 }}>{signalEmoji(sig.type)}</span>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 13,
                            color: '#e8e8e0',
                            fontWeight: 600,
                            lineHeight: 1.4,
                          }}
                        >
                          {sig.title}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'rgba(232,232,224,0.7)',
                          marginBottom: 8,
                          lineHeight: 1.5,
                        }}
                      >
                        {sig.detail}
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border ${cls.border} ${cls.text}`}
                          style={{ fontFamily: MONO }}
                        >
                          {sig.confidence.toUpperCase()}
                        </span>
                        {sig.sources.length > 0 && (
                          <div
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              color: 'rgba(232,232,224,0.3)',
                            }}
                          >
                            {sig.sources.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 5. Recommendations */}
          {gemini?.recommendations && gemini.recommendations.length > 0 && (
            <div>
              <SectionLabel text="acciones" />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0', marginBottom: 8 }}>
                Acciones recomendadas
              </div>
              <div className="space-y-3">
                {gemini.recommendations.slice(0, 3).map((rec, i) => {
                  const borderCls =
                    rec.priority === 'high'
                      ? 'border-red-500/30'
                      : rec.priority === 'medium'
                      ? 'border-amber-500/30'
                      : 'border-white/[0.07]'
                  const badgeCls =
                    rec.priority === 'high'
                      ? 'text-red-400 border-red-500/30 bg-red-500/[0.05]'
                      : rec.priority === 'medium'
                      ? 'text-amber-400 border-amber-500/30 bg-amber-500/[0.05]'
                      : 'border-white/[0.07] bg-white/[0.04]'
                  const effortColor =
                    rec.effort === 'low'
                      ? '#86efac'
                      : rec.effort === 'medium'
                      ? '#fbbf24'
                      : '#fca5a5'
                  return (
                    <div key={i} className={`rounded border bg-white/[0.04] p-4 ${borderCls}`}>
                      <div className="flex items-start gap-3 mb-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded border shrink-0 mt-0.5 ${badgeCls}`}
                          style={{
                            fontFamily: MONO,
                            color: rec.priority === 'low' ? 'rgba(232,232,224,0.5)' : undefined,
                          }}
                        >
                          {rec.priority === 'high' ? 'ALTA' : rec.priority === 'medium' ? 'MEDIA' : 'BAJA'}
                        </span>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 13,
                            color: '#e8e8e0',
                            fontWeight: 600,
                          }}
                        >
                          {rec.title}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'rgba(232,232,224,0.6)',
                          marginBottom: 6,
                          lineHeight: 1.5,
                        }}
                      >
                        {rec.evidence}
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div style={{ fontSize: 12, color: '#93c5fd' }}>Impacto: {rec.impact}</div>
                        <div style={{ fontFamily: MONO, fontSize: 11, color: effortColor }}>
                          ESFUERZO: {rec.effort === 'low' ? 'LOW' : rec.effort === 'medium' ? 'MED' : 'HIGH'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 6. Launch Monitor */}
          {launchMode && (
            <div
              className="rounded border p-4"
              style={{
                borderColor: 'rgba(201,168,76,0.3)',
                background: 'rgba(201,168,76,0.05)',
              }}
            >
              <SectionLabel text="launch monitor" />
              <div className="flex items-center gap-2 mb-4">
                <Zap size={16} style={{ color: '#c9a84c' }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0' }}>Launch Monitor</div>
              </div>
              {ga4 && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded border border-white/[0.07] bg-white/[0.04] p-3">
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: 'rgba(232,232,224,0.3)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      Tasa hoy
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 20, color: '#c9a84c', fontWeight: 700 }}>
                      {ga4.today.sessions}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(232,232,224,0.3)' }}>
                      sesiones
                    </div>
                  </div>
                  <div className="rounded border border-white/[0.07] bg-white/[0.04] p-3">
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: 'rgba(232,232,224,0.3)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      Baseline 7d
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 20, color: '#93c5fd', fontWeight: 700 }}>
                      {ga4.last_7d ? Math.round(ga4.last_7d.sessions / 7) : '—'}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(232,232,224,0.3)' }}>
                      promedio/día
                    </div>
                  </div>
                  <div className="rounded border border-white/[0.07] bg-white/[0.04] p-3">
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: 'rgba(232,232,224,0.3)',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      Multiplicador
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: '#86efac' }}>
                      {ga4.last_7d && ga4.today.sessions > 0
                        ? `${(ga4.today.sessions / Math.max(1, Math.round(ga4.last_7d.sessions / 7))).toFixed(2)}x`
                        : '—'}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(232,232,224,0.3)' }}>
                      vs baseline
                    </div>
                  </div>
                </div>
              )}
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: 'rgba(232,232,224,0.5)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                  }}
                >
                  Timeline de eventos
                </div>
                {launchEvents.length === 0 && (
                  <div style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(232,232,224,0.3)', marginBottom: 8 }}>
                    Sin eventos registrados
                  </div>
                )}
                <div className="space-y-2 mb-3">
                  {launchEvents.map((evt, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded border border-white/[0.07] bg-white/[0.04] px-3 py-2"
                    >
                      <div style={{ fontFamily: MONO, fontSize: 12, color: '#e8e8e0' }}>{evt.label}</div>
                      <div className="flex items-center gap-2">
                        <div style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(232,232,224,0.3)' }}>
                          {new Date(evt.time).toLocaleTimeString('es-AR')}
                        </div>
                        <button
                          onClick={() => removeLaunchEvent(i)}
                          className="transition-colors"
                          style={{ color: 'rgba(252,165,165,0.5)' }}
                          onMouseEnter={e => ((e.target as HTMLElement).style.color = '#fca5a5')}
                          onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(252,165,165,0.5)')}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newEventLabel}
                    onChange={e => setNewEventLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addLaunchEvent()}
                    placeholder="Nuevo evento..."
                    className="flex-1 rounded border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 focus:outline-none"
                    style={{ fontFamily: MONO, color: '#e8e8e0', fontSize: 12 }}
                  />
                  <button
                    onClick={addLaunchEvent}
                    className="flex items-center gap-1 px-3 py-1.5 rounded border border-[#c9a84c]/30 hover:border-[#c9a84c]/60 transition-colors"
                    style={{ fontFamily: MONO, color: '#c9a84c', fontSize: 12 }}
                  >
                    <Plus size={12} /> Agregar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 7. Acquisition Overview */}
          {(ga4 || db) && (
            <div>
              <SectionLabel text="adquisición" />
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} style={{ color: '#93c5fd' }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0' }}>Overview</div>
              </div>
              <div className="rounded border border-white/[0.07] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.07]">
                      {['Métrica', 'Hoy', 'Ayer', '7 días', 'vs prev 7d'].map(h => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left"
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            color: 'rgba(232,232,224,0.3)',
                            fontWeight: 400,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: 'Sesiones',
                        today: ga4?.today.sessions,
                        yday: ga4?.yesterday.sessions,
                        week: ga4?.last_7d.sessions,
                        prev: ga4?.prev_7d.sessions,
                        isRate: false,
                      },
                      {
                        label: 'Usuarios activos',
                        today: ga4?.today.active_users,
                        yday: ga4?.yesterday.active_users,
                        week: ga4?.last_7d.active_users,
                        prev: ga4?.prev_7d.active_users,
                        isRate: false,
                      },
                      {
                        label: 'Nuevos usuarios',
                        today: ga4?.today.new_users,
                        yday: ga4?.yesterday.new_users,
                        week: ga4?.last_7d.new_users,
                        prev: ga4?.prev_7d.new_users,
                        isRate: false,
                      },
                      {
                        label: 'Pageviews',
                        today: ga4?.today.pageviews,
                        yday: ga4?.yesterday.pageviews,
                        week: ga4?.last_7d.pageviews,
                        prev: ga4?.prev_7d.pageviews,
                        isRate: false,
                      },
                      {
                        label: 'Bounce rate',
                        today: ga4?.today.bounce_rate != null ? `${ga4.today.bounce_rate.toFixed(1)}%` : undefined,
                        yday:
                          ga4?.yesterday.bounce_rate != null
                            ? `${ga4.yesterday.bounce_rate.toFixed(1)}%`
                            : undefined,
                        week:
                          ga4?.last_7d.bounce_rate != null ? `${ga4.last_7d.bounce_rate.toFixed(1)}%` : undefined,
                        prev: undefined,
                        isRate: true,
                      },
                    ].map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                      >
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(232,232,224,0.7)' }}
                        >
                          {row.label}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 13, color: '#e8e8e0' }}
                        >
                          {row.today ?? '—'}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(232,232,224,0.7)' }}
                        >
                          {row.yday ?? '—'}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 13, color: '#e8e8e0' }}
                        >
                          {row.week ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          {!row.isRate && row.week != null && row.prev != null ? (
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 12,
                                color: deltaColor(Number(row.week), Number(row.prev)),
                              }}
                            >
                              {fmtDelta(Number(row.week), Number(row.prev))}
                            </span>
                          ) : (
                            <span
                              style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(232,232,224,0.3)' }}
                            >
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 8. Countries */}
          {ga4?.top_countries && ga4.top_countries.length > 0 && (
            <div>
              <SectionLabel text="geografía" />
              <div className="flex items-center gap-2 mb-3">
                <Globe size={16} style={{ color: '#93c5fd' }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0' }}>Países</div>
              </div>
              <div className="rounded border border-white/[0.07] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.07]">
                      {['País', 'Sesiones', 'Usuarios', 'Nuevos', 'vs semana anterior'].map(h => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left"
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            color: 'rgba(232,232,224,0.3)',
                            fontWeight: 400,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ga4.top_countries.slice(0, 8).map((c, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                      >
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 12, color: '#e8e8e0' }}
                        >
                          {c.country}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 13, color: '#e8e8e0' }}
                        >
                          {c.sessions}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(232,232,224,0.7)' }}
                        >
                          {c.users}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(232,232,224,0.7)' }}
                        >
                          {c.new_users}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 12,
                              color: deltaColor(c.sessions, c.prev_sessions),
                            }}
                          >
                            {fmtDelta(c.sessions, c.prev_sessions)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 9. Blog Intelligence */}
          {ga4?.blog_pages && ga4.blog_pages.length > 0 && (
            <div>
              <SectionLabel text="contenido" />
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} style={{ color: '#93c5fd' }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0' }}>
                  Rendimiento del blog
                </div>
              </div>
              <div className="space-y-3">
                {ga4.blog_pages.map((page, i) => {
                  const insight = gemini?.blog_insights?.find(
                    b =>
                      b.identifier === page.slug ||
                      b.identifier === page.path ||
                      (page.titulo && b.identifier === page.titulo)
                  )
                  return (
                    <div key={i} className="rounded border border-white/[0.07] bg-white/[0.04] p-4">
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 13,
                          color: '#c9a84c',
                          marginBottom: 6,
                          fontWeight: 600,
                        }}
                      >
                        {page.titulo || page.path}
                      </div>
                      <div className="flex flex-wrap gap-4 mb-2">
                        <div>
                          <div
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              color: 'rgba(232,232,224,0.3)',
                              textTransform: 'uppercase',
                            }}
                          >
                            Sesiones
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 16, color: '#e8e8e0' }}>
                            {page.sessions}
                          </div>
                        </div>
                        {page.gsc_impressions != null && (
                          <>
                            <div>
                              <div
                                style={{
                                  fontFamily: MONO,
                                  fontSize: 10,
                                  color: 'rgba(232,232,224,0.3)',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Impresiones
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: 16, color: '#e8e8e0' }}>
                                {page.gsc_impressions}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontFamily: MONO,
                                  fontSize: 10,
                                  color: 'rgba(232,232,224,0.3)',
                                  textTransform: 'uppercase',
                                }}
                              >
                                CTR
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: 16, color: '#e8e8e0' }}>
                                {page.gsc_ctr != null ? (page.gsc_ctr * 100).toFixed(1) + '%' : '—'}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontFamily: MONO,
                                  fontSize: 10,
                                  color: 'rgba(232,232,224,0.3)',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Posición
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: 16, color: '#e8e8e0' }}>
                                {page.gsc_position?.toFixed(1) ?? '—'}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      {insight && (
                        <div
                          className="rounded border px-3 py-2 mt-2"
                          style={{
                            borderColor: 'rgba(201,168,76,0.2)',
                            background: 'rgba(201,168,76,0.03)',
                          }}
                        >
                          <div
                            style={{ fontSize: 12, color: 'rgba(232,232,224,0.8)', lineHeight: 1.5 }}
                          >
                            {insight.insight}
                          </div>
                          <div
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              color: 'rgba(232,232,224,0.3)',
                              marginTop: 4,
                            }}
                          >
                            confianza: {insight.confidence}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 10. SEO Quick Wins */}
          <div>
            <SectionLabel text="seo" />
            <div className="flex items-center gap-2 mb-3">
              <Search size={16} style={{ color: '#93c5fd' }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0' }}>SEO — Quick Wins</div>
            </div>
            {gsc?.blocked || !meta?.gsc_available ? (
              <div className="rounded border border-white/[0.07] bg-white/[0.04] p-4">
                <div style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(232,232,224,0.5)' }}>
                  Agregá el service account en Search Console para ver este análisis
                </div>
              </div>
            ) : gsc?.quick_wins && gsc.quick_wins.length > 0 ? (
              <div className="space-y-2">
                {gsc.quick_wins.map((qw, i) => {
                  const geminiRec = gemini?.seo_quick_wins?.find(g => g.query === qw.query)
                  return (
                    <div key={i} className="rounded border border-white/[0.07] bg-white/[0.04] p-3">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div
                          style={{ fontFamily: MONO, fontSize: 13, color: '#e8e8e0', fontWeight: 600 }}
                        >
                          {qw.query}
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          {[
                            { label: 'Posición', value: qw.position.toFixed(1), color: '#c9a84c' },
                            { label: 'Impresiones', value: String(qw.impressions), color: '#e8e8e0' },
                            { label: 'CTR', value: (qw.ctr * 100).toFixed(1) + '%', color: '#e8e8e0' },
                          ].map(({ label, value, color }) => (
                            <div key={label}>
                              <div
                                style={{
                                  fontFamily: MONO,
                                  fontSize: 10,
                                  color: 'rgba(232,232,224,0.3)',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {label}
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: 14, color }}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {geminiRec && (
                        <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 6, lineHeight: 1.5 }}>
                          {geminiRec.recommendation}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded border border-white/[0.07] bg-white/[0.04] p-4">
                <div style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(232,232,224,0.3)' }}>
                  Sin quick wins disponibles
                </div>
              </div>
            )}
          </div>

          {/* 11. Traffic Sources */}
          {ga4?.traffic_sources && ga4.traffic_sources.length > 0 && (
            <div>
              <SectionLabel text="fuentes" />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0', marginBottom: 8 }}>
                Fuentes de tráfico
              </div>
              <div className="rounded border border-white/[0.07] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.07]">
                      {['Canal', 'Sesiones', 'Usuarios', 'Nuevos', 'vs semana anterior'].map(h => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left"
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            color: 'rgba(232,232,224,0.3)',
                            fontWeight: 400,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ga4.traffic_sources.map((src, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                      >
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 12, color: '#e8e8e0' }}
                        >
                          {src.channel}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 13, color: '#e8e8e0' }}
                        >
                          {src.sessions}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(232,232,224,0.7)' }}
                        >
                          {src.users}
                        </td>
                        <td
                          className="px-3 py-2"
                          style={{ fontFamily: MONO, fontSize: 13, color: 'rgba(232,232,224,0.7)' }}
                        >
                          {src.new_users}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 12,
                              color: deltaColor(src.sessions, src.prev_sessions),
                            }}
                          >
                            {fmtDelta(src.sessions, src.prev_sessions)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 12. LinkedIn Picks */}
          {gemini?.linkedin_picks && gemini.linkedin_picks.length > 0 && (
            <div>
              <SectionLabel text="linkedin" />
              <div className="flex items-center gap-2 mb-3">
                <Linkedin size={16} style={{ color: '#93c5fd' }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0' }}>
                  Para el bot de LinkedIn
                </div>
              </div>
              <div className="space-y-2">
                {gemini.linkedin_picks.map((pick, i) => (
                  <div
                    key={i}
                    className="rounded border border-blue-500/20 bg-blue-500/[0.03] p-4"
                  >
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 13,
                        color: '#93c5fd',
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {pick.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(232,232,224,0.7)', lineHeight: 1.5 }}>
                      {pick.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 13. Ask CVitae */}
          <div>
            <SectionLabel text="inteligencia" />
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={16} style={{ color: '#c9a84c' }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e8e8e0' }}>
                Preguntarle a CVitae
              </div>
            </div>
            <div className="rounded border border-white/[0.07] bg-white/[0.04] p-4">
              <div className="flex gap-2 mb-3">
                <input
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) handleQuestion()
                  }}
                  placeholder="Hacé una pregunta sobre los datos..."
                  className="flex-1 rounded border border-white/[0.07] bg-white/[0.04] px-3 py-2 focus:outline-none"
                  style={{
                    fontFamily: MONO,
                    color: '#e8e8e0',
                    fontSize: 13,
                  }}
                />
                <button
                  onClick={handleQuestion}
                  disabled={questionLoading || !question.trim()}
                  className="px-4 py-2 rounded border border-[#c9a84c]/30 hover:border-[#c9a84c]/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  style={{ fontFamily: MONO, color: '#c9a84c', fontSize: 13 }}
                >
                  {questionLoading ? '...' : 'Preguntar'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  '¿Qué pasó hoy?',
                  '¿Qué artículo está funcionando?',
                  '¿De qué países entró gente?',
                  '¿Qué búsqueda está cerca de primera página?',
                  '¿Qué debo hacer primero?',
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => setQuestion(s)}
                    className="px-2 py-1 rounded border border-white/[0.07] hover:border-white/20 transition-colors"
                    style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(232,232,224,0.5)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {questionLoading && (
                <div style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(232,232,224,0.5)' }}>
                  Consultando datos reales...
                </div>
              )}
              {answerError && (
                <div
                  className="rounded border p-4 mt-2"
                  style={{ borderColor: 'rgba(252,165,165,0.3)', background: 'rgba(252,165,165,0.04)' }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>
                    {answerError}
                  </div>
                  <button
                    onClick={handleQuestion}
                    style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(252,165,165,0.7)', cursor: 'pointer', background: 'none', border: '1px solid rgba(252,165,165,0.25)', padding: '3px 10px' }}
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {answer && (
                <div
                  className="rounded border p-4 mt-2"
                  style={{
                    borderColor: 'rgba(201,168,76,0.3)',
                    background: 'rgba(201,168,76,0.03)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: '#e8e8e0',
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {answer}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 14. Raw metrics */}
          <div>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-2 px-3 py-2 rounded border border-white/[0.07] hover:border-white/20 transition-colors w-full"
              style={{ fontFamily: MONO, color: 'rgba(232,232,224,0.5)', fontSize: 12 }}
            >
              {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Ver datos crudos
            </button>
            {showRaw && (
              <div className="mt-2 rounded border border-white/[0.07] bg-white/[0.02] p-4 overflow-auto max-h-96">
                <pre
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: 'rgba(232,232,224,0.5)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    margin: 0,
                  }}
                >
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function AdminGrowthCenterSafe(props: Props) {
  return (
    <ErrorBoundary>
      <AdminGrowthCenter {...props} />
    </ErrorBoundary>
  )
}
