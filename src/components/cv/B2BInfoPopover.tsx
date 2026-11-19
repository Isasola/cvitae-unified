import { useEffect, useId, useState } from 'react'
import { Info, X } from 'lucide-react'

interface B2BInfoPopoverProps {
  label?: string
  title: string
  description: string
  points?: string[]
}

export function B2BInfoPopover({ label = 'Más información', title, description, points = [] }: B2BInfoPopoverProps) {
  const [open, setOpen] = useState(false)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(value => !value)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-white/35 transition hover:border-[#c9a84c]/40 hover:text-[#c9a84c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
      >
        <Info strokeWidth={1.5} className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div id={id} role="dialog" aria-label={title} className="absolute right-0 top-10 z-50 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-white/12 bg-[#10100f] p-5 text-left shadow-2xl shadow-black/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#c9a84c]">Cómo funciona</p>
              <h2 className="mt-2 font-display text-lg leading-snug text-white">{title}</h2>
            </div>
            <button type="button" aria-label="Cerrar información" onClick={() => setOpen(false)} className="text-white/30 transition hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/55">{description}</p>
          {points.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-white/8 pt-4">
              {points.map(point => <li key={point} className="flex gap-2 text-xs leading-relaxed text-white/60"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#c9a84c]" />{point}</li>)}
            </ul>
          )}
        </div>
      )}
    </span>
  )
}
