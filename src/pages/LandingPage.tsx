import { useState, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import {
  Upload, Mail, Sparkles, Brain, Building2, Check, ArrowRight,
  FileText, Loader2, Users,
} from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { GrowthLine, CompatibilityTrace, Eyebrow } from '@/components/cv/visuals'
import { supabase } from '@/lib/supabase'
import { analytics } from '@/lib/analytics'

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-10 sm:pt-24 sm:pb-16">
        <Eyebrow>Talento con IA · Paraguay &amp; LATAM</Eyebrow>
        <h1 className="font-display text-4xl sm:text-6xl mt-3 text-cream leading-[1.05] max-w-3xl">
          Las oportunidades están <em>dispersas</em>.
          <br />Tu CV no pasa los <em>filtros</em>.
          <br />CVitae resuelve las dos cosas.
        </h1>
        <p className="text-muted-foreground mt-6 max-w-xl text-base sm:text-lg leading-relaxed">
          Becas, diplomados, concursos y empleos llegan desperdigados por mil grupos.
          Y los CVs buenos quedan afuera por un filtro automático. CVitae junta todo
          y te ayuda a llegar.
        </p>
        <div className="relative mt-10 max-w-2xl">
          <GrowthLine className="absolute -top-6 left-0 right-0 h-20 opacity-50" />
        </div>
        <div className="flex flex-wrap gap-3 mt-10">
          <a
            href="#registro"
            className="inline-flex items-center gap-2 bg-gold text-ink hover:bg-gold-soft transition-colors font-medium h-11 px-6 rounded-md text-sm"
          >
            <Upload className="h-4 w-4" /> Subir mi CV
          </a>
          <a
            href="#analizador"
            className="inline-flex items-center gap-2 text-cream hover:bg-cream/5 transition-colors h-11 px-6 rounded-md text-sm"
          >
            Probar el analizador <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

// ─── RegistroBlock — real Supabase magic link auth + sessionStorage CV ────────

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
    setStep('loading')
    setErrorMsg('')
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
      <section id="registro" className="max-w-6xl mx-auto px-6 py-16">
        <div className="gold-panel p-8 sm:p-12 max-w-lg mx-auto text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="font-display text-2xl text-cream">¡Revisá tu correo!</h2>
          <p className="text-muted-foreground mt-3 text-sm">
            Te enviamos un enlace mágico a <strong>{email}</strong>.
            Tu CV queda guardado para cuando ingreses.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section id="registro" className="max-w-6xl mx-auto px-6 py-16">
      <div className="gold-panel p-8 sm:p-12 relative overflow-hidden">
        <GrowthLine className="absolute -top-2 left-0 right-0 h-24 opacity-60" />
        <div className="relative grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div>
            <Eyebrow>Registro en un solo paso</Eyebrow>
            <h2 className="font-display text-3xl sm:text-4xl mt-2 text-cream leading-tight">
              Subís tu CV y tu correo.
              <br />La IA <em>arma tu perfil</em> al instante.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-md">
              Sin formularios de 5 pasos. La IA lee tu PDF, extrae nombre, título,
              habilidades, experiencia y cursos, y deja tu perfil listo para recibir matches.
              Después, si querés, ajustás los detalles.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-cream/90">
              {['Extracción automática del CV', 'Score de empleabilidad inicial', 'Primeros matches en menos de 1 minuto'].map((i) => (
                <li key={i} className="flex items-center gap-2"><Check className="h-4 w-4 text-gold" /> {i}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            <label
              className="glass-panel block p-6 cursor-pointer hover:border-gold/40 transition-colors text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              {file ? (
                <>
                  <FileText className="h-6 w-6 text-gold mx-auto" />
                  <p className="font-display text-base text-cream mt-3 truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(0)} KB · listo</p>
                  <button
                    onClick={(e) => { e.preventDefault(); setFile(null) }}
                    className="text-xs text-muted-foreground hover:text-cream mt-1 underline"
                  >cambiar</button>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-gold mx-auto" />
                  <p className="font-display text-lg text-cream mt-3">Arrastrá tu CV aquí</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF · hasta 5 MB</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full glass-panel pl-10 pr-3 py-3 text-sm text-cream placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold"
              />
            </div>
            {errorMsg && <p className="text-red-400 text-xs">{errorMsg}</p>}
            <button
              onClick={handleSubmit}
              disabled={!email.trim() || !file || step === 'loading'}
              className="w-full inline-flex items-center justify-center gap-2 bg-gold text-ink hover:bg-gold-soft h-11 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === 'loading'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                : <>Crear mi perfil con IA <ArrowRight className="h-4 w-4" /></>}
            </button>
            <p className="text-[11px] text-muted-foreground text-center">Sin contraseña. Te enviamos un enlace mágico.</p>
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
    <section className="max-w-6xl mx-auto px-6 py-20">
      <Eyebrow>Cómo funciona</Eyebrow>
      <h2 className="font-display text-3xl sm:text-4xl mt-2 text-cream max-w-xl">
        Cuatro pasos. <em>Cero ruido.</em>
      </h2>
      <div className="relative mt-12">
        <GrowthLine className="absolute -top-6 left-0 right-0 h-16 opacity-40 hidden md:block" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s) => (
            <div key={s.n} className="glass-panel p-6">
              <span className="font-display italic text-gold">{s.n}</span>
              <h3 className="font-display text-xl text-cream mt-2">{s.t}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.d}</p>
            </div>
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
    <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border/40">
      <Eyebrow>IA que entiende tu carrera</Eyebrow>
      <h2 className="font-display text-3xl sm:text-4xl mt-2 text-cream max-w-2xl">
        No es <em>palabra clave</em>. Es contexto.
      </h2>
      <p className="text-muted-foreground mt-3 max-w-xl">
        Entrenada con miles de CVs y vacantes paraguayas. Lee tu trayectoria como
        una persona técnica, no como un buscador de texto.
      </p>
      <div className="grid md:grid-cols-3 gap-4 mt-10">
        {items.map(({ Icon, t, d }) => (
          <div key={t} className="editorial-panel p-6">
            <Icon className="h-5 w-5 text-gold" />
            <h3 className="font-display text-xl text-cream mt-3">{t}</h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Analizador ───────────────────────────────────────────────────────────────

function Analizador() {
  const [cv, setCv] = useState<File | null>(null)
  const [analyzed, setAnalyzed] = useState(false)
  return (
    <section id="analizador" className="max-w-6xl mx-auto px-6 py-20 border-t border-border/40">
      <Eyebrow>Probalo antes de registrarte</Eyebrow>
      <h2 className="font-display text-3xl sm:text-4xl mt-2 text-cream max-w-2xl">
        Analizador de CV <em>gratis</em>.
      </h2>
      <p className="text-muted-foreground mt-3 max-w-xl">
        Subí tu CV y mirá en segundos qué tan ATS-friendly es y dónde mejorar.
      </p>
      <div className="mt-10 grid lg:grid-cols-[1fr_1fr] gap-6">
        <div className="editorial-panel p-8">
          <label className="block p-10 border border-dashed border-border/60 rounded-md text-center cursor-pointer hover:border-gold/50 transition-colors">
            <Upload className="h-6 w-6 text-gold mx-auto" />
            <p className="font-display text-lg text-cream mt-3">{cv?.name ?? 'Subí tu CV en PDF'}</p>
            <p className="text-xs text-muted-foreground mt-1">Procesado en tu navegador, sin guardar nada.</p>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setCv(e.target.files?.[0] ?? null)} />
          </label>
          <button
            className="mt-4 w-full inline-flex items-center justify-center bg-gold text-ink hover:bg-gold-soft h-11 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                <p className="text-cream"><span className="font-display italic text-gold mr-2">+</span>Estructura clara y experiencia cuantificada.</p>
                <p className="text-cream"><span className="font-display italic text-gold mr-2">!</span>Faltan 3 keywords críticas del rubro.</p>
                <p className="text-cream"><span className="font-display italic text-gold mr-2">!</span>Diseño con tablas: 40% de ATS no lo leen.</p>
              </div>
              <p className="text-xs text-muted-foreground mt-5">¿Querés el análisis completo y un CV optimizado por vacante? Creá tu perfil.</p>
            </>
          ) : (
            <div className="grid place-items-center h-full min-h-[280px] text-center">
              <div>
                <Sparkles className="h-6 w-6 text-gold mx-auto" />
                <p className="font-display text-lg text-cream mt-3">Tu análisis aparecerá aquí</p>
                <p className="text-xs text-muted-foreground mt-1">Score ATS, fortalezas y mejoras críticas.</p>
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
    <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border/40">
      <Eyebrow>Para candidatos</Eyebrow>
      <h2 className="font-display text-3xl sm:text-4xl mt-2 text-cream">
        Empezá <em>gratis</em>. Subí cuando lo necesites.
      </h2>
      <div className="grid md:grid-cols-2 gap-4 mt-10 max-w-3xl">
        {tiers.map((t) => (
          <div key={t.name} className={t.featured ? 'gold-panel p-8' : 'glass-panel p-8'}>
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-2xl text-cream">{t.name}</h3>
              {t.featured && (
                <span className="text-[10px] uppercase tracking-wider border border-gold/30 text-gold px-2 py-0.5 rounded-full">
                  Recomendado
                </span>
              )}
            </div>
            <p className="font-display text-4xl text-cream mt-4">
              {t.price}<span className="text-sm text-muted-foreground ml-1">{t.per}</span>
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-cream/90">
                  <Check className="h-4 w-4 text-gold mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <a
              href="#registro"
              className={`mt-8 w-full inline-flex items-center justify-center h-10 rounded-md text-sm font-medium transition-colors ${
                t.featured
                  ? 'bg-gold text-ink hover:bg-gold-soft'
                  : 'border border-border text-cream hover:bg-cream/5'
              }`}
            >
              {t.cta}
            </a>
          </div>
        ))}
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
    <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border/40">
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10">
        <div>
          <Eyebrow>Para empresas</Eyebrow>
          <h2 className="font-display text-3xl sm:text-4xl mt-2 text-cream max-w-xl">
            Subí un <em>lote de CVs</em>. Recibí el Top 3 listo para entrevistar.
          </h2>
          <p className="text-muted-foreground mt-4 max-w-lg">
            La IA lee, clasifica con criterio ATS, compara entre sí y te entrega
            un ranking con justificación. Cero horas filtrando PDFs.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-cream/90">
            {['Análisis masivo ilimitado', 'Ranking comparativo con score y matches clave', 'Banco de talento acumulado por la empresa', 'Link de postulación propio'].map((f) => (
              <li key={f} className="flex items-start gap-2"><Check className="h-4 w-4 text-gold mt-0.5" /> {f}</li>
            ))}
          </ul>
          <div className="gold-panel p-6 mt-8 max-w-md">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-xl text-cream">Plan Empresa</h3>
              <Building2 className="h-4 w-4 text-gold" />
            </div>
            <p className="font-display text-3xl text-cream mt-3">USD 79<span className="text-sm text-muted-foreground ml-1">/ mes</span></p>
            <p className="text-xs text-muted-foreground">o Gs. 500.000 / mes</p>
            <Link
              href="/empresas"
              className="mt-5 inline-flex items-center gap-2 text-sm text-gold hover:text-gold-soft transition-colors"
            >
              Acceder al panel <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="editorial-panel p-8">
          {sent ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🎉</div>
              <h3 className="font-display text-xl text-cream">¡Estás en la lista!</h3>
              <p className="text-muted-foreground text-sm mt-3">
                Te contactamos a <strong>{correo}</strong> para coordinar el acceso a la Beta.
              </p>
            </div>
          ) : (
            <>
              <Eyebrow>Acceso a la Beta</Eyebrow>
              <h3 className="font-display text-2xl text-cream mt-2">Probá CVitae para tu equipo de RRHH.</h3>
              <div className="mt-6 space-y-3">
                <input
                  placeholder="Nombre (opcional)"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full glass-panel px-3 py-2.5 text-sm text-cream placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold"
                />
                <input
                  type="email"
                  placeholder="Correo corporativo"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="w-full glass-panel px-3 py-2.5 text-sm text-cream placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold"
                />
                <input
                  placeholder="Empresa"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="w-full glass-panel px-3 py-2.5 text-sm text-cream placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-gold"
                />
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button
                  onClick={handleSubmit}
                  disabled={sending}
                  className="w-full inline-flex items-center justify-center bg-gold text-ink hover:bg-gold-soft h-11 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {sending ? 'Enviando…' : 'Solicitar acceso'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-4 text-center">
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
        <Analizador />
        <Pricing />
        <ParaEmpresas />
      </SiteShell>
    </>
  )
}
