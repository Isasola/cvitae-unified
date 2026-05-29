import { motion } from 'framer-motion'
import { CheckCircle, Circle, Loader2 } from 'lucide-react'

interface MatchingLoaderProps {
  steps: string[]
  currentStep: number
  totalVacancies?: number
}

export default function MatchingLoader({ steps, currentStep, totalVacancies = 50 }: MatchingLoaderProps) {
  return (
    <div className="w-full max-w-[400px] mx-auto p-8 flex flex-col items-center">
      {/* 3D Golden Cubes Animation (Tetris Style) */}
      <div className="relative w-24 h-24 mb-12">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="absolute w-8 h-8 bg-gradient-to-br from-[#c9a84c] to-[#a68a3d] rounded-sm border border-[#c9a84c]/50 shadow-[0_0_15px_rgba(201,168,76,0.3)]"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: [0, i % 2 === 0 ? 20 : -20, 0],
              y: [0, i < 2 ? 20 : -20, 0],
              rotate: [0, 90, 180, 270, 360],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut"
            }}
            style={{
              left: '33%',
              top: '33%',
            }}
          />
        ))}
      </div>

      {/* Progress Steps */}
      <div className="w-full space-y-4 mb-8">
        {steps.map((step, index) => (
          <motion.div
            key={step}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            {index < currentStep ? (
              <CheckCircle className="text-emerald-500 shrink-0" size={18} />
            ) : index === currentStep ? (
              <Loader2 className="text-[#c9a84c] animate-spin shrink-0" size={18} />
            ) : (
              <Circle className="text-white/10 shrink-0" size={18} />
            )}
            <span className={cn(
              "text-sm transition-colors",
              index === currentStep ? "text-white font-medium" : 
              index < currentStep ? "text-white/40" : "text-white/20"
            )}>
              {step}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="w-full">
        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-2">
          <motion.div
            className="h-full bg-gradient-to-r from-[#c9a84c]/50 to-[#c9a84c]"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <p className="text-[10px] text-[#888888] text-center uppercase tracking-widest">
          Analizando {totalVacancies} oportunidades...
        </p>
      </div>
    </div>
  )
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}
