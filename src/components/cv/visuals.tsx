import { useId, type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'

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
  const uid = useId().replace(/[^a-z0-9]/gi, 'u')
  const d = 'M 8 92 C 70 88, 110 70, 150 75 S 250 95, 310 60 S 420 25, 480 35 S 580 70, 640 28 S 760 8, 792 14'
  const sw = variant === 'score' ? 2.5 : 1.5

  return (
    <svg viewBox="0 0 800 100" preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`cg-${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#c9a84c" stopOpacity="0" />
          <stop offset="20%" stopColor="#c9a84c" stopOpacity={variant === 'score' ? '0.85' : '0.5'} />
          <stop offset="80%" stopColor="#e6cf8a" stopOpacity={variant === 'score' ? '1' : '0.85'} />
          <stop offset="100%" stopColor="#e6cf8a" stopOpacity="0" />
        </linearGradient>
        <filter id={`gf-${uid}`} x="-30%" y="-400%" width="160%" height="900%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Base path — breathing opacity */}
      <path
        d={d}
        fill="none"
        stroke={`url(#cg-${uid})`}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animate
          attributeName="opacity"
          values="0.45;0.9;0.45"
          dur="4s"
          repeatCount="indefinite"
        />
      </path>

      {/* Traveling glow spot */}
      <path
        d={d}
        fill="none"
        stroke="#e8d080"
        strokeWidth={variant === 'score' ? 5 : 3.5}
        strokeLinecap="round"
        strokeDasharray="150 960"
        filter={`url(#gf-${uid})`}
      >
        <animate
          attributeName="stroke-dashoffset"
          from="1110"
          to="-150"
          dur="3.5s"
          repeatCount="indefinite"
          calcMode="linear"
        />
        <animate
          attributeName="opacity"
          values="0;0.95;0.95;0"
          keyTimes="0;0.04;0.96;1"
          dur="3.5s"
          repeatCount="indefinite"
          calcMode="linear"
        />
      </path>

      {variant === 'score' && (
        <circle cx="792" cy="14" r="4" fill="#e6cf8a">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
          <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}

export function AmbientSignalLines({ className = '' }: { className?: string }) {
  const uid = useId().replace(/[^a-z0-9]/gi, 'u')
  const reduceMotion = useReducedMotion()

  return (
    <svg
      viewBox="0 0 800 400"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`js-main-${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#c9a84c" stopOpacity="0" />
          <stop offset="40%" stopColor="#c9a84c" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`js-soft-${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#c9a84c" stopOpacity="0" />
          <stop offset="60%" stopColor="#c9a84c" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
        </linearGradient>
        <filter id={`js-glow-${uid}`} x="-10%" y="-80%" width="120%" height="260%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M -50 100 C 120 80, 240 140, 400 112 S 600 72, 880 88"
        fill="none"
        stroke={`url(#js-main-${uid})`}
        strokeWidth="1"
        filter={`url(#js-glow-${uid})`}
      >
        {!reduceMotion && (
          <>
            <animate attributeName="opacity" values="0.6;1;0.6" dur="3.2s" repeatCount="indefinite" />
            <animate
              attributeName="d"
              values="M -50 100 C 120 80, 240 140, 400 112 S 600 72, 880 88;M -50 112 C 120 96, 240 120, 400 128 S 600 88, 880 100;M -50 100 C 120 80, 240 140, 400 112 S 600 72, 880 88"
              dur="8s"
              repeatCount="indefinite"
            />
          </>
        )}
      </path>
      <path
        d="M -50 220 C 160 200, 320 248, 480 220 S 680 192, 880 208"
        fill="none"
        stroke={`url(#js-soft-${uid})`}
        strokeWidth="1"
      >
        {!reduceMotion && <animate attributeName="opacity" values="0.3;0.7;0.3" dur="5.5s" repeatCount="indefinite" />}
      </path>
      <path
        d="M -50 300 C 200 288, 400 320, 600 296 S 760 280, 880 292"
        fill="none"
        stroke="#c9a84c"
        strokeOpacity="0.05"
        strokeWidth="0.5"
      >
        {!reduceMotion && <animate attributeName="opacity" values="0.04;0.12;0.04" dur="9s" repeatCount="indefinite" />}
      </path>
    </svg>
  )
}

export function CompatibilityTrace({ score, label = 'Compatibilidad' }: { score: number; label?: string }) {
  const uid = useId().replace(/[^a-z0-9]/gi, 'u')
  const pct = Math.max(0, Math.min(100, score))
  const targetW = (pct / 100) * 200

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
          <linearGradient id={`tr-${uid}`} x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.55 0.08 70)" />
            <stop offset="100%" stopColor="oklch(0.86 0.13 86)" />
          </linearGradient>
          <clipPath id={`cl-${uid}`}>
            <rect x="0" y="0" height="28" width="0">
              <animate
                attributeName="width"
                from="0"
                to={`${targetW}`}
                dur="0.9s"
                fill="freeze"
                calcMode="linear"
              />
            </rect>
          </clipPath>
        </defs>
        <path
          d="M 4 22 C 30 18, 50 8, 80 14 S 130 24, 160 10 S 192 4, 196 6"
          fill="none"
          stroke="oklch(0.95 0.015 85 / 12%)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M 4 22 C 30 18, 50 8, 80 14 S 130 24, 160 10 S 192 4, 196 6"
          fill="none"
          stroke={`url(#tr-${uid})`}
          strokeWidth="2.25"
          strokeLinecap="round"
          clipPath={`url(#cl-${uid})`}
        />
      </svg>
    </div>
  )
}

export function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const uid = useId().replace(/[^a-z0-9]/gi, 'u')
  const pct = Math.max(0, Math.min(100, score))
  const r = 48
  const c = 2 * Math.PI * r

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id={`ring-${uid}`} x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.65 0.12 75)" />
            <stop offset="100%" stopColor="oklch(0.90 0.13 88)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="oklch(0.95 0.015 85 / 10%)" strokeWidth="6" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke={`url(#ring-${uid})`}
          strokeWidth="6" strokeLinecap="round"
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
