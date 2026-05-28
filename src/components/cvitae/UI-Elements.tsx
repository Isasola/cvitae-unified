import { ReactNode } from 'react'
import { Link } from 'wouter'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: ReactNode
  className?: string
  delay?: number
  onClick?: () => void
}

export function GlassCard({ children, className, delay = 0, onClick }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      onClick={onClick}
      className={cn(
        'bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6',
        onClick && 'cursor-pointer hover:border-white/20 transition-all',
        className
      )}
    >
      {children}
    </motion.div>
  )
}

interface GoldButtonProps {
  children: ReactNode
  href?: string
  variant?: 'solid' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  onClick?: () => void
  disabled?: boolean
}

export function GoldButton({
  children,
  href,
  variant = 'solid',
  size = 'md',
  className,
  onClick,
  disabled = false,
}: GoldButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  }

  const variantClasses = {
    solid: 'bg-[#c9a84c] text-[#0a0a0a] hover:bg-[#d4b85f]',
    outline: 'border border-[#c9a84c] text-[#c9a84c] hover:bg-[#c9a84c]/10',
    ghost: 'text-[#888888] hover:text-white hover:bg-white/5',
  }

  const classes = cn(baseClasses, sizeClasses[size], variantClasses[variant], className)

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  )
}

interface BadgeProps {
  children: ReactNode
  variant?: 'gold' | 'muted' | 'warning'
  className?: string
}

export function Badge({ children, variant = 'gold', className }: BadgeProps) {
  const variantClasses = {
    gold: 'bg-[#c9a84c]/20 text-[#c9a84c] border border-[#c9a84c]/30',
    muted: 'bg-white/5 text-[#888888] border border-white/10',
    warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

interface MatchArcProps {
  percentage: number
  size?: number
}

export function MatchArc({ percentage, size = 60 }: MatchArcProps) {
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  const color = percentage >= 80 ? '#4ade80' : percentage >= 60 ? '#facc15' : '#ef4444'

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="3"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white">{percentage}%</span>
      </div>
    </div>
  )
}
