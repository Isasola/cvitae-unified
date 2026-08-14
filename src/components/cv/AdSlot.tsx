import { useEffect, useState } from 'react'
import { adPreviewEnabled, adsenseReady, CONSENT_EVENT, readConsent, type ConsentPreferences } from '@/lib/consent'

type Placement = 'jobs-feed' | 'opportunities-feed' | 'blog-end'

const SLOT_ENV: Record<Placement, string> = {
  'jobs-feed': String(import.meta.env.VITE_ADSENSE_SLOT_JOBS || ''),
  'opportunities-feed': String(import.meta.env.VITE_ADSENSE_SLOT_OPPORTUNITIES || ''),
  'blog-end': String(import.meta.env.VITE_ADSENSE_SLOT_BLOG || ''),
}

export function AdSlot({ placement }: { placement: Placement }) {
  const [consent, setConsent] = useState<ConsentPreferences | null>(() => readConsent())
  const preview = adPreviewEnabled()
  const slot = SLOT_ENV[placement].trim()
  const active = preview || (Boolean(consent?.advertising) && adsenseReady() && /^\d+$/.test(slot))

  useEffect(() => {
    const changed = (event: Event) => setConsent((event as CustomEvent<ConsentPreferences>).detail)
    window.addEventListener(CONSENT_EVENT, changed)
    return () => window.removeEventListener(CONSENT_EVENT, changed)
  }, [])

  useEffect(() => {
    if (!active || preview) return
    const timer = window.setTimeout(() => {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch { /* AdSense reintenta cuando termina de cargar. */ }
    }, 100)
    return () => window.clearTimeout(timer)
  }, [active, placement, preview])

  if (!active) return null

  return (
    <aside className="mx-auto mt-12 w-full max-w-4xl border-y border-white/7 py-3" aria-label="Publicidad" data-ad-placement={placement}>
      <p className="mb-2 text-center text-[9px] uppercase tracking-[0.2em] text-white/25">Publicidad</p>
      {preview ? (
        <div className="grid min-h-24 place-items-center bg-[linear-gradient(135deg,rgba(255,255,255,.012)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.012)_50%,rgba(255,255,255,.012)_75%,transparent_75%)] bg-[length:20px_20px] px-4 text-center text-[10px] uppercase tracking-[0.18em] text-white/18">Vista previa · espacio publicitario adaptable</div>
      ) : (
        <ins
          className="adsbygoogle block min-h-24"
          data-ad-client={String(import.meta.env.VITE_GOOGLE_ADSENSE_CLIENT)}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      )}
    </aside>
  )
}
