import { useState, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight, Star, Briefcase, Users, CheckCircle2,
  Brain, Sparkles, TrendingUp, Mail, Building2, Zap, Loader2,
  Upload, FileText, ArrowRight
} from 'lucide-react'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { GoldParticles, DotGrid } from '@/components/cvitae/Particles'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'
import { ProgressLine } from '@/components/cvitae/ProgressLine'
import { supabase } from '@/lib/supabase'
import { analytics } from '@/lib/analytics'

// ─── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  const [email, setEmail] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!allowed.includes(f.type)) { setErrorMsg('Formato no soportado. Usá PDF, DOCX o TXT.'); return }
    if (f.size > 5 * 1024 * 1024) { setErrorMsg('El archivo no puede superar 5 MB.'); return }
    setFile(f); setErrorMsg('')
  }

  const handleSubmit = async () => {
    if (!email.trim() || !file) return
    setStep('loading')
    setErrorMsg('')
    try {
      // Magic link auth
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: 'https://cvitae.lat/auth/callback' }
      })
      if (authError) throw authError

      // Store file in sessionStorage so Dashboard can pick it up post-auth
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = (e.target?.result as string)?.split(',')[1]
        if (base64) {
          sessionStorage.setItem('pending_cv', JSON.stringify({ name: file!.name, type: file!.type, base64 }))
        }
      }
      reader.readAsDataURL(file)

      analytics.cvAnalyzed('hero_onboarding')
      setStep('sent')
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocurrió un error. Intentá de nuevo.')
      setStep('error')
    }
  }

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
      <DotGrid />
      <GoldParticles />

      {/* Organic progress line as decorative background element */}
      <div className="absolute bottom-24 left-0 right-0 flex justify-center opacity-20 pointer-events-none select-none">
        <ProgressLine percentage={100} width={900} height={100} animated />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Badge variant="gold" className="mb-8">
            <Star className="w-3 h-3 fill-current" />
            Top 100 Moonshot Paraguay 2026
          </Badge>
        </motion.div>

        {/* Logo/Title with Playfair Display */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mb-6">
          <h1 className="text-6xl md:text-8xl leading-none tracking-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
            <span className="font-black text-gold">CV</span><span className="font-normal italic text-white">itae</span>
          </h1>
        </motion.div>

        <motion.p
          className="text-xl md:text-2xl text-white/80 font-light leading-relaxed max-w-2xl mx-auto mb-3"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
        >
          El ecosistema de talento con IA para Paraguay y Latinoamérica.
        </motion.p>
        <motion.p
          className="text-base md:text-lg text-muted font-light leading-relaxed max-w-xl mx-auto mb-12"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
        >
          Candidatos que consiguen el trabajo ideal. Empresas que encuentran al candidato perfecto.
        </motion.p>

        {/* One-step registration form */}
        <motion.div
          className="max-w-lg mx-auto"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
        >
          <AnimatePresence mode="wait">
            {step === 'sent' ? (
              <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="border border-gold bg-gold/5 rounded-2xl p-8 text-center">
                <div className="text-4xl mb-4">🎉</div>
                <h3 className="text-white font-bold text-xl mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                  ¡Revisá tu correo!
                </h3>
                <p className="text-muted text-sm">
                  Te enviamos un enlace mágico a <strong>{email}</strong>.
                  Tu CV queda guardado para cuando ingreses.
                </p>
              </motion.div>
            ) : (
              <motion.div key="form"
                className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
                <p className="text-white font-semibold text-sm text-left">Analizá tu CV gratis</p>

                {/* File input */}
                <div
                  onClick={() => !file && fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
                    file
                      ? 'border-gold/40 bg-gold/5'
                      : 'border-dashed border-white/15 hover:border-white/30 hover:bg-white/[0.02]'
                  }`}
                >
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                  {file ? (
                    <>
                      <FileText className="text-gold shrink-0" size={20} />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white text-sm font-medium truncate">{file.name}</p>
                        <p className="text-muted text-xs">{(file.size / 1024).toFixed(0)} KB · listo</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setFile(null) }} className="text-muted/50 hover:text-white text-xs transition-colors">cambiar</button>
                    </>
                  ) : (
                    <>
                      <Upload className="text-muted/50 shrink-0" size={20} />
                      <p className="text-muted text-sm text-left">
                        Subí tu CV <span className="text-muted/50">— PDF, DOCX o TXT</span>
                      </p>
                    </>
                  )}
                </div>

                {/* Email input */}
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  disabled={step === 'loading'}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#555] focus:outline-none focus:border-gold/50 transition-all text-sm"
                />

                {errorMsg && <p className="text-red-400 text-sm text-left">{errorMsg}</p>}

                <GoldButton
                  onClick={handleSubmit}
                  disabled={!email.trim() || !file || step === 'loading'}
                  className="w-full"
                  size="lg"
                >
                  {step === 'loading'
                    ? <><Loader2 className="animate-spin" size={16} />Analizando...</>
                    : <>Analizar mi CV <ArrowRight size={16} /></>}
                </GoldButton>

                <p className="text-muted/40 text-xs text-center">
                  Gratis · Sin tarjeta · Resultados en 60 segundos
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-10 text-sm text-muted"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
        >
          <GoldButton href="/empresas" variant="ghost" size="sm">
            Soy empresa — ver herramientas B2B <ChevronRight size={14} />
          </GoldButton>
          <GoldButton href="/oportunidades" variant="ghost" size="sm">
            Ver oportunidades activas <ChevronRight size={14} />
          </GoldButton>
        </motion.div>
      </div>
    </section>
  )
}

// ─── Círculo virtuoso B2C / B2B ────────────────────────────────────────────────

function VirtuousCycleSection() {
  return (
    <section className="relative py-24 px-4 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gold/4 rounded-full blur-[120px] pointer-events-none" />
      <div className="container mx-auto max-w-5xl relative z-10">
        <motion.div className="text-center mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Badge variant="gold" className="mb-4">El ecosistema</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            Dos lados que se potencian
          </h2>
          <p className="text-muted max-w-xl mx-auto leading-relaxed">
            Cada vacante publicada por una empresa alimenta la base de candidatos B2C.
            Cada CV analizado enriquece el banco de talento B2B.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          {/* B2C */}
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
            className="border border-gold/20 bg-gold/5 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                <Briefcase className="text-gold" size={20} />
              </div>
              <div>
                <Badge variant="gold" className="text-[10px] mb-1">Para Candidatos</Badge>
                <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>Perfil "Camila"</h3>
              </div>
            </div>
            <ul className="space-y-3 mb-6">
              {[
                'Subís tu CV una sola vez',
                'Recibís tu Score de Empleabilidad',
                'Matching automático con oportunidades',
                'CV Vivo adaptado por IA para cada vacante',
                'Recomendación de cursos para cerrar brechas',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-white/80">
                  <CheckCircle2 size={14} className="text-gold mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <GoldButton href="/mi-carrera" variant="solid" size="sm">
              Empezar gratis <ChevronRight size={14} />
            </GoldButton>
          </motion.div>

          {/* B2B */}
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
            className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                <Building2 className="text-muted" size={20} />
              </div>
              <div>
                <Badge variant="muted" className="text-[10px] mb-1">Para Empresas · Beta</Badge>
                <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>Perfil "Martín"</h3>
              </div>
            </div>
            <ul className="space-y-3 mb-6">
              {[
                'Subís hasta 30 CVs en un lote',
                'Ranking comparativo con Top 3 automático',
                'Score ATS + fit por candidato',
                'Banco de talento acumulado por vacante',
                'Cada link de postulación nutre la base B2C',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-white/80">
                  <CheckCircle2 size={14} className="text-muted mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <GoldButton href="/#empresas" variant="outline" size="sm">
              Solicitar acceso Beta <ChevronRight size={14} />
            </GoldButton>
          </motion.div>
        </div>

        {/* Arrow connecting both */}
        <motion.div className="flex items-center justify-center mt-8 gap-4 text-muted text-sm"
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.4 }}>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#c9a84c]/30 to-transparent" />
          <span className="shrink-0 text-gold font-medium px-3">el círculo virtuoso</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#c9a84c]/30 to-transparent" />
        </motion.div>
      </div>
    </section>
  )
}

// ─── Cómo funciona ─────────────────────────────────────────────────────────────

function HowItWorksSection() {
  const steps = [
    { icon: '📄', title: 'Subí tu CV', description: 'Cargás tu CV una sola vez. La IA lo analiza, extrae tus skills y construye tu perfil profesional automáticamente.' },
    { icon: '🔍', title: 'Buscamos por vos', description: 'Cada día escaneamos portales de empleo, becas, concursos y convocatorias en toda Latinoamérica.' },
    { icon: '⚡', title: 'Matching inteligente', description: 'Comparamos cada oportunidad con tu perfil y te mostramos solo las que realmente te convienen.' },
    { icon: '🔔', title: 'Alertas personalizadas', description: 'Te notificamos cuando aparece algo perfecto para vos. Sin spam, solo valor real.' },
  ]

  return (
    <section className="relative py-24 px-4">
      <DotGrid />
      <div className="container mx-auto max-w-6xl relative z-10">
        <motion.div className="text-center mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Badge variant="gold" className="mb-4">Cómo funciona</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            De tu CV a tu próxima oportunidad
          </h2>
          <p className="text-muted max-w-2xl mx-auto">Un proceso simple que trabaja para vos las 24 horas</p>
        </motion.div>

        {/* Progress line threading through the steps */}
        <div className="hidden md:flex justify-center mb-8 opacity-40">
          <ProgressLine percentage={100} width={700} height={50} animated={false} />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <motion.div key={index} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }}>
              <GlassCard className="text-center h-full">
                <div className="text-4xl mb-4">{step.icon}</div>
                <span className="text-gold text-sm font-medium">Paso {index + 1}</span>
                <h3 className="text-lg font-semibold text-white mt-2 mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>{step.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{step.description}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Precios ───────────────────────────────────────────────────────────────────

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
      price: 'USD 9',
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
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>Planes para cada etapa</h2>
          <p className="text-muted max-w-2xl mx-auto">Empezá gratis y escalá cuando estés listo</p>
        </motion.div>
        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }}
              className={`relative rounded-2xl p-6 transition-all duration-300 ${
                plan.popular
                  ? 'bg-gold/5 border-2 border-gold shadow-[0_0_40px_rgba(201,168,76,0.2)] scale-105 z-10'
                  : 'bg-white/[0.03] backdrop-blur-xl border border-white/10'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="gold"><Star className="w-3 h-3 fill-current" />Más popular</Badge>
                </div>
              )}
              <div className="text-center mb-6 pt-4">
                <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-gold">{plan.price}</span>
                  {plan.period && <span className="text-muted">{plan.period}</span>}
                </div>
                <p className="text-sm text-muted mt-2">{plan.description}</p>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-white/80">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-gold" />
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

// ─── Sección B2B ───────────────────────────────────────────────────────────────

function B2BSection() {
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formCompany, setFormCompany] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')

  const handleSubmit = async () => {
    if (!formEmail.trim() || !formCompany.trim()) {
      setFormError('El email y el nombre de empresa son obligatorios.')
      return
    }
    setSending(true); setFormError('')
    try {
      const res = await fetch('/.netlify/functions/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim() || null, email: formEmail.trim().toLowerCase(), company: formCompany.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al registrar')
      if (data.success === false) {
        setFormError(data.error)
      } else {
        analytics.b2bLeadSent(formCompany.trim())
        setSent(true)
      }
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setSending(false)
    }
  }

  const benefits = [
    { icon: Zap, title: 'Análisis en segundos', desc: 'La IA lee el CV y da un score ATS, fortalezas y debilidades del candidato al instante. Sin leer pilas de PDFs.' },
    { icon: Users, title: 'Historial y ranking', desc: 'Todos los CVs analizados quedan guardados con score y puesto. Filtrá por los mejores con un clic.' },
    { icon: Building2, title: 'Para equipos de RRHH', desc: 'Panel con token de acceso, historial por vacante y candidatos destacados marcados con estrella.' },
  ]

  return (
    <section id="empresas" className="relative py-24 px-4 overflow-hidden">
      <DotGrid />
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[500px] h-[500px] bg-gold/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="container mx-auto max-w-6xl relative z-10">

        <motion.div className="text-center mb-16" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Badge variant="gold" className="mb-4"><Building2 size={12} />Para Empresas · Beta</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            ¿Buscando talento en Paraguay?
          </h2>
          <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
            Subí el CV de cualquier candidato y la IA te dice en segundos si es el perfil que necesitás.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div className="space-y-6" initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            {benefits.map((b, i) => (
              <motion.div key={i} className="flex gap-4" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                  <b.icon className="text-gold" size={22} />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1">{b.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{b.desc}</p>
                </div>
              </motion.div>
            ))}

            <div className="pt-6 border-t border-white/5 space-y-3">
              <div className="border border-gold bg-gold/5 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-sm">Plan Empresa</p>
                  <p className="text-muted/50 text-xs">Hasta 5 usuarios · 100 análisis/mes</p>
                </div>
                <div className="text-right">
                  <p className="text-gold font-bold text-xl">USD 79</p>
                  <p className="text-muted/50 text-xs">/mes</p>
                </div>
              </div>
              <p className="text-muted/40 text-xs text-center">
                <Star size={10} className="inline mr-1 text-gold" />
                Seleccionado entre los proyectos destacados de Moonshot Paraguay 2026
              </p>
            </div>
          </motion.div>

          {/* Formulario con glassmorphism (superficie secundaria) */}
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <GlassCard className="relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-gold/10 rounded-full blur-[60px] pointer-events-none" />
              <AnimatePresence mode="wait">
                {sent ? (
                  <motion.div key="sent" className="text-center py-8" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                    <div className="text-5xl mb-4">🎉</div>
                    <h3 className="text-white font-bold text-xl mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>¡Estás en la lista!</h3>
                    <p className="text-muted text-sm leading-relaxed">
                      Te contactamos a <strong>{formEmail}</strong> para coordinar el acceso a la Beta.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
                      <CheckCircle2 size={14} className="text-gold" />Respuesta en menos de 48 hs
                    </div>
                    <div className="mt-4">
                      <GoldButton href="/empresas" variant="outline" size="sm">
                        Ya tengo token — Ir al panel
                      </GoldButton>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="relative space-y-4">
                    <div>
                      <h3 className="text-white font-bold text-xl mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>Solicitá acceso a la Beta</h3>
                      <p className="text-muted text-sm">Gratis durante el período de prueba. Sin tarjeta requerida.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Tu nombre (opcional)</label>
                      <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="María García"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#3a3a3a] focus:outline-none focus:border-gold/50 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Email corporativo <span className="text-gold">*</span></label>
                      <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="maria@empresa.com.py"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#3a3a3a] focus:outline-none focus:border-gold/50 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Empresa <span className="text-gold">*</span></label>
                      <input type="text" value={formCompany} onChange={e => setFormCompany(e.target.value)} placeholder="Nombre de tu empresa"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#3a3a3a] focus:outline-none focus:border-gold/50 transition-all text-sm" />
                    </div>
                    {formError && <p className="text-red-400 text-sm">{formError}</p>}
                    <GoldButton onClick={handleSubmit} disabled={sending || !formEmail.trim() || !formCompany.trim()} className="w-full" size="lg">
                      {sending ? <><Loader2 className="animate-spin" size={16} />Enviando...</> : <><Mail size={16} />Solicitar acceso gratuito<ChevronRight size={16} /></>}
                    </GoldButton>
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs text-muted/50">
                        O escribinos a{' '}
                        <a href="mailto:contacto@cvitae.lat" className="text-gold hover:underline">contacto@cvitae.lat</a>
                      </p>
                      <GoldButton href="/empresas" variant="ghost" size="sm" className="text-xs">
                        Ya tengo token →
                      </GoldButton>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ─── Export ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <Helmet>
        <title>CVitae | Tu Agente de Carrera Inteligente para Paraguay</title>
        <meta name="description" content="El ecosistema de talento con IA para Paraguay y LatAm. Candidatos que consiguen el trabajo ideal. Empresas que encuentran al candidato perfecto." />
      </Helmet>
      <Navbar />
      <HeroSection />
      <VirtuousCycleSection />
      <HowItWorksSection />
      <PricingSection />
      <B2BSection />
      <Footer />
    </main>
  )
}
