import { type ReactNode } from 'react'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`font-display leading-none text-gold cursor-pointer ${className}`}>
      <span className="font-black">CV</span>
      <span className="italic font-normal">itae</span>
    </div>
  )
}

export function GrowthLine({
  className = '',
  variant = 'decorative',
}: {
  className?: string
  variant?: 'decorative' | 'score'
}) {
  const d =
    'M 8 92 C 70 88, 110 70, 150 75 S 250 95, 310 60 S 420 25, 480 35 S 580 70, 640 28 S 760 8, 792 14'
  const stroke = variant === 'score' ? 'url(#cv-gold-bright)' : 'url(#cv-gold)'
  return (
    <svg viewBox="0 0 800 100" preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cv-gold" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="oklch(0.78 0.13 82)" stopOpacity="0" />
          <stop offset="20%" stopColor="oklch(0.78 0.13 82)" stopOpacity="0.55" />
          <stop offset="80%" stopColor="oklch(0.86 0.10 86)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="oklch(0.86 0.10 86)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cv-gold-bright" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="oklch(0.65 0.12 75)" />
          <stop offset="100%" stopColor="oklch(0.90 0.13 88)" />
        </linearGradient>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={variant === 'score' ? 2.5 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {variant === 'score' && <circle cx="792" cy="14" r="4" fill="oklch(0.90 0.13 88)" />}
    </svg>
  )
}

export function CompatibilityTrace({ score, label = 'Compatibilidad' }: { score: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <span className="font-display text-2xl text-cream">
          {pct}
          <span className="text-base align-top">%</span>
        </span>
      </div>
      <svg viewBox="0 0 200 28" className="mt-1 w-full h-6" aria-hidden="true">
        <defs>
          <linearGradient id={`trace-${pct}-${label}`} x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.55 0.08 70)" />
            <stop offset="100%" stopColor="oklch(0.86 0.13 86)" />
          </linearGradient>
        </defs>
        <path
          d="M 4 22 C 30 18, 50 8, 80 14 S 130 24, 160 10 S 192 4, 196 6"
          fill="none"
          stroke="oklch(0.95 0.015 85 / 12%)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <clipPath id={`clip-${pct}-${label}`}>
          <rect x="0" y="0" width={(pct / 100) * 200} height="28" />
        </clipPath>
        <path
          d="M 4 22 C 30 18, 50 8, 80 14 S 130 24, 160 10 S 192 4, 196 6"
          fill="none"
          stroke={`url(#trace-${pct}-${label})`}
          strokeWidth="2.25"
          strokeLinecap="round"
          clipPath={`url(#clip-${pct}-${label})`}
        />
      </svg>
    </div>
  )
}

export function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, score))
  const r = 48
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id={`ring-${size}-${pct}`} x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.65 0.12 75)" />
            <stop offset="100%" stopColor="oklch(0.90 0.13 88)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="oklch(0.95 0.015 85 / 10%)" strokeWidth="6" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={`url(#ring-${size}-${pct})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-3xl text-cream">{pct}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Score ATS</div>
      </div>
    </div>
  )
}

export function Connector() {
  return (
    <svg viewBox="0 0 40 60" className="h-full w-10" aria-hidden="true">
      <path
        d="M 20 0 C 14 18, 28 28, 22 42 S 16 56, 20 60"
        fill="none"
        stroke="oklch(0.78 0.13 82 / 45%)"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] uppercase tracking-[0.22em] text-gold">{children}</p>
}
