import { useState, useRef, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import { ProductGuide } from '@/components/cv/ProductGuide'
import { B2BInfoPopover } from '@/components/cv/B2BInfoPopover'
import { clearPendingOperation, pendingOperationId } from '@/lib/pendingOperation'
import { FeedbackReporter } from '@/components/cv/FeedbackReporter'
import {
  Building2, Key, AlertCircle, ChevronRight,
  Coins, LogOut, Loader2, History, Sparkles,
  ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Star, Brain, Users, Trophy, ArrowLeft, Share2, Database,
  FileText, Upload, RotateCcw, X, Link2, Plus, Copy, Check as CheckIcon,
  UserCheck, Mail, Calendar, ChevronLeft, Download, Search,
  BarChart2, TrendingUp,
} from 'lucide-react'

const ease = [0.22, 1, 0.36, 1] as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecruiterSession {
  valid: true
  balance: number
  company_name: string
  token_id: string
  token: string
}

interface ATSResult {
  atsScore: number
  strengths: string[]
  criticalImprovements: string[]
  summary?: string
  recommendation?: string
}

interface AnalysisRecord {
  id: string
  candidate_name: string | null
  file_name: string | null
  ats_score: number
  strengths: string[]
  critical_improvements: string[]
  vacancy_label: string | null
  is_starred: boolean
  created_at: string
}

interface ComparisonResult {
  top3: Array<{ name: string; score: number; strengths: string[]; reason: string }>
  finalRecommendation: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 80) return 'oklch(0.75 0.18 145)'
  if (s >= 60) return 'oklch(0.78 0.13 82)'
  return 'oklch(0.65 0.22 25)'
}

async function extractTextFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const ab = e.target?.result as ArrayBuffer
      const b64 = btoa(new Uint8Array(ab).reduce((d, b) => d + String.fromCharCode(b), ''))
      try {
        const res = await fetch('/.netlify/functions/extract-pdf-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: b64, fileName: file.name }),
        })
        resolve((await res.json()).text || '')
      } catch { reject(new Error('Error extrayendo texto')) }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ─── Ambient background ───────────────────────────────────────────────────────

function Ambient() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-1/3 h-[520px] w-[520px] rounded-full bg-[#c9a84c]/[0.07] blur-[160px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-white/[0.025] blur-[160px]" />
      </div>
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.025]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
    </>
  )
}

// ─── Panel header (when authenticated) ───────────────────────────────────────

function PanelHeader({ session, balance, onLogout }: { session: RecruiterSession; balance: number; onLogout: () => void }) {
  return (
    <header className="border-b border-white/5 px-6 py-5">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
        <Link href="/" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/45 transition-colors hover:text-white">
          <ArrowLeft strokeWidth={1.5} className="h-4 w-4" /> Volver
        </Link>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2.5 text-sm text-white/70 md:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
              <Building2 strokeWidth={1.25} className="h-4 w-4 text-white/70" />
            </div>
            <span className="font-light">{session.company_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06] px-3.5 py-1.5">
            <Coins strokeWidth={1.5} className="h-4 w-4 text-[#c9a84c]" />
            <span className="text-xs font-medium tracking-wide text-white/80">
              <span className="text-[#c9a84c]">{balance}</span> créditos
            </span>
            </div>
            <B2BInfoPopover
              label="Cómo funcionan los créditos"
              title="Créditos y control humano"
              description="Cada análisis de CV con IA consume un crédito. La IA ordena y explica evidencia; no contrata, rechaza ni contacta a nadie por su cuenta."
              points={['Las postulaciones recibidas no consumen créditos.', 'Los reanálisis se cobran nuevamente y siempre son explícitos.', 'Si un análisis falla, el crédito se devuelve cuando es posible.']}
            />
          </div>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-white/50 transition hover:border-white/25 hover:text-white"
          >
            <LogOut strokeWidth={1.5} className="h-3.5 w-3.5" /> Salir
          </button>
        </div>
      </div>
    </header>
  )
}

// ─── Score bar (inline) ───────────────────────────────────────────────────────

function ScoreBar({ score, delay = 0 }: { score: number; delay?: number }) {
  return (
    <div className="flex items-center gap-4">
      <div className="hidden w-40 sm:block">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${score}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-[#c9a84c]"
          />
        </div>
      </div>
      <div className="text-right">
        <p className="font-display text-2xl text-white">
          {score}<span className="text-sm text-white/40">/100</span>
        </p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Compatibilidad</p>
      </div>
    </div>
  )
}

// ─── Analysis result ──────────────────────────────────────────────────────────

function AnalysisResult({ result, fileName, vacancyLabel, onReset }: {
  result: ATSResult; fileName: string; vacancyLabel: string; onReset: () => void
}) {
  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {/* Verdict card */}
      <div className="relative">
        <div className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-[#c9a84c]/15 via-transparent to-transparent blur-2xl" />
        <div className="glass-card rounded-[2rem] p-8">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40">
            <span className="h-px w-8 bg-[#c9a84c]/50" /> Veredicto de la IA
          </div>
          <p className="mt-6 font-display text-3xl leading-snug text-white md:text-4xl">
            {vacancyLabel ? (
              <>Score <em className="not-italic" style={{ color: scoreColor(result.atsScore) }}>{result.atsScore}/100</em> para <em className="italic font-normal">{vacancyLabel}</em>.</>
            ) : (
              <>Score <em className="not-italic" style={{ color: scoreColor(result.atsScore) }}>{result.atsScore}/100</em>. {result.recommendation && <em className="italic font-normal">{result.recommendation}.</em>}</>
            )}
          </p>
          {result.summary && (
            <p className="mt-4 max-w-3xl text-sm font-light leading-relaxed text-white/55 md:text-base">
              {result.summary}
            </p>
          )}
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-4 w-fit">
            <FileText strokeWidth={1.25} className="h-4 w-4 text-[#c9a84c]" />
            <span className="text-sm text-white/70">{fileName}</span>
          </div>
          <button onClick={onReset} className="mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/40 transition hover:text-white">
            <RotateCcw strokeWidth={1.5} className="h-3.5 w-3.5" /> Analizar otro CV
          </button>
        </div>
      </div>

      {/* Strengths & improvements */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-card rounded-2xl p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
            <CheckCircle2 strokeWidth={1.5} className="h-3.5 w-3.5 text-emerald-400" /> Puntos fuertes
          </p>
          <ul className="mt-4 space-y-3">
            {result.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm font-light text-white/70">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
            <XCircle strokeWidth={1.5} className="h-3.5 w-3.5 text-red-400" /> Mejoras críticas
          </p>
          <ul className="mt-4 space-y-3">
            {result.criticalImprovements.map((m, i) => (
              <li key={i} className="flex items-start gap-3 text-sm font-light text-white/70">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
        <CheckCircle2 strokeWidth={1.5} className="h-4 w-4 text-emerald-400 shrink-0" />
        <p className="text-sm font-light text-emerald-400">Análisis guardado en el historial.</p>
      </div>
    </motion.div>
  )
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({ token, onToggleStar, onCompare }: {
  token: string; onToggleStar: () => void; onCompare: (ids: string[]) => void
}) {
  const [history, setHistory] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all')

  useEffect(() => { loadHistory() }, [])

  const loadHistory = async () => {
    try {
      const res = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'get_history' }),
      })
      setHistory((await res.json()).history || [])
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }

  const toggleStar = async (id: string) => {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, is_starred: !h.is_starred } : h))
    try {
      await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'toggle_star', analysis_id: id }),
      })
    } catch { /* silencioso */ }
    onToggleStar()
  }

  const exportCSV = () => {
    const filtered = getFiltered()
    const header = 'Nombre,Archivo,Score ATS,Puesto,Fecha\n'
    const rows = filtered.map(r =>
      [r.candidate_name || '', r.file_name || '', r.ats_score, r.vacancy_label || '', new Date(r.created_at).toLocaleDateString('es-PY')]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'cvitae-historial.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const getFiltered = () => {
    return history.filter(r => {
      const matchesSearch = !search || (r.candidate_name?.toLowerCase().includes(search.toLowerCase()) || r.file_name?.toLowerCase().includes(search.toLowerCase()))
      const matchesScore = scoreFilter === 'all' ||
        (scoreFilter === 'high' && r.ats_score >= 80) ||
        (scoreFilter === 'mid' && r.ats_score >= 60 && r.ats_score < 80) ||
        (scoreFilter === 'low' && r.ats_score < 60)
      return matchesSearch && matchesScore
    })
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-[#c9a84c]" />
    </div>
  )

  if (history.length === 0) return (
    <div className="glass-card rounded-3xl py-20 text-center">
      <History strokeWidth={1.25} className="mx-auto mb-4 h-10 w-10 text-white/20" />
      <p className="text-sm font-light text-white/40">No hay análisis guardados aún.</p>
      <p className="mt-1 text-xs text-white/25">Los análisis que hagas aparecerán acá.</p>
    </div>
  )

  const filtered = getFiltered()

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40">
          <span className="h-px w-8 bg-white/20" /> {history.length} análisis guardados
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.length >= 2 && (
            <button
              onClick={() => onCompare(selectedIds)}
              className="inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-4 py-2 text-xs font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
            >
              <Users strokeWidth={1.5} className="h-3.5 w-3.5" /> Comparar {selectedIds.length}
            </button>
          )}
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs text-white/50 transition hover:border-white/25 hover:text-white"
          >
            <Download strokeWidth={1.5} className="h-3.5 w-3.5" /> CSV
          </button>
          <Link
            href="/empresas/masivo"
            className="inline-flex items-center gap-2 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.06] px-4 py-2 text-xs uppercase tracking-[0.15em] text-[#c9a84c] transition hover:border-[#c9a84c]/60"
          >
            <Sparkles strokeWidth={1.5} className="h-3.5 w-3.5" /> Análisis masivo
          </Link>
        </div>
      </div>

      {/* Search + score filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar candidato…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.02] pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none transition"
          />
        </div>
        <div className="flex gap-1">
          {([['all', 'Todos'], ['high', '80+'], ['mid', '60-79'], ['low', '<60']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setScoreFilter(val)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${scoreFilter === val ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <ol className="space-y-3">
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-white/30">Sin resultados para ese filtro.</div>
        )}
        {filtered.map((record, i) => (
          <motion.li
            key={record.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.04, ease }}
            className="glass-card rounded-2xl px-5 py-4 transition-all hover:border-[#c9a84c]/25"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedIds.includes(record.id)}
                onChange={() => setSelectedIds(prev => prev.includes(record.id) ? prev.filter(x => x !== record.id) : [...prev, record.id])}
                className="h-4 w-4 accent-[#c9a84c]"
              />
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-display text-xl" style={{ color: scoreColor(record.ats_score) }}>{record.ats_score}</span>
                  <p className="truncate text-sm text-white">{record.candidate_name || record.file_name}</p>
                  {record.vacancy_label && (
                    <span className="shrink-0 rounded-full border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-[#c9a84c]">
                      {record.vacancy_label}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs font-light text-white/35">
                  {new Date(record.created_at).toLocaleDateString('es-PY')} · {record.file_name}
                </p>
              </div>
              <button onClick={() => toggleStar(record.id)} className={`p-2 transition-colors ${record.is_starred ? 'text-[#c9a84c]' : 'text-white/20 hover:text-[#c9a84c]'}`}>
                <Star strokeWidth={1.5} className="h-4 w-4" fill={record.is_starred ? 'currentColor' : 'none'} />
              </button>
              <button onClick={() => setExpandedId(expandedId === record.id ? null : record.id)} className="p-2 text-white/20 hover:text-white transition-colors">
                {expandedId === record.id ? <ChevronUp strokeWidth={1.5} className="h-4 w-4" /> : <ChevronDown strokeWidth={1.5} className="h-4 w-4" />}
              </button>
            </div>

            <AnimatePresence>
              {expandedId === record.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mt-4 pt-4 border-t border-white/5 grid md:grid-cols-2 gap-4"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 mb-2">Puntos fuertes</p>
                    <ul className="space-y-1">
                      {(record.strengths as string[]).map((s, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs font-light text-white/60">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 mb-2">Mejoras críticas</p>
                    <ul className="space-y-1">
                      {(record.critical_improvements as string[]).map((m, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs font-light text-white/60">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400" />{m}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}

// ─── Comparison result ────────────────────────────────────────────────────────

function ComparisonResultComponent({ result, onClose }: { result: ComparisonResult; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="relative">
        <div className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-[#c9a84c]/15 via-transparent to-transparent blur-2xl" />
        <div className="glass-card rounded-[2rem] p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40">
              <span className="h-px w-8 bg-[#c9a84c]/50" /> Resultado de comparación
            </div>
            <button onClick={onClose} className="text-xs text-white/30 hover:text-white transition-colors">Cerrar</button>
          </div>
          <p className="mt-5 max-w-3xl font-display text-2xl leading-snug text-white md:text-3xl">
            {result.finalRecommendation}
          </p>
        </div>
      </div>

      <ol className="space-y-3">
        {result.top3.map((c, i) => (
          <li
            key={i}
            className={`glass-card flex items-center gap-5 rounded-2xl p-5 transition-all ${i === 0 ? 'border-[#c9a84c]/30 bg-[#c9a84c]/[0.04]' : ''}`}
          >
            <span className="font-display text-3xl text-white/30 w-10 text-center">{String(i + 1).padStart(2, '0')}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-base text-white">{c.name || `Candidato ${i + 1}`}</p>
                {i === 0 && <Trophy strokeWidth={1.5} className="h-3.5 w-3.5 text-[#c9a84c]" />}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {c.strengths.slice(0, 3).map((s, j) => (
                  <span key={j} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/55">{s}</span>
                ))}
              </div>
              <p className="mt-2 text-xs font-light text-white/40">{c.reason}</p>
            </div>
            <ScoreBar score={c.score} delay={0.2 + i * 0.06} />
          </li>
        ))}
      </ol>
    </motion.div>
  )
}

// ─── Applicants panel ─────────────────────────────────────────────────────────

interface Applicant {
  id: string
  name: string
  email: string
  cv_file_name: string | null
  cv_download_url: string | null
  cv_parse_status: 'parsed' | 'manual_review' | 'missing'
  cv_text: string | null
  cover_letter: string | null
  ats_score: number | null
  fit_score: number | null
  recommendation: string | null
  ai_summary: string | null
  strengths: string[]
  key_matches: string[]
  key_gaps: string[]
  analyzed_at: string | null
  recruiter_action: string | null
  recruiter_notes: string | null
  badges: string[]
  applied_at: string
  review_status: 'pending' | 'processing' | 'analyzed' | 'manual_review' | 'failed'
  review_batch_number: number | null
  batch_selected: boolean
  progressive_shortlist: boolean
  progressive_rank: number | null
  triage_tier: 'strong' | 'priority' | 'reviewed' | null
  selection_reason: string | null
}

interface VacancyReviewState {
  total: number
  analyzed: number
  pending: number
  manual_review: number
  strong: number
  shortlist: number
  batches_completed: number
}

interface AISummary {
  executiveSummary: string
  topPick: string
  callList: string[]
  redFlag: string | null
  nextStep: string
}

function recColor(r: string | null) {
  if (r === 'Llamar') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.06]'
  if (r === 'Considerar') return 'text-[#c9a84c] border-[#c9a84c]/30 bg-[#c9a84c]/[0.06]'
  return 'text-sky-300 border-sky-500/25 bg-sky-500/[0.05]'
}

function recommendationLabel(recommendation: string | null) {
  return recommendation === 'No llamar' ? 'Revisado' : recommendation
}
function fitColor(s: number) {
  if (s >= 75) return 'oklch(0.75 0.18 145)'
  if (s >= 50) return 'oklch(0.78 0.13 82)'
  return 'oklch(0.65 0.22 25)'
}

function actionColor(a: string | null) {
  if (a === 'hired') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.06]'
  if (a === 'interviewing') return 'text-[#c9a84c] border-[#c9a84c]/30 bg-[#c9a84c]/[0.06]'
  if (a === 'contacted') return 'text-sky-400 border-sky-500/30 bg-sky-500/[0.06]'
  if (a === 'rejected') return 'text-red-400 border-red-500/30 bg-red-500/[0.06]'
  return 'text-white/30 border-white/10 bg-white/[0.02]'
}

const ACTION_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  contacted: 'Contactado',
  interviewing: 'Entrevistando',
  hired: 'Contratado',
  rejected: 'Descartado',
}

function ApplicantsPanel({ token, vacancyId, vacancyTitle, vacancySlug, onBack, onAnalyzeSingle }: {
  token: string
  vacancyId: string
  vacancyTitle: string
  vacancySlug?: string
  onBack: () => void
  onAnalyzeSingle: (cvText: string, name: string) => void
}) {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loading, setLoading] = useState(true)
  const [ranking, setRanking] = useState(false)
  const [rankProgress, setRankProgress] = useState('')
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'Llamar' | 'Considerar' | 'Revisado'>('all')
  const [rankError, setRankError] = useState('')
  const [updatingAction, setUpdatingAction] = useState<string | null>(null)
  const [review, setReview] = useState<VacancyReviewState | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const handleActionUpdate = async (applicationId: string, action: string, notes?: string) => {
    setUpdatingAction(applicationId)
    try {
      await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'update_application_status', application_id: applicationId, recruiter_action: action, recruiter_notes: notes }),
      })
      setApplicants(prev => prev.map(a => a.id === applicationId ? { ...a, recruiter_action: action } : a))
    } catch { /* silencioso */ }
    finally { setUpdatingAction(null) }
  }

  const loadApplicants = async (requestedPage = 0, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const response = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'get_applicants', vacancy_id: vacancyId, page: requestedPage, page_size: 60 }),
      })
      const data = await response.json()
      const nextApplicants = data.applicants || []
      setApplicants(previous => append
        ? [...previous, ...nextApplicants.filter((candidate: Applicant) => !previous.some(existing => existing.id === candidate.id))]
        : nextApplicants)
      setReview(data.review || null)
      setPage(requestedPage)
      setHasMore(data.pagination?.has_more === true)
    } catch { /* conserva el último estado visible */ }
    finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => { loadApplicants() }, [vacancyId])

  const handleRankAll = async () => {
    setRanking(true); setRankError('')
    setRankProgress('Revisando la siguiente tanda y comparando sus mejores perfiles…')
    const operationId = pendingOperationId('batch', `vacancy-progressive:${vacancyId}:pending:${review?.pending ?? 'unknown'}:batches:${review?.batches_completed ?? 0}`)
    try {
      const res = await fetch('/.netlify/functions/analyze-vacancy-applicants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, vacancy_id: vacancyId, operation_id: operationId }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.retryable) clearPendingOperation(operationId)
        throw new Error(data.error || 'Error en el análisis')
      }
      clearPendingOperation(operationId)

      setRankProgress(data.complete
        ? 'La revisión está al día.'
        : `Tanda ${data.batchNumber || ''}: ${data.analyzed} CVs analizados${data.failed > 0 ? ` · ${data.failed} se reintentará` : ''}`)
      if (data.summary) setAiSummary(data.summary)
      if (data.review) setReview(data.review)

      // Merge results into applicants list
      if (data.results?.length) {
        setApplicants(prev => prev.map(a => {
          const r = data.results.find((x: any) => x.applicantId === a.id)
          if (!r) return a
          return {
            ...a,
            ats_score: r.atsScore,
            fit_score: r.fitScore,
            recommendation: r.recommendation,
            ai_summary: r.summary,
            strengths: r.strengths,
            key_matches: r.keyMatches,
            key_gaps: r.keyGaps,
            analyzed_at: new Date().toISOString(),
          }
        }).sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1)))
      }
      await loadApplicants(0, false)
    } catch (err: any) {
      setRankError(err.message)
    } finally {
      setRanking(false)
    }
  }

  const analyzed = applicants.filter(a => a.analyzed_at)
  const withCv = applicants.filter(a => a.cv_text)
  const filtered = filter === 'all' ? applicants : applicants.filter(a => filter === 'Revisado'
    ? a.recommendation === 'Revisado' || a.recommendation === 'No llamar'
    : a.recommendation === filter)
  const counts = {
    Llamar: applicants.filter(a => a.recommendation === 'Llamar').length,
    Considerar: applicants.filter(a => a.recommendation === 'Considerar').length,
    Revisado: applicants.filter(a => a.recommendation === 'Revisado' || a.recommendation === 'No llamar').length,
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors">
          <ChevronLeft strokeWidth={1.5} className="h-4 w-4" /> Vacantes
        </button>
        <span className="text-white/20">·</span>
        <span className="text-sm text-white/60 truncate max-w-xs">{vacancyTitle}</span>
      </div>

      {/* Vacancy link — prominent */}
      {vacancySlug && (
        <div className="rounded-2xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.05] p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c] mb-2">Link de postulación</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 min-w-0 truncate text-sm text-white/85 font-mono">
              https://cvitae.lat/vacante/{vacancySlug}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`https://cvitae.lat/vacante/${vacancySlug}`).then(() => {
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                }).catch(() => {})
              }}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.08] px-3 py-1.5 text-xs text-[#c9a84c] transition hover:bg-[#c9a84c]/[0.18]"
            >
              {linkCopied ? <CheckIcon strokeWidth={2} className="h-3.5 w-3.5" /> : <Copy strokeWidth={1.5} className="h-3.5 w-3.5" />}
              {linkCopied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="mt-2 text-[11px] font-light text-white/45">
            Compartí este link con candidatos — cada postulación queda registrada automáticamente
          </p>
        </div>
      )}

      {/* Stats + CTA */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Total</p>
              <p className="font-display text-3xl text-white">{review?.total ?? applicants.length}</p>
            </div>
            {(review?.analyzed || analyzed.length) > 0 && (
              <>
                <div className="h-8 w-px bg-white/8" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Ajuste fuerte</p>
                  <p className="font-display text-3xl text-emerald-400">{review?.strong ?? counts['Llamar']}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Destacados</p>
                  <p className="font-display text-3xl text-[#c9a84c]">{review?.shortlist ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Pendientes</p>
                  <p className="font-display text-3xl text-sky-300">{review?.pending ?? 0}</p>
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 text-[11px] text-white/35">
              <span>El score orienta; la decisión es tuya.</span>
              <B2BInfoPopover
                label="Cómo leer el ranking"
                title="Ranking con contexto"
                description="El ranking combina ajuste al puesto, evidencia del CV y la descripción que cargaste. Es una ayuda para priorizar conversaciones, no una decisión automática de contratación."
                points={['Abrí cada candidato para ver fortalezas y brechas.', 'La IA puede equivocarse o pasar por alto contexto: verificá la evidencia en el CV.', 'Un score bajo no elimina ni notifica al candidato.', 'Podés cambiar el estado y dejar notas como responsable del proceso.']}
              />
            </div>
            {(review?.pending ?? withCv.filter(candidate => !candidate.analyzed_at).length) > 0 && (
              <button
                onClick={handleRankAll}
                disabled={ranking}
                className="inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-[#0a0a0a] transition hover:shadow-[0_0_30px_-4px_rgba(201,168,76,0.5)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {ranking
                  ? <><Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" /> Analizando…</>
                  : <><Sparkles strokeWidth={1.5} className="h-4 w-4" /> Analizar siguiente tanda</>
                }
              </button>
            )}
            {review && review.batches_completed > 0 && (
              <p className="text-[11px] text-white/35">
                {review.batches_completed} {review.batches_completed === 1 ? 'tanda revisada' : 'tandas revisadas'} · los perfiles fuertes se conservan
              </p>
            )}
            {rankProgress && !ranking && (
              <p className="text-[11px] text-white/40">{rankProgress}</p>
            )}
            {rankError && (
              <p className="text-[11px] text-red-400">{rankError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Executive summary */}
      <AnimatePresence>
        {aiSummary && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="relative rounded-2xl p-7 overflow-hidden border border-white/5 bg-[#0d0d0d]"
          >
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40 mb-5">
              <span className="h-px w-8 bg-[#c9a84c]/40" /> Síntesis asistida para entrevistas
            </div>

            <p className="font-display text-xl text-white leading-snug mb-4">{aiSummary.topPick}</p>
            <p className="text-sm font-light text-white/60 leading-relaxed mb-5">{aiSummary.executiveSummary}</p>

            {aiSummary.callList?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/35 self-center mr-1">Priorizar entrevista:</span>
                {aiSummary.callList.map(name => (
                  <span key={name} className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-1 text-xs text-emerald-400">
                    {name}
                  </span>
                ))}
              </div>
            )}

            {aiSummary.redFlag && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3">
                <AlertCircle strokeWidth={1.5} className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs font-light text-red-400 leading-relaxed">{aiSummary.redFlag}</p>
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <CheckCircle2 strokeWidth={1.5} className="h-4 w-4 text-[#c9a84c] shrink-0 mt-0.5" />
              <p className="text-xs font-light text-white/55 leading-relaxed">{aiSummary.nextStep}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#c9a84c]" /></div>
      ) : applicants.length === 0 ? (
        <div className="glass-card rounded-2xl py-16 text-center">
          <UserCheck strokeWidth={1.25} className="mx-auto mb-4 h-10 w-10 text-white/20" />
          <p className="text-sm font-light text-white/40">Todavía no hay postulantes para esta vacante.</p>
          <p className="mt-1 text-xs text-white/25">Compartí el link de postulación para empezar a recibir CVs.</p>
        </div>
      ) : (
        <>
          {/* Filter tabs — only when analyzed */}
          {(review?.analyzed || analyzed.length) > 0 && (
            <div className="flex flex-wrap gap-2">
              {(['all', 'Llamar', 'Considerar', 'Revisado'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                    filter === f
                      ? 'bg-white/10 text-white'
                      : 'border border-white/10 text-white/40 hover:border-white/25 hover:text-white/70'
                  }`}
                >
                  {f === 'all' ? `Cargados (${applicants.length})` : `${f} (${counts[f]})`}
                </button>
              ))}
            </div>
          )}

          {/* Candidate list */}
          <ol className="space-y-3">
            {filtered.map((a, i) => (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.03, ease }}
                className={`rounded-2xl overflow-hidden transition-colors border border-white/8 bg-white/[0.02] border-l-[3px] ${
                  a.recommendation === 'Llamar'
                    ? 'border-l-emerald-500/60'
                    : a.progressive_shortlist
                    ? 'border-l-[#c9a84c]/60'
                    : a.analyzed_at
                    ? 'border-l-sky-500/30'
                    : 'border-l-white/10'
                } hover:border-white/15`}
              >
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandedId === a.id}
                  aria-controls={`applicant-${a.id}`}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setExpandedId(expandedId === a.id ? null : a.id)
                    }
                  }}
                >
                  {/* Rank number */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-display ${
                    a.recommendation === 'Llamar'
                      ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-400'
                      : 'border-white/10 bg-white/[0.03] text-white/40'
                  }`}>
                    {a.progressive_rank ? String(a.progressive_rank).padStart(2, '0') : '—'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-white font-medium">{a.name}</p>
                      {a.recommendation && (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${recColor(a.recommendation)}`}>
                          {recommendationLabel(a.recommendation)}
                        </span>
                      )}
                      {a.triage_tier === 'strong' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-emerald-300">
                          <Star strokeWidth={1.5} className="h-3 w-3" /> Ajuste fuerte
                        </span>
                      )}
                      {a.triage_tier === 'priority' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#c9a84c]/25 bg-[#c9a84c]/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#c9a84c]">
                          <Trophy strokeWidth={1.5} className="h-3 w-3" /> Destacado entre tandas
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-white/35 flex-wrap">
                      <span className="flex items-center gap-1"><Mail strokeWidth={1.5} className="h-3 w-3" /><a href={`mailto:${a.email}`} className="hover:text-[#c9a84c] transition-colors">{a.email}</a></span>
                      <span className="flex items-center gap-1">
                        <Calendar strokeWidth={1.5} className="h-3 w-3" />
                        {new Date(a.applied_at).toLocaleDateString('es-PY')}
                      </span>
                      {a.review_batch_number && <span>Tanda {a.review_batch_number}</span>}
                    </div>
                    {a.ai_summary && (
                      <p className="mt-1.5 text-xs font-light text-white/50 leading-relaxed line-clamp-2">{a.ai_summary}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {a.fit_score !== null && (
                      <div className="text-right leading-none">
                        <span className="font-display text-4xl tabular-nums" style={{ color: fitColor(a.fit_score) }}>{a.fit_score}</span>
                        <span className="text-sm text-white/25 ml-0.5">/100</span>
                      </div>
                    )}
                    {expandedId === a.id
                      ? <ChevronUp strokeWidth={1.5} className="h-4 w-4 text-white/30" />
                      : <ChevronDown strokeWidth={1.5} className="h-4 w-4 text-white/30" />
                    }
                  </div>
                </div>

                <AnimatePresence>
                  {expandedId === a.id && (
                    <motion.div
                      id={`applicant-${a.id}`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-white/5"
                    >
                      <div className="px-5 pb-5 pt-4 space-y-4">
                        {a.selection_reason && (
                          <div className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                            <CheckCircle2 strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a84c]" />
                            <p className="text-xs font-light leading-relaxed text-white/55">{a.selection_reason}. La decisión se confirma con revisión del CV y entrevistas.</p>
                          </div>
                        )}
                        {/* Scores row */}
                        {(a.ats_score !== null || a.fit_score !== null) && (
                          <div className="flex gap-4 flex-wrap">
                            {a.fit_score !== null && (
                              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5 text-center">
                                <p className="font-display text-2xl" style={{ color: fitColor(a.fit_score) }}>{a.fit_score}</p>
                                <p className="text-[9px] uppercase tracking-[0.15em] text-white/30 mt-0.5">Fit al puesto</p>
                              </div>
                            )}
                            {a.ats_score !== null && (
                              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5 text-center">
                                <p className="font-display text-2xl text-white/70">{a.ats_score}</p>
                                <p className="text-[9px] uppercase tracking-[0.15em] text-white/30 mt-0.5">ATS score</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Matches / Gaps */}
                        {(a.key_matches?.length > 0 || a.key_gaps?.length > 0) && (
                          <div className="grid md:grid-cols-2 gap-4">
                            {a.key_matches?.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 mb-2">Skills que encajan</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {a.key_matches.map(m => (
                                    <span key={m} className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-0.5 text-[11px] text-emerald-400">{m}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {a.key_gaps?.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 mb-2">Skills que faltan</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {a.key_gaps.map(g => (
                                    <span key={g} className="rounded-full border border-red-500/20 bg-red-500/[0.05] px-2.5 py-0.5 text-[11px] text-red-400">{g}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Strengths */}
                        {a.strengths?.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 mb-2">Puntos fuertes</p>
                            <ul className="space-y-1">
                              {a.strengths.map(s => (
                                <li key={s} className="flex items-start gap-2 text-xs font-light text-white/55">
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#c9a84c]" />{s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* B2C Badges */}
                        {a.badges?.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 mb-2">Perfil CVitae</p>
                            <div className="flex flex-wrap gap-1.5">
                              {a.badges.map((badge: string) => (
                                <span key={badge} className="inline-flex items-center rounded-full border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06] px-2.5 py-0.5 text-[11px] text-[#c9a84c]/80">
                                  {badge}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Cover letter */}
                        {a.cover_letter && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 mb-1.5">Carta de interés</p>
                            <p className="text-sm font-light text-white/55 leading-relaxed">{a.cover_letter}</p>
                          </div>
                        )}

                        {/* Estado y acciones del reclutador */}
                        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/5 mt-2">
                          <span className="text-[10px] uppercase tracking-[0.15em] text-white/30">Estado</span>
                          <div className="flex flex-wrap gap-1.5">
                            {(['pending', 'contacted', 'interviewing', 'hired', 'rejected'] as const).map(act => (
                              <button
                                key={act}
                                disabled={updatingAction === a.id}
                                onClick={() => handleActionUpdate(a.id, act)}
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition-all ${
                                  a.recruiter_action === act
                                    ? actionColor(act)
                                    : 'text-white/25 border-white/8 bg-transparent hover:border-white/20 hover:text-white/50'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {ACTION_LABELS[act]}
                              </button>
                            ))}
                          </div>
                          {a.cv_text && (
                            <button
                              onClick={() => onAnalyzeSingle(a.cv_text!, a.name)}
                              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.06] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[#c9a84c] transition hover:bg-[#c9a84c]/[0.15]"
                            >
                              <Brain strokeWidth={1.5} className="h-3.5 w-3.5" /> Análisis individual
                            </button>
                          )}
                          {a.cv_download_url && (
                            <a
                              href={a.cv_download_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-white/55 transition hover:border-white/25 hover:text-white"
                            >
                              <Download strokeWidth={1.5} className="h-3.5 w-3.5" /> Ver CV original
                            </a>
                          )}
                          {!a.cv_text && (
                            <p className="text-xs text-amber-200/60 italic">Revisión manual: no se pudo extraer texto</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            ))}
          </ol>
          {hasMore && (
            <div className="flex justify-center pt-3">
              <button
                type="button"
                onClick={() => loadApplicants(page + 1, true)}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-white/55 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore && <Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" />}
                Cargar más candidatos
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Vacancy creation panel ───────────────────────────────────────────────────

interface VacancyRecord {
  id: string
  title: string
  slug: string
  location: string
  modality: string
  created_at: string
  vacancy_applications: { count: number }[]
}

const RUBROS = ['Tecnología', 'Administración', 'Contabilidad / Finanzas', 'Marketing / Ventas', 'Recursos Humanos', 'Logística / Operaciones', 'Producción / Manufactura', 'Salud', 'Educación', 'Gastronomía / Turismo', 'Construcción / Inmobiliaria', 'Legal', 'Otro']

function VacancyPanel({ token, companyName, onAnalyzeApplicant }: { token: string; companyName: string; onAnalyzeApplicant: (cvText: string, name: string) => void }) {
  const [form, setForm] = useState({
    title: '', description: '', requirements: '',
    location: '', modality: 'Presencial', salary_range: '', company_name: companyName, rubro: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [createdUrl, setCreatedUrl] = useState('')
  const [vacancies, setVacancies] = useState<VacancyRecord[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [selectedVacancy, setSelectedVacancy] = useState<VacancyRecord | null>(null)

  useEffect(() => { loadVacancies() }, [])

  const loadVacancies = async () => {
    try {
      const res = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'get_vacancies' }),
      })
      setVacancies((await res.json()).vacancies || [])
    } catch { /* silencioso */ }
    finally { setLoadingList(false) }
  }

  const copyToClipboard = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000) } catch { /* silencioso */ }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setSaveError(''); setCreatedUrl('')
    try {
      const res = await fetch('/.netlify/functions/create-vacancy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear la vacante')
      setCreatedUrl(data.url)
      setForm({ title: '', description: '', requirements: '', location: '', modality: 'Presencial', salary_range: '', company_name: companyName, rubro: '' })
      loadVacancies()
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  if (selectedVacancy) {
    return (
      <ApplicantsPanel
        token={token}
        vacancyId={selectedVacancy.id}
        vacancyTitle={selectedVacancy.title}
        vacancySlug={selectedVacancy.slug}
        onBack={() => setSelectedVacancy(null)}
        onAnalyzeSingle={(cvText, name) => onAnalyzeApplicant(cvText, name)}
      />
    )
  }

  return (
    <div className="space-y-8">
      {/* First-vacancy banner — only when list is loaded and empty */}
      {!loadingList && vacancies.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="rounded-2xl border border-[#c9a84c]/30 bg-[#c9a84c]/[0.05] px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#c9a84c]">Creá tu primera vacante</p>
            <p className="mt-0.5 text-xs font-light text-white/55">
              Obtené un link de postulación propio listo para compartir — cada CV recibido queda registrado automáticamente.
            </p>
          </div>
          <span className="shrink-0 text-xs font-light text-white/35 flex items-center gap-1.5">
            <ChevronDown strokeWidth={1.5} className="h-4 w-4" /> Completá el formulario abajo
          </span>
        </motion.div>
      )}

      {/* Form */}
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="glass-card rounded-3xl p-7"
      >
        <div className="flex items-center gap-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Nueva vacante</p>
          <B2BInfoPopover
            label="Qué verá el candidato"
            title="Un proceso claro para postular"
            description="El candidato verá el puesto, la empresa verificada, los requisitos y el límite del archivo antes de enviar su CV."
            points={['El CV se guarda en un espacio privado.', 'La postulación se envía sólo a esta empresa.', 'Crear un perfil general es opcional y requiere consentimiento separado.']}
          />
        </div>
        <p className="mt-1 text-sm font-light text-white/40">Generá un link de postulación único para compartir con candidatos.</p>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2">Título del puesto *</label>
            <input required value={form.title} onChange={set('title')} placeholder="Ej: Desarrollador Frontend React"
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none transition" />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2">Empresa *</label>
            <input readOnly value={form.company_name} aria-describedby="verified-company-help"
              className="w-full cursor-not-allowed rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] px-4 py-3 text-sm text-white/75 outline-none" />
            <p id="verified-company-help" className="mt-1.5 text-xs text-white/35">Identidad verificada por CVitae. Contactanos si necesitás corregirla.</p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2">Ubicación *</label>
            <input required value={form.location} onChange={set('location')} placeholder="Ej: Asunción, Paraguay"
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none transition" />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2">Modalidad *</label>
            <select required value={form.modality} onChange={set('modality')}
              className="w-full rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-sm text-white focus:border-[#c9a84c]/50 focus:outline-none transition">
              <option value="Presencial">Presencial</option>
              <option value="Remoto">Remoto</option>
              <option value="Híbrido">Híbrido</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2">Rubro / Área</label>
            <select required value={form.rubro} onChange={set('rubro')}
              className="w-full rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-sm text-white focus:border-[#c9a84c]/50 focus:outline-none transition">
              <option value="">Seleccioná el área…</option>
              {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2">Rango salarial <span className="normal-case text-white/20">(opcional)</span></label>
            <input value={form.salary_range} onChange={set('salary_range')} placeholder="Ej: Gs. 3.000.000 – 5.000.000"
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none transition" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2">Descripción *</label>
            <textarea required value={form.description} onChange={set('description')} rows={4}
              placeholder="Describí el rol, responsabilidades y el equipo de trabajo..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none transition resize-none" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2">Requisitos *</label>
            <textarea required value={form.requirements} onChange={set('requirements')} rows={4}
              placeholder="Experiencia requerida, habilidades técnicas, formación..."
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none transition resize-none" />
          </div>
        </div>

        {saveError && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-400">
            <AlertCircle strokeWidth={1.5} className="h-4 w-4 shrink-0" /> {saveError}
          </div>
        )}

        {createdUrl && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="mt-5 rounded-2xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06] p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#c9a84c] mb-2">¡Vacante creada! Tu link de postulación:</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 min-w-0 truncate text-sm text-white/90 font-mono">{createdUrl}</code>
              <button type="button" onClick={() => copyToClipboard(createdUrl, 'new')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.08] px-3 py-1.5 text-xs text-[#c9a84c] transition hover:bg-[#c9a84c]/[0.15] shrink-0">
                {copied === 'new' ? <CheckIcon strokeWidth={2} className="h-3.5 w-3.5" /> : <Copy strokeWidth={1.5} className="h-3.5 w-3.5" />}
                {copied === 'new' ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </motion.div>
        )}

        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-6 py-3 text-sm font-medium text-[#0a0a0a] transition hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.6)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30">
            {saving ? <><Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" /> Creando…</> : <><Plus strokeWidth={2} className="h-4 w-4" /> Crear vacante</>}
          </button>
        </div>
      </motion.form>

      {/* Vacancies list */}
      <div>
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40 mb-4">
          <span className="h-px w-8 bg-white/20" /> Vacantes activas
        </div>
        {loadingList ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#c9a84c]" /></div>
        ) : vacancies.length === 0 ? (
          <div className="glass-card rounded-3xl py-12 px-8 text-center border border-[#c9a84c]/15 bg-[#c9a84c]/[0.02]">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.08]">
              <Link2 strokeWidth={1.25} className="h-7 w-7 text-[#c9a84c]" />
            </div>
            <h3 className="font-display text-xl text-white">Creá tu primera vacante</h3>
            <p className="mt-2 text-sm font-light text-white/50 max-w-xs mx-auto">
              Obtené un link de postulación propio listo para compartir — cada CV recibido queda registrado automáticamente.
            </p>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-6 py-2.5 text-sm font-medium text-[#0a0a0a] transition hover:shadow-[0_0_30px_-4px_rgba(201,168,76,0.5)]"
            >
              <Plus strokeWidth={2} className="h-4 w-4" /> Crear vacante →
            </button>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-white/8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/8 bg-white/[0.02]">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium">Puesto</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium hidden sm:table-cell">Lugar</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium hidden md:table-cell">Modalidad</th>
                  <th className="text-right px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium">CVs</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {vacancies.map((v) => {
                  const url = `https://cvitae.lat/vacante/${v.slug}`
                  const count = v.vacancy_applications?.[0]?.count ?? 0
                  return (
                    <tr key={v.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm text-white font-medium truncate max-w-[180px]">{v.title}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">{new Date(v.created_at).toLocaleDateString('es-PY')}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/50 hidden sm:table-cell">{v.location}</td>
                      <td className="px-4 py-3 text-xs text-white/50 hidden md:table-cell">{v.modality}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-display text-lg ${count > 0 ? 'text-[#c9a84c]' : 'text-white/20'}`}>{count}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedVacancy(v)}
                            className="inline-flex items-center gap-1 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.06] px-2.5 py-1 text-[11px] text-[#c9a84c] transition hover:bg-[#c9a84c]/[0.15]"
                          >
                            <UserCheck strokeWidth={1.5} className="h-3 w-3" /> Ver →
                          </button>
                          <button onClick={() => copyToClipboard(url, v.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/40 transition hover:border-[#c9a84c]/40 hover:text-[#c9a84c]">
                            {copied === v.id ? <CheckIcon strokeWidth={2} className="h-3 w-3" /> : <Copy strokeWidth={1.5} className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Panel principal (autenticado) ────────────────────────────────────────────

interface DashboardStats {
  vacantesActivas: number
  totalPostulantes: number
  cvsAnalizados: number
  paraLlamar: number
}

function RecruiterPanel({ session, onLogout }: { session: RecruiterSession; onLogout: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [vacancyLabel, setVacancyLabel] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<ATSResult | null>(null)
  const [error, setError] = useState('')
  const [balance, setBalance] = useState(session.balance)
  const [activeTab, setActiveTab] = useState<'analyze' | 'history' | 'vacancies'>('analyze')
  const [historyKey, setHistoryKey] = useState(0)
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const operationIdRef = useRef<string | null>(null)
  const [injectCvText, setInjectCvText] = useState<string | null>(null)
  const [injectCandidateName, setInjectCandidateName] = useState<string>('')
  const [compareError, setCompareError] = useState('')

  useEffect(() => {
    fetch('/.netlify/functions/validate-recruiter-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: session.token, action: 'get_dashboard_stats' }),
    }).then(r => r.json()).then(d => { if (d.stats) setStats(d.stats) }).catch(() => {})
  }, [])

  const handleFile = (f: File) => {
    const ok = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!ok.includes(f.type)) { setError('Formato no soportado. Usá PDF, DOCX o TXT.'); return }
    if (f.size > 4 * 1024 * 1024) { setError('El archivo supera 4 MB. Comprimilo o generá una versión optimizada desde Mi Carrera en CVitae.'); return }
    operationIdRef.current = null
    setFile(f); setResult(null); setError('')
  }

  const runAnalysis = async (cvText: string, fileName: string, candidateName: string) => {
    setAnalyzing(true); setError('')
    try {
      if (!cvText || cvText.trim().length < 50) throw new Error('No se pudo extraer texto del CV. Asegurate de que no sea una imagen escaneada.')

      operationIdRef.current ||= pendingOperationId(
        'single',
        `${fileName}:${cvText.length}:${cvText.slice(0, 80)}:${cvText.slice(-80)}`,
      )
      const res = await fetch('/.netlify/functions/analyze-cv-candidate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText,
          mode: 'analyze',
          recruiterToken: session.token,
          operationId: operationIdRef.current,
          fileName,
          jobTitle: vacancyLabel.trim() || null,
        }),
      })
      const data: ATSResult & { saved?: boolean; new_balance?: number; error?: string; retryable?: boolean } = await res.json()
      if (!res.ok) {
        if (data.retryable && operationIdRef.current) clearPendingOperation(operationIdRef.current)
        throw new Error(data.error || 'Error en el análisis')
      }
      if (!data.saved) throw new Error('El análisis terminó, pero no pudo guardarse')
      if (operationIdRef.current) clearPendingOperation(operationIdRef.current)
      if (data.new_balance !== undefined) setBalance(data.new_balance)
      setResult(data); setHistoryKey(k => k + 1)
    } catch (err: any) {
      setError(err.message || 'Error inesperado')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleAnalyze = async () => {
    if (!file) return
    const cvText = await extractTextFromFile(file)
    await runAnalysis(cvText, file.name, '')
  }

  const handleAnalyzeApplicant = (cvText: string, name: string) => {
    operationIdRef.current = null
    setActiveTab('analyze')
    setInjectCvText(cvText)
    setInjectCandidateName(name)
    setVacancyLabel(name)
    setResult(null)
  }

  const handleCompare = async (ids: string[]) => {
    setCompareError('')
    try {
      const res = await fetch('/.netlify/functions/compare-candidates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, token: session.token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setComparison(data)
    } catch (err: any) { setCompareError(err.message || 'Error al comparar candidatos') }
  }

  const handleReset = () => { operationIdRef.current = null; setFile(null); setResult(null); setError(''); setVacancyLabel(''); setInjectCvText(null); setInjectCandidateName('') }

  // When inject mode is active and user clicks Analizar, run directly on injected text
  const handleAnalyzeOrInject = async () => {
    if (injectCvText) {
      await runAnalysis(injectCvText, `${injectCandidateName}.pdf`, injectCandidateName)
    } else {
      await handleAnalyze()
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white antialiased">
      <Helmet>
        <title>Panel Empresas | CVitae</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PanelHeader session={session} balance={balance} onLogout={onLogout} />

      <section className="relative mx-auto max-w-7xl px-6 pt-16 pb-24 md:px-10 md:pt-20">
        {/* Page heading */}
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40">
          <span className="h-px w-8 bg-white/20" /> Panel de empresa
        </div>
        <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-[-0.01em] text-white md:text-5xl">
          {session.company_name} — <em className="italic font-normal">análisis de candidatos</em>.
        </h1>
        <p className="mt-4 max-w-xl text-sm font-light leading-relaxed text-white/55">
          Analizá un CV individual o usá el modo masivo para rankear tu pool completo.
        </p>

        {/* KPI row */}
        {stats && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Vacantes activas', value: stats.vacantesActivas, Icon: Link2, color: 'text-[#c9a84c]' },
              { label: 'Postulantes', value: stats.totalPostulantes, Icon: Users, color: 'text-sky-400' },
              { label: 'CVs analizados', value: stats.cvsAnalizados, Icon: BarChart2, color: 'text-purple-400' },
              { label: 'Para llamar', value: stats.paraLlamar, Icon: TrendingUp, color: 'text-emerald-400' },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="glass-card rounded-2xl p-4">
                <Icon strokeWidth={1.5} className={`h-4 w-4 ${color} mb-2`} />
                <p className={`font-display text-3xl ${color}`}>{value}</p>
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/35 mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Quick links */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/empresas/masivo"
            className="group inline-flex items-center gap-3 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.06] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.18em] text-[#c9a84c] transition-all hover:border-[#c9a84c]/60 hover:bg-[#c9a84c]/[0.1]"
          >
            <Share2 strokeWidth={1.5} className="h-4 w-4" />
            Análisis masivo
          </Link>
        </div>

        {/* Talent bank stat */}
        <div className="mt-8 flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4 w-fit">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
            <Database strokeWidth={1.25} className="h-4 w-4 text-[#c9a84c]" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Banco de talento</p>
            <p className="mt-0.5 text-sm font-light text-white/80">
              Todos los CVs analizados quedan guardados para búsquedas futuras.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-12 flex flex-wrap gap-2">
          {([['analyze', 'Analizar CV', Brain], ['history', 'Historial', History], ['vacancies', 'Mis Vacantes', Link2]] as const).map(([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-medium uppercase tracking-[0.15em] transition-all ${
                activeTab === tab
                  ? 'bg-[#c9a84c] text-[#0a0a0a]'
                  : 'border border-white/10 text-white/50 hover:border-white/25 hover:text-white'
              }`}
            >
              <Icon strokeWidth={1.5} className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mt-8">
          <AnimatePresence mode="wait">
            {activeTab === 'analyze' ? (
              <motion.div key="analyze" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {result ? (
                  <AnalysisResult result={result} fileName={file?.name || ''} vacancyLabel={vacancyLabel} onReset={handleReset} />
                ) : (
                  <div className="grid gap-6 lg:grid-cols-12">
                    {/* Config */}
                    <motion.div
                      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, ease }}
                      className="glass-card rounded-3xl p-7 lg:col-span-5"
                    >
                      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">01 · El puesto</p>
                      <label htmlFor="vacancy" className="mt-7 block text-[11px] uppercase tracking-[0.18em] text-white/40">
                        ¿Para qué puesto? <span className="normal-case text-white/25">(opcional)</span>
                      </label>
                      <input
                        id="vacancy"
                        value={vacancyLabel}
                        onChange={e => setVacancyLabel(e.target.value)}
                        placeholder="Ej: Analista de Marketing · Junio 2026"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-light text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none"
                      />
                      <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Cómo funciona</p>
                        <p className="mt-2 text-sm font-light leading-relaxed text-white/55">
                          La IA lee el CV, devuelve un score ATS (0–100), puntos fuertes y mejoras críticas. El análisis se guarda en tu historial y consume <span className="text-white">1 crédito</span>.
                        </p>
                      </div>
                    </motion.div>

                    {/* Upload */}
                    <motion.div
                      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.7, delay: 0.08, ease }}
                      className="glass-card rounded-3xl p-7 lg:col-span-7"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">02 · El CV</p>
                        <span className="text-xs font-light text-white/30">PDF, DOCX, TXT · máx 4 MB</span>
                      </div>

                      {injectCvText && (
                        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06] px-4 py-3">
                          <UserCheck strokeWidth={1.5} className="h-4 w-4 text-[#c9a84c] shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{injectCandidateName}</p>
                            <p className="text-[11px] text-[#c9a84c]/70 mt-0.5">CV extraído de postulación · listo para analizar</p>
                          </div>
                          <button onClick={handleReset} className="text-white/30 hover:text-white transition-colors">
                            <X strokeWidth={1.5} className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      {!injectCvText && <div
                        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                        onClick={() => !file && fileRef.current?.click()}
                        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition-all duration-300 ${
                          isDragging ? 'border-[#c9a84c]/60 bg-[#c9a84c]/[0.04]'
                          : file ? 'border-[#c9a84c]/30 bg-[#c9a84c]/[0.02]'
                          : 'border-white/12 bg-white/[0.015] hover:border-white/25'
                        }`}
                      >
                        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                        {file ? (
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#c9a84c]/30 bg-[#c9a84c]/10">
                              <FileText strokeWidth={1.25} className="h-5 w-5 text-[#c9a84c]" />
                            </div>
                            <div>
                              <p className="font-display text-xl text-white/90">{file.name}</p>
                              <p className="mt-1 text-xs font-light text-white/40">{(file.size / 1024).toFixed(0)} KB · listo para analizar</p>
                            </div>
                            <button onClick={e => { e.stopPropagation(); handleReset() }}
                              className="inline-flex items-center gap-1.5 text-xs text-white/35 transition hover:text-white">
                              <X strokeWidth={1.5} className="h-3 w-3" /> Cambiar archivo
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                              <Upload strokeWidth={1.25} className="h-5 w-5 text-[#c9a84c]" />
                            </div>
                            <p className="font-display text-xl text-white/90">Arrastrá el CV acá</p>
                            <p className="text-xs font-light text-white/45">o hacé click para seleccionarlo</p>
                          </div>
                        )}
                      </div>}

                      <AnimatePresence>
                        {error && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4">
                            <AlertCircle strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                            <p className="text-sm font-light text-red-400">{error}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-light text-white/35">
                          {balance === 0 ? (
                            <><span className="text-red-400">Sin créditos.</span> <a href="mailto:hola@cvitae.lat" className="underline hover:text-white">Contactá a CVitae</a>.</>
                          ) : (
                            `Créditos disponibles: ${balance}`
                          )}
                        </p>
                        <button
                          onClick={handleAnalyzeOrInject}
                          disabled={(!file && !injectCvText) || analyzing || balance === 0}
                          className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-6 py-3 text-sm font-medium text-[#0a0a0a] transition-all hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.6)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
                        >
                          {analyzing ? <><Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" /> Analizando…</> : <><Brain strokeWidth={1.5} className="h-4 w-4" /> Analizar CV</>}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </motion.div>
            ) : activeTab === 'history' ? (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <HistoryPanel key={historyKey} token={session.token} onToggleStar={() => setHistoryKey(k => k + 1)} onCompare={handleCompare} />
                {compareError && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-400">
                    <AlertCircle strokeWidth={1.5} className="h-4 w-4 shrink-0" /> {compareError}
                  </div>
                )}
                {comparison && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
                    <ComparisonResultComponent result={comparison} onClose={() => { setComparison(null); setCompareError('') }} />
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div key="vacancies" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <VacancyPanel token={session.token} companyName={session.company_name} onAnalyzeApplicant={handleAnalyzeApplicant} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <footer className="border-t border-white/5 px-6 py-10 text-xs text-white/30">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="font-display text-base text-white/60">CVitae</span>
          <span>Panel · sesión segura</span>
        </div>
      </footer>
      <ProductGuide
        storageKey="b2b_panel_v1"
        label="Panel de empresa"
        steps={[
          { title: 'Publicá una vacante', description: 'Completá cargo, requisitos y ubicación. Si tu empresa está verificada, CVitae genera un enlace de postulación y habilita el matching.' },
          { title: 'Revisá candidatos', description: 'Cada análisis explica fortalezas, brechas y ajuste al puesto. El score ordena; la decisión siempre sigue siendo humana.' },
          { title: 'Construí tu shortlist', description: 'Marcá a quién contactar, entrevistar o descartar y agregá notas. El historial queda disponible para tu equipo.' },
        ]}
      />
    </main>
  )
}

// ─── Token login ──────────────────────────────────────────────────────────────

function TokenLogin({ onSuccess }: { onSuccess: (s: RecruiterSession) => void }) {
  const [token, setToken] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('token') || ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showVerification, setShowVerification] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [requestEmailSent, setRequestEmailSent] = useState(false)
  const [verificationForm, setVerificationForm] = useState({
    name: '', email: '', company: '', legalName: '', ruc: '', website: '', contactRole: '', phone: '', hiringNeed: '',
  })

  const submitVerification = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/.netlify/functions/submit-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: verificationForm.name, email: verificationForm.email, company_name: verificationForm.company,
          source: 'company_verification',
          verification_data: {
            legal_name: verificationForm.legalName, ruc: verificationForm.ruc, website: verificationForm.website,
            contact_role: verificationForm.contactRole, phone: verificationForm.phone, hiring_need: verificationForm.hiringNeed,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'No pudimos enviar la solicitud')
      setRequestEmailSent(data.confirmationSent === true)
      setRequestSent(true)
    } catch (requestError: any) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  const handleValidate = async () => {
    if (!token.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const data = await res.json()
      if (data.valid) onSuccess({ ...data, token: token.trim() })
      else setError(data.error || 'Token inválido. Verificá el código e intentá de nuevo.')
    } catch { setError('Error de conexión. Intentá de nuevo.') }
    finally { setLoading(false) }
  }

  const features = [
    'Analizá CVs individualmente o en modo masivo con ranking IA',
    'Ranking comparativo con score, fortalezas y red flags',
    'Banco de talento histórico, acumulado por tu empresa',
    'Link de postulación propio que alimenta tu base',
  ]

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white antialiased">
      <Ambient />
      <Helmet>
        <title>Para Empresas | CVitae — Análisis de CVs con IA</title>
        <meta name="description" content="Acceso al panel de empresas. Analizá CVs con IA y encontrá al candidato ideal en segundos." />
        <link rel="canonical" href="https://cvitae.lat/empresas" />
        <meta property="og:title" content="Para Empresas | CVitae — Análisis de CVs con IA" />
        <meta property="og:description" content="Analizá lotes de CVs, obtené un ranking comparativo y encontrá al candidato ideal." />
        <meta property="og:url" content="https://cvitae.lat/empresas" />
        <meta property="og:type" content="website" />
      </Helmet>

      {/* Top bar */}
      <header className="border-b border-white/5 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/45 transition-colors hover:text-white">
            <ArrowLeft strokeWidth={1.5} className="h-4 w-4" /> Inicio
          </Link>
          <span className="text-xs uppercase tracking-[0.18em] text-white/30">Panel de empresas</span>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-6 pt-16 pb-24 md:px-10 md:pt-20">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] items-start">
          {/* Left — value prop */}
          <div className="relative">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40">
              <span className="h-px w-8 bg-white/20" /> Para empresas
            </div>
            <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-[-0.01em] text-white md:text-6xl">
              Encontrá al candidato ideal en <em className="italic font-normal">segundos</em>.
            </h1>
            <p className="mt-5 max-w-md text-sm font-light leading-relaxed text-white/55 md:text-base">
              CVitae lee los CVs por vos, los compara con criterio ATS y te entrega un ranking listo para entrevistar. Cero horas filtrando PDFs.
            </p>

            <ol className="mt-7 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Flujo de evaluación">
              {['CVs recibidos', 'Análisis explicable', 'Shortlist para revisar'].map((step, index) => (
                <li key={step} className="flex items-center gap-2 border-y border-white/8 py-3 text-[10px] uppercase tracking-[0.12em] text-white/60">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#c9a84c]/40 text-[#c9a84c]">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>

            <ul className="mt-10 space-y-4">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm font-light text-white/75">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a84c]" /> {f}
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-2xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06] px-5 py-4">
              <p className="text-sm font-medium text-[#c9a84c]">
                Servicio gratuito para las primeras 100 empresas
              </p>
              <p className="mt-1 text-xs font-light text-white/55">
                Valor real USD 79/mes — sin costo mientras seas parte del grupo fundador.
              </p>
            </div>
          </div>

          {/* Right — login form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="glass-card rounded-3xl p-8"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/10">
                <Building2 strokeWidth={1.25} className="h-4 w-4 text-[#c9a84c]" />
              </div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">Ya tengo acceso · token de empresa</p>
            </div>

            <h2 className="mt-4 font-display text-2xl text-white">Ingresá tu token de empresa.</h2>
            <p className="mt-1 text-xs font-light text-white/40">Formato: REC-XXXXX-2026</p>

            <div className="mt-6 space-y-4">
              <div className="relative">
                <Key strokeWidth={1.25} className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input
                  type="text"
                  aria-label="Token de empresa"
                  value={token}
                  onChange={e => setToken(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleValidate()}
                  placeholder="REC-A1B2C-2026"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] pl-10 pr-4 py-3 text-sm font-mono tracking-wider text-white placeholder:text-white/20 focus:border-[#c9a84c]/50 focus:outline-none transition"
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle strokeWidth={1.5} className="h-4 w-4 shrink-0" /> {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={handleValidate}
                disabled={loading || !token.trim()}
                className="group w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-6 py-3 text-sm font-medium text-[#0a0a0a] transition-all hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.6)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
              >
                {loading
                  ? <><Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" /> Verificando…</>
                  : <>Entrar al panel <ChevronRight strokeWidth={1.5} className="h-4 w-4 transition group-hover:translate-x-0.5" /></>
                }
              </button>
            </div>

            <div className="mt-8 border-t border-white/8 pt-6 text-center">
              <p className="text-xs font-light text-white/35">¿Todavía no tenés token?</p>
              <button onClick={() => setShowVerification(value => !value)} className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-[#c9a84c] transition hover:text-[#e6cf8a]">
                Solicitar acceso verificado <ChevronRight strokeWidth={1.5} className={`h-3.5 w-3.5 transition ${showVerification ? 'rotate-90' : ''}`} />
              </button>
            </div>

            <AnimatePresence>
              {showVerification && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  {requestSent ? (
                    <div className="mt-6 border-t border-white/8 pt-6 text-center">
                      <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400" />
                      <p className="mt-3 text-sm text-white">Recibimos la solicitud.</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/40">Revisaremos los datos antes de habilitar publicaciones y matching.</p>
                      <p className={`mt-3 text-xs leading-relaxed ${requestEmailSent ? 'text-emerald-300/80' : 'text-amber-200/80'}`}>
                        {requestEmailSent
                          ? `También enviamos una confirmación a ${verificationForm.email}.`
                          : 'La solicitud quedó registrada, pero no pudimos confirmar el envío del email. Escribinos a contacto@cvitae.lat si no recibís novedades.'}
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={submitVerification} className="mt-6 space-y-3 border-t border-white/8 pt-6 text-left">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Verificación de empresa</p>
                        <p className="mt-1 text-xs leading-relaxed text-white/40">Estos datos no se publican; se usan para confirmar identidad y proteger a los candidatos.</p>
                      </div>
                      {[
                        ['name', 'Nombre y apellido', 'text', true], ['email', 'Email corporativo', 'email', true],
                        ['company', 'Nombre comercial', 'text', true], ['legalName', 'Razón social', 'text', true],
                        ['ruc', 'RUC', 'text', true], ['website', 'Sitio web o LinkedIn de la empresa', 'url', false],
                        ['contactRole', 'Tu cargo', 'text', true], ['phone', 'Teléfono de contacto', 'tel', true],
                      ].map(([key, placeholder, type, required]) => (
                        <input key={String(key)} required={Boolean(required)} type={String(type)} value={verificationForm[key as keyof typeof verificationForm]} onChange={event => setVerificationForm(current => ({ ...current, [String(key)]: event.target.value }))} placeholder={String(placeholder)} className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none" />
                      ))}
                      <textarea required value={verificationForm.hiringNeed} onChange={event => setVerificationForm(current => ({ ...current, hiringNeed: event.target.value }))} rows={3} placeholder="¿Qué perfiles contratan y con qué frecuencia?" className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none" />
                      <button disabled={loading} className="w-full rounded-full border border-[#c9a84c]/40 px-5 py-3 text-sm text-[#c9a84c] transition hover:bg-[#c9a84c]/10 disabled:opacity-40">{loading ? 'Enviando…' : 'Enviar para verificación'}</button>
                    </form>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>
    </main>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

const SESSION_KEY = 'cvitae_recruiter_session'

export default function Recruiters() {
  const [session, setSession] = useState<RecruiterSession | null>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })

  const handleLogin = (s: RecruiterSession) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    setSession(s)
  }

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setSession(null)
  }

  if (!session) return <><TokenLogin onSuccess={handleLogin} /><FeedbackReporter audience="b2b" feature="Acceso empresarial" className="bottom-5 left-5" /></>
  return <><RecruiterPanel session={session} onLogout={handleLogout} /><FeedbackReporter audience="b2b" className="bottom-5 left-5" /></>
}
