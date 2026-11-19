export function OpportunityDetailSkeleton() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      {/* Back link placeholder */}
      <div className="h-4 w-28 animate-pulse bg-white/6" />

      <article className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Left column */}
        <div className="space-y-6">
          {/* Eyebrow */}
          <div className="h-3 w-20 animate-pulse bg-white/6" />
          {/* Title */}
          <div className="space-y-2">
            <div className="h-9 w-3/4 animate-pulse bg-white/8" />
            <div className="h-9 w-1/2 animate-pulse bg-white/6" />
          </div>
          {/* Facts row */}
          <div className="flex flex-wrap gap-3 pt-2">
            {[80, 120, 96, 64].map((w, i) => (
              <div key={i} className="h-6 animate-pulse bg-white/6" style={{ width: w }} />
            ))}
          </div>
          {/* Divider */}
          <div className="h-px bg-white/8" />
          {/* Body lines */}
          <div className="space-y-3">
            {[100, 92, 85, 100, 78, 95, 60].map((pct, i) => (
              <div key={i} className="h-4 animate-pulse bg-white/6" style={{ width: `${pct}%` }} />
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="h-fit border border-white/8 bg-white/[0.018] p-5">
          <div className="h-10 w-full animate-pulse bg-white/8" />
          <div className="mt-3 h-8 w-full animate-pulse bg-white/5" />
          <div className="mt-5 space-y-2 border-t border-white/8 pt-4">
            {[100, 80, 90].map((pct, i) => (
              <div key={i} className="h-3 animate-pulse bg-white/5" style={{ width: `${pct}%` }} />
            ))}
          </div>
        </div>
      </article>
    </main>
  )
}
