import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'wouter'
import { Sparkles, UserCircle, Search, RefreshCw, ArrowRight, Mail, Briefcase, MapPin, Lock, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import { GlassCard, GoldButton, Badge, MatchArc } from '@/components/cvitae/UI-Elements'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { auth, supabase } from '@/lib/supabase'

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
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    auth.getUser().then(setUser)
    const { data } = auth.onAuthStateChange((user) => setUser(user))
    return () => { data?.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (user) loadMatches()
  }, [user])

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
      setMatches(data.matches || [])
      setProfileSkills(data.profileSkills || [])
      setIsSubscribed(data.is_subscribed || false)
    } catch (err: any) {
      setMatchesError(err.message)
    } finally {
      setLoadingMatches(false)
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
    if (match.application_url) window.open(match.application_url, '_blank', 'noopener,noreferrer')
    else window.open(`https://cvitae-py.netlify.app/opportunities/${match.slug}`, '_blank', 'noopener,noreferrer')
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
          <GlassCard className="text-center py-12">
            <h2 className="text-2xl font-bold text-white mb-4">Bienvenido a Mi Carrera</h2>
            <p className="text-[#888888] mb-6">Ingresá tu correo para ver las oportunidades que encajan con tu perfil.</p>
            <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com"
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#888888] focus:outline-none focus:border-[#c9a84c]/50" />
              <GoldButton onClick={handleSendMagicLink} disabled={sending || !email.trim()}>
                <Mail size={16} /> {sending ? 'Enviando...' : sent ? 'Reenviar' : 'Ingresar'}
              </GoldButton>
            </div>
            {sent && <p className="text-green-400 text-sm mt-3">✓ Revisá tu correo. Te enviamos un enlace mágico.</p>}
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
                {matches.slice(0, 5).map((match) => (
                  <GlassCard
                    key={match.id}
                    onClick={() => handleOpportunityClick(match)}
                    className="cursor-pointer"
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
                ))}
              </div>
              <div className="space-y-6">
                <GlassCard>
                  <h3 className="text-white font-bold mb-3 flex items-center gap-2"><Sparkles size={16} className="text-[#c9a84c]" /> Habilidades faltantes</h3>
                  {missingSkills.length > 0 ? (
                    <div className="space-y-2">
                      {missingSkills.map((skill) => (
                        <div key={skill} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                          <span className="text-gray-300 text-sm">{skill}</span>
                          <span className="text-xs text-[#c9a84c]">+Curso</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[#888888] text-sm">¡Perfil completo!</p>}
                </GlassCard>
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
