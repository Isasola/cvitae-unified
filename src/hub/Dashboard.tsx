import { useState, useEffect, useMemo } from 'react'
import { useLocation, Link } from 'wouter'
import { Sparkles, UserCircle, Search, RefreshCw, ArrowRight, Mail, Briefcase, MapPin, Lock, ExternalLink, Upload, FileText, Bell, CheckCircle, Settings, Layout } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard, GoldButton, Badge, MatchArc } from '@/components/cvitae/UI-Elements'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import MatchingLoader from '@/components/MatchingLoader'
import { auth, supabase } from '@/lib/supabase'
import emailjs from 'emailjs-com'

const MATCH_BATCH_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/match-batch'
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
  const [matches, setMatches] = useState<MatchItem[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [matchesError, setMatchesError] = useState<string | null>(null)
  const [profileSkills, setProfileSkills] = useState<string[]>([])
  const [profileCursos, setProfileCursos] = useState<string[]>([])
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)
  const [currentLoaderStep, setCurrentLoaderStep] = useState(0)

  const loaderSteps = ["Leyendo tu perfil...", "Cargando vacantes activas...", "Calculando compatibilidad...", "Ordenando resultados..."]

  useEffect(() => {
    auth.getUser().then(setUser)
    const subscription = auth.onAuthStateChange((user) => setUser(user))
    return () => { subscription?.unsubscribe() }
  }, [])

  useEffect(() => {
    if (user) {
      supabase.from('user_master_profiles').select('id').eq('user_id', user.id).maybeSingle().then(({ data }) => {
        setHasProfile(!!data)
      })
    }
  }, [user])

  useEffect(() => {
    let interval: any
    if (loadingMatches) {
      setCurrentLoaderStep(0)
      interval = setInterval(() => {
        setCurrentLoaderStep(prev => (prev < loaderSteps.length - 1 ? prev + 1 : prev))
      }, 2000)
    }
    return () => clearInterval(interval)
  }, [loadingMatches])

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

  const missingSkills = useMemo(() => {
    if (matches.length === 0) return null
    const top5 = matches.slice(0, 5)
    const allVacancySkills: string[] = []
    top5.forEach(match => { match.vacancySkills?.forEach(skill => { if (!profileSkills.some(ps => ps.toLowerCase() === skill.toLowerCase())) allVacancySkills.push(skill) }) })
    const freq: Record<string, number> = {}
    allVacancySkills.forEach(skill => { freq[skill] = (freq[skill] || 0) + 1 })
    return Object.entries(freq).sort(([, a], [, b]) => b - a).slice(0, 4).map(([skill]) => skill)
  }, [matches, profileSkills])

  const handleOpportunityClick = (match: MatchItem) => {
    setLocation(`/oportunidades/${match.slug}`)
  }

  return (
    <DashboardLayout>
      <div className="grid lg:grid-cols-1 gap-6">
        {/* Main Content */}
        <div className="space-y-6">
          {!user ? (
            <GlassCard className="text-center py-16 px-8">
              <Lock className="w-12 h-12 text-[#c9a84c] mx-auto mb-4 opacity-50" />
              <h2 className="text-2xl font-bold text-white mb-2">Tu sesión expiró</h2>
              <p className="text-[#888888] mb-8">Volvé a ingresar para ver tus oportunidades personalizadas.</p>
              <GoldButton onClick={() => setLocation('/')}>Ir al Inicio</GoldButton>
            </GlassCard>
          ) : hasProfile === false ? (
            <GlassCard className="text-center py-16 px-8">
              <UserCircle className="w-12 h-12 text-[#c9a84c] mx-auto mb-4 opacity-50" />
              <h2 className="text-2xl font-bold text-white mb-2">Completá tu perfil</h2>
              <p className="text-[#888888] mb-8">Necesitamos conocer tus habilidades para encontrarte el trabajo ideal.</p>
              <GoldButton href="/mi-carrera/perfil">Crear mi perfil</GoldButton>
            </GlassCard>
          ) : loadingMatches ? (
            <GlassCard className="py-12">
              <MatchingLoader steps={loaderSteps} currentStep={currentLoaderStep} totalVacancies={50} />
            </GlassCard>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2"><Briefcase size={20} className="text-[#c9a84c]" /> Oportunidades para vos</h2>
                
                {matches.length === 0 ? (
                  <GlassCard className="text-center py-12 border-dashed border-white/10">
                    <Search className="w-12 h-12 text-[#333333] mx-auto mb-4" />
                    <h3 className="text-white font-bold mb-2">No encontramos matches aún</h3>
                    <p className="text-[#888888] mb-6 text-sm max-w-xs mx-auto">Completá tu perfil con más habilidades para ver oportunidades.</p>
                    <GoldButton href="/mi-carrera/perfil" size="sm" variant="outline">Mejorar perfil</GoldButton>
                  </GlassCard>
                ) : (
                  matches.slice(0, 5).map((match) => (
                    <GlassCard key={match.id} onClick={() => handleOpportunityClick(match)} className="cursor-pointer hover:border-[#c9a84c]/30 transition-all">
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
                    Habilidades faltantes
                  </h3>
                  <div className="space-y-2">
                    {!missingSkills ? (
                      <p className="text-[#555555] text-xs italic">Cargando sugerencias...</p>
                    ) : missingSkills.length > 0 ? (
                      missingSkills.map((skill) => (
                        <div key={skill} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                          <span className="text-gray-300 text-sm">{skill}</span>
                          <span className="text-xs text-[#c9a84c]">+Curso</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[#888888] text-sm">¡Perfil completo!</p>
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
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
