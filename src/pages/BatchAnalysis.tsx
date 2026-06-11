import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Upload, FileText, CheckCircle2, XCircle, 
  ChevronRight, RotateCcw, Brain, 
  Star, LogOut, Loader2, History,
  Filter, ChevronDown, ChevronUp, Users, Sparkles,
  ArrowLeft, Building2, Briefcase, Trash2
} from 'lucide-react'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { DotGrid } from '@/components/cvitae/Particles'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'
import { useLocation } from 'wouter'

// --- Tipos ---
interface BatchCandidate {
  id: string
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
        resolve(data.text || '')
      } catch {
        reject(new Error('Error extrayendo texto'))
      }
    }
    reader.readAsArrayBuffer(file)
  })
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const s = localStorage.getItem('recruiter_session')
    if (!s) setLocation('/reclutadores')
    else setSession(JSON.parse(s))
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newCandidates = files.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      status: 'pending' as const
    }))
    setCandidates(prev => [...prev, ...newCandidates])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeCandidate = (id: string) => {
    setCandidates(prev => prev.filter(c => c.id !== id))
  }

  const startAnalysis = async () => {
    if (!jobTitle.trim()) { setError('Ingresá el nombre del puesto'); return }
    if (candidates.length < 2) { setError('Subí al menos 2 CVs'); return }
    
    setIsProcessing(true)
    setError('')
    setSummary(null)

    const updated = [...candidates]
    
    try {
      // 1. Extracción y Análisis Individual
      for (let i = 0; i < updated.length; i++) {
        const c = updated[i]
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
            jobDescription: jobDesc
          })
        })
        const result = await res.json()
        
        // Guardar en DB (opcional, pero recomendado para créditos)
        await fetch('/.netlify/functions/validate-recruiter-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: session.token,
            action: 'save_analysis',
            analysisData: {
              candidate_name: result.candidateName || c.file.name,
              file_name: c.file.name,
              ats_score: result.fitScore, // Usamos fitScore como score principal en batch
              strengths: result.strengths,
              critical_improvements: result.criticalImprovements,
              vacancy_label: jobTitle,
              raw_cv_text: text
            }
          })
        })

        setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, status: 'done', result } : x))
        updated[i] = { ...updated[i], status: 'done', result }
      }

      // 2. Resumen Comparativo Final
      const processedCandidates = updated.filter(c => c.status === 'done').map(c => ({
        name: c.result.candidateName || c.file.name,
        fitScore: c.result.fitScore,
        atsScore: c.result.atsScore,
        recommendation: c.result.recommendation,
        summary: c.result.summary,
        keyMatches: c.result.keyMatches,
        keyGaps: c.result.keyGaps
      }))

      const compRes = await fetch('/.netlify/functions/compare-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'batch_summary',
          jobTitle,
          jobDescription: jobDesc,
          candidates: processedCandidates,
          topN: 3
        })
      })
      const finalSummary = await compRes.json()
      setSummary(finalSummary)

    } catch (err: any) {
      setError('Ocurrió un error durante el procesamiento masivo.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <DotGrid />
      
      <main className="container mx-auto max-w-5xl px-4 py-24 relative z-10">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => setLocation('/reclutadores')} className="flex items-center gap-2 text-[#888888] hover:text-white transition-colors">
            <ArrowLeft size={20} /> Volver al panel
          </button>
          <div className="text-right">
            <p className="text-[#c9a84c] font-bold">{session?.company_name || 'Empresa'}</p>
            <p className="text-xs text-[#555555]">Créditos: {session?.balance || 0}</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Configuración del Puesto */}
          <div className="lg:col-span-1 space-y-6">
            <GlassCard>
              <h2 className="text-white font-bold mb-4 flex items-center gap-2">
                <Briefcase size={18} className="text-[#c9a84c]" /> Configuración
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#888888] mb-1.5 uppercase tracking-wider">Nombre del Puesto *</label>
                  <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                    placeholder="Ej: Desarrollador Fullstack Senior"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#333] focus:outline-none focus:border-[#c9a84c]/50 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-[#888888] mb-1.5 uppercase tracking-wider">Descripción / Requisitos</label>
                  <textarea value={jobDesc} onChange={e => setJobDesc(e.target.value)}
                    placeholder="Pegá los requisitos clave para un mejor análisis..."
                    className="w-full h-32 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#333] focus:outline-none focus:border-[#c9a84c]/50 text-sm resize-none" />
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <h2 className="text-white font-bold mb-4 flex items-center gap-2">
                <Upload size={18} className="text-[#c9a84c]" /> Subir CVs
              </h2>
              <input type="file" multiple accept=".pdf,.txt" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} 
                className="w-full py-8 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-[#c9a84c]/30 hover:bg-[#c9a84c]/5 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="text-[#c9a84c]" size={24} />
                </div>
                <p className="text-sm text-[#888888]">Seleccioná múltiples PDFs</p>
              </button>
              
              <div className="mt-6 space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {candidates.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText size={16} className="text-[#c9a84c] shrink-0" />
                      <span className="text-xs text-white truncate">{c.file.name}</span>
                    </div>
                    <button onClick={() => removeCandidate(c.id)} className="text-[#555] hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {candidates.length > 0 && !isProcessing && (
                <GoldButton onClick={startAnalysis} className="w-full mt-6" size="lg">
                  <Brain size={18} /> Analizar {candidates.length} CVs
                </GoldButton>
              )}
            </GlassCard>
          </div>

          {/* Resultados y Comparación */}
          <div className="lg:col-span-2 space-y-6">
            {isProcessing && (
              <GlassCard className="py-20 text-center">
                <Loader2 className="w-12 h-12 text-[#c9a84c] animate-spin mx-auto mb-6" />
                <h3 className="text-xl font-bold text-white mb-2">Procesando Candidatos</h3>
                <p className="text-[#888888] max-w-xs mx-auto">Nuestra IA está leyendo y evaluando cada CV. Esto puede demorar un minuto.</p>
                <div className="mt-8 flex justify-center gap-2">
                  {candidates.map(c => (
                    <div key={c.id} className={`w-2 h-2 rounded-full ${
                      c.status === 'done' ? 'bg-emerald-500' : 
                      c.status === 'pending' ? 'bg-white/10' : 'bg-[#c9a84c] animate-pulse'
                    }`} />
                  ))}
                </div>
              </GlassCard>
            )}

            {summary && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <GlassCard className="bg-gradient-to-br from-[#c9a84c]/20 to-transparent border-[#c9a84c]/30">
                  <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                    <Sparkles className="text-[#c9a84c]" /> Veredicto de la IA
                  </h2>
                  <div className="space-y-4">
                    <div className="p-4 bg-white/5 rounded-2xl">
                      <p className="text-[#c9a84c] text-xs font-bold uppercase tracking-widest mb-2">Recomendación Final</p>
                      <p className="text-white text-lg leading-relaxed">{summary.finalRecommendation}</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl">
                      <p className="text-[#888888] text-xs font-bold uppercase tracking-widest mb-2">Diagnóstico del Pool</p>
                      <p className="text-white/80 leading-relaxed">{summary.hiringInsight}</p>
                    </div>
                  </div>
                </GlassCard>

                <div className="grid md:grid-cols-2 gap-4">
                  <GlassCard>
                    <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Users size={18} className="text-[#c9a84c]" /> Orden de Entrevista</h3>
                    <div className="space-y-3">
                      {summary.interviewOrder.map((name, i) => (
                        <div key={i} className="flex items-center gap-4 p-3 bg-white/5 rounded-xl">
                          <span className="w-6 h-6 rounded-full bg-[#c9a84c] flex items-center justify-center text-[#0a0a0a] font-bold text-xs">{i+1}</span>
                          <span className="text-white font-medium">{name}</span>
                        </div>
                      ))}
                    </div>
                  </GlassCard>

                  <div className="space-y-4">
                    {candidates.filter(c => c.status === 'done').sort((a,b) => (b.result?.fitScore || 0) - (a.result?.fitScore || 0)).slice(0, 3).map((c, i) => (
                      <div key={c.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-white font-bold">{c.result.candidateName || c.file.name}</p>
                          <p className="text-xs text-[#888888]">{c.result.recommendation}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-[#c9a84c]">{c.result.fitScore}%</p>
                          <p className="text-[10px] text-[#555] uppercase">Fit Score</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {!isProcessing && !summary && candidates.length === 0 && (
              <div className="py-20 text-center opacity-30">
                <Brain size={60} className="mx-auto mb-4" />
                <p>Esperando configuración y archivos...</p>
              </div>
            )}

            {!isProcessing && candidates.some(c => c.status === 'done') && (
               <div className="space-y-4">
                 <h3 className="text-white font-bold flex items-center gap-2"><History size={18} /> Detalle de Candidatos</h3>
                 <div className="grid md:grid-cols-2 gap-4">
                   {candidates.filter(c => c.status === 'done').map(c => (
                     <GlassCard key={c.id} className="text-sm">
                       <div className="flex justify-between items-start mb-3">
                         <p className="text-white font-bold truncate pr-2">{c.result.candidateName || c.file.name}</p>
                         <Badge variant="gold">{c.result.fitScore}%</Badge>
                       </div>
                       <p className="text-[#888888] text-xs line-clamp-3 mb-4">{c.result.summary}</p>
                       <div className="flex flex-wrap gap-1">
                         {c.result.keyMatches?.slice(0, 3).map((s: string, i: number) => (
                           <span key={i} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[10px]">{s}</span>
                         ))}
                       </div>
                     </GlassCard>
                   ))}
                 </div>
               </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
