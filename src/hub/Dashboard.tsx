import { useState, useEffect, useMemo } from 'react'
import { useLocation, Link } from 'wouter'
import { Sparkles, UserCircle, Search, RefreshCw, ArrowRight, Mail, Briefcase, MapPin, Lock, ExternalLink, Upload, FileText, Bell, CheckCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { GlassCard, GoldButton, Badge, MatchArc } from '@/components/cvitae/UI-Elements'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'
import emailjs from 'emailjs-com'

const MATCH_BATCH_URL = 'https://rbrirxbjbmdxflzaxxzp.supabase.co/functions/v1/match-batch'
const WA_NUMBER = '595992954169'

interface MatchItem {
  id: string
  slug: string
  titulo: string
  categoria: string
  ubicacion: string
  organization: string
  application_url: string
  skillsScore: number
  seniorityScore: number
  locationScore: number
  finalScore: number
  vacancySkills: string[]
}

export default function Dashboard() {
  const [, setLocation] = useLocation()
  const [user, setUser] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [matches, setMatches] = useState<MatchItem[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [matchesError, setMatchesError] = useState<string | null>(null)
  const [profileSkills, setProfileSkills] = useState<string[]>([])
  const [profileCursos, setProfileCursos] = useState<string[]>([])
  const [isSubscribed, setIsSubscribed] = useState(false)
  
  // Onboarding state
  const [uploading, setUploading] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState<'initial' | 'uploading' | 'success'>('initial')

  useEffect(() => {
    auth.getUser().then(setUser)
    const { data } = auth.onAuthStateChange((user) => setUser(user))
    return () => { data?.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (user) loadMatches()
  }, [user])

  const sendJobAlert = async (match: MatchItem) => {
    if (!user?.email || match.finalScore < 80) return
    
    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

    if (!serviceId || !templateId || !publicKey) return

    try {
      await emailjs.send(serviceId, templateId, {
        user_name: user.user_metadata?.full_name || user.email,
        job_title: match.titulo,
        match_score: match.finalScore,
        job_link: `https://cvitae-py.netlify.app/oportunidades/${match.slug}`,
        to_email: user.email
      }, publicKey)
    } catch (err) {
      console.error('EmailJS Error:', err)
    }
  }

  const loadMatches = async () => {
    setLoadingMatches(true)
    setMatchesError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No autorizado')

      const response = await fetch(MATCH_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error al cargar matches')
      
      const newMatches = data.matches || []
      setMatches(newMatches)
      setProfileSkills(data.profileSkills || [])
      setProfileCursos(data.profileCursos || [])
      setIsSubscribed(data.is_subscribed || false)

      // Send alert for top match
      if (newMatches.length > 0 && newMatches[0].finalScore >= 80) {
        sendJobAlert(newMatches[0])
      }
    } catch (err: any) {
      setMatchesError(err.message)
    } finally {
      setLoadingMatches(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !email.trim()) return

    setUploading(true)
    setOnboardingStep('uploading')

    try {
      // 1. Magic Link sign in first to have a user context
      const { error: authError } = await auth.signInWithMagicLink(email)
      if (authError) throw authError

      // 2. Read file as base64
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
      const base64 = await base64Promise

      // 3. Extract text
      const extractRes = await fetch('/.netlify/functions/extract-pdf-text', {
        method: 'POST',
        body: JSON.stringify({ file: base64 })
      })
      const { text } = await extractRes.json()

      // 4. Analyze CV
      const analyzeRes = await fetch('/.netlify/functions/analyze-cv-candidate', {
        method: 'POST',
        body: JSON.stringify({ text })
      })
      const { premiumData } = await analyzeRes.json()
      const skills = premiumData?.missingKeywords || []

      // 5. Update profile (assuming user will click magic link, but we can store intent or try to update if session exists)
      // For now, we'll show success and tell them to check email
      setOnboardingStep('success')
      setSent(true)
    } catch (err: any) {
      alert('Error: ' + err.message)
      setOnboardingStep('initial')
    } finally {
      setUploading(false)
    }
  }

  const missingSkills = useMemo(() => {
    if (matches.length === 0) return []
    const top5 = matches.slice(0, 5)
    const allVacancySkills: string[] = []
    top5.forEach(match => { match.vacancySkills.forEach(skill => { if (!profileSkills.some(ps => ps.toLowerCase() === skill.toLowerCase())) allVacancySkills.push(skill) }) })
    const freq: Record<string, number> = {}
    allVacancySkills.forEach(skill => { freq[skill] = (freq[skill] || 0) + 1 })
    return Object.entries(freq).sort(([, a], [, b]) => b - a).slice(0, 4).map(([skill]) => skill)
  }, [matches, profileSkills])

  const handleOpportunityClick = (match: MatchItem) => {
    setLocation(`/oportunidades/${match.slug}`)
  }

  const handleSendMagicLink = async () => {
    if (!email.trim()) return
    setSending(true)
    const { error } = await auth.signInWithMagicLink(email)
    setSending(false)
    if (error) alert('Error al enviar el enlace: ' + error.message)
    else setSent(true)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!user ? (
          <GlassCard className="text-center py-16 px-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#c9a84c] to-transparent opacity-50" />
            
            {onboardingStep === 'initial' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-3xl font-bold text-white mb-4">Tu carrera merece <span className="text-[#c9a84c]">Inteligencia</span></h2>
                <p className="text-[#888888] mb-10 max-w-lg mx-auto">Subí tu CV y nuestra IA encontrará las mejores oportunidades para vos en segundos.</p>
                
                <div className="max-w-md mx-auto space-y-6">
                  <div className="space-y-2">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com"
                      className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-[#888888] focus:outline-none focus:border-[#c9a84c]/50 text-center" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 rounded-2xl hover:border-[#c9a84c]/50 hover:bg-[#c9a84c]/5 transition-all cursor-pointer group">
                      <Upload className="text-[#888888] group-hover:text-[#c9a84c] mb-2" size={24} />
                      <span className="text-white font-bold text-sm">Subir mi CV</span>
                      <span className="text-[#888888] text-[10px] mt-1">PDF, DOCX</span>
                      <input type="file" className="hidden" accept=".pdf,.docx" onChange={handleFileUpload} disabled={!email.trim()} />
                    </label>
                    
                    <button onClick={() => setLocation('/mi-carrera/perfil')} className="flex flex-col items-center justify-center p-6 border border-white/10 rounded-2xl hover:bg-white/5 transition-all group">
                      <FileText className="text-[#888888] group-hover:text-white mb-2" size={24} />
                      <span className="text-white font-bold text-sm">Crear desde cero</span>
                      <span className="text-[#888888] text-[10px] mt-1">Manual</span>
                    </button>
                  </div>
                  
                  <p className="text-[10px] text-[#555555]">Al continuar, aceptás nuestros términos y condiciones.</p>
                </div>
              </motion.div>
            )}

            {onboardingStep === 'uploading' && (
              <div className="py-12">
                <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                <h3 className="text-xl font-bold text-white mb-2">Analizando tu perfil...</h3>
                <p className="text-[#888888]">Nuestra IA está extrayendo tus habilidades.</p>
              </div>
            )}

            {onboardingStep === 'success' && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-12">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="text-green-500" size={32} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">¡CV Analizado con éxito!</h3>
                <p className="text-[#888888] mb-8">Te enviamos un enlace mágico a <b>{email}</b> para que veas tus matches.</p>
                <GoldButton onClick={() => setOnboardingStep('initial')}>Volver</GoldButton>
              </motion.div>
            )}
          </GlassCard>
        ) : loadingMatches ? (
          <GlassCard className="text-center py-12">
            <div className="w-12 h-12 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white">Buscando las mejores oportunidades para vos...</p>
          </GlassCard>
        ) : matchesError ? (
          <GlassCard className="text-center py-12">
            <p className="text-red-400 mb-3">{matchesError}</p>
            <GoldButton onClick={loadMatches}>Reintentar</GoldButton>
          </GlassCard>
        ) : (
          <>
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2"><Briefcase size={20} className="text-[#c9a84c]" /> Oportunidades para vos</h2>
                
                {matches.length === 0 ? (
                  <GlassCard className="text-center py-12 border-dashed border-white/10">
                    <Search className="w-12 h-12 text-[#333333] mx-auto mb-4" />
                    <h3 className="text-white font-bold mb-2">No encontramos matches aún</h3>
                    <p className="text-[#888888] mb-6 text-sm max-w-xs mx-auto">Completá tu perfil o subí un nuevo CV para que podamos encontrar oportunidades.</p>
                    <div className="flex justify-center gap-3">
                      <GoldButton href="/mi-carrera/perfil" size="sm" variant="outline">Completar perfil</GoldButton>
                      <GoldButton href="/oportunidades" size="sm">Ver todas</GoldButton>
                    </div>
                  </GlassCard>
                ) : (
                  matches.slice(0, 5).map((match) => (
                    <GlassCard
                      key={match.id}
                      onClick={() => handleOpportunityClick(match)}
                      className="cursor-pointer hover:border-[#c9a84c]/30 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{match.titulo}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-[#888888] flex items-center gap-1"><MapPin size={12} /> {match.ubicacion}</span>
                            <span className="text-xs text-[#888888] flex items-center gap-1"><Briefcase size={12} /> {match.categoria}</span>
                          </div>
                        </div>
                        <MatchArc percentage={match.finalScore} size={56} />
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>
              <div className="space-y-6">
                <GlassCard>
                  <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                    <Sparkles size={16} className="text-[#c9a84c]" /> 
                    {missingSkills.length > 0 ? 'Habilidades faltantes' : profileCursos.length > 0 ? 'Tus cursos' : 'Habilidades sugeridas'}
                  </h3>
                  <div className="space-y-2">
                    {missingSkills.length > 0 ? (
                      missingSkills.map((skill) => (
                        <div key={skill} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                          <span className="text-gray-300 text-sm">{skill}</span>
                          <span className="text-xs text-[#c9a84c]">+Curso</span>
                        </div>
                      ))
                    ) : profileCursos.length > 0 ? (
                      profileCursos.map((curso) => (
                        <div key={curso} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                          <span className="text-gray-300 text-sm">{curso}</span>
                          <CheckCircle size={14} className="text-emerald-500" />
                        </div>
                      ))
                    ) : (
                      ['Inglés', 'Liderazgo', 'Excel avanzado', 'Gestión de proyectos'].map((skill) => (
                        <div key={skill} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                          <span className="text-gray-300 text-sm">{skill}</span>
                          <span className="text-[10px] text-[#888888]">Recomendado</span>
                        </div>
                      ))
                    )}
                  </div>
                </GlassCard>

                <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white font-bold flex items-center gap-2 text-sm"><Bell size={14} className="text-[#c9a84c]" /> Alertas Proactivas</h3>
                    <Badge variant="gold" className="text-[8px] px-1.5 py-0">PRÓXIMAMENTE</Badge>
                  </div>
                  <p className="text-[#888888] text-xs leading-relaxed">Recibí notificaciones instantáneas vía WhatsApp y Email cuando aparezca el match perfecto.</p>
                </div>

                {!isSubscribed && (
                  <div className="p-4 bg-[#c9a84c]/5 border border-[#c9a84c]/20 rounded-xl text-center">
                    <Lock size={20} className="text-[#c9a84c] mx-auto mb-2" />
                    <p className="text-white text-sm font-medium mb-1">Límite diario alcanzado</p>
                    <p className="text-[#888888] text-xs mb-3">Suscribite para matches ilimitados</p>
                    <a href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola! Quiero activar mi suscripción a CVitae Pro por USD 5/mes.')}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-500 transition-all text-sm">
                      <ExternalLink size={14} /> Suscribirme por $5/mes
                    </a>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
