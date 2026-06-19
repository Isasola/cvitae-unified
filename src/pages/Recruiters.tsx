import { useState, useRef, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Key, Upload, FileText, CheckCircle2, XCircle, Check,
  AlertCircle, ChevronRight, RotateCcw, Brain, Coins,
  Star, LogOut, Loader2, History, Sparkles,
  ChevronDown, ChevronUp, Users
} from 'lucide-react'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { DotGrid } from '@/components/cvitae/Particles'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'

// ─── Tipos ────────────────────────────────────────────────────────────────────

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
  top3: Array<{
    name: string
    score: number
    strengths: string[]
    reason: string
  }>
  finalRecommendation: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return '#facc15'
  return '#ef4444'
}

function scoreLabel(score: number) {
  if (score >= 80) return 'Candidato destacado'
  if (score >= 60) return 'Candidato promedio'
  return 'Necesita mejoras'
}

async function extractTextFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer
      if (file.type === 'text/plain') {
        resolve(new TextDecoder().decode(arrayBuffer))
        return
      }
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      try {
        const res = await fetch('/.netlify/functions/extract-pdf-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
        })
        const data = await res.json()
        resolve(data.text || '')
      } catch {
        reject(new Error('No se pudo extraer el texto del archivo'))
      }
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}

// ─── Login ────────────────────────────────────────────────────────────────────

function TokenLogin({ onSuccess }: { onSuccess: (session: RecruiterSession) => void }) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleValidate = async () => {
    if (!token.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const data = await res.json()
      if (data.valid) {
        onSuccess({ ...data, token: token.trim() })
      } else {
        setError(data.error || 'Token inválido. Verificá el código e intentá de nuevo.')
      }
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    'Analizá un CV o un lote de hasta 30 en una corrida',
    'Ranking comparativo con score, fortalezas y red flags',
    'Banco de talento histórico, acumulado por tu empresa',
    'Link de postulación propio que alimenta tu base',
  ]

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Para Empresas · CVitae</title>
        <meta name="description" content="Acceso al panel de empresas. Analizá CVs con IA y encontrá al candidato ideal en segundos." />
      </Helmet>
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 items-start">
          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Panel de Empresas</p>
            <h1 className="font-display text-4xl sm:text-5xl mt-2 text-cream leading-tight">
              Encontrá al candidato ideal en <em>segundos</em>.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-md leading-relaxed">
              CVitae lee los CVs por vos, los compara con criterio ATS y te entrega un
              ranking listo para entrevistar. Cero horas filtrando PDFs.
            </p>
            <svg viewBox="0 0 800 100" preserveAspectRatio="none" className="absolute -bottom-2 left-0 right-0 h-12 opacity-40" aria-hidden="true">
              <defs>
                <linearGradient id="gl-login" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="oklch(0.78 0.13 82)" stopOpacity="0" />
                  <stop offset="50%" stopColor="oklch(0.78 0.13 82)" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="oklch(0.86 0.10 86)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M 8 92 C 70 88, 110 70, 150 75 S 250 95, 310 60 S 420 25, 480 35 S 580 70, 640 28 S 760 8, 792 14" fill="none" stroke="url(#gl-login)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <ul className="mt-10 space-y-3">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-cream/90">
                  <Check className="h-4 w-4 text-gold mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="editorial-panel p-8">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-gold" />
              <p className="text-[11px] uppercase tracking-[0.22em] text-gold">Acceso con token</p>
            </div>
            <h2 className="font-display text-2xl text-cream mt-2">Ingresá tu token de empresa.</h2>
            <p className="text-xs text-muted-foreground mt-1">Formato: REC-XXXXX-2026</p>
            <div className="mt-6 space-y-3">
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={token}
                  onChange={e => setToken(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleValidate()}
                  placeholder="REC-A1B2C-2026"
                  className="w-full glass-panel pl-10 pr-3 py-3 text-sm text-cream placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold font-mono tracking-wider"
                />
              </div>
              {error && (
                <p className="text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </p>
              )}
              <button
                onClick={handleValidate}
                disabled={loading || !token.trim()}
                className="w-full inline-flex items-center justify-center gap-2 bg-gold text-ink hover:bg-gold-soft h-11 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? <><Loader2 className="animate-spin h-4 w-4" />Verificando…</> : <>Entrar al panel <ChevronRight className="h-4 w-4" /></>}
              </button>
            </div>
            <div className="mt-8 pt-6 border-t border-border/40 text-center">
              <p className="text-xs text-muted-foreground">¿Todavía no tenés token?</p>
              <a href="/#registro" className="text-sm text-gold hover:text-gold-soft mt-1 inline-flex items-center gap-1 transition-colors">
                Solicitar acceso a la Beta <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = scoreColor(score)
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
          <motion.circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }} transition={{ duration: 1.2, ease: 'easeOut' }}
            strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span className="text-3xl font-bold" style={{ color }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            {score}
          </motion.span>
          <span className="text-xs text-muted/80">/ 100</span>
        </div>
      </div>
      <span className="mt-3 text-sm font-medium" style={{ color }}>{scoreLabel(score)}</span>
    </div>
  )
}

// ─── Resultado del análisis ───────────────────────────────────────────────────

function AnalysisResult({ result, fileName, vacancyLabel, onReset }: {
  result: ATSResult; fileName: string; vacancyLabel: string; onReset: () => void
}) {
  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <GlassCard className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
        <ScoreRing score={result.atsScore} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-white font-semibold truncate">{fileName}</p>
            {vacancyLabel && <Badge variant="gold" className="shrink-0">{vacancyLabel}</Badge>}
          </div>
          <p className="text-muted text-sm leading-relaxed">
            Score ATS — indica qué tan bien pasa el CV los filtros automáticos. Mayor a 80 es ideal para posiciones competitivas.
          </p>
          {result.recommendation && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="gold">Recomendación: {result.recommendation}</Badge>
            </div>
          )}
          <div className="flex justify-center sm:justify-start mt-4">
            <button onClick={onReset} className="flex items-center gap-2 text-xs text-gold hover:text-white transition-colors">
              <RotateCcw size={14} />Analizar otro CV
            </button>
          </div>
        </div>
      </GlassCard>

      {result.summary && (
        <GlassCard>
          <p className="text-white/90 text-sm leading-relaxed">{result.summary}</p>
        </GlassCard>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <GlassCard>
          <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
            <CheckCircle2 size={18} />Puntos fuertes
          </h3>
          <ul className="space-y-3">
            {result.strengths.map((s, i) => (
              <li key={i} className="text-white/80 text-sm flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard>
          <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2">
            <XCircle size={18} />Mejoras críticas
          </h3>
          <ul className="space-y-3">
            {result.criticalImprovements.map((m, i) => (
              <li key={i} className="text-white/80 text-sm flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                {m}
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
      <div className="flex items-center justify-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
        <CheckCircle2 size={16} className="text-emerald-400" />
        <p className="text-emerald-400 text-sm font-medium">Análisis guardado exitosamente en el historial.</p>
      </div>
    </motion.div>
  )
}

// ─── Historial ────────────────────────────────────────────────────────────────

function HistoryPanel({ token, onToggleStar, onCompare }: { token: string; onToggleStar: () => void; onCompare: (ids: string[]) => void }) {
  const [history, setHistory] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => { loadHistory() }, [])

  const loadHistory = async () => {
    try {
      const res = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'get_history' }),
      })
      const data = await res.json()
      setHistory(data.history || [])
    } catch { console.error('Error cargando historial') }
    finally { setLoading(false) }
  }

  const toggleStar = async (id: string) => {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, is_starred: !h.is_starred } : h))
    try {
      await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'toggle_star', analysis_id: id }),
      })
    } catch {}
    onToggleStar()
  }

  const handleCheck = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gold" /></div>

  return (
    <div className="space-y-4">
      {history.length === 0 ? (
        <GlassCard className="text-center py-20">
          <History size={40} className="text-muted/30 mx-auto mb-4" />
          <p className="text-muted/80">No hay análisis guardados aún.</p>
        </GlassCard>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <GoldButton href="/empresas/masivo" variant="outline" size="sm">
              <Sparkles size={14} /> Análisis Masivo (NUEVO)
            </GoldButton>
            {selectedIds.length >= 2 && (
              <GoldButton onClick={() => onCompare(selectedIds)}>
                <Users size={16} /> Comparar {selectedIds.length} seleccionados
              </GoldButton>
            )}
          </div>
          <div className="space-y-3">
            {history.map(record => (
              <GlassCard key={record.id} className="group hover:border-gold/30 transition-all">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(record.id)}
                    onChange={() => handleCheck(record.id)}
                    className="w-4 h-4 accent-[#c9a84c]"
                  />
                  <div className="flex-1 min-w-0" onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold" style={{ color: scoreColor(record.ats_score) }}>{record.ats_score}</span>
                      <p className="text-white font-medium truncate">{record.candidate_name || record.file_name}</p>
                      {record.vacancy_label && <Badge variant="gold" className="text-[10px] py-0">{record.vacancy_label}</Badge>}
                    </div>
                    <p className="text-muted/70 text-xs">
                      {new Date(record.created_at).toLocaleDateString()} · {record.file_name}
                    </p>
                  </div>
                  <button onClick={() => toggleStar(record.id)} className={`p-2 rounded-lg transition-colors ${record.is_starred ? 'text-gold' : 'text-muted/30 hover:text-gold'}`}>
                    <Star size={18} fill={record.is_starred ? 'currentColor' : 'none'} />
                  </button>
                  <button onClick={() => setExpandedId(expandedId === record.id ? null : record.id)} className="p-2 text-muted/30 hover:text-white transition-colors">
                    {expandedId === record.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>

                <AnimatePresence>
                  {expandedId === record.id && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="mt-4 pt-4 border-t border-white/5 grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-emerald-400 text-xs font-semibold mb-2 uppercase tracking-wider">Puntos fuertes</p>
                        <ul className="space-y-1">
                          {(record.strengths as any as string[]).map((s, i) => (
                            <li key={i} className="text-white/70 text-xs flex items-start gap-2">
                              <CheckCircle2 size={10} className="text-emerald-400 shrink-0 mt-0.5" />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-red-400 text-xs font-semibold mb-2 uppercase tracking-wider">Mejoras críticas</p>
                        <ul className="space-y-1">
                          {(record.critical_improvements as any as string[]).map((m, i) => (
                            <li key={i} className="text-white/70 text-xs flex items-start gap-2">
                              <XCircle size={10} className="text-red-400 shrink-0 mt-0.5" />{m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Panel Principal ──────────────────────────────────────────────────────────

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
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!allowed.includes(f.type)) { setError('Formato no soportado. Usá PDF, DOCX o TXT.'); return }
    if (f.size > 5 * 1024 * 1024) { setError('El archivo no puede superar 5 MB.'); return }
    setFile(f); setResult(null); setError('')
  }

  const handleAnalyze = async () => {
    if (!file) return
    setAnalyzing(true); setError('')
    try {
      const cvText = await extractTextFromFile(file)
      if (!cvText || cvText.trim().length < 50) {
        throw new Error('No se pudo extraer texto del CV. Asegurate de que el PDF no sea una imagen escaneada.')
      }

      const res = await fetch('/.netlify/functions/analyze-cv-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText, mode: 'analyze', recruiterToken: session.token }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error en el análisis') }
      const data: ATSResult = await res.json()

      const firstLine = cvText.split('\n').find(l => l.trim().length > 2)?.trim() || null

      const saveRes = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: session.token,
          action: 'save_analysis',
          analysisData: {
            candidate_name: firstLine,
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

      setResult(data)
      setHistoryKey(k => k + 1)
    } catch (err: any) {
      setError(err.message || 'Error inesperado')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCompare = async (ids: string[]) => {
    try {
      const res = await fetch('/.netlify/functions/compare-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, token: session.token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setComparison(data)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleReset = () => { setFile(null); setResult(null); setError(''); setVacancyLabel('') }

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="relative pt-24 pb-16 px-4">
        <DotGrid />
        <div className="container mx-auto max-w-4xl relative z-10">

          {/* Header */}
          <motion.div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div>
              <Badge variant="gold" className="mb-2"><Building2 size={12} />Panel Empresas</Badge>
              <h1 className="text-2xl font-bold text-white">{session.company_name}</h1>
              <p className="text-muted/80 text-sm mt-1">Analizador de CV con inteligencia artificial</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-xl">
                <Coins className="text-gold" size={16} />
                <span className="text-white font-semibold">{balance}</span>
                <span className="text-muted/70 text-sm">créditos</span>
              </div>
              <GoldButton variant="ghost" size="sm" onClick={onLogout}><LogOut size={14} />Salir</GoldButton>
            </div>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {([['analyze', 'Analizar CV', Brain], ['history', 'Historial', History]] as const).map(([tab, label, Icon]) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab ? 'bg-gold text-[#0a0a0a]' : 'bg-white/5 text-muted hover:bg-white/10'}`}>
                <Icon size={15} />{label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'analyze' ? (
              <motion.div key="analyze" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {result ? (
                  <AnalysisResult result={result} fileName={file?.name || ''} vacancyLabel={vacancyLabel} onReset={handleReset} />
                ) : (
                  <div className="space-y-6">
                    {/* Instrucciones */}
                    <GlassCard>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                          <Brain className="text-gold" size={20} />
                        </div>
                        <div>
                          <h2 className="text-white font-semibold mb-1">¿Cómo funciona?</h2>
                          <p className="text-muted text-sm leading-relaxed">
                            Subí el CV de un candidato (PDF, DOCX o TXT). La IA analiza en segundos y devuelve un{' '}
                            <strong className="text-white">score ATS (0–100)</strong>, puntos fuertes, mejoras críticas y una recomendación automática.
                            Cada análisis se guarda automáticamente en tu historial y consume{' '}
                            <strong className="text-gold">1 crédito</strong>.
                          </p>
                        </div>
                      </div>
                    </GlassCard>

                    {/* Etiqueta de vacante (opcional) */}
                    <div>
                      <label className="block text-sm font-medium text-white/60 mb-2">
                        ¿Para qué puesto es este CV? <span className="text-muted/60">(opcional, para organizar el historial)</span>
                      </label>
                      <input
                        type="text"
                        value={vacancyLabel}
                        onChange={e => setVacancyLabel(e.target.value)}
                        placeholder="Ej: Desarrollador React · Junio 2026"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#3a3a3a] focus:outline-none focus:border-gold/50 transition-all text-sm"
                      />
                    </div>

                    {/* Drop zone */}
                    <div
                      className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer ${
                        isDragging ? 'border-gold bg-gold/5'
                        : file ? 'border-gold/40 bg-gold/[0.03]'
                        : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
                      }`}
                      onClick={() => !file && fileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                    >
                      <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                      <AnimatePresence mode="wait">
                        {file ? (
                          <motion.div key="file" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center">
                              <FileText className="text-gold" size={28} />
                            </div>
                            <div>
                              <p className="text-white font-semibold">{file.name}</p>
                              <p className="text-muted/70 text-sm mt-1">{(file.size / 1024).toFixed(0)} KB · listo para analizar</p>
                            </div>
                            <button onClick={e => { e.stopPropagation(); handleReset() }} className="text-xs text-muted/60 hover:text-white transition-colors">
                              Cambiar archivo
                            </button>
                          </motion.div>
                        ) : (
                          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                              <Upload className="text-muted/70" size={28} />
                            </div>
                            <div>
                              <p className="text-white font-medium">Arrastrá el CV acá</p>
                              <p className="text-muted/70 text-sm mt-1">o hacé clic para seleccionar</p>
                            </div>
                            <p className="text-muted/50 text-xs">PDF, DOCX o TXT · máx. 5 MB</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <AnimatePresence>
                      {error && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                          <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={16} />
                          <p className="text-red-400 text-sm">{error}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex justify-center">
                      <GoldButton onClick={handleAnalyze} disabled={!file || analyzing || balance === 0} size="lg" className="min-w-[200px]">
                        {analyzing ? <><Loader2 className="animate-spin" size={16} />Analizando con IA...</>
                          : balance === 0 ? 'Sin créditos disponibles'
                          : <><Brain size={18} />Analizar CV</>}
                      </GoldButton>
                    </div>
                    {balance === 0 && (
                      <p className="text-center text-sm text-muted/70">
                        Necesitás más créditos.{' '}
                        <a href="mailto:hola@cvitae.lat" className="text-gold hover:underline">Contactá a CVitae</a>
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <HistoryPanel
                  key={historyKey}
                  token={session.token}
                  onToggleStar={() => setHistoryKey(k => k + 1)}
                  onCompare={handleCompare}
                />
                {comparison && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
                    <ComparisonResultComponent result={comparison} onClose={() => setComparison(null)} />
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Footer />
    </main>
  )
}

// ─── Componente de comparación ────────────────────────────────────────────────

function ComparisonResultComponent({ result, onClose }: { result: ComparisonResult; onClose: () => void }) {
  return (
    <GlassCard>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Resultado de comparación</h2>
        <button onClick={onClose} className="text-muted hover:text-white">Cerrar</button>
      </div>
      <div className="space-y-6">
        {result.top3.map((c, i) => (
          <div key={i} className={`p-4 rounded-xl border ${i === 0 ? 'border-gold bg-gold/5' : 'bg-white/5 border-white/10'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {i === 0 && <Star size={14} className="text-gold fill-current" />}
                <span className="text-white font-bold text-lg" style={i === 0 ? { fontFamily: 'Playfair Display, serif' } : {}}>{c.name || `Candidato ${i+1}`}</span>
              </div>
              <span className="text-lg font-bold" style={{ color: scoreColor(c.score) }}>{c.score}</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {c.strengths.map((s, j) => (
                <Badge key={j} variant="gold">{s}</Badge>
              ))}
            </div>
            <p className="text-muted text-sm">{c.reason}</p>
          </div>
        ))}
        <div className="p-4 bg-gold/10 border border-gold/20 rounded-xl">
          <p className="text-white font-semibold mb-2">Recomendación final</p>
          <p className="text-gold text-sm">{result.finalRecommendation}</p>
        </div>
      </div>
    </GlassCard>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function Recruiters() {
  const [session, setSession] = useState<RecruiterSession | null>(null)
  if (!session) {
    return (
      <main className="min-h-screen bg-background">
        <Helmet>
          <title>Panel de Reclutadores | CVitae</title>
          <meta name="description" content="Analizá CVs con IA, guardá el historial y encontrá al candidato ideal en segundos." />
        </Helmet>
        <Navbar />
        <TokenLogin onSuccess={setSession} />
        <Footer />
      </main>
    )
  }
  return <RecruiterPanel session={session} onLogout={() => setSession(null)} />
}
