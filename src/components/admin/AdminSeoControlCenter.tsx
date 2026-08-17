import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertCircle, CheckCircle2, Clock, Search, Play, ChevronDown, ChevronUp } from 'lucide-react'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const API_BASE = '/.netlify/functions'

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
}

interface Summary {
  eligible: number
  review: number
  blocked: number
  unchecked: number
  flags: Record<string, boolean>
}

type Filter = 'all' | 'eligible' | 'review' | 'blocked' | 'unchecked'

const STATUS_STYLE: Record<string, { label: string; color: string; dot: string }> = {
  eligible: { label: 'Elegible', color: 'text-emerald-300 border-emerald-400/25', dot: 'bg-emerald-400' },
  review: { label: 'Revisión', color: 'text-amber-200 border-amber-300/25', dot: 'bg-amber-300' },
  blocked: { label: 'Bloqueado', color: 'text-red-300 border-red-400/25', dot: 'bg-red-400' },
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
  const [filter, setFilter] = useState<Filter>('unchecked')
  const [loading, setLoading] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [runningBulk, setRunningBulk] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [lastBulkResult, setLastBulkResult] = useState<string | null>(null)

  const load = useCallback(async (f: Filter = filter) => {
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
  }, [adminPassword, filter])

  useEffect(() => { load(filter) }, [filter])

  const runPipeline = async (id: string) => {
    setRunningId(id)
    try {
      await fetch(`${API_BASE}/admin-seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ action: 'run_pipeline', opportunityId: id }),
      })
      await load(filter)
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
      await load(filter)
    } finally {
      setRunningBulk(false)
    }
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">SEO</p>
          <h2 className="font-display text-3xl text-cream">Centro de control SEO</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => load(filter)}
            disabled={loading}
            className="flex items-center gap-2 border border-white/10 px-3 py-2 text-xs text-white/55 transition hover:border-white/25 hover:text-cream disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button
            onClick={runBulk}
            disabled={runningBulk || loading}
            className="flex items-center gap-2 border border-[#c9a84c]/40 bg-[#c9a84c]/10 px-3 py-2 text-xs text-[#c9a84c] transition hover:bg-[#c9a84c]/20 disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" /> Correr pipeline en pendientes
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
        </div>
      )}

      {lastBulkResult && (
        <p className="border border-[#c9a84c]/25 bg-[#c9a84c]/5 px-4 py-2.5 text-xs text-[#c9a84c]">{lastBulkResult}</p>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-px bg-white/[0.05] sm:grid-cols-4">
          {[
            { key: 'eligible' as Filter, count: summary.eligible, label: 'Elegibles', color: 'text-emerald-300' },
            { key: 'review' as Filter, count: summary.review, label: 'En revisión', color: 'text-amber-200' },
            { key: 'blocked' as Filter, count: summary.blocked, label: 'Bloqueados', color: 'text-red-300' },
            { key: 'unchecked' as Filter, count: summary.unchecked, label: 'Sin evaluar', color: 'text-white/40' },
          ].map(card => (
            <button
              key={card.key}
              onClick={() => setFilter(card.key)}
              className={`bg-[#080808] p-4 text-left transition hover:bg-white/[0.025] ${filter === card.key ? 'outline outline-1 outline-[#c9a84c]/40' : ''}`}
            >
              <p className={`font-display text-3xl ${card.color}`} style={{ fontFamily: MONO }}>{card.count.toLocaleString('es-PY')}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-white/30">{card.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-white/8">
        {(['all', 'eligible', 'review', 'blocked', 'unchecked'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 text-xs transition ${filter === f ? 'border-b border-[#c9a84c] text-[#c9a84c]' : 'text-white/35 hover:text-white/60'}`}>
            {f === 'all' ? 'Todos' : f === 'eligible' ? 'Elegibles' : f === 'review' ? 'Revisión' : f === 'blocked' ? 'Bloqueados' : 'Sin evaluar'}
          </button>
        ))}
      </div>

      {/* Items list */}
      {loading && items.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/30">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/30">No hay ítems en esta categoría.</p>
      ) : (
        <div className="space-y-px">
          {items.map(item => {
            const status = item.seo_status ? STATUS_STYLE[item.seo_status] : null
            const validity = item.jobposting_validity ? VALIDITY_STYLE[item.jobposting_validity] : null
            const issues = item.seo_issues || []
            const isExpanded = expanded[item.id]

            return (
              <div key={item.id} className="border border-white/[0.06] bg-[#080808]">
                <div className="flex items-start gap-4 p-4">
                  {/* Status indicator */}
                  <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${status?.dot || 'bg-white/20'}`} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {status && (
                        <span className={`border px-2 py-0.5 text-[10px] ${status.color}`} style={{ fontFamily: MONO }}>
                          {status.label}
                        </span>
                      )}
                      {validity && (
                        <span className={`text-[10px] ${validity.color}`} style={{ fontFamily: MONO }}>
                          {validity.label}
                        </span>
                      )}
                      {item.seo_missing_fields && item.seo_missing_fields.length > 0 && (
                        <span className="text-[10px] text-white/25" style={{ fontFamily: MONO }}>
                          missing: {item.seo_missing_fields.join(', ')}
                        </span>
                      )}
                    </div>

                    <p className="mt-1.5 text-sm text-cream">{item.title || '(sin título)'}</p>
                    <p className="mt-0.5 text-[11px] text-white/30">
                      {item.organization || 'Sin org'} · {item.source || 'Sin fuente'}
                      {item.seo_checked_at && ` · Evaluado ${new Date(item.seo_checked_at).toLocaleDateString('es-PY')}`}
                    </p>

                    {/* Issues detail (expandable) */}
                    {issues.length > 0 && (
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="mt-2 flex items-center gap-1 text-[10px] text-white/35 hover:text-white/60"
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {issues.length} {issues.length === 1 ? 'problema' : 'problemas'}
                      </button>
                    )}

                    {isExpanded && issues.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {issues.map((issue, i) => (
                          <li key={i} className="flex items-start gap-2 text-[11px] text-white/40">
                            {issue.severity === 'blocking'
                              ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                              : <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />}
                            <span><span className="text-white/60">{issue.field}:</span> {issue.reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => runPipeline(item.id)}
                    disabled={runningId === item.id}
                    className="shrink-0 border border-white/10 px-3 py-1.5 text-[10px] text-white/45 transition hover:border-white/25 hover:text-cream disabled:opacity-40"
                    title="Correr pipeline SEO"
                  >
                    {runningId === item.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer note */}
      <p className="text-[11px] text-white/20">
        Pipeline en modo DRY RUN por defecto — activar <span style={{ fontFamily: MONO }}>SEO_PIPELINE_V2=true</span> y <span style={{ fontFamily: MONO }}>SEO_DRY_RUN=false</span> en Netlify para persistir resultados.
      </p>
    </div>
  )
}
