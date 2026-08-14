import { useEffect, useState } from 'react'
import { BarChart3, Cookie, Megaphone, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import {
  CONSENT_EVENT, OPEN_CONSENT_EVENT, readConsent, saveConsent,
  type ConsentPreferences,
} from '@/lib/consent'
import { adPreviewEnabled } from '@/lib/consent'

const visualPreview = () => adPreviewEnabled() ? new URLSearchParams(window.location.search).get('cookie-preview') : null

export function CookiePreferences() {
  const [saved, setSaved] = useState<ConsentPreferences | null>(() => visualPreview() === 'dismissed'
    ? { version: 1, analytics: false, advertising: false, decidedAt: new Date().toISOString() }
    : readConsent())
  const [settingsOpen, setSettingsOpen] = useState(() => visualPreview() === 'settings')
  const [analytics, setAnalytics] = useState(saved?.analytics || false)
  const [advertising, setAdvertising] = useState(saved?.advertising || false)

  useEffect(() => {
    const open = () => {
      const current = readConsent()
      setAnalytics(current?.analytics || false)
      setAdvertising(current?.advertising || false)
      setSettingsOpen(true)
    }
    const changed = (event: Event) => setSaved((event as CustomEvent<ConsentPreferences>).detail)
    window.addEventListener(OPEN_CONSENT_EVENT, open)
    window.addEventListener(CONSENT_EVENT, changed)
    return () => {
      window.removeEventListener(OPEN_CONSENT_EVENT, open)
      window.removeEventListener(CONSENT_EVENT, changed)
    }
  }, [])

  const choose = (next: { analytics: boolean; advertising: boolean }) => {
    setSaved(saveConsent(next))
    setSettingsOpen(false)
  }

  return (
    <>
      {!saved && !settingsOpen && (
        <section className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-5xl rounded-2xl border border-white/12 bg-[#0b0b0b]/98 p-4 shadow-[0_24px_80px_rgba(0,0,0,.65)] backdrop-blur-xl sm:bottom-5 sm:p-5" aria-label="Preferencias de privacidad">
          <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#c9a84c]/25 bg-[#c9a84c]/8"><Cookie className="h-4 w-4 text-[#c9a84c]" /></span>
              <div><h2 className="text-sm font-medium text-cream">Vos decidís qué medimos</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/45">Las cookies necesarias mantienen tu sesión. Analytics y publicidad quedan apagados hasta que los aceptes. Podés cambiar tu decisión cuando quieras.</p><a href="/cookies" className="mt-1.5 inline-flex text-[11px] text-[#c9a84c] hover:underline">Ver política de cookies</a></div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={() => choose({ analytics: false, advertising: false })} className="min-h-10 rounded-full border border-white/12 px-4 text-xs text-white/60 transition hover:border-white/25 hover:text-white">Solo necesarias</button>
              <button type="button" onClick={() => setSettingsOpen(true)} className="min-h-10 rounded-full border border-white/12 px-4 text-xs text-white/60 transition hover:border-white/25 hover:text-white"><SlidersHorizontal className="mr-1.5 inline h-3.5 w-3.5" />Personalizar</button>
              <button type="button" onClick={() => choose({ analytics: true, advertising: true })} className="col-span-2 min-h-10 rounded-full bg-[#c9a84c] px-5 text-xs font-medium text-black transition hover:bg-[#e0c66f]">Aceptar todas</button>
            </div>
          </div>
        </section>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center" role="presentation">
          <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/12 bg-[#0b0b0b] p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="cookie-settings-title">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a84c]">Privacidad</p><h2 id="cookie-settings-title" className="font-display mt-2 text-3xl text-cream">Tus preferencias</h2><p className="mt-2 text-xs leading-relaxed text-white/45">Ninguna elección limita las herramientas profesionales de CVitae.</p></div>{saved && <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Cerrar preferencias" className="rounded-full border border-white/10 p-2 text-white/45 hover:text-white"><X className="h-4 w-4" /></button>}</div>

            <div className="mt-7 space-y-3">
              <PreferenceRow icon={ShieldCheck} title="Necesarias" detail="Sesión, seguridad y funciones solicitadas por vos." checked locked onChange={() => {}} />
              <PreferenceRow icon={BarChart3} title="Analytics" detail="Nos ayuda a entender qué páginas funcionan. Google Analytics solo carga si lo aceptás." checked={analytics} onChange={setAnalytics} />
              <PreferenceRow icon={Megaphone} title="Publicidad" detail="Permite mostrar anuncios en espacios públicos claramente identificados. Nunca dentro de tu CV, perfil o postulaciones." checked={advertising} onChange={setAdvertising} />
            </div>

            <div className="mt-7 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><button type="button" onClick={() => choose({ analytics: false, advertising: false })} className="min-h-11 rounded-full border border-white/12 px-5 text-xs text-white/55">Rechazar opcionales</button><button type="button" onClick={() => choose({ analytics, advertising })} className="min-h-11 rounded-full border border-[#c9a84c]/30 px-5 text-xs text-[#dbc16f]">Guardar selección</button><button type="button" onClick={() => choose({ analytics: true, advertising: true })} className="min-h-11 rounded-full bg-[#c9a84c] px-5 text-xs font-medium text-black">Aceptar todas</button></div>
          </section>
        </div>
      )}
    </>
  )
}

function PreferenceRow({ icon: Icon, title, detail, checked, locked = false, onChange }: { icon: typeof ShieldCheck; title: string; detail: string; checked: boolean; locked?: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10"><Icon className={`h-4 w-4 ${locked ? 'text-emerald-300' : 'text-[#c9a84c]'}`} /></span><span className="min-w-0 flex-1"><span className="block text-sm text-cream">{title}</span><span className="mt-1 block text-[11px] leading-relaxed text-white/40">{detail}</span></span><input type="checkbox" checked={checked} disabled={locked} onChange={event => onChange(event.target.checked)} className="sr-only" /><span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full border transition ${checked ? 'border-[#c9a84c]/50 bg-[#c9a84c]/25' : 'border-white/15 bg-white/5'}`}><span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition ${checked ? 'left-[21px] bg-[#d9bd62]' : 'left-0.5 bg-white/35'}`} /></span></label>
}
