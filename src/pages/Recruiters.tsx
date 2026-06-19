import { useState, useRef, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Key, AlertCircle, ChevronRight,
  Coins, LogOut, Loader2, History, Sparkles,
  ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Star, Brain, Users, Trophy, ArrowLeft, Share2, Database,
  FileText, Upload, RotateCcw, X
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
          <div className="flex items-center gap-2 rounded-full border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06] px-3.5 py-1.5">
            <Coins strokeWidth={1.5} className="h-4 w-4 text-[#c9a84c]" />
            <span className="text-xs font-medium tracking-wide text-white/80">
              <span className="text-[#c9a84c]">{balance}</span> créditos
            </span>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40">
          <span className="h-px w-8 bg-white/20" /> {history.length} análisis guardados
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length >= 2 && (
            <button
              onClick={() => onCompare(selectedIds)}
              className="inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-4 py-2 text-xs font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
            >
              <Users strokeWidth={1.5} className="h-3.5 w-3.5" /> Comparar {selectedIds.length}
            </button>
          )}
          <Link
            href="/empresas/masivo"
            className="inline-flex items-center gap-2 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.06] px-4 py-2 text-xs uppercase tracking-[0.15em] text-[#c9a84c] transition hover:border-[#c9a84c]/60"
          >
            <Sparkles strokeWidth={1.5} className="h-3.5 w-3.5" /> Análisis masivo
          </Link>
        </div>
      </div>

      <ol className="space-y-3">
        {history.map((record, i) => (
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
                  {new Date(record.created_at).toLocaleDateString()} · {record.file_name}
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

// ─── Panel principal (autenticado) ────────────────────────────────────────────

function RecruiterPanel({ session, onLogout }: { session: RecruiterSession; onLogout: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [vacancyLabel, setVacancyLabel] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<ATSResult | null>(null)
  const [error, setError] = useState('')
  const [balance, setBalance] = useState(session.balance)
  const [activeTab, setActiveTab] = useState<'analyze' | 'history'>('analyze')
  const [historyKey, setHistoryKey] = useState(0)
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    const ok = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!ok.includes(f.type)) { setError('Formato no soportado. Usá PDF, DOCX o TXT.'); return }
    if (f.size > 5 * 1024 * 1024) { setError('El archivo no puede superar 5 MB.'); return }
    setFile(f); setResult(null); setError('')
  }

  const handleAnalyze = async () => {
    if (!file) return
    setAnalyzing(true); setError('')
    try {
      const cvText = await extractTextFromFile(file)
      if (!cvText || cvText.trim().length < 50) throw new Error('No se pudo extraer texto del CV. Asegurate de que no sea una imagen escaneada.')

      const res = await fetch('/.netlify/functions/analyze-cv-candidate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText, mode: 'analyze', recruiterToken: session.token }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Error en el análisis')
      const data: ATSResult = await res.json()

      const saveRes = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: session.token, action: 'save_analysis',
          analysisData: {
            candidate_name: cvText.split('\n').find(l => l.trim().length > 2)?.trim() || null,
            file_name: file.name,
            ats_score: data.atsScore,
            strengths: data.strengths,
            critical_improvements: data.criticalImprovements,
            vacancy_label: vacancyLabel.trim() || null,
            raw_cv_text: cvText.substring(0, 3000),
          },
        }),
      })
      const saveData = await saveRes.json()
      if (saveData.new_balance !== undefined) setBalance(saveData.new_balance)
      setResult(data); setHistoryKey(k => k + 1)
    } catch (err: any) {
      setError(err.message || 'Error inesperado')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCompare = async (ids: string[]) => {
    try {
      const res = await fetch('/.netlify/functions/compare-candidates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, token: session.token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setComparison(data)
    } catch (err: any) { alert(err.message) }
  }

  const handleReset = () => { setFile(null); setResult(null); setError(''); setVacancyLabel('') }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white antialiased">
      <Ambient />
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
          Analizá un CV individual o usá el modo masivo para rankear hasta 30 en una corrida.
        </p>

        {/* Quick links */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/empresas/masivo"
            className="group inline-flex items-center gap-3 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.06] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.18em] text-[#c9a84c] transition-all hover:border-[#c9a84c]/60 hover:bg-[#c9a84c]/[0.1]"
          >
            <Share2 strokeWidth={1.5} className="h-4 w-4" />
            Análisis masivo (hasta 30 CVs)
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
        <div className="mt-12 flex gap-2">
          {([['analyze', 'Analizar CV', Brain], ['history', 'Historial', History]] as const).map(([tab, label, Icon]) => (
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
                        <span className="text-xs font-light text-white/30">PDF, DOCX, TXT · máx 5 MB</span>
                      </div>

                      <div
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
                      </div>

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
                          onClick={handleAnalyze}
                          disabled={!file || analyzing || balance === 0}
                          className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-6 py-3 text-sm font-medium text-[#0a0a0a] transition-all hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.6)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
                        >
                          {analyzing ? <><Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" /> Analizando…</> : <><Brain strokeWidth={1.5} className="h-4 w-4" /> Analizar CV</>}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <HistoryPanel key={historyKey} token={session.token} onToggleStar={() => setHistoryKey(k => k + 1)} onCompare={handleCompare} />
                {comparison && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
                    <ComparisonResultComponent result={comparison} onClose={() => setComparison(null)} />
                  </motion.div>
                )}
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
    </div>
  )
}

// ─── Token login ──────────────────────────────────────────────────────────────

function TokenLogin({ onSuccess }: { onSuccess: (s: RecruiterSession) => void }) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    'Analizá un CV o un lote de hasta 30 en una corrida',
    'Ranking comparativo con score, fortalezas y red flags',
    'Banco de talento histórico, acumulado por tu empresa',
    'Link de postulación propio que alimenta tu base',
  ]

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white antialiased">
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

            {/* Organic line */}
            <svg viewBox="0 0 800 60" preserveAspectRatio="none" className="mt-6 h-8 w-full max-w-md opacity-40" aria-hidden="true">
              <defs>
                <linearGradient id="gl-login" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#c9a84c" stopOpacity="0" />
                  <stop offset="50%" stopColor="#c9a84c" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#e6cf8a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M 8 52 C 70 48, 110 30, 150 35 S 250 55, 310 20 S 420 5, 480 15 S 580 40, 640 8 S 760 4, 792 10" fill="none" stroke="url(#gl-login)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>

            <ul className="mt-10 space-y-4">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm font-light text-white/75">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a84c]" /> {f}
                </li>
              ))}
            </ul>
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
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">Acceso con token</p>
            </div>

            <h2 className="mt-4 font-display text-2xl text-white">Ingresá tu token de empresa.</h2>
            <p className="mt-1 text-xs font-light text-white/40">Formato: REC-XXXXX-2026</p>

            <div className="mt-6 space-y-4">
              <div className="relative">
                <Key strokeWidth={1.25} className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input
                  type="text"
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
              <a href="/#registro" className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-[#c9a84c] transition hover:text-[#e6cf8a]">
                Solicitar acceso a la Beta <ChevronRight strokeWidth={1.5} className="h-3.5 w-3.5" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function Recruiters() {
  const [session, setSession] = useState<RecruiterSession | null>(null)
  if (!session) return <TokenLogin onSuccess={setSession} />
  return <RecruiterPanel session={session} onLogout={() => setSession(null)} />
}
