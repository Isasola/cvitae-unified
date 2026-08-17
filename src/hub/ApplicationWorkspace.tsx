import { useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useParams } from 'wouter'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import {
  AlertCircle, ArrowRight, BriefcaseBusiness, Building2, CalendarDays, Check,
  CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, Copy, Download,
  ExternalLink, FileCheck2, FileText, HelpCircle, History, Loader2, LockKeyhole,
  MapPin, MessageSquareText, ShieldCheck, Sparkles, Target, X,
} from 'lucide-react'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/safe-url'
import { analytics } from '@/lib/analytics'

type CvVersion = {
  id: string
  label: string
  version_number: number
  generation_kind: string
  cv_markdown: string
  created_at: string
}

type Evidence = {
  id: string
  category: string
  value: string
  context?: string | null
  source?: string | null
}

type Requirement = {
  id: string
  text: string
  importance: 'essential' | 'preferred' | 'context'
  status: 'supported' | 'partial' | 'not_evidenced'
  explanation: string
  evidence: Evidence[]
}

type ChecklistItem = { id: string; label: string; kind: string }

type Workspace = {
  id: string
  opportunity_id: string
  source_version_id: string
  status: 'draft' | 'ready' | 'opened' | 'submitted' | 'archived'
  opportunity_snapshot: Record<string, any>
  application_url_snapshot: string
  requirement_analysis: Requirement[]
  fit_summary: Record<string, any>
  tailored_cv_markdown: string
  cover_message: string
  checklist: ChecklistItem[]
  checklist_progress: Record<string, boolean>
  prepared_version_id: string | null
  accepted_at: string | null
  opened_at: string | null
  submitted_self_reported_at: string | null
  created_at: string
}

type WorkspaceData = {
  profileExists: boolean
  opportunity: Record<string, any> | null
  versions: CvVersion[]
  workspaces: Workspace[]
  evidenceReadiness: { ready: boolean; pending: number; confirmed: number }
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'En revisión', ready: 'Lista para postular', opened: 'Formulario abierto',
  submitted: 'Postulación informada', archived: 'Archivada',
}

const REQUIREMENT_STYLE: Record<string, { label: string; className: string }> = {
  supported: { label: 'Respaldado', className: 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200' },
  partial: { label: 'Parcial', className: 'border-amber-300/25 bg-amber-300/[0.07] text-amber-100' },
  not_evidenced: { label: 'Sin evidencia', className: 'border-white/10 bg-white/[0.025] text-white/45' },
}

const CATEGORY_LABEL: Record<string, string> = {
  identity: 'Identidad', title: 'Título', summary: 'Resumen', skill: 'Habilidad',
  course: 'Curso', experience: 'Experiencia', achievement: 'Logro', education: 'Educación',
  language: 'Idioma', contact: 'Contacto', other: 'Dato',
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha límite informada'
  return new Date(value).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function cleanFileName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'postulacion'
}

export default function ApplicationWorkspace() {
  const { slug } = useParams<{ slug?: string }>()
  const [user, setUser] = useState<any>(undefined)
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [tab, setTab] = useState<'requirements' | 'cv' | 'message' | 'checklist'>('requirements')
  const [expandedRequirement, setExpandedRequirement] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [attested, setAttested] = useState(false)
  const [copied, setCopied] = useState(false)
  const GUIDE_KEY = 'cvitae_guide_b2c_application_workspace_v1_completed'
  const [guideOpen, setGuideOpen] = useState(() => localStorage.getItem(GUIDE_KEY) !== 'true')
  const cvRef = useRef<HTMLDivElement>(null)

  const selectedWorkspace = useMemo(
    () => data?.workspaces.find((item) => item.id === selectedWorkspaceId) || data?.workspaces[0] || null,
    [data?.workspaces, selectedWorkspaceId],
  )

  useEffect(() => {
    auth.getUser().then((current) => setUser(current || null))
  }, [])

  useEffect(() => {
    if (user) loadOverview()
    else if (user === null) setLoading(false)
  }, [user, slug])

  const mutation = async (body: Record<string, any>) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Tu sesión expiró. Volvé a ingresar.')
    const response = await fetch('/.netlify/functions/application-workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...body, ...(slug ? { opportunitySlug: slug } : {}) }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'No pudimos actualizar la postulación')
    return payload as WorkspaceData & Record<string, any>
  }

  const applyPayload = (payload: WorkspaceData & Record<string, any>) => {
    setData(payload)
    if (!selectedVersionId && payload.versions[0]) setSelectedVersionId(payload.versions[0].id)
    const requested = payload.workspaceId || payload.accepted?.workspace_id
    if (requested) setSelectedWorkspaceId(requested)
    else if (!selectedWorkspaceId && payload.workspaces[0]) setSelectedWorkspaceId(payload.workspaces[0].id)
  }

  const loadOverview = async () => {
    setLoading(true)
    setError('')
    try {
      applyPayload(await mutation({ action: 'overview' }))
    } catch (caught: any) {
      setError(caught?.message || 'No pudimos cargar este espacio.')
    } finally {
      setLoading(false)
    }
  }

  const prepare = async () => {
    if (!selectedVersionId) return
    setBusy('prepare')
    setError('')
    try {
      const payload = await mutation({ action: 'prepare', sourceVersionId: selectedVersionId })
      applyPayload(payload)
      setTab('requirements')
    } catch (caught: any) {
      setError(caught?.message || 'No pudimos preparar los documentos.')
    } finally {
      setBusy('')
    }
  }

  const accept = async () => {
    if (!selectedWorkspace || !attested) return
    setBusy('accept')
    setError('')
    try {
      applyPayload(await mutation({ action: 'accept', workspaceId: selectedWorkspace.id, attested: true }))
      setAttested(false)
    } catch (caught: any) {
      setError(caught?.message || 'No pudimos aceptar los documentos.')
    } finally {
      setBusy('')
    }
  }

  const saveChecklist = async (itemId: string) => {
    if (!selectedWorkspace) return
    const progress = { ...selectedWorkspace.checklist_progress, [itemId]: !selectedWorkspace.checklist_progress[itemId] }
    setData((current) => current ? {
      ...current,
      workspaces: current.workspaces.map((item) => item.id === selectedWorkspace.id ? { ...item, checklist_progress: progress } : item),
    } : current)
    try {
      applyPayload(await mutation({ action: 'checklist', workspaceId: selectedWorkspace.id, progress }))
    } catch (caught: any) {
      setError(caught?.message || 'No pudimos guardar el checklist.')
      await loadOverview()
    }
  }

  const openOfficialApplication = async () => {
    if (!selectedWorkspace) return
    const destination = safeExternalUrl(selectedWorkspace.application_url_snapshot)
    const popup = window.open('', '_blank')
    if (popup) {
      popup.opener = null
      popup.document.title = 'Abriendo postulación…'
      popup.document.body.textContent = 'Abriendo la fuente oficial…'
    }
    try {
      const payload = await mutation({ action: 'opened', workspaceId: selectedWorkspace.id })
      applyPayload(payload)
      analytics.applyClicked(selectedWorkspace.opportunity_id, selectedWorkspace.opportunity_snapshot.source || 'unknown')
    } catch (caught: any) {
      setError(caught?.message || 'No pudimos registrar la apertura.')
    } finally {
      if (popup) popup.location.replace(destination)
      else window.open(destination, '_blank', 'noopener,noreferrer')
    }
  }

  const markSubmitted = async () => {
    if (!selectedWorkspace) return
    setBusy('submitted')
    try {
      applyPayload(await mutation({ action: 'submitted', workspaceId: selectedWorkspace.id }))
    } catch (caught: any) {
      setError(caught?.message || 'No pudimos registrar tu confirmación.')
    } finally {
      setBusy('')
    }
  }

  const copyMessage = async () => {
    if (!selectedWorkspace) return
    await navigator.clipboard.writeText(selectedWorkspace.cover_message)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const downloadPDF = async () => {
    if (!cvRef.current || !selectedWorkspace) return
    setBusy('pdf')
    try {
      const canvas = await html2canvas(cvRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      const pdf = new jsPDF('p', 'mm', 'a4')
      const width = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const totalHeight = canvas.height / (canvas.width / width)
      const image = canvas.toDataURL('image/png')
      pdf.addImage(image, 'PNG', 0, 0, width, totalHeight)
      let remaining = totalHeight - pageHeight
      let page = 1
      while (remaining > 0) {
        pdf.addPage()
        pdf.addImage(image, 'PNG', 0, -(pageHeight * page), width, totalHeight)
        remaining -= pageHeight
        page += 1
      }
      pdf.save(`CV-${cleanFileName(selectedWorkspace.opportunity_snapshot.title || 'postulacion')}.pdf`)
    } finally {
      setBusy('')
    }
  }

  if (loading || user === undefined) return <DashboardLayout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#c9a84c]" /></div></DashboardLayout>
  if (!user) return <DashboardLayout><div className="mx-auto max-w-xl rounded-3xl border border-white/8 bg-white/[0.02] p-8 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-[#c9a84c]" /><h1 className="font-display mt-4 text-3xl text-cream">Tu postulación es privada</h1><p className="mt-3 text-sm text-white/45">Ingresá a Mi Carrera para preparar documentos y guardar el seguimiento.</p><a href="/mi-carrera" className="mt-6 inline-flex rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-black">Ingresar</a></div></DashboardLayout>

  if (!slug) return (
    <DashboardLayout>
      <Helmet><title>Mis postulaciones | CVitae</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto max-w-5xl space-y-8">
        <header><p className="text-[10px] uppercase tracking-[0.24em] text-[#c9a84c]">Seguimiento privado</p><h1 className="font-display mt-3 text-4xl text-cream">Mis postulaciones</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">Cada expediente conserva la oportunidad, la versión del CV y lo que vos informaste. CVitae no marca una postulación como enviada sin tu confirmación.</p></header>
        {error && <ErrorBanner message={error} />}
        {!data?.workspaces.length ? <div className="rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center"><BriefcaseBusiness className="mx-auto h-8 w-8 text-white/20" /><h2 className="font-display mt-4 text-2xl text-cream">Todavía no preparaste una postulación</h2><p className="mt-2 text-sm text-white/40">Abrí una oportunidad verificada y elegí “Preparar mi postulación”.</p><a href="/oportunidades" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-5 py-2.5 text-sm font-medium text-black">Explorar oportunidades <ArrowRight className="h-4 w-4" /></a></div> : <div className="grid gap-4 md:grid-cols-2">{data.workspaces.map((workspace) => <a key={workspace.id} href={`/mi-carrera/postular/${workspace.opportunity_snapshot.slug}`} className="group rounded-3xl border border-white/8 bg-white/[0.018] p-6 transition hover:border-[#c9a84c]/30"><div className="flex items-start justify-between gap-4"><span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-wider text-white/50">{STATUS_LABEL[workspace.status]}</span><ArrowRight className="h-4 w-4 text-white/25 transition group-hover:translate-x-1 group-hover:text-[#c9a84c]" /></div><h2 className="font-display mt-5 text-2xl text-cream">{workspace.opportunity_snapshot.title}</h2><p className="mt-2 text-sm text-white/40">{workspace.opportunity_snapshot.organization || 'Organización no informada'}</p><div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4 text-xs text-white/35"><span>{workspace.fit_summary.coverage_score}% de cobertura documentada</span><span>{formatDate(workspace.opportunity_snapshot.deadline)}</span></div></a>)}</div>}
      </div>
    </DashboardLayout>
  )

  const opportunity = data?.opportunity
  const ready = selectedWorkspace && selectedWorkspace.status !== 'draft' && selectedWorkspace.status !== 'archived'
  const checkedCount = selectedWorkspace?.checklist.filter((item) => selectedWorkspace.checklist_progress[item.id]).length || 0

  return (
    <DashboardLayout>
      <Helmet><title>{opportunity ? `Preparar postulación a ${opportunity.title}` : 'Preparar postulación'} | CVitae</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="text-[10px] uppercase tracking-[0.24em] text-[#c9a84c]">Sala de postulación</p><h1 className="font-display mt-3 max-w-3xl text-4xl leading-tight text-cream sm:text-5xl">Prepará cada envío.<br /><em className="font-normal text-white">Con hechos que podés defender.</em></h1><p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/45">CVitae organiza requisitos, evidencia y documentos. La decisión y el envío final siempre son tuyos.</p></div>
          <a href="/mi-carrera/postular" className="inline-flex self-start items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/50"><History className="h-3.5 w-3.5" /> Ver historial</a>
        </header>

        {error && <ErrorBanner message={error} />}
        {!opportunity ? <div className="rounded-3xl border border-white/8 p-8"><AlertCircle className="h-7 w-7 text-amber-200" /><h2 className="font-display mt-4 text-2xl text-cream">Esta oportunidad ya no está disponible</h2><a href="/oportunidades" className="mt-5 inline-flex text-sm text-[#c9a84c]">Volver al catálogo</a></div> : <>
          <section className="grid overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-white/[0.035] to-transparent lg:grid-cols-[1fr_270px]">
            <div className="p-6 sm:p-8"><div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/35"><span>{opportunity.opportunity_kind || 'Oportunidad'}</span><span>•</span><span>Fuente verificada</span></div><h2 className="font-display mt-3 text-3xl text-cream">{opportunity.title}</h2><div className="mt-5 flex flex-wrap gap-4 text-xs text-white/45"><span className="flex items-center gap-2"><Building2 className="h-4 w-4" />{opportunity.organization || 'Organización no informada'}</span><span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{opportunity.location || 'Ubicación no informada'}</span><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{formatDate(opportunity.deadline)}</span></div></div>
            <div className="border-t border-white/8 p-6 lg:border-l lg:border-t-0"><p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Fuente final</p><p className="mt-3 text-xs leading-relaxed text-white/45">Revisá requisitos y vigencia nuevamente en el sitio de la organización antes de enviar.</p><a href={`/oportunidades/${opportunity.slug}`} className="mt-4 inline-flex items-center gap-2 text-xs text-[#c9a84c]">Ver ficha pública <ExternalLink className="h-3.5 w-3.5" /></a></div>
          </section>

          <section className="rounded-3xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.035] p-6 sm:p-8">
            <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end"><div><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#c9a84c]/25 bg-[#c9a84c]/10 text-[#c9a84c]"><Target className="h-4 w-4" /></span><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">1. Punto de partida</p><h2 className="font-display text-2xl text-cream">Elegí el CV que querés adaptar</h2></div></div><select value={selectedVersionId} onChange={(event) => setSelectedVersionId(event.target.value)} className="mt-5 w-full max-w-xl rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none focus:border-[#c9a84c]/50"><option value="">Elegí una versión…</option>{data?.versions.map((version) => <option key={version.id} value={version.id}>{version.label} · v{version.version_number} · {formatDate(version.created_at)}</option>)}</select><div className="mt-4 flex items-center gap-2 text-xs"><ShieldCheck className={`h-4 w-4 ${data?.evidenceReadiness.ready ? 'text-emerald-300' : 'text-amber-200'}`} /><span className={data?.evidenceReadiness.ready ? 'text-emerald-200' : 'text-amber-100'}>{data?.evidenceReadiness.ready ? `${data.evidenceReadiness.confirmed} evidencias confirmadas listas` : `${data?.evidenceReadiness.pending || 0} evidencias pendientes de revisión`}</span></div></div>
              {data?.evidenceReadiness.ready && data.versions.length ? <button type="button" onClick={prepare} disabled={!selectedVersionId || busy === 'prepare'} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-6 text-sm font-medium text-black transition hover:bg-[#e4ca7e] disabled:opacity-40">{busy === 'prepare' ? <><Loader2 className="h-4 w-4 animate-spin" /> Cruzando requisitos…</> : <><Sparkles className="h-4 w-4" /> Preparar expediente</>}</button> : <a href="/mi-carrera/cv" className="inline-flex h-11 items-center gap-2 rounded-full border border-amber-300/25 px-5 text-sm text-amber-100">Revisar Mi CV <ArrowRight className="h-4 w-4" /></a>}
            </div>
          </section>

          {selectedWorkspace && <>
            <section className="overflow-hidden rounded-3xl border border-white/8 bg-[#070707]">
              <div className="grid border-b border-white/8 md:grid-cols-[220px_1fr]">
                <div className="border-b border-white/8 p-6 md:border-b-0 md:border-r"><div className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-full" style={{ background: `conic-gradient(#c9a84c ${selectedWorkspace.fit_summary.coverage_score || 0}%, rgba(255,255,255,.08) 0)` }}><div className="flex h-[110px] w-[110px] flex-col items-center justify-center rounded-full bg-[#070707]"><strong className="font-display text-4xl font-normal text-cream">{selectedWorkspace.fit_summary.coverage_score}%</strong><span className="mt-1 text-[9px] uppercase tracking-wider text-white/30">cobertura</span></div></div><p className="mt-4 text-center text-sm text-cream">{selectedWorkspace.fit_summary.label}</p><p className="mt-2 text-center text-[11px] leading-relaxed text-white/35">No es una probabilidad de contratación.</p></div>
                <div className="p-6 sm:p-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">2. Mapa de respaldo</p><h2 className="font-display mt-2 text-3xl text-cream">Lo que podés demostrar</h2></div><span className="self-start rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-wider text-white/50">{STATUS_LABEL[selectedWorkspace.status]}</span></div><div className="mt-7 grid grid-cols-3 gap-3"><Metric value={selectedWorkspace.fit_summary.supported} label="Respaldados" tone="emerald" /><Metric value={selectedWorkspace.fit_summary.partial} label="Parciales" tone="amber" /><Metric value={selectedWorkspace.fit_summary.not_evidenced} label="Sin evidencia" tone="neutral" /></div></div>
              </div>
              <nav className="flex gap-1 overflow-x-auto border-b border-white/8 p-2">{([['requirements', 'Requisitos', ClipboardCheck], ['cv', 'CV adaptado', FileText], ['message', 'Mensaje', MessageSquareText], ['checklist', `Checklist ${checkedCount}/${selectedWorkspace.checklist.length}`, FileCheck2]] as const).map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs transition ${tab === key ? 'bg-white/8 text-cream' : 'text-white/35 hover:text-white/60'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>

              {tab === 'requirements' && <div className="space-y-3 p-4 sm:p-7">{selectedWorkspace.requirement_analysis.map((requirement, index) => { const style = REQUIREMENT_STYLE[requirement.status]; const open = expandedRequirement === requirement.id; return <article key={requirement.id} className="overflow-hidden rounded-2xl border border-white/8"><button type="button" onClick={() => setExpandedRequirement(open ? null : requirement.id)} className="flex w-full items-start gap-4 p-5 text-left"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-[10px] text-white/40">{index + 1}</span><span className="min-w-0 flex-1"><span className="text-sm leading-relaxed text-cream">{requirement.text}</span><span className="mt-2 flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-wider ${style.className}`}>{style.label}</span><span className="rounded-full border border-white/8 px-2.5 py-1 text-[9px] uppercase tracking-wider text-white/30">{requirement.importance === 'essential' ? 'Esencial' : requirement.importance === 'preferred' ? 'Deseable' : 'Contexto'}</span></span></span>{open ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}</button>{open && <div className="border-t border-white/8 bg-white/[0.015] px-5 py-4 sm:pl-16"><p className="text-xs leading-relaxed text-white/45">{requirement.explanation}</p>{requirement.evidence?.length ? <div className="mt-4 flex flex-wrap gap-2">{requirement.evidence.map((evidence) => <span key={evidence.id} className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-1.5 text-[10px] text-emerald-100"><strong>{CATEGORY_LABEL[evidence.category] || 'Evidencia'}:</strong> {evidence.value}</span>)}</div> : <p className="mt-3 text-[10px] text-white/30">No se agregó este requisito al CV como si fuera un hecho.</p>}</div>}</article>})}</div>}

              {tab === 'cv' && <div className="p-4 sm:p-7"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-white/40">Versión propuesta para esta oportunidad</p><p className="mt-1 text-[10px] text-emerald-200">Cada bloque pasó por controles de evidencia.</p></div><button type="button" onClick={downloadPDF} disabled={busy === 'pdf'} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/60">{busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar PDF</button></div><div ref={cvRef} className="mx-auto min-h-[720px] max-w-3xl rounded-sm bg-[#f4f1e9] px-8 py-10 text-[#151515] shadow-2xl sm:px-14 sm:py-14"><ReactMarkdown rehypePlugins={[rehypeSanitize]} components={{ h1: ({ children }) => <h1 className="font-serif text-3xl leading-tight">{children}</h1>, h2: ({ children }) => <h2 className="mt-8 border-b border-black/15 pb-2 font-serif text-lg font-semibold">{children}</h2>, p: ({ children }) => <p className="mt-3 text-[13px] leading-6">{children}</p>, ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-6">{children}</ul>, li: ({ children }) => <li>{children}</li> }}>{selectedWorkspace.tailored_cv_markdown}</ReactMarkdown></div></div>}

              {tab === 'message' && <div className="p-4 sm:p-7"><div className="mx-auto max-w-3xl rounded-3xl border border-white/8 bg-white/[0.02] p-6 sm:p-8"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">Borrador editable al copiar</p><h3 className="font-display mt-2 text-2xl text-cream">Mensaje de presentación</h3></div><button type="button" onClick={copyMessage} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/60">{copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}{copied ? 'Copiado' : 'Copiar'}</button></div><div className="mt-6 whitespace-pre-line border-l border-[#c9a84c]/40 pl-5 text-sm leading-7 text-white/65">{selectedWorkspace.cover_message}</div><p className="mt-6 text-[11px] leading-relaxed text-white/30">Personalizá el saludo y el cierre antes de enviarlo. No se genera ni se envía ningún correo automáticamente.</p></div></div>}

              {tab === 'checklist' && <div className="p-4 sm:p-7"><div className="mx-auto max-w-3xl space-y-3">{selectedWorkspace.checklist.map((item) => <label key={item.id} className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition ${selectedWorkspace.checklist_progress[item.id] ? 'border-emerald-400/20 bg-emerald-400/[0.04]' : 'border-white/8 bg-white/[0.015]'}`}><input type="checkbox" checked={Boolean(selectedWorkspace.checklist_progress[item.id])} onChange={() => saveChecklist(item.id)} className="mt-0.5 h-4 w-4 accent-[#c9a84c]" /><span className={`text-sm leading-relaxed ${selectedWorkspace.checklist_progress[item.id] ? 'text-white/40 line-through' : 'text-white/65'}`}>{item.label}</span></label>)}</div></div>}
            </section>

            <section className={`rounded-3xl border p-6 sm:p-8 ${ready ? 'border-emerald-400/20 bg-emerald-400/[0.035]' : 'border-[#c9a84c]/20 bg-[#c9a84c]/[0.025]'}`}>
              {!ready ? <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-300" /><h2 className="font-display text-2xl text-cream">3. Tu aprobación</h2></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/15 p-4"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#c9a84c]" /><span className="text-xs leading-relaxed text-white/55">Revisé el CV y el mensaje. Confirmo que conservan información real y entiendo que CVitae prepara documentos, pero no envía la postulación por mí.</span></label></div><button type="button" onClick={accept} disabled={!attested || busy === 'accept'} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-300 px-6 text-sm font-medium text-emerald-950 disabled:opacity-40">{busy === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar versión final</button></div> : <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /><div><h2 className="font-display text-2xl text-cream">4. Salida controlada</h2><p className="mt-2 max-w-xl text-xs leading-relaxed text-white/45">Abriremos la fuente oficial. Si completás el formulario externo, volvé y registralo; ese estado será una confirmación tuya, no una verificación de la empresa.</p></div></div><div className="flex flex-wrap gap-2 lg:justify-end"><button type="button" onClick={openOfficialApplication} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-black">Abrir formulario oficial <ExternalLink className="h-4 w-4" /></button>{selectedWorkspace.status !== 'submitted' ? <button type="button" onClick={markSubmitted} disabled={busy === 'submitted'} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 px-5 text-sm text-white/60">{busy === 'submitted' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} Ya postulé</button> : <span className="inline-flex h-11 items-center gap-2 rounded-full border border-emerald-400/25 px-5 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Informada por vos</span>}</div></div>}
            </section>
          </>}
        </>}
      </div>

      <button type="button" onClick={() => setGuideOpen(true)} className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0b0b0b]/95 px-4 py-2.5 text-xs text-white/55 shadow-xl backdrop-blur"><HelpCircle className="h-4 w-4 text-[#c9a84c]" /> Guía</button>
      {guideOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"><div role="dialog" aria-modal="true" aria-label="Guía de postulación" className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b0b0b] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">Cómo funciona</p><h2 className="font-display mt-2 text-3xl text-cream">Una sala, cuatro controles</h2></div><button type="button" onClick={() => { localStorage.setItem(GUIDE_KEY, 'true'); setGuideOpen(false) }} className="rounded-full border border-white/10 p-2 text-white/40"><X className="h-4 w-4" /></button></div><ol className="mt-7 space-y-5">{[['1', 'Elegí una versión', 'El CV de origen permanece intacto.'], ['2', 'Revisá el respaldo', 'Diferenciamos coincidencias, evidencia parcial y brechas.'], ['3', 'Aprobá los documentos', 'Solo entonces guardamos una versión adaptada.'], ['4', 'Postulá en la fuente', 'CVitae registra la apertura; el envío externo depende de vos.']].map(([number, title, detail]) => <li key={number} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#c9a84c]/25 text-xs text-[#c9a84c]">{number}</span><span><strong className="text-sm font-medium text-cream">{title}</strong><span className="mt-1 block text-xs leading-relaxed text-white/40">{detail}</span></span></li>)}</ol></div></div>}
    </DashboardLayout>
  )
}

function Metric({ value, label, tone }: { value: number; label: string; tone: 'emerald' | 'amber' | 'neutral' }) {
  const color = tone === 'emerald' ? 'text-emerald-200' : tone === 'amber' ? 'text-amber-100' : 'text-white/45'
  return <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4"><strong className={`font-display text-3xl font-normal ${color}`}>{value || 0}</strong><span className="mt-1 block text-[10px] uppercase tracking-wider text-white/30">{label}</span></div>
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{message}</span></div>
}
