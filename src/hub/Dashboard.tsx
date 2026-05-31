import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'wouter'
import { Sparkles, UserCircle, Search, Briefcase, MapPin, Lock, ExternalLink, GraduationCap, BookOpen, Bell, ExternalLink as ExternalLinkIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { GlassCard, GoldButton, Badge, MatchArc } from '@/components/cvitae/UI-Elements'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import MatchingLoader from '@/components/MatchingLoader'
import { auth, supabase } from '@/lib/supabase'

const MATCH_BATCH_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/match-batch'
const WA_NUMBER = '595992954169'

export default function Dashboard() {
  const [, setLocation] = useLocation()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)
  const [jobMatches, setJobMatches] = useState<any[]>([])
  const [growthItems, setGrowthItems] = useState<any[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [matchesError, setMatchesError] = useState<string | null>(null)
  const [profileSkills, setProfileSkills] = useState<string[]>([])
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [courses, setCourses] = useState<any[]>([])
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [currentLoaderStep, setCurrentLoaderStep] = useState(0)

  const loaderSteps = ["Analizando tu perfil...", "Escaneando vacantes...", "Calculando compatibilidad...", "Personalizando resultados..."]

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      setAuthLoading(false)
    })
    const subscription = auth.onAuthStateChange((u) => {
      setUser(u)
      setAuthLoading(false)
    })
    return () => { subscription?.unsubscribe() }
  }, [])

  useEffect(() => {
    if (user) checkProfileAndLoad()
  }, [user])

  useEffect(() => {
    if (loadingMatches) {
      const interval = setInterval(() => {
        setCurrentLoaderStep(s => (s + 1) % loaderSteps.length)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [loadingMatches])

  const checkProfileAndLoad = async () => {
    const { data: profile } = await supabase.from('user_master_profiles').select('id, profile_data').eq('user_id', user.id).maybeSingle()
    if (!profile) {
      setHasProfile(false)
      return
    }
    setHasProfile(true)
    setProfileSkills(profile.profile_data?.habilidades || [])
    loadMatches()
  }

  const loadMatches = async () => {
    setLoadingMatches(true)
    setMatchesError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No autorizado')

      const res = await fetch(MATCH_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar matches')

      const allMatches = data.matches || []
      setJobMatches(allMatches.filter((m: any) => m.tipo === 'empleo' || m.tipo === 'oportunidad'))
      setGrowthItems(allMatches.filter((m: any) => m.tipo === 'beca' || m.tipo === 'blog'))
      setIsSubscribed(data.is_subscribed || false)

      // Cargar cursos con Gemini basado en habilidades faltantes
      loadGeminiCourses(profileSkills, allMatches, token)

    } catch (err: any) {
      setMatchesError(err.message)
    } finally {
      setLoadingMatches(false)
    }
  }

  const loadGeminiCourses = async (skills: string[], allMatches: any[], token: string) => {
    setLoadingCourses(true)
    try {
      // Calcular habilidades faltantes de los top matches
      const top5 = allMatches.slice(0, 5)
      const allVacancySkills: string[] = []
      top5.forEach((m: any) => {
        m.vacancySkills?.forEach((s: string) => {
          if (!skills.some((ps: string) => ps.toLowerCase() === s.toLowerCase())) {
            allVacancySkills.push(s)
          }
        })
      })
      const freq: Record<string, number> = {}
      allVacancySkills.forEach(s => { freq[s] = (freq[s] || 0) + 1 })
      const missingSkills = Object.entries(freq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([s]) => s)

      if (missingSkills.length === 0) return

      const res = await fetch('/.netlify/functions/gemini-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ profileSkills: skills, missingSkills }),
      })
      if (!res.ok) return
      const data = await res.json()
      setCourses(data.courses || [])
    } catch { /* silencioso */ } finally {
      setLoadingCourses(false)
    }
  }

  const missingSkills = useMemo(() => {
    if (jobMatches.length === 0) return []
    const allVacancySkills: string[] = []
    jobMatches.slice(0, 5).forEach(m => {
      m.vacancySkills?.forEach(s => {
        if (!profileSkills.some(ps => ps.toLowerCase() === s.toLowerCase())) allVacancySkills.push(s)
      })
    })
    const freq: Record<string, number> = {}
    allVacancySkills.forEach(s => { freq[s] = (freq[s] || 0) + 1 })
    return Object.entries(freq).sort(([, a], [, b]) => b - a).slice(0, 4).map(([s]) => s)
  }, [jobMatches, profileSkills])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {authLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !user ? (
          <GlassCard className="text-center py-16 px-8">
            <UserCircle className="w-12 h-12 text-[#c9a84c] mx-auto mb-4 opacity-50" />
            <h2 className="text-2xl font-bold text-white mb-2">Bienvenido a CVitae</h2>
            <p className="text-[#888888] mb-8">Ingresá con tu email para ver tus oportunidades personalizadas.</p>
            <GoldButton onClick={() => window.location.href = '/'}>Ingresar</GoldButton>
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

            {/* Columna principal */}
            <div className="lg:col-span-2 space-y-8">

              {/* SECCIÓN 1: Empleos y Oportunidades */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Briefcase size={20} className="text-[#c9a84c]" />
                  Empleos para vos
                </h2>
                {matchesError ? (
                  <GlassCard className="text-center py-8">
                    <p className="text-red-400 text-sm mb-3">{matchesError}</p>
                    <GoldButton size="sm" variant="outline" onClick={loadMatches}>Reintentar</GoldButton>
                  </GlassCard>
                ) : jobMatches.length === 0 ? (
                  <GlassCard className="text-center py-12 border-dashed border-white/10">
                    <Search className="w-12 h-12 text-[#333333] mx-auto mb-4" />
                    <h3 className="text-white font-bold mb-2">No encontramos matches aún</h3>
                    <p className="text-[#888888] mb-6 text-sm max-w-xs mx-auto">Completá tu perfil con más habilidades.</p>
                    <GoldButton href="/mi-carrera/perfil" size="sm" variant="outline">Mejorar perfil</GoldButton>
                  </GlassCard>
                ) : (
                  jobMatches.map((match) => (
                    <GlassCard
                      key={match.id}
                      onClick={() => setLocation(`/oportunidades/${match.slug}`)}
                      className="cursor-pointer hover:border-[#c9a84c]/30 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={match.tipo === 'empleo' ? 'gold' : 'muted'} className="text-[10px] px-2 py-0.5">
                              {match.tipo === 'oportunidad' ? '💼 Empleo' : '🏢 Empresa'}
                            </Badge>
                            {match.categoria && (
                              <span className="text-xs text-[#555555]">{match.categoria}</span>
                            )}
                          </div>
                          <p className="text-white font-medium truncate">{match.titulo}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-[#888888] flex items-center gap-1">
                              <MapPin size={12} /> {match.ubicacion}
                            </span>
                          </div>
                          {match.geminiInsight && (
                            <p className="text-xs text-[#c9a84c]/80 mt-2 italic">✨ {match.geminiInsight}</p>
                          )}
                        </div>
                        <MatchArc percentage={match.finalScore} size={56} />
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>

              {/* SECCIÓN 2: Crecé profesionalmente (becas + blog) */}
              {growthItems.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <GraduationCap size={20} className="text-[#c9a84c]" />
                    Crecé profesionalmente
                  </h2>
                  {growthItems.map((item) => (
                    <GlassCard
                      key={item.id}
                      onClick={() => setLocation(`/oportunidades/${item.slug}`)}
                      className="cursor-pointer hover:border-[#c9a84c]/30 transition-all"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="muted" className="text-[10px] px-2 py-0.5">
                              {item.tipo === 'beca' ? '🎓 Beca' : '📝 Recurso'}
                            </Badge>
                          </div>
                          <p className="text-white font-medium truncate">{item.titulo}</p>
                          {item.ubicacion && (
                            <span className="text-xs text-[#888888] flex items-center gap-1 mt-1">
                              <MapPin size={12} /> {item.ubicacion}
                            </span>
                          )}
                        </div>
                        <MatchArc percentage={item.finalScore} size={48} />
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </div>

            {/* Columna lateral */}
            <div className="space-y-6">

              {/* Habilidades faltantes */}
              <GlassCard>
                <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                  <Sparkles size={16} className="text-[#c9a84c]" />
                  Habilidades faltantes
                </h3>
                <div className="space-y-2">
                  {missingSkills.length === 0 ? (
                    <p className="text-[#555555] text-xs italic">Calculando...</p>
                  ) : (
                    missingSkills.map((skill) => (
                      <div key={skill} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                        <span className="text-gray-300 text-sm">{skill}</span>
                        <span className="text-xs text-[#c9a84c]">↓ ver cursos</span>
                      </div>
                    ))
                  )}
                </div>
              </GlassCard>

              {/* Cursos recomendados por Gemini */}
              <GlassCard>
                <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                  <BookOpen size={16} className="text-[#c9a84c]" />
                  Cursos recomendados
                  <Badge variant="gold" className="text-[9px] px-1.5 py-0 ml-auto">IA</Badge>
                </h3>
                {loadingCourses ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : courses.length > 0 ? (
                  <div className="space-y-3">
                    {courses.map((c, i) => (
                      <a
                        key={i}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 bg-white/5 border border-white/10 rounded-xl hover:border-[#c9a84c]/30 hover:bg-[#c9a84c]/5 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-[#c9a84c] mb-0.5">{c.skill}</p>
                            <p className="text-white text-xs font-medium truncate">{c.course}</p>
                            <p className="text-[#555555] text-[10px]">{c.platform}</p>
                            {c.why && <p className="text-[#888888] text-[10px] mt-1 italic">{c.why}</p>}
                          </div>
                          <ExternalLinkIcon size={12} className="text-[#555555] group-hover:text-[#c9a84c] shrink-0 mt-1 transition-colors" />
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#555555] text-xs italic">Completá tu perfil para ver cursos personalizados.</p>
                )}
              </GlassCard>

              {/* Alertas */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-bold flex items-center gap-2 text-sm"><Bell size={14} className="text-[#c9a84c]" /> Alertas Proactivas</h3>
                  <Badge variant="gold" className="text-[8px] px-1.5 py-0">PRÓXIMAMENTE</Badge>
                </div>
                <p className="text-[#888888] text-xs leading-relaxed">
                  Te avisaremos cuando aparezca un match mayor al 85%.
                </p>
              </div>

              {!isSubscribed && (
                <div className="p-4 bg-[#c9a84c]/5 border border-[#c9a84c]/20 rounded-xl text-center">
                  <Lock size={20} className="text-[#c9a84c] mx-auto mb-2" />
                  <p className="text-white text-sm font-medium mb-1">Matches ilimitados</p>
                  <p className="text-[#888888] text-xs mb-3">Suscribite al plan Pro por USD 5/mes</p>
                  <a
                    href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola! Quiero activar mi suscripción a CVitae Pro por USD 5/mes.')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-500 transition-all text-sm"
                  >
                    <ExternalLink size={14} /> Suscribirme
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
