import { useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import {
  Download, Copy, RefreshCw, Briefcase, FileText, CheckCircle,
  Sun, Moon, Edit3, Eye, Sparkles, AlertCircle, Loader2, ChevronRight, Lock,
  History, ShieldCheck, XCircle, Save, RotateCcw, GitBranch,
} from 'lucide-react'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { ProductGuide } from '@/components/cv/ProductGuide'
import { GrowthLine } from '@/components/cv/visuals'
import { auth, supabase } from '@/lib/supabase'
import { CVLoader } from '@/components/cv/CVLoader'
import { playComplete } from '@/lib/sounds'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const MATCH_BATCH_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/match-batch'
const ease = [0.22, 1, 0.36, 1] as const

type EvidenceItem = {
  id: string
  category: string
  claim: string
  confirmed_value: string | null
  context: string | null
  source_kind: string
  source_label: string | null
  status: 'pending' | 'confirmed' | 'rejected'
}

type CvVersion = {
  id: string
  vacancy_id: string
  version_number: number
  parent_version_id: string | null
  label: string
  generation_kind: string
  cv_markdown: string
  evidence_snapshot: any[]
  vacancy_snapshot: Record<string, any>
  user_attested: boolean
  created_at: string
}

const EVIDENCE_LABELS: Record<string, string> = {
  identity: 'Identidad', title: 'Título', summary: 'Resumen', skill: 'Habilidad',
  course: 'Curso', experience: 'Experiencia', achievement: 'Logro',
  education: 'Educación', language: 'Idioma', contact: 'Contacto', other: 'Dato',
}

export default function CVVivo() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [vacancies, setVacancies] = useState<any[]>([])
  const [selectedVacancy, setSelectedVacancy] = useState<any>(null)
  const [customVacancy, setCustomVacancy] = useState('')
  const [mode, setMode] = useState<'match' | 'custom'>('match')
  const [generatedCV, setGeneratedCV] = useState<string>('')
  const [editableCV, setEditableCV] = useState<string>('')
  const [fromCache, setFromCache] = useState(false)
  const [loading, setLoading] = useState(false)
  const [adapting, setAdapting] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [cvVivoUsedToday, setCvVivoUsedToday] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [evidence, setEvidence] = useState<EvidenceItem[]>([])
  const [versions, setVersions] = useState<CvVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [evidenceEdits, setEvidenceEdits] = useState<Record<string, string>>({})
  const [reviewingEvidence, setReviewingEvidence] = useState<string | null>(null)
  const [workspaceError, setWorkspaceError] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)
  const [manualAttested, setManualAttested] = useState(false)
  const [showEvidence, setShowEvidence] = useState(true)
  const cvRef = useRef<HTMLDivElement>(null)

  const pendingEvidence = evidence.filter((item) => item.status === 'pending')
  const confirmedEvidence = evidence.filter((item) => item.status === 'confirmed')
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) || null

  useEffect(() => {
    auth.getUser().then(setUser)
  }, [])

  useEffect(() => {
    if (user) loadData()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    setWorkspaceError('')
    try {
      const { data: prof, error: profileError } = await supabase
        .from('user_master_profiles').select('*').eq('user_id', user.id).maybeSingle()
      if (profileError) throw profileError
      setProfile(prof)
      const isProUser = prof?.is_subscribed || false
      setIsSubscribed(isProUser)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' })
      const usage = prof?.profile_data?.daily_usage
      const cvVivoToday = (usage?.date === today) ? (usage?.cv_vivo || 0) : 0
      setCvVivoUsedToday(cvVivoToday >= 1 && !isProUser)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Tu sesión expiró. Volvé a ingresar.')
      const authenticatedHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      }
      const [matchesRes, workspaceRes] = await Promise.all([
        fetch(MATCH_BATCH_URL, { method: 'POST', headers: authenticatedHeaders }),
        fetch('/.netlify/functions/cv-workspace', {
          method: 'POST',
          headers: authenticatedHeaders,
          body: JSON.stringify({ action: 'overview' }),
        }),
      ])
      const matchesData = await matchesRes.json()
      const workspaceData = await workspaceRes.json()
      if (!matchesRes.ok) throw new Error(matchesData.error || 'No pudimos cargar las vacantes')
      if (!workspaceRes.ok) throw new Error(workspaceData.error || 'No pudimos cargar tu espacio de CV')
      setVacancies(matchesData.matches || [])
      const nextEvidence = workspaceData.evidence || []
      const nextVersions = workspaceData.versions || []
      setEvidence(nextEvidence)
      setEvidenceEdits(Object.fromEntries(nextEvidence.map((item: EvidenceItem) => [item.id, item.confirmed_value || item.claim])))
      setVersions(nextVersions)
      if (nextVersions[0]) {
        setSelectedVersionId(nextVersions[0].id)
        setGeneratedCV(nextVersions[0].cv_markdown)
        setEditableCV(nextVersions[0].cv_markdown)
        setFromCache(true)
      }
    } catch (error: any) {
      setWorkspaceError(error?.message || 'No pudimos cargar tu espacio de CV.')
    } finally {
      setLoading(false)
    }
  }

  const applyVersion = (version: CvVersion) => {
    setSelectedVersionId(version.id)
    setGeneratedCV(version.cv_markdown)
    setEditableCV(version.cv_markdown)
    setEditMode(false)
    setManualAttested(false)
  }

  const workspaceMutation = async (body: Record<string, any>) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Tu sesión expiró. Volvé a ingresar.')
    const response = await fetch('/.netlify/functions/cv-workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'No pudimos actualizar tu CV')
    return data
  }

  const reviewEvidence = async (item: EvidenceItem, decision: 'confirmed' | 'rejected') => {
    setReviewingEvidence(item.id)
    setWorkspaceError('')
    try {
      const data = await workspaceMutation({
        action: 'review_evidence',
        evidenceId: item.id,
        decision,
        confirmedValue: evidenceEdits[item.id] || item.claim,
      })
      setEvidence((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, status: data.evidence.status, confirmed_value: data.evidence.confirmed_value }
        : entry))
    } catch (error: any) {
      setWorkspaceError(error?.message || 'No pudimos guardar la revisión.')
    } finally {
      setReviewingEvidence(null)
    }
  }

  const confirmAllEvidence = async () => {
    const ids = pendingEvidence.map((item) => item.id)
    if (!ids.length) return
    setReviewingEvidence('all')
    setWorkspaceError('')
    try {
      await workspaceMutation({ action: 'review_all', evidenceIds: ids })
      setEvidence((current) => current.map((item) => ids.includes(item.id) ? { ...item, status: 'confirmed' } : item))
    } catch (error: any) {
      setWorkspaceError(error?.message || 'No pudimos confirmar las evidencias.')
    } finally {
      setReviewingEvidence(null)
    }
  }

  const generateVersion = async (vacancyToUse: any) => {
    if (!profile) return
    if (pendingEvidence.length > 0 || confirmedEvidence.length === 0) {
      setShowEvidence(true)
      setWorkspaceError('Revisá las evidencias antes de crear una versión nueva.')
      return
    }
    if (cvVivoUsedToday && !isSubscribed) {
      setWorkspaceError('Ya usaste tu CV Vivo del día. Con Pro podés adaptarlo para cada vacante sin límite.')
      return
    }

    setAdapting(true)
    setWorkspaceError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Sesión requerida')
      const res = await fetch('/.netlify/functions/generate-cv-vivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ vacancy: vacancyToUse, force: true, parentVersionId: selectedVersionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No pudimos adaptar el CV')
      if (data.cv) {
        const version = data.version as CvVersion
        setVersions((current) => [version, ...current.filter((item) => item.id !== version.id)])
        applyVersion(version)
        playComplete()
        setFromCache(data.fromCache || false)
        if (!isSubscribed) {
          const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' })
          const currentUsage = profile?.profile_data?.daily_usage
          const currentCount = (currentUsage?.date === today) ? (currentUsage?.cv_vivo || 0) : 0
          await supabase.from('user_master_profiles').update({
            profile_data: {
              ...profile.profile_data,
              daily_usage: { date: today, matches_shown: currentUsage?.matches_shown || 0, cv_vivo: currentCount + 1 }
            }
          }).eq('user_id', user.id)
          setCvVivoUsedToday(true)
        }
      }
    } catch {
      setWorkspaceError('Error al adaptar el CV. Intentá de nuevo.')
    } finally {
      setAdapting(false)
    }
  }

  const handleAdaptCV = async () => {
    const vacancyToUse = mode === 'match'
      ? selectedVacancy
      : { titulo: 'Vacante Personalizada', cuerpo: customVacancy, id: 'custom' }
    if (!vacancyToUse) return
    await generateVersion(vacancyToUse)
  }

  const handleGenerateBase = async () => generateVersion(null)

  const saveManualVersion = async () => {
    if (!manualAttested || !editableCV.trim()) return
    setSavingVersion(true)
    setWorkspaceError('')
    try {
      const data = await workspaceMutation({
        action: 'save_manual_version',
        cvMarkdown: editableCV,
        vacancyId: selectedVersion?.vacancy_id || 'base_cv',
        parentVersionId: selectedVersionId,
        vacancySnapshot: selectedVersion?.vacancy_snapshot || {},
        label: selectedVersion ? `Edición de ${selectedVersion.label}` : 'Edición confirmada',
        attested: true,
      })
      const version = data.version as CvVersion
      setVersions((current) => [version, ...current])
      applyVersion(version)
    } catch (error: any) {
      setWorkspaceError(error?.message || 'No pudimos guardar la versión.')
    } finally {
      setSavingVersion(false)
    }
  }

  const restoreVersion = async (version: CvVersion) => {
    setSavingVersion(true)
    setWorkspaceError('')
    try {
      const data = await workspaceMutation({ action: 'restore_version', versionId: version.id })
      const restored = data.version as CvVersion
      setVersions((current) => [restored, ...current])
      applyVersion(restored)
    } catch (error: any) {
      setWorkspaceError(error?.message || 'No pudimos restaurar la versión.')
    } finally {
      setSavingVersion(false)
    }
  }

  const downloadPDF = async () => {
    if (!cvRef.current) return
    const el = cvRef.current
    const prevMaxHeight = el.style.maxHeight
    el.style.maxHeight = 'none'
    await new Promise(r => setTimeout(r, 150))
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: darkMode ? '#111111' : '#ffffff',
      useCORS: true, logging: false,
      windowWidth: el.scrollWidth, windowHeight: el.scrollHeight,
    })
    el.style.maxHeight = prevMaxHeight
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfW = pdf.internal.pageSize.getWidth()
    const pdfH = pdf.internal.pageSize.getHeight()
    const ratio = canvas.width / pdfW
    const totalH = canvas.height / ratio
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, totalH)
    let remaining = totalH - pdfH, page = 1
    while (remaining > 0) {
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, -(pdfH * page), pdfW, totalH)
      remaining -= pdfH; page++
    }
    pdf.save(`CVitae_${profile?.full_name || 'Candidato'}_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(editMode ? editableCV : generatedCV)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center gap-6 py-32">
          <div className="relative h-20 w-full max-w-sm">
            <GrowthLine className="absolute inset-0 h-full w-full" />
          </div>
          <p className="text-sm text-muted-foreground">Preparando tu espacio de CV…</p>
        </div>
      </DashboardLayout>
    )
  }

  const canAdapt = mode === 'match' ? !!selectedVacancy : customVacancy.trim().length > 20

  return (
    <DashboardLayout>
      {adapting && <CVLoader variant="overlay" label="Generando tu CV Vivo..." />}
      <Helmet>
        <title>CV Vivo | CVitae</title>
        <meta name="description" content="Generá un CV adaptado por IA a cada vacante que te interesa. Descargalo en PDF en segundos." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl text-white">CV Vivo</h1>
              <span className="rounded-full border border-[#c9a84c]/30 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[#c9a84c]">Híbrido ATS</span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              La IA mejora el <strong className="text-white">contenido y las palabras</strong> para pasar filtros ATS.
              Elegí una vacante de CVitae o pegá una descripción externa.
            </p>
            {fromCache && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#c9a84c]/25 bg-[#c9a84c]/[0.06] px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-[#c9a84c]" />
                <span className="text-xs text-[#c9a84c]">Versión guardada · historial disponible</span>
              </div>
            )}
          </div>

          <div className="w-full space-y-3 md:w-80">
            <div className="flex rounded-2xl border border-white/10 bg-white/[0.02] p-1">
              {(['match', 'custom'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all ${
                    mode === m ? 'bg-[#c9a84c] text-[#0a0a0a]' : 'text-muted-foreground hover:text-white'
                  }`}>
                  {m === 'match' ? 'Vacantes CVitae' : 'Pegar vacante'}
                </button>
              ))}
            </div>

            {mode === 'match' ? (
              <select
                className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-2.5 text-sm text-white outline-none focus:border-[#c9a84c]/50 transition"
                onChange={e => setSelectedVacancy(vacancies.find(v => v.id === e.target.value) || null)}
                value={selectedVacancy?.id || ''}
              >
                <option value="" className="bg-[#0a0a0a] text-white">Seleccioná una vacante…</option>
                {vacancies.map(v => (
                  <option key={v.id} value={v.id} className="bg-[#0a0a0a] text-white">
                    {v.titulo} ({v.finalScore}%)
                  </option>
                ))}
              </select>
            ) : (
              <textarea
                value={customVacancy} onChange={e => setCustomVacancy(e.target.value)}
                placeholder="Pegá acá la descripción del empleo (LinkedIn, diario, etc)…"
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-[#c9a84c]/50 transition min-h-[100px]"
              />
            )}

            {cvVivoUsedToday && !isSubscribed ? (
              <div className="space-y-2">
                <button
                  disabled
                  className="inline-flex w-full h-10 items-center justify-center gap-2 rounded-full bg-white/10 text-sm font-medium text-white/40 cursor-not-allowed"
                >
                  <Lock size={16} /> Límite diario alcanzado
                </button>
                <p className="text-center text-xs text-white/40">
                  <a href={`https://wa.me/595992954169?text=${encodeURIComponent('Hola, quiero solicitar acceso ampliado a la beta de CVitae.')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[#c9a84c] hover:underline">Solicitá acceso beta</a> para más adaptaciones
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <button
                  onClick={handleAdaptCV} disabled={!canAdapt || adapting || pendingEvidence.length > 0 || confirmedEvidence.length === 0}
                  className="inline-flex w-full h-10 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adapting
                    ? <><RefreshCw className="animate-spin" size={16} /> Adaptando…</>
                    : pendingEvidence.length > 0
                      ? <><ShieldCheck size={16} /> Revisá evidencias primero</>
                      : <><Briefcase size={16} /> Crear versión adaptada</>}
                </button>
                {!isSubscribed && (
                  <p className="text-center text-xs text-white/40">1 incluida hoy · <a href={`https://wa.me/595992954169?text=${encodeURIComponent('Hola, quiero solicitar acceso ampliado a la beta de CVitae.')}`} target="_blank" rel="noopener noreferrer" className="text-[#c9a84c] hover:underline">solicitá acceso beta</a> para más</p>
                )}
              </div>
            )}
          </div>
        </div>

        {workspaceError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{workspaceError}</span>
          </div>
        )}

        <section className={`overflow-hidden rounded-3xl border transition-colors ${
          pendingEvidence.length
            ? 'border-[#c9a84c]/25 bg-gradient-to-br from-[#c9a84c]/[0.08] to-white/[0.015]'
            : 'border-emerald-400/20 bg-emerald-500/[0.045]'
        }`}>
          <button
            type="button"
            onClick={() => setShowEvidence((value) => !value)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
          >
            <span className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${pendingEvidence.length ? 'border-[#c9a84c]/25 bg-[#c9a84c]/10 text-[#c9a84c]' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}>
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Evidencias que puede usar tu CV</span>
                <span className="mt-0.5 block text-xs text-white/45">
                  {pendingEvidence.length
                    ? `${pendingEvidence.length} por revisar · ninguna entra al CV sin tu confirmación`
                    : `${confirmedEvidence.length} confirmadas · datos pendientes y rechazados quedan fuera`}
                </span>
              </span>
            </span>
            <ChevronRight className={`h-4 w-4 text-white/35 transition-transform ${showEvidence ? 'rotate-90' : ''}`} />
          </button>

          {showEvidence && (
            <div className="border-t border-white/8 px-5 py-5 sm:px-6">
              {pendingEvidence.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <p className="max-w-2xl text-xs leading-relaxed text-white/50">
                      Corregí el texto si hace falta. Confirmar significa que el dato es real y puede aparecer en versiones futuras; “No usar” lo excluye.
                    </p>
                    <button
                      type="button"
                      onClick={confirmAllEvidence}
                      disabled={reviewingEvidence !== null}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-[#c9a84c]/30 px-4 text-xs font-medium text-[#e6cf8a] transition hover:bg-[#c9a84c]/10 disabled:opacity-40"
                    >
                      {reviewingEvidence === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      Confirmar todos tal como están
                    </button>
                  </div>
                  <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                    {pendingEvidence.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
                          <span className="text-[#c9a84c]">{EVIDENCE_LABELS[item.category] || 'Dato'}</span>
                          <span className="text-white/20">/</span>
                          <span className="normal-case tracking-normal text-white/35">{item.source_label || 'Mi perfil'}</span>
                          {item.context && <span className="normal-case tracking-normal text-white/35">· {item.context}</span>}
                        </div>
                        <input
                          value={evidenceEdits[item.id] ?? item.claim}
                          onChange={(event) => setEvidenceEdits((current) => ({ ...current, [item.id]: event.target.value }))}
                          maxLength={2000}
                          className="w-full rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#c9a84c]/40"
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => reviewEvidence(item, 'confirmed')}
                            disabled={reviewingEvidence !== null || !(evidenceEdits[item.id] ?? item.claim).trim()}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#c9a84c] px-3 text-xs font-medium text-[#0a0a0a] disabled:opacity-40"
                          >
                            {reviewingEvidence === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewEvidence(item, 'rejected')}
                            disabled={reviewingEvidence !== null}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs text-white/55 transition hover:border-red-300/25 hover:text-red-200 disabled:opacity-40"
                          >
                            <XCircle className="h-3.5 w-3.5" /> No usar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-emerald-200">Control de evidencia completo</p>
                    <p className="mt-1 text-xs text-white/45">La IA puede ordenar y redactar mejor, pero no agregar hechos fuera de estas confirmaciones.</p>
                  </div>
                  {!generatedCV && confirmedEvidence.length > 0 && (
                    <button
                      type="button"
                      onClick={handleGenerateBase}
                      disabled={adapting}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-[#0a0a0a] disabled:opacity-40"
                    >
                      {adapting ? <CVLoader variant="button" size={20} /> : <Sparkles className="h-4 w-4" />}
                      Crear primera versión
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left panel */}
          <div className="space-y-4 lg:col-span-1">
            <div className="glass-card rounded-3xl p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-display text-base text-white">
                  <History size={16} className="text-[#c9a84c]" /> Historial
                </h3>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/40">{versions.length} versiones</span>
              </div>
              {versions.length ? (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {versions.map((version) => {
                    const active = version.id === selectedVersionId
                    return (
                      <div key={version.id} className={`rounded-2xl border p-3 transition ${active ? 'border-[#c9a84c]/35 bg-[#c9a84c]/[0.07]' : 'border-white/7 bg-white/[0.015]'}`}>
                        <button type="button" onClick={() => applyVersion(version)} className="w-full text-left">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-white">{version.label}</span>
                            <span className="shrink-0 text-[10px] text-[#c9a84c]">v{version.version_number}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-white/35">
                            <GitBranch className="h-3 w-3" />
                            <span>{version.generation_kind === 'manual' ? 'Edición confirmada' : version.generation_kind === 'restored' ? 'Restaurada' : version.generation_kind === 'adapted' ? 'Adaptada' : 'General'}</span>
                            <span>·</span>
                            <time>{new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(version.created_at))}</time>
                          </div>
                        </button>
                        {active && versions[0]?.id !== version.id && (
                          <button
                            type="button"
                            onClick={() => restoreVersion(version)}
                            disabled={savingVersion}
                            className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 px-2.5 text-[10px] text-white/55 transition hover:border-[#c9a84c]/30 hover:text-[#e6cf8a] disabled:opacity-40"
                          >
                            <RotateCcw className="h-3 w-3" /> Restaurar como versión nueva
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-xs leading-relaxed text-white/35">
                  Tu primera versión aparecerá después de revisar las evidencias.
                </p>
              )}
            </div>

            <div className="glass-card rounded-3xl p-6">
              <h3 className="mb-4 flex items-center gap-2 font-display text-base text-white">
                <CheckCircle size={16} className="text-[#c9a84c]" /> Ventajas del CV Vivo
              </h3>
              <ul className="space-y-3">
                {[
                  { t: 'ATS-Friendly', d: 'Estructura legible por cualquier software de reclutamiento.' },
                  { t: 'Sin hechos inventados', d: 'Solo utiliza evidencias que vos confirmaste.' },
                  { t: 'Formato Híbrido', d: 'Equilibrio entre diseño premium y funcionalidad.' },
                  { t: 'Versionado', d: 'Cada edición se guarda sin sobrescribir las anteriores.' },
                ].map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a84c]" />
                    <div>
                      <p className="text-sm font-medium text-white">{item.t}</p>
                      <p className="text-xs text-muted-foreground">{item.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {generatedCV && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button onClick={() => setDarkMode(!darkMode)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] py-2.5 text-xs font-medium text-white transition hover:bg-white/[0.05]">
                    {darkMode ? <Sun size={14} /> : <Moon size={14} />}
                    {darkMode ? 'Modo claro' : 'Modo oscuro'}
                  </button>
                  <button onClick={() => { if (!editMode) { setEditableCV(generatedCV); setManualAttested(false) } setEditMode(!editMode) }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] py-2.5 text-xs font-medium text-white transition hover:bg-white/[0.05]">
                    {editMode ? <Eye size={14} /> : <Edit3 size={14} />}
                    {editMode ? 'Vista previa' : 'Editar'}
                  </button>
                </div>
                {editMode && (
                  <div className="rounded-2xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.05] p-3">
                    <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-white/55">
                      <input
                        type="checkbox"
                        checked={manualAttested}
                        onChange={(event) => setManualAttested(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[#c9a84c]"
                      />
                      Confirmo que mis cambios son reales y no agregan métricas, cargos ni experiencia que no pueda respaldar.
                    </label>
                    <button
                      type="button"
                      onClick={saveManualVersion}
                      disabled={!manualAttested || savingVersion || editableCV === selectedVersion?.cv_markdown}
                      className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-xs font-medium text-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingVersion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Guardar como versión nueva
                    </button>
                  </div>
                )}
                <button onClick={downloadPDF}
                  className="inline-flex w-full h-10 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]">
                  <Download size={16} /> Descargar PDF
                </button>
                <button onClick={handleCopy}
                  className="inline-flex w-full h-10 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] text-sm font-medium text-white transition hover:bg-white/[0.05]">
                  <Copy size={16} />{copied ? '¡Copiado!' : 'Copiar texto'}
                </button>
              </div>
            )}
          </div>

          {/* CV Preview */}
          <div className="lg:col-span-2">
            {selectedVersion && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-white/55">
                  <GitBranch className="h-3.5 w-3.5 text-[#c9a84c]" />
                  <span className="font-medium text-white">{selectedVersion.label}</span>
                  <span>· v{selectedVersion.version_number}</span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-300/80">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {(selectedVersion.evidence_snapshot || []).length} evidencias registradas
                </span>
              </div>
            )}
            <div className={`overflow-hidden rounded-2xl border shadow-2xl transition-colors ${darkMode ? 'border-white/5 bg-[#111111]' : 'border-gray-200 bg-white'}`}>
              {editMode ? (
                <textarea
                  value={editableCV}
                  onChange={e => { setEditableCV(e.target.value); setManualAttested(false) }}
                  className={`min-h-[800px] w-full resize-none p-8 font-mono text-sm focus:outline-none ${darkMode ? 'bg-[#111111] text-white' : 'bg-white text-gray-900'}`}
                  placeholder="Editá el markdown de tu CV acá…"
                />
              ) : (
                <div ref={cvRef} className={`min-h-[800px] p-10 font-['Inter',sans-serif] ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {generatedCV ? (
                    <ReactMarkdown
                      components={{
                        h1: ({...props}) => <h1 className={`-mx-10 mb-2 border-b pb-6 pt-8 px-10 text-3xl font-black ${darkMode ? 'border-[#c9a84c]/30 bg-[#0a0a0a] text-white' : 'border-gray-300 bg-gray-50 text-gray-900'}`} {...props} />,
                        h2: ({...props}) => <h2 className={`mb-4 mt-10 border-l-2 border-[#c9a84c] pl-4 text-xs font-bold uppercase tracking-[0.2em] ${darkMode ? 'text-[#c9a84c]' : 'text-[#8a6a1f]'}`} {...props} />,
                        h3: ({...props}) => <h3 className={`mb-1 mt-6 text-base font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`} {...props} />,
                        p: ({...props}) => {
                          const isContact = typeof props.children === 'string' && String(props.children).includes('|')
                          return isContact
                            ? <p className={`-mx-10 -mt-2 mb-8 px-10 pb-4 text-xs font-medium tracking-wide ${darkMode ? 'bg-[#0a0a0a] text-muted-foreground' : 'bg-gray-50 text-gray-500'}`} {...props} />
                            : <p className={`mb-3 text-sm leading-relaxed ${darkMode ? 'text-[#aaaaaa]' : 'text-gray-700'}`} {...props} />
                        },
                        li: ({...props}) => <li className={`relative mb-2 list-none pl-5 text-sm before:absolute before:left-0 before:top-[0.55em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#c9a84c] before:content-[''] ${darkMode ? 'text-[#aaaaaa]' : 'text-gray-700'}`} {...props} />,
                        strong: ({...props}) => <strong className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`} {...props} />,
                      }}
                    >
                      {generatedCV}
                    </ReactMarkdown>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center py-20 text-center opacity-30">
                      <FileText size={64} className="mb-6" />
                      <h3 className={`mb-2 text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Tu CV aparecerá acá</h3>
                      <p className="max-w-xs text-sm">Revisá tus evidencias y creá una versión general o adaptada. Nada se sobrescribe.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <ProductGuide
        storageKey="b2c_cv_vivo_v1"
        label="CV Vivo"
        steps={[
          { title: 'Confirmá tus evidencias', description: 'Revisá cada dato que la IA extrajo de tu perfil. Solo se incluirá en el CV lo que vos confirmés.' },
          { title: 'Elegí una vacante o pegá una', description: 'Seleccioná un empleo de tu lista de matches o pegá cualquier descripción externa para adaptar el CV.' },
          { title: 'Descargalo en PDF', description: 'El CV generado es tuyo. Podés editarlo, guardar versiones y descargarlo cuando quieras.' },
        ]}
      />
    </DashboardLayout>
  )
}
