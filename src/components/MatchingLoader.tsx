import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Circle, Loader2 } from 'lucide-react'

interface Particle {
  x: number; y: number
  vx: number; vy: number
  fx: number; fy: number
  px: number; py: number
  size: number
  baseAlpha: number
  r: number; g: number; b: number
}

function initParticles(w: number, h: number, count = 26): Particle[] {
  return Array.from({ length: count }, () => {
    const gold = Math.random() > 0.45
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      fx: 0.007 + Math.random() * 0.01,
      fy: 0.007 + Math.random() * 0.01,
      px: Math.random() * Math.PI * 2,
      py: Math.random() * Math.PI * 2,
      size: 1.5 + Math.random() * 2.8,
      baseAlpha: 0.3 + Math.random() * 0.6,
      r: gold ? 201 : 232,
      g: gold ? 168 : 220,
      b: gold ? 76 : 180,
    }
  })
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  particles: Particle[],
) {
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  const minDim = Math.min(w, h)

  // Ambient bloom
  const bloomR = minDim * (0.55 + Math.sin(t * 0.016) * 0.08)
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR)
  bloom.addColorStop(0, 'rgba(201,168,76,0.08)')
  bloom.addColorStop(0.6, 'rgba(201,168,76,0.03)')
  bloom.addColorStop(1, 'rgba(201,168,76,0)')
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, w, h)

  const maxLink = minDim * 0.32

  // Connection lines
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x
      const dy = particles[i].y - particles[j].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < maxLink) {
        const a = (1 - dist / maxLink) * 0.22
        ctx.beginPath()
        ctx.moveTo(particles[i].x, particles[i].y)
        ctx.lineTo(particles[j].x, particles[j].y)
        ctx.strokeStyle = `rgba(201,168,76,${a.toFixed(3)})`
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }
  }

  // Particles
  for (const p of particles) {
    p.x += p.vx + Math.sin(t * p.fx + p.px) * 0.5
    p.y += p.vy + Math.cos(t * p.fy + p.py) * 0.5

    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.8 }
    if (p.x > w) { p.x = w; p.vx = -Math.abs(p.vx) * 0.8 }
    if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.8 }
    if (p.y > h) { p.y = h; p.vy = -Math.abs(p.vy) * 0.8 }

    const pulse = 0.65 + Math.sin(t * 0.025 + p.px) * 0.35
    const alpha = p.baseAlpha * pulse

    const glowR = p.size * (3.2 + Math.sin(t * 0.02 + p.py) * 1.0)
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR)
    glow.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${(alpha * 0.85).toFixed(3)})`)
    glow.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`)
    ctx.beginPath()
    ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()

    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${Math.min(1, alpha * 1.5).toFixed(3)})`
    ctx.fill()
  }
}

interface MatchingLoaderProps {
  steps: string[]
  currentStep: number
  totalVacancies?: number
}

export default function MatchingLoader({
  steps,
  currentStep,
  totalVacancies = 50,
}: MatchingLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const particlesRef = useRef<Particle[]>([])

  const W = 360
  const H = 130

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    particlesRef.current = initParticles(W, H)

    function tick() {
      tRef.current += 1
      drawFrame(ctx!, W, H, tRef.current, particlesRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const pct = Math.round(((currentStep + 1) / steps.length) * 100)

  return (
    <div className="w-full max-w-[400px] mx-auto p-8 flex flex-col items-center gap-8">

      {/* Organic particle canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: W, height: H }}
        className="rounded-xl opacity-90"
      />

      {/* Progress steps */}
      <div className="w-full space-y-3">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center gap-3">
            {index < currentStep ? (
              <CheckCircle className="text-emerald-500 shrink-0" size={16} />
            ) : index === currentStep ? (
              <Loader2 className="text-[#c9a84c] animate-spin shrink-0" size={16} />
            ) : (
              <Circle className="text-white/10 shrink-0" size={16} />
            )}
            <span
              className={[
                'text-sm transition-colors',
                index === currentStep
                  ? 'text-white font-medium'
                  : index < currentStep
                    ? 'text-white/35'
                    : 'text-white/15',
              ].join(' ')}
            >
              {step}
            </span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full">
        <div className="h-px w-full bg-white/8 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#c9a84c]/40 to-[#c9a84c] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[10px] text-white/25 text-center uppercase tracking-[0.2em]">
          Cruzando {totalVacancies} oportunidades
        </p>
      </div>
    </div>
  )
}
