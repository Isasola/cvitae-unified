// src/components/cvitae/FoundingBetaModal.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Check } from 'lucide-react'

interface FoundingBetaModalProps {
  slotsRemaining: number
  programFull: boolean
  onAccept: () => Promise<void>
  onDismiss: () => void
  onDecline: () => void
}

export function FoundingBetaModal({ slotsRemaining, programFull, onAccept, onDismiss, onDecline }: FoundingBetaModalProps) {
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')

  const handleAccept = async () => {
    if (programFull) return
    setAccepting(true); setError('')
    try {
      await onAccept()
      setAccepted(true)
      setTimeout(() => onDismiss(), 2500)
    } catch {
      setError('Hubo un error. Intentá de nuevo.')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onDismiss} />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d0d] p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 rounded-full p-1.5 text-white/40 transition hover:text-white/80"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <AnimatePresence mode="wait">
          {accepted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-4"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#c9a84c]/15 border border-[#c9a84c]/30">
                <Check className="h-7 w-7 text-[#c9a84c]" />
              </div>
              <h3 className="font-display text-xl text-cream">¡Sos parte del Founding 50!</h3>
              <p className="mt-2 text-sm text-white/60">Tu acceso Pro por 6 meses ya está activo.</p>
            </motion.div>
          ) : (
            <motion.div key="offer" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Badge */}
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/10 px-3 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#c9a84c]" />
                <span className="text-xs font-medium text-[#c9a84c]">Founding 50</span>
              </div>

              {programFull ? (
                <>
                  <h2 className="font-display text-2xl text-cream">El programa está completo</h2>
                  <p className="mt-3 text-sm text-white/60">
                    Los 50 cupos del Founding Beta ya fueron ocupados. Gracias por tu interés —
                    seguís teniendo acceso gratuito a CVitae.
                  </p>
                  <button
                    onClick={onDismiss}
                    className="mt-6 w-full rounded-xl bg-white/8 py-3 text-sm font-medium text-white transition hover:bg-white/12"
                  >
                    Entendido
                  </button>
                </>
              ) : (
                <>
                  <h2 className="font-display text-2xl text-cream">
                    Sé parte de los primeros 50
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">
                    CVitae está en beta y queremos crecer con personas como vos.
                    Como <strong className="text-white/80">Founding User</strong>, obtenés{' '}
                    <strong className="text-[#c9a84c]">6 meses de Pro gratis</strong>,
                    sin tarjeta, sin auto-renovación.
                  </p>

                  {slotsRemaining < 20 && (
                    <p className="mt-3 text-xs text-amber-400/80">
                      ⚡ Solo quedan {slotsRemaining} cupos disponibles
                    </p>
                  )}

                  {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

                  <div className="mt-7 flex flex-col gap-3">
                    <button
                      onClick={handleAccept}
                      disabled={accepting}
                      className="w-full rounded-xl bg-[#c9a84c] py-3.5 text-sm font-semibold text-[#0d0d0d] transition hover:bg-[#d4b45a] disabled:opacity-60"
                    >
                      {accepting ? 'Procesando…' : 'Quiero ser Founding User'}
                    </button>
                    <button
                      onClick={onDismiss}
                      className="w-full rounded-xl bg-white/8 py-3 text-sm font-medium text-white/80 transition hover:bg-white/12"
                    >
                      Ahora no
                    </button>
                  </div>

                  <div className="mt-4 text-center">
                    <button
                      onClick={onDecline}
                      className="text-xs text-white/30 underline underline-offset-2 transition hover:text-white/50"
                    >
                      Prefiero no participar
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
