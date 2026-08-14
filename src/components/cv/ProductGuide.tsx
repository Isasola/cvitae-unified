import { useState } from 'react'
import { Check, ChevronRight, HelpCircle, X } from 'lucide-react'

interface GuideStep {
  title: string
  description: string
}

interface ProductGuideProps {
  storageKey: string
  label: string
  steps: GuideStep[]
}

export function ProductGuide({ storageKey, label, steps }: ProductGuideProps) {
  const completedKey = `cvitae_guide_${storageKey}_completed`
  const closedKey = `cvitae_guide_${storageKey}_closed_at`
  const [open, setOpen] = useState(() => {
    if (localStorage.getItem(completedKey) === 'true') return false
    const closedAt = localStorage.getItem(closedKey)
    if (closedAt) {
      const elapsed = Date.now() - Number(closedAt)
      if (elapsed < 24 * 60 * 60 * 1000) return false
    }
    return true
  })
  const [step, setStep] = useState(0)

  const closeCompleted = () => {
    localStorage.setItem(completedKey, 'true')
    setOpen(false)
    setStep(0)
  }

  const closeSnoozed = () => {
    localStorage.setItem(closedKey, String(Date.now()))
    setOpen(false)
    setStep(0)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <section className="w-[min(360px,calc(100vw-2rem))] border border-white/10 bg-[#0b0b0b] p-5 shadow-2xl" aria-label={`Guía de ${label}`}>
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#c9a84c]">Guía · {label}</p>
            <button onClick={closeSnoozed} className="grid h-11 w-11 place-items-center text-white/35 transition hover:text-white" aria-label="Cerrar guía"><X className="h-4 w-4" /></button>
          </div>
          <p className="mt-5 text-xs text-white/35">{step + 1} de {steps.length}</p>
          <h2 className="mt-2 font-display text-xl text-cream">{steps[step].title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/55">{steps[step].description}</p>
          <div className="mt-6 flex items-center justify-between border-t border-white/8 pt-4">
            <button onClick={() => setStep(current => Math.max(0, current - 1))} disabled={step === 0} className="min-h-11 px-2 text-xs text-white/35 disabled:opacity-0">Anterior</button>
            {step < steps.length - 1 ? (
              <button onClick={() => setStep(current => current + 1)} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs text-[#c9a84c]">Siguiente <ChevronRight className="h-3.5 w-3.5" /></button>
            ) : (
              <button onClick={closeCompleted} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" /> Entendido</button>
            )}
          </div>
        </section>
      ) : (
        <button onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-[#0b0b0b] px-4 py-2.5 text-xs text-white/55 shadow-xl transition hover:border-[#c9a84c]/35 hover:text-white">
          <HelpCircle className="h-4 w-4 text-[#c9a84c]" /> Guía
        </button>
      )}
    </div>
  )
}
