import { useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import {
  Download, Copy, RefreshCw, Briefcase, FileText, CheckCircle,
  Sun, Moon, Edit3, Eye, Sparkles, AlertCircle, Loader2, ChevronRight,
} from 'lucide-react'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { GrowthLine } from '@/components/cv/visuals'
import { auth, supabase } from '@/lib/supabase'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const MATCH_BATCH_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/match-batch'
const ease = [0.22, 1, 0.36, 1] as const

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
  const [darkMode, setDarkMode] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const cvRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    auth.getUser().then(setUser)
  }, [])

  useEffect(() => {
    if (user) loadData()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: prof } = await supabase
        .from('user_master_profiles').select('*').eq('user_id', user.id).maybeSingle()
      setProfile(prof)

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(MATCH_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setVacancies(data.matches || [])

      if (prof) {
        const baseRes = await fetch('/.netlify/functions/generate-cv-vivo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: { ...prof, user_id: user.id }, vacancy: null }),
        })
        const baseData = await baseRes.json()
        if (baseData.cv) {
          setGeneratedCV(baseData.cv)
          setEditableCV(baseData.cv)
          setFromCache(baseData.fromCache || false)
        }
      }
    } catch { /* silencioso */ } finally {
      setLoading(false)
    }
  }

  const handleAdaptCV = async () => {
    if (!profile) return
    const vacancyToUse = mode === 'match' ? selectedVacancy : { titulo: 'Vacante Personalizada', cuerpo: customVacancy, id: 'custom' }
    if (!vacancyToUse) return

    setAdapting(true)
    try {
      const res = await fetch('/.netlify/functions/generate-cv-vivo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { ...profile, user_id: user.id }, vacancy: vacancyToUse }),
      })
      const data = await res.json()
      if (data.cv) {
        setGeneratedCV(data.cv)
        setEditableCV(data.cv)
        setFromCache(data.fromCache || false)
        setEditMode(false)
      }
    } catch {
      alert('Error al adaptar el CV. Intentá de nuevo.')
    } finally {
      setAdapting(false)
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
          <p className="text-sm text-muted-foreground">Generando tu CV base…</p>
        </div>
      </DashboardLayout>
    )
  }

  const canAdapt = mode === 'match' ? !!selectedVacancy : customVacancy.trim().length > 20

  return (
    <DashboardLayout>
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
                <span className="text-xs text-[#c9a84c]">Cargado al instante desde caché</span>
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

            <button
              onClick={handleAdaptCV} disabled={!canAdapt || adapting}
              className="inline-flex w-full h-10 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adapting ? <><RefreshCw className="animate-spin" size={16} /> Adaptando…</> : <><Briefcase size={16} /> Adaptar CV</>}
            </button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left panel */}
          <div className="space-y-4 lg:col-span-1">
            <div className="glass-card rounded-3xl p-6">
              <h3 className="mb-4 flex items-center gap-2 font-display text-base text-white">
                <CheckCircle size={16} className="text-[#c9a84c]" /> Ventajas del CV Vivo
              </h3>
              <ul className="space-y-3">
                {[
                  { t: 'ATS-Friendly', d: 'Estructura legible por cualquier software de reclutamiento.' },
                  { t: 'Palabras clave exactas', d: 'La IA usa los términos de la vacante que elegiste.' },
                  { t: 'Formato Híbrido', d: 'Equilibrio entre diseño premium y funcionalidad.' },
                  { t: 'Editable', d: 'Modificá el texto antes de descargar.' },
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
                  <button onClick={() => { if (!editMode) setEditableCV(generatedCV); setEditMode(!editMode) }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] py-2.5 text-xs font-medium text-white transition hover:bg-white/[0.05]">
                    {editMode ? <Eye size={14} /> : <Edit3 size={14} />}
                    {editMode ? 'Vista previa' : 'Editar'}
                  </button>
                </div>
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
            <div className={`overflow-hidden rounded-2xl border shadow-2xl transition-colors ${darkMode ? 'border-white/5 bg-[#111111]' : 'border-gray-200 bg-white'}`}>
              {editMode ? (
                <textarea
                  value={editableCV}
                  onChange={e => { setEditableCV(e.target.value); setGeneratedCV(e.target.value) }}
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
                      <p className="max-w-xs text-sm">Seleccioná una vacante o pegá una descripción y hacé click en "Adaptar CV"</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
