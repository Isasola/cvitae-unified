import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { Download, Copy, RefreshCw, Briefcase, ChevronRight, FileText, CheckCircle } from 'lucide-react'
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
  const [generatedCV, setGeneratedCV] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [loading, setLoading] = useState(false)
  const [adapting, setAdapting] = useState(false)
  const cvRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    auth.getUser().then(setUser)
  }, [])

  useEffect(() => {
    if (user) {
      loadData()
    }
  }, [user])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load Profile
      const { data: prof } = await supabase.from('user_master_profiles').select('*').eq('user_id', user.id).maybeSingle()
      setProfile(prof)

      // Load Vacancies for adaptation
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(MATCH_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setVacancies(data.matches || [])

      // Generar CV base automáticamente si no hay uno
      if (prof && !generatedCV) {
        const baseRes = await fetch('/.netlify/functions/generate-cv-vivo', {
          method: 'POST',
          body: JSON.stringify({ 
            profile: { ...prof, user_id: user.id }, 
            vacancy: null 
          })
        })
        const baseData = await baseRes.json()
        setGeneratedCV(baseData.cv)
        setFromCache(baseData.fromCache || false)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAdaptCV = async () => {
    if (!selectedVacancy || !profile) return
    setAdapting(true)
    setFromCache(false)
    try {
      const res = await fetch('/.netlify/functions/generate-cv-vivo', {
        method: 'POST',
        body: JSON.stringify({ profile: { ...profile, user_id: user.id }, vacancy: selectedVacancy })
      })
      const data = await res.json()
      setGeneratedCV(data.cv)
      setFromCache(data.fromCache || false)
    } catch (err) {
      alert('Error al adaptar el CV')
    } finally {
      setAdapting(false)
    }
  }

  const downloadPDF = async () => {
    if (!cvRef.current) return
    const canvas = await html2canvas(cvRef.current, { scale: 2, backgroundColor: '#111111' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgProps = pdf.getImageProperties(imgData)
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    pdf.save(`CVitae_${profile?.full_name || 'Candidato'}.pdf`)
  }

  const copyMarkdown = () => {
    if (generatedCV) {
      navigator.clipboard.writeText(generatedCV)
      alert('CV copiado al portapapeles')
    }
  }

  if (loading) return <DashboardLayout><div className="py-20 text-center text-[#888888]">Cargando tu CV Vivo...</div></DashboardLayout>

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              CV Vivo <span className="text-[#c9a84c] text-sm font-normal ml-2 tracking-widest uppercase">Híbrido ATS</span>
              {fromCache && (
                <Badge variant="gold" className="ml-3 text-[10px] animate-pulse">⚡ Cargado al instante</Badge>
              )}
            </h1>
            <p className="text-[#888888] text-sm">Tu currículum que respira, se adapta y evoluciona con cada vacante.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <select 
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#c9a84c]/50 max-w-[240px]"
              onChange={(e) => setSelectedVacancy(vacancies.find(v => v.id === e.target.value))}
            >
              <option value="">Seleccioná una vacante...</option>
              {vacancies.map(v => (
                <option key={v.id} value={v.id}>
                  {v.tipo === 'oportunidad' ? '💼' : v.tipo === 'beca' ? '🎓' : v.tipo === 'blog' ? '📝' : '📌'} {v.titulo} ({v.finalScore}%)
                </option>
              ))}
            </select>
            <GoldButton onClick={handleAdaptCV} disabled={!selectedVacancy || adapting} size="sm">
              {adapting ? <RefreshCw className="animate-spin" size={16} /> : <Briefcase size={16} />}
              Adaptar CV
            </GoldButton>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Controls & Info */}
          <div className="lg:col-span-1 space-y-6">
            <GlassCard className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2"><CheckCircle size={18} className="text-[#c9a84c]" /> Ventajas del CV Vivo</h3>
              <ul className="space-y-4">
                {[
                  { t: 'Optimización ATS', d: 'Estructura 100% legible por software de reclutamiento.' },
                  { t: 'Adaptación de IA', d: 'Usa las palabras clave exactas de la vacante elegida.' },
                  { t: 'Formato Híbrido', d: 'Equilibrio perfecto entre diseño premium y funcionalidad.' }
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
                <GoldButton onClick={downloadPDF} className="w-full">
                  <Download size={18} /> Descargar PDF Premium
                </GoldButton>
                <button onClick={copyMarkdown} className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                  <Copy size={18} /> Copiar Markdown
                </button>
              </div>
            )}
          </div>

          {/* CV Preview */}
          <div className="lg:col-span-2">
            <div className="bg-[#111111] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
              <div ref={cvRef} className="p-12 min-h-[800px] font-['Inter',sans-serif] text-white selection:bg-[#c9a84c]/30">
                {generatedCV ? (
                  <div className="cv-content prose prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        h1: ({node, ...props}) => <h1 className="text-4xl font-black text-white mb-2 bg-[#0a0a0a] -mx-12 px-12 py-8 border-b border-[#c9a84c]/30" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-[#c9a84c] text-sm font-bold uppercase tracking-[0.2em] mt-10 mb-4 border-l-2 border-[#c9a84c] pl-4" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-white text-lg font-bold mt-6 mb-1" {...props} />,
                        p: ({node, ...props}) => {
                          const isHeader = typeof props.children === 'string' && props.children.includes('|')
                          return isHeader ? 
                            <p className="text-[#888888] text-xs font-medium tracking-wide mb-8 -mt-2 bg-[#0a0a0a] -mx-12 px-12 pb-6" {...props} /> :
                            <p className="text-[#aaaaaa] text-sm leading-relaxed mb-4" {...props} />
                        },
                        li: ({node, ...props}) => <li className="text-[#aaaaaa] text-sm mb-2 list-none relative pl-5 before:content-[''] before:absolute before:left-0 before:top-[0.6em] before:w-1.5 before:h-1.5 before:bg-[#c9a84c] before:rounded-full" {...props} />,
                        strong: ({node, ...props}) => <strong className="text-white font-semibold" {...props} />
                      }}
                    >
                      {generatedCV}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-20 text-center opacity-30">
                    <FileText size={64} className="mb-6" />
                    <h3 className="text-xl font-bold mb-2">Previsualización de tu CV</h3>
                    <p className="max-w-xs text-sm">Seleccioná una vacante arriba y hacé click en "Adaptar CV" para generar tu versión optimizada.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
