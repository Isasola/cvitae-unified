import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { Download, Copy, RefreshCw, Briefcase, FileText, CheckCircle, Sun, Moon, Edit3, Eye } from 'lucide-react'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const MATCH_BATCH_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/match-batch'

export default function CVVivo() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [vacancies, setVacancies] = useState<any[]>([])
  const [selectedVacancy, setSelectedVacancy] = useState<any>(null)
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
        .from('user_master_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      setProfile(prof)

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(MATCH_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setVacancies(data.matches || [])

      // Generar CV base automáticamente
      if (prof) {
        const baseRes = await fetch('/.netlify/functions/generate-cv-vivo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: { ...prof, user_id: user.id }, vacancy: null }),
        })
        const baseData = await baseRes.json()
        if (baseData.cv) {
          setGeneratedCV(baseData.cv)
          setEditableCV(baseData.cv)
          setFromCache(baseData.fromCache || false)
        }
      }
    } catch (err) {
      console.error('Error cargando CV Vivo:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAdaptCV = async () => {
    if (!selectedVacancy || !profile) return
    setAdapting(true)
    try {
      const res = await fetch('/.netlify/functions/generate-cv-vivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { ...profile, user_id: user.id }, vacancy: selectedVacancy }),
      })
      const data = await res.json()
      if (data.cv) {
        setGeneratedCV(data.cv)
        setEditableCV(data.cv)
        setFromCache(data.fromCache || false)
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
      useCORS: true,
      logging: false,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    })
    el.style.maxHeight = prevMaxHeight

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfW = pdf.internal.pageSize.getWidth()
    const pdfH = pdf.internal.pageSize.getHeight()
    const ratio = canvas.width / pdfW
    const totalH = canvas.height / ratio

    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, totalH)
    let remaining = totalH - pdfH
    let page = 1
    while (remaining > 0) {
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, -(pdfH * page), pdfW, totalH)
      remaining -= pdfH
      page++
    }

    pdf.save(`CVitae_${profile?.full_name || 'Candidato'}_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  const handleCopy = () => {
    const text = editMode ? editableCV : generatedCV
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentCV = editMode ? editableCV : generatedCV

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="w-10 h-10 border-2 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#888888] text-sm">Generando tu CV base...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              CV Vivo{' '}
              <span className="text-[#c9a84c] text-sm font-normal ml-2 tracking-widest uppercase">Híbrido ATS</span>
            </h1>
            <p className="text-[#888888] text-sm">
              💡 La IA mejora el <strong className="text-white">contenido y las palabras</strong> para pasar filtros ATS. El diseño final es tuyo.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c9a84c]/50 max-w-[220px]"
              onChange={e => setSelectedVacancy(vacancies.find(v => v.id === e.target.value) || null)}
            >
              <option value="">Seleccioná una vacante...</option>
              {vacancies.map(v => (
                <option key={v.id} value={v.id}>
                  {v.tipo === 'oportunidad' ? '💼' : v.tipo === 'beca' ? '🎓' : v.tipo === 'blog' ? '📝' : '📌'}{' '}
                  {v.titulo} ({v.finalScore}%)
                </option>
              ))}
            </select>
            <GoldButton onClick={handleAdaptCV} disabled={!selectedVacancy || adapting} size="sm">
              {adapting ? <RefreshCw className="animate-spin" size={16} /> : <Briefcase size={16} />}
              {adapting ? 'Adaptando...' : 'Adaptar CV'}
            </GoldButton>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Panel izquierdo */}
          <div className="lg:col-span-1 space-y-4">
            <GlassCard>
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <CheckCircle size={18} className="text-[#c9a84c]" /> Ventajas del CV Vivo
              </h3>
              <ul className="space-y-3">
                {[
                  { t: 'ATS-Friendly', d: 'Estructura legible por cualquier software de reclutamiento.' },
                  { t: 'Palabras clave exactas', d: 'La IA usa los términos de la vacante que elegiste.' },
                  { t: 'Formato Híbrido', d: 'Equilibrio entre diseño premium y funcionalidad.' },
                  { t: 'Editable', d: 'Modificá el texto antes de descargar.' },
                ].map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#c9a84c] mt-1.5 shrink-0" />
                    <div>
                      <p className="text-white text-sm font-medium">{item.t}</p>
                      <p className="text-[#555555] text-xs">{item.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </GlassCard>

            {generatedCV && (
              <div className="space-y-3">
                {fromCache && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#c9a84c]/10 border border-[#c9a84c]/20 rounded-xl">
                    <span className="text-[#c9a84c] text-xs">⚡ Cargado al instante desde caché</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-medium hover:bg-white/10 transition-all"
                  >
                    {darkMode ? <Sun size={14} /> : <Moon size={14} />}
                    {darkMode ? 'Modo claro' : 'Modo oscuro'}
                  </button>
                  <button
                    onClick={() => {
                      if (!editMode) setEditableCV(generatedCV)
                      setEditMode(!editMode)
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-medium hover:bg-white/10 transition-all"
                  >
                    {editMode ? <Eye size={14} /> : <Edit3 size={14} />}
                    {editMode ? 'Vista previa' : 'Editar'}
                  </button>
                </div>
                <GoldButton onClick={downloadPDF} className="w-full">
                  <Download size={18} /> Descargar PDF
                </GoldButton>
                <button
                  onClick={handleCopy}
                  className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <Copy size={18} /> {copied ? '¡Copiado!' : 'Copiar texto'}
                </button>
              </div>
            )}
          </div>

          {/* CV Preview */}
          <div className="lg:col-span-2">
            <div className={`rounded-2xl border overflow-hidden shadow-2xl transition-colors ${darkMode ? 'bg-[#111111] border-white/5' : 'bg-white border-gray-200'}`}>
              {editMode ? (
                <textarea
                  value={editableCV}
                  onChange={e => {
                    setEditableCV(e.target.value)
                    setGeneratedCV(e.target.value)
                  }}
                  className={`w-full p-8 min-h-[800px] font-mono text-sm resize-none focus:outline-none ${darkMode ? 'bg-[#111111] text-white' : 'bg-white text-gray-900'}`}
                  placeholder="Editá el markdown de tu CV acá..."
                />
              ) : (
                <div
                  ref={cvRef}
                  className={`p-10 min-h-[800px] font-['Inter',sans-serif] ${darkMode ? 'text-white' : 'text-gray-900'}`}
                >
                  {generatedCV ? (
                    <ReactMarkdown
                      components={{
                        h1: ({...props}) => (
                          <h1 className={`text-3xl font-black mb-2 pb-6 pt-8 -mx-10 px-10 border-b ${darkMode ? 'text-white bg-[#0a0a0a] border-[#c9a84c]/30' : 'text-gray-900 bg-gray-50 border-gray-300'}`} {...props} />
                        ),
                        h2: ({...props}) => (
                          <h2 className={`text-xs font-bold uppercase tracking-[0.2em] mt-10 mb-4 pl-4 border-l-2 border-[#c9a84c] ${darkMode ? 'text-[#c9a84c]' : 'text-[#8a6a1f]'}`} {...props} />
                        ),
                        h3: ({...props}) => (
                          <h3 className={`text-base font-bold mt-6 mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`} {...props} />
                        ),
                        p: ({...props}) => {
                          const isContact = typeof props.children === 'string' && String(props.children).includes('|')
                          return isContact
                            ? <p className={`text-xs font-medium tracking-wide mb-8 -mt-2 -mx-10 px-10 pb-4 ${darkMode ? 'text-[#888888] bg-[#0a0a0a]' : 'text-gray-500 bg-gray-50'}`} {...props} />
                            : <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-[#aaaaaa]' : 'text-gray-700'}`} {...props} />
                        },
                        li: ({...props}) => (
                          <li className={`text-sm mb-2 list-none relative pl-5 before:content-[''] before:absolute before:left-0 before:top-[0.55em] before:w-1.5 before:h-1.5 before:bg-[#c9a84c] before:rounded-full ${darkMode ? 'text-[#aaaaaa]' : 'text-gray-700'}`} {...props} />
                        ),
                        strong: ({...props}) => (
                          <strong className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`} {...props} />
                        ),
                      }}
                    >
                      {generatedCV}
                    </ReactMarkdown>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-20 text-center opacity-30">
                      <FileText size={64} className="mb-6" />
                      <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Tu CV aparecerá acá
                      </h3>
                      <p className="max-w-xs text-sm">
                        Seleccioná una vacante y hacé click en "Adaptar CV"
                      </p>
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
