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

interface OpportunityReview {
  id: string
  title: string
  organization: string | null
  location: string | null
  source: string
  application_url: string
  description: string | null
  rubro: string | null
  opportunity_kind: string | null
  opportunity_type: string | null
  source_authority: 'original' | 'aggregator' | 'discovery'
  original_source_url: string | null
  original_source_verified: boolean
  eligible_countries: string[]
  eligible_regions: string[]
  deadline: string | null
  verification_status: 'pending' | 'in_review' | 'verified' | 'rejected' | 'quarantined'
  verification_score: number | null
  verification_reasons: string[]
  verification_note: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  catalog_eligible: boolean
  match_eligible: boolean
  alerts_eligible: boolean
  seo_eligible: boolean
  policy_overrides: Record<string, boolean>
  archived_at: string | null
  deleted_at: string | null
  deletion_reason: string | null
  deletion_review_status: 'pending' | 'approved' | 'cancelled' | null
  deletion_requested_at: string | null
  created_at: string
}

const REVIEW_CRITERIA = [
  'La fuente y el enlace de postulación son accesibles',
  'La organización o responsable es identificable',
  'La oportunidad parece vigente y contiene información suficiente',
  'Paraguay figura en países o regiones elegibles',
  'La convocatoria fue contrastada con la fuente original',
  'El tipo de oportunidad está correctamente clasificado',
]

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
  const [activeTab, setActiveTab] = useState<'brief' | 'moderacion' | 'fuentes' | 'usuarios' | 'beta' | 'prospects' | 'contenido' | 'tokens' | 'skills'>('brief')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [items, setItems] = useState<ContentItem[]>([])
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [skillCandidates, setSkillCandidates] = useState<SkillCandidate[]>([])
  const [metrics, setMetrics] = useState({ usuarios: 0, matches: 0, oportunidades: 0, suscriptores: 0, usuariosHoy: 0, usuariosAyer: 0, usuariosEstaSemana: 0, empresasActivas: 0 })
  const [b2bProspects, setB2bProspects] = useState<any[]>([])
  const [opportunityReviews, setOpportunityReviews] = useState<OpportunityReview[]>([])
  const [reviewSummary, setReviewSummary] = useState<Record<string, number>>({})
  const [opportunityInventory, setOpportunityInventory] = useState<{ total: number; published: number; archived: number; deleted: number; deletion_pending: number; by_type: Record<string, number> }>({ total: 0, published: 0, archived: 0, deleted: 0, deletion_pending: 0, by_type: {} })
  const [reviewStatus, setReviewStatus] = useState('pending')
  const [reviewSource, setReviewSource] = useState('all')
  const [reviewSearch, setReviewSearch] = useState('')
  const [reviewSources, setReviewSources] = useState<any[]>([])
  const [selectedReview, setSelectedReview] = useState<OpportunityReview | null>(null)
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([])
  const [reviewNote, setReviewNote] = useState('')
  const [reviewScore, setReviewScore] = useState(70)
  const [reviewFeatures, setReviewFeatures] = useState({ catalog: true, matching: true, alerts: true, seo: true })
  const [reviewLifecycle, setReviewLifecycle] = useState('active')
  const [editingReview, setEditingReview] = useState(false)
  const [reviewEditData, setReviewEditData] = useState<Record<string, string>>({})
  const [scraperControls, setScraperControls] = useState<any[]>([])
  const [sourcePolicies, setSourcePolicies] = useState<any[]>([])
  const [sourceStats, setSourceStats] = useState<Record<string, any>>({})
  const [selectedControl, setSelectedControl] = useState<{ kind: 'scraper' | 'source'; data: any } | null>(null)

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
    bySource: { source: string; count: number; lastSeen: string; newToday: number; newYesterday: number }[]
    newLast24h: number
    newLast7d: number
    duplicates: number
    telemetryAvailable: boolean
    telemetryError: string | null
    runSummary: Record<string, number>
    scraperRuns: {
      id: string; scraper_id: string; scraper_name: string; script_path: string
      status: 'running' | 'healthy' | 'warning' | 'failed' | 'timeout'
      health_status: 'healthy' | 'idle' | 'unknown' | 'warning' | 'blocked' | 'critical'
      productive: boolean; insertion_rate: number | null
      consecutive_problems: number; last_productive_at: string | null
      found_count: number | null; inserted_count: number | null
      valid_count: number | null; unique_count: number | null; updated_count: number | null
      duplicate_count: number | null; rejected_count: number | null
      warning_count: number; error_count: number; error_summary: string | null
      github_run_url: string | null; started_at: string; finished_at: string | null
      duration_seconds: number | null
    }[]
  } | null>(null)

  const NAV_ITEMS = [
    { id: 'brief', label: 'Brief del día', dotColor: 'bg-emerald-400', badge: null },
    { id: 'moderacion', label: 'Verificación', dotColor: 'bg-amber-300', badge: (reviewSummary.pending || 0).toString() },
    { id: 'fuentes', label: 'Fuentes y reglas', dotColor: 'bg-sky-300', badge: scraperControls.filter(item => item.collection_enabled).length.toString() },
    { id: 'usuarios', label: 'Usuarios', dotColor: 'bg-[#c9a84c]', badge: metrics.usuarios.toString() },
    { id: 'beta', label: 'Beta / Leads', dotColor: 'bg-sky-400', badge: null },
    { id: 'prospects', label: 'B2B Prospects', dotColor: 'bg-purple-400', badge: null },
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
      loadB2bProspects()
      loadReviewSummary()
      if (activeTab === 'moderacion') loadOpportunityReviews()
      if (activeTab === 'fuentes') loadControlCenter()
    }
  }, [isAuthenticated, activeTab])

  useEffect(() => {
    if (isAuthenticated && activeTab === 'moderacion') loadOpportunityReviews()
  }, [reviewStatus, reviewSource, reviewLifecycle])

  const loadContent = async () => {
    try {
      const json = await adminFetch('list_content')
      setItems(json.data || [])
    } catch { /* non-fatal */ }
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
    try {
      const json = await adminFetch('list_skills')
      setSkillCandidates(json.data || [])
    } catch { /* non-fatal */ }
  }

  const loadMetrics = async () => {
    try {
      const json = await adminFetch('metrics')
      setMetrics({
        usuarios: json.usuarios || 0,
        matches: 0,
        oportunidades: json.oportunidades || 0,
        suscriptores: json.suscriptores || 0,
        usuariosHoy: json.usuariosHoy || 0,
        usuariosAyer: json.usuariosAyer || 0,
        usuariosEstaSemana: json.usuariosEstaSemana || 0,
        empresasActivas: json.empresasActivas || 0,
      })
    } catch {
      // metrics failure is non-fatal
    }
  }

  const loadB2bProspects = async () => {
    try {
      const json = await adminFetch('list_b2b_prospects')
      setB2bProspects(json.data || [])
    } catch { /* non-fatal */ }
  }

  const loadReviewSummary = async () => {
    try {
      const json = await adminFetch('opportunity_review_summary')
      setReviewSummary(json.summary || {})
      setOpportunityInventory(json.inventory || { total: 0, published: 0, archived: 0, deleted: 0, deletion_pending: 0, by_type: {} })
    } catch { /* migration may not be available yet */ }
  }

  const loadOpportunityReviews = async () => {
    try {
      const json = await adminFetch('list_opportunity_reviews', { status: reviewStatus, source: reviewSource, search: reviewSearch, lifecycle: reviewLifecycle })
      setOpportunityReviews(json.data || [])
      setReviewSources(json.sources || [])
      if (selectedReview && !(json.data || []).some((item: OpportunityReview) => item.id === selectedReview.id)) setSelectedReview(null)
    } catch (err: any) {
      setNotification({ type: 'error', message: `No se pudo cargar la bandeja: ${err.message}` })
    }
  }

  const openReview = (opportunity: OpportunityReview) => {
    setSelectedReview(opportunity)
    setSelectedCriteria(Array.isArray(opportunity.verification_reasons) ? opportunity.verification_reasons : [])
    setReviewNote(opportunity.verification_note || '')
    setReviewScore(opportunity.verification_score ?? 70)
    setReviewFeatures({
      catalog: opportunity.catalog_eligible ?? true,
      matching: opportunity.match_eligible ?? true,
      alerts: opportunity.alerts_eligible ?? true,
      seo: opportunity.seo_eligible ?? true,
    })
    setReviewEditData({
      title: opportunity.title || '', organization: opportunity.organization || '', location: opportunity.location || '',
      country_code: '', department: '', city: '', type: '', opportunity_kind: opportunity.opportunity_kind || 'empleo', opportunity_type: opportunity.opportunity_type || 'job', rubro: opportunity.rubro || '',
      source_authority: opportunity.source_authority || 'aggregator', original_source_url: opportunity.original_source_url || '', original_source_verified: opportunity.original_source_verified || false,
      description: opportunity.description || '', application_url: opportunity.application_url || '',
    })
    setEditingReview(false)
  }

  const submitOpportunityReview = async (status: OpportunityReview['verification_status']) => {
    if (!selectedReview) return
    if (status === 'verified' && selectedCriteria.length === 0) {
      setNotification({ type: 'error', message: 'Seleccioná al menos un criterio antes de verificar' })
      return
    }
    setLoading(true)
    try {
      await adminFetch('review_opportunity', {
        id: selectedReview.id, status, criteria: selectedCriteria, note: reviewNote, score: reviewScore, features: reviewFeatures,
      })
      setNotification({ type: 'success', message: status === 'verified' ? 'Oportunidad habilitada para matching' : 'Decisión guardada; el registro se conserva' })
      setSelectedReview(null)
      await Promise.all([loadOpportunityReviews(), loadReviewSummary(), loadScraperReport()])
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message })
    } finally { setLoading(false) }
  }

  const saveOpportunityEdit = async () => {
    if (!selectedReview) return
    try {
      await adminFetch('update_opportunity', { id: selectedReview.id, data: reviewEditData })
      setSelectedReview(current => current ? { ...current, ...reviewEditData } as OpportunityReview : current)
      setEditingReview(false)
      await loadOpportunityReviews()
      setNotification({ type: 'success', message: 'Cambios guardados; la decisión de verificación no fue alterada' })
    } catch (err: any) { setNotification({ type: 'error', message: err.message }) }
  }

  const setOpportunityLifecycle = async (mode: 'archive' | 'request_delete' | 'confirm_delete' | 'cancel_delete' | 'restore') => {
    if (!selectedReview) return
    const reason = mode === 'request_delete' ? window.prompt('Motivo para enviar a revisión de eliminación:') : ''
    if (mode === 'request_delete' && reason === null) return
    if (mode === 'confirm_delete' && !window.confirm('Confirmar eliminación recuperable después de revisar el registro.')) return
    try {
      await adminFetch('set_opportunity_lifecycle', { id: selectedReview.id, mode, reason })
      setSelectedReview(null)
      await Promise.all([loadOpportunityReviews(), loadReviewSummary()])
      const messages: Record<string, string> = { restore: 'Registro restaurado y devuelto a revisión', archive: 'Registro archivado', request_delete: 'Solicitud enviada a revisión; todavía no fue eliminada', confirm_delete: 'Eliminación recuperable confirmada', cancel_delete: 'Eliminación cancelada; podés corregir y revisar el registro' }
      setNotification({ type: 'success', message: messages[mode] })
    } catch (err: any) { setNotification({ type: 'error', message: err.message }) }
  }

  const loadControlCenter = async () => {
    try {
      const json = await adminFetch('list_control_center')
      setScraperControls(json.controls || [])
      setSourcePolicies(json.sources || [])
      setSourceStats(json.sourceStats || {})
    } catch (err: any) { setNotification({ type: 'error', message: `No se pudo cargar controles: ${err.message}` }) }
  }

  const updateScraperControl = async (scraperId: string, data: Record<string, any>) => {
    if (data.collection_enabled === true) {
      const control = scraperControls.find(item => item.scraper_id === scraperId)
      if (control?.quality_status !== 'healthy' && !window.confirm('Este scraper no figura como saludable. ¿Querés habilitarlo igualmente con revisión obligatoria?')) return
      if (control?.quality_status !== 'healthy') data.require_review = true
    }
    await adminFetch('update_scraper_control', { scraper_id: scraperId, data })
    setSelectedControl(current => current?.kind === 'scraper' && current.data.scraper_id === scraperId ? { ...current, data: { ...current.data, ...data } } : current)
    await loadControlCenter()
  }

  const updateSourcePolicy = async (source: string, data: Record<string, any>) => {
    if (data.auto_verify === true && !window.confirm('La verificación automática permitirá aprobar nuevos registros sin revisión manual. Usala sólo después de auditar esta fuente. ¿Continuar?')) return
    if (data.trust_level === 'blocked' && !window.confirm('Bloquear la fuente enviará los registros nuevos a cuarentena. Los datos existentes se conservarán. ¿Continuar?')) return
    await adminFetch('update_source_policy', { source, data })
    setSelectedControl(current => current?.kind === 'source' && current.data.source === source ? { ...current, data: { ...current.data, ...data } } : current)
    await loadControlCenter()
  }

  const reviewRecruiter = async (id: string, status: 'verified' | 'rejected' | 'in_review') => {
    try {
      await adminFetch('review_recruiter', { id, status })
      await loadTokens()
      setNotification({ type: 'success', message: status === 'verified' ? 'Empresa verificada y acceso habilitado' : 'Estado de empresa actualizado' })
    } catch (err: any) { setNotification({ type: 'error', message: err.message }) }
  }

  const loadTokens = async () => {
    try {
      const json = await adminFetch('list_tokens')
      setTokens(json.data || [])
    } catch { /* non-fatal */ }
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
      await adminFetch('save_content', { id: isEditing ? formData.id : null, data: dataToSave })
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
    await adminFetch('set_skill_status', { id, status: 'approved' })
    loadSkillCandidates()
    setNotification({ type: 'success', message: 'Habilidad aprobada' })
  }

  const rejectSkill = async (id: number) => {
    await adminFetch('set_skill_status', { id, status: 'rejected' })
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
    await adminFetch('set_content_active', { id: item.id, value: !item.is_active })
    loadContent()
  }

  const deleteItem = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este contenido?')) return
    await adminFetch('delete_content', { id })
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

                  {/* Metrics grid — row 1 */}
                  <div className="grid grid-cols-4 gap-px bg-white/[0.07] border border-white/[0.07]">
                    {[
                      { label: 'USUARIOS TOTALES', value: metrics.usuarios, sub: 'en base de datos' },
                      { label: 'PRO ACTIVOS', value: metrics.suscriptores, sub: 'is_subscribed = true' },
                      { label: 'OPORTUNIDADES', value: metrics.oportunidades, sub: 'activas hoy' },
                      { label: 'EMPRESAS B2B', value: metrics.empresasActivas, sub: 'tokens activos' },
                    ].map((m, i) => (
                      <div key={i} className="bg-[#080808] p-5">
                        <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase', marginBottom: '8px' }}>{m.label}</p>
                        <p style={{ fontFamily: MONO, fontSize: '2.5rem', lineHeight: 1, color: '#e8e8e0', fontWeight: 600 }}>{m.value}</p>
                        <p style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(232,232,224,0.25)', marginTop: '4px' }}>{m.sub}</p>
                      </div>
                    ))}
                  </div>
                  {/* Metrics grid — row 2 (deltas) */}
                  <div className="mt-px grid grid-cols-3 gap-px bg-white/[0.07]">
                    {[
                      { label: 'USUARIOS HOY', value: metrics.usuariosHoy, delta: metrics.usuariosHoy - metrics.usuariosAyer },
                      { label: 'USUARIOS ESTA SEMANA', value: metrics.usuariosEstaSemana, delta: null },
                      { label: 'AYER', value: metrics.usuariosAyer, delta: null },
                    ].map((m, i) => (
                      <div key={i} className="bg-[#080808] px-5 py-3 flex items-center justify-between">
                        <div>
                          <p style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.25)', textTransform: 'uppercase' }}>{m.label}</p>
                          <p style={{ fontFamily: MONO, fontSize: '1.8rem', lineHeight: 1.1, color: '#c9a84c', marginTop: '4px' }}>{m.value}</p>
                        </div>
                        {m.delta !== null && (
                          <span style={{ fontFamily: MONO, fontSize: '12px', color: m.delta >= 0 ? '#34d399' : '#f87171' }}>
                            {m.delta >= 0 ? '+' : ''}{m.delta} vs ayer
                          </span>
                        )}
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
                        <div className="grid grid-cols-5 gap-px bg-white/[0.04]">
                          {[
                            { label: 'TOTAL BD', value: scraperReport.totalOpportunities.toLocaleString('es-PY'), sub: 'tabla opportunities', color: '#c9a84c' },
                            { label: 'NUEVAS HOY', value: scraperReport.newLast24h.toLocaleString('es-PY'), sub: 'desde 00:00 PY', color: '#34d399' },
                            { label: 'NUEVAS 7D', value: scraperReport.newLast7d.toLocaleString('es-PY'), sub: 'últimos 7 días', color: '#c9a84c' },
                            { label: 'FUENTES', value: scraperReport.bySource.length.toString(), sub: 'cron nominal: 07:00 PY', color: '#c9a84c' },
                            { label: 'DUPLICADOS', value: scraperReport.duplicates.toLocaleString('es-PY'), sub: 'mismo título+empresa', color: scraperReport.duplicates > 100 ? '#f87171' : 'rgba(232,232,224,0.4)' },
                          ].map((m, i) => (
                            <div key={i} className="bg-[#080808] px-4 py-3">
                              <p style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.25)', textTransform: 'uppercase', marginBottom: '4px' }}>{m.label}</p>
                              <p style={{ fontFamily: MONO, fontSize: '1.5rem', lineHeight: 1, color: m.color, fontWeight: 600 }}>{m.value}</p>
                              <p style={{ fontFamily: MONO, fontSize: '9px', color: 'rgba(232,232,224,0.2)', marginTop: '3px' }}>{m.sub}</p>
                            </div>
                          ))}
                        </div>
                        {/* Real execution telemetry — failures first */}
                        <div className="border-t border-white/[0.07]">
                          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-[#0b0b0b]">
                            <div>
                              <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.14em', color: '#e8e8e0' }}>EJECUCIÓN MÁS RECIENTE POR SCRAPER</p>
                              <p style={{ fontFamily: MONO, fontSize: '9px', color: 'rgba(232,232,224,0.3)', marginTop: 3 }}>Errores y bloqueos aparecen primero · datos privados del workflow</p>
                            </div>
                            <div className="flex gap-3" style={{ fontFamily: MONO, fontSize: '10px' }}>
                              <span className="text-red-400">{(scraperReport.runSummary.critical || 0) + (scraperReport.runSummary.blocked || 0)} críticos</span>
                              <span className="text-amber-300">{scraperReport.runSummary.warning || 0} avisos</span>
                              <span className="text-emerald-400">{scraperReport.runSummary.healthy || 0} saludables</span>
                            </div>
                          </div>
                          {!scraperReport.telemetryAvailable ? (
                            <div className="px-4 py-4 border-t border-amber-400/20 bg-amber-400/[0.04] text-amber-300 text-xs" style={{ fontFamily: MONO }}>
                              Telemetría pendiente de activar. Las métricas históricas de fuentes siguen disponibles debajo.
                            </div>
                          ) : scraperReport.scraperRuns.length === 0 ? (
                            <div className="px-4 py-4 text-[rgba(232,232,224,0.35)] text-xs" style={{ fontFamily: MONO }}>
                              Todavía no hay ejecuciones monitorizadas. Aparecerán después del próximo workflow.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr className="border-t border-b border-white/[0.05]">
                                    {['ESTADO', 'SCRAPER', 'ENCONTRÓ', 'VÁLIDAS', 'ÚNICAS', 'NUEVAS', 'ACTUAL.', 'DUP.', 'RECH.', 'DURACIÓN', 'ÚLTIMA EJECUCIÓN', 'DETALLE'].map(h => (
                                      <th key={h} className="py-2 px-3 font-normal text-left tracking-widest text-[rgba(232,232,224,0.25)]" style={{ fontFamily: MONO, fontSize: '9px' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.03]">
                                  {scraperReport.scraperRuns.map(run => {
                                    const state = {
                                      critical: { color: '#f87171', label: 'CRÍTICO' },
                                      blocked: { color: '#fb7185', label: '0% INSERTÓ' },
                                      warning: { color: '#fde047', label: 'REVISAR' },
                                      unknown: { color: '#94a3b8', label: 'SIN MÉTRICA' },
                                      idle: { color: '#60a5fa', label: 'SIN HALLAZGOS' },
                                      healthy: { color: '#34d399', label: 'OK' },
                                    }[run.health_status]
                                    return (
                                      <tr key={run.id} className="align-top hover:bg-white/[0.02]">
                                        <td className="py-2.5 px-3"><span style={{ fontFamily: MONO, fontSize: 9, color: state.color }}>{state.label}</span></td>
                                        <td className="py-2.5 px-3" style={{ fontFamily: MONO, fontSize: 11, color: '#e8e8e0' }}>{run.scraper_name}</td>
                                        <td className="py-2.5 px-3 text-xs text-white/50">{run.found_count ?? '—'}</td>
                                        <td className="py-2.5 px-3 text-xs text-white/50">{run.valid_count ?? '—'}</td>
                                        <td className="py-2.5 px-3 text-xs text-white/50">{run.unique_count ?? '—'}</td>
                                        <td className="py-2.5 px-3 text-xs text-emerald-400">
                                          {run.inserted_count ?? '—'}{run.insertion_rate != null ? ` (${run.insertion_rate}%)` : ''}
                                        </td>
                                        <td className="py-2.5 px-3 text-xs text-sky-300/70">{run.updated_count ?? '—'}</td>
                                        <td className="py-2.5 px-3 text-xs text-white/35">{run.duplicate_count ?? '—'}</td>
                                        <td className="py-2.5 px-3 text-xs" style={{ color: run.rejected_count ? '#f87171' : 'rgba(232,232,224,0.25)' }}>{run.rejected_count ?? run.error_count}</td>
                                        <td className="py-2.5 px-3 text-xs text-white/40">{run.duration_seconds == null ? '—' : `${run.duration_seconds}s`}</td>
                                        <td className="py-2.5 px-3 text-[10px] text-white/40 whitespace-nowrap">{new Date(run.started_at).toLocaleString('es-PY')}</td>
                                        <td className="py-2.5 px-3 max-w-[360px]">
                                          <p className="text-[10px] text-red-300/80 line-clamp-3" style={{ fontFamily: MONO }}>{run.error_summary || (run.health_status === 'idle' ? 'Ejecutó correctamente, sin resultados nuevos' : 'Sin errores detectados')}</p>
                                          {run.consecutive_problems > 0 && <p className="text-[9px] text-white/30" style={{ fontFamily: MONO }}>{run.consecutive_problems} ejecución(es) sin inserción confirmada</p>}
                                          {run.github_run_url && <a href={run.github_run_url} target="_blank" rel="noreferrer" className="text-[9px] text-[#c9a84c] hover:underline">Abrir ejecución ↗</a>}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        {/* By source table */}
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b border-white/[0.05]">
                                {['', 'FUENTE', 'TOTAL', 'HOY', 'AYER', 'Δ', 'ÚLTIMA VEZ'].map((h, i) => (
                                  <th key={i} className={`py-2 px-3 font-normal text-left tracking-widest text-[rgba(232,232,224,0.25)]`} style={{ fontFamily: MONO, fontSize: '9px' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                              {scraperReport.bySource.map(s => {
                                const hoursSince = (Date.now() - new Date(s.lastSeen).getTime()) / 3600000
                                const light = hoursSince < 26 ? { color: '#34d399', label: 'OK' } : hoursSince < 50 ? { color: '#c9a84c', label: '~1d' } : { color: '#f87171', label: 'FALLA' }
                                const delta = s.newToday - s.newYesterday
                                return (
                                  <tr key={s.source} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="py-2 px-3">
                                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: light.color, display: 'inline-block' }} title={light.label} />
                                    </td>
                                    <td className="py-2 px-3" style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(232,232,224,0.7)' }}>{s.source}</td>
                                    <td className="py-2 px-3" style={{ fontFamily: MONO, fontSize: '11px', color: '#c9a84c' }}>{s.count.toLocaleString('es-PY')}</td>
                                    <td className="py-2 px-3" style={{ fontFamily: MONO, fontSize: '11px', color: s.newToday > 0 ? '#34d399' : 'rgba(232,232,224,0.25)' }}>
                                      {s.newToday > 0 ? `+${s.newToday}` : '—'}
                                    </td>
                                    <td className="py-2 px-3" style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(232,232,224,0.35)' }}>
                                      {s.newYesterday > 0 ? `+${s.newYesterday}` : '—'}
                                    </td>
                                    <td className="py-2 px-3" style={{ fontFamily: MONO, fontSize: '11px', color: delta > 0 ? '#34d399' : delta < 0 ? '#f87171' : 'rgba(232,232,224,0.2)' }}>
                                      {delta > 0 ? `+${delta}` : delta < 0 ? delta : '·'}
                                    </td>
                                    <td className="py-2 px-3" style={{ fontFamily: MONO, fontSize: '10px', color: light.color }}>
                                      {new Date(s.lastSeen).toLocaleDateString('es-PY')} {new Date(s.lastSeen).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
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

              {/* ── FUENTES Y POLÍTICAS ─────────────────────────────── */}
              {activeTab === 'fuentes' && (
                <div>
                  <div className="mb-6 flex items-end justify-between gap-6">
                    <div>
                      <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>CENTRO DE CONTROL</p>
                      <h2 className="mt-1 text-2xl text-[#e8e8e0]">Scrapers, fuentes y restricciones</h2>
                      <p className="mt-2 max-w-3xl text-sm text-white/45">Recolectar, verificar y distribuir son permisos distintos. Pausar un scraper no oculta lo aprobado; desactivar matching no elimina la oportunidad del catálogo.</p>
                    </div>
                    <button onClick={loadControlCenter} className="border border-white/10 px-3 py-2 text-xs text-white/50 transition hover:text-white" style={{ fontFamily: MONO }}>↻ ACTUALIZAR</button>
                  </div>

                  <div className="grid min-h-[700px] border border-white/[0.07] xl:grid-cols-[440px_1fr]">
                    <div className="border-b border-white/[0.07] xl:border-b-0 xl:border-r">
                      <div className="border-b border-white/[0.07] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/30" style={{ fontFamily: MONO }}>EJECUTORES · {scraperControls.filter(item => item.collection_enabled).length}/{scraperControls.length} activos</p>
                      </div>
                      <div className="max-h-[340px] overflow-y-auto">
                        {scraperControls.map(control => (
                          <button key={control.scraper_id} onClick={() => setSelectedControl({ kind: 'scraper', data: control })} className={`flex w-full items-center gap-3 border-b border-white/[0.05] px-4 py-3 text-left transition ${selectedControl?.kind === 'scraper' && selectedControl.data.scraper_id === control.scraper_id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.025]'}`}>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${control.collection_enabled ? 'bg-emerald-400' : 'bg-white/15'}`} />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm text-[#e8e8e0]">{control.scraper_name}</span><span className="block truncate text-[10px] text-white/25" style={{ fontFamily: MONO }}>{control.scraper_id} · {control.audit_status || control.quality_status || 'untested'}</span></span>
                            <span className="text-[9px] uppercase text-white/25" style={{ fontFamily: MONO }}>{control.require_review ? 'revisa' : 'directo'}</span>
                          </button>
                        ))}
                      </div>
                      <div className="border-y border-white/[0.07] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/30" style={{ fontFamily: MONO }}>FUENTES DETECTADAS · {sourcePolicies.length}</p>
                      </div>
                      <div className="max-h-[340px] overflow-y-auto">
                        {sourcePolicies.map(source => {
                          const stats = sourceStats[source.source] || {}
                          return <button key={source.source} onClick={() => setSelectedControl({ kind: 'source', data: source })} className={`flex w-full items-center gap-3 border-b border-white/[0.05] px-4 py-3 text-left transition ${selectedControl?.kind === 'source' && selectedControl.data.source === source.source ? 'bg-white/[0.06]' : 'hover:bg-white/[0.025]'}`}>
                            <span className={`h-2 w-2 shrink-0 rounded-full ${source.trust_level === 'trusted' ? 'bg-emerald-400' : source.trust_level === 'blocked' ? 'bg-red-400' : 'bg-amber-300'}`} />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm text-[#e8e8e0]">{source.display_name}</span><span className="block text-[10px] text-white/25" style={{ fontFamily: MONO }}>{stats.verified || 0} verificadas · {stats.pending || 0} pendientes</span></span>
                            <span className="text-[9px] uppercase text-white/25" style={{ fontFamily: MONO }}>{source.trust_level}</span>
                          </button>
                        })}
                      </div>
                    </div>

                    <div className="p-6 lg:p-8">
                      {!selectedControl ? (
                        <div className="flex min-h-[580px] items-center justify-center text-center"><div className="max-w-md"><AlertCircle className="mx-auto h-7 w-7 text-white/20" /><p className="mt-4 text-[#e8e8e0]">Elegí un ejecutor o una fuente.</p><p className="mt-2 text-sm leading-relaxed text-white/35">El panel explicará qué controla cada permiso antes de aplicarlo.</p></div></div>
                      ) : selectedControl.kind === 'scraper' ? (
                        <div key={selectedControl.data.scraper_id}>
                          <p className="text-[10px] uppercase tracking-[0.15em] text-[#c9a84c]" style={{ fontFamily: MONO }}>EJECUTOR</p>
                          <h3 className="mt-2 text-2xl text-[#e8e8e0]">{selectedControl.data.scraper_name}</h3>
                          <p className="mt-1 text-xs text-white/30" style={{ fontFamily: MONO }}>{selectedControl.data.script_path}</p>
                          <div className="mt-6 border border-white/[0.07] bg-white/[0.015] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[10px] uppercase tracking-[0.14em] text-[#c9a84c]" style={{ fontFamily: MONO }}>Auditoría real · {selectedControl.data.audit_status || 'sin probar'}</span><span className="text-[10px] text-white/30" style={{ fontFamily: MONO }}>{selectedControl.data.last_audited_at ? new Date(selectedControl.data.last_audited_at).toLocaleString('es-PY') : 'Sin fecha'}</span></div>
                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Encontradas', selectedControl.data.audit_found_count], ['Válidas', selectedControl.data.audit_valid_count], ['Únicas muestra', selectedControl.data.audit_unique_count], ['Revisadas', selectedControl.data.audit_sample_count]].map(([label, value]) => <div key={String(label)}><span className="block text-xl text-[#e8e8e0]">{value ?? '—'}</span><span className="text-[9px] uppercase tracking-[0.1em] text-white/30" style={{ fontFamily: MONO }}>{label}</span></div>)}</div>
                            {selectedControl.data.audit_notes && <p className="mt-4 text-xs leading-relaxed text-white/45">{selectedControl.data.audit_notes}</p>}
                          </div>
                          <div className="mt-7 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                            {[
                              ['collection_enabled', 'Ejecutar automáticamente', 'Si está apagado, GitHub registra la pausa y no abre el scraper.'],
                              ['require_review', 'Revisión obligatoria', 'Todo resultado nuevo queda pendiente aunque la fuente sea conocida.'],
                              ['auto_pause_on_failure', 'Pausa por fallas repetidas', 'Detiene el ejecutor al superar el umbral configurado.'],
                            ].map(([key, title, description]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-6 py-4"><span><span className="block text-sm text-[#e8e8e0]">{title}</span><span className="mt-1 block text-xs text-white/35">{description}</span></span><input type="checkbox" checked={!!selectedControl.data[key]} onChange={() => updateScraperControl(selectedControl.data.scraper_id, { [key]: !selectedControl.data[key] })} className="h-5 w-9 shrink-0 appearance-none rounded-full border border-white/15 bg-white/5 transition before:block before:h-4 before:w-4 before:rounded-full before:bg-white/30 before:transition checked:border-emerald-400/40 checked:bg-emerald-400/10 checked:before:translate-x-4 checked:before:bg-emerald-400" /></label>)}
                          </div>
                          <div className="mt-6 grid gap-4 sm:grid-cols-3">
                            {[['max_items_per_run', 'Máximo por corrida', 1, 5000], ['max_runtime_seconds', 'Tiempo máximo (s)', 30, 3600], ['consecutive_failures_before_pause', 'Fallas antes de pausar', 1, 20]].map(([key, label, min, max]) => <label key={String(key)} className="text-[10px] uppercase tracking-[0.1em] text-white/35">{label}<input type="number" min={Number(min)} max={Number(max)} defaultValue={selectedControl.data[String(key)]} onBlur={event => updateScraperControl(selectedControl.data.scraper_id, { [String(key)]: Number(event.target.value) })} className={`${inputCls} mt-2`} /></label>)}
                          </div>
                          <label className="mt-5 block text-[10px] uppercase tracking-[0.1em] text-white/35">Países permitidos<input defaultValue={(selectedControl.data.allowed_country_codes || []).join(', ')} onBlur={event => updateScraperControl(selectedControl.data.scraper_id, { allowed_country_codes: event.target.value.split(',').map(item => item.trim().toUpperCase()).filter(Boolean) })} className={`${inputCls} mt-2`} /></label>
                          {selectedControl.data.paused_reason && <p className="mt-5 border-l-2 border-amber-300/40 pl-3 text-xs leading-relaxed text-amber-100/60">Pausa: {selectedControl.data.paused_reason}</p>}
                        </div>
                      ) : (
                        <div key={selectedControl.data.source}>
                          <p className="text-[10px] uppercase tracking-[0.15em] text-[#c9a84c]" style={{ fontFamily: MONO }}>POLÍTICA DE FUENTE</p>
                          <h3 className="mt-2 text-2xl text-[#e8e8e0]">{selectedControl.data.display_name}</h3>
                          <p className="mt-1 text-xs text-white/30" style={{ fontFamily: MONO }}>{selectedControl.data.source}</p>
                          <div className="mt-6 grid gap-3 sm:grid-cols-[180px_1fr]">
                            <label className="text-[10px] uppercase tracking-[0.1em] text-white/35">Nivel de confianza<select value={selectedControl.data.trust_level} onChange={event => updateSourcePolicy(selectedControl.data.source, { trust_level: event.target.value })} className={`${inputCls} mt-2`}><option value="review">Requiere revisión</option><option value="trusted">Confiable</option><option value="blocked">Bloqueada</option></select></label>
                            <div className="border border-white/[0.07] px-4 py-3 text-xs leading-relaxed text-white/40">“Confiable” no habilita todo por sí solo. Los permisos de distribución siguen siendo independientes y visibles abajo.</div>
                          </div>
                          <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                            {[
                              ['is_enabled', 'Aceptar nuevos registros', 'Apagado: lo nuevo entra en cuarentena.'],
                              ['auto_verify', 'Verificación automática', 'Sólo usar después de auditar la fuente y sus datos.'],
                              ['catalog_enabled', 'Mostrar en catálogo', 'Hace visibles las verificadas en /empleos o /oportunidades según su tipo.'],
                              ['matching_enabled', 'Usar en matching', 'Permite recomendar verificadas según cada perfil.'],
                              ['alerts_enabled', 'Incluir en alertas', 'Permite notificaciones personalizadas.'],
                              ['seo_enabled', 'Publicar en SEO', 'Incluye páginas verificadas en sitemap y JobPosting.'],
                            ].map(([key, title, description]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-6 py-3.5"><span><span className="block text-sm text-[#e8e8e0]">{title}</span><span className="mt-0.5 block text-xs text-white/35">{description}</span></span><input type="checkbox" checked={!!selectedControl.data[key]} onChange={() => updateSourcePolicy(selectedControl.data.source, { [key]: !selectedControl.data[key] })} className="h-5 w-9 shrink-0 appearance-none rounded-full border border-white/15 bg-white/5 transition before:block before:h-4 before:w-4 before:rounded-full before:bg-white/30 before:transition checked:border-[#c9a84c]/45 checked:bg-[#c9a84c]/10 checked:before:translate-x-4 checked:before:bg-[#c9a84c]" /></label>)}
                          </div>
                          <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <label className="text-[10px] uppercase tracking-[0.1em] text-white/35">Máximo diario<input type="number" min="1" max="5000" defaultValue={selectedControl.data.max_items_per_day} onBlur={event => updateSourcePolicy(selectedControl.data.source, { max_items_per_day: Number(event.target.value) })} className={`${inputCls} mt-2`} /></label>
                            <label className="text-[10px] uppercase tracking-[0.1em] text-white/35">Retención (días)<input type="number" min="1" max="365" defaultValue={selectedControl.data.retention_days} onBlur={event => updateSourcePolicy(selectedControl.data.source, { retention_days: Number(event.target.value) })} className={`${inputCls} mt-2`} /></label>
                          </div>
                          <label className="mt-5 block text-[10px] uppercase tracking-[0.1em] text-white/35">Países permitidos<input defaultValue={(selectedControl.data.allowed_country_codes || []).join(', ')} onBlur={event => updateSourcePolicy(selectedControl.data.source, { allowed_country_codes: event.target.value.split(',').map(item => item.trim().toUpperCase()).filter(Boolean) })} className={`${inputCls} mt-2`} /></label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── VERIFICACIÓN DE OPORTUNIDADES ───────────────────── */}
              {activeTab === 'moderacion' && (
                <div>
                  <div className="mb-6 flex items-end justify-between gap-6">
                    <div>
                      <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>CONTROL DE CONFIANZA</p>
                      <h2 className="mt-1 text-2xl text-[#e8e8e0]">Bandeja de verificación</h2>
                      <p className="mt-2 max-w-2xl text-sm text-white/45">Nada se elimina automáticamente. Sólo las oportunidades verificadas aparecen en el catálogo y participan del matching.</p>
                    </div>
                    <button onClick={() => { loadOpportunityReviews(); loadReviewSummary() }} className="border border-white/10 px-3 py-2 text-xs text-white/50 transition hover:text-white" style={{ fontFamily: MONO }}>↻ ACTUALIZAR</button>
                  </div>

                  <div className="mb-5 grid grid-cols-2 gap-px border border-white/[0.07] bg-white/[0.07] sm:grid-cols-5">
                    {[
                      ['pending', 'Pendientes'], ['in_review', 'En revisión'], ['verified', 'Verificadas'], ['rejected', 'Rechazadas'], ['quarantined', 'Cuarentena'],
                    ].map(([status, label]) => (
                      <button key={status} onClick={() => setReviewStatus(status)} className={`bg-[#0a0a0a] px-4 py-3 text-left transition ${reviewStatus === status ? 'text-[#c9a84c]' : 'text-white/45 hover:text-white/70'}`}>
                        <span className="block text-xl text-inherit">{reviewSummary[status] || 0}</span>
                        <span className="text-[10px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO }}>{label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mb-5 border border-white/[0.07] bg-white/[0.015] p-4">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div><span className="block text-2xl text-[#e8e8e0]">{opportunityInventory.total}</span><span className="text-[10px] uppercase tracking-[0.12em] text-white/35" style={{ fontFamily: MONO }}>Inventario total</span></div>
                      <div className="text-right text-xs text-white/45"><span className="text-emerald-300/80">{opportunityInventory.published} publicadas</span> · {opportunityInventory.deletion_pending} por eliminar · {opportunityInventory.archived} archivadas · {opportunityInventory.deleted} eliminadas</div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {Object.entries(opportunityInventory.by_type).sort((a, b) => b[1] - a[1]).map(([type, count]) => <span key={type} className="border border-white/[0.08] px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50" style={{ fontFamily: MONO }}>{type.replaceAll('_', ' ')} · {count}</span>)}
                    </div>
                  </div>

                  <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_210px_170px_auto]">
                    <input value={reviewSearch} onChange={event => setReviewSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') loadOpportunityReviews() }} placeholder="Buscar cargo o empresa" className={inputCls} />
                    <select value={reviewSource} onChange={event => setReviewSource(event.target.value)} className={inputCls}>
                      <option value="all">Todas las fuentes</option>
                      {reviewSources.map(source => <option key={source.source} value={source.source}>{source.display_name}</option>)}
                    </select>
                    <select value={reviewLifecycle} onChange={event => setReviewLifecycle(event.target.value)} className={inputCls}>
                      <option value="active">Activas</option>
                      <option value="deletion_pending">Pendientes de eliminación</option>
                      <option value="archived">Archivadas</option>
                      <option value="deleted">Eliminadas</option>
                    </select>
                    <button onClick={loadOpportunityReviews} className="border border-[#c9a84c]/40 px-5 text-xs text-[#c9a84c] transition hover:bg-[#c9a84c]/10" style={{ fontFamily: MONO }}>FILTRAR</button>
                  </div>

                  <div className="grid min-h-[620px] border border-white/[0.07] lg:grid-cols-[380px_1fr]">
                    <div className="border-b border-white/[0.07] lg:border-b-0 lg:border-r">
                      <div className="border-b border-white/[0.07] px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-white/30" style={{ fontFamily: MONO }}>{opportunityReviews.length} resultados cargados</div>
                      <div className="max-h-[680px] overflow-y-auto">
                        {opportunityReviews.length === 0 ? <p className="p-8 text-center text-sm text-white/35">No hay registros con este filtro.</p> : opportunityReviews.map(opportunity => (
                          <button key={opportunity.id} onClick={() => openReview(opportunity)} className={`w-full border-b border-white/[0.05] px-4 py-4 text-left transition ${selectedReview?.id === opportunity.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.025]'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[9px] uppercase tracking-[0.13em] text-[#c9a84c]" style={{ fontFamily: MONO }}>{opportunity.source}</span>
                              <span className="text-[9px] uppercase text-white/25" style={{ fontFamily: MONO }}>{opportunity.verification_status.replace('_', ' ')}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm leading-snug text-[#e8e8e0]">{opportunity.title}</p>
                            <p className="mt-1 truncate text-xs text-white/40">{opportunity.organization || 'Organización no informada'} · {opportunity.location || 'Sin ubicación'}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-5 sm:p-7">
                      {!selectedReview ? (
                        <div className="flex min-h-[520px] items-center justify-center text-center">
                          <div className="max-w-sm">
                            <CheckCircle className="mx-auto h-7 w-7 text-white/20" />
                            <p className="mt-4 text-[#e8e8e0]">Seleccioná una oportunidad para revisar su evidencia.</p>
                            <p className="mt-2 text-sm text-white/35">La decisión siempre queda registrada y puede revertirse.</p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="border-b border-white/[0.07] pb-5">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-[#c9a84c]" style={{ fontFamily: MONO }}>{selectedReview.source} · {selectedReview.rubro || 'General'}</p>
                            <h3 className="mt-2 text-2xl leading-tight text-[#e8e8e0]">{selectedReview.title}</h3>
                            <div className="mt-3 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.1em]" style={{ fontFamily: MONO }}>
                              <span className="border border-white/10 px-2 py-1 text-white/45">{(selectedReview.opportunity_type || selectedReview.opportunity_kind || 'sin tipo').replaceAll('_', ' ')}</span>
                              <span className={`border px-2 py-1 ${selectedReview.source_authority === 'original' || selectedReview.original_source_verified ? 'border-emerald-400/25 text-emerald-300/70' : 'border-amber-300/25 text-amber-200/70'}`}>
                                {selectedReview.source_authority === 'original' || selectedReview.original_source_verified ? 'origen verificado' : 'falta verificar origen'}
                              </span>
                              {selectedReview.deadline && <span className="border border-white/10 px-2 py-1 text-white/45">cierra {new Date(selectedReview.deadline).toLocaleDateString('es-PY')}</span>}
                            </div>
                            <p className="mt-2 text-sm text-white/50">{selectedReview.organization || 'Organización no informada'} · {selectedReview.location || 'Sin ubicación'}</p>
                            <a href={selectedReview.application_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-xs text-[#c9a84c] hover:underline">Abrir enlace recolectado ↗</a>
                            {selectedReview.original_source_url && <a href={selectedReview.original_source_url} target="_blank" rel="noreferrer" className="ml-4 mt-4 inline-flex text-xs text-emerald-300/70 hover:underline">Abrir fuente original ↗</a>}
                            <button onClick={() => setEditingReview(value => !value)} className="ml-4 text-xs text-white/45 transition hover:text-white">{editingReview ? 'Cancelar edición' : 'Editar datos'}</button>
                          </div>

                          {editingReview && (
                            <div className="mt-5 border border-white/[0.07] p-4">
                              <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-white/30" style={{ fontFamily: MONO }}>EDICIÓN CONTROLADA</p>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {[
                                  ['title', 'Título'], ['organization', 'Organización'], ['location', 'Ubicación'], ['rubro', 'Área'], ['opportunity_kind', 'Clase de oportunidad'], ['type', 'Modalidad'], ['application_url', 'URL de postulación'],
                                ].map(([key, label]) => <label key={key} className="text-[10px] uppercase tracking-[0.1em] text-white/35">{label}<input value={reviewEditData[key] || ''} onChange={event => setReviewEditData(current => ({ ...current, [key]: event.target.value }))} className={`${inputCls} mt-1 normal-case tracking-normal`} /></label>)}
                              </div>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <label className="text-[10px] uppercase tracking-[0.1em] text-white/35">Tipo detallado<input value={reviewEditData.opportunity_type || ''} onChange={event => setReviewEditData(current => ({ ...current, opportunity_type: event.target.value }))} className={`${inputCls} mt-1 normal-case tracking-normal`} /></label>
                                <label className="text-[10px] uppercase tracking-[0.1em] text-white/35">Autoridad de fuente<select value={reviewEditData.source_authority || 'aggregator'} onChange={event => setReviewEditData(current => ({ ...current, source_authority: event.target.value }))} className={`${inputCls} mt-1 normal-case tracking-normal`}><option value="original">Publicador original</option><option value="aggregator">Agregador</option><option value="discovery">Solo descubrimiento</option></select></label>
                                <label className="text-[10px] uppercase tracking-[0.1em] text-white/35 sm:col-span-2">URL de fuente original<input value={reviewEditData.original_source_url || ''} onChange={event => setReviewEditData(current => ({ ...current, original_source_url: event.target.value }))} className={`${inputCls} mt-1 normal-case tracking-normal`} /></label>
                                <label className="flex items-center gap-3 text-[10px] uppercase tracking-[0.1em] text-white/45 sm:col-span-2"><input type="checkbox" checked={Boolean(reviewEditData.original_source_verified)} onChange={event => setReviewEditData(current => ({ ...current, original_source_verified: event.target.checked }))} className="h-4 w-4 accent-[#c9a84c]" />Confirmé manualmente la convocatoria en la fuente original</label>
                              </div>
                              <label className="mt-3 block text-[10px] uppercase tracking-[0.1em] text-white/35">Descripción<textarea rows={5} value={reviewEditData.description || ''} onChange={event => setReviewEditData(current => ({ ...current, description: event.target.value }))} className={`${inputCls} mt-1 resize-none normal-case tracking-normal`} /></label>
                              <button onClick={saveOpportunityEdit} className="mt-3 bg-[#c9a84c] px-4 py-2 text-xs text-black">Guardar cambios</button>
                            </div>
                          )}

                          <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_320px]">
                            <div>
                              <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-white/30" style={{ fontFamily: MONO }}>EVIDENCIA DISPONIBLE</p>
                              <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-white/55">{selectedReview.description || 'La fuente no proporcionó descripción. Verificá el enlace original antes de aprobar.'}</p>
                              <label className="mt-5 block text-[10px] uppercase tracking-[0.14em] text-white/30" style={{ fontFamily: MONO }}>NOTA DE REVISIÓN</label>
                              <textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} rows={4} placeholder="Qué comprobaste, qué falta o por qué tomaste esta decisión" className={`${inputCls} mt-2 resize-none`} />
                            </div>
                            <div className="border-l border-white/[0.07] xl:pl-6">
                              <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-white/30" style={{ fontFamily: MONO }}>CRITERIOS CUMPLIDOS</p>
                              <div className="space-y-3">
                                {Array.from(new Set([...REVIEW_CRITERIA, ...selectedCriteria])).map(criterion => (
                                  <label key={criterion} className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-white/55">
                                    <input type="checkbox" checked={selectedCriteria.includes(criterion)} onChange={() => setSelectedCriteria(current => current.includes(criterion) ? current.filter(item => item !== criterion) : [...current, criterion])} className="mt-0.5 h-3.5 w-3.5 shrink-0 appearance-none border border-white/25 checked:border-[#c9a84c] checked:bg-[#c9a84c]" />
                                    <span>{criterion}</span>
                                  </label>
                                ))}
                              </div>
                              <label className="mt-6 block text-[10px] uppercase tracking-[0.14em] text-white/30" style={{ fontFamily: MONO }}>CONFIANZA {reviewScore}/100</label>
                              <input type="range" min="0" max="100" value={reviewScore} onChange={event => setReviewScore(Number(event.target.value))} className="mt-3 w-full accent-[#c9a84c]" />
                              <p className="mb-3 mt-6 text-[10px] uppercase tracking-[0.14em] text-white/30" style={{ fontFamily: MONO }}>DISTRIBUCIÓN AL APROBAR</p>
                              <div className="space-y-2">
                                {[
                                  ['catalog', 'Mostrar en catálogo'], ['matching', 'Usar en matching'], ['alerts', 'Enviar en alertas'], ['seo', 'Incluir en SEO'],
                                ].map(([key, label]) => (
                                  <label key={key} className="flex items-center justify-between gap-4 text-xs text-white/55">
                                    <span>{label}</span>
                                    <input type="checkbox" checked={reviewFeatures[key as keyof typeof reviewFeatures]} onChange={() => setReviewFeatures(current => ({ ...current, [key]: !current[key as keyof typeof current] }))} className="h-4 w-7 appearance-none rounded-full border border-white/15 bg-white/5 transition before:block before:h-3 before:w-3 before:translate-x-0 before:rounded-full before:bg-white/35 before:transition checked:border-[#c9a84c]/50 checked:bg-[#c9a84c]/15 checked:before:translate-x-3 checked:before:bg-[#c9a84c]" />
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="mt-7 flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
                            <button disabled={loading} onClick={() => submitOpportunityReview('verified')} className="bg-[#c9a84c] px-5 py-2.5 text-xs font-medium text-black disabled:opacity-40">Verificar y aplicar permisos</button>
                            <button disabled={loading} onClick={() => submitOpportunityReview('in_review')} className="border border-white/15 px-4 py-2.5 text-xs text-white/60 hover:text-white">Dejar en revisión</button>
                            <button disabled={loading} onClick={() => submitOpportunityReview('quarantined')} className="border border-amber-400/25 px-4 py-2.5 text-xs text-amber-200/70">Cuarentena</button>
                            <button disabled={loading} onClick={() => submitOpportunityReview('rejected')} className="border border-red-400/20 px-4 py-2.5 text-xs text-red-300/70">Rechazar</button>
                            {reviewLifecycle === 'active' && <button disabled={loading} onClick={() => setOpportunityLifecycle('archive')} className="ml-auto border border-white/10 px-4 py-2.5 text-xs text-white/40">Archivar</button>}
                            {selectedReview.deletion_review_status === 'pending' ? <>
                              <button disabled={loading} onClick={() => setOpportunityLifecycle('cancel_delete')} className="border border-emerald-400/20 px-4 py-2.5 text-xs text-emerald-300/70">Conservar y corregir</button>
                              <button disabled={loading} onClick={() => setOpportunityLifecycle('confirm_delete')} className="border border-red-400/20 px-4 py-2.5 text-xs text-red-300/70">Confirmar eliminación</button>
                            </> : reviewLifecycle !== 'deleted' && <button disabled={loading} onClick={() => setOpportunityLifecycle('request_delete')} className="border border-red-400/10 px-4 py-2.5 text-xs text-red-300/40">Solicitar eliminación…</button>}
                            {reviewLifecycle !== 'active' && <button disabled={loading} onClick={() => setOpportunityLifecycle('restore')} className="border border-emerald-400/20 px-4 py-2.5 text-xs text-emerald-300/70">Restaurar</button>}
                          </div>
                        </div>
                      )}
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
                            {sub.user_id ? (
                              <button
                                onClick={() => toggleSubscription(sub.user_id, sub.is_subscribed)}
                                className={`text-[10px] px-2 py-0.5 border transition-colors ${sub.is_subscribed ? 'border-[#c9a84c]/50 text-[#c9a84c]' : 'border-white/10 text-[rgba(232,232,224,0.4)] hover:border-[#c9a84c]/30 hover:text-[#c9a84c]/60'}`}
                                style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                              >
                                {sub.is_subscribed ? '● PRO' : '○ FREE'}
                              </button>
                            ) : (
                              <span
                                title="Sin cuenta activa — el usuario aún no hizo login"
                                className="text-[10px] px-2 py-0.5 border border-white/[0.05] text-[rgba(232,232,224,0.2)] cursor-not-allowed"
                                style={{ fontFamily: MONO, letterSpacing: '0.1em' }}
                              >
                                ○ FREE
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {sub.user_id ? (
                              <button
                                onClick={() => toggleTestFlag(sub.user_id, sub.is_test ?? false)}
                                className="text-[10px] text-[rgba(232,232,224,0.3)] hover:text-[rgba(232,232,224,0.6)] transition-colors"
                                style={{ fontFamily: MONO }}
                              >
                                {sub.is_test ? 'marcar real' : 'marcar test'}
                              </button>
                            ) : (
                              <span style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(232,232,224,0.15)' }}>
                                sin login
                              </span>
                            )}
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
                          {['EMAIL', 'TOKEN', 'BALANCE', 'PLAN', 'VERIFICACIÓN', 'ACCIÓN'].map(h => (
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
                            <td className="py-3 px-4">
                              <span className={`text-[10px] uppercase tracking-[0.1em] ${token.verification_status === 'verified' ? 'text-emerald-400' : token.verification_status === 'rejected' ? 'text-red-400' : 'text-amber-300'}`} style={{ fontFamily: MONO }}>
                                {token.verification_status || 'pending'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                {token.verification_status !== 'verified' && <button onClick={() => reviewRecruiter(token.id, 'verified')} className="text-[10px] text-emerald-400/70 hover:text-emerald-400" style={{ fontFamily: MONO }}>APROBAR</button>}
                                {token.verification_status !== 'in_review' && <button onClick={() => reviewRecruiter(token.id, 'in_review')} className="text-[10px] text-amber-300/60 hover:text-amber-300" style={{ fontFamily: MONO }}>REVISAR</button>}
                                {token.verification_status !== 'rejected' && <button onClick={() => reviewRecruiter(token.id, 'rejected')} className="text-[10px] text-red-400/50 hover:text-red-400" style={{ fontFamily: MONO }}>RECHAZAR</button>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── B2B PROSPECTS ───────────────────────────────────────── */}
              {activeTab === 'prospects' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.15em', color: 'rgba(232,232,224,0.3)', textTransform: 'uppercase' }}>PIPELINE B2B</p>
                      <h2 className="text-xl text-[#e8e8e0] mt-0.5">B2B Prospects — {b2bProspects.length}</h2>
                    </div>
                    <button
                      onClick={loadB2bProspects}
                      className="text-xs text-[rgba(232,232,224,0.4)] hover:text-[#e8e8e0] border border-white/[0.07] px-3 py-1.5 transition-colors"
                      style={{ fontFamily: MONO }}
                    >
                      ↻ Actualizar
                    </button>
                  </div>

                  {b2bProspects.length === 0 ? (
                    <div className="border border-white/[0.07] p-8 text-sm text-[rgba(232,232,224,0.3)]">Sin prospects cargados. Insertar manualmente en Supabase tabla b2b_prospects.</div>
                  ) : (
                    <div className="border border-white/[0.07]">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-white/[0.05]">
                            {['EMPRESA', 'EMAIL', 'CONTACTO', 'STATUS', 'ACCIÓN'].map(h => (
                              <th key={h} className="text-left py-2.5 px-4 font-normal tracking-widest text-[rgba(232,232,224,0.3)]" style={{ fontFamily: MONO, fontSize: '10px' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {b2bProspects.map((p: any) => (
                            <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4 text-sm text-[#e8e8e0]">{p.company_name || '—'}</td>
                              <td className="py-3 px-4" style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(232,232,224,0.6)' }}>{p.email}</td>
                              <td className="py-3 px-4 text-sm text-[rgba(232,232,224,0.5)]">{p.contact_name || '—'}</td>
                              <td className="py-3 px-4">
                                <span className={`text-[10px] px-2 py-0.5 border ${
                                  p.status === 'activated' ? 'border-emerald-500/40 text-emerald-400'
                                  : p.status === 'invited' ? 'border-[#c9a84c]/40 text-[#c9a84c]'
                                  : 'border-white/10 text-[rgba(232,232,224,0.4)]'
                                }`} style={{ fontFamily: MONO, letterSpacing: '0.1em' }}>
                                  {(p.status || 'pending').toUpperCase()}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                {p.status === 'pending' && (
                                  <button
                                    onClick={async () => {
                                      const res = await fetch('/.netlify/functions/send-b2b-invite', {
                                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ password: adminPasswordRef.current, prospect_id: p.id }),
                                      })
                                      const data = await res.json()
                                      if (data.ok) { setNotification({ type: 'success', message: `Invitación enviada a ${p.email}` }); loadB2bProspects() }
                                      else setNotification({ type: 'error', message: data.error || 'Error' })
                                    }}
                                    className="text-[10px] text-sky-400/60 hover:text-sky-400 transition-colors"
                                    style={{ fontFamily: MONO }}
                                  >
                                    Enviar invitación →
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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
