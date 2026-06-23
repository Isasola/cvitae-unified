import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Save, Plus, X, CheckCircle, ChevronRight, ChevronLeft,
  Upload, Loader2, Brain,
} from 'lucide-react'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { GrowthLine } from '@/components/cv/visuals'
import { auth, supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { analytics } from '@/lib/analytics'

const ease = [0.22, 1, 0.36, 1] as const

const STEPS = ['Datos personales', 'Skills y experiencia', 'Qué buscás', 'Revisión']
const SKILLS = ['Marketing Digital', 'SEO', 'SEM', 'Google Ads', 'Facebook Ads', 'Content Marketing', 'Email Marketing', 'Analytics', 'Data Analysis', 'Social Media', 'Copywriting', 'Branding', 'JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'Excel Avanzado', 'Gestión de Proyectos', 'Scrum', 'Liderazgo', 'Ventas', 'Negociación', 'Atención al Cliente', 'Logística', 'Contabilidad', 'RRHH', 'Diseño Gráfico', 'Inglés', 'Portugués']
const SENIORITY = ['Junior', 'Semi-Senior', 'Senior', 'Lead', 'Director']
const MODALITIES = ['Presencial', 'Híbrido', 'Remoto']

const CAREER_ROUTES = [
  { id: 'empleo-local',  label: 'Empleo en Paraguay',          icon: '💼', desc: 'Empresas locales, presencial o híbrido' },
  { id: 'remoto',        label: 'Trabajo remoto',               icon: '💻', desc: 'Empresas internacionales desde Paraguay' },
  { id: 'beca-posgrado', label: 'Beca o posgrado',              icon: '🎓', desc: 'Especializarte o estudiar en el exterior' },
  { id: 'organismos',    label: 'Organismos internacionales',   icon: '🌐', desc: 'ONU, BID, OEA, PNUD y similares' },
  { id: 'emprendimiento',label: 'Emprendimiento',               icon: '🚀', desc: 'Capital semilla, aceleradoras, grants' },
  { id: 'cambio-area',   label: 'Cambio de área',               icon: '🔄', desc: 'Reconversión o pivot profesional' },
]

// Skills mínimas por ruta para detectar brechas
const ROUTE_GAPS: Record<string, { skill: string; sugerencia: string }[]> = {
  'remoto':         [{ skill: 'Inglés', sugerencia: 'El 90% de las empresas remotas exigen inglés escrito fluido.' }],
  'organismos':     [{ skill: 'Inglés', sugerencia: 'Todos los organismos internacionales trabajan en inglés.' }, { skill: 'Redacción de proyectos', sugerencia: 'La postulación requiere cartas de motivación y propuestas formales.' }],
  'beca-posgrado':  [{ skill: 'Inglés', sugerencia: 'La mayoría de las becas exigen prueba de idioma (IELTS/TOEFL).' }],
  'emprendimiento': [{ skill: 'Gestión de Proyectos', sugerencia: 'Los jurados de aceleradoras evalúan ejecución y planificación.' }],
  'empleo-local':   [],
  'cambio-area':    [],
}

const SUMMARY_EXAMPLES = [
  'Desarrollador Full Stack con 3 años de experiencia en React y Node.js. Especializado en aplicaciones web escalables y trabajo en equipo ágil.',
  'Profesional de Marketing Digital con foco en SEO y campañas de Google Ads. Logré aumentar el tráfico orgánico un 40% en mi último proyecto.',
  'Contador con experiencia en pymes paraguayas, manejo de impuestos SET y facturación electrónica. Busco rol en empresa en crecimiento.',
]

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium transition-all ${
      done ? 'bg-[#c9a84c] text-[#0a0a0a]'
      : active ? 'border border-[#c9a84c] bg-[#c9a84c]/10 text-[#c9a84c]'
      : 'border border-white/15 text-white/30'
    }`}>
      {done ? '✓' : null}
    </span>
  )
}

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
    career_route: '' as string,
  })
  const [newCurso, setNewCurso] = useState('')
  const [newSkill, setNewSkill] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!user) return
    supabase
      .from('user_master_profiles').select('*').eq('user_id', user.id).maybeSingle()
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
            career_route: data.profile_data?.career_route || '',
          })
        }
      })
  }, [user])

  const handleCVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzing(true); setAnalyzeError(null)
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
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: text, mode: 'extract' }),
      })
      if (!analyzeRes.ok) throw new Error('Error analizando el CV')
      const extracted = await analyzeRes.json()

      analytics.cvAnalyzed('profile_builder')
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
          career_route: formData.career_route,
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

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c9a84c] border-t-transparent" />
        </div>
      </DashboardLayout>
    )
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center">
          <p className="mb-4 text-muted-foreground">Necesitás iniciar sesión para editar tu perfil.</p>
          <button
            onClick={() => setLocation('/')}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
          >
            Ir al inicio
          </button>
        </div>
      </DashboardLayout>
    )
  }

  const inputCls = 'w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#c9a84c]/50 transition'

  return (
    <DashboardLayout>
      <Helmet>
        <title>Completar Perfil | CVitae</title>
        <meta name="description" content="Completá tu perfil profesional para que la IA encuentre las mejores oportunidades para vos." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="mx-auto max-w-3xl">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <button onClick={() => setLocation('/mi-carrera')} className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-white">
              <ArrowLeft size={16} /> Volver
            </button>
            <div className="flex items-center gap-2">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <StepDot active={i === step} done={i < step} />
                  {i < STEPS.length - 1 && (
                    <span className="hidden h-px w-6 bg-white/10 sm:block" />
                  )}
                </div>
              ))}
            </div>
            <span className="text-sm text-muted-foreground">Paso {step + 1} de {STEPS.length}</span>
          </div>

          {/* Progress bar */}
          <div className="relative mb-8 h-1 w-full overflow-hidden rounded-full bg-white/8">
            <GrowthLine className="absolute -top-6 left-0 right-0 h-14 opacity-30" />
            <motion.div
              className="absolute left-0 top-0 h-full rounded-full bg-[#c9a84c]"
              initial={{ width: 0 }}
              animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.4, ease }}
            />
          </div>

          <h1 className="mb-6 font-display text-2xl text-white">{STEPS[step]}</h1>

          {/* CV Upload — solo en paso 0 */}
          {step === 0 && (
            <div className="mb-6">
              <label className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 transition-all',
                analyzing ? 'border-[#c9a84c] bg-[#c9a84c]/5' : 'border-[#c9a84c]/30 bg-white/5 hover:border-[#c9a84c] hover:bg-[#c9a84c]/5'
              )}>
                {analyzing ? (
                  <div className="flex flex-col items-center">
                    <Brain className="mb-3 h-8 w-8 animate-pulse text-[#c9a84c]" />
                    <span className="font-medium text-white">Analizando tu CV con IA…</span>
                    <span className="mt-1 text-xs text-muted-foreground">Esto tarda unos segundos</span>
                  </div>
                ) : (
                  <>
                    <Upload className="mb-3 h-8 w-8 text-[#c9a84c]" />
                    <span className="font-display text-base text-white">Subir mi CV y autocompletar</span>
                    <span className="mt-1 text-xs text-muted-foreground">PDF o DOCX — la IA completa el formulario por vos</span>
                  </>
                )}
                <input type="file" className="hidden" accept=".pdf,.docx" onChange={handleCVUpload} disabled={analyzing} />
              </label>
              <AnimatePresence>
                {analyzeError && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mt-3 text-center text-sm text-red-400">{analyzeError}</motion.p>
                )}
              </AnimatePresence>
              <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-white/8" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">o completá manualmente</span>
                <div className="h-px flex-1 bg-white/8" />
              </div>
            </div>
          )}

          {/* Step content */}
          <div className="glass-card rounded-3xl p-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.3, ease }}
              >
                {step === 0 && (
                  <div className="space-y-4">
                    <input value={formData.full_name} onChange={e => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                      placeholder="Nombre completo — ej: María González" className={inputCls} />
                    <input value={formData.professional_title} onChange={e => setFormData(prev => ({ ...prev, professional_title: e.target.value }))}
                      placeholder="Título profesional — ej: Marketing Specialist" className={inputCls} />
                    <div>
                      <textarea value={formData.summary} onChange={e => setFormData(prev => ({ ...prev, summary: e.target.value }))}
                        placeholder="Breve resumen profesional…" rows={4}
                        className={inputCls + ' resize-none'} />
                      <div className="mt-3">
                        <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Ejemplos para inspirarte:</p>
                        <div className="space-y-2">
                          {SUMMARY_EXAMPLES.map((example, i) => (
                            <button key={i} onClick={() => setFormData(prev => ({ ...prev, summary: example }))}
                              className="w-full rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-[#c9a84c]/30 hover:text-white">
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
                      <label className="mb-3 block text-sm text-muted-foreground">Tus habilidades</label>
                      <div className="mb-4 flex min-h-[40px] flex-wrap gap-2">
                        {formData.skills.map(skill => (
                          <span key={skill} className="inline-flex items-center gap-2 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.06] px-3 py-1 text-xs text-[#c9a84c]">
                            {skill}
                            <X size={12} className="cursor-pointer transition hover:text-red-400" onClick={() => removeSkill(skill)} />
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSkill()}
                          placeholder="Agregar habilidad…"
                          className="flex-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-white outline-none focus:border-[#c9a84c]/50 transition" />
                        <button onClick={addSkill} className="rounded-xl bg-[#c9a84c] p-2 text-[#0a0a0a] transition hover:bg-[#e6cf8a]">
                          <Plus size={20} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-3 block text-[10px] uppercase tracking-widest text-muted-foreground">Sugerencias populares</label>
                      <div className="flex flex-wrap gap-2">
                        {SKILLS.filter(s => !formData.skills.includes(s)).slice(0, 15).map(skill => (
                          <button key={skill} onClick={() => toggleSkill(skill)}
                            className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground transition hover:border-[#c9a84c]/50 hover:text-white">
                            + {skill}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-white/5 pt-4">
                      <label className="mb-3 block text-sm text-muted-foreground">Cursos y certificaciones</label>
                      <div className="mb-4 flex flex-wrap gap-2">
                        {formData.cursos.map(curso => (
                          <span key={curso} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70">
                            {curso}
                            <X size={12} className="cursor-pointer transition hover:text-red-400" onClick={() => removeCurso(curso)} />
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={newCurso} onChange={e => setNewCurso(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCurso()}
                          placeholder="Ej: Certificación Google Ads…"
                          className="flex-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-white outline-none focus:border-[#c9a84c]/50 transition" />
                        <button onClick={addCurso} className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-white transition hover:bg-white/10">
                          <Plus size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    {/* Ruta de carrera */}
                    <div>
                      <label className="mb-1 block text-sm text-white">¿Hacia dónde querés crecer?</label>
                      <p className="mb-4 text-xs text-muted-foreground">Elegí la dirección principal — las recomendaciones de la IA se van a enfocar en eso.</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {CAREER_ROUTES.map(route => (
                          <button
                            key={route.id}
                            onClick={() => setFormData(prev => ({ ...prev, career_route: route.id }))}
                            className={cn(
                              'flex items-start gap-3 rounded-xl border p-4 text-left transition',
                              formData.career_route === route.id
                                ? 'border-[#c9a84c] bg-[#c9a84c]/10'
                                : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                            )}
                          >
                            <span className="text-xl leading-none">{route.icon}</span>
                            <div>
                              <p className={cn('text-sm font-medium', formData.career_route === route.id ? 'text-[#c9a84c]' : 'text-white')}>{route.label}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">{route.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Brechas detectadas según ruta */}
                    {formData.career_route && (() => {
                      const gaps = (ROUTE_GAPS[formData.career_route] || []).filter(
                        g => !formData.skills.some(s => s.toLowerCase().includes(g.skill.toLowerCase()))
                      )
                      return gaps.length > 0 ? (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 space-y-3">
                          <p className="text-xs font-medium text-amber-400 uppercase tracking-widest">Brechas detectadas para esta ruta</p>
                          {gaps.map(g => (
                            <div key={g.skill} className="flex items-start gap-3">
                              <span className="mt-0.5 text-amber-400">⚠</span>
                              <div>
                                <p className="text-sm text-white font-medium">{g.skill}</p>
                                <p className="text-xs text-muted-foreground">{g.sugerencia}</p>
                              </div>
                            </div>
                          ))}
                          <p className="text-[11px] text-muted-foreground pt-1">CVitae va a priorizar estas habilidades en tus recomendaciones de cursos.</p>
                        </div>
                      ) : null
                    })()}

                    <div className="border-t border-white/5 pt-4 space-y-4">
                      <div>
                        <label className="mb-3 block text-sm text-muted-foreground">Seniority actual</label>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                          {SENIORITY.map(s => (
                            <button key={s} onClick={() => setFormData(prev => ({ ...prev, seniority: s }))}
                              className={cn('rounded-xl border px-4 py-2 text-sm transition',
                                formData.seniority === s ? 'border-[#c9a84c] bg-[#c9a84c]/10 text-[#c9a84c]' : 'border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-white'
                              )}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-3 block text-sm text-muted-foreground">Modalidad preferida</label>
                        <div className="grid grid-cols-3 gap-2">
                          {MODALITIES.map(m => (
                            <button key={m} onClick={() => setFormData(prev => ({ ...prev, modality: m }))}
                              className={cn('rounded-xl border px-4 py-2 text-sm transition',
                                formData.modality === m ? 'border-[#c9a84c] bg-[#c9a84c]/10 text-[#c9a84c]' : 'border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/20 hover:text-white'
                              )}>
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-3 block text-sm text-muted-foreground">Ubicación</label>
                        <input value={formData.location} onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                          placeholder="Ciudad/País de residencia" className={inputCls} />
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
                      <div className="mb-4 flex items-start justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-white">{formData.full_name || 'Sin nombre'}</h3>
                          <p className="text-sm font-medium text-[#c9a84c]">{formData.professional_title || 'Sin título'}</p>
                        </div>
                        <span className="rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.06] px-3 py-0.5 text-xs text-[#c9a84c]">
                          {formData.seniority}
                        </span>
                      </div>
                      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{formData.summary || 'Sin resumen'}</p>
                      {formData.career_route && (
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/[0.06] px-3 py-1 text-xs text-[#c9a84c]">
                          {CAREER_ROUTES.find(r => r.id === formData.career_route)?.icon}{' '}
                          Ruta: {CAREER_ROUTES.find(r => r.id === formData.career_route)?.label}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {formData.skills.map(s => (
                          <span key={s} className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] text-white/60">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                      <CheckCircle size={16} className="text-emerald-400" />
                      <p className="text-xs text-emerald-400">Al guardar, usaremos esta información para encontrarte las mejores oportunidades en Paraguay.</p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-6">
              <button
                onClick={() => setStep(prev => Math.max(0, prev - 1))}
                className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-white', step === 0 && 'invisible')}
              >
                <ChevronLeft size={18} /> Anterior
              </button>

              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep(prev => prev + 1)}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
                >
                  Siguiente <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  onClick={handleSave} disabled={saving || saved}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-60"
                >
                  {saving
                    ? <><Loader2 size={16} className="animate-spin" /> Guardando…</>
                    : saved
                    ? <><CheckCircle size={16} /> ¡Perfil guardado!</>
                    : <><Save size={16} /> Finalizar y ver matches</>
                  }
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  )
}
