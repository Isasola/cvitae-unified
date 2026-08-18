import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertCircle, CheckCircle2, Clock, Play, ChevronDown, ChevronUp, Sparkles, Check, X, Pencil, Shield, Eye, Ban, Search, Zap } from 'lucide-react'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const API_BASE = '/.netlify/functions'
const SITE_URL = 'https://cvitae.lat'

interface ClassificationReason {
  code: string
  message: string
  evidence?: string
  severity: 'block' | 'review' | 'info'
}

interface Classification {
  publicationDecision: 'AUTO_APPROVE' | 'REVIEW' | 'BLOCK'
  seoDecision: 'ELIGIBLE' | 'REVIEW' | 'EXCLUDE'
  jobPostingDecision: 'EMIT' | 'SKIP'
  reasons: ClassificationReason[]
  safeAutoActions: string[]
}

interface SeoItem {
  id: string
  slug: string | null
  title: string | null
  organization: string | null
  source: string | null
  opportunity_type: string | null
  type: string | null
  seo_status: 'eligible' | 'review' | 'blocked' | null
  jobposting_validity: 'valid' | 'incomplete' | 'not_applicable' | null
  seo_issues: Array<{ field: string; reason: string; severity: string }> | null
  seo_missing_fields: string[] | null
  seo_checked_at: string | null
  verification_status: string
  is_active: boolean
  classification?: Classification
}

interface Summary {
  eligible: number
  review: number
  blocked: number
  unchecked: number
  flags: Record<string, boolean>
}

interface QueueEntry {
  id: string
  url: string
  event_type: 'URL_UPDATED' | 'URL_DELETED'
  status: 'dry_run' | 'pending' | 'sent' | 'failed'
  dry_run: boolean
  created_at: string
}

interface CrawlResult {
  url: string
  status: number | null
  title: string | null
  canonical: string | null
  noindex: boolean
  hasJsonLd: boolean
  jsonLdTypes: string[]
  renderMismatch: boolean
  error: string | null
}

type SeoFilter = 'all' | 'eligible' | 'review' | 'blocked' | 'unchecked'
type PubFilter = 'all' | 'AUTO_APPROVE' | 'REVIEW' | 'BLOCK'

interface SuggestionItem {
  id: string
  opportunity_id: string
  field: string
  current_value: string | null
  suggested_value: string
  confidence: number
  evidence: string | null
  source: string
  status: 'pending' | 'accepted' | 'edited' | 'ignored'
}

const SEO_STATUS_STYLE: Record<string, { label: string; color: string; dot: string }> = {
  eligible: { label: 'Elegible', color: 'text-emerald-300 border-emerald-400/25', dot: 'bg-emerald-400' },
  review: { label: 'Revisión', color: 'text-amber-200 border-amber-300/25', dot: 'bg-amber-300' },
  blocked: { label: 'Bloqueado', color: 'text-red-300 border-red-400/25', dot: 'bg-red-400' },
}

const PUB_STYLE: Record<string, { label: string; color: string; icon: any }> = {
  AUTO_APPROVE: { label: 'AUTO', color: 'text-emerald-300 border-emerald-400/20 bg-emerald-400/5', icon: Zap },
  REVIEW: { label: 'REVISAR', color: 'text-amber-200 border-amber-300/20 bg-amber-300/5', icon: Eye },
  BLOCK: { label: 'BLOQUEAR', color: 'text-red-300 border-red-400/20 bg-red-400/5', icon: Ban },
}

const VALIDITY_STYLE: Record<string, { label: string; color: string }> = {
  valid: { label: 'JobPosting válido', color: 'text-emerald-300' },
  incomplete: { label: 'Incompleto', color: 'text-amber-200' },
  not_applicable: { label: 'N/A (Beca/Fellowship)', color: 'text-white/30' },
}

interface Props {
  adminPassword: string
}

export default function AdminSeoControlCenter({ adminPassword }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [items, setItems] = useState<SeoItem[]>([])
  const [seoFilter, setSeoFilter] = useState<SeoFilter>('unchecked')
  const [pubFilter, setPubFilter] = useState<PubFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [runningBulk, setRunningBulk] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [lastBulkResult, setLastBulkResult] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionItem[]>>({})
  const [loadingSugg, setLoadingSugg] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [batchAccepting, setBatchAccepting] = useState(false)
  const [crawlResults, setCrawlResults] = useState<Record<string, CrawlResult | null>>({})
  const [crawlingId, setCrawlingId] = useState<string | null>(null)
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([])
  const [showQueue, setShowQueue] = useState(false)
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [showAutoApprove, setShowAutoApprove] = useState(false)
  const [autoApproveLoading, setAutoApproveLoading] = useState(false)
  const [autoApprovePreviewData, setAutoApprovePreviewData] = useState<{
    evaluated: number; autoApprove: number; review: number; blocked: number; batchLimit: number;
    autoApproveIds: string[]
    items: Array<{ id: string; title: string; source: string; publicationDecision: string; reasons: ClassificationReason[] }>
  } | null>(null)
  const [autoApproveResult, setAutoApproveResult] = useState<string | null>(null)

  const load = useCallback(async (f: SeoFilter = seoFilter) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin-seo?filter=${f}&limit=100`, {
        headers: { 'x-admin-password': adminPassword },
      })
      const data = await res.json()
      setSummary(data.summary)
      setItems(data.items || [])
    } catch (err) {
      console.error('[AdminSeoControlCenter]', err)
    } finally {
      setLoading(false)
    }
  }, [adminPassword, seoFilter])

  useEffect(() => { load(seoFilter) }, [seoFilter])

  const runPipeline = async (id: string) => {
    setRunningId(id)
    try {
      await fetch(`${API_BASE}/admin-seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'run_pipeline', opportunityId: id }),
      })
      await load(seoFilter)
    } finally {
      setRunningId(null)
    }
  }

  const runBulk = async () => {
    setRunningBulk(true)
    setLastBulkResult(null)
    try {
      const res = await fetch(`${API_BASE}/admin-seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'run_bulk_pipeline' }),
      })
      const data = await res.json()
      if (data.skipped) setLastBulkResult('Pipeline desactivado (flag SEO_PIPELINE_V2 = off)')
      else if (data.dryRun) setLastBulkResult(`DRY RUN: ${data.processed} procesados — ${data.ok} ok, ${data.failed} fallidos`)
      else setLastBulkResult(`${data.processed} procesados — ${data.ok} ok, ${data.failed} fallidos`)
      await load(seoFilter)
    } finally {
      setRunningBulk(false)
    }
  }

  const loadQueueEntries = async () => {
    setLoadingQueue(true)
    try {
      const res = await fetch(`${API_BASE}/admin-seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'google_queue_recent' }),
      })
      const data = await res.json()
      setQueueEntries(data.entries || [])
    } finally {
      setLoadingQueue(false)
    }
  }

  const crawlItem = async (item: SeoItem) => {
    if (!item.slug) return
    setCrawlingId(item.id)
    try {
      const oppType = item.opportunity_type || ''
      const prefix = ['job', 'internship', 'consultancy'].includes(oppType) ? 'empleos' : 'oportunidades'
      const url = `${SITE_URL}/${prefix}/${item.slug}`
      const res = await fetch(`${API_BASE}/seo-crawler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ urls: [url] }),
      })
      const data = await res.json()
      const result = data.results?.[0] ?? null
      setCrawlResults(prev => ({ ...prev, [item.id]: result }))
      setExpanded(prev => ({ ...prev, [item.id]: true }))
    } finally {
      setCrawlingId(null)
    }
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const loadSuggestions = async (oppId: string) => {
    setLoadingSugg(prev => ({ ...prev, [oppId]: true }))
    try {
      const res = await fetch(`${API_BASE}/admin-seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'get_suggestions', opportunityId: oppId }),
      })
      const data = await res.json()
      setSuggestions(prev => ({ ...prev, [oppId]: data.suggestions || [] }))
    } finally {
      setLoadingSugg(prev => ({ ...prev, [oppId]: false }))
    }
  }

  const generateSuggestions = async (oppId: string) => {
    setLoadingSugg(prev => ({ ...prev, [oppId]: true }))
    try {
      await fetch(`${API_BASE}/admin-seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'generate_suggestions', opportunityId: oppId }),
      })
      await loadSuggestions(oppId)
    } finally {
      setLoadingSugg(prev => ({ ...prev, [oppId]: false }))
    }
  }

  const acceptSuggestion = async (suggId: string, oppId: string) => {
    await fetch(`${API_BASE}/admin-seo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ action: 'accept_suggestion', suggestionId: suggId }),
    })
    setSuggestions(prev => ({ ...prev, [oppId]: (prev[oppId] || []).filter(s => s.id !== suggId) }))
  }

  const editSuggestion = async (suggId: string, oppId: string, newValue: string) => {
    await fetch(`${API_BASE}/admin-seo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ action: 'edit_suggestion', suggestionId: suggId, newValue }),
    })
    setEditingId(null)
    setSuggestions(prev => ({ ...prev, [oppId]: (prev[oppId] || []).filter(s => s.id !== suggId) }))
  }

  const ignoreSuggestion = async (suggId: string, oppId: string) => {
    await fetch(`${API_BASE}/admin-seo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ action: 'ignore_suggestion', suggestionId: suggId }),
    })
    setSuggestions(prev => ({ ...prev, [oppId]: (prev[oppId] || []).filter(s => s.id !== suggId) }))
  }

  const batchAcceptSafe = async () => {
    setBatchAccepting(true)
    try {
      const res = await fetch(`${API_BASE}/admin-seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'batch_accept_safe' }),
      })
      const data = await res.json()
      setLastBulkResult(`Batch-accept: ${data.accepted} aceptadas, ${data.skipped} omitidas (solo campos seguros, conf ≥ 0.95)`)
      setSuggestions({})
    } finally {
      setBatchAccepting(false)
    }
  }

  const previewAutoApprove = async () => {
    setAutoApproveLoading(true)
    setAutoApproveResult(null)
    try {
      const res = await fetch(`${API_BASE}/admin-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'auto_approve_classified', payload: { mode: 'preview' } }),
      })
      const data = await res.json()
      setAutoApprovePreviewData(data)
    } finally {
      setAutoApproveLoading(false)
    }
  }

  const confirmAutoApprove = async () => {
    const candidateIds = autoApprovePreviewData?.autoApproveIds
    if (!candidateIds?.length) return
    setAutoApproveLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'auto_approve_classified', payload: { mode: 'confirm', candidateIds } }),
      })
      const data = await res.json()
      setAutoApproveResult(`Confirmado: ${data.confirmed} aprobados, ${data.skipped} omitidos`)
      setAutoApprovePreviewData(null)
      await load(seoFilter)
    } finally {
      setAutoApproveLoading(false)
    }
  }

  // Apply client-side pub decision filter + source filter
  const allSources = ['all', ...Array.from(new Set(items.map(i => i.source || 'unknown'))).sort()]
  const visibleItems = items.filter(item => {
    if (pubFilter !== 'all' && item.classification?.publicationDecision !== pubFilter) return false
    if (sourceFilter !== 'all' && (item.source || 'unknown') !== sourceFilter) return false
    return true
  })

  // Publication decision counts from current loaded items
  const pubCounts = {
    AUTO_APPROVE: items.filter(i => i.classification?.publicationDecision === 'AUTO_APPROVE').length,
    REVIEW: items.filter(i => i.classification?.publicationDecision === 'REVIEW').length,
    BLOCK: items.filter(i => i.classification?.publicationDecision === 'BLOCK').length,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">SEO</p>
          <h2 className="font-display text-3xl text-cream">Centro de control SEO</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => load(seoFilter)} disabled={loading}
            className="flex items-center gap-2 border border-white/10 px-3 py-2 text-xs text-white/55 transition hover:border-white/25 hover:text-cream disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button onClick={runBulk} disabled={runningBulk || loading}
            className="flex items-center gap-2 border border-[#c9a84c]/40 bg-[#c9a84c]/10 px-3 py-2 text-xs text-[#c9a84c] transition hover:bg-[#c9a84c]/20 disabled:opacity-40">
            <Play className="h-3.5 w-3.5" /> Correr pipeline
          </button>
          <button onClick={batchAcceptSafe} disabled={batchAccepting}
            className="flex items-center gap-2 border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-300 transition hover:bg-emerald-400/10 disabled:opacity-40"
            title="Acepta sugerencias con conf ≥ 0.95 en campos seguros">
            <CheckCircle2 className="h-3.5 w-3.5" /> Batch-accept seguro
          </button>
          <button onClick={() => { setShowQueue(q => !q); if (!showQueue) loadQueueEntries() }}
            className="flex items-center gap-2 border border-white/10 px-3 py-2 text-xs text-white/55 transition hover:border-white/25 hover:text-cream">
            <Search className="h-3.5 w-3.5" /> Cola Google
          </button>
          <button onClick={() => { setShowAutoApprove(v => !v); if (!showAutoApprove) previewAutoApprove() }}
            className="flex items-center gap-2 border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-300 transition hover:bg-emerald-400/10 disabled:opacity-40"
            disabled={autoApproveLoading}>
            <Zap className="h-3.5 w-3.5" /> Procesar seguros
          </button>
        </div>
      </div>

      {/* Flags banner */}
      {summary?.flags && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.flags).map(([key, val]) => (
            <span key={key} className={`border px-2 py-0.5 text-[10px] ${val ? 'border-emerald-400/30 text-emerald-300' : 'border-white/10 text-white/30'}`}
              style={{ fontFamily: MONO }}>
              {key}: {val ? 'ON' : 'OFF'}
            </span>
          ))}
          <span className="border border-white/10 px-2 py-0.5 text-[10px] text-white/30" style={{ fontFamily: MONO }}>
            MANUAL_AI: {summary.flags.SEO_AI_SUGGESTIONS ? 'YES' : 'NO (flag off)'}
          </span>
        </div>
      )}

      {lastBulkResult && (
        <p className="border border-[#c9a84c]/25 bg-[#c9a84c]/5 px-4 py-2.5 text-xs text-[#c9a84c]">{lastBulkResult}</p>
      )}

      {/* Auto-approve panel */}
      {showAutoApprove && (
        <div className="border border-emerald-400/20 bg-[#060606] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-emerald-300/60">Aprobación automática — pendientes/en_revisión (lote máx. 25)</p>
            {autoApproveLoading && <RefreshCw className="h-3 w-3 animate-spin text-white/30" />}
          </div>
          {autoApproveResult && (
            <p className="border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-[11px] text-emerald-300">{autoApproveResult}</p>
          )}
          {autoApprovePreviewData && !autoApproveResult && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <span className="border border-emerald-400/25 px-3 py-1 text-[11px] text-emerald-300" style={{ fontFamily: MONO }}>
                  AUTO_APPROVE: {autoApprovePreviewData.autoApprove}
                </span>
                <span className="border border-amber-300/20 px-3 py-1 text-[11px] text-amber-200" style={{ fontFamily: MONO }}>
                  REVIEW: {autoApprovePreviewData.review}
                </span>
                <span className="border border-red-400/20 px-3 py-1 text-[11px] text-red-300" style={{ fontFamily: MONO }}>
                  BLOCK: {autoApprovePreviewData.blocked}
                </span>
                <span className="border border-white/10 px-3 py-1 text-[11px] text-white/30" style={{ fontFamily: MONO }}>
                  evaluados: {autoApprovePreviewData.evaluated} / {autoApprovePreviewData.batchLimit}
                </span>
              </div>
              {autoApprovePreviewData.items.length > 0 && (
                <div className="max-h-52 overflow-y-auto space-y-px">
                  {autoApprovePreviewData.items.map(item => {
                    const ps = PUB_STYLE[item.publicationDecision]
                    return (
                      <div key={item.id} className={`flex items-start justify-between gap-3 border px-3 py-2 text-[11px] ${ps?.color || 'border-white/8 text-white/40'}`}>
                        <span className="flex-1 truncate text-white/70">{item.title || item.id}</span>
                        <span className="shrink-0 text-white/30">{item.source}</span>
                        <span className="shrink-0" style={{ fontFamily: MONO }}>{item.publicationDecision}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {autoApprovePreviewData.autoApprove > 0 && (
                <button onClick={confirmAutoApprove} disabled={autoApproveLoading}
                  className="flex items-center gap-2 border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-xs text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-40">
                  <Check className="h-3.5 w-3.5" />
                  Confirmar — aprobar {autoApprovePreviewData.autoApprove} registro{autoApprovePreviewData.autoApprove !== 1 ? 's' : ''}
                </button>
              )}
              {autoApprovePreviewData.autoApprove === 0 && (
                <p className="text-[11px] text-white/30">No hay registros aptos para aprobación automática en este lote.</p>
              )}
            </div>
          )}
          {!autoApprovePreviewData && !autoApproveLoading && !autoApproveResult && (
            <button onClick={previewAutoApprove}
              className="text-[11px] text-emerald-300/60 hover:text-emerald-300">Cargar preview</button>
          )}
        </div>
      )}

      {/* Google Queue panel */}
      {showQueue && (
        <div className="border border-white/8 bg-[#060606] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-white/30">Cola Google Indexing (últimas 20)</p>
            <button onClick={loadQueueEntries} disabled={loadingQueue} className="text-[10px] text-[#c9a84c]/60 hover:text-[#c9a84c] disabled:opacity-40">
              {loadingQueue ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Recargar'}
            </button>
          </div>
          {queueEntries.length === 0 ? (
            <p className="text-[11px] text-white/20">Sin entradas recientes.</p>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-white/25">
                  <th className="pb-1 text-left font-normal">URL</th>
                  <th className="pb-1 text-left font-normal">Evento</th>
                  <th className="pb-1 text-left font-normal">Estado</th>
                  <th className="pb-1 text-left font-normal">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {queueEntries.map(e => (
                  <tr key={e.id} className="border-t border-white/[0.04]">
                    <td className="py-1 pr-4 text-white/50 truncate max-w-[260px]">{e.url.replace('https://cvitae.lat', '')}</td>
                    <td className="py-1 pr-4" style={{ fontFamily: MONO }}>
                      <span className={e.event_type === 'URL_UPDATED' ? 'text-emerald-300' : 'text-red-300'}>{e.event_type}</span>
                    </td>
                    <td className="py-1 pr-4" style={{ fontFamily: MONO }}>
                      <span className={
                        e.status === 'dry_run' ? 'text-amber-200' :
                        e.status === 'sent' ? 'text-emerald-300' :
                        e.status === 'failed' ? 'text-red-300' : 'text-white/40'
                      }>{e.status}</span>
                      {e.dry_run && <span className="ml-1 text-white/20">(dry)</span>}
                    </td>
                    <td className="py-1 text-white/25">{new Date(e.created_at).toLocaleDateString('es-PY')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* SEO status summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-px bg-white/[0.05] sm:grid-cols-4">
          {[
            { key: 'eligible' as SeoFilter, count: summary.eligible, label: 'Elegibles SEO', color: 'text-emerald-300' },
            { key: 'review' as SeoFilter, count: summary.review, label: 'En revisión SEO', color: 'text-amber-200' },
            { key: 'blocked' as SeoFilter, count: summary.blocked, label: 'Bloqueados SEO', color: 'text-red-300' },
            { key: 'unchecked' as SeoFilter, count: summary.unchecked, label: 'Sin evaluar', color: 'text-white/40' },
          ].map(card => (
            <button key={card.key} onClick={() => setSeoFilter(card.key)}
              className={`bg-[#080808] p-4 text-left transition hover:bg-white/[0.025] ${seoFilter === card.key ? 'outline outline-1 outline-[#c9a84c]/40' : ''}`}>
              <p className={`font-display text-3xl ${card.color}`} style={{ fontFamily: MONO }}>{card.count.toLocaleString('es-PY')}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-white/30">{card.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Publication decision filter (client-side, based on loaded items) */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] uppercase tracking-wider text-white/25">Decisión</span>
        {(['all', 'AUTO_APPROVE', 'REVIEW', 'BLOCK'] as PubFilter[]).map(f => {
          const style = f !== 'all' ? PUB_STYLE[f] : null
          const count = f === 'all' ? items.length : pubCounts[f as keyof typeof pubCounts]
          return (
            <button key={f} onClick={() => setPubFilter(f)}
              className={`flex items-center gap-1.5 border px-3 py-1 text-[10px] transition ${pubFilter === f ? (style ? style.color : 'border-[#c9a84c]/40 text-[#c9a84c]') : 'border-white/8 text-white/35 hover:text-white/60'}`}>
              {f !== 'all' && style && <style.icon className="h-3 w-3" />}
              {f === 'all' ? 'Todos' : f} <span className="text-white/30">({count})</span>
            </button>
          )
        })}
        <span className="ml-2 text-[10px] uppercase tracking-wider text-white/25">Fuente</span>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="border border-white/10 bg-[#080808] px-2 py-1 text-[10px] text-white/50 outline-none hover:border-white/25">
          {allSources.map(s => <option key={s} value={s}>{s === 'all' ? 'Todas' : s}</option>)}
        </select>
      </div>

      {/* SEO status tabs */}
      <div className="flex gap-1 border-b border-white/8">
        {(['all', 'eligible', 'review', 'blocked', 'unchecked'] as SeoFilter[]).map(f => (
          <button key={f} onClick={() => setSeoFilter(f)}
            className={`px-4 py-2 text-xs transition ${seoFilter === f ? 'border-b border-[#c9a84c] text-[#c9a84c]' : 'text-white/35 hover:text-white/60'}`}>
            {f === 'all' ? 'Todos' : f === 'eligible' ? 'Elegibles' : f === 'review' ? 'Revisión SEO' : f === 'blocked' ? 'Bloqueados' : 'Sin evaluar'}
          </button>
        ))}
      </div>

      {/* Items list */}
      {loading && items.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/30">Cargando…</p>
      ) : visibleItems.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/30">
          {items.length === 0 ? 'No hay ítems en esta categoría.' : `Sin resultados para los filtros aplicados (${items.length} total cargados).`}
        </p>
      ) : (
        <div className="space-y-px">
          {visibleItems.map(item => {
            const seoStatusStyle = item.seo_status ? SEO_STATUS_STYLE[item.seo_status] : null
            const validity = item.jobposting_validity ? VALIDITY_STYLE[item.jobposting_validity] : null
            const issues = item.seo_issues || []
            const classification = item.classification
            const pubStyle = classification ? PUB_STYLE[classification.publicationDecision] : null
            const isExpanded = expanded[item.id]
            const crawl = crawlResults[item.id]
            const actionableReasons = classification?.reasons.filter(r => r.severity !== 'info') || []

            return (
              <div key={item.id} className="border border-white/[0.06] bg-[#080808]">
                <div className="flex items-start gap-4 p-4">
                  {/* Status dot */}
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${seoStatusStyle?.dot || 'bg-white/20'}`} />

                  <div className="min-w-0 flex-1">
                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-2">
                      {seoStatusStyle && (
                        <span className={`border px-2 py-0.5 text-[10px] ${seoStatusStyle.color}`} style={{ fontFamily: MONO }}>
                          SEO:{seoStatusStyle.label}
                        </span>
                      )}
                      {pubStyle && classification && (
                        <span className={`flex items-center gap-1 border px-2 py-0.5 text-[10px] ${pubStyle.color}`} style={{ fontFamily: MONO }}>
                          <pubStyle.icon className="h-3 w-3" />
                          {pubStyle.label}
                        </span>
                      )}
                      {validity && (
                        <span className={`text-[10px] ${validity.color}`} style={{ fontFamily: MONO }}>
                          JP:{validity.label}
                        </span>
                      )}
                      {classification && (
                        <span className={`text-[10px] ${classification.jobPostingDecision === 'EMIT' ? 'text-emerald-300/60' : 'text-white/25'}`} style={{ fontFamily: MONO }}>
                          JP:{classification.jobPostingDecision}
                        </span>
                      )}
                      {item.seo_missing_fields && item.seo_missing_fields.length > 0 && (
                        <span className="text-[10px] text-white/25" style={{ fontFamily: MONO }}>
                          missing:{item.seo_missing_fields.join(',')}
                        </span>
                      )}
                    </div>

                    <p className="mt-1.5 text-sm text-cream">{item.title || '(sin título)'}</p>
                    <p className="mt-0.5 text-[11px] text-white/30">
                      {item.organization || 'Sin org'} · {item.source || 'Sin fuente'}
                      {item.seo_checked_at && ` · Evaluado ${new Date(item.seo_checked_at).toLocaleDateString('es-PY')}`}
                    </p>

                    {/* Classification reasons summary */}
                    {actionableReasons.length > 0 && (
                      <button onClick={() => toggleExpand(item.id)}
                        className="mt-2 flex items-center gap-1 text-[10px] text-white/35 hover:text-white/60">
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {actionableReasons.length} {actionableReasons.length === 1 ? 'razón' : 'razones'} · {issues.length > 0 ? `${issues.length} problema(s) SEO` : 'Ver detalle'}
                      </button>
                    )}
                    {(issues.length > 0 || crawl) && !actionableReasons.length && (
                      <button onClick={() => toggleExpand(item.id)}
                        className="mt-2 flex items-center gap-1 text-[10px] text-white/35 hover:text-white/60">
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {issues.length} problema(s) SEO
                      </button>
                    )}

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-3 space-y-3">
                        {/* Classification reasons */}
                        {actionableReasons.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/25">Razones de clasificación</p>
                            <ul className="space-y-1">
                              {actionableReasons.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px]">
                                  {r.severity === 'block'
                                    ? <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                                    : <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />}
                                  <span>
                                    <span className="text-white/50" style={{ fontFamily: MONO }}>[{r.code}]</span>{' '}
                                    <span className="text-white/70">{r.message}</span>
                                    {r.evidence && (
                                      <span className="ml-1 italic text-white/30">"{r.evidence.slice(0, 80)}"</span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* SEO pipeline issues */}
                        {issues.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/25">Problemas SEO pipeline</p>
                            <ul className="space-y-1">
                              {issues.map((issue, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px] text-white/40">
                                  {issue.severity === 'blocking'
                                    ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                                    : <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />}
                                  <span><span className="text-white/60">{issue.field}:</span> {issue.reason}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Post-publish crawl result */}
                        {crawl && (
                          <div className="border border-white/[0.06] bg-[#060606] p-3">
                            <p className="mb-2 text-[10px] uppercase tracking-wider text-white/25">Post-publish QA</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                              <span className="text-white/30">HTTP</span>
                              <span className={crawl.status === 200 ? 'text-emerald-300' : 'text-red-300'}>{crawl.status ?? 'error'} {crawl.error ? `(${crawl.error})` : ''}</span>
                              <span className="text-white/30">Canonical</span>
                              <span className="text-white/60 truncate">{crawl.canonical || '(none)'}</span>
                              <span className="text-white/30">Noindex</span>
                              <span className={crawl.noindex ? 'text-red-300' : 'text-emerald-300'}>{crawl.noindex ? 'SÍ ⚠' : 'No'}</span>
                              <span className="text-white/30">JSON-LD</span>
                              <span className={crawl.hasJsonLd ? 'text-emerald-300' : 'text-amber-200'}>{crawl.hasJsonLd ? crawl.jsonLdTypes.join(', ') : '(ninguno)'}</span>
                              <span className="text-white/30">Render mismatch</span>
                              <span className={crawl.renderMismatch ? 'text-amber-200' : 'text-emerald-300'}>{crawl.renderMismatch ? 'Sí ⚠' : 'No'}</span>
                              <span className="text-white/30">Title</span>
                              <span className="text-white/50 truncate">{crawl.title || '(none)'}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-col gap-1">
                    <button onClick={() => crawlItem(item)} disabled={crawlingId === item.id || !item.slug}
                      className="flex items-center gap-1 border border-white/10 px-3 py-1.5 text-[10px] text-white/45 transition hover:border-white/25 hover:text-cream disabled:opacity-40"
                      title="Post-publish QA">
                      {crawlingId === item.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                    </button>
                    <button onClick={() => { loadSuggestions(item.id); setExpanded(prev => ({ ...prev, [item.id]: true })) }}
                      disabled={loadingSugg[item.id]}
                      className="border border-white/10 px-3 py-1.5 text-[10px] text-white/45 transition hover:border-white/25 hover:text-cream disabled:opacity-40"
                      title="Ver/generar sugerencias AI">
                      {loadingSugg[item.id] ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    </button>
                    <button onClick={() => runPipeline(item.id)} disabled={runningId === item.id}
                      className="border border-white/10 px-3 py-1.5 text-[10px] text-white/45 transition hover:border-white/25 hover:text-cream disabled:opacity-40"
                      title="Re-run pipeline SEO">
                      {runningId === item.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {/* AI Suggestions panel */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06] bg-white/[0.01] px-4 pb-4 pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-white/30">
                        Sugerencias AI
                        {!summary?.flags?.SEO_AI_SUGGESTIONS && (
                          <span className="ml-2 text-white/20">(solo determinísticas — AI flag off)</span>
                        )}
                      </p>
                      <button onClick={() => generateSuggestions(item.id)} disabled={loadingSugg[item.id]}
                        className="flex items-center gap-1 text-[10px] text-[#c9a84c]/70 hover:text-[#c9a84c] disabled:opacity-40">
                        <Sparkles className="h-3 w-3" /> Generar nuevas
                      </button>
                    </div>
                    {!suggestions[item.id] ? (
                      <p className="text-[11px] text-white/20">Cargando… o presioná ✦ para generar.</p>
                    ) : suggestions[item.id].length === 0 ? (
                      <p className="text-[11px] text-white/20">Sin sugerencias pendientes.</p>
                    ) : (
                      <ul className="space-y-2">
                        {suggestions[item.id].map(sug => (
                          <li key={sug.id} className="border border-white/[0.06] bg-[#060606] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] text-white/40" style={{ fontFamily: MONO }}>{sug.field}</span>
                                  <span className={`text-[10px] ${sug.confidence >= 0.95 ? 'text-emerald-300' : sug.confidence >= 0.80 ? 'text-amber-200' : 'text-white/40'}`} style={{ fontFamily: MONO }}>
                                    {Math.round(sug.confidence * 100)}%
                                  </span>
                                  <span className="text-[10px] text-white/25" style={{ fontFamily: MONO }}>{sug.source}</span>
                                </div>
                                {sug.current_value && <p className="mt-1 text-[11px] text-white/30 line-through">{sug.current_value}</p>}
                                {editingId === sug.id ? (
                                  <input value={editValue} onChange={e => setEditValue(e.target.value)}
                                    className="mt-1 w-full border border-white/15 bg-[#0a0a0a] px-2 py-1 text-xs text-cream outline-none focus:border-[#c9a84c]/40" />
                                ) : (
                                  <p className="mt-1 text-sm text-cream">{sug.suggested_value}</p>
                                )}
                                {sug.evidence && <p className="mt-1 text-[10px] italic text-white/25">"{sug.evidence.slice(0, 120)}"</p>}
                              </div>
                              <div className="flex shrink-0 gap-1">
                                {editingId === sug.id ? (
                                  <>
                                    <button onClick={() => editSuggestion(sug.id, item.id, editValue)} className="border border-emerald-400/25 p-1.5 text-emerald-300 hover:bg-emerald-400/10"><Check className="h-3 w-3" /></button>
                                    <button onClick={() => setEditingId(null)} className="border border-white/10 p-1.5 text-white/40 hover:text-white/60"><X className="h-3 w-3" /></button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => acceptSuggestion(sug.id, item.id)} className="border border-emerald-400/25 p-1.5 text-emerald-300 hover:bg-emerald-400/10" title="Aceptar"><Check className="h-3 w-3" /></button>
                                    <button onClick={() => { setEditingId(sug.id); setEditValue(sug.suggested_value) }} className="border border-white/10 p-1.5 text-white/45 hover:text-cream" title="Editar"><Pencil className="h-3 w-3" /></button>
                                    <button onClick={() => ignoreSuggestion(sug.id, item.id)} className="border border-white/10 p-1.5 text-white/45 hover:text-red-400" title="Ignorar"><X className="h-3 w-3" /></button>
                                  </>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Footer note */}
      <p className="text-[11px] text-white/20">
        Pipeline en modo DRY RUN por defecto — activar <span style={{ fontFamily: MONO }}>SEO_PIPELINE_V2=true</span> y <span style={{ fontFamily: MONO }}>SEO_DRY_RUN=false</span> en Netlify para persistir resultados.
        Acciones de publicación (Aprobar/Bloquear) están en la pestaña Verificación.
      </p>
    </div>
  )
}
