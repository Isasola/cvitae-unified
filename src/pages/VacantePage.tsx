import { useRef, useState, useEffect, type DragEvent, type ChangeEvent, type FormEvent } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'wouter'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Upload, FileText, X, MapPin, Clock, Briefcase,
  Check, Sparkles, ArrowRight, Loader2, AlertCircle, Mail
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const ease = [0.22, 1, 0.36, 1] as const

interface Vacancy {
  id: string
  title: string
  company: string
  location: string
  modality: string
  description: string
  requirements: string
  salary_range: string | null
}

function Ambient() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-1/3 h-[520px] w-[520px] rounded-full bg-[#c9a84c]/[0.07] blur-[160px]" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-white/[0.025] blur-[160px]" />
      </div>
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.025]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
    </>
  )
}

function Meta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[13px] text-white/70">
      <span className="text-white/45">{icon}</span>
      {children}
    </li>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-white/45">{label}</span>
      <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 transition focus-within:border-[#c9a84c]/40 focus-within:bg-white/[0.04]">
        {children}
      </div>
    </label>
  )
}

function SuccessState({ name, magicLinkSent }: { name: string; magicLinkSent: boolean }) {
  const first = name.split(' ')[0] || 'Hola'
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
      className="glass-card relative mt-10 overflow-hidden rounded-3xl p-10 sm:p-14"
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#c9a84c]/[0.12] blur-[120px]" />

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease, delay: 0.1 }}
        className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10"
      >
        <Check strokeWidth={1.5} className="h-7 w-7 text-[#c9a84c]" />
      </motion.div>

      <h2 className="mt-8 text-center font-display text-4xl leading-tight text-white sm:text-5xl">
        ¡Postulación enviada, <em className="not-italic text-white/70">{first}</em>!
      </h2>
      {magicLinkSent ? (
        <p className="mx-auto mt-4 max-w-md text-center text-sm font-light leading-relaxed text-white/55">
          Revisá tu email: te enviamos un link para acceder a tu perfil en CVitae y ver el estado de tu postulación.
        </p>
      ) : (
        <p className="mx-auto mt-4 max-w-md text-center text-sm font-light leading-relaxed text-white/55">
          Tu postulación fue registrada y enviada únicamente a la empresa. No creamos un perfil adicional porque esa opción es voluntaria.
        </p>
      )}

      {magicLinkSent && <div className="mx-auto mt-8 max-w-md rounded-2xl border border-[#c9a84c]/15 bg-[#c9a84c]/[0.04] p-5 text-left flex items-start gap-3">
        <Mail strokeWidth={1.5} className="h-5 w-5 text-[#c9a84c] mt-0.5 shrink-0" />
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Revisá tu correo</p>
          <p className="mt-1 text-sm font-light leading-relaxed text-white/60">
            Asunto: <span className="text-white">"Tu acceso a CVitae está listo ✦"</span>
          </p>
          <p className="mt-2 text-xs text-white/35">
            ¿No lo ves? Revisá la carpeta de <span className="text-white/55">Spam</span> o <span className="text-white/55">Promociones</span>. El email sale desde <span className="font-mono text-white/55">contacto@cvitae.lat</span>.
          </p>
        </div>
      </div>}

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/oportunidades"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
        >
          Ver otras oportunidades
          <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
        </Link>
      </div>
    </motion.div>
  )
}

function NotFoundState({ slug }: { slug: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease }}
      className="mt-20 text-center"
    >
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
        <AlertCircle strokeWidth={1.5} className="h-7 w-7 text-white/30" />
      </div>
      <h1 className="font-display text-4xl text-white">Vacante no encontrada</h1>
      <p className="mx-auto mt-4 max-w-md text-sm font-light text-white/50">
        La vacante <span className="text-white/70">"{slug}"</span> no existe o ya no está disponible.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/oportunidades"
          className="inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-6 py-3 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
        >
          Ver oportunidades disponibles
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm text-white/60 transition hover:border-white/30 hover:text-white"
        >
          Volver al inicio
        </Link>
      </div>
    </motion.div>
  )
}

export default function VacantePage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug || ''

  const [vacancy, setVacancy] = useState<Vacancy | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [coverLetter, setCoverLetter] = useState('')
  const [talentPoolConsent, setTalentPoolConsent] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return }
    supabase
      .from('recruiter_vacancies')
      .select('id, title, company, location, modality, description, requirements, salary_range')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) setNotFound(true)
        else setVacancy(data)
        setLoading(false)
      })
  }, [slug])

  function pickFiles(list: FileList | null) {
    if (!list || !list[0]) return
    const f = list[0]
    if (f.type !== 'application/pdf') { setError('Solo se aceptan archivos PDF.'); return }
    if (f.size > 4 * 1024 * 1024) { setError('El PDF supera 4 MB. Podés comprimirlo o crear una versión optimizada desde Mi Carrera en CVitae.'); return }
    setFile(f); setError('')
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragOver(false)
    pickFiles(e.dataTransfer.files)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    pickFiles(e.target.files)
    e.target.value = ''
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name || !email || !file) return
    setSubmitting(true); setError('')

    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = ev => {
          const ab = ev.target?.result as ArrayBuffer
          resolve(btoa(new Uint8Array(ab).reduce((d, b) => d + String.fromCharCode(b), '')))
        }
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
      })

      const res = await fetch('/.netlify/functions/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          source: `vacante:${slug}`,
          cv_base64: base64,
          cv_file_name: file.name,
          cover_letter: coverLetter.trim() || undefined,
          talent_pool_consent: talentPoolConsent,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al enviar la postulación')
      setMagicLinkSent(data.magicLinkSent === true)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Error de conexión. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const pageTitle = vacancy?.title || (slug ? slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Vacante')

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white antialiased">
      <Ambient />
      <Helmet>
        <title>{pageTitle} · CVitae</title>
        <meta name="description" content={`Postulá a ${pageTitle}. Tu perfil queda guardado en CVitae para futuras búsquedas.`} />
      </Helmet>

      {/* Top bar */}
      <header className="relative z-10 border-b border-white/5 px-6 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="group inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/50 transition hover:text-white">
            <ArrowLeft strokeWidth={1.5} className="h-3.5 w-3.5 transition group-hover:-translate-x-0.5" />
            CVitae
          </Link>
          <span className="text-xs uppercase tracking-[0.18em] text-white/35">Postulación</span>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-3xl px-6 pb-32 pt-16">
        {loading ? (
          <div className="flex justify-center pt-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#c9a84c]" />
          </div>
        ) : notFound ? (
          <NotFoundState slug={slug} />
        ) : submitted ? (
          <SuccessState name={name} magicLinkSent={magicLinkSent} />
        ) : (
          <>
            {/* Vacancy header */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/60">
                <span className="h-1.5 w-1.5 rounded-full bg-[#c9a84c]" />
                Vacante abierta
              </div>
              <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl">{vacancy!.title}</h1>
              <p className="mt-4 text-base text-white/55">en <span className="text-white">{vacancy!.company}</span></p>
              <ul className="mt-8 flex flex-wrap gap-2">
                <Meta icon={<MapPin strokeWidth={1.5} className="h-3.5 w-3.5" />}>{vacancy!.location}</Meta>
                <Meta icon={<Briefcase strokeWidth={1.5} className="h-3.5 w-3.5" />}>{vacancy!.modality}</Meta>
                <Meta icon={<Clock strokeWidth={1.5} className="h-3.5 w-3.5" />}>Tiempo completo</Meta>
                {vacancy!.salary_range && (
                  <Meta icon={<span className="text-[10px]">₲</span>}>{vacancy!.salary_range}</Meta>
                )}
              </ul>
            </motion.div>

            {/* Description */}
            {vacancy!.description && (
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.06, ease }}
                className="glass-card mt-10 rounded-2xl p-6"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/40 mb-3">Descripción del puesto</p>
                <p className="text-sm font-light leading-relaxed text-white/70 whitespace-pre-line">{vacancy!.description}</p>
              </motion.div>
            )}

            {/* Requirements */}
            {vacancy!.requirements && (
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease }}
                className="glass-card mt-4 rounded-2xl p-6"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/40 mb-3">Requisitos</p>
                <p className="text-sm font-light leading-relaxed text-white/70 whitespace-pre-line">{vacancy!.requirements}</p>
              </motion.div>
            )}

            {/* Optional talent-pool benefit */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.14, ease }}
              className="glass-card mt-6 flex items-start gap-4 rounded-2xl p-5"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/10">
                <Sparkles strokeWidth={1.5} className="h-4 w-4 text-[#c9a84c]" />
              </div>
              <p className="text-sm font-light leading-relaxed text-white/70">
                Tu postulación siempre se envía únicamente a esta empresa. Más abajo podés elegir, de forma opcional, si también querés crear un perfil en CVitae para futuras oportunidades.
              </p>
            </motion.div>

            {/* Form */}
            <motion.form
              onSubmit={onSubmit}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.18, ease }}
              className="glass-card mt-6 rounded-3xl p-7 sm:p-9"
            >
              <h2 className="font-display text-2xl italic text-white">Postulación rápida</h2>
              <p className="mt-1 text-sm font-light text-white/50">Menos de un minuto.</p>

              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <Field label="Nombre completo">
                  <input
                    type="text" required value={name} onChange={e => setName(e.target.value)}
                    placeholder="María Fernández"
                    className="w-full bg-transparent text-[15px] text-white placeholder:text-white/25 focus:outline-none"
                  />
                </Field>
                <Field label="Correo electrónico">
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="maria@ejemplo.com"
                    className="w-full bg-transparent text-[15px] text-white placeholder:text-white/25 focus:outline-none"
                  />
                </Field>
              </div>

              {/* CV upload */}
              <div className="mt-6">
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-white/45">Tu CV (PDF)</label>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`cursor-pointer rounded-2xl border border-dashed px-6 py-10 text-center transition ${
                    dragOver ? 'border-[#c9a84c]/60 bg-[#c9a84c]/[0.04]' : 'border-white/12 hover:border-white/25 hover:bg-white/[0.02]'
                  }`}
                >
                  <input ref={inputRef} type="file" accept="application/pdf" onChange={onChange} className="hidden" />
                  {file ? (
                    <div className="flex items-center justify-center gap-3 text-sm text-white">
                      <FileText strokeWidth={1.5} className="h-4 w-4 text-[#c9a84c]" />
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setFile(null) }}
                        className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-white/50 transition hover:border-white/30 hover:text-white"
                        aria-label="Quitar archivo"
                      >
                        <X strokeWidth={1.5} className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-white/50">
                      <Upload strokeWidth={1.5} className="h-5 w-5" />
                      <p className="text-sm font-light">Arrastrá tu CV acá o <span className="text-white underline underline-offset-4">elegí un archivo</span></p>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/30">PDF · hasta 4 MB</p>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-white/40">
                  Si tu archivo pesa más o está escaneado, podés crear un CV liviano y legible en{' '}
                  <Link href="/mi-carrera/cv" className="text-[#c9a84c] underline decoration-[#c9a84c]/35 underline-offset-4">CV Vivo</Link>.
                  {' '}Tu postulación no se descarta si el texto no puede extraerse: el reclutador recibirá el PDF para revisión manual.
                </p>
              </div>

              {/* Cover letter */}
              <div className="mt-5">
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-white/45">
                  Carta de interés <span className="normal-case text-white/25">(opcional)</span>
                </label>
                <textarea
                  value={coverLetter}
                  onChange={e => setCoverLetter(e.target.value)}
                  rows={3}
                  placeholder="Contanos brevemente por qué te interesa esta posición..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm font-light text-white placeholder:text-white/25 focus:border-[#c9a84c]/40 focus:outline-none resize-none transition"
                />
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-sm leading-relaxed text-white/60">
                <input type="checkbox" checked={talentPoolConsent} onChange={event => setTalentPoolConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#c9a84c]" />
                <span><strong className="font-medium text-white/85">Quiero crear mi perfil en CVitae.</strong> Acepto recibir un acceso por correo y que empresas verificadas puedan encontrarme para oportunidades similares. Esto es opcional y no afecta esta postulación.</span>
              </label>

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-sm text-red-400">
                  <AlertCircle strokeWidth={1.5} className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              <div className="mt-8 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/30">Nunca compartimos tu CV sin tu permiso.</p>
                <button
                  type="submit"
                  disabled={!name || !email || !file || submitting}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#c9a84c] px-6 py-3 text-sm font-medium text-[#0a0a0a] transition-all hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.6)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none"
                >
                  {submitting ? (
                    <><Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" /> Enviando…</>
                  ) : (
                    <>Enviar postulación <ArrowRight strokeWidth={1.75} className="h-4 w-4 transition group-hover:translate-x-0.5" /></>
                  )}
                </button>
              </div>
            </motion.form>
          </>
        )}
      </section>
    </main>
  )
}
