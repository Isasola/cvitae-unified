import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, Sparkles, CheckCircle, AlertCircle, ArrowRight, Brain, Search, Briefcase } from 'lucide-react'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'

const ANALYZE_URL = 'https://rbrirxbjbmdxflzaxxzp.supabase.co/functions/v1/analyze-cv'

export default function JobMatcher() {
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    auth.getUser().then(setUser)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected && (selected.type === 'application/pdf' || selected.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
      setFile(selected)
      setError(null)
    } else {
      setError('Por favor, subí un archivo PDF o Word (.docx)')
    }
  }

  const handleUpload = async () => {
    if (!file || !user) return
    setAnalyzing(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No autorizado')

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error al analizar el CV')
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">Análisis de Perfil con IA</h1>
          <p className="text-[#888888]">Subí tu CV para que nuestra IA extraiga tus habilidades y encuentre las mejores oportunidades para vos.</p>
        </div>

        {!result ? (
          <GlassCard className="p-12 text-center border-dashed border-2 border-white/10">
            <input type="file" id="cv-upload" className="hidden" onChange={handleFileChange} accept=".pdf,.docx" />
            <label htmlFor="cv-upload" className="cursor-pointer block">
              <div className="w-20 h-20 bg-[#c9a84c]/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-[#c9a84c]/20 transition-all">
                <Upload className="text-[#c9a84c] w-10 h-10" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{file ? file.name : 'Seleccioná tu CV'}</h3>
              <p className="text-[#888888] text-sm mb-6">PDF o Word (Máx. 5MB)</p>
            </label>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm justify-center mb-6">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <GoldButton onClick={handleUpload} disabled={!file || analyzing} className="min-w-[200px]">
              {analyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Sparkles size={18} /> Analizar CV ahora
                </>
              )}
            </GoldButton>
          </GlassCard>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <GlassCard className="bg-[#c9a84c]/5 border-[#c9a84c]/20">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-[#c9a84c] rounded-xl flex items-center justify-center text-[#0a0a0a]">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">¡Análisis completado!</h2>
                  <p className="text-[#888888] text-sm">Hemos actualizado tu perfil profesional.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-xs font-bold text-[#888888] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Brain size={14} className="text-[#c9a84c]" /> Habilidades detectadas
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {result.habilidades?.map((skill: string) => (
                      <Badge key={skill} variant="gold">{skill}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#888888] uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Briefcase size={14} className="text-[#c9a84c]" /> Perfil sugerido
                  </h4>
                  <div className="space-y-3">
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                      <p className="text-xs text-[#888888] mb-1">Título</p>
                      <p className="text-white text-sm font-medium">{result.professional_title}</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                      <p className="text-xs text-[#888888] mb-1">Seniority</p>
                      <p className="text-white text-sm font-medium">{result.seniority}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 flex justify-end gap-4">
                <GoldButton variant="outline" onClick={() => setResult(null)}>Subir otro</GoldButton>
                <GoldButton href="/mi-carrera">Ver matches <ArrowRight size={18} /></GoldButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain className="text-[#c9a84c] w-6 h-6" />
            </div>
            <h4 className="text-white font-medium mb-2">IA Avanzada</h4>
            <p className="text-[#888888] text-xs">Entendemos el contexto de tu experiencia, no solo palabras clave.</p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="text-[#c9a84c] w-6 h-6" />
            </div>
            <h4 className="text-white font-medium mb-2">Búsqueda 24/7</h4>
            <p className="text-[#888888] text-xs">Buscamos oportunidades que encajen con tu nuevo perfil analizado.</p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase className="text-[#c9a84c] w-6 h-6" />
            </div>
            <h4 className="text-white font-medium mb-2">Match Perfecto</h4>
            <p className="text-[#888888] text-xs">Recibí un score de compatibilidad para cada vacante detectada.</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
