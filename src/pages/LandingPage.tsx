import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Star, Briefcase, Users, DollarSign, CheckCircle2, XCircle, Brain, Sparkles, TrendingUp } from 'lucide-react'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { Logo } from '@/components/cvitae/Logo'
import { GoldParticles, DotGrid } from '@/components/cvitae/Particles'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'
import { CVAnalyzer } from '@/components/CVAnalyzer'

function HeroSection({ magicEmail, setMagicEmail, magicSending, magicSent, setMagicSent, handleMagicLink }: {
  magicEmail: string
  setMagicEmail: (v: string) => void
  magicSending: boolean
  magicSent: boolean
  setMagicSent: (v: boolean) => void
  handleMagicLink: () => void
}) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
      <DotGrid />
      <GoldParticles />
      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Badge variant="gold" className="mb-8">
            <Star className="w-3 h-3 fill-current" />
            Top 100 Moonshot Paraguay 2026
          </Badge>
        </motion.div>
        <Logo size="hero" showTagline={true} className="mb-10" />
        <motion.p
          className="text-xl md:text-2xl lg:text-3xl text-white/90 font-light leading-relaxed max-w-4xl mx-auto mb-4"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
        >
          Las oportunidades están en{' '}
          <span className="text-[#c9a84c] font-medium">miles de lugares imposibles de seguir</span>.
        </motion.p>
        <motion.p
          className="text-xl md:text-2xl lg:text-3xl text-white/90 font-light leading-relaxed max-w-4xl mx-auto mb-4"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
        >
          Tu CV{' '}
          <span className="text-[#c9a84c] font-medium">no pasa los filtros</span>.
        </motion.p>
        <motion.p
          className="text-2xl md:text-3xl lg:text-4xl text-white font-semibold leading-relaxed max-w-4xl mx-auto mb-10"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}
        >
          CVitae resuelve los dos — <span className="text-[#c9a84c]">solo</span>.
        </motion.p>
        <motion.div
          className="flex flex-col items-center justify-center gap-4 mb-16"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}
        >
          {!magicSent ? (
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md mx-auto">
              <input
                type="email"
                value={magicEmail}
                onChange={e => setMagicEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleMagicLink()}
                placeholder="tu@email.com"
                className="flex-1 w-full px-5 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-[#888888] focus:outline-none focus:border-[#c9a84c]/50 transition-all"
              />
              <GoldButton onClick={handleMagicLink} disabled={magicSending || !magicEmail.trim()} size="lg">
                {magicSending ? 'Enviando...' : 'Empezá gratis'}
                {!magicSending && <ChevronRight className="w-5 h-5" />}
              </GoldButton>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-4xl mb-3">📬</div>
              <p className="text-white font-semibold text-lg mb-1">¡Revisá tu correo!</p>
              <p className="text-[#888888] text-sm">Te enviamos un enlace mágico a <strong className="text-[#c9a84c]">{magicEmail}</strong></p>
              <button onClick={() => { setMagicSent(false); setMagicEmail('') }} className="mt-4 text-xs text-[#555555] hover:text-white transition-colors">
                Usar otro correo
              </button>
            </div>
          )}
          <GoldButton href="/oportunidades" variant="outline" size="lg" className="mt-2">
            Ver oportunidades
          </GoldButton>
        </motion.div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  const steps = [
    { icon: '📄', title: 'Subí tu CV', description: 'Cargás tu CV una sola vez. Nuestro agente lo analiza, extrae tus skills y construye tu perfil profesional.' },
    { icon: '🔍', title: 'Buscamos por vos', description: 'Cada día escaneamos portales de empleo, becas, concursos y convocatorias en toda Latinoamérica.' },
    { icon: '⚡', title: 'Matching inteligente', description: 'Nuestra IA compara cada oportunidad con tu perfil y te muestra solo las que realmente te convienen.' },
    { icon: '🔔', title: 'Alertas personalizadas', description: 'Te notificamos al instante cuando hay algo perfecto para vos. Sin spam, solo valor.' },
  ]

  return (
    <section className="relative py-24 px-4">
      <DotGrid />
      <div className="container mx-auto max-w-6xl relative z-10">
        <motion.div className="text-center mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Badge variant="gold" className="mb-4">Cómo funciona</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">De tu CV a tu próxima oportunidad</h2>
          <p className="text-[#888888] max-w-2xl mx-auto">Un proceso simple que trabaja para vos las 24 horas</p>
        </motion.div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <GlassCard className="text-center h-full">
                <div className="text-4xl mb-4">{step.icon}</div>
                <span className="text-[#c9a84c] text-sm font-medium">Paso {index + 1}</span>
                <h3 className="text-lg font-semibold text-white mt-2 mb-2">{step.title}</h3>
                <p className="text-[#888888] text-sm leading-relaxed">{step.description}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AISection() {
  return (
    <section className="relative py-24 px-4 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#c9a84c]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <Badge variant="gold" className="mb-6">Inteligencia Artificial</Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-8 leading-tight">
              La plataforma que <span className="text-[#c9a84c]">aprende sola</span>
            </h2>
            <p className="text-[#888888] text-lg mb-10 leading-relaxed">
              Nuestra IA no solo busca palabras clave; entiende el contexto de tu carrera, 
              tus aspiraciones y cómo evoluciona el mercado laboral en tiempo real.
            </p>
            <div className="space-y-6">
              {[
                { icon: Brain, title: 'Red Neuronal de Oportunidades', desc: 'Conectamos miles de puntos de datos para encontrar el match perfecto.' },
                { icon: TrendingUp, title: 'Predicción de Carrera', desc: 'Anticipamos qué habilidades serán tendencia en tu industria.' },
                { icon: Sparkles, title: 'Optimización Dinámica', desc: 'Tu perfil se actualiza y mejora con cada nueva experiencia que sumás.' }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#c9a84c]/10 flex items-center justify-center shrink-0">
                    <item.icon className="text-[#c9a84c]" size={24} />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">{item.title}</h4>
                    <p className="text-[#888888] text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div 
            className="relative aspect-square flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <svg width="400" height="400" viewBox="0 0 400 400" className="w-full h-full opacity-40">
              <motion.circle cx="200" cy="200" r="4" fill="#c9a84c" animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 2, repeat: Infinity }} />
              {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                const x = 200 + 120 * Math.cos((angle * Math.PI) / 180)
                const y = 200 + 120 * Math.sin((angle * Math.PI) / 180)
                return (
                  <g key={i}>
                    <motion.line x1="200" y1="200" x2={x} y2={y} stroke="#c9a84c" strokeWidth="1" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} transition={{ duration: 1.5, delay: i * 0.2 }} />
                    <circle cx={x} cy={y} r="3" fill="#c9a84c" />
                    {[0, 45, 90].map((a, j) => {
                      const x2 = x + 40 * Math.cos(((angle + a - 45) * Math.PI) / 180)
                      const y2 = y + 40 * Math.sin(((angle + a - 45) * Math.PI) / 180)
                      return (
                        <g key={j}>
                          <line x1={x} y1={y} x2={x2} y2={y2} stroke="#c9a84c" strokeWidth="0.5" strokeOpacity="0.5" />
                          <circle cx={x2} cy={y2} r="1.5" fill="#c9a84c" fillOpacity="0.5" />
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </svg>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  const plans = [
    {
      name: 'Free',
      price: 'USD 0',
      description: 'Para empezar a explorar',
      features: ['Acceso a oportunidades públicas', 'Perfil básico', '1 match por día', 'Score de empleabilidad'],
      cta: 'Empezar gratis',
      popular: false,
    },
    {
      name: 'Pro',
      price: 'USD 5',
      period: '/mes',
      description: 'Para profesionales serios',
      features: ['Todo de Free', 'Matches ilimitados', 'CV optimizado para ATS', 'Análisis de vacante con IA', 'Recomendaciones de cursos', 'Soporte prioritario'],
      cta: 'Empezar prueba gratis',
      popular: true,
    },
  ]

  return (
    <section id="pricing" className="relative py-24 px-4">
      <DotGrid />
      <div className="container mx-auto max-w-4xl relative z-10">
        <motion.div className="text-center mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Badge variant="gold" className="mb-4">Precios</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Planes para cada etapa</h2>
          <p className="text-[#888888] max-w-2xl mx-auto">Empezá gratis y escalá cuando estés listo</p>
        </motion.div>
        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`relative rounded-2xl p-6 transition-all duration-300 ${
                plan.popular
                  ? 'bg-gradient-to-b from-[#c9a84c]/20 to-[#c9a84c]/5 border-2 border-[#c9a84c] shadow-[0_0_40px_rgba(201,168,76,0.3)] scale-105 z-10'
                  : 'bg-white/[0.03] backdrop-blur-xl border border-white/10'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="gold"><Star className="w-3 h-3 fill-current" />Más popular</Badge>
                </div>
              )}
              <div className="text-center mb-6 pt-4">
                <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-[#c9a84c]">{plan.price}</span>
                  {plan.period && <span className="text-[#888888]">{plan.period}</span>}
                </div>
                <p className="text-sm text-[#888888] mt-2">{plan.description}</p>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-white/80">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    {feature}
                  </li>
                ))}
              </ul>
              <GoldButton variant={plan.popular ? 'solid' : 'outline'} className="w-full" href="/mi-carrera">
                {plan.cta}
              </GoldButton>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  const [magicEmail, setMagicEmail] = useState('')
  const [magicSending, setMagicSending] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  const handleMagicLink = async () => {
    if (!magicEmail.trim()) return
    setMagicSending(true)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      )
      await supabase.auth.signInWithOtp({
        email: magicEmail,
        options: { emailRedirectTo: 'https://cvitae-py.netlify.app/auth/callback' }
      })
      setMagicSent(true)
    } catch {
      alert('Error al enviar el enlace. Intentá de nuevo.')
    } finally {
      setMagicSending(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <HeroSection
        magicEmail={magicEmail}
        setMagicEmail={setMagicEmail}
        magicSending={magicSending}
        magicSent={magicSent}
        setMagicSent={setMagicSent}
        handleMagicLink={handleMagicLink}
      />
      <HowItWorksSection />
      {/* ==================== CV ANALYZER SECTION ==================== */}
      <section id="cv-analyzer" className="relative py-24">
        <DotGrid />
        <div className="container mx-auto max-w-4xl relative z-10">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge variant="gold" className="mb-4">Analizador de CV</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Analizá tu CV gratis ahora
            </h2>
            <p className="text-[#888888] max-w-2xl mx-auto">
              Descubrí tu score ATS y mejorá tu perfil profesional en 60 segundos.
            </p>
          </motion.div>
          <CVAnalyzer />
        </div>
      </section>
      <AISection />
      <PricingSection />
      <Footer />
    </main>
  )
}
