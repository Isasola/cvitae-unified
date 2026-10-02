import { useEffect, useState, type ReactNode } from 'react'

export interface B2CProgressStage {
  label: string
}

interface B2CProgressLoaderProps {
  eyebrow?: string
  title: string
  description?: string
  stages: B2CProgressStage[]
  activeIndex?: number
  icon?: ReactNode
}

/** Shared long-operation state for B2C pages. It communicates stages, never fake percentages. */
export function B2CProgressLoader({
  eyebrow = 'CVitae está trabajando',
  title,
  description,
  stages,
  activeIndex,
  icon,
}: B2CProgressLoaderProps) {
  const [autoIndex, setAutoIndex] = useState(0)
  useEffect(() => {
    if (activeIndex !== undefined || stages.length < 2) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return
    const timer = window.setInterval(() => setAutoIndex(current => (current + 1) % stages.length), 2200)
    return () => window.clearInterval(timer)
  }, [activeIndex, stages.length])
  const requestedIndex = activeIndex ?? autoIndex
  const safeIndex = Math.max(0, Math.min(requestedIndex, Math.max(stages.length - 1, 0)))
  return (
    <section className="b2c-progress-loader w-full rounded-3xl border border-white/10 bg-[#0a0a0a] p-6 sm:p-8" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#c9a84c]/25 bg-[#c9a84c]/10 text-[#c9a84c]" aria-hidden="true">
          {icon || <span className="h-2.5 w-2.5 rounded-full bg-[#c9a84c]" />}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a84c]">{eyebrow}</p>
          <h2 className="mt-1 font-display text-2xl leading-tight text-cream sm:text-3xl">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-white/45">{description}</p>}
        </div>
      </div>
      <div className="b2c-progress-loader__stage mt-7" aria-hidden="true">
        {[safeIndex, safeIndex - 1, safeIndex - 2].map((stageIndex, depth) => {
          const stage = stages[stageIndex]
          if (!stage) return null
          return <div key={`${stage.label}-${stageIndex}`} className={`b2c-progress-loader__card b2c-progress-loader__card--${depth}`}><span>{stage.label}</span></div>
        })}
      </div>
      <p className="mt-5 text-sm text-cream" aria-hidden="true">{stages[safeIndex]?.label || 'Preparando el siguiente paso'}<span className="ml-0.5 text-[#c9a84c]">…</span></p>
      <span className="sr-only">CVitae está preparando tu resultado. Las etapas se muestran de forma orientativa.</span>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {stages.map((stage, index) => <li key={stage.label} className={`flex items-center gap-2 text-xs ${index <= safeIndex ? 'text-white/75' : 'text-white/30'}`}><span className={`h-1.5 w-1.5 rounded-full ${index < safeIndex ? 'bg-emerald-300' : index === safeIndex ? 'bg-[#c9a84c]' : 'bg-white/15'}`} />{stage.label}</li>)}
      </ol>
    </section>
  )
}
