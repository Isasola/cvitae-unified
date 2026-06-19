import { useEffect, useRef } from 'react'
import { motion, animate, useMotionValue } from 'framer-motion'

// ─── GrowthLine ───────────────────────────────────────────────────────────────
// Organic hand-drawn SVG line — the brand's visual signature.
// variant="decorative" fills full width, no progress animation.
// variant="score" animates from 0 to `progress` (0-100).

interface GrowthLineProps {
  variant?: 'decorative' | 'score'
  progress?: number
  width?: number
  height?: number
  className?: string
}

function buildCurvePath(w: number, h: number, pct: number): string {
  const endX = w * (pct / 100)
  return `M 0 ${h * 0.7} C ${endX * 0.25} ${h * 0.8}, ${endX * 0.55} ${h * 0.1}, ${endX * 0.5} ${h * 0.45} S ${endX * 0.75} ${h * 0.65}, ${endX * 0.8} ${h * 0.3} C ${endX * 0.88} ${h * 0.2}, ${endX} ${h * 0.15}, ${endX} ${h * 0.1}`
}

export function GrowthLine({ variant = 'decorative', progress = 100, width = 400, height = 80, className = '' }: GrowthLineProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const progressVal = useMotionValue(variant === 'score' ? 0 : progress)

  useEffect(() => {
    if (variant !== 'score') return
    const controls = animate(progressVal, progress, { duration: 2, ease: 'easeOut' })
    return controls.stop
  }, [progress, variant])

  useEffect(() => {
    return progressVal.on('change', (v) => {
      pathRef.current?.setAttribute('d', buildCurvePath(width, height, v))
    })
  }, [width, height])

  const initialD = buildCurvePath(width, height, variant === 'score' ? 0 : progress)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className={className} aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <filter id="glow-filter" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="b2" />
          <feMerge><feMergeNode in="b2" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="growth-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.3" />
          <stop offset="60%" stopColor="var(--color-gold)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--color-gold-soft)" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path ref={pathRef} d={initialD} fill="none"
        stroke="url(#growth-grad)" strokeWidth="2.5" strokeLinecap="round"
        filter="url(#glow-filter)" />
      {variant === 'score' && (
        <motion.circle r="4" fill="var(--color-gold)" filter="url(#glow-filter)"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
          <animateMotion dur="3s" repeatCount="indefinite" path={buildCurvePath(width, height, progress)} />
        </motion.circle>
      )}
    </svg>
  )
}

// ─── CompatibilityTrace ───────────────────────────────────────────────────────
// Decorative GrowthLine for compatibility % display.

interface CompatibilityTraceProps {
  score: number
  className?: string
}

export function CompatibilityTrace({ score, className = '' }: CompatibilityTraceProps) {
  return (
    <div className={`relative flex items-end gap-3 ${className}`}>
      <GrowthLine variant="score" progress={score} width={220} height={48} />
      <motion.span
        className="text-xl font-bold shrink-0"
        style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
      >
        {score}%
      </motion.span>
    </div>
  )
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────
// Circular ATS score indicator. Gold ring, no mixed colors on the number.

interface ScoreRingProps {
  score: number
  size?: number
  label?: string
}

export function ScoreRing({ score, size = 100, label = 'ATS' }: ScoreRingProps) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <motion.circle cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="var(--color-gold)" strokeWidth="5"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="font-bold leading-none"
            style={{ color: 'var(--color-gold)', fontSize: size * 0.28 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {score}
          </motion.span>
          <span className="text-[9px] uppercase tracking-widest mt-0.5"
            style={{ color: 'var(--color-muted)' }}>{label}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Eyebrow ──────────────────────────────────────────────────────────────────
// Small uppercase gold label with tracking — use above section headings.

export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-widest ${className}`}
      style={{ color: 'var(--color-gold)' }}>
      {children}
    </p>
  )
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  className?: string
}

const logoSizes = { sm: 'text-xl', md: 'text-2xl', lg: 'text-3xl', hero: 'text-6xl md:text-8xl' }

export function Logo({ size = 'md', className = '' }: LogoProps) {
  return (
    <span className={`${logoSizes[size]} leading-none ${className}`}
      style={{ fontFamily: 'var(--font-display)' }}>
      <span className="font-black" style={{ color: 'var(--color-gold)' }}>CV</span>
      <span className="font-normal italic" style={{ color: 'var(--color-cream)' }}>itae</span>
    </span>
  )
}
