import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Zap, Loader2, AlertTriangle, ArrowRight, Lock, CheckCircle, AlertCircle } from 'lucide-react'
import { GlassCard, GoldButton, Badge, MatchArc } from '@/components/cvitae/UI-Elements'
import { TetrisLoader } from '@/components/TetrisLoader'
import { supabase } from '@/lib/supabase'  // ← IMPORTANTE: Asegurate de que esta línea esté

interface AnalysisResult {
  success: boolean
  atsScore?: number
  compatibilityPercentage?: number
  strengths?: string[]
  criticalImprovements?: string[]
  actionPlan?: string[]
  estimatedInterviewChance?: string
  cvOptimizationMessage?: string
  premiumData?: {
    missingKeywords: string[]
    coverLetterSnippet: string
    interviewQuestions: Array<{ question: string; suggestion: string }>
  }
  error?: string
}

export function CVAnalyzer() {
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [results, setResults] = useState<AnalysisResult | null>(null)
  const [extractionStep, setExtractionStep] = useState<'idle' | 'extracting' | 'analyzing'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    if (selectedFile.size > 15 * 1024 * 1024) {
      alert('El archivo es demasiado grande. Máximo 15 MB.')
      return
    }
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
    if (!validTypes.includes(selectedFile.type)) {
      alert('Formato no soportado. Usá PDF o DOCX.')
      return
    }
    setFile(selectedFile)
    setFileName(selectedFile.name)
  }

  const handleAnalyze = async () => {
    if (!file) return
    setIsAnalyzing(true)
    try {
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const base64 = (event.target?.result as string)?.split(',')[1]
          setExtractionStep('extracting')
          const extractResponse = await fetch('/.netlify/functions/extract-pdf-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
          })
          const extractData = await extractResponse.json()
          if (!extractResponse.ok || !extractData.success) throw new Error(extractData.error || 'Error extrayendo texto')

          setExtractionStep('analyzing')
          const response = await fetch('/.netlify/functions/analyze-cv-candidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvText: extractData.text }),
          })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Error analizando CV')

          setResults({ success: true, ...data })
          setHasAnalyzed(true)
        } catch (error: any) {
          setResults({ success: false, error: error.message })
          setHasAnalyzed(true)
        } finally {
          setIsAnalyzing(false)
          setExtractionStep('idle')
        }
      }
      reader.readAsDataURL(file)
    } catch {
      setIsAnalyzing(false)
      setHasAnalyzed(true)
    }
  }

  const getScoreColor = (score: number) => score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="w-full max-w-4xl mx-auto">
      <AnimatePresence mode="wait">
        {!hasAnalyzed ? (
          <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <GlassCard className="text-center p-8 md:p-12">
              <div onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-12 transition-all cursor-pointer ${isAnalyzing ? 'opacity-50 pointer-events-none' : 'border-[#c9a84c]/20 hover:border-[#c9a84c]/50 hover:bg-[#c9a84c]/5'}`}>
                <Upload className="w-12 h-12 text-[#c9a84c] mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{fileName || 'Cargá tu CV para analizar'}</h3>
                <p className="text-[#888888] text-sm">PDF o Word · Máx 15 MB</p>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="hidden" />
              </div>
              {fileName && !isAnalyzing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
                  <GoldButton onClick={handleAnalyze} size="lg" className="w-full">
                    <Zap className="fill-current" /> Analizar mi CV ahora
                  </GoldButton>
                </motion.div>
              )}
              {isAnalyzing && (
                <div className="mt-6">
                  <TetrisLoader size="md" speed="fast" text={extractionStep === 'extracting' ? 'Extrayendo texto...' : 'Analizando con IA...'} />
                </div>
              )}
            </GlassCard>
          </motion.div>
        ) : results?.success ? (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
            <GlassCard>
              <div className="flex flex-col md:flex-row items-center gap-6">
                <MatchArc percentage={results.atsScore || 0} size={100} />
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-2xl font-bold text-white mb-2">Tu Score ATS</h3>
                  <p className="text-[#888888]">
                    {results.atsScore! < 50 ? 'Tu CV necesita mejoras para pasar los filtros automáticos.' :
                     results.atsScore! < 70 ? 'Buen perfil, pero aún podés optimizarlo.' :
                     '¡Excelente! Tu CV está bien preparado.'}
                  </p>
                </div>
              </div>
            </GlassCard>
            <div className="grid md:grid-cols-2 gap-4">
              <GlassCard>
                <h4 className="text-white font-bold mb-3 flex items-center gap-2"><CheckCircle size={16} className="text-green-400" /> Fortalezas</h4>
                <ul className="space-y-2">
                  {results.strengths?.slice(0, 3).map((s, i) => (
                    <li key={i} className="text-sm text-[#888888] flex items-start gap-2"><span className="text-green-400 font-bold">•</span> {s}</li>
                  ))}
                </ul>
              </GlassCard>
              <GlassCard>
                <h4 className="text-white font-bold mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-yellow-400" /> Mejoras urgentes</h4>
                <ul className="space-y-2">
                  {results.criticalImprovements?.slice(0, 3).map((s, i) => (
                    <li key={i} className="text-sm text-[#888888] flex items-start gap-2"><span className="text-yellow-400 font-bold">•</span> {s}</li>
                  ))}
                </ul>
              </GlassCard>
            </div>
            <div className="bg-[#c9a84c]/10 border border-[#c9a84c]/30 rounded-2xl p-6 text-center">
              <h3 className="text-xl font-bold text-white mb-2">¿Querés ver las oportunidades que encajan con tu perfil?</h3>
              <p className="text-[#888888] mb-4">Ingresá tu correo y te mostramos las {1154} vacantes activas que tenemos para vos.</p>
              <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
                <input
                  type="email"
                  placeholder="tu@email.com"
                  id="analyzer-email-input"
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#888888] focus:outline-none focus:border-[#c9a84c]/50"
                />
                <GoldButton onClick={async () => {
                  const email = (document.getElementById('analyzer-email-input') as HTMLInputElement)?.value?.trim();
                  if (!email) return;
                  try {
                    const { error } = await supabase.auth.signInWithOtp({
                      email,
                      options: {
                        shouldCreateUser: true,
                        emailRedirectTo: 'https://cvitae.lat/auth/callback'
                      }
                    });
                    if (error) throw error;
                    alert('✅ Revisá tu correo y hacé clic en el enlace mágico.');
                  } catch (err: any) {
                    alert('Error: ' + err.message);
                  }
                }}>
                  Activar Mi Carrera
                </GoldButton>
              </div>
            </div>
          </motion.div>
        ) : (
          <GlassCard className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Error en el análisis</h3>
            <p className="text-[#888888] mb-4">{results?.error || 'Ocurrió un error inesperado.'}</p>
            <GoldButton variant="ghost" onClick={() => { setHasAnalyzed(false); setResults(null); setFile(null); setFileName('') }}>
              Reintentar
            </GoldButton>
          </GlassCard>
        )}
      </AnimatePresence>
    </div>
  )
}
