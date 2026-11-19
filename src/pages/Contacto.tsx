import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Building2, CheckCircle, Lightbulb, MessageSquare, Send } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { Eyebrow } from '@/components/cv/visuals'

type ContactType = 'empresa' | 'sugerencia' | 'otro'

const TYPES: { id: ContactType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: 'empresa',
    label: 'Quiero aparecer',
    icon: <Building2 className="h-4 w-4" />,
    description: 'Representás una organización con oportunidades para Paraguay',
  },
  {
    id: 'sugerencia',
    label: 'Tengo una sugerencia',
    icon: <Lightbulb className="h-4 w-4" />,
    description: 'Ideas, mejoras o errores que encontraste en la plataforma',
  },
  {
    id: 'otro',
    label: 'Otro',
    icon: <MessageSquare className="h-4 w-4" />,
    description: 'Consultas generales o cualquier otro tema',
  },
]

const inputCls = 'w-full border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-cream outline-none placeholder:text-white/25 focus:border-[#c9a84c]/45 transition'

export default function Contacto() {
  const [type, setType] = useState<ContactType>('empresa')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const selected = TYPES.find(t => t.id === type)!

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Completá todos los campos obligatorios.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('El email no parece válido.')
      return
    }
    if (message.trim().length < 10) {
      setError('El mensaje es demasiado corto.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/submit-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name: name.trim(), email: email.trim(), message: message.trim(), url: url.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al enviar el mensaje.')
      } else {
        setSent(true)
      }
    } catch {
      setError('No pudimos conectar con el servidor. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Helmet>
        <title>Contacto | CVitae</title>
        <meta name="description" content="Contactá a CVitae para sugerir fuentes de oportunidades, enviar ideas de mejora o cualquier consulta sobre la plataforma." />
        <link rel="canonical" href="https://cvitae.lat/contacto" />
      </Helmet>
      <SiteShell>
        <main className="mx-auto max-w-3xl px-6 py-14 sm:py-20">

          {/* Header */}
          <header className="mb-10">
            <Eyebrow>Contacto</Eyebrow>
            <h1 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">
              ¿Querés aparecer o<br className="hidden sm:block" /> tenés algo que decirnos?
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/50">
              Si representás una organización con oportunidades para Paraguay, podés sugerir tu fuente.
              También recibimos ideas, reportes y cualquier consulta.
            </p>
          </header>

          {sent ? (
            <div className="border border-white/8 bg-white/[0.02] px-8 py-14 text-center">
              <CheckCircle className="mx-auto mb-5 h-10 w-10 text-[#c9a84c]" />
              <p className="text-lg font-medium text-cream">Mensaje enviado.</p>
              <p className="mt-2 text-sm text-white/45">Te respondemos pronto a <span className="text-cream">{email}</span>.</p>
              <button
                onClick={() => { setSent(false); setName(''); setEmail(''); setMessage(''); setUrl('') }}
                className="mt-6 border border-white/10 px-5 py-2.5 text-xs text-white/45 transition hover:border-white/20 hover:text-white/70"
              >
                Enviar otro mensaje
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>

              {/* Type selector */}
              <div className="mb-8">
                <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-white/30">Motivo del contacto</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {TYPES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id)}
                      className={`flex flex-col gap-2 border p-4 text-left transition ${
                        type === t.id
                          ? 'border-[#c9a84c]/50 bg-[#c9a84c]/[0.06]'
                          : 'border-white/8 bg-white/[0.015] hover:border-white/15'
                      }`}
                    >
                      <span className={type === t.id ? 'text-[#c9a84c]' : 'text-white/35'}>{t.icon}</span>
                      <span className={`text-sm font-medium ${type === t.id ? 'text-cream' : 'text-white/60'}`}>{t.label}</span>
                      <span className="text-[11px] leading-snug text-white/30">{t.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form fields */}
              <div className="border border-white/8 bg-white/[0.015] p-6 sm:p-8">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Nombre <span className="text-[#c9a84c]">*</span></span>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Tu nombre completo"
                      className={inputCls}
                      autoComplete="name"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Email <span className="text-[#c9a84c]">*</span></span>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className={inputCls}
                      autoComplete="email"
                    />
                  </label>
                </div>

                {type === 'empresa' && (
                  <label className="mt-5 flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">URL de tu organización</span>
                    <input
                      type="url"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      placeholder="https://tu-organizacion.com"
                      className={inputCls}
                    />
                  </label>
                )}

                <label className="mt-5 flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                    Mensaje <span className="text-[#c9a84c]">*</span>
                    <span className="ml-2 normal-case text-white/20">({message.length}/2000)</span>
                  </span>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={6}
                    maxLength={2000}
                    placeholder={
                      type === 'empresa'
                        ? 'Contanos sobre tu organización, qué tipo de oportunidades publicás y para qué países son...'
                        : type === 'sugerencia'
                        ? 'Describí tu idea o lo que encontraste. Si es un error, contanos cómo reproducirlo...'
                        : 'Tu consulta...'
                    }
                    className={`${inputCls} resize-none`}
                  />
                </label>

                {error && (
                  <p className="mt-4 border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-sm text-red-300">
                    {error}
                  </p>
                )}

                <div className="mt-6 flex items-center justify-between gap-4">
                  <p className="text-[11px] text-white/25">
                    Respondemos en menos de 48h hábiles
                  </p>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 bg-[#c9a84c] px-6 py-3 text-sm font-semibold text-black transition hover:bg-[#dbc16f] disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="h-4 w-4 animate-spin border-2 border-black border-t-transparent" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {loading ? 'Enviando...' : 'Enviar mensaje'}
                  </button>
                </div>
              </div>

            </form>
          )}

        </main>
      </SiteShell>
    </>
  )
}
