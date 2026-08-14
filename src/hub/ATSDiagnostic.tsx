import { useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, CircleHelp,
  FileSearch, FileText, History, Info, Loader2,
  ShieldCheck, Sparkles, Target, Upload, X,
} from 'lucide-react'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { ProductGuide } from '@/components/cv/ProductGuide'
import { CompatibilityTrace, Eyebrow } from '@/components/cv/visuals'
import { auth, supabase } from '@/lib/supabase'

type CategoryScore = { key: string; score: number; max: number; reason: string; evidence?: string | null }
type AtsQuestion = {
  id: string; assessment_id: string; position: number; priority: number; category: string
  question: string; why_asked: string; suggested_context?: string | null
  status: 'open' | 'answered' | 'skipped'; answer_text?: string | null
  evidence_id?: string | null; answered_at?: string | null
}
type Assessment = {
  id: string; source_kind: 'generated_cv' | 'uploaded_cv'; source_label: string
  source_version_id?: string | null; overall_score: number; category_scores: CategoryScore[]
  strengths: Array<{ title: string; evidence: string }>
  blockers: Array<{ severity: 'critical' | 'high' | 'medium'; issue: string; evidence: string; whyItMatters: string; nextAction: string }>
  quick_wins: Array<{ action: string; expectedEffect: string }>
  keyword_observations: Array<{ term: string; observation: string }>
  questions: AtsQuestion[]; created_at: string
}
type CvVersion = {
  id: string; vacancy_id: string; version_number: number; label: string
  generation_kind: string; created_at: string
}
type Workspace = {
  rubricVersion: string; rubricNotice: string; assessments: Assessment[]
  versions: CvVersion[]; openQuestionCount: number
}

const CATEGORY_LABELS: Record<string, string> = {
  parsing_structure: 'Lectura y estructura',
  essential_sections: 'Secciones esenciales',
  clarity_concision: 'Claridad y concisión',
  evidence_impact: 'Evidencia e impacto',
  relevance_keywords: 'Vocabulario profesional',
}
const QUESTION_LABELS: Record<string, string> = {
  achievement: 'Logro', experience: 'Experiencia', education: 'Educación', skill: 'Habilidad',
  language: 'Idioma', contact: 'Contacto', summary: 'Resumen', title: 'Título', course: 'Curso', other: 'Aclaración',
}

function scoreTone(score: number) {
  if (score >= 75) return { text: 'text-emerald-300', border: 'border-emerald-400/25', bg: 'bg-emerald-400/[0.06]', label: 'Base sólida' }
  if (score >= 55) return { text: 'text-amber-300', border: 'border-amber-400/25', bg: 'bg-amber-400/[0.06]', label: 'Mejorable' }
  return { text: 'text-rose-300', border: 'border-rose-400/25', bg: 'bg-rose-400/[0.06]', label: 'Necesita atención' }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Tu sesión expiró. Volvé a ingresar.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
}

async function postWorkspace(body: Record<string, unknown>) {
  const response = await fetch('/.netlify/functions/cv-ats-workspace', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'No pudimos completar la operación')
  return data as Workspace & { idempotent?: boolean }
}

function ScorePanel({ assessment }: { assessment: Assessment }) {
  const tone = scoreTone(assessment.overall_score)
  return (
    <section className={`overflow-hidden rounded-3xl border ${tone.border} ${tone.bg}`}>
      <div className="grid gap-8 p-6 md:grid-cols-[220px_1fr] md:p-8">
        <div className="flex flex-col items-center justify-center border-b border-white/8 pb-6 text-center md:border-b-0 md:border-r md:pb-0 md:pr-8">
          <div className={`font-display text-7xl leading-none tabular-nums ${tone.text}`}>
            {assessment.overall_score}<span className="text-2xl text-white/25">/100</span>
          </div>
          <p className={`mt-3 text-xs font-medium uppercase tracking-[0.2em] ${tone.text}`}>{tone.label}</p>
          <p className="mt-2 text-xs leading-relaxed text-white/40">Rúbrica CVitae · 5 dimensiones observables</p>
        </div>
        <div className="space-y-4">
          {assessment.category_scores.map((category) => (
            <div key={category.key}>
              <div className="mb-1.5 flex items-center justify-between gap-4">
                <p className="text-sm text-cream">{CATEGORY_LABELS[category.key] || category.key}</p>
                <span className="font-mono text-xs text-white/50">{category.score}/{category.max}</span>
              </div>
              <CompatibilityTrace score={(category.score / category.max) * 100} label={category.reason} />
              {category.evidence && <p className="mt-1.5 text-[11px] italic text-white/35">“{category.evidence}”</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function QuestionCard({ question, busy, defaultOpen = false, onReview }: {
  question: AtsQuestion; busy: boolean; defaultOpen?: boolean
  onReview: (question: AtsQuestion, decision: 'answered' | 'skipped', answer?: string) => Promise<void>
}) {
  const [answer, setAnswer] = useState(question.answer_text || '')
  const [open, setOpen] = useState(question.status === 'open' && defaultOpen)

  if (question.status !== 'open') {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${question.status === 'answered' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/5 text-white/35'}`}>
            {question.status === 'answered' ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-cream">{question.question}</p>
            <p className="mt-1 text-xs text-white/40">
              {question.status === 'answered' ? 'Respuesta guardada como evidencia pendiente de confirmar.' : 'Marcada como no aplicable.'}
            </p>
          </div>
          {question.status === 'answered' && <a href="/mi-carrera/cv" className="shrink-0 text-xs text-[#c9a84c]">Revisar evidencia</a>}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.035] p-4 md:p-5">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-start gap-3 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#c9a84c]/25 bg-[#c9a84c]/10 font-display text-sm text-[#c9a84c]">{question.position}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm leading-relaxed text-cream">{question.question}</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/40">{QUESTION_LABELS[question.category] || 'Aclaración'}</span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-white/45">{question.why_asked}</span>
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-white/35 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="ml-11 pt-4">
              {question.suggested_context && (
                <p className="mb-2 flex items-start gap-2 text-[11px] leading-relaxed text-white/40">
                  <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c9a84c]" />
                  {question.suggested_context}
                </p>
              )}
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                maxLength={2000}
                placeholder="Respondé solo con información real. Si no corresponde, elegí No aplica."
                className="min-h-28 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-3 text-sm leading-relaxed text-cream outline-none transition placeholder:text-white/25 focus:border-[#c9a84c]/45"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-[10px] leading-relaxed text-white/30">Tu respuesta no entra al CV automáticamente: primero queda pendiente de confirmación.</p>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => onReview(question, 'skipped')} className="rounded-full border border-white/10 px-3 py-2 text-xs text-white/50 transition hover:border-white/20 hover:text-white disabled:opacity-40">No aplica</button>
                  <button type="button" disabled={busy || answer.trim().length < 2} onClick={() => onReview(question, 'answered', answer)} className="inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-4 py-2 text-xs font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-40">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Guardar respuesta
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ATSDiagnostic() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [uploaded, setUploaded] = useState<{ name: string; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [questionBusy, setQuestionBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const applyWorkspace = (data: Workspace) => {
    setWorkspace(data)
    setSelectedAssessmentId((current) => current && data.assessments.some((item) => item.id === current) ? current : data.assessments[0]?.id || null)
    setSelectedVersionId((current) => current || data.versions[0]?.id || '')
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user || null); setAuthLoading(false)
      if (!session?.user) { setLoading(false); return }
      try { applyWorkspace(await postWorkspace({ action: 'overview' })) }
      catch (err: any) { setError(err.message) }
      finally { setLoading(false) }
    })
    const subscription = auth.onAuthStateChange((nextUser) => { setUser(nextUser); setAuthLoading(false) })
    return () => subscription?.unsubscribe()
  }, [])

  const selectedAssessment = useMemo(
    () => workspace?.assessments.find((item) => item.id === selectedAssessmentId) || workspace?.assessments[0] || null,
    [workspace, selectedAssessmentId],
  )

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { setError('El archivo supera 4 MB.'); return }
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) { setError('Usá un archivo PDF, DOCX o TXT.'); return }
    setExtracting(true); setError(''); setMessage('')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const response = await fetch('/.netlify/functions/extract-pdf-text', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
      })
      const data = await response.json()
      if (!response.ok || !data.text) throw new Error(data.error || 'No pudimos leer el archivo')
      setUploaded({ name: file.name, text: data.text })
      setMessage('Archivo leído. Ya podés ejecutar el diagnóstico.')
    } catch (err: any) { setError(err.message || 'No pudimos leer el archivo') }
    finally { setExtracting(false) }
  }

  const analyze = async (source: 'generated_cv' | 'uploaded_cv') => {
    if (source === 'generated_cv' && !selectedVersionId) return
    if (source === 'uploaded_cv' && !uploaded) return
    setAnalyzing(true); setError(''); setMessage('')
    try {
      const data = await postWorkspace(source === 'generated_cv'
        ? { action: 'analyze', sourceKind: source, sourceVersionId: selectedVersionId }
        : { action: 'analyze', sourceKind: source, sourceLabel: uploaded!.name, cvText: uploaded!.text })
      applyWorkspace(data)
      setUploaded(null)
      setMessage(data.idempotent ? 'Este CV ya estaba analizado; abrimos su diagnóstico guardado.' : 'Diagnóstico guardado. Revisá primero los bloqueos y después respondé las preguntas.')
    } catch (err: any) { setError(err.message || 'No pudimos analizar el CV') }
    finally { setAnalyzing(false) }
  }

  const reviewQuestion = async (question: AtsQuestion, decision: 'answered' | 'skipped', answer = '') => {
    setQuestionBusy(question.id); setError(''); setMessage('')
    try {
      const data = await postWorkspace({ action: 'review_question', questionId: question.id, decision, answer })
      applyWorkspace(data)
      setSelectedAssessmentId(question.assessment_id)
      setMessage(decision === 'answered' ? 'Respuesta guardada como evidencia pendiente. Confirmala en Mi CV antes de usarla.' : 'Pregunta marcada como no aplicable.')
    } catch (err: any) { setError(err.message || 'No pudimos guardar la respuesta') }
    finally { setQuestionBusy(null) }
  }

  if (authLoading || loading) {
    return <DashboardLayout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#c9a84c]" /></div></DashboardLayout>
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl rounded-3xl border border-white/8 bg-white/[0.025] p-8 text-center">
          <ShieldCheck className="mx-auto h-9 w-9 text-[#c9a84c]" />
          <h1 className="font-display mt-4 text-3xl text-cream">Tu diagnóstico es privado</h1>
          <p className="mt-3 text-sm text-white/50">Ingresá a Mi Carrera para analizar y guardar las preguntas de tu CV.</p>
          <a href="/mi-carrera" className="mt-6 inline-flex rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-black">Ingresar</a>
        </div>
      </DashboardLayout>
    )
  }

  const openQuestions = selectedAssessment?.questions.filter((item) => item.status === 'open') || []
  const resolvedQuestions = selectedAssessment?.questions.filter((item) => item.status !== 'open') || []

  return (
    <DashboardLayout>
      <Helmet>
        <title>Diagnóstico ATS | Mi Carrera · CVitae</title>
        <meta name="description" content="Diagnóstico ATS privado con rúbrica explicable y preguntas para mejorar tu CV sin inventar información." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <Eyebrow>Diagnóstico verificable</Eyebrow>
            <h1 className="font-display mt-2 text-4xl leading-tight text-cream md:text-5xl">Entendé qué lee un ATS<br /><em>y qué falta aclarar.</em></h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">Evaluamos el texto extraído con una rúbrica estable. Cada observación muestra su fundamento; las dudas se convierten en preguntas, no en datos inventados.</p>
          </div>
          {workspace && workspace.openQuestionCount > 0 && (
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-amber-400/25 bg-amber-400/[0.07] px-4 py-2 text-xs text-amber-200">
              <CircleHelp className="h-4 w-4" /> {workspace.openQuestionCount} pregunta{workspace.openQuestionCount !== 1 ? 's' : ''} pendiente{workspace.openQuestionCount !== 1 ? 's' : ''}
            </div>
          )}
        </header>

        <div className="flex items-start gap-3 rounded-2xl border border-sky-400/15 bg-sky-400/[0.045] p-4 text-xs leading-relaxed text-sky-100/70">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
          <p><strong className="text-sky-200">No existe un único ATS universal.</strong> El puntaje orienta sobre legibilidad, estructura, claridad, evidencia y vocabulario profesional. No garantiza superar el filtro de una empresa.</p>
        </div>

        {(error || message) && (
          <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${error ? 'border-rose-400/20 bg-rose-400/[0.06] text-rose-200' : 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200'}`}>
            {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{error || message}</span>
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-5 md:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#c9a84c]/20 bg-[#c9a84c]/10 text-[#c9a84c]"><History className="h-5 w-5" /></span>
              <div><h2 className="font-display text-xl text-cream">Analizar una versión guardada</h2><p className="text-xs text-white/40">Usa exactamente el contenido de tu historial.</p></div>
            </div>
            {workspace?.versions.length ? (
              <>
                <select value={selectedVersionId} onChange={(event) => setSelectedVersionId(event.target.value)} className="mt-5 w-full rounded-xl border border-white/10 bg-[#0d0d0d] px-3 py-3 text-sm text-cream outline-none focus:border-[#c9a84c]/40">
                  {workspace.versions.map((version) => <option key={version.id} value={version.id}>{version.label} · v{version.version_number} · {formatDate(version.created_at)}</option>)}
                </select>
                <button type="button" onClick={() => analyze('generated_cv')} disabled={analyzing || !selectedVersionId} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#c9a84c]/35 bg-[#c9a84c]/10 py-2.5 text-sm text-[#e6cf8a] transition hover:bg-[#c9a84c]/15 disabled:opacity-40">
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />} Diagnosticar esta versión
                </button>
              </>
            ) : <p className="mt-5 rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/40">Todavía no tenés versiones guardadas. Podés cargar un archivo aquí o crear tu CV en Mi CV.</p>}
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-5 md:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60"><Upload className="h-5 w-5" /></span>
              <div><h2 className="font-display text-xl text-cream">Analizar otro archivo</h2><p className="text-xs text-white/40">PDF, DOCX o TXT · máximo 4 MB.</p></div>
            </div>
            <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" onChange={handleFile} className="hidden" />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={extracting || analyzing} className="mt-5 flex w-full items-center justify-between rounded-xl border border-dashed border-white/12 bg-black/15 px-4 py-3 text-left transition hover:border-[#c9a84c]/35 disabled:opacity-40">
              <span className="flex min-w-0 items-center gap-3"><FileText className="h-4 w-4 shrink-0 text-[#c9a84c]" /><span className="truncate text-sm text-white/60">{uploaded?.name || (extracting ? 'Leyendo archivo…' : 'Elegir CV')}</span></span>
              {extracting ? <Loader2 className="h-4 w-4 animate-spin text-[#c9a84c]" /> : <ArrowRight className="h-4 w-4 text-white/30" />}
            </button>
            <button type="button" onClick={() => analyze('uploaded_cv')} disabled={analyzing || !uploaded} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c9a84c] py-2.5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-40">
              {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analizando señales…</> : <><Sparkles className="h-4 w-4" /> Ejecutar diagnóstico</>}
            </button>
          </div>
        </section>

        {selectedAssessment ? (
          <AnimatePresence mode="wait">
            <motion.div key={selectedAssessment.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-6">
                <div><p className="text-xs uppercase tracking-[0.18em] text-white/35">Diagnóstico seleccionado</p><p className="mt-1 text-sm text-cream">{selectedAssessment.source_label} <span className="text-white/30">· {formatDate(selectedAssessment.created_at)}</span></p></div>
                {workspace && workspace.assessments.length > 1 && (
                  <select value={selectedAssessment.id} onChange={(event) => setSelectedAssessmentId(event.target.value)} className="rounded-full border border-white/10 bg-[#0d0d0d] px-4 py-2 text-xs text-white/60 outline-none">
                    {workspace.assessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.source_label} · {assessment.overall_score}/100</option>)}
                  </select>
                )}
              </div>

              <ScorePanel assessment={selectedAssessment} />

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-5 md:p-6">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /><h2 className="font-display text-xl text-cream">Lo que ya funciona</h2></div>
                  <div className="mt-5 space-y-4">
                    {selectedAssessment.strengths.length ? selectedAssessment.strengths.map((item, index) => (
                      <div key={index} className="border-l border-emerald-400/25 pl-4"><p className="text-sm text-cream">{item.title}</p><p className="mt-1 text-xs italic leading-relaxed text-white/40">“{item.evidence}”</p></div>
                    )) : <p className="text-sm text-white/40">No se detectaron fortalezas suficientemente fundamentadas.</p>}
                  </div>
                </section>

                <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-5 md:p-6">
                  <div className="flex items-center gap-2"><Target className="h-4 w-4 text-rose-300" /><h2 className="font-display text-xl text-cream">Bloqueos prioritarios</h2></div>
                  <div className="mt-5 space-y-4">
                    {selectedAssessment.blockers.length ? selectedAssessment.blockers.map((item, index) => (
                      <details key={index} className="group rounded-xl border border-white/8 bg-black/15 p-4" open={index === 0}>
                        <summary className="flex cursor-pointer list-none items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.severity === 'critical' ? 'bg-rose-400' : item.severity === 'high' ? 'bg-amber-400' : 'bg-sky-400'}`} /><span className="flex-1 text-sm text-cream">{item.issue}</span><ChevronDown className="h-4 w-4 text-white/30 transition group-open:rotate-180" /></summary>
                        <div className="ml-5 mt-3 space-y-2 text-xs leading-relaxed text-white/45"><p><strong className="text-white/65">Evidencia:</strong> {item.evidence}</p><p><strong className="text-white/65">Por qué importa:</strong> {item.whyItMatters}</p><p className="text-[#e6cf8a]"><strong>Próximo paso:</strong> {item.nextAction}</p></div>
                      </details>
                    )) : <p className="text-sm text-white/40">No se detectaron bloqueos críticos en el texto.</p>}
                  </div>
                </section>
              </div>

              <section className="rounded-3xl border border-[#c9a84c]/18 bg-[#c9a84c]/[0.025] p-5 md:p-7">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div><div className="flex items-center gap-2"><CircleHelp className="h-5 w-5 text-[#c9a84c]" /><h2 className="font-display text-2xl text-cream">Preguntas para completar la evidencia</h2></div><p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/45">Contestá únicamente lo que sea cierto. “No aplica” es una respuesta válida. Cada dato queda pendiente hasta que lo confirmes en Mi CV.</p></div>
                  <span className="self-start rounded-full border border-[#c9a84c]/25 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[#c9a84c]">{openQuestions.length} pendientes</span>
                </div>
                <div className="mt-6 space-y-3">
                  {openQuestions.length ? openQuestions.map((question, index) => <QuestionCard key={question.id} question={question} busy={questionBusy === question.id} defaultOpen={index === 0} onReview={reviewQuestion} />) : (
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-emerald-300" /><p className="mt-2 text-sm text-emerald-100">No quedan preguntas pendientes en este diagnóstico.</p>{resolvedQuestions.some((item) => item.status === 'answered') && <a href="/mi-carrera/cv" className="mt-3 inline-flex items-center gap-1 text-xs text-[#c9a84c]">Confirmar nuevas evidencias <ArrowRight className="h-3 w-3" /></a>}</div>
                  )}
                  {resolvedQuestions.length > 0 && <div className="space-y-2 border-t border-white/8 pt-4">{resolvedQuestions.map((question) => <QuestionCard key={question.id} question={question} busy={false} onReview={reviewQuestion} />)}</div>}
                </div>
              </section>

              <div className="grid gap-5 md:grid-cols-2">
                <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-5"><h3 className="font-display text-lg text-cream">Mejoras rápidas</h3><ol className="mt-4 space-y-3">{selectedAssessment.quick_wins.map((item, index) => <li key={index} className="flex gap-3 text-sm"><span className="font-display text-[#c9a84c]">0{index + 1}</span><span className="text-white/55"><strong className="font-normal text-cream">{item.action}</strong><span className="mt-0.5 block text-xs text-white/35">{item.expectedEffect}</span></span></li>)}</ol></section>
                <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-5"><h3 className="font-display text-lg text-cream">Vocabulario observado</h3><div className="mt-4 space-y-3">{selectedAssessment.keyword_observations.length ? selectedAssessment.keyword_observations.map((item, index) => <div key={index} className="flex gap-3"><span className="h-fit rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/55">{item.term}</span><p className="text-xs leading-relaxed text-white/40">{item.observation}</p></div>) : <p className="text-xs text-white/40">Sin observaciones prioritarias de vocabulario.</p>}</div></section>
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center">
            <FileSearch className="mx-auto h-10 w-10 text-white/20" /><h2 className="font-display mt-4 text-2xl text-cream">Todavía no hay un diagnóstico guardado</h2><p className="mx-auto mt-2 max-w-md text-sm text-white/40">Elegí una versión de tu historial o cargá un archivo. No guardamos el texto crudo del archivo en el diagnóstico.</p>
          </div>
        )}
      </div>

      <ProductGuide storageKey="b2c_ats_diagnostic_v1" label="Diagnóstico ATS" steps={[
        { title: 'Elegí una fuente', description: 'Podés revisar una versión guardada o cargar un archivo distinto. El diagnóstico queda asociado a ese contenido exacto.' },
        { title: 'Leé la evidencia', description: 'El puntaje se divide en cinco dimensiones. Cada fortaleza y bloqueo debe mostrar el fragmento que lo sustenta.' },
        { title: 'Respondé sin inventar', description: 'Las preguntas aclaran vacíos. Tus respuestas quedan pendientes de confirmación antes de poder entrar a un CV.' },
      ]} />
    </DashboardLayout>
  )
}
