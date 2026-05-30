import { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Plus, X, CheckCircle, ChevronRight, ChevronLeft, Upload } from 'lucide-react'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const STEPS = ['Datos personales', 'Skills y experiencia', 'Qué buscás', 'Revisión']
const SKILLS = ['Marketing Digital', 'SEO', 'SEM', 'Google Ads', 'Facebook Ads', 'Content Marketing', 'Email Marketing', 'Analytics', 'Data Analysis', 'Social Media', 'Copywriting', 'Branding', 'JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'Excel Avanzado', 'Gestión de Proyectos', 'Scrum', 'Liderazgo', 'Ventas', 'Negociación', 'Atención al Cliente', 'Logística', 'Contabilidad', 'RRHH', 'Diseño Gráfico', 'Inglés', 'Portugués']
const SENIORITY = ['Junior', 'Semi-Senior', 'Senior', 'Lead', 'Director']
const MODALITIES = ['Presencial', 'Híbrido', 'Remoto']

const SUMMARY_EXAMPLES = [
  'Desarrollador Full Stack con 3 años de experiencia en React y Node.js. Especializado en aplicaciones web escalables y trabajo en equipo ágil.',
  'Profesional de Marketing Digital con foco en SEO y campañas de Google Ads. Logré aumentar el tráfico orgánico un 40% en mi último proyecto.',
  'Contador con experiencia en pymes paraguayas, manejo de impuestos SET y facturación electrónica. Busco rol en empresa en crecimiento.',
]

export default function ProfileBuilder() {
  const [, setLocation] = useLocation()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [existingProfileId, setExistingProfileId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    full_name: '',
    professional_title: '',
    location: '',
    seniority: 'Junior',
    summary: '',
    modality: '',
    skills: [] as string[],
    cursos: [] as string[],
  })
  const [newCurso, setNewCurso] = useState('')
  const [newSkill, setNewSkill] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  // Auth con loading state — evita pantalla negra
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      setAuthLoading(false)
    })
    const subscription = auth.onAuthStateChange((user) => {
      setUser(user)
      setAuthLoading(false)
    })
    return () => { subscription?.unsubscribe() }
  }, [])

  // Cargar perfil existente
  useEffect(() => {
    if (!user) return
    supabase
      .from('user_master_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingProfileId(data.id)
          setFormData({
            full_name: data.full_name || '',
            professional_title: data.professional_title || '',
            location: data.profile_data?.location || '',
            seniority: data.profile_data?.seniority || 'Junior',
            summary: data.summary || '',
            modality: data.profile_data?.modality || '',
            skills: data.profile_data?.habilidades || [],
            cursos: data.profile_data?.cursos || [],
          })
        }
      })
  }, [user])

  const handleCVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      let text = ''
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const reader = new FileReader()
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const res = await fetch('/.netlify/functions/extract-pdf-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64 }),
        })
        if (!res.ok) throw new Error('Error extrayendo texto del PDF')
        const data = await res.json()
        text = data.text || ''
      } else if (file.name.endsWith('.docx')) {
        const mammoth = await import('mammoth')
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        text = result.value
      }

      if (!text || text.trim().length < 50) {
        throw new Error('No pudimos leer el contenido del archivo. Intentá con otro PDF o completá manualmente.')
      }

      const analyzeRes = await fetch('/.netlify/functions/analyze-cv-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: text, mode: 'extract' }),
      })
      if (!analyzeRes.ok) throw new Error('Error analizando el CV')
      const extracted = await analyzeRes.json()

      setFormData(prev => ({
        ...prev,
        full_name: extracted.full_name || prev.full_name,
        professional_title: extracted.professional_title || prev.professional_title,
        location: extracted.location || prev.location,
        seniority: extracted.seniority || prev.seniority,
        summary: extracted.experience?.[0]?.achievements?.join('. ') || prev.summary,
        skills: extracted.skills?.length > 0 ? extracted.skills : prev.skills,
        cursos: extracted.education?.map((e: any) => `${e.degree} — ${e.institution}`).filter(Boolean) || prev.cursos,
      }))
    } catch (err: any) {
      setAnalyzeError(err.message || 'No pudimos autocompletar. Completá manualmente.')
    } finally {
      setAnalyzing(false)
    }
  }

  const addSkill = () => {
    if (newSkill.trim() && !formData.skills.includes(newSkill.trim())) {
      setFormData(prev => ({ ...prev, skills: [...prev.skills, newSkill.trim()] }))
      setNewSkill('')
    }
  }

  const removeSkill = (skill: string) => setFormData(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))

  const addCurso = () => {
    if (newCurso.trim() && !formData.cursos.includes(newCurso.trim())) {
      setFormData(prev => ({ ...prev, cursos: [...prev.cursos, newCurso.trim()] }))
      setNewCurso('')
    }
  }

  const removeCurso = (curso: string) => setFormData(prev => ({ ...prev, cursos: prev.cursos.filter(c => c !== curso) }))

  const toggleSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill) ? prev.skills.filter(s => s !== skill) : [...prev.skills, skill],
    }))
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const payload = {
        user_id: user.id,
        full_name: formData.full_name,
        professional_title: formData.professional_title,
        summary: formData.summary,
        profile_data: {
          habilidades: formData.skills,
          cursos: formData.cursos,
          seniority: formData.seniority,
          location: formData.location,
          modality: formData.modality,
        },
      }
      const { error } = existingProfileId
        ? await supabase.from('user_master_profiles').update(payload).eq('id', existingProfileId)
        : await supabase.from('user_master_profiles').insert(payload)
      if (error) throw error
      setSaved(true)
      setTimeout(() => setLocation('/mi-carrera'), 1500)
    } catch {
      alert('Error al guardar el perfil. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  // Loading state — evita pantalla negra
  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-32">
          <div className="w-8 h-8 border-2 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-[#888888] mb-4">Necesitás iniciar sesión para editar tu perfil.</p>
          <GoldButton onClick={() => setLocation('/')}>Ir al inicio</GoldButton>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setLocation('/mi-carrera')} className="flex items-center gap-2 text-[#888888] hover:text-white transition-colors">
              <ArrowLeft size={18} /> Volver
            </button>
            <span className="text-sm text-[#888888]">Paso {step + 1} de {STEPS.length}</span>
          </div>

          <div className="w-full h-1 bg-white/10 rounded-full mb-8">
            <motion.div
              className="h-full bg-[#c9a84c] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <h1 className="text-2xl font-bold text-white mb-6">{STEPS[step]}</h1>

          {/* Upload CV — solo en paso 0 */}
          {step === 0 && (
            <div className="mb-6">
              <label className={cn(
                'flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all cursor-pointer',
                analyzing ? 'border-[#c9a84c] bg-[#c9a84c]/5' : 'border-[#c9a84c]/30 hover:border-[#c9a84c] hover:bg-[#c9a84c]/5 bg-white/5'
              )}>
                {analyzing ? (
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-2 border-[#c9a84c] border-t-transparent rounded-full animate-spin mb-3" />
                    <span className="text-white font-medium">Analizando tu CV con IA...</span>
                    <span className="text-[#888888] text-xs mt-1">Esto tarda unos segundos</span>
                  </div>
                ) : (
                  <>
                    <Upload className="text-[#c9a84c] mb-3" size={32} />
                    <span className="text-white font-bold">Subir mi CV y autocompletar</span>
                    <span className="text-[#888888] text-xs mt-1">PDF o DOCX — la IA completa el formulario por vos</span>
                  </>
                )}
                <input type="file" className="hidden" accept=".pdf,.docx" onChange={handleCVUpload} disabled={analyzing} />
              </label>
              {analyzeError && (
                <p className="text-red-400 text-sm mt-3 text-center">{analyzeError}</p>
              )}
              <div className="flex items-center gap-4 my-6">
                <div className="h-px bg-white/10 flex-1" />
                <span className="text-[10px] text-[#555555] uppercase tracking-widest">o completá manualmente</span>
                <div className="h-px bg-white/10 flex-1" />
              </div>
            </div>
          )}

          <GlassCard>
            {step === 0 && (
              <div className="space-y-4">
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={e => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Nombre completo — ej: María González"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#555555] focus:outline-none focus:border-[#c9a84c]/50"
                />
                <input
                  type="text"
                  value={formData.professional_title}
                  onChange={e => setFormData(prev => ({ ...prev, professional_title: e.target.value }))}
                  placeholder="Título profesional — ej: Marketing Specialist | Desarrollador Full Stack"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#555555] focus:outline-none focus:border-[#c9a84c]/50"
                />
                <div>
                  <textarea
                    value={formData.summary}
                    onChange={e => setFormData(prev => ({ ...prev, summary: e.target.value }))}
                    placeholder="Breve resumen profesional — contá quién sos, qué hacés y qué buscás..."
                    rows={4}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#555555] focus:outline-none focus:border-[#c9a84c]/50"
                  />
                  <div className="mt-3">
                    <p className="text-xs text-[#555555] mb-2 uppercase tracking-widest">Ejemplos para inspirarte:</p>
                    <div className="space-y-2">
                      {SUMMARY_EXAMPLES.map((example, i) => (
                        <button
                          key={i}
                          onClick={() => setFormData(prev => ({ ...prev, summary: example }))}
                          className="w-full text-left px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-[#888888] hover:border-[#c9a84c]/30 hover:text-white transition-all"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <label className="text-sm text-[#888888] mb-3 block">Tus habilidades</label>
                  <div className="flex flex-wrap gap-2 mb-4 min-h-[40px]">
                    {formData.skills.map(skill => (
                      <Badge key={skill} variant="gold" className="gap-2">
                        {skill} <X size={12} className="cursor-pointer hover:text-red-400" onClick={() => removeSkill(skill)} />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSkill}
                      onChange={e => setNewSkill(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addSkill()}
                      placeholder="Agregar habilidad..."
                      className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-[#c9a84c]/50"
                    />
                    <button onClick={addSkill} className="p-2 bg-[#c9a84c] text-[#0a0a0a] rounded-lg hover:bg-[#e8c97a] transition-colors">
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#555555] uppercase tracking-widest mb-3 block">Sugerencias populares</label>
                  <div className="flex flex-wrap gap-2">
                    {SKILLS.filter(s => !formData.skills.includes(s)).slice(0, 15).map(skill => (
                      <button
                        key={skill}
                        onClick={() => toggleSkill(skill)}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400 hover:border-[#c9a84c]/50 hover:text-white transition-all"
                      >
                        + {skill}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pt-4 border-t border-white/5">
                  <label className="text-sm text-[#888888] mb-3 block">Cursos y certificaciones</label>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {formData.cursos.map(curso => (
                      <Badge key={curso} variant="muted" className="gap-2 bg-white/5 text-white">
                        {curso} <X size={12} className="cursor-pointer hover:text-red-400" onClick={() => removeCurso(curso)} />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCurso}
                      onChange={e => setNewCurso(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCurso()}
                      placeholder="Ej: Certificación Google Ads..."
                      className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-[#c9a84c]/50"
                    />
                    <button onClick={addCurso} className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all">
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <label className="text-sm text-[#888888] mb-3 block">Seniority actual</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {SENIORITY.map(s => (
                      <button
                        key={s}
                        onClick={() => setFormData(prev => ({ ...prev, seniority: s }))}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm border transition-all',
                          formData.seniority === s
                            ? 'bg-[#c9a84c]/10 border-[#c9a84c] text-[#c9a84c]'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[#888888] mb-3 block">Modalidad preferida</label>
                  <div className="grid grid-cols-3 gap-2">
                    {MODALITIES.map(m => (
                      <button
                        key={m}
                        onClick={() => setFormData(prev => ({ ...prev, modality: m }))}
                        className={cn(
                          'px-4 py-2 rounded-lg text-sm border transition-all',
                          formData.modality === m
                            ? 'bg-[#c9a84c]/10 border-[#c9a84c] text-[#c9a84c]'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[#888888] mb-3 block">Ubicación</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="Ciudad/País de residencia"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#555555] focus:outline-none focus:border-[#c9a84c]/50"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white">{formData.full_name || 'Sin nombre'}</h3>
                      <p className="text-[#c9a84c] text-sm font-medium">{formData.professional_title || 'Sin título'}</p>
                    </div>
                    <Badge variant="gold">{formData.seniority}</Badge>
                  </div>
                  <p className="text-[#888888] text-sm leading-relaxed mb-6">{formData.summary || 'Sin resumen'}</p>
                  <div className="flex flex-wrap gap-2">
                    {formData.skills.map(s => <Badge key={s} variant="muted" className="text-[10px]">{s}</Badge>)}
                  </div>
                </div>
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <p className="text-blue-200 text-xs flex items-center gap-2">
                    <CheckCircle size={14} />
                    Al guardar, usaremos esta información para encontrarte las mejores oportunidades en Paraguay.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/5">
              <button
                onClick={() => setStep(prev => Math.max(0, prev - 1))}
                className={cn(
                  'flex items-center gap-2 text-[#888888] hover:text-white transition-colors',
                  step === 0 && 'invisible'
                )}
              >
                <ChevronLeft size={18} /> Anterior
              </button>

              {step < STEPS.length - 1 ? (
                <GoldButton onClick={() => setStep(prev => prev + 1)}>
                  Siguiente <ChevronRight size={18} />
                </GoldButton>
              ) : (
                <GoldButton onClick={handleSave} disabled={saving || saved}>
                  {saving ? 'Guardando...' : saved ? '¡Perfil guardado!' : 'Finalizar y ver matches'}
                  {!saving && !saved && <Save size={18} />}
                </GoldButton>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </DashboardLayout>
  )
}
