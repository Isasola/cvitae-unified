import { useState, useRef, type ChangeEvent, type FormEvent } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Sparkles, Brain, Building2, Check, ArrowRight,
  FileText, Loader2, Users, ChevronRight, AlertTriangle,
  CheckCircle, AlertCircle, Mail, Search, FolderOpen, Bell, Star, Zap,
} from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { AmbientSignalLines, CompatibilityTrace, Eyebrow } from '@/components/cv/visuals'
import { auth } from '@/lib/supabase'
import { analytics } from '@/lib/analytics'

const ease = [0.22, 1, 0.36, 1] as const

// ─── Hero B2B ─────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <AmbientSignalLines className="pointer-events-none absolute inset-y-0 left-[52%] right-0 hidden h-full w-[52%] opacity-75 lg:block" />
      <div className="relative mx-auto max-w-6xl px-6 pb-10 pt-16 sm:pb-16 sm:pt-24">
        <Eyebrow>Software de RRHH · Paraguay &amp; LATAM</Eyebrow>
        <h1 className="font-display mt-3 max-w-3xl text-4xl leading-[1.05] text-cream sm:text-6xl">
          Contratá mejor. <em>Más rápido. Con IA.</em>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          CVitae es la plataforma de RRHH para empresas en Paraguay y LATAM: publicá vacantes con SEO, filtrá CVs con IA en minutos, administrá tu banco de candidatos y llevá el legajo digital de tu equipo — todo desde un solo panel.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { icon: '📋', label: 'Vacantes con SEO', desc: 'Link propio, indexado en Google, candidatos llegan solos' },
            { icon: '🤖', label: 'Análisis masivo', desc: 'Score, fortalezas y brechas por candidato en minutos' },
            { icon: '🗂️', label: 'Banco reutilizable', desc: 'Buscá CVs de procesos anteriores por keyword o puesto' },
            { icon: '📁', label: 'Legajo digital', desc: 'Documentos + recordatorios IPS/MTESS por empleado' },
            { icon: '⚡', label: 'Matching pre-vacante', desc: 'Buscá en tu banco antes de publicar — ya podés tener al candidato' },
            { icon: '🏆', label: 'Comparación final', desc: 'IA compara hasta 5 finalistas en un análisis único' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <span className="text-lg">{item.icon}</span>
              <p className="mt-2 text-xs font-semibold text-cream">{item.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/40">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="#empresas-contacto"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a84c] px-6 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.5)]"
          >
            <Building2 className="h-4 w-4" /> Solicitar acceso para mi empresa
          </a>
          <Link
            href="/empresas"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 px-6 text-sm text-cream transition hover:border-white/25"
          >
            Acceder con token <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-white/35">
          ¿Sos candidato buscando empleo?{' '}
          <a href="#candidatos" className="text-[#c9a84c] underline decoration-[#c9a84c]/30 underline-offset-4">
            Bajá para ver las herramientas gratuitas de CV ↓
          </a>
        </p>
      </div>
    </section>
  )
}

// ─── B2B Features ─────────────────────────────────────────────────────────────

function B2BFeatures() {
  const features = [
    {
      Icon: Zap,
      title: 'Vacantes públicas con SEO',
      desc: 'Cada vacante tiene su URL única en cvitae.lat, con schema JobPosting para que Google la indexe. Los candidatos llegan sin que pagues publicidad.',
    },
    {
      Icon: Brain,
      title: 'Filtro IA masivo',
      desc: 'Subí hasta 30 CVs de una vez. Cada candidato recibe score 0–100, listado de fortalezas y brechas respecto al puesto — en minutos, no días.',
    },
    {
      Icon: Search,
      title: 'Banco de candidatos',
      desc: 'Todos los CVs analizados quedan en tu banco privado. Buscá por keyword o descripción de puesto en procesos anteriores — sin que el candidato vuelva a postularse.',
    },
    {
      Icon: Star,
      title: 'Comparación de finalistas',
      desc: 'Marcá los mejores y pedí un análisis comparativo. La IA contrasta fortalezas, brechas y fit cultural de hasta 5 candidatos en una sola pantalla.',
    },
    {
      Icon: FolderOpen,
      title: 'Legajo digital',
      desc: 'Guardá documentos del empleado (contrato, cédula, IPS), agregá recordatorios de vencimiento y llevá el historial en un solo lugar.',
    },
    {
      Icon: Bell,
      title: 'Recordatorios de compliance',
      desc: 'Alertas de IPS REI (3 días hábiles), MTESS REOP (30 días hábiles) y vencimientos de documentos por empleado — para no perder plazos legales.',
    },
  ]
  return (
    <section className="mx-auto max-w-6xl border-t border-white/[0.12] px-6 py-20">
      <Eyebrow>Para empresas</Eyebrow>
      <h2 className="font-display mt-2 max-w-2xl text-3xl text-cream sm:text-4xl">
        Todo el ciclo de RRHH, <em>sin cambiar de herramienta</em>.
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Desde la publicación de la vacante hasta el legajo del empleado contratado — CVitae cubre el flujo completo sin integraciones ni exportaciones.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ Icon, title, desc }, i) => (
          <motion.div
            key={title}
            initial={false}
            transition={{ duration: 0.6, delay: i * 0.07, ease }}
            className="glass-panel rounded-2xl p-6"
          >
            <Icon strokeWidth={1.25} className="h-5 w-5 text-[#c9a84c]" />
            <h3 className="font-display mt-3 text-lg text-cream">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── B2B Pricing ──────────────────────────────────────────────────────────────

function B2BPricing() {
  const plans = [
    {
      name: 'Trial',
      price: 'Gratis',
      per: '20 créditos incluidos',
      featured: false,
      features: [
        '20 créditos (1 crédito = 1 CV analizado)',
        '1 vacante activa con link propio',
        'Banco de candidatos básico',
        'Sin tarjeta requerida',
      ],
      cta: 'Solicitar acceso →',
    },
    {
      name: 'Starter',
      price: 'USD 39',
      per: '/ mes',
      featured: false,
      features: [
        '100 créditos / mes',
        '5 vacantes activas',
        'Banco de candidatos completo',
        'Búsqueda cross-llamado',
        'Soporte por email',
      ],
      cta: 'Solicitar acceso →',
    },
    {
      name: 'Pro',
      price: 'USD 79',
      per: '/ mes',
      featured: true,
      features: [
        '300 créditos / mes',
        '15 vacantes activas',
        'Todo Starter +',
        'Legajos digitales',
        'Comparación de finalistas',
        'Alertas de compliance (IPS/MTESS)',
        'Matching pre-vacante',
      ],
      cta: 'Solicitar acceso →',
    },
    {
      name: 'Scale',
      price: 'USD 149',
      per: '/ mes',
      featured: false,
      features: [
        '800 créditos / mes',
        'Vacantes ilimitadas',
        'Todo Pro +',
        'Soporte prioritario',
        'Créditos adicionales a pedido',
      ],
      cta: 'Solicitar acceso →',
    },
  ]
  return (
    <section className="mx-auto max-w-6xl border-t border-white/[0.12] px-6 py-20">
      <Eyebrow>Planes para empresas</Eyebrow>
      <h2 className="font-display mt-2 max-w-2xl text-3xl text-cream sm:text-4xl">
        Sin sorpresas. <em>Pagás por lo que usás.</em>
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
        1 crédito = 1 CV analizado. Los créditos no vencen dentro del período mensual. Período de acceso beta con descuentos disponible — consultá al solicitar.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.name}
            initial={false}
            transition={{ duration: 0.6, delay: i * 0.07, ease }}
            className={plan.featured
              ? 'relative rounded-3xl border border-[#c9a84c]/30 bg-[#c9a84c]/[0.05] p-7'
              : 'glass-panel rounded-3xl p-7'}
          >
            {plan.featured && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-[#c9a84c]/40 bg-[#0a0a0a] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#c9a84c]">
                Más popular
              </span>
            )}
            <h3 className="font-display text-xl text-cream">{plan.name}</h3>
            <p className="font-display mt-3 text-3xl text-cream">
              {plan.price}
              {plan.per && <span className="ml-1 text-sm font-normal text-muted-foreground">{plan.per}</span>}
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-cream/85">
                  <Check strokeWidth={2} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c9a84c]" /> {f}
                </li>
              ))}
            </ul>
            <a
              href="#empresas-contacto"
              className={`mt-7 inline-flex h-10 w-full items-center justify-center rounded-full text-sm font-medium transition ${
                plan.featured
                  ? 'bg-[#c9a84c] text-[#0a0a0a] hover:bg-[#e6cf8a]'
                  : 'border border-white/10 text-cream hover:border-white/25'
              }`}
            >
              {plan.cta}
            </a>
          </motion.div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-white/35">
        Los planes se activan manualmente durante el beta. Escribinos y te configuramos el acceso.
      </p>
    </section>
  )
}

// ─── B2B Contact Form ─────────────────────────────────────────────────────────

function B2BContactForm() {
  const [form, setForm] = useState({ name: '', email: '', company: '', phone: '', country: 'Paraguay', processes_per_month: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrMsg('')
    try {
      const res = await fetch('/.netlify/functions/submit-b2b-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setErrMsg(data.error || 'Error al enviar'); setStatus('error'); return }
      setStatus('ok')
    } catch {
      setErrMsg('Error de conexión. Intentá de nuevo.')
      setStatus('error')
    }
  }

  return (
    <section id="empresas-contacto" className="mx-auto max-w-6xl border-t border-white/[0.12] px-6 py-20">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <Eyebrow>Acceso beta</Eyebrow>
          <h2 className="font-display mt-2 max-w-xl text-3xl text-cream sm:text-4xl">
            Probalo con tu equipo. <em>Sin costo inicial.</em>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Durante el beta, activamos los accesos manualmente. Completá el formulario y te enviamos tu token de acceso — generalmente en menos de 24 horas.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-cream/80">
            {[
              'Sin tarjeta ni contrato',
              'Token personal con descuento beta',
              'Soporte directo por WhatsApp',
              'Podés pedir créditos adicionales en cualquier momento',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <Check strokeWidth={2} className="h-3.5 w-3.5 shrink-0 text-[#c9a84c]" /> {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-card rounded-3xl p-8">
          {status === 'ok' ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10">
                <CheckCircle strokeWidth={1.5} className="h-7 w-7 text-[#c9a84c]" />
              </div>
              <h3 className="font-display mt-5 text-2xl text-cream">Recibido</h3>
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">Te contactamos en menos de 24 horas con tu token de acceso.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/45">Empresa</span>
                  <input
                    name="company" value={form.company} onChange={handleChange} required
                    placeholder="Nombre de la empresa"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-cream placeholder-white/25 outline-none transition focus:border-[#c9a84c]/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/45">Tu nombre</span>
                  <input
                    name="name" value={form.name} onChange={handleChange} required
                    placeholder="Nombre y apellido"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-cream placeholder-white/25 outline-none transition focus:border-[#c9a84c]/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/45">Email laboral</span>
                  <input
                    name="email" type="email" value={form.email} onChange={handleChange} required
                    placeholder="tu@empresa.com"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-cream placeholder-white/25 outline-none transition focus:border-[#c9a84c]/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/45">Teléfono / WhatsApp</span>
                  <input
                    name="phone" value={form.phone} onChange={handleChange}
                    placeholder="+595 981 000000"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-cream placeholder-white/25 outline-none transition focus:border-[#c9a84c]/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/45">País</span>
                  <select
                    name="country" value={form.country} onChange={handleChange}
                    className="w-full rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-sm text-cream outline-none transition focus:border-[#c9a84c]/40"
                  >
                    {['Paraguay','Argentina','Uruguay','Bolivia','Chile','Peru','Colombia','Ecuador','Mexico','Otro'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/45">Procesos de selección / mes</span>
                  <select
                    name="processes_per_month" value={form.processes_per_month} onChange={handleChange}
                    className="w-full rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-sm text-cream outline-none transition focus:border-[#c9a84c]/40"
                  >
                    <option value="">Seleccioná</option>
                    {['1–2','3–5','6–10','11–20','Más de 20'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/45">Contanos tu contexto (opcional)</span>
                <textarea
                  name="message" value={form.message} onChange={handleChange} rows={3}
                  placeholder="Sector, cantidad de empleados, desafíos actuales de RRHH..."
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-cream placeholder-white/25 outline-none transition focus:border-[#c9a84c]/40"
                />
              </label>
              {errMsg && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-sm text-red-400">
                  <AlertCircle strokeWidth={1.5} className="h-4 w-4 shrink-0" /> {errMsg}
                </div>
              )}
              <button
                type="submit" disabled={status === 'loading'}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-60"
              >
                {status === 'loading' ? <Loader2 strokeWidth={2} className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                {status === 'loading' ? 'Enviando...' : 'Solicitar acceso beta'}
              </button>
              <p className="text-center text-[11px] text-white/30">Sin tarjeta. Sin compromiso. Acceso activado en &lt;24 hs.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Analizador real ──────────────────────────────────────────────────────────

interface PublicAnalysis {
  atsScore: number
  nombre: string | null
  rolDetectado: string
  careerLevel?: 'junior' | 'semi-senior' | 'senior' | 'gerencial'
  recommendation: string
  strengths: string[]
  criticalImprovements: string[]
  missingKeywords: string[]
  quickWins?: string[]
}

function Analizador() {
  const [cv, setCv] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'extracting' | 'analyzing' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<PublicAnalysis | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [ctaEmail, setCtaEmail] = useState('')
  const [ctaSent, setCtaSent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const loading = step === 'extracting' || step === 'analyzing'

  const handleFile = (f: File) => {
    if (f.size > 4 * 1024 * 1024) { setErrorMsg('El archivo no puede superar 4 MB.'); return }
    setCv(f); setErrorMsg(''); setStep('idle'); setResult(null); setCtaSent(false)
  }

  const handleAnalyze = async () => {
    if (!cv) return
    setStep('extracting'); setErrorMsg('')
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const base64 = (e.target?.result as string)?.split(',')[1]
          const extractRes = await fetch('/.netlify/functions/extract-pdf-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdfBase64: base64, fileName: cv.name }),
          })
          const extractData = await extractRes.json()
          if (!extractRes.ok || !extractData.success) throw new Error(extractData.error || 'Error extrayendo texto del CV')

          setStep('analyzing')
          const analyzeRes = await fetch('/.netlify/functions/analyze-cv-public', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cvText: extractData.text }),
          })
          const analyzeData = await analyzeRes.json()
          if (!analyzeRes.ok) throw new Error(analyzeData.error || 'Error analizando CV')

          analytics.cvAnalyzed('landing_public')
          setResult(analyzeData)
          setStep('done')
        } catch (err: any) {
          setErrorMsg(err.message || 'Error inesperado. Intentá de nuevo.')
          setStep('error')
        }
      }
      reader.readAsDataURL(cv)
    } catch {
      setErrorMsg('No se pudo leer el archivo.')
      setStep('error')
    }
  }

  const handleCtaSignup = async () => {
    if (!ctaEmail.trim()) return
    try {
      const { error } = await auth.signInWithMagicLink(ctaEmail.trim())
      if (error) throw error
      setCtaSent(true)
    } catch {}
  }

  const scoreColor = result
    ? result.atsScore >= 70 ? 'text-green-400' : result.atsScore >= 50 ? 'text-yellow-400' : 'text-red-400'
    : ''

  return (
    <section id="analizador" className="mx-auto max-w-6xl border-t border-white/[0.12] px-6 py-20">
      <Eyebrow>Diagnóstico inicial gratuito</Eyebrow>
      <h2 className="font-display mt-2 max-w-2xl text-3xl text-cream sm:text-4xl">
        Tu score ATS <em>real</em>. En segundos.
      </h2>
      <p className="mt-3 max-w-xl text-muted-foreground">
        No necesitás crear cuenta. La IA analiza tu CV y te dice exactamente qué mejorar.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {/* Upload panel */}
        <div className="editorial-panel p-8 flex flex-col gap-4">
          <label
            className="block cursor-pointer rounded-2xl border border-dashed border-white/15 p-10 text-center transition hover:border-[#c9a84c]/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          >
            {cv ? (
              <>
                <FileText className="mx-auto h-6 w-6 text-[#c9a84c]" />
                <p className="font-display mt-3 truncate text-base text-cream">{cv.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{(cv.size / 1024).toFixed(0)} KB</p>
                <button
                  onClick={(e) => { e.preventDefault(); setCv(null); setStep('idle'); setResult(null) }}
                  className="mt-1 text-xs text-muted-foreground underline hover:text-cream"
                >
                  cambiar
                </button>
              </>
            ) : (
              <>
                <Upload className="mx-auto h-6 w-6 text-[#c9a84c]" />
                <p className="font-display mt-3 text-lg text-cream">Arrastrá tu CV aquí</p>
                <p className="mt-1 text-xs text-muted-foreground">PDF · hasta 10 MB</p>
              </>
            )}
            <input ref={fileRef} type="file" accept="application/pdf,.docx,.txt" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>
          {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
          <button
            className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleAnalyze}
            disabled={!cv || loading}
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {step === 'extracting' ? 'Leyendo CV…' : 'Analizando con IA…'}</>
              : <><Sparkles className="h-4 w-4" /> Analizar ahora</>}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            Sin cuenta. Sin guardar tu archivo. El análisis inicial es gratis.
          </p>
        </div>

        {/* Results panel */}
        <div className="editorial-panel p-8">
          <AnimatePresence mode="wait">
            {step === 'done' && result ? (
              <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                {/* Score + nivel */}
                <div className="flex items-center gap-4">
                  <CompatibilityTrace score={result.atsScore} label="Score ATS" />
                  <div>
                    <p className={`font-display text-4xl font-bold ${scoreColor}`}>{result.atsScore}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-sm text-muted-foreground">
                        {result.recommendation || (result.atsScore >= 70 ? 'CV bien preparado' : result.atsScore >= 50 ? 'Buen perfil, con mejoras' : 'Necesita optimización')}
                      </p>
                      {result.careerLevel && (
                        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/40">
                          {result.careerLevel}
                        </span>
                      )}
                    </div>
                    {result.rolDetectado && <p className="mt-1 text-xs text-white/40">{result.rolDetectado}</p>}
                  </div>
                </div>

                {/* Strengths */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#c9a84c]">Fortalezas</p>
                  <ul className="space-y-1">
                    {result.strengths.slice(0, 3).map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-cream/90">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-400" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Improvements */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#c9a84c]">Mejoras críticas</p>
                  <ul className="space-y-1">
                    {result.criticalImprovements.slice(0, 3).map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-cream/90">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Quick wins */}
                {result.quickWins && result.quickWins.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sky-400/80">Podés mejorar hoy</p>
                    <ul className="space-y-1">
                      {result.quickWins.slice(0, 2).map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-cream/80">
                          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" /> {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* CTA post-analysis */}
                <div className="rounded-2xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.05] p-5">
                  {ctaSent ? (
                    <div className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-[#c9a84c]" />
                      <p className="text-sm text-cream">Revisá tu correo para ingresar.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-cream">
                        Tu score es <span className={`font-bold ${scoreColor}`}>{result.atsScore}</span>.
                        Creá tu cuenta gratis y tenés 1 CV adaptado por día para cada vacante.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <div className="relative flex-1">
                          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="email" value={ctaEmail} onChange={(e) => setCtaEmail(e.target.value)}
                            placeholder="tu@correo.com"
                            className="w-full rounded-xl border border-white/10 bg-white/[0.02] pl-9 pr-3 py-2.5 text-sm text-cream placeholder:text-muted-foreground outline-none focus:border-[#c9a84c]/50 transition"
                          />
                        </div>
                        <button
                          onClick={handleCtaSignup}
                          disabled={!ctaEmail.trim()}
                          className="rounded-xl bg-[#c9a84c] px-4 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-50"
                        >
                          Crear cuenta
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">Sin contraseña. Te enviamos un enlace mágico.</p>
                    </>
                  )}
                </div>
              </motion.div>
            ) : step === 'error' ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid min-h-[280px] place-items-center text-center">
                <div>
                  <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
                  <p className="font-display mt-3 text-lg text-cream">Error al analizar</p>
                  <p className="mt-1 text-xs text-muted-foreground">{errorMsg}</p>
                  <button
                    onClick={() => { setStep('idle'); setErrorMsg('') }}
                    className="mt-4 text-xs text-[#c9a84c] underline"
                  >
                    Reintentar
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid min-h-[280px] place-items-center text-center">
                <div>
                  {loading ? (
                    <>
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#c9a84c]" />
                      <p className="font-display mt-3 text-lg text-cream">
                        {step === 'extracting' ? 'Leyendo tu CV…' : 'Analizando con IA…'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Unos segundos</p>
                    </>
                  ) : (
                    <>
                      <Sparkles className="mx-auto h-6 w-6 text-[#c9a84c]" />
                      <p className="font-display mt-3 text-lg text-cream">Tu análisis aparecerá aquí</p>
                      <p className="mt-1 text-xs text-muted-foreground">Score ATS real, fortalezas y mejoras críticas.</p>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

// ─── RegistroBlock ────────────────────────────────────────────────────────────

function RegistroBlock() {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const handleSubmit = async () => {
    if (!email.trim()) return
    setStep('loading'); setErrorMsg('')
    try {
      const { error: authError } = await auth.signInWithMagicLink(email.trim())
      if (authError) throw authError
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
            Abrí el enlace para ingresar. Después te llevamos a cargar tu CV de forma privada y persistente.
          </p>
        </motion.div>
      </section>
    )
  }

  return (
    <section id="registro" className="mx-auto max-w-6xl px-6 py-16">
      <div className="relative overflow-hidden rounded-3xl border border-[#c9a84c]/20 bg-[#c9a84c]/[0.03] p-8 sm:p-12">
        <div className="absolute -inset-2 -z-10 bg-gradient-to-br from-[#c9a84c]/10 via-transparent to-transparent blur-3xl" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Eyebrow>Registro en un solo paso</Eyebrow>
            <h2 className="font-display mt-2 text-3xl leading-tight text-cream sm:text-4xl">
              Entrás con tu correo.
              <br />Después <em>cargás tu CV una sola vez</em>.
            </h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              Primero protegemos tu sesión. Ya dentro de CVitae, subís tu PDF o DOCX: la IA extrae
              nombre, título, habilidades, experiencia y estudios para que los revises antes de usarlos.
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
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <Upload className="mt-0.5 h-5 w-5 shrink-0 text-[#c9a84c]" />
                <div>
                  <p className="font-display text-base text-cream">Tu CV se carga después de ingresar</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Así el archivo original queda asociado a tu cuenta y puede recuperarse en tu próxima sesión.</p>
                </div>
              </div>
            </div>
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
              disabled={!email.trim() || step === 'loading'}
              className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.5)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {step === 'loading'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                : <>Ingresar y crear mi perfil <ArrowRight className="h-4 w-4" /></>}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.07, ease }}
              className="glass-panel relative overflow-hidden p-6"
            >
              {/* Número decorativo de fondo */}
              <span className="font-display pointer-events-none absolute right-4 top-2 select-none text-8xl font-bold text-[#c9a84c]/15" aria-hidden="true">{s.n}</span>
              {/* Número legible */}
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#c9a84c]">{s.n}</span>
              <h3 className="font-display mt-2 text-xl text-cream">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="mt-12 text-center">
        <a
          href="#registro"
          className="inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-7 py-3.5 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#e6cf8a] hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.5)]"
        >
          Adaptá tu primer CV gratis <ArrowRight className="h-4 w-4" />
        </a>
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
    <section className="mx-auto max-w-6xl border-t border-white/[0.12] px-6 py-20">
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
            initial={false}
            transition={{ duration: 0.6, delay: i * 0.08, ease }}
            className="editorial-panel p-6"
          >
            <Icon className="h-5 w-5 text-[#c9a84c]" />
            <h3 className="font-display mt-3 text-xl text-cream">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
          </motion.div>
        ))}
      </div>
      <div className="mt-10">
        <a
          href="#analizador"
          className="inline-flex items-center gap-2 rounded-full border border-[#c9a84c]/40 px-7 py-3.5 text-sm font-medium text-[#c9a84c] transition hover:border-[#c9a84c] hover:bg-[#c9a84c]/10"
        >
          Analizar mi CV ahora <ArrowRight className="h-4 w-4" />
        </a>
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
    <section className="border-y border-white/[0.12] bg-white/[0.015] py-8">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-3 divide-x divide-white/[0.12]">
          {STATS.map(({ value, label }, i) => (
            <motion.div
              key={value}
              initial={false}
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

// ─── Precios ──────────────────────────────────────────────────────────────────

function Pricing() {
  const tiers = [
    {
      name: 'Founding Beta · 50 cupos', price: 'Gs. 0', per: '12 meses tras aprobación',
      features: [
        'Analizador de CV con uso generoso',
        'Matching diario de oportunidades',
        'CV Vivo adaptado a vacantes',
        'Alertas y recomendaciones personalizadas',
        'Acceso anticipado a nuevas funciones',
      ],
      cta: 'Solicitar acceso Founding Beta', featured: true,
    },
    {
      name: 'Después de la beta', price: 'A definir', per: 'según uso y capacidad',
      features: [
        'Límites transparentes según capacidad',
        'Más adaptaciones de CV según el plan',
        'Análisis de vacante con IA',
        'Alertas diarias personalizadas',
        'Recomendación de cursos',
      ],
      cta: 'Conocer el futuro plan', featured: false,
    },
  ]
  return (
    <section className="mx-auto max-w-6xl border-t border-white/[0.12] px-6 py-20">
      <Eyebrow>Para candidatos</Eyebrow>
      <h2 className="font-display mt-2 text-3xl text-cream sm:text-4xl">
        Empezá con un análisis de CV <em>gratuito</em>.
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        El análisis inicial no requiere cuenta ni tarjeta. Founding Beta es un beneficio limitado para 50 personas: se solicita desde Mi Carrera y se activa sólo después de aprobación. Si la demanda afecta la disponibilidad o el costo del servicio, podremos ajustar temporalmente algunos límites y lo comunicaremos con anticipación.
      </p>
      <div className="mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
        {tiers.map((t, i) => (
          <motion.div
            key={t.name}
            initial={false}
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


// ─── FAQs B2B ─────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: '¿Cómo funciona el análisis de CVs con IA?',
    a: 'CVitae extrae el texto del CV (PDF, DOCX o TXT) y lo procesa con IA para generar un score ATS de 0 a 100, identifica los puntos fuertes del candidato, las brechas respecto al puesto y una recomendación clara: Llamar, Considerar o Revisado manualmente. Cada análisis consume 1 crédito y el resultado se guarda en tu historial.',
  },
  {
    q: '¿Qué es el score ATS y para qué sirve?',
    a: 'El score ATS (Applicant Tracking System) es un puntaje de 0 a 100 que indica qué tan bien se alinea el perfil del candidato con los requisitos del puesto. Un score alto (80+) indica ajuste fuerte; entre 50 y 79 es perfil a considerar; por debajo de 50 suele haber brechas importantes. Te ayuda a priorizar a quién entrevistar primero sin revisar cada CV manualmente.',
  },
  {
    q: '¿Qué es el análisis masivo de CVs?',
    a: 'Es la función de carga por lote: podés subir hasta 30 CVs de golpe y CVitae los analiza en paralelo con IA. Al terminar, obtenés un ranking comparativo de todos los candidatos con sus scores, fortalezas y brechas — ideal para procesos con muchas postulaciones o para evaluar tu base de candidatos anterior contra un puesto nuevo.',
  },
  {
    q: '¿Cómo funciona la publicación de vacantes con SEO?',
    a: 'Cada llamado que creás en CVitae genera automáticamente una URL pública con una página optimizada para buscadores. Google indexa esas páginas con el título del puesto, la descripción y la ubicación, lo que atrae candidatos orgánicamente sin que tengas que pagar publicidad en portales de empleo.',
  },
  {
    q: '¿Puedo subir CVs manualmente a una vacante?',
    a: 'Sí. Además de recibir postulaciones a través del link público de la vacante, podés subir CVs manualmente desde el panel de RRHH: candidatos referidos, CVs enviados por email o tu base de candidatos anterior. Todos aparecen en el panel de postulantes del llamado y pueden analizarse con IA.',
  },
  {
    q: '¿Qué son los legajos digitales?',
    a: 'Los legajos digitales son el expediente de cada empleado dentro de CVitae: podés cargar documentos (contrato, cédula, título, constancia IPS), agregar alertas de vencimiento y llevar el historial laboral en un solo lugar. El almacenamiento está incluido en todos los planes sin costo extra.',
  },
  {
    q: '¿Los créditos vencen o se acumulan mes a mes?',
    a: 'Los créditos no vencen: se acumulan mes a mes. Si en un mes usás menos créditos de los incluidos en tu plan, el saldo pasa al mes siguiente. Esto te permite ahorrar para meses con más actividad de reclutamiento sin perder lo que pagaste.',
  },
  {
    q: '¿Tiene versión de prueba gratuita?',
    a: 'Sí. El plan Trial incluye 20 créditos y 1 vacante activa sin costo y sin tarjeta. Con eso podés analizar hasta 20 CVs, publicar tu primer llamado con link SEO y explorar el banco de candidatos. Para acceder, completá el formulario de contacto y te mandamos el código de acceso.',
  },
]

function B2BFAQs() {
  const [open, setOpen] = useState<number | null>(null)
  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  })
  return (
    <section id="preguntas-frecuentes" className="border-t border-white/[0.08] py-20">
      <Helmet>
        <script type="application/ld+json">{schemaJson}</script>
      </Helmet>
      <div className="mx-auto max-w-3xl px-6">
        <Eyebrow>Preguntas frecuentes</Eyebrow>
        <h2 className="font-display mt-3 text-3xl text-cream sm:text-4xl">Todo lo que necesitás saber</h2>
        <p className="mt-3 text-sm text-muted-foreground">Sobre análisis de CVs con IA, vacantes SEO, legajos y créditos.</p>
        <div className="mt-10 space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.08] overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left text-sm font-medium text-cream transition hover:bg-white/[0.03]"
              >
                <span>{faq.q}</span>
                <ChevronRight
                  strokeWidth={1.5}
                  className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${open === i ? 'rotate-90' : ''}`}
                />
              </button>
              <AnimatePresence>
                {open === i && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="px-6 pb-5 pt-1 text-sm font-light leading-relaxed text-muted-foreground">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Separador candidatos ─────────────────────────────────────────────────────

function CandidatosDivider() {
  return (
    <section id="candidatos" className="border-t border-white/[0.12] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-center gap-6">
          <div className="h-px flex-1 bg-white/[0.08]" />
          <div className="text-center">
            <Eyebrow>Para candidatos</Eyebrow>
            <h2 className="font-display mt-2 text-2xl text-cream sm:text-3xl">
              ¿Buscás empleo? <em>Comenzá gratis.</em>
            </h2>
            <p className="mt-3 max-w-lg text-sm text-muted-foreground">
              Subí tu CV y CVitae te dice qué tan listo está para los sistemas ATS, encontrás miles de oportunidades en Paraguay y LATAM y generás versiones adaptadas para cada postulación — con tu experiencia real, sin frases vacías.
            </p>
          </div>
          <div className="h-px flex-1 bg-white/[0.08]" />
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
        <title>CVitae | Software de RRHH con IA para Paraguay y LATAM</title>
        <meta name="description" content="Plataforma de RRHH para empresas en Paraguay: publicá vacantes con SEO, filtrá CVs con IA, administrá banco de candidatos y legajos digitales. También herramientas gratuitas para candidatos." />
        <link rel="canonical" href="https://cvitae.lat" />
        <meta property="og:title" content="CVitae | Software de RRHH con IA para Paraguay y LATAM" />
        <meta property="og:description" content="Vacantes con SEO, análisis masivo de CVs, banco de candidatos y legajos digitales — todo en un panel para empresas en Paraguay y LATAM." />
        <meta property="og:url" content="https://cvitae.lat" />
        <meta property="og:type" content="website" />
      </Helmet>
      <SiteShell>
        {/* B2B-first */}
        <Hero />
        <B2BFeatures />
        <B2BPricing />
        <B2BContactForm />
        <B2BFAQs />
        {/* B2C — claramente separado */}
        <CandidatosDivider />
        <Analizador />
        <ComoFunciona />
        <RegistroBlock />
        <IATech />
        <StatsBar />
        <Pricing />
      </SiteShell>
    </>
  )
}
