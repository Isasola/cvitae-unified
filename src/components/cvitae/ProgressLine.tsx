import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

interface ProgressLineProps {
  percentage?: number
  width?: number
  height?: number
  className?: string
  animated?: boolean
}

// SVG path for the organic hand-drawn career trajectory curve
// The path goes left-to-right with natural organic bumps representing career growth
function buildPath(w: number, h: number, progress: number): string {
  const endX = w * (progress / 100)
  const cp1x = endX * 0.25
  const cp1y = h * 0.8
  const cp2x = endX * 0.55
  const cp2y = h * 0.1
  const cp3x = endX * 0.75
  const cp3y = h * 0.65
  const cp4x = endX * 0.88
  const cp4y = h * 0.2
  return `M 0 ${h * 0.7} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX * 0.5} ${h * 0.45} S ${cp3x} ${cp3y}, ${endX * 0.8} ${h * 0.3} C ${cp4x} ${cp4y}, ${endX} ${h * 0.15}, ${endX} ${h * 0.1}`
}

export function ProgressLine({
  percentage = 100,
  width = 400,
  height = 80,
  className = '',
  animated = true,
}: ProgressLineProps) {
  const progressVal = useMotionValue(animated ? 0 : percentage)
  const pathRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    if (!animated) return
    const controls = animate(progressVal, percentage, { duration: 2, ease: 'easeOut' })
    return controls.stop
  }, [percentage, animated])

  useEffect(() => {
    const unsub = progressVal.on('change', (v) => {
      if (pathRef.current) {
        pathRef.current.setAttribute('d', buildPath(width, height, v))
      }
    })
    return unsub
  }, [width, height])

  const initialD = buildPath(width, height, animated ? 0 : percentage)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id="progress-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="progress-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c9a84c" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#c9a84c" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#d4b85f" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Glow trail layer */}
      <path
        ref={pathRef}
        d={initialD}
        fill="none"
        stroke="url(#progress-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        filter="url(#progress-glow)"
      />

      {/* Animated glow pulse travelling along the line */}
      {animated && (
        <motion.circle
          r="5"
          fill="#c9a84c"
          filter="url(#progress-glow)"
          animate={{
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            offsetPath: `path("${buildPath(width, height, percentage)}")`,
            offsetDistance: '0%',
          }}
        >
          <animateMotion
            dur="3s"
            repeatCount="indefinite"
            path={buildPath(width, height, percentage)}
          />
        </motion.circle>
      )}
    </svg>
  )
}

// Compact score variant: line that draws from left to a percentage mark
interface ScoreLineProps {
  percentage: number
  className?: string
}

export function ScoreLine({ percentage, className = '' }: ScoreLineProps) {
  return (
    <div className={`relative ${className}`}>
      <ProgressLine percentage={percentage} width={300} height={60} animated />
      <div
        className="absolute right-0 top-0 flex flex-col items-end"
        style={{ top: '4px' }}
      >
        <motion.span
          className="text-2xl font-bold text-[#c9a84c]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
        >
          {percentage}%
        </motion.span>
        <span className="text-[10px] text-[#888888] uppercase tracking-wider">empleabilidad</span>
      </div>
    </div>
  )
}
