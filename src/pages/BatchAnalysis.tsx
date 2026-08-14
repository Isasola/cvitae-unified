import { useState, useRef, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Sparkles, Users, Crown, Trash2, FileText, ArrowLeft,
  Loader2, CheckCircle2, AlertCircle, Brain, RotateCcw, Building2
} from 'lucide-react'
import { analytics } from '@/lib/analytics'
import { ProductGuide } from '@/components/cv/ProductGuide'
import { B2BInfoPopover } from '@/components/cv/B2BInfoPopover'
import { clearPendingOperation, pendingOperationId } from '@/lib/pendingOperation'
import { FeedbackReporter } from '@/components/cv/FeedbackReporter'

const ease = [0.22, 1, 0.36, 1] as const
const RECRUITER_SESSION_KEY = 'cvitae_recruiter_session'

interface BatchCandidate {
  id: string
  operationId: string
  file: File
  status: 'pending' | 'extracting' | 'analyzing' | 'done' | 'error'
  text?: string
  result?: any
  error?: string
}

interface BatchSummary {
  finalRecommendation: string
  hiringInsight: string
  interviewOrder: string[]
}

async function extractTextFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer
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
        if (!res.ok || !data.success || !data.text) {
          reject(new Error(data.error || 'Error extrayendo texto'))
          return
        }
        resolve(data.text)
      } catch {
        reject(new Error('Error extrayendo texto'))
      }
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}

function scoreColor(s: number) {
  if (s >= 80) return 'oklch(0.75 0.18 145)'
  if (s >= 60) return 'oklch(0.78 0.13 82)'
  return 'oklch(0.65 0.22 25)'
}

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T, index: number) => Promise<void>) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await task(items[index], index)
    }
  })
  await Promise.all(workers)
}

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

export default function BatchAnalysis() {
  const [, setLocation] = useLocation()
  const [session, setSession] = useState<any>(null)
  const [candidates, setCandidates] = useState<BatchCandidate[]>([])
  const [jobTitle, setJobTitle] = useState('')
  const [jobDesc, setJobDesc] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [summary, setSummary] = useState<BatchSummary | null>(null)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const s = sessionStorage.getItem(RECRUITER_SESSION_KEY)
    if (!s) {
      setLocation('/empresas')
      return
    }
    try {
      setSession(JSON.parse(s))
    } catch {
      sessionStorage.removeItem(RECRUITER_SESSION_KEY)
      setLocation('/empresas')
    }
  }, [])

  const handleFiles = (files: File[]) => {
    const allowedExtensions = new Set(['pdf', 'docx', 'txt'])
    const isSupported = (file: File) => allowedExtensions.has(file.name.toLowerCase().split('.').pop() || '')
    const unsupported = files.filter(f => !isSupported(f))
    const oversized = files.filter(f => isSupported(f) && f.size > 4 * 1024 * 1024)
    const known = new Set(candidates.map(c => `${c.file.name}:${c.file.size}:${c.file.lastModified}`))
    const duplicates: File[] = []
    const valid = files.filter(f => {
      if (!isSupported(f) || f.size > 4 * 1024 * 1024) return false
      const fingerprint = `${f.name}:${f.size}:${f.lastModified}`
      if (known.has(fingerprint)) { duplicates.push(f); return false }
      known.add(fingerprint)
      return true
    })
    if (unsupported.length || oversized.length || duplicates.length) {
      const details = [
        unsupported.length ? `${unsupported.length} con formato no soportado` : '',
        oversized.length ? `${oversized.length} de más de 4 MB` : '',
        duplicates.length ? `${duplicates.length} duplicado${duplicates.length === 1 ? '' : 's'}` : '',
      ].filter(Boolean).join(' y ')
      setError(`No agregamos ${details}. Usá PDF, DOCX o TXT; para archivos grandes, comprimilos o generá un CV optimizado en CVitae.`)
    } else {
      setError('')
    }
    // no hard UI limit — backend processes in internal batches
    const newCandidates = valid.map(f => ({
      id: crypto.randomUUID(),
      operationId: pendingOperationId('batch', `${f.name}:${f.size}:${f.lastModified}`),
      file: f,
      status: 'pending' as const,
    }))
    setCandidates(prev => [...prev, ...newCandidates])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files || []))
  }

  const removeCandidate = (id: string) => setCandidates(prev => prev.filter(c => c.id !== id))

  const startAnalysis = async () => {
    if (!jobTitle.trim()) { setError('Ingresá el nombre del puesto'); return }
    if (candidates.length < 2) { setError('Subí al menos 2 CVs'); return }
    if (!session?.token) { setError('La sesión de empresa expiró. Volvé a ingresar.'); return }

    const balanceResponse = await fetch('/.netlify/functions/validate-recruiter-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: session.token }),
    })
    const balanceData = await balanceResponse.json()
    if (!balanceResponse.ok || !balanceData.valid) { setError(balanceData.error || 'La sesión de empresa expiró.'); return }
    if (Number(balanceData.balance || 0) < candidates.length) {
      setError(`El lote requiere ${candidates.length} créditos y el saldo actual es ${balanceData.balance || 0}. No iniciamos ningún análisis.`)
      return
    }

    setIsProcessing(true)
    setError('')
    setSummary(null)
    analytics.batchStarted(candidates.length)
    const updated = [...candidates]
    try {
      await runWithConcurrency(updated, 3, async (c, i) => {
        try {
          setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'extracting' } : x))
          const text = await extractTextFromFile(c.file)
          setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'analyzing', text } : x))
          const res = await fetch('/.netlify/functions/analyze-cv-candidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cvText: text,
              mode: 'batch_analyze',
              jobTitle,
              jobDescription: jobDesc,
              recruiterToken: session.token,
              operationId: c.operationId,
              fileName: c.file.name,
            }),
          })
          const result = await res.json()
          if (!res.ok || !result.saved) {
            if (result.retryable) clearPendingOperation(c.operationId)
            throw new Error(result.error || `No se pudo analizar ${c.file.name}`)
          }
          clearPendingOperation(c.operationId)
          updated[i] = { ...updated[i], text, status: 'done', result }
          setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, text, status: 'done', result } : x))
        } catch (candidateError: any) {
          const message = candidateError?.message || `No se pudo analizar ${c.file.name}`
          updated[i] = { ...updated[i], status: 'error', error: message }
          setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'error', error: message } : x))
        }
      })
      const processedCandidates = updated.filter(c => c.status === 'done').map(c => ({
        name: c.result.candidateName || c.file.name,
        fitScore: c.result.fitScore,
        atsScore: c.result.atsScore,
        recommendation: c.result.recommendation,
        summary: c.result.summary,
        keyMatches: c.result.keyMatches,
        keyGaps: c.result.keyGaps,
      }))
      const failedCount = updated.filter(c => c.status === 'error').length
      if (!processedCandidates.length) {
        setError('No se pudo completar ningún CV. Los archivos fallidos no deben consumir créditos.')
        return
      }

      let comparison: BatchSummary = {
        finalRecommendation: 'Revisá la evidencia individual antes de decidir a quién entrevistar.',
        hiringInsight: 'El ranking se calculó con los análisis completados.',
        interviewOrder: [...processedCandidates]
          .sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0))
          .slice(0, 3)
          .map(candidate => candidate.name),
      }
      if (processedCandidates.length >= 2) {
        try {
          const compRes = await fetch('/.netlify/functions/compare-candidates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: session.token, mode: 'batch_summary', jobTitle, jobDescription: jobDesc, candidates: processedCandidates, topN: 3 }),
          })
          const compData = await compRes.json()
          if (compRes.ok) comparison = compData
        } catch { /* El ranking local sigue disponible. */ }
      }
      setSummary(comparison)
      if (failedCount) setError(`${processedCandidates.length} CVs completados y ${failedCount} fallidos. Los fallidos no deberían consumir créditos.`)

      const refreshed = await fetch('/.netlify/functions/validate-recruiter-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: session.token }),
      }).then(response => response.json()).catch(() => null)
      if (refreshed?.valid) {
        const nextSession = { ...session, balance: refreshed.balance }
        setSession(nextSession)
        sessionStorage.setItem(RECRUITER_SESSION_KEY, JSON.stringify(nextSession))
      }
    } catch (batchError: any) {
      setError(batchError?.message || 'Ocurrió un error durante el procesamiento masivo.')
    } finally {
      setIsProcessing(false)
    }
  }

  const doneCount = candidates.filter(c => c.status === 'done').length
  const progressPct = candidates.length > 0 ? Math.round((doneCount / candidates.length) * 100) : 0

  const rankedCandidates = candidates
    .filter(c => c.status === 'done' && c.result)
    .sort((a, b) => (b.result.fitScore || 0) - (a.result.fitScore || 0))

  const statusLabel = (s: BatchCandidate['status']) => {
    if (s === 'extracting') return 'Extrayendo texto…'
    if (s === 'analyzing') return 'Analizando con IA…'
    if (s === 'done') return 'Listo'
    if (s === 'error') return 'Error'
    return 'Pendiente'
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white antialiased">
      <Ambient />
      <Helmet>
        <title>Análisis Masivo de CVs | CVitae Empresas</title>
        <meta name="description" content="Analizá tu pool de CVs en lote con IA. Ranking comparativo, score ATS y recomendación automática." />
        <link rel="canonical" href="https://cvitae.lat/empresas/masivo" />
        <meta property="og:title" content="Análisis Masivo de CVs con IA | CVitae Empresas" />
        <meta property="og:description" content="Analizá tu pool de CVs en lote. Ranking comparativo, score ATS y recomendación de entrevista automática." />
        <meta property="og:url" content="https://cvitae.lat/empresas/masivo" />
        <meta property="og:type" content="website" />
      </Helmet>

      {/* Header */}
      <header className="border-b border-white/5 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
          <Link href="/empresas" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/45 transition-colors hover:text-white">
            <ArrowLeft strokeWidth={1.5} className="h-4 w-4" /> Panel empresas
          </Link>
          {session && (
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 text-xs text-white/50 md:flex">
                <Building2 strokeWidth={1.25} className="h-3.5 w-3.5 text-white/35" />
                {session.company_name}
              </div>
              <span className="text-white/20">·</span>
              <span className="text-xs text-white/40">
                {session.balance} crédito{session.balance !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-6 pt-16 pb-28 md:px-10 md:pt-20">
        {/* Heading */}
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40">
          <span className="h-px w-8 bg-white/20" /> Análisis masivo
        </div>
        <h1 className="mt-6 font-display text-4xl leading-[1.05] tracking-[-0.01em] text-white md:text-6xl">
          Tu pool. Un veredicto. <em className="italic font-normal">Cero filas en Excel.</em>
        </h1>
        <p className="mt-5 max-w-xl text-sm font-light leading-relaxed text-white/55 md:text-base">
          Configurá el puesto, subí el lote y CVitae te devuelve el orden de entrevista sugerido con justificación por candidato.
        </p>

        <AnimatePresence mode="wait">
          {/* ── Config stage ─────────────────────────────────────────── */}
          {!isProcessing && !summary && (
            <motion.div key="config" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease }}>
              <div className="mt-12 grid gap-6 lg:grid-cols-12">
                {/* Puesto */}
                <div className="glass-card rounded-3xl p-7 lg:col-span-5">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">01 · El puesto</p>
                  <label className="mt-6 block text-[11px] uppercase tracking-[0.18em] text-white/40">Nombre del puesto</label>
                  <input
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    placeholder="Ej: Analista de Marketing Digital"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-light text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none transition"
                  />
                  <label className="mt-5 block text-[11px] uppercase tracking-[0.18em] text-white/40">
                    Descripción / requisitos <span className="normal-case text-white/25">(opcional)</span>
                  </label>
                  <textarea
                    rows={7}
                    value={jobDesc}
                    onChange={e => setJobDesc(e.target.value)}
                    placeholder="Habilidades, experiencia requerida, contexto del puesto…"
                    className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-light text-white placeholder:text-white/25 focus:border-[#c9a84c]/50 focus:outline-none transition"
                  />
                  <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-xs font-light leading-relaxed text-white/45">
                    La descripción mejora el ranking: la IA puede comparar cada CV contra los requisitos exactos del puesto.
                  </div>
                </div>

                {/* Upload */}
                <div className="glass-card rounded-3xl p-7 lg:col-span-7">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">02 · Los CVs</p>
                    <span className="text-xs font-light text-white/30">{candidates.length} CVs cargados</span>
                  </div>

                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(Array.from(e.dataTransfer.files)) }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-all duration-300 ${
                      isDragging ? 'border-[#c9a84c]/60 bg-[#c9a84c]/[0.04]' : 'border-white/12 bg-white/[0.015] hover:border-white/25'
                    }`}
                  >
                    <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt" className="hidden" onChange={handleFileSelect} />
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                      <Upload strokeWidth={1.25} className="h-5 w-5 text-[#c9a84c]" />
                    </div>
                    <p className="mt-3 font-display text-xl text-white/90">Arrastrá los CVs aquí</p>
                    <p className="mt-1 text-xs font-light text-white/45">PDF, DOCX o TXT · máximo 4 MB por archivo</p>
                    <Link href="/mi-carrera/cv" onClick={event => event.stopPropagation()} className="mt-2 text-xs text-[#c9a84c] underline decoration-[#c9a84c]/30 underline-offset-4">Crear un CV optimizado en CVitae</Link>
                  </div>

                  {/* File list */}
                  {candidates.length > 0 && (
                    <div className="mt-5 max-h-48 space-y-2 overflow-y-auto">
                      {candidates.map(c => (
                        <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
                          <FileText strokeWidth={1.25} className="h-4 w-4 shrink-0 text-[#c9a84c]" />
                          <span className="flex-1 truncate text-sm font-light text-white/80">{c.file.name}</span>
                          <button onClick={() => removeCandidate(c.id)} className="p-1 text-white/25 transition hover:text-red-400">
                            <Trash2 strokeWidth={1.5} className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-sm text-red-400">
                        <AlertCircle strokeWidth={1.5} className="h-4 w-4 shrink-0" /> {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-light text-white/35">Mínimo 2 CVs · cada uno consume 1 crédito</p>
                    <div className="flex items-center gap-2 text-xs font-light text-white/35">
                      <span>Un crédito por CV analizado</span>
                      <B2BInfoPopover
                        label="Cómo funciona el análisis masivo"
                        title="Un crédito por CV"
                        description="El análisis masivo procesa cada archivo por separado y descuenta un crédito por candidato guardado. La IA sugiere un orden; no decide por la empresa."
                        points={['Usá CVs legibles y de hasta 4 MB.', 'Los archivos que fallan no deberían consumir crédito.', 'Revisá siempre la evidencia antes de contactar.']}
                      />
                    </div>
                    <button
                      onClick={startAnalysis}
                      disabled={candidates.length < 2 || !jobTitle.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-6 py-3 text-sm font-medium text-[#0a0a0a] transition-all hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.6)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
                    >
                      <Sparkles strokeWidth={1.5} className="h-4 w-4" /> Iniciar análisis masivo
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Processing stage ──────────────────────────────────────── */}
          {isProcessing && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-16">
              <div className="glass-card rounded-[2rem] p-10 text-center">
                <Loader2 strokeWidth={1.5} className="mx-auto h-10 w-10 animate-spin text-[#c9a84c]" />
                <h2 className="mt-6 font-display text-3xl text-white">Leyendo el pool de candidatos…</h2>
                <p className="mt-2 text-sm font-light text-white/50">{doneCount} de {candidates.length} CVs analizados</p>

                {/* Progress bar */}
                <div className="mx-auto mt-8 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/[0.07]">
                  <motion.div
                    className="h-full rounded-full bg-[#c9a84c]"
                    animate={{ width: `${progressPct}%` }}
                    transition={{ ease: 'easeOut' }}
                  />
                </div>
                <p className="mt-2 text-xs font-light text-white/30">{progressPct}%</p>

                {/* Per-file status */}
                <div className="mx-auto mt-8 max-w-md space-y-2 text-left">
                  {candidates.map(c => (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5">
                      {c.status === 'done' ? (
                        <CheckCircle2 strokeWidth={1.5} className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : c.status === 'error' ? (
                        <AlertCircle strokeWidth={1.5} className="h-4 w-4 shrink-0 text-red-400" />
                      ) : c.status === 'analyzing' || c.status === 'extracting' ? (
                        <Loader2 strokeWidth={1.5} className="h-4 w-4 shrink-0 animate-spin text-[#c9a84c]" />
                      ) : (
                        <div className="h-4 w-4 shrink-0 rounded-full border border-white/15" />
                      )}
                      <span className="flex-1 truncate text-xs font-light text-white/70">{c.file.name}</span>
                      <span className="shrink-0 text-[10px] text-white/35">{statusLabel(c.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Results stage ─────────────────────────────────────────── */}
          {summary && !isProcessing && (
            <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-16 space-y-6">
              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-300">
                  <AlertCircle strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </div>
              )}
              {/* Veredicto IA */}
              <div className="relative">
                <div className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-[#c9a84c]/15 via-transparent to-transparent blur-2xl" />
                <div className="glass-card rounded-[2rem] p-10">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#c9a84c]/30 bg-[#c9a84c]/10 mt-1">
                      <Crown strokeWidth={1.25} className="h-5 w-5 text-[#c9a84c]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/40">
                        <span className="h-px w-8 bg-[#c9a84c]/50" /> Veredicto de la IA
                      </div>
                      <h2 className="mt-3 font-display text-3xl leading-snug text-white md:text-4xl">
                        <em className="italic font-normal">{summary.interviewOrder?.slice(0, 3).length || 3} candidatos</em> para entrevistar esta semana.
                      </h2>
                      <p className="mt-4 max-w-3xl text-sm font-light leading-relaxed text-white/55 md:text-base">
                        {summary.finalRecommendation || summary.hiringInsight}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ranking */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-2xl text-white">
                    Orden de entrevista <em className="italic font-normal">sugerido</em>
                  </h3>
                  <span className="text-xs font-light text-white/40">{rankedCandidates.length} candidatos analizados</span>
                </div>

                <ol className="space-y-3">
                  {rankedCandidates.map((c, i) => {
                    const score = c.result.fitScore || c.result.atsScore || 0
                    return (
                      <motion.li
                        key={c.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: i * 0.06, ease }}
                        className={`glass-card flex items-center gap-5 rounded-2xl p-5 transition-all ${i < 3 ? 'border-[#c9a84c]/20 bg-[#c9a84c]/[0.02]' : ''}`}
                      >
                        <span className="font-display text-3xl text-white/25 w-10 text-center leading-none">{String(i + 1).padStart(2, '0')}</span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm text-white">{c.result.candidateName || c.file.name}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {c.result.keyMatches?.slice(0, 3).map((m: string) => (
                              <span key={m} className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] text-white/55">{m}</span>
                            ))}
                            {c.result.badges?.map((b: { area: string; score: number }) => (
                              <span key={b.area} className="rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/10 px-2 py-0.5 text-[10px] text-[#c9a84c] font-medium">
                                ✓ Verificado en {b.area}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-display text-2xl" style={{ color: scoreColor(score) }}>
                            {score}<span className="text-sm text-white/30">/100</span>
                          </p>
                          <div className="mt-1.5 hidden w-28 sm:block">
                            <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
                              <motion.div
                                initial={{ width: 0 }} whileInView={{ width: `${score}%` }} viewport={{ once: true }}
                                transition={{ duration: 1, delay: 0.2 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: scoreColor(score) }}
                              />
                            </div>
                          </div>
                        </div>
                      </motion.li>
                    )
                  })}
                </ol>
              </div>

              {/* Círculo virtuoso */}
              <div className="flex items-start gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <Users strokeWidth={1.25} className="h-5 w-5 shrink-0 text-[#c9a84c] mt-0.5" />
                <p className="text-sm font-light text-white/55">
                  Cada CV recibido por tu link de vacante también se suma al banco general de CVitae,
                  ayudando a que más empresas y candidatos del ecosistema se encuentren.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => { setCandidates([]); setSummary(null); setJobTitle(''); setJobDesc('') }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm text-white/60 transition hover:border-white/25 hover:text-white"
                >
                  <RotateCcw strokeWidth={1.5} className="h-4 w-4" /> Nuevo análisis
                </button>
                <Link href="/empresas" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm text-white/60 transition hover:border-white/25 hover:text-white">
                  <Brain strokeWidth={1.5} className="h-4 w-4" /> Análisis individual
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <footer className="border-t border-white/5 px-6 py-10 text-xs text-white/30">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="font-display text-base text-white/60">CVitae</span>
          <span>Análisis masivo · {session?.company_name || ''}</span>
        </div>
      </footer>
      <ProductGuide
        storageKey="b2b_batch_v1"
        label="Análisis masivo"
        steps={[
          { title: 'Definí el puesto', description: 'Escribí el cargo y los requisitos reales. Cuanto más concreto sea el contexto, más útil será la comparación.' },
          { title: 'Cargá el pool', description: 'Subí los CVs compatibles. Cada CV analizado consume un crédito y los estados se muestran durante el proceso.' },
          { title: 'Revisá antes de decidir', description: 'El orden sugerido resume evidencia del CV. Abrí los detalles y mantené la decisión, el contacto y la evaluación final bajo control humano.' },
        ]}
      />
      <FeedbackReporter audience="b2b" feature="Análisis masivo B2B" className="bottom-5 left-5" />
    </div>
  )
}
