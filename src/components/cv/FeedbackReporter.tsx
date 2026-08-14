import { useMemo, useState } from 'react'
import { AlertTriangle, Bug, CheckCircle2, Database, Lightbulb, Loader2, MessageSquareText, Send, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Audience = 'b2c' | 'b2b' | 'public'
type Category = 'bug' | 'data' | 'usability' | 'suggestion'
type Severity = 'blocking' | 'major' | 'minor' | 'suggestion'

const CATEGORY = {
  bug: { label: 'Algo falló', icon: Bug, severity: 'major' as Severity },
  data: { label: 'Dato incorrecto', icon: Database, severity: 'major' as Severity },
  usability: { label: 'Es difícil usarlo', icon: MessageSquareText, severity: 'minor' as Severity },
  suggestion: { label: 'Tengo una idea', icon: Lightbulb, severity: 'suggestion' as Severity },
}

const FEATURE_BY_PATH: Array<[RegExp, string]> = [
  [/^\/mi-carrera\/aprender/, 'Plan de aprendizaje'], [/^\/mi-carrera\/postular/, 'Postulaciones'],
  [/^\/mi-carrera\/ats/, 'Diagnóstico ATS'], [/^\/mi-carrera\/mejorar/, 'Mejorar CV'],
  [/^\/mi-carrera\/cv/, 'Mi CV'], [/^\/mi-carrera\/perfil/, 'Perfil B2C'],
  [/^\/mi-carrera/, 'Dashboard B2C'], [/^\/empresas\/masivo/, 'Análisis masivo B2B'],
  [/^\/empresas/, 'Portal de empresas'],
]

function currentFeature(fallback?: string) {
  if (fallback) return fallback
  return FEATURE_BY_PATH.find(([pattern]) => pattern.test(window.location.pathname))?.[1] || 'CVitae'
}

function localVisualState() {
  if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return ''
  return new URLSearchParams(window.location.search).get('feedback-preview') || ''
}

export function FeedbackReporter({ audience, feature, className }: { audience: Audience; feature?: string; className?: string }) {
  const visualState = localVisualState()
  const [open, setOpen] = useState(() => ['open', 'success'].includes(visualState))
  const [category, setCategory] = useState<Category>('bug')
  const [severity, setSeverity] = useState<Severity>('major')
  const [message, setMessage] = useState(() => visualState === 'open' ? 'Al completar el análisis, el estado de carga quedó visible y no pude continuar.' : '')
  const [expectedResult, setExpectedResult] = useState(() => visualState === 'open' ? 'Ver el resultado y poder continuar con el siguiente paso.' : '')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState(() => visualState === 'success' ? 'CV-20260813-A1B2C3D4' : '')
  const resolvedFeature = useMemo(() => currentFeature(feature), [feature, open])

  const selectCategory = (next: Category) => { setCategory(next); setSeverity(CATEGORY[next].severity) }
  const close = () => {
    setOpen(false)
    if (reference) { setReference(''); setMessage(''); setExpectedResult(''); setError('') }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (message.trim().length < 20) { setError('Contanos un poco más: necesitamos al menos 20 caracteres.'); return }
    setSending(true); setError('')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (audience === 'b2c') {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      }
      let recruiterToken = ''
      if (audience === 'b2b') {
        try { recruiterToken = JSON.parse(sessionStorage.getItem('cvitae_recruiter_session') || '{}').token || '' } catch { /* permite reportar fallos de acceso */ }
      }
      const response = await fetch('/.netlify/functions/submit-feedback', {
        method: 'POST', headers,
        body: JSON.stringify({
          audience, category, severity, feature: resolvedFeature, message: message.trim(),
          expectedResult: expectedResult.trim(), pagePath: window.location.pathname,
          email: email.trim(), recruiterToken,
          context: { viewport: { width: window.innerWidth, height: window.innerHeight } },
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No pudimos guardar el reporte')
      setReference(data.reference)
    } catch (caught: any) { setError(caught?.message || 'No pudimos guardar el reporte') }
    finally { setSending(false) }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('fixed z-40 inline-flex h-10 items-center gap-2 rounded-full border border-white/12 bg-[#0b0b0b]/95 px-4 text-xs text-white/55 shadow-xl backdrop-blur transition hover:border-[#c9a84c]/35 hover:text-[#dbc16f]', className)} aria-label="Reportar un error o sugerir una mejora">
        <AlertTriangle className="h-3.5 w-3.5 text-[#c9a84c]" /> Reportar
      </button>

      {open && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center" role="presentation">
        <section className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/12 bg-[#0b0b0b] p-5 shadow-2xl sm:p-8" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a84c]">{audience === 'b2b' ? 'Portal de empresas' : 'Mi carrera'}</p><h2 id="feedback-title" className="font-display mt-2 text-3xl text-cream">Ayudanos a verlo.</h2><p className="mt-2 text-sm text-white/45">Área detectada: <span className="text-white/65">{resolvedFeature}</span></p></div><button type="button" onClick={close} className="rounded-full border border-white/10 p-2 text-white/40 transition hover:text-white" aria-label="Cerrar reporte"><X className="h-4 w-4" /></button></div>

          {reference ? <div className="py-12 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" /><h3 className="font-display mt-5 text-3xl text-cream">Reporte guardado</h3><p className="mt-3 text-sm text-white/45">Usá esta referencia si necesitás consultarnos.</p><code className="mt-5 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/[0.05] px-5 py-2 text-sm tracking-wider text-emerald-200">{reference}</code><button type="button" onClick={close} className="mx-auto mt-8 block rounded-full bg-[#c9a84c] px-6 py-2.5 text-sm font-medium text-black">Cerrar</button></div> : <form onSubmit={submit} className="mt-7">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(Object.entries(CATEGORY) as [Category, typeof CATEGORY[Category]][]).map(([key, item]) => { const Icon = item.icon; return <button key={key} type="button" onClick={() => selectCategory(key)} className={`min-h-20 rounded-2xl border p-3 text-left transition ${category === key ? 'border-[#c9a84c]/45 bg-[#c9a84c]/[0.06] text-cream' : 'border-white/8 text-white/40 hover:border-white/18'}`}><Icon className={`h-4 w-4 ${category === key ? 'text-[#c9a84c]' : ''}`} /><span className="mt-2 block text-[11px] leading-tight">{item.label}</span></button> })}</div>
            <label className="mt-6 block"><span className="text-[10px] uppercase tracking-[0.14em] text-white/35">¿Qué pasó?</span><textarea value={message} onChange={event => setMessage(event.target.value)} rows={4} maxLength={3000} placeholder="Qué estabas haciendo, qué ocurrió y si pudiste continuar…" className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-cream outline-none placeholder:text-white/20 focus:border-[#c9a84c]/45" /></label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="text-[10px] uppercase tracking-[0.14em] text-white/35">Resultado esperado · opcional</span><input value={expectedResult} onChange={event => setExpectedResult(event.target.value)} maxLength={1500} placeholder="Qué esperabas que ocurriera" className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm text-cream outline-none placeholder:text-white/20 focus:border-[#c9a84c]/45" /></label><label><span className="text-[10px] uppercase tracking-[0.14em] text-white/35">Impacto</span><select value={severity} onChange={event => setSeverity(event.target.value as Severity)} disabled={category === 'suggestion'} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#111] px-4 text-sm text-cream outline-none disabled:opacity-50"><option value="blocking">Me impide continuar</option><option value="major">Afecta una función importante</option><option value="minor">Puedo continuar</option>{category === 'suggestion' && <option value="suggestion">Sugerencia</option>}</select></label></div>
            <label className="mt-4 block"><span className="text-[10px] uppercase tracking-[0.14em] text-white/35">Email de contacto · opcional</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Si querés que podamos responderte" className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm text-cream outline-none placeholder:text-white/20 focus:border-[#c9a84c]/45" /></label>
            <p className="mt-5 text-[11px] leading-relaxed text-white/30">Guardamos la ruta, el tamaño de pantalla y el navegador para diagnosticar. No adjuntamos automáticamente tu CV, postulaciones, contraseñas ni contenido de formularios. No incluyas información sensible en el mensaje.</p>
            {error && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-xs text-rose-100" role="alert">{error}</p>}
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={close} className="h-11 rounded-full border border-white/10 px-5 text-xs text-white/45">Cancelar</button><button type="submit" disabled={sending || message.trim().length < 20} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a84c] px-6 text-xs font-medium text-black disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar reporte</button></div>
          </form>}
        </section>
      </div>}
    </>
  )
}
