import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, X, Eye, EyeOff, Edit, Trash2, Save, Plus } from 'lucide-react'

interface ContentItem {
  id?: string
  titulo: string
  slug: string
  cuerpo: string
  categoria: string
  imagen_url: string
  fecha_vencimiento: string
  tipo: 'blog' | 'oportunidad' | 'beca' | 'foro'
  ubicacion: string
  is_active: boolean
}

interface Subscriber {
  id: string
  email: string
  full_name: string
  professional_title: string
  skills: string[]
  seniority: string
  is_subscribed: boolean
  created_at: string
  user_id: string
  is_test?: boolean
  user_type?: string
}

interface SkillCandidate {
  id: number
  term: string
  normalized: string
  mention_count: number
  first_seen: string
  last_seen: string
  status: 'pending' | 'approved' | 'rejected'
}

const CATEGORIES = ['Tecnología', 'Administración', 'Ventas', 'Marketing', 'Salud', 'Educación', 'Logística', 'Otros']

const MONO = "'JetBrains Mono', 'Courier New', monospace"

// Input style shared across forms
const inputCls = "w-full px-4 py-3 bg-transparent border border-white/[0.07] text-[#e8e8e0] text-sm placeholder-white/20 focus:outline-none focus:border-[#c9a84c]/50 transition-colors"

function SignalLines() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      viewBox="0 0 800 400"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sl1" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#c9a84c" stopOpacity="0" />
          <stop offset="40%" stopColor="#c9a84c" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sl2" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#c9a84c" stopOpacity="0" />
          <stop offset="60%" stopColor="#c9a84c" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
        </linearGradient>
        <filter id="sglow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Line 1 — fast, brighter — y≈25% of 400 = 100 */}
      <path
        d="M -50 100 C 120 80, 240 140, 400 112 S 600 72, 880 88"
        fill="none"
        stroke="url(#sl1)"
        strokeWidth="1"
        filter="url(#sglow)"
      >
        <animate attributeName="opacity" values="0.6;1;0.6" dur="3.2s" repeatCount="indefinite" />
        <animate
          attributeName="d"
          values="M -50 100 C 120 80, 240 140, 400 112 S 600 72, 880 88;M -50 112 C 120 96, 240 120, 400 128 S 600 88, 880 100;M -50 100 C 120 80, 240 140, 400 112 S 600 72, 880 88"
          dur="8s"
          repeatCount="indefinite"
        />
      </path>
      {/* Line 2 — slower, dimmer — y≈55% of 400 = 220 */}
      <path
        d="M -50 220 C 160 200, 320 248, 480 220 S 680 192, 880 208"
        fill="none"
        stroke="url(#sl2)"
        strokeWidth="1"
      >
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="5.5s" repeatCount="indefinite" />
      </path>
      {/* Line 3 — very slow, near-invisible — y≈75% of 400 = 300 */}
      <path
        d="M -50 300 C 200 288, 400 320, 600 296 S 760 280, 880 292"
        fill="none"
        stroke="#c9a84c"
        strokeWidth="0.5"
        strokeOpacity="0.05"
      >
        <animate attributeName="opacity" values="0.04;0.12;0.04" dur="9s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const adminPasswordRef = useRef('')
  const [activeTab, setActiveTab] = useState<'brief' | 'usuarios' | 'beta' | 'contenido' | 'tokens' | 'skills'>('brief')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [items, setItems] = useState<ContentItem[]>([])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [skillCandidates, setSkillCandidates] = useState<SkillCandidate[]>([])
  const [metrics, setMetrics] = useState({ usuarios: 0, matches: 0, oportunidades: 0, suscriptores: 0 })

  const [formData, setFormData] = useState<ContentItem>({
    titulo: '', slug: '', cuerpo: '', categoria: 'Tecnología', imagen_url: '',
    fecha_vencimiento: new Date().toISOString().split('T')[0],
    tipo: 'blog', ubicacion: 'Asunción, Paraguay', is_active: true
  })
  const [isEditing, setIsEditing] = useState(false)

  // Tokens state
  const [tokens, setTokens] = useState<any[]>([])
  const [tokenEmail, setTokenEmail] = useState('')
  const [tokenBalance, setTokenBalance] = useState(10)
  const [tokenPlan, setTokenPlan] = useState('starter')

  // Beta / Leads state
  const [betaList, setBetaList] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])

  // Beta suggestion box state
  const [suggestionMsg, setSuggestionMsg] = useState('')
  const [suggestionType, setSuggestionType] = useState<'feedback' | 'bug' | 'idea'>('feedback')
  const [sendingSuggestion, setSendingSuggestion] = useState(false)

  // Scraper report state
  const [scraperReport, setScraperReport] = useState<{
    totalOpportunities: number
    totalContentHub: number
    bySource: { source: string; count: number; lastSeen: string }[]
    newLast24h: number
    newLast7d: number
  } | null>(null)

  const NAV_ITEMS = [
    { id: 'brief', label: 'Brief del día', dotColor: 'bg-emerald-400', badge: null },
    { id: 'usuarios', label: 'Usuarios', dotColor: 'bg-[#c9a84c]', badge: metrics.usuarios.toString() },
    { id: 'beta', label: 'Beta / Leads', dotColor: 'bg-sky-400', badge: null },
    { id: 'contenido', label: 'Contenido', dotColor: 'bg-white/30', badge: null },
    { id: 'tokens', label: 'Tokens B2B', dotColor: 'bg-white/30', badge: null },
    { id: 'skills', label: 'Skills IA', dotColor: 'bg-amber-400', badge: null },
  ]

  useEffect(() => {
    if (isAuthenticated) {
      loadContent()
      loadSubscribers()
      loadSkillCandidates()
      loadMetrics()
      loadTokens()
      loadBeta()
      loadScraperReport()
    }
  }, [isAuthenticated, activeTab])

  const loadContent = async () => {
    const { data } = await supabase.from('content_hub').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  const loadSubscribers = async () => {
    try {
      const json = await adminFetch('list_users')
      setSubscribers((json.data ?? []) as Subscriber[])
    } catch (err: any) {
      setNotification({ type: 'error', message: `Error cargando usuarios: ${err.message}` })
    }
  }

  const loadSkillCandidates = async () => {
    const { data } = await supabase.from('skill_candidates').select('*').order('mention_count', { ascending: false })
    if (data) setSkillCandidates(data as SkillCandidate[])
  }

  const loadMetrics = async () => {
    try {
      const json = await adminFetch('metrics')
      setMetrics({ usuarios: json.usuarios, matches: 0, oportunidades: json.oportunidades, suscriptores: json.suscriptores })
    } catch {
      // metrics failure is non-fatal, keep defaults
    }
  }

  const loadTokens = async () => {
    const { data } = await supabase.from('recruiter_tokens').select('*').order('created_at', { ascending: false })
    if (data) setTokens(data)
  }

  const loadBeta = async () => {
    try {
      const json = await adminFetch('list_beta')
      setBetaList(json.betaList ?? [])
      setLeads(json.leads ?? [])
    } catch {
      // beta load failure non-fatal
    }
  }

  const loadScraperReport = async () => {
    try {
      const json = await adminFetch('scraper_report')
      setScraperReport(json)
    } catch {
      // non-fatal
    }
  }

  const adminFetch = async (action: string, payload?: any) => {
    let res: Response
    try {
      res = await fetch('/.netlify/functions/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordRef.current, action, payload: payload ?? null }),
      })
    } catch {
      throw new Error('Sin conexión con el servidor')
    }
    let json: any
    try {
      json = await res.json()
    } catch {
      throw new Error(`Error del servidor (${res.status})`)
    }
    if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
    return json
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await fetch('/.netlify/functions/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await response.json()
      if (response.ok && data.authenticated) {
        adminPasswordRef.current = password
        setIsAuthenticated(true)
        setNotification({ type: 'success', message: 'Bienvenido al OPS Console' })
      } else {
        setNotification({ type: 'error', message: data.error || 'Contraseña incorrecta' })
      }
    } catch { setNotification({ type: 'error', message: 'Error de conexión' }) }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const dataToSave = { ...formData, fecha_vencimiento: `${formData.fecha_vencimiento}T23:59:59Z` }
      if (formData.tipo === 'blog') dataToSave.fecha_vencimiento = '2099-12-31T23:59:59Z'
      const { error } = isEditing && formData.id
        ? await supabase.from('content_hub').update(dataToSave).eq('id', formData.id)
        : await supabase.from('content_hub').insert([dataToSave])
      if (error) throw error
      setNotification({ type: 'success', message: isEditing ? 'Actualizado correctamente' : 'Creado correctamente' })
      resetForm()
      loadContent()
    } catch (err: any) { setNotification({ type: 'error', message: err.message }) }
    finally { setLoading(false) }
  }

  const toggleSubscription = async (userId: string, currentValue: boolean) => {
    try {
      await adminFetch('toggle_subscribed', { userId, value: !currentValue })
      loadSubscribers()
      setNotification({ type: 'success', message: `Plan ${!currentValue ? 'PRO activado' : 'revertido a FREE'}` })
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message })
    }
  }

  const toggleTestFlag = async (userId: string, currentValue: boolean) => {
    try {
      await adminFetch('toggle_test', { userId, value: !currentValue })
      loadSubscribers()
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message })
    }
  }

  const approveSkill = async (id: number) => {
    await supabase.from('skill_candidates').update({ status: 'approved' }).eq('id', id)
    loadSkillCandidates()
    setNotification({ type: 'success', message: 'Habilidad aprobada' })
  }

  const rejectSkill = async (id: number) => {
    await supabase.from('skill_candidates').update({ status: 'rejected' }).eq('id', id)
    loadSkillCandidates()
    setNotification({ type: 'success', message: 'Habilidad rechazada' })
  }

  const generateToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await fetch('/.netlify/functions/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordRef.current, email: tokenEmail, token_balance: tokenBalance, plan_type: tokenPlan }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error generando token')
      setNotification({ type: 'success', message: 'Token generado con éxito' })
      setTokenEmail('')
      loadTokens()
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  const toggleStatus = async (item: ContentItem) => {
    await supabase.from('content_hub').update({ is_active: !item.is_active }).eq('id', item.id)
    loadContent()
  }

  const deleteItem = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este contenido?')) return
    await supabase.from('content_hub').delete().eq('id', id)
    loadContent()
  }

  const resetForm = () => {
    setFormData({
      titulo: '', slug: '', cuerpo: '', categoria: 'Tecnología', imagen_url: '',
      fecha_vencimiento: new Date().toISOString().split('T')[0],
      tipo: 'blog', ubicacion: 'Asunción, Paraguay', is_active: true
    })
    setIsEditing(false)
  }

  const handleEdit = (item: ContentItem) => {
    setFormData({ ...item, fecha_vencimiento: item.fecha_vencimiento.split('T')[0] })
    setIsEditing(true)
    setActiveTab('contenido')
  }

  const markBetaInvited = async (id: string) => {
    try {
      await adminFetch('mark_beta_invited', { id })
      loadBeta()
      setNotification({ type: 'success', message: 'Marcado como invitado' })
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message })
    }
  }

  const sendSuggestion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!suggestionMsg.trim()) return
    setSendingSuggestion(true)
    try {
      const res = await fetch('/.netlify/functions/submit-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: suggestionMsg.trim(), type: suggestionType, email: 'admin@cvitae.lat' }),
      })
      if (!res.ok) throw new Error('Error al enviar')
      setSuggestionMsg('')
      setNotification({ type: 'success', message: 'Sugerencia enviada a contacto@cvitae.lat' })
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message })
    } finally {
      setSendingSuggestion(false)
    }
  }

  // ── LOGIN SCREEN ──────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
        <div className="w-full max-w-sm border border-white/[0.07] p-8 bg-[#080808]">
          <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase', marginBottom: '24px' }}>
            CVITAE OPS CONSOLE
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="contraseña"
              className={inputCls}
              style={{ fontFamily: MONO }}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#c9a84c] text-[#080808] text-sm font-semibold tracking-wide hover:bg-[#e6cf8a] transition-colors disabled:opacity-50"
            >
              {loading ? 'ACCEDIENDO...' : 'ACCEDER →'}
            </button>
          </form>
          {notification && (
            <div className={`mt-4 p-3 text-sm ${notification.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`} style={{ fontFamily: MONO, fontSize: '12px' }}>
              {notification.message}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── MAIN CONSOLE ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#080808' }}>

      {/* SIDEBAR */}
      <aside className="w-52 fixed h-full border-r border-white/[0.07] bg-[#080808] flex flex-col py-6 px-4" style={{ zIndex: 20 }}>
        {/* Logo */}
        <div className="mb-8 px-2">
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.25rem', color: '#c9a84c', fontWeight: 900 }}>
            CV<em style={{ fontStyle: 'italic', fontWeight: 400 }}>itae</em>
          </span>
          <p style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(232,232,224,0.3)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            OPS CONSOLE
          </p>
        </div>

        {/* Live indicator */}
        <div className="mb-6 px-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(232,232,224,0.4)' }}>ACTIVO</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as typeof activeTab)}
              className={`w-full text-left px-2 py-2.5 text-sm transition-colors flex items-center gap-2.5 ${
                activeTab === item.id
                  ? 'text-[#e8e8e0] bg-white/[0.05]'
                  : 'text-[rgba(232,232,224,0.45)] hover:text-[#e8e8e0] hover:bg-white/[0.03]'
              }`}
              style={{ borderLeft: activeTab === item.id ? '2px solid #c9a84c' : '2px solid transparent' }}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.dotColor}`} />
              {item.label}
              {item.badge ? (
                <span className="ml-auto text-[#c9a84c]" style={{ fontFamily: MONO, fontSize: '10px' }}>{item.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>

        {/* Timestamp + logout */}
        <div className="px-2 mt-4">
          <p style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(232,232,224,0.2)' }}>
            {new Date().toLocaleDateString('es-PY')} {new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <button
            onClick={() => setIsAuthenticated(false)}
            className="mt-3 text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            ↩ Salir
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-grow ml-52 relative overflow-hidden" style={{ minHeight: '100vh' }}>
        <SignalLines />

        <div className="relative z-10 p-8">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>

              {/* ── BRIEF ──────────────────────────────────────────────── */}
              {activeTab === 'brief' && (
                <div>
                  <div className="mb-8">
                    <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>
                      BRIEF — {new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold text-[#e8e8e0]">Estado del sistema</h1>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07]">
                    {[
                      { label: 'USUARIOS TOTALES', value: metrics.usuarios, sub: 'en base de datos' },
                      { label: 'PRO ACTIVOS', value: metrics.suscriptores, sub: 'is_subscribed = true' },
                      { label: 'OPORTUNIDADES', value: metrics.oportunidades, sub: 'activas hoy' },
                      { label: 'INGRESOS REALES', value: '$0', sub: 'este mes · test excluido' },
                    ].map((m, i) => (
                      <div key={i} className="bg-[#080808] p-5">
                        <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase', marginBottom: '8px' }}>{m.label}</p>
                        <p style={{ fontFamily: MONO, fontSize: '2.5rem', lineHeight: 1, color: '#e8e8e0', fontWeight: 600 }}>{m.value}</p>
                        <p style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(232,232,224,0.25)', marginTop: '4px' }}>{m.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Scraper automation report */}
                  <div className="mt-6 border border-white/[0.07]">
                    <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
                      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>AUTOMATIZACIÓN — SCRAPERS</p>
                      <button
                        onClick={loadScraperReport}
                        className="text-[10px] text-[rgba(232,232,224,0.3)] hover:text-[#e8e8e0] border border-white/[0.07] px-2.5 py-1 transition-colors"
                        style={{ fontFamily: MONO }}
                      >↻ Actualizar</button>
                    </div>
                    {scraperReport ? (
                      <>
                        {/* Summary row */}
                        <div className="grid grid-cols-4 gap-px bg-white/[0.04]">
                          {[
                            { label: 'TOTAL OPORTUNIDADES', value: (scraperReport.totalOpportunities + scraperReport.totalContentHub).toLocaleString('es-PY'), sub: 'opportunities + content_hub' },
                            { label: 'NUEVAS HOY', value: scraperReport.newLast24h.toLocaleString('es-PY'), sub: 'últimas 24h' },
                            { label: 'NUEVAS 7 DÍAS', value: scraperReport.newLast7d.toLocaleString('es-PY'), sub: 'últimos 7 días' },
                            { label: 'FUENTES ACTIVAS', value: scraperReport.bySource.length.toString(), sub: `cron: 06:00 PY diario` },
                          ].map((m, i) => (
                            <div key={i} className="bg-[#080808] px-4 py-3">
                              <p style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.25)', textTransform: 'uppercase', marginBottom: '4px' }}>{m.label}</p>
                              <p style={{ fontFamily: MONO, fontSize: '1.5rem', lineHeight: 1, color: '#c9a84c', fontWeight: 600 }}>{m.value}</p>
                              <p style={{ fontFamily: MONO, fontSize: '9px', color: 'rgba(232,232,224,0.2)', marginTop: '3px' }}>{m.sub}</p>
                            </div>
                          ))}
                        </div>
                        {/* By source table */}
                        <div className="max-h-48 overflow-y-auto divide-y divide-white/[0.03]">
                          {scraperReport.bySource.map(s => (
                            <div key={s.source} className="flex items-center justify-between px-5 py-2 hover:bg-white/[0.02]">
                              <span style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(232,232,224,0.6)' }}>{s.source}</span>
                              <div className="flex items-center gap-4">
                                <span style={{ fontFamily: MONO, fontSize: '11px', color: '#c9a84c' }}>{s.count.toLocaleString('es-PY')}</span>
                                <span style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(232,232,224,0.2)' }}>
                                  {new Date(s.lastSeen).toLocaleDateString('es-PY')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="px-5 py-4">
                        <p style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(232,232,224,0.25)' }}>Cargando reporte...</p>
                      </div>
                    )}
                  </div>

                  {/* Signals */}
                  <div className="mt-6 border border-white/[0.07]">
                    <div className="px-5 py-3 border-b border-white/[0.07]">
                      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>SEÑALES</p>
                    </div>
                    <div className="divide-y divide-white/[0.05]">
                      {subscribers.filter(s => !s.is_subscribed).length > 0 && (
                        <div className="px-5 py-3 flex items-center gap-3">
                          <span className="text-[#c9a84c]">◆</span>
                          <span className="text-sm text-[#e8e8e0]">{subscribers.filter(s => !s.is_subscribed).length} usuarios en plan Free — candidatos para convertir</span>
                        </div>
                      )}
                      {tokens.filter(t => t.token_balance < 5).length > 0 && (
                        <div className="px-5 py-3 flex items-center gap-3">
                          <span className="text-red-400">◆</span>
                          <span className="text-sm text-[#e8e8e0]">{tokens.filter(t => t.token_balance < 5).length} token(s) B2B con balance bajo (&lt;5)</span>
                        </div>
                      )}
                      <div className="px-5 py-3 flex items-center gap-3">
                        <span className="text-emerald-400">◆</span>
                        <span className="text-sm text-[rgba(232,232,224,0.5)]">Sistema operativo · scrapers activos · emails verificados</span>
                      </div>
                    </div>
                  </div>

                  {/* Beta suggestion box */}
                  <div className="mt-6 border border-white/[0.07]">
                    <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
                      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>BUZÓN BETA</p>
                      <span style={{ fontFamily: MONO, fontSize: '9px', color: 'rgba(232,232,224,0.2)', letterSpacing: '0.1em' }}>→ contacto@cvitae.lat</span>
                    </div>
                    <div className="p-5">
                      <form onSubmit={sendSuggestion} className="space-y-3">
                        <div className="flex gap-2">
                          {(['feedback', 'bug', 'idea'] as const).map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setSuggestionType(t)}
                              className={`text-[10px] px-2.5 py-1 border transition-colors ${suggestionType === t ? 'border-[#c9a84c]/50 text-[#c9a84c]' : 'border-white/[0.07] text-[rgba(232,232,224,0.3)] hover:border-white/20'}`}
                              style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                            >
                              {t === 'feedback' ? '📝 FEEDBACK' : t === 'bug' ? '🐛 BUG' : '💡 IDEA'}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={suggestionMsg}
                          onChange={e => setSuggestionMsg(e.target.value)}
                          placeholder="Escribí tu sugerencia, bug o idea para el beta..."
                          rows={3}
                          className={`${inputCls} resize-none`}
                          style={{ fontFamily: MONO, fontSize: '12px' }}
                        />
                        <button
                          type="submit"
                          disabled={sendingSuggestion || !suggestionMsg.trim()}
                          className="text-xs bg-[#c9a84c] text-[#080808] font-semibold px-4 py-2 hover:bg-[#e6cf8a] transition-colors disabled:opacity-40"
                          style={{ fontFamily: MONO }}
                        >
                          {sendingSuggestion ? 'Enviando...' : 'Enviar →'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}

              {/* ── USUARIOS ───────────────────────────────────────────── */}
              {activeTab === 'usuarios' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>USUARIOS B2C</p>
                      <h2 className="text-xl text-[#e8e8e0] mt-0.5">{subscribers.length} registros</h2>
                    </div>
                    <button
                      onClick={loadSubscribers}
                      className="text-xs text-[rgba(232,232,224,0.4)] hover:text-[#e8e8e0] border border-white/[0.07] px-3 py-1.5 transition-colors"
                      style={{ fontFamily: MONO }}
                    >
                      ↻ Actualizar
                    </button>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.07]">
                        {['NOMBRE', 'EMAIL', 'TIPO', 'PLAN', 'ACCIÓN'].map(h => (
                          <th key={h} className="text-left py-2.5 px-3 font-normal tracking-widest text-[rgba(232,232,224,0.3)]" style={{ fontFamily: MONO, fontSize: '10px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {subscribers.map(sub => (
                        <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-3 text-sm text-[#e8e8e0]">{sub.full_name || '—'}</td>
                          <td className="py-3 px-3 text-[rgba(232,232,224,0.6)]" style={{ fontFamily: MONO, fontSize: '12px' }}>{sub.email}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`text-[10px] px-2 py-0.5 border ${sub.is_test ? 'border-amber-500/40 text-amber-400' : 'border-white/10 text-[rgba(232,232,224,0.4)]'}`}
                              style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                            >
                              {sub.is_test ? 'TEST' : 'REAL'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <button
                              onClick={() => toggleSubscription(sub.user_id, sub.is_subscribed)}
                              className={`text-[10px] px-2 py-0.5 border transition-colors ${sub.is_subscribed ? 'border-[#c9a84c]/50 text-[#c9a84c]' : 'border-white/10 text-[rgba(232,232,224,0.4)] hover:border-[#c9a84c]/30 hover:text-[#c9a84c]/60'}`}
                              style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                            >
                              {sub.is_subscribed ? '● PRO' : '○ FREE'}
                            </button>
                          </td>
                          <td className="py-3 px-3">
                            <button
                              onClick={() => toggleTestFlag(sub.user_id, sub.is_test ?? false)}
                              className="text-[10px] text-[rgba(232,232,224,0.3)] hover:text-[rgba(232,232,224,0.6)] transition-colors"
                              style={{ fontFamily: MONO }}
                            >
                              {sub.is_test ? 'marcar real' : 'marcar test'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── BETA / LEADS ────────────────────────────────────────── */}
              {activeTab === 'beta' && (
                <div>
                  <div className="mb-8">
                    <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>PIPELINE</p>
                    <h2 className="text-xl text-[#e8e8e0] mt-0.5">Beta & Leads</h2>
                  </div>

                  {/* Beta B2C */}
                  <div className="border border-white/[0.07] mb-6">
                    <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
                      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>
                        BETA B2C — {betaList.length}
                      </p>
                    </div>
                    {betaList.length === 0 ? (
                      <div className="px-5 py-4 text-sm text-[rgba(232,232,224,0.3)]">Sin registros.</div>
                    ) : (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-white/[0.05]">
                            {['EMAIL', 'FECHA', 'STATUS', 'ACCIÓN'].map(h => (
                              <th key={h} className="text-left py-2.5 px-4 font-normal tracking-widest text-[rgba(232,232,224,0.3)]" style={{ fontFamily: MONO, fontSize: '10px' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {betaList.map((entry: any) => (
                            <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4 text-[rgba(232,232,224,0.7)]" style={{ fontFamily: MONO, fontSize: '12px' }}>{entry.email}</td>
                              <td className="py-3 px-4 text-[rgba(232,232,224,0.4)]" style={{ fontFamily: MONO, fontSize: '11px' }}>
                                {entry.created_at ? new Date(entry.created_at).toLocaleDateString('es-PY') : '—'}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`text-[10px] px-2 py-0.5 border ${
                                    entry.status === 'invited' ? 'border-emerald-500/40 text-emerald-400'
                                    : entry.status === 'rejected' ? 'border-red-500/40 text-red-400'
                                    : 'border-white/10 text-[rgba(232,232,224,0.4)]'
                                  }`}
                                  style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                                >
                                  {(entry.status || 'pending').toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                {entry.status !== 'invited' && (
                                  <button
                                    onClick={() => markBetaInvited(entry.id)}
                                    className="text-[10px] text-sky-400/60 hover:text-sky-400 transition-colors"
                                    style={{ fontFamily: MONO }}
                                  >
                                    Invitar →
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Leads B2B */}
                  <div className="border border-white/[0.07]">
                    <div className="px-5 py-3 border-b border-white/[0.07]">
                      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>
                        LEADS B2B — {leads.length}
                      </p>
                    </div>
                    {leads.length === 0 ? (
                      <div className="px-5 py-4 text-sm text-[rgba(232,232,224,0.3)]">Sin registros.</div>
                    ) : (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-white/[0.05]">
                            {['EMPRESA', 'EMAIL', 'FECHA', 'ACCIÓN'].map(h => (
                              <th key={h} className="text-left py-2.5 px-4 font-normal tracking-widest text-[rgba(232,232,224,0.3)]" style={{ fontFamily: MONO, fontSize: '10px' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {leads.map((lead: any) => (
                            <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4 text-sm text-[#e8e8e0]">{lead.company || lead.empresa || '—'}</td>
                              <td className="py-3 px-4 text-[rgba(232,232,224,0.6)]" style={{ fontFamily: MONO, fontSize: '12px' }}>{lead.email}</td>
                              <td className="py-3 px-4 text-[rgba(232,232,224,0.4)]" style={{ fontFamily: MONO, fontSize: '11px' }}>
                                {lead.created_at ? new Date(lead.created_at).toLocaleDateString('es-PY') : '—'}
                              </td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => { setTokenEmail(lead.email); setActiveTab('tokens') }}
                                  className="text-[10px] text-[#c9a84c]/60 hover:text-[#c9a84c] transition-colors"
                                  style={{ fontFamily: MONO }}
                                >
                                  Generar token →
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* ── CONTENIDO ───────────────────────────────────────────── */}
              {activeTab === 'contenido' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>GESTOR</p>
                      <h2 className="text-xl text-[#e8e8e0] mt-0.5">Contenido ({items.length})</h2>
                    </div>
                    <button
                      onClick={() => resetForm()}
                      className="flex items-center gap-1.5 text-xs text-[rgba(232,232,224,0.4)] hover:text-[#e8e8e0] border border-white/[0.07] px-3 py-1.5 transition-colors"
                      style={{ fontFamily: MONO }}
                    >
                      <Plus size={12} /> Nuevo
                    </button>
                  </div>

                  {/* Form */}
                  <div className="border border-white/[0.07] p-5 mb-6">
                    <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase', marginBottom: '16px' }}>
                      {isEditing ? 'EDITAR CONTENIDO' : 'NUEVO CONTENIDO'}
                    </p>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <input
                          value={formData.titulo}
                          onChange={e => setFormData(prev => ({ ...prev, titulo: e.target.value, slug: e.target.value.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') }))}
                          placeholder="Título"
                          required
                          className={inputCls}
                        />
                        <input
                          value={formData.slug}
                          onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                          placeholder="Slug"
                          required
                          className={inputCls}
                          style={{ fontFamily: MONO }}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <select
                          value={formData.tipo}
                          onChange={e => setFormData(prev => ({ ...prev, tipo: e.target.value as any }))}
                          className={inputCls}
                          style={{ fontFamily: MONO }}
                        >
                          <option value="blog">Blog</option>
                          <option value="oportunidad">Oportunidad</option>
                          <option value="beca">Beca</option>
                          <option value="foro">Foro</option>
                        </select>
                        <select
                          value={formData.categoria}
                          onChange={e => setFormData(prev => ({ ...prev, categoria: e.target.value }))}
                          className={inputCls}
                        >
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input
                          value={formData.ubicacion}
                          onChange={e => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))}
                          placeholder="Ubicación"
                          className={inputCls}
                        />
                      </div>
                      <input
                        value={formData.imagen_url}
                        onChange={e => setFormData(prev => ({ ...prev, imagen_url: e.target.value }))}
                        placeholder="URL de la imagen (opcional)"
                        className={inputCls}
                        style={{ fontFamily: MONO, fontSize: '12px' }}
                      />
                      <textarea
                        value={formData.cuerpo}
                        onChange={e => setFormData(prev => ({ ...prev, cuerpo: e.target.value }))}
                        placeholder="Contenido (Markdown)"
                        rows={8}
                        required
                        className={`${inputCls} resize-none`}
                        style={{ fontFamily: MONO, fontSize: '12px' }}
                      />
                      <div className="flex justify-end gap-3">
                        {isEditing && (
                          <button
                            type="button"
                            onClick={resetForm}
                            className="text-xs text-[rgba(232,232,224,0.4)] hover:text-[#e8e8e0] border border-white/[0.07] px-4 py-2 transition-colors"
                            style={{ fontFamily: MONO }}
                          >
                            Cancelar
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex items-center gap-1.5 text-xs bg-[#c9a84c] text-[#080808] font-semibold px-4 py-2 hover:bg-[#e6cf8a] transition-colors disabled:opacity-50"
                          style={{ fontFamily: MONO }}
                        >
                          <Save size={12} /> {isEditing ? 'Actualizar' : 'Publicar'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Items list */}
                  <div className="border border-white/[0.07] divide-y divide-white/[0.04]">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[10px] px-2 py-0.5 border border-white/10 text-[rgba(232,232,224,0.4)]"
                              style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                            >
                              {item.tipo.toUpperCase()}
                            </span>
                            <span className="text-sm text-[#e8e8e0]">{item.titulo}</span>
                          </div>
                          <p className="text-[11px] text-[rgba(232,232,224,0.3)] mt-0.5" style={{ fontFamily: MONO }}>/{item.slug}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleStatus(item)}
                            className={`p-1.5 transition-colors ${item.is_active ? 'text-emerald-400' : 'text-red-400/50 hover:text-red-400'}`}
                          >
                            {item.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button onClick={() => handleEdit(item)} className="p-1.5 text-[rgba(232,232,224,0.3)] hover:text-[#e8e8e0] transition-colors">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => deleteItem(item.id!)} className="p-1.5 text-[rgba(232,232,224,0.3)] hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── TOKENS B2B ──────────────────────────────────────────── */}
              {activeTab === 'tokens' && (
                <div>
                  <div className="mb-6">
                    <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>ACCESO B2B</p>
                    <h2 className="text-xl text-[#e8e8e0] mt-0.5">Tokens B2B</h2>
                  </div>

                  {/* Form */}
                  <div className="border border-white/[0.07] p-5 mb-6">
                    <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase', marginBottom: '16px' }}>GENERAR TOKEN</p>
                    <form onSubmit={generateToken} className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <input
                          type="email"
                          value={tokenEmail}
                          onChange={e => setTokenEmail(e.target.value)}
                          placeholder="Email del reclutador"
                          required
                          className={inputCls}
                          style={{ fontFamily: MONO, fontSize: '12px' }}
                        />
                        <input
                          type="number"
                          value={tokenBalance}
                          onChange={e => setTokenBalance(parseInt(e.target.value))}
                          placeholder="Balance"
                          required
                          className={inputCls}
                          style={{ fontFamily: MONO }}
                        />
                        <select
                          value={tokenPlan}
                          onChange={e => setTokenPlan(e.target.value)}
                          className={inputCls}
                          style={{ fontFamily: MONO, fontSize: '12px' }}
                        >
                          <option value="starter">Starter (10)</option>
                          <option value="pro">Pro (100)</option>
                          <option value="enterprise">Enterprise (Inf)</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="text-xs bg-[#c9a84c] text-[#080808] font-semibold px-4 py-2 hover:bg-[#e6cf8a] transition-colors disabled:opacity-50"
                        style={{ fontFamily: MONO }}
                      >
                        Generar token →
                      </button>
                    </form>
                  </div>

                  {/* Tokens table */}
                  <div className="border border-white/[0.07]">
                    <div className="px-5 py-3 border-b border-white/[0.07]">
                      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>TOKENS EMITIDOS — {tokens.length}</p>
                    </div>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-white/[0.05]">
                          {['EMAIL', 'TOKEN', 'BALANCE', 'PLAN'].map(h => (
                            <th key={h} className="text-left py-2.5 px-4 font-normal tracking-widest text-[rgba(232,232,224,0.3)]" style={{ fontFamily: MONO, fontSize: '10px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {tokens.map(token => (
                          <tr key={token.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3 px-4 text-sm text-[#e8e8e0]">{token.email}</td>
                            <td className="py-3 px-4" style={{ fontFamily: MONO, fontSize: '11px', color: '#c9a84c' }}>{token.access_token}</td>
                            <td className="py-3 px-4 text-[#e8e8e0]" style={{ fontFamily: MONO }}>{token.token_balance}</td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] px-2 py-0.5 border border-white/10 text-[rgba(232,232,224,0.4)]" style={{ fontFamily: MONO, letterSpacing: '0.1em' }}>
                                {(token.plan_type || '').toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── SKILLS IA ───────────────────────────────────────────── */}
              {activeTab === 'skills' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>ONTOLOGÍA</p>
                      <h2 className="text-xl text-[#e8e8e0] mt-0.5">Skills Candidatas</h2>
                    </div>
                    <span
                      className="text-xs border border-[#c9a84c]/30 text-[#c9a84c] px-2.5 py-1"
                      style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                    >
                      {skillCandidates.filter(s => s.status === 'pending').length} PENDIENTES
                    </span>
                  </div>

                  <div className="border border-white/[0.07] divide-y divide-white/[0.04]">
                    {skillCandidates.map(skill => (
                      <div key={skill.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                        <div>
                          <p className="text-sm text-[#e8e8e0]">
                            {skill.term}
                            <span className="mx-2 text-[rgba(232,232,224,0.2)]">→</span>
                            <span style={{ color: '#c9a84c' }}>{skill.normalized}</span>
                          </p>
                          <p className="text-[11px] text-[rgba(232,232,224,0.3)] mt-0.5" style={{ fontFamily: MONO }}>
                            {skill.mention_count} menciones · desde {new Date(skill.first_seen).toLocaleDateString('es-PY')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-[10px] px-2 py-0.5 border ${
                              skill.status === 'pending' ? 'border-amber-500/40 text-amber-400'
                              : skill.status === 'approved' ? 'border-[#c9a84c]/40 text-[#c9a84c]'
                              : 'border-white/10 text-[rgba(232,232,224,0.3)]'
                            }`}
                            style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                          >
                            {skill.status.toUpperCase()}
                          </span>
                          {skill.status === 'pending' && (
                            <>
                              <button
                                onClick={() => approveSkill(skill.id)}
                                className="text-emerald-400/60 hover:text-emerald-400 transition-colors"
                                title="Aprobar"
                              >
                                <CheckCircle size={15} />
                              </button>
                              <button
                                onClick={() => rejectSkill(skill.id)}
                                className="text-red-400/60 hover:text-red-400 transition-colors"
                                title="Rechazar"
                              >
                                <X size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* NOTIFICATION TOAST */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={`fixed bottom-8 right-8 flex items-center gap-3 text-sm shadow-2xl z-50 border px-4 py-3 ${
              notification.type === 'success'
                ? 'bg-[#080808] border-emerald-500/30 text-emerald-400'
                : 'bg-[#080808] border-red-500/30 text-red-400'
            }`}
            style={{ fontFamily: MONO, fontSize: '12px' }}
          >
            {notification.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {notification.message}
            <button onClick={() => setNotification(null)} className="ml-1 opacity-60 hover:opacity-100">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
