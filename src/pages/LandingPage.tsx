import { useState, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { motion } from 'framer-motion'
import {
  Upload, Mail, Sparkles, Brain, Building2, Check, ArrowRight,
  FileText, Loader2, Users, ChevronRight,
} from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { GrowthLine, CompatibilityTrace, Eyebrow } from '@/components/cv/visuals'
import { supabase } from '@/lib/supabase'
import { analytics } from '@/lib/analytics'

const ease = [0.22, 1, 0.36, 1] as const

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-16 sm:pb-16 sm:pt-24">
        <Eyebrow>Talento con IA · Paraguay &amp; LATAM</Eyebrow>
        <h1 className="font-display mt-3 max-w-3xl text-4xl leading-[1.05] text-cream sm:text-6xl">
          Las oportunidades están <em>dispersas</em>.
          <br />Tu CV no pasa los <em>filtros</em>.
          <br />CVitae resuelve las dos cosas.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Becas, diplomados, concursos y empleos llegan desperdigados por mil grupos.
          Y los CVs buenos quedan afuera por un filtro automático. CVitae junta todo
          y te ayuda a llegar.
        </p>
        <div className="relative mt-10 max-w-2xl">
          <GrowthLine className="absolute -top-6 left-0 right-0 h-20 opacity-50" />
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="#registro"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a84c] px-6 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.5)]"
          >
            <Upload className="h-4 w-4" /> Subir mi CV
          </a>
          <a
            href="#analizador"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 px-6 text-sm text-cream transition hover:border-white/25"
          >
            Probar el analizador <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

// ─── RegistroBlock ────────────────────────────────────────────────────────────

function RegistroBlock() {
  const [email, setEmail] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (f.size > 5 * 1024 * 1024) { setErrorMsg('El archivo no puede superar 5 MB.'); return }
    setFile(f); setErrorMsg('')
  }

  const handleSubmit = async () => {
    if (!email.trim() || !file) return
    setStep('loading'); setErrorMsg('')
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: 'https://cvitae.lat/auth/callback' },
      })
      if (authError) throw authError
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

  if (step === 'sent') {
    return (
      <section id="registro" className="mx-auto max-w-6xl px-6 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          className="mx-auto max-w-lg rounded-3xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.05] p-8 text-center sm:p-12"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10">
            <Check className="h-7 w-7 text-[#c9a84c]" />
          </div>
          <h2 className="font-display mt-6 text-2xl text-cream">¡Revisá tu correo!</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Te enviamos un enlace mágico a <strong className="text-white">{email}</strong>.
            Tu CV queda guardado para cuando ingreses.
          </p>
        </motion.div>
      </section>
    )
  }

  return (
    <section id="registro" className="mx-auto max-w-6xl px-6 py-16">
      <div className="relative overflow-hidden rounded-3xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.03] p-8 sm:p-12">
        <div className="absolute -inset-2 -z-10 bg-gradient-to-br from-[#c9a84c]/10 via-transparent to-transparent blur-3xl" />
        <GrowthLine className="absolute -top-2 left-0 right-0 h-24 opacity-60" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Eyebrow>Registro en un solo paso</Eyebrow>
            <h2 className="font-display mt-2 text-3xl leading-tight text-cream sm:text-4xl">
              Subís tu CV y tu correo.
              <br />La IA <em>arma tu perfil</em> al instante.
            </h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              Sin formularios de 5 pasos. La IA lee tu PDF, extrae nombre, título,
              habilidades, experiencia y cursos, y deja tu perfil listo para recibir matches.
              Después, si querés, ajustás los detalles.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-cream/90">
              {['Extracción automática del CV', 'Score de empleabilidad inicial', 'Primeros matches en menos de 1 minuto'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-[#c9a84c]" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            <label
              className="glass-card block cursor-pointer rounded-2xl p-6 text-center transition hover:border-[#c9a84c]/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              {file ? (
                <>
                  <FileText className="mx-auto h-6 w-6 text-[#c9a84c]" />
                  <p className="font-display mt-3 truncate text-base text-cream">{file.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · listo</p>
                  <button onClick={(e) => { e.preventDefault(); setFile(null) }} className="mt-1 text-xs text-muted-foreground underline hover:text-cream">cambiar</button>
                </>
              ) : (
                <>
                  <Upload className="mx-auto h-6 w-6 text-[#c9a84c]" />
                  <p className="font-display mt-3 text-lg text-cream">Arrastrá tu CV aquí</p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF · hasta 5 MB</p>
                </>
              )}
              <input ref={fileRef} type="file" accept="application/pdf,.docx,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] pl-10 pr-3 py-3 text-sm text-cream placeholder:text-muted-foreground outline-none focus:border-[#c9a84c]/50 transition"
              />
            </div>
            {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
            <button
              onClick={handleSubmit}
              disabled={!email.trim() || !file || step === 'loading'}
              className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {step === 'loading'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                : <>Crear mi perfil con IA <ArrowRight className="h-4 w-4" /></>}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">Sin contraseña. Te enviamos un enlace mágico.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Cómo funciona ────────────────────────────────────────────────────────────

function ComoFunciona() {
  const steps = [
    { n: '01', t: 'Subís tu CV una vez', d: 'La IA lee y entiende tu trayectoria completa.' },
    { n: '02', t: 'Buscamos por vos cada día', d: 'Empleos, becas y foros en toda Latinoamérica.' },
    { n: '03', t: 'Matching inteligente', d: 'Contexto de carrera, no palabras clave sueltas.' },
    { n: '04', t: 'Alertas personalizadas', d: 'Recibís solo lo que encaja con tu próximo paso.' },
  ]
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <Eyebrow>Cómo funciona</Eyebrow>
      <h2 className="font-display mt-2 max-w-xl text-3xl text-cream sm:text-4xl">
        Cuatro pasos. <em>Cero ruido.</em>
      </h2>
      <div className="relative mt-12">
        <GrowthLine className="absolute -top-6 left-0 right-0 hidden h-16 opacity-40 md:block" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.07, ease }}
              className="glass-panel p-6"
            >
              <span className="font-display italic text-[#c9a84c]">{s.n}</span>
              <h3 className="font-display mt-2 text-xl text-cream">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── IA Tech ──────────────────────────────────────────────────────────────────

function IATech() {
  const items = [
    { Icon: Brain, t: 'Red neuronal de oportunidades', d: 'Conecta vacantes, becas y cursos por contexto, no por keyword exacto.' },
    { Icon: Sparkles, t: 'Predicción de carrera', d: 'Te muestra qué rol viene después en tu camino, según patrones reales.' },
    { Icon: FileText, t: 'Optimización dinámica del perfil', d: 'Tu CV se adapta a cada vacante para pasar filtros ATS sin perder tu voz.' },
  ]
  return (
    <section className="mx-auto max-w-6xl border-t border-white/8 px-6 py-20">
      <Eyebrow>IA que entiende tu carrera</Eyebrow>
      <h2 className="font-display mt-2 max-w-2xl text-3xl text-cream sm:text-4xl">
        No es <em>palabra clave</em>. Es contexto.
      </h2>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Entrenada con miles de CVs y vacantes paraguayas. Lee tu trayectoria como
        una persona técnica, no como un buscador de texto.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {items.map(({ Icon, t, d }, i) => (
          <motion.div
            key={t}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.08, ease }}
            className="editorial-panel p-6"
          >
            <Icon className="h-5 w-5 text-[#c9a84c]" />
            <h3 className="font-display mt-3 text-xl text-cream">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── Stats bar ───────────────────────────────────────────────────────────────

const STATS = [
  { value: '4.500+', label: 'oportunidades activas' },
  { value: 'Diario', label: 'se actualiza el listado' },
  { value: 'PY · remoto · becas', label: 'Paraguay, LatAm e internacionales' },
]

function StatsBar() {
  return (
    <section className="border-y border-white/8 bg-white/[0.015] py-8">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-3 divide-x divide-white/8">
          {STATS.map(({ value, label }, i) => (
            <motion.div
              key={value}
              initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08, ease }}
              className="flex flex-col items-center px-4 text-center"
            >
              <span className="font-display text-2xl font-bold text-[#c9a84c] sm:text-3xl">{value}</span>
              <span className="mt-1 text-xs text-white/50 sm:text-sm">{label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Analizador ───────────────────────────────────────────────────────────────

function Analizador() {
  const [cv, setCv] = useState<File | null>(null)
  const [analyzed, setAnalyzed] = useState(false)
  return (
    <section id="analizador" className="mx-auto max-w-6xl border-t border-white/8 px-6 py-20">
      <Eyebrow>Probalo antes de registrarte</Eyebrow>
      <h2 className="font-display mt-2 max-w-2xl text-3xl text-cream sm:text-4xl">
        Analizador de CV <em>gratis</em>.
      </h2>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Subí tu CV y mirá en segundos qué tan ATS-friendly es y dónde mejorar.
      </p>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="editorial-panel p-8">
          <label className="block cursor-pointer rounded-2xl border border-dashed border-white/15 p-10 text-center transition hover:border-[#c9a84c]/50">
            <Upload className="mx-auto h-6 w-6 text-[#c9a84c]" />
            <p className="font-display mt-3 text-lg text-cream">{cv?.name ?? 'Subí tu CV en PDF'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Procesado en tu navegador, sin guardar nada.</p>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setCv(e.target.files?.[0] ?? null)} />
          </label>
          <button
            className="mt-4 inline-flex w-full h-11 items-center justify-center rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setAnalyzed(true)}
            disabled={!cv}
          >
            Analizar ahora
          </button>
        </div>
        <div className="editorial-panel p-8">
          {analyzed ? (
            <>
              <CompatibilityTrace score={72} label="Score ATS estimado" />
              <div className="mt-5 space-y-3 text-sm">
                <p className="text-cream"><span className="mr-2 font-display italic text-[#c9a84c]">+</span>Estructura clara y experiencia cuantificada.</p>
                <p className="text-cream"><span className="mr-2 font-display italic text-[#c9a84c]">!</span>Faltan 3 keywords críticas del rubro.</p>
                <p className="text-cream"><span className="mr-2 font-display italic text-[#c9a84c]">!</span>Diseño con tablas: 40% de ATS no lo leen.</p>
              </div>
              <p className="mt-5 text-xs text-muted-foreground">¿Querés el análisis completo y un CV optimizado por vacante? Creá tu perfil.</p>
            </>
          ) : (
            <div className="grid min-h-[280px] place-items-center text-center">
              <div>
                <Sparkles className="mx-auto h-6 w-6 text-[#c9a84c]" />
                <p className="font-display mt-3 text-lg text-cream">Tu análisis aparecerá aquí</p>
                <p className="mt-1 text-xs text-muted-foreground">Score ATS, fortalezas y mejoras críticas.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Precios ──────────────────────────────────────────────────────────────────

function Pricing() {
  const tiers = [
    {
      name: 'Free', price: 'Gs. 0', per: 'para siempre',
      features: ['Acceso a oportunidades públicas', 'Perfil básico generado por IA', '1 match por día', 'Alertas semanales'],
      cta: 'Empezar gratis', featured: false,
    },
    {
      name: 'Pro', price: 'USD 9', per: '/ mes',
      features: ['Matches ilimitados', 'CV optimizado para ATS por vacante', 'Análisis de vacante con IA', 'Recomendación de cursos', 'Soporte prioritario'],
      cta: 'Probar Pro', featured: true,
    },
  ]
  return (
    <section className="mx-auto max-w-6xl border-t border-white/8 px-6 py-20">
      <Eyebrow>Para candidatos</Eyebrow>
      <h2 className="font-display mt-2 text-3xl text-cream sm:text-4xl">
        Empezá <em>gratis</em>. Subí cuando lo necesites.
      </h2>
      <div className="mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
        {tiers.map((t, i) => (
          <motion.div
            key={t.name}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.08, ease }}
            className={t.featured ? 'rounded-3xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.04] p-8' : 'glass-panel rounded-3xl p-8'}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-2xl text-cream">{t.name}</h3>
              {t.featured && (
                <span className="rounded-full border border-[#c9a84c]/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#c9a84c]">
                  Recomendado
                </span>
              )}
            </div>
            <p className="font-display mt-4 text-4xl text-cream">
              {t.price}<span className="ml-1 text-sm text-muted-foreground">{t.per}</span>
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-cream/90">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a84c]" /> {f}
                </li>
              ))}
            </ul>
            <a
              href="#registro"
              className={`mt-8 inline-flex w-full h-10 items-center justify-center rounded-full text-sm font-medium transition ${
                t.featured
                  ? 'bg-[#c9a84c] text-[#0a0a0a] hover:bg-[#e6cf8a]'
                  : 'border border-white/10 text-cream hover:border-white/25'
              }`}
            >
              {t.cta}
            </a>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── Beta B2C ─────────────────────────────────────────────────────────────────

function BetaB2CForm() {
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'already' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!correo.trim()) { setError('El correo es requerido'); return }
    setSending(true); setError('')
    try {
      const res = await fetch('/.netlify/functions/submit-beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre.trim() || undefined, email: correo.trim(), source: 'landing_b2c' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al enviar')
      if (data.already) { setStatus('already'); return }
      setStatus('success')
    } catch (err: any) {
      setError(err.message || 'Error al enviar. Intentá de nuevo.')
      setStatus('error')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="mx-auto max-w-6xl border-t border-white/8 px-6 py-20">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Eyebrow>Beta cerrada — candidatos</Eyebrow>
          <h2 className="font-display mt-2 max-w-xl text-3xl text-cream sm:text-4xl">
            Sé de los primeros en usar <em>CVitae</em>.
          </h2>
          <p className="mt-4 max-w-lg text-muted-foreground">
            Plazas limitadas. Te contactamos para coordinar tu acceso.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-cream/90">
            {['Acceso anticipado a todas las funciones', 'Matches con empleos, becas y diplomados', 'CV optimizado por IA para cada vacante'].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a84c]" /> {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Beta form */}
        <div className="glass-card rounded-3xl p-8">
          {status === 'success' ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10">
                <Check className="h-6 w-6 text-[#c9a84c]" />
              </div>
              <h3 className="font-display mt-6 text-xl text-cream">¡Estás en la lista!</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Te escribimos en 48 horas a <strong className="text-white">{correo}</strong>.
              </p>
            </div>
          ) : status === 'already' ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10">
                <Check className="h-6 w-6 text-[#c9a84c]" />
              </div>
              <h3 className="font-display mt-6 text-xl text-cream">Ya estás en la lista.</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Te contactamos pronto a <strong className="text-white">{correo}</strong>.
              </p>
            </div>
          ) : (
            <>
              <Eyebrow>Solicitar acceso anticipado</Eyebrow>
              <h3 className="font-display mt-2 text-2xl text-cream">Reservá tu lugar en la Beta.</h3>
              <div className="mt-6 space-y-3">
                <input
                  placeholder="Nombre (opcional)" value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-cream placeholder:text-muted-foreground outline-none focus:border-[#c9a84c]/50 transition"
                />
                <input
                  type="email" placeholder="tu@correo.com" value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-cream placeholder:text-muted-foreground outline-none focus:border-[#c9a84c]/50 transition"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  onClick={handleSubmit} disabled={sending || !correo.trim()}
                  className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</> : 'Solicitar mi lugar'}
                </button>
              </div>
              <p className="mt-4 text-center text-[11px] text-muted-foreground">
                Sin compromiso. Te avisamos cuando tu acceso esté listo.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Para Empresas ────────────────────────────────────────────────────────────

function ParaEmpresas() {
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!correo.trim() || !empresa.trim()) { setError('Correo y empresa son requeridos'); return }
    setSending(true)
    try {
      const res = await fetch('/.netlify/functions/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre, email: correo, company: empresa }),
      })
      if (!res.ok) throw new Error('Error al enviar')
      analytics.b2bLeadSent(empresa)
      setSent(true)
    } catch {
      setError('Error al enviar. Escribinos a contacto@cvitae.lat')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="mx-auto max-w-6xl border-t border-white/8 px-6 py-20">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Eyebrow>Para empresas</Eyebrow>
          <h2 className="font-display mt-2 max-w-xl text-3xl text-cream sm:text-4xl">
            Subí un <em>lote de CVs</em>. Recibí el Top 3 listo para entrevistar.
          </h2>
          <p className="mt-4 max-w-lg text-muted-foreground">
            La IA lee, clasifica con criterio ATS, compara entre sí y te entrega
            un ranking con justificación. Cero horas filtrando PDFs.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-cream/90">
            {['Análisis masivo ilimitado', 'Ranking comparativo con score y matches clave', 'Banco de talento acumulado por la empresa', 'Link de postulación propio'].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a84c]" /> {f}
              </li>
            ))}
          </ul>

          {/* Price card */}
          <div className="relative mt-8 max-w-md overflow-hidden rounded-3xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.04] p-6">
            <div className="absolute -inset-1 -z-10 rounded-[2rem] bg-gradient-to-br from-[#c9a84c]/10 via-transparent to-transparent blur-2xl" />
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-xl text-cream">Plan Empresa</h3>
              <Building2 className="h-4 w-4 text-[#c9a84c]" />
            </div>
            <p className="font-display mt-3 text-3xl text-cream">
              USD 79<span className="ml-1 text-sm text-muted-foreground">/ mes</span>
            </p>
            <p className="text-xs text-muted-foreground">o Gs. 500.000 / mes</p>
            <Link
              href="/empresas"
              className="mt-5 inline-flex items-center gap-2 text-sm text-[#c9a84c] transition hover:text-[#e6cf8a]"
            >
              Acceder al panel <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Lead form */}
        <div className="glass-card rounded-3xl p-8">
          {sent ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10">
                <Check className="h-6 w-6 text-[#c9a84c]" />
              </div>
              <h3 className="font-display mt-6 text-xl text-cream">¡Estás en la lista!</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Te contactamos a <strong className="text-white">{correo}</strong> para coordinar el acceso a la Beta.
              </p>
            </div>
          ) : (
            <>
              <Eyebrow>Acceso a la Beta</Eyebrow>
              <h3 className="font-display mt-2 text-2xl text-cream">Probá CVitae para tu equipo de RRHH.</h3>
              <div className="mt-6 space-y-3">
                <input
                  placeholder="Nombre (opcional)" value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-cream placeholder:text-muted-foreground outline-none focus:border-[#c9a84c]/50 transition"
                />
                <input
                  type="email" placeholder="Correo corporativo" value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-cream placeholder:text-muted-foreground outline-none focus:border-[#c9a84c]/50 transition"
                />
                <input
                  placeholder="Empresa" value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-cream placeholder:text-muted-foreground outline-none focus:border-[#c9a84c]/50 transition"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  onClick={handleSubmit} disabled={sending}
                  className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.5)] disabled:opacity-50"
                >
                  {sending ? 'Enviando…' : 'Solicitar acceso'}
                </button>
              </div>
              <p className="mt-4 text-center text-[11px] text-muted-foreground">
                Gratis durante el período de prueba. Sin tarjeta requerida.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <Helmet>
        <title>CVitae — Tu carrera, con intención</title>
        <meta name="description" content="Ecosistema de gestión de talento con IA para Paraguay. Subí tu CV y tu correo: la IA arma tu perfil y te conecta con las oportunidades reales." />
        <link rel="canonical" href="https://cvitae.lat" />
        <meta property="og:title" content="CVitae — Tu carrera, con intención" />
        <meta property="og:description" content="Subí tu CV + tu correo. La IA arma tu perfil al instante y te matchea con empleos, becas y diplomados reales en Paraguay y Latinoamérica." />
        <meta property="og:url" content="https://cvitae.lat" />
        <meta property="og:type" content="website" />
      </Helmet>
      <SiteShell>
        <Hero />
        <RegistroBlock />
        <ComoFunciona />
        <IATech />
        <StatsBar />
        <Analizador />
        <Pricing />
        <BetaB2CForm />
        <ParaEmpresas />
      </SiteShell>
    </>
  )
}
