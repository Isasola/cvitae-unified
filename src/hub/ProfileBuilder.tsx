import { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Plus, X, CheckCircle, ChevronRight, ChevronLeft, User, Briefcase, Target, Upload } from 'lucide-react'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'

const STEPS = ['Datos personales', 'Skills y experiencia', 'Qué buscás', 'Revisión']
const SKILLS = ['Marketing Digital', 'SEO', 'SEM', 'Google Ads', 'Facebook Ads', 'Content Marketing', 'Email Marketing', 'Analytics', 'Data Analysis', 'Social Media', 'Copywriting', 'Branding', 'JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'Excel Avanzado', 'Gestión de Proyectos', 'Scrum', 'Liderazgo', 'Ventas', 'Negociación', 'Atención al Cliente', 'Logística', 'Contabilidad', 'RRHH', 'Diseño Gráfico', 'Inglés', 'Portugués']
const SENIORITY = ['Junior', 'Semi-Senior', 'Senior', 'Lead', 'Director']
const MODALITIES = ['Presencial', 'Híbrido', 'Remoto']

export default function ProfileBuilder() {
  const [, setLocation] = useLocation()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [existingProfileId, setExistingProfileId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ full_name: '', professional_title: '', location: '', seniority: 'Junior', summary: '', modality: '', skills: [] as string[], cursos: [] as string[] })
  const [newCurso, setNewCurso] = useState('')
  const [newSkill, setNewSkill] = useState('')

  useEffect(() => {
    auth.getUser().then(setUser)
  }, [])

  useEffect(() => {
    if (user) {
      supabase.from('user_master_profiles').select('*').eq('user_id', user.id).maybeSingle().then(({ data }) => {
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
    }
  }, [user])

  const addSkill = () => {
    if (newSkill.trim() && !formData.skills.includes(newSkill.trim())) {
      setFormData(prev => ({ ...prev, skills: [...prev.skills, newSkill.trim()] }))
      setNewSkill('')
    }
  }

  const removeSkill = (skill: string) => {
    setFormData(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))
  }

  const addCurso = () => {
    if (newCurso.trim() && !formData.cursos.includes(newCurso.trim())) {
      setFormData(prev => ({ ...prev, cursos: [...prev.cursos, newCurso.trim()] }))
      setNewCurso('')
    }
  }

  const removeCurso = (curso: string) => {
    setFormData(prev => ({ ...prev, cursos: prev.cursos.filter(c => c !== curso) }))
  }

  const toggleSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill) ? prev.skills.filter(s => s !== skill) : [...prev.skills, skill]
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
        profile_data: { habilidades: formData.skills, cursos: formData.cursos, seniority: formData.seniority, location: formData.location, modality: formData.modality },
      }
      const { error } = existingProfileId
        ? await supabase.from('user_master_profiles').update(payload).eq('id', existingProfileId)
        : await supabase.from('user_master_profiles').insert(payload)
      if (error) throw error
      setSaved(true)
      setTimeout(() => setLocation('/mi-carrera'), 2000)
    } catch (err) { alert('Error al guardar el perfil') }
    finally { setSaving(false) }
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-[#888888] mb-4">Necesitás iniciar sesión para editar tu perfil.</p>
          <GoldButton onClick={() => setLocation('/mi-carrera')}>Volver al Dashboard</GoldButton>
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
            <motion.div className="h-full bg-[#c9a84c] rounded-full" initial={{ width: 0 }} animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.3 }} />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">{STEPS[step]}</h1>

          <GlassCard className="mt-6">
            {step === 0 && (
              <div className="space-y-4">
                <input type="text" value={formData.full_name} onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))} placeholder="Nombre completo" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#888888] focus:outline-none focus:border-[#c9a84c]/50" />
                <input type="text" value={formData.professional_title} onChange={(e) => setFormData(prev => ({ ...prev, professional_title: e.target.value }))} placeholder="Título profesional (ej: Marketing Specialist)" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#888888] focus:outline-none focus:border-[#c9a84c]/50" />
                <textarea value={formData.summary} onChange={(e) => setFormData(prev => ({ ...prev, summary: e.target.value }))} placeholder="Breve resumen profesional..." rows={4} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#888888] focus:outline-none focus:border-[#c9a84c]/50" />
              </div>
            )}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <label className="text-sm text-[#888888] mb-3 block">Habilidades destacadas</label>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {formData.skills.map(skill => (
                      <Badge key={skill} variant="gold" className="gap-2">
                        {skill} <X size={12} className="cursor-pointer" onClick={() => removeSkill(skill)} />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newSkill} onChange={(e) => setNewSkill(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addSkill()} placeholder="Agregar habilidad..." className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                    <button onClick={addSkill} className="p-2 bg-[#c9a84c] text-[#0a0a0a] rounded-lg"><Plus size={20} /></button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[#888888] mb-3 block">Sugerencias</label>
                  <div className="flex flex-wrap gap-2">
                    {SKILLS.filter(s => !formData.skills.includes(s)).slice(0, 12).map(skill => (
                      <button key={skill} onClick={() => toggleSkill(skill)} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400 hover:border-[#c9a84c]/50 hover:text-white transition-all">
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
                        {curso} <X size={12} className="cursor-pointer" onClick={() => removeCurso(curso)} />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newCurso} onChange={(e) => setNewCurso(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addCurso()} placeholder="Ej: Certificación Google Ads..." className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                    <button onClick={addCurso} className="p-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"><Plus size={20} /></button>
                  </div>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <label className="text-sm text-[#888888] mb-3 block">Seniority</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {SENIORITY.map(s => (
                      <button key={s} onClick={() => setFormData(prev => ({ ...prev, seniority: s }))} className={cn('px-4 py-2 rounded-lg text-sm border transition-all', formData.seniority === s ? 'bg-[#c9a84c]/10 border-[#c9a84c] text-[#c9a84c]' : 'bg-white/5 border-white/10 text-gray-400')}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[#888888] mb-3 block">Modalidad preferida</label>
                  <div className="grid grid-cols-3 gap-2">
                    {MODALITIES.map(m => (
                      <button key={m} onClick={() => setFormData(prev => ({ ...prev, modality: m }))} className={cn('px-4 py-2 rounded-lg text-sm border transition-all', formData.modality === m ? 'bg-[#c9a84c]/10 border-[#c9a84c] text-[#c9a84c]' : 'bg-white/5 border-white/10 text-gray-400')}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <input type="text" value={formData.location} onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))} placeholder="Ciudad/País de residencia" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#888888] focus:outline-none focus:border-[#c9a84c]/50" />
              </div>
            )}
            {step === 3 && (
              <div className="space-y-6">
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <h3 className="text-white font-medium mb-2">{formData.full_name || 'Sin nombre'}</h3>
                  <p className="text-[#c9a84c] text-sm mb-3">{formData.professional_title || 'Sin título'}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="muted">{formData.seniority}</Badge>
                    <Badge variant="muted">{formData.modality}</Badge>
                    <Badge variant="muted">{formData.location}</Badge>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#888888] uppercase tracking-wider mb-2">Habilidades</h4>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {formData.skills.map(s => <Badge key={s} variant="gold">{s}</Badge>)}
                  </div>
                </div>
                {formData.cursos.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-[#888888] uppercase tracking-wider mb-2">Cursos</h4>
                    <div className="flex flex-wrap gap-2">
                      {formData.cursos.map(c => <Badge key={c} variant="muted" className="bg-white/5 text-white">{c}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/5">
              <button onClick={() => setStep(s => s - 1)} disabled={step === 0} className="flex items-center gap-2 text-[#888888] hover:text-white disabled:opacity-0 transition-colors">
                <ChevronLeft size={18} /> Anterior
              </button>
              {step < STEPS.length - 1 ? (
                <GoldButton onClick={() => setStep(s => s + 1)}>Siguiente <ChevronRight size={18} /></GoldButton>
              ) : (
                <GoldButton onClick={handleSave} disabled={saving}>
                  {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Finalizar perfil'}
                  {saved ? <CheckCircle size={18} /> : <Save size={18} />}
                </GoldButton>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </DashboardLayout>
  )
}
