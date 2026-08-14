import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import {
  AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, FileCheck2,
  FileText, GitCompareArrows, History, Loader2, LockKeyhole, RotateCcw,
  ShieldCheck, Sparkles, Target, Trash2, WandSparkles,
} from 'lucide-react'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { ProductGuide } from '@/components/cv/ProductGuide'
import { Eyebrow } from '@/components/cv/visuals'
import { auth, supabase } from '@/lib/supabase'

type CvVersion = {
  id: string; vacancy_id: string; version_number: number; parent_version_id: string | null
  label: string; generation_kind: string; cv_markdown: string; content_hash: string
  created_at: string
}
type ChangeEvidence = { id: string; category: string; value: string; context?: string | null; source?: string | null }
type RewriteChange = {
  id: string; section: string; kind: string; before?: string | null; after: string
  reason: string; evidence: ChangeEvidence[]
}
type RewriteProposal = {
  id: string; source_version_id: string; objective: string
  status: 'draft' | 'accepted' | 'discarded'; proposal_markdown: string
  changes: RewriteChange[]; safety_checks: Record<string, any>
  accepted_version_id?: string | null; accepted_at?: string | null
  discarded_at?: string | null; created_at: string
}
type Workspace = {
  profileExists: boolean; versions: CvVersion[]; proposals: RewriteProposal[]
  evidenceReadiness: { pending: number; confirmed: number; ready: boolean }
}

const OBJECTIVES = [
  { id: 'ats_clarity', title: 'Claridad ATS', description: 'Orden simple, secciones previsibles y lectura directa.', icon: FileCheck2 },
  { id: 'concise', title: 'Más conciso', description: 'Reduce redundancias sin perder hechos confirmados.', icon: Target },
  { id: 'impact_clarity', title: 'Impacto claro', description: 'Explica mejor aportes ya respaldados, sin crear métricas.', icon: Sparkles },
] as const

const SECTION_LABELS: Record<string, string> = {
  header: 'Encabezado', summary: 'Resumen', skills: 'Habilidades', experience: 'Experiencia',
  education: 'Educación', courses_languages: 'Cursos e idiomas', other: 'Información adicional',
}
const EVIDENCE_LABELS: Record<string, string> = {
  identity: 'Identidad', title: 'Título', summary: 'Resumen', skill: 'Habilidad',
  course: 'Curso', experience: 'Experiencia', achievement: 'Logro', education: 'Educación',
  language: 'Idioma', contact: 'Contacto', other: 'Dato',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function authenticatedHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Tu sesión expiró. Volvé a ingresar.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
}

async function postWorkspace(body: Record<string, unknown>) {
  const response = await fetch('/.netlify/functions/cv-rewrite-workspace', {
    method: 'POST', headers: await authenticatedHeaders(), body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'No pudimos completar la operación')
  return data as Workspace & { proposalId?: string; idempotent?: boolean; accepted?: any }
}

function MarkdownPaper({ children, label }: { children: string; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#f4f1e8] text-[#171717] shadow-[0_24px_80px_rgba(0,0,0,.24)]">
      <div className="flex items-center justify-between border-b border-black/8 px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-black/45">
        <span>{label}</span><FileText className="h-3.5 w-3.5" />
      </div>
      <article className="prose prose-sm max-w-none px-6 py-7 prose-headings:font-serif prose-headings:text-[#171717] prose-p:text-[#333] prose-li:text-[#333] prose-strong:text-[#171717] md:min-h-[540px]">
        <ReactMarkdown>{children}</ReactMarkdown>
      </article>
    </div>
  )
}

function ChangeCard({ change, index }: { change: RewriteChange; index: number }) {
  const [open, setOpen] = useState(index === 0)
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-start gap-3 p-4 text-left md:p-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#c9a84c]/25 bg-[#c9a84c]/10 font-display text-sm text-[#c9a84c]">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-cream">{SECTION_LABELS[change.section] || 'Contenido'}</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.15em] text-white/35">{change.evidence.length} evidencia{change.evidence.length !== 1 ? 's' : ''}</span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-white/40">{change.reason}</span>
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-white/30 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-white/7 px-4 pb-5 pt-4 md:px-5">
              <div className="grid gap-3 md:grid-cols-[1fr_32px_1fr] md:items-stretch">
                <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-white/30">Antes</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">{change.before || 'No estaba expresado de esta forma en la versión de origen.'}</p>
                </div>
                <div className="flex items-center justify-center text-[#c9a84c]"><ArrowRight className="h-4 w-4 rotate-90 md:rotate-0" /></div>
                <div className="rounded-xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.055] p-4">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-[#c9a84c]">Propuesta</p>
                  <p className="mt-2 text-sm leading-relaxed text-cream">{change.after}</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-[9px] uppercase tracking-[0.18em] text-white/30">Respaldado por</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {change.evidence.map((item) => (
                    <span key={item.id} title={`${item.source || 'Evidencia'}${item.context ? ` · ${item.context}` : ''}`} className="max-w-full rounded-full border border-emerald-400/20 bg-emerald-400/[0.055] px-3 py-1.5 text-[11px] text-emerald-100/75">
                      <strong className="font-medium text-emerald-200">{EVIDENCE_LABELS[item.category] || 'Dato'}:</strong> {item.value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function CVRewrite() {
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [objective, setObjective] = useState<(typeof OBJECTIVES)[number]['id']>('ats_clarity')
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [attested, setAttested] = useState(false)
  const [view, setView] = useState<'changes' | 'preview'>('changes')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const applyWorkspace = (next: Workspace, preferredProposal?: string | null) => {
    setWorkspace(next)
    setSelectedVersionId((current) => current && next.versions.some((item) => item.id === current) ? current : next.versions[0]?.id || '')
    setSelectedProposalId((current) => {
      const preferred = preferredProposal && next.proposals.find((item) => item.id === preferredProposal)
      if (preferred) return preferred.id
      if (current && next.proposals.some((item) => item.id === current)) return current
      return next.proposals.find((item) => item.status === 'draft')?.id || next.proposals[0]?.id || null
    })
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

  const selectedVersion = useMemo(() => workspace?.versions.find((item) => item.id === selectedVersionId) || null, [workspace, selectedVersionId])
  const selectedProposal = useMemo(() => workspace?.proposals.find((item) => item.id === selectedProposalId) || null, [workspace, selectedProposalId])
  const proposalSource = useMemo(() => workspace?.versions.find((item) => item.id === selectedProposal?.source_version_id) || null, [workspace, selectedProposal])

  const createProposal = async () => {
    if (!selectedVersionId) return
    setCreating(true); setError(''); setMessage(''); setAttested(false)
    try {
      const data = await postWorkspace({ action: 'create', sourceVersionId: selectedVersionId, objective })
      applyWorkspace(data, data.proposalId)
      setView('changes')
      setMessage(data.idempotent ? 'Esta combinación ya estaba revisada; abrimos la propuesta guardada.' : 'Propuesta preparada. Revisá cada cambio antes de aceptarla.')
    } catch (err: any) { setError(err.message || 'No pudimos preparar la propuesta') }
    finally { setCreating(false) }
  }

  const acceptProposal = async () => {
    if (!selectedProposal || !attested) return
    setAccepting(true); setError(''); setMessage('')
    try {
      const data = await postWorkspace({ action: 'accept', proposalId: selectedProposal.id, attested: true })
      applyWorkspace(data, selectedProposal.id)
      setAttested(false)
      setMessage(`Reescritura aceptada como versión ${data.accepted?.version_number || 'nueva'}. La versión anterior sigue en el historial.`)
    } catch (err: any) { setError(err.message || 'No pudimos aceptar la propuesta') }
    finally { setAccepting(false) }
  }

  const discardProposal = async () => {
    if (!selectedProposal) return
    setDiscarding(true); setError(''); setMessage('')
    try {
      const data = await postWorkspace({ action: 'discard', proposalId: selectedProposal.id })
      applyWorkspace(data)
      setAttested(false)
      setMessage('Propuesta descartada. El CV de origen no cambió.')
    } catch (err: any) { setError(err.message || 'No pudimos descartar la propuesta') }
    finally { setDiscarding(false) }
  }

  if (authLoading || loading) return <DashboardLayout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#c9a84c]" /></div></DashboardLayout>
  if (!user) return <DashboardLayout><div className="mx-auto max-w-xl rounded-3xl border border-white/8 bg-white/[0.02] p-8 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-[#c9a84c]" /><h1 className="font-display mt-4 text-3xl text-cream">Tu CV es privado</h1><p className="mt-3 text-sm text-white/45">Ingresá a Mi Carrera para preparar una reescritura trazable.</p><a href="/mi-carrera" className="mt-6 inline-flex rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-black">Ingresar</a></div></DashboardLayout>

  return (
    <DashboardLayout>
      <Helmet><title>Mejorar mi CV | Mi Carrera · CVitae</title><meta name="description" content="Reescribí tu CV con cambios trazables y evidencia confirmada, sin inventar información." /><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><Eyebrow>Edición con respaldo</Eyebrow><h1 className="font-display mt-2 text-4xl leading-tight text-cream md:text-5xl">Mejor redacción.<br /><em>Los mismos hechos.</em></h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">Cada cambio muestra su antes, su propuesta y las evidencias que lo autorizan. Nada reemplaza tu CV hasta que lo revises y aceptes.</p></div>
          <a href="/mi-carrera/ats" className="inline-flex self-start items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/55 transition hover:border-[#c9a84c]/30 hover:text-[#c9a84c]">Ver diagnóstico ATS <ArrowRight className="h-3.5 w-3.5" /></a>
        </header>

        {(error || message) && <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${error ? 'border-rose-400/20 bg-rose-400/[0.06] text-rose-200' : 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200'}`}>{error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}<span>{error || message}</span></div>}

        <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 md:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#c9a84c]/20 bg-[#c9a84c]/10 text-[#c9a84c]"><History className="h-5 w-5" /></span><div><h2 className="font-display text-xl text-cream">1. Elegí la versión de origen</h2><p className="text-xs text-white/40">Nunca se sobrescribe.</p></div></div>
              {workspace?.versions.length ? <select value={selectedVersionId} onChange={(event) => setSelectedVersionId(event.target.value)} className="mt-5 w-full rounded-xl border border-white/10 bg-[#0d0d0d] px-3 py-3 text-sm text-cream outline-none focus:border-[#c9a84c]/40">{workspace.versions.map((version) => <option key={version.id} value={version.id}>{version.label} · v{version.version_number} · {formatDate(version.created_at)}</option>)}</select> : <div className="mt-5 rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/40">Primero creá o guardá una versión en Mi CV.</div>}
            </div>
            <div>
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60"><WandSparkles className="h-5 w-5" /></span><div><h2 className="font-display text-xl text-cream">2. Definí el objetivo editorial</h2><p className="text-xs text-white/40">Cambia la forma, no los hechos.</p></div></div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">{OBJECTIVES.map((item) => <button key={item.id} type="button" onClick={() => setObjective(item.id)} className={`rounded-xl border p-3 text-left transition ${objective === item.id ? 'border-[#c9a84c]/35 bg-[#c9a84c]/[0.08]' : 'border-white/8 bg-black/10 hover:border-white/15'}`}><item.icon className={`h-4 w-4 ${objective === item.id ? 'text-[#c9a84c]' : 'text-white/35'}`} /><p className="mt-2 text-sm text-cream">{item.title}</p><p className="mt-1 text-[11px] leading-relaxed text-white/35">{item.description}</p></button>)}</div>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-4 border-t border-white/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className={`flex items-start gap-3 text-xs ${workspace?.evidenceReadiness.ready ? 'text-emerald-200/70' : 'text-amber-200/70'}`}>{workspace?.evidenceReadiness.ready ? <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" /> : <AlertCircle className="h-4 w-4 shrink-0 text-amber-300" />}<span>{workspace?.evidenceReadiness.ready ? `${workspace.evidenceReadiness.confirmed} evidencias confirmadas listas para respaldar cambios.` : `${workspace?.evidenceReadiness.pending || 0} pendientes y ${workspace?.evidenceReadiness.confirmed || 0} confirmadas. Revisalas en Mi CV antes de continuar.`}</span></div>
            {workspace?.evidenceReadiness.ready ? <button type="button" onClick={createProposal} disabled={creating || !selectedVersionId} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-40">{creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Comparando evidencia…</> : <><GitCompareArrows className="h-4 w-4" /> Preparar propuesta</>}</button> : <a href="/mi-carrera/cv" className="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-400/25 px-5 py-2.5 text-sm text-amber-200">Revisar evidencias <ArrowRight className="h-4 w-4" /></a>}
          </div>
        </section>

        {selectedProposal ? (
          <AnimatePresence mode="wait">
            <motion.div key={selectedProposal.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-6"><div><p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Propuesta seleccionada</p><p className="mt-1 text-sm text-cream">{OBJECTIVES.find((item) => item.id === selectedProposal.objective)?.title || 'Reescritura'} <span className="text-white/30">· {formatDate(selectedProposal.created_at)}</span></p></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.15em] ${selectedProposal.status === 'draft' ? 'border-amber-400/25 text-amber-200' : selectedProposal.status === 'accepted' ? 'border-emerald-400/25 text-emerald-200' : 'border-white/10 text-white/35'}`}>{selectedProposal.status === 'draft' ? 'Pendiente de decisión' : selectedProposal.status === 'accepted' ? 'Aceptada' : 'Descartada'}</span>{workspace && workspace.proposals.length > 1 && <select value={selectedProposal.id} onChange={(event) => { setSelectedProposalId(event.target.value); setAttested(false) }} className="rounded-full border border-white/10 bg-[#0d0d0d] px-3 py-1.5 text-xs text-white/55 outline-none">{workspace.proposals.map((proposal) => <option key={proposal.id} value={proposal.id}>{formatDate(proposal.created_at)} · {proposal.status}</option>)}</select>}</div></div>

              <section className="overflow-hidden rounded-3xl border border-[#c9a84c]/18 bg-[#c9a84c]/[0.025]">
                <div className="flex flex-col justify-between gap-4 border-b border-white/8 p-5 md:flex-row md:items-center md:px-7"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#c9a84c]/25 bg-[#c9a84c]/10 text-[#c9a84c]"><GitCompareArrows className="h-5 w-5" /></span><div><h2 className="font-display text-2xl text-cream">Mesa de cambios</h2><p className="text-xs text-white/40">{selectedProposal.changes.length} bloques · referencias verificadas en servidor</p></div></div><div className="flex rounded-full border border-white/10 bg-black/20 p-1"><button type="button" onClick={() => setView('changes')} className={`rounded-full px-4 py-1.5 text-xs transition ${view === 'changes' ? 'bg-white/10 text-cream' : 'text-white/40'}`}>Cambios</button><button type="button" onClick={() => setView('preview')} className={`rounded-full px-4 py-1.5 text-xs transition ${view === 'preview' ? 'bg-white/10 text-cream' : 'text-white/40'}`}>Vista completa</button></div></div>
                <div className="p-5 md:p-7">{view === 'changes' ? <div className="space-y-3">{selectedProposal.changes.map((change, index) => <ChangeCard key={change.id} change={change} index={index} />)}</div> : <div className="grid gap-5 xl:grid-cols-2"><MarkdownPaper label={`Origen · ${proposalSource?.label || 'Versión anterior'}`}>{proposalSource?.cv_markdown || 'Versión de origen no disponible.'}</MarkdownPaper><MarkdownPaper label="Propuesta respaldada">{selectedProposal.proposal_markdown}</MarkdownPaper></div>}</div>
              </section>

              <section className={`rounded-3xl border p-5 md:p-7 ${selectedProposal.status === 'draft' ? 'border-emerald-400/18 bg-emerald-400/[0.025]' : 'border-white/8 bg-white/[0.02]'}`}>
                {selectedProposal.status === 'draft' ? <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-300" /><h2 className="font-display text-xl text-cream">3. Tu decisión</h2></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/15 p-4"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#c9a84c]" /><span className="text-xs leading-relaxed text-white/55">Revisé los cambios y confirmo que la propuesta conserva información real. Entiendo que aceptar crea una versión nueva y mantiene intacta la anterior.</span></label></div><div className="flex flex-wrap gap-2 lg:justify-end"><button type="button" onClick={discardProposal} disabled={discarding || accepting} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-sm text-white/50 transition hover:border-rose-400/25 hover:text-rose-200 disabled:opacity-40">{discarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Descartar</button><button type="button" onClick={acceptProposal} disabled={!attested || accepting || discarding} className="inline-flex items-center gap-2 rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-medium text-emerald-950 transition hover:bg-emerald-200 disabled:opacity-40">{accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aceptar como nueva versión</button></div></div> : selectedProposal.status === 'accepted' ? <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /><div><h2 className="font-display text-xl text-cream">Reescritura guardada</h2><p className="mt-1 text-xs text-white/45">La versión de origen continúa disponible en el historial.</p></div></div><a href="/mi-carrera/cv" className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400/25 px-4 py-2 text-sm text-emerald-200">Abrir en Mi CV <ArrowRight className="h-4 w-4" /></a></div> : <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><RotateCcw className="mt-0.5 h-5 w-5 text-white/40" /><div><h2 className="font-display text-xl text-cream">Propuesta descartada</h2><p className="mt-1 text-xs text-white/45">No se modificó ninguna versión del CV.</p></div></div><button type="button" onClick={createProposal} disabled={creating} className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 px-4 py-2 text-sm text-white/55">Volver a abrir</button></div>}
              </section>
            </motion.div>
          </AnimatePresence>
        ) : <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center"><WandSparkles className="mx-auto h-10 w-10 text-white/20" /><h2 className="font-display mt-4 text-2xl text-cream">Todavía no hay una propuesta</h2><p className="mx-auto mt-2 max-w-md text-sm text-white/40">Elegí una versión y un objetivo. La herramienta preparará cambios revisables; tu CV vigente permanecerá intacto.</p></div>}
      </div>
      <ProductGuide storageKey="b2c_cv_rewrite_v1" label="Mejorar CV" steps={[{ title: 'Elegí una versión', description: 'La propuesta parte de una versión inmutable y solo usa evidencias confirmadas vigentes.' },{ title: 'Auditá cada cambio', description: 'Compará antes y después. Cada bloque muestra las evidencias que respaldan su contenido.' },{ title: 'Aceptá o descartá', description: 'Aceptar crea otra versión; descartar no modifica nada. Siempre conservás la versión de origen.' }]} />
    </DashboardLayout>
  )
}
