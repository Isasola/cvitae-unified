import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  showTagline?: boolean
  className?: string
}

export function Logo({ size = 'md', showTagline = false, className }: LogoProps) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
    hero: 'text-5xl md:text-7xl',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn('flex flex-col items-center', className)}
    >
      <span
        style={{
          fontFamily: "'Playfair Display', serif",
          letterSpacing: '-0.02em',
          color: '#c9a84c',
        }}
        className={sizes[size]}
      >
        <span style={{ fontWeight: 900 }}>CV</span>
        <span style={{ fontStyle: 'italic', fontWeight: 400 }}>itae</span>
      </span>
      {showTagline && (
        <span className="text-[#888888] text-sm mt-1 font-light tracking-wide">
          Intelligence Hub
        </span>
      )}
    </motion.div>
  )
}
