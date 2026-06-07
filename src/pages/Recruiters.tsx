import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Key, Upload, FileText, CheckCircle2, XCircle,
  AlertCircle, ChevronRight, RotateCcw, Coins, Brain,
  TrendingUp, TrendingDown, Star, LogOut, Loader2, History,
  Filter, ChevronDown, ChevronUp
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

  return (
    <section className="relative min-h-screen flex items-center justify-center px-4">
      <DotGrid />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#c9a84c]/5 rounded-full blur-[100px] pointer-events-none" />
      <motion.div className="relative z-10 w-full max-w-md" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#c9a84c]/10 border border-[#c9a84c]/20 mb-6">
            <Building2 className="text-[#c9a84c]" size={32} />
          </div>
          <Badge variant="gold" className="mb-4"><Star className="w-3 h-3 fill-current" />Panel Empresas · Beta</Badge>
          <h1 className="text-3xl font-bold text-white mb-3">Panel de Reclutadores</h1>
          <p className="text-[#888888] leading-relaxed">Analizá CVs con IA, guardá el historial y encontrá al candidato ideal en segundos.</p>
        </div>
        <GlassCard className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Token de acceso</label>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555555]" size={16} />
              <input
                type="text"
                value={token}
                onChange={e => setToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleValidate()}
                placeholder="REC-XXXXX-2026"
                className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#555555] focus:outline-none focus:border-[#c9a84c]/50 transition-all font-mono text-sm"
              />
            </div>
          </div>
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={16} />
                <p className="text-red-400 text-sm">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
          <GoldButton onClick={handleValidate} disabled={loading || !token.trim()} className="w-full" size="lg">
            {loading ? <><Loader2 className="animate-spin" size={16} />Verificando...</> : <>Acceder al panel<ChevronRight size={18} /></>}
          </GoldButton>
          <p className="text-center text-xs text-[#444444]">
            ¿No tenés token?{' '}
            <a href="/#empresas" className="text-[#c9a84c] hover:underline">Solicitá acceso a la Beta</a>
          </p>
        </GlassCard>
      </motion.div>
    </section>
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
          <span className="text-xs text-[#666666]">/ 100</span>
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
          <p className="text-[#888888] text-sm leading-relaxed">
            Score ATS — indica qué tan bien pasa el CV los filtros automáticos. Mayor a 80 es ideal para posiciones competitivas.
          </p>
          <div className="flex justify-center sm:justify-start mt-4">
            <button onClick={onReset} className="flex items-center gap-2 text-xs text-[#c9a84c] hover:text-white transition-colors">
              <RotateCcw size={14} />Analizar otro CV
            </button>
          </div>
        </div>
      </GlassCard>

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

function HistoryPanel({ token }: { token: string; onToggleStar: () => void }) {
  const [history, setHistory] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const res = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'get_history' }),
      })
      const data = await res.json()
      setHistory(data.history || [])
    } catch {
      console.error('Error cargando historial')
    } finally {
      setLoading(false)
    }
  }

  const toggleStar = async (id: string) => {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, is_starred: !h.is_starred } : h))
    try {
      await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'toggle_star', analysis_id: id }),
      })
    } catch { /* silencioso */ }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#c9a84c]" /></div>

  return (
    <div className="space-y-4">
      {history.length === 0 ? (
        <GlassCard className="text-center py-20">
          <History size={40} className="text-[#333333] mx-auto mb-4" />
          <p className="text-[#666666]">No hay análisis guardados aún.</p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {history.map(record => (
            <GlassCard key={record.id} className="group hover:border-[#c9a84c]/30 transition-all">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0" onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-bold" style={{ color: scoreColor(record.ats_score) }}>{record.ats_score}</span>
                    <p className="text-white font-medium truncate">{record.candidate_name || record.file_name}</p>
                    {record.vacancy_label && <Badge variant="gold" className="text-[10px] py-0">{record.vacancy_label}</Badge>}
                  </div>
                  <p className="text-[#555555] text-xs">
                    {new Date(record.created_at).toLocaleDateString()} · {record.file_name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleStar(record.id)} className={`p-2 rounded-lg transition-colors ${record.is_starred ? 'text-[#c9a84c]' : 'text-[#333333] hover:text-[#c9a84c]'}`}>
                    <Star size={18} fill={record.is_starred ? 'currentColor' : 'none'} />
                  </button>
                  <button onClick={() => setExpandedId(expandedId === record.id ? null : record.id)} className="p-2 text-[#333333] hover:text-white transition-colors">
                    {expandedId === record.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
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

      // Paso 1: análisis ATS
      const res = await fetch('/.netlify/functions/analyze-cv-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText, mode: 'analyze', recruiterToken: session.token }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error en el análisis') }
      const data: ATSResult = await res.json()

      // Detectar nombre del candidato del CV (primera línea del texto)
      const firstLine = cvText.split('\n').find(l => l.trim().length > 2)?.trim() || null

      // Paso 2: guardar en historial + descontar crédito
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
      setError(err.message || 'Error inesperado. Intentá de nuevo.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleReset = () => { setFile(null); setResult(null); setError(''); setVacancyLabel('') }

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
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
              <p className="text-[#666666] text-sm mt-1">Analizador de CV con inteligencia artificial</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-xl">
                <Coins className="text-[#c9a84c]" size={16} />
                <span className="text-white font-semibold">{balance}</span>
                <span className="text-[#555555] text-sm">créditos</span>
              </div>
              <GoldButton variant="ghost" size="sm" onClick={onLogout}><LogOut size={14} />Salir</GoldButton>
            </div>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {([['analyze', 'Analizar CV', Brain], ['history', 'Historial', History]] as const).map(([tab, label, Icon]) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab ? 'bg-[#c9a84c] text-[#0a0a0a]' : 'bg-white/5 text-[#888888] hover:bg-white/10'}`}>
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
                        <div className="w-10 h-10 rounded-xl bg-[#c9a84c]/10 flex items-center justify-center shrink-0">
                          <Brain className="text-[#c9a84c]" size={20} />
                        </div>
                        <div>
                          <h2 className="text-white font-semibold mb-1">¿Cómo funciona?</h2>
                          <p className="text-[#888888] text-sm leading-relaxed">
                            Subí el CV de un candidato (PDF, DOCX o TXT). La IA analiza en segundos y devuelve un{' '}
                            <strong className="text-white">score ATS (0–100)</strong>, puntos fuertes y mejoras críticas.
                            Cada análisis se guarda automáticamente en tu historial y consume{' '}
                            <strong className="text-[#c9a84c]">1 crédito</strong>.
                          </p>
                        </div>
                      </div>
                    </GlassCard>

                    {/* Etiqueta de vacante (opcional) */}
                    <div>
                      <label className="block text-sm font-medium text-white/60 mb-2">
                        ¿Para qué puesto es este CV? <span className="text-[#444444]">(opcional, para organizar el historial)</span>
                      </label>
                      <input
                        type="text"
                        value={vacancyLabel}
                        onChange={e => setVacancyLabel(e.target.value)}
                        placeholder="Ej: Desarrollador React · Junio 2026"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#3a3a3a] focus:outline-none focus:border-[#c9a84c]/50 transition-all text-sm"
                      />
                    </div>

                    {/* Drop zone */}
                    <div
                      className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer ${
                        isDragging ? 'border-[#c9a84c] bg-[#c9a84c]/5'
                        : file ? 'border-[#c9a84c]/40 bg-[#c9a84c]/[0.03]'
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
                            <div className="w-14 h-14 rounded-2xl bg-[#c9a84c]/10 flex items-center justify-center">
                              <FileText className="text-[#c9a84c]" size={28} />
                            </div>
                            <div>
                              <p className="text-white font-semibold">{file.name}</p>
                              <p className="text-[#555555] text-sm mt-1">{(file.size / 1024).toFixed(0)} KB · listo para analizar</p>
                            </div>
                            <button onClick={e => { e.stopPropagation(); handleReset() }} className="text-xs text-[#444444] hover:text-white transition-colors">
                              Cambiar archivo
                            </button>
                          </motion.div>
                        ) : (
                          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                              <Upload className="text-[#555555]" size={28} />
                            </div>
                            <div>
                              <p className="text-white font-medium">Arrastrá el CV acá</p>
                              <p className="text-[#555555] text-sm mt-1">o hacé clic para seleccionar</p>
                            </div>
                            <p className="text-[#3a3a3a] text-xs">PDF, DOCX o TXT · máx. 5 MB</p>
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
                      <p className="text-center text-sm text-[#555555]">
                        Necesitás más créditos.{' '}
                        <a href="mailto:hola@cvitae.lat" className="text-[#c9a84c] hover:underline">Contactá a CVitae</a>
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <HistoryPanel key={historyKey} token={session.token} onToggleStar={() => {}} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <Footer />
    </main>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function Recruiters() {
  const [session, setSession] = useState<RecruiterSession | null>(null)
  if (!session) {
    return (
      <main className="min-h-screen bg-[#0a0a0a]">
        <Navbar />
        <TokenLogin onSuccess={setSession} />
        <Footer />
      </main>
    )
  }
  return <RecruiterPanel session={session} onLogout={() => setSession(null)} />
}
