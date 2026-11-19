import type { ReactNode } from 'react'

export function PageLoadingState({ label = 'Cargando', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="mt-6" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="grid gap-px overflow-hidden border border-white/8 bg-white/8 md:grid-cols-2">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="bg-[#0b0b0b] p-5">
            <div className="mb-3 h-3 w-16 animate-pulse bg-white/10" />
            <div className="mb-2 h-5 w-3/4 animate-pulse bg-white/10" />
            <div className="h-4 w-1/2 animate-pulse bg-white/[0.06]" />
            <div className="mt-8 h-px w-full bg-white/[0.05]" />
            <div className="mt-3 flex justify-between"><div className="h-3 w-24 animate-pulse bg-white/[0.06]" /><div className="h-3 w-20 animate-pulse bg-white/[0.06]" /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PageErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-red-400/20 bg-red-400/[0.04] p-6 text-sm text-red-200" role="alert"><span>{message}</span>{onRetry && <button type="button" onClick={onRetry} className="text-xs underline underline-offset-4 hover:text-white">Reintentar</button>}</div>
}

export function PageEmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="mt-6 border border-white/8 px-6 py-14 text-center"><p className="text-cream">{title}</p>{description && <p className="mx-auto mt-2 max-w-xl text-sm text-white/40">{description}</p>}{action && <div className="mt-4">{action}</div>}</div>
}
