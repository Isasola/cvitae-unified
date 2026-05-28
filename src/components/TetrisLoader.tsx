import { motion } from 'framer-motion'

interface TetrisLoaderProps {
  size?: 'sm' | 'md' | 'lg'
  speed?: 'slow' | 'normal' | 'fast'
  text?: string
}

export function TetrisLoader({ size = 'md', speed = 'normal', text }: TetrisLoaderProps) {
  const blockSize = size === 'sm' ? 16 : size === 'md' ? 24 : 32
  const duration = speed === 'slow' ? 3 : speed === 'fast' ? 1.5 : 2
  const colors = ['#c9a84c', '#d4b85f', '#b39540', '#e5c76b', '#a0842e']

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="relative mb-6" style={{ width: blockSize * 4, height: blockSize * 4 }}>
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-sm"
            style={{
              width: blockSize,
              height: blockSize,
              backgroundColor: colors[i % colors.length],
              left: `${(i * 1.5) % 4 * blockSize}px`,
              boxShadow: '0 0 8px currentColor',
            }}
            initial={{ y: -blockSize * 2, opacity: 0, rotate: 0 }}
            animate={{ y: blockSize * 5, opacity: [0, 1, 1, 0], rotate: [0, 90, 180, 270] }}
            transition={{ duration, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
          />
        ))}
        <div className="absolute inset-0 border border-[#c9a84c]/20 rounded-sm grid grid-cols-4 gap-px opacity-20">
          {[...Array(16)].map((_, i) => <div key={i} className="border border-[#c9a84c]/10" />)}
        </div>
      </div>
      {text && <p className="text-[#c9a84c] font-medium text-sm">{text}</p>}
    </div>
  )
}
