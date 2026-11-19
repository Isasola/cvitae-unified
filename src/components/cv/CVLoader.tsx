import { useEffect, useRef, useState } from 'react'

interface Particle {
  x: number; y: number
  vx: number; vy: number
  fx: number; fy: number   // frequency of sinusoidal drift
  px: number; py: number   // phase offset
  size: number
  baseAlpha: number
  r: number; g: number; b: number
}

const MESSAGES = [
  'Procesando tu perfil…',
  'Cruzando con los datos disponibles…',
  'Analizando dimensiones clave…',
  'Casi listo…',
]

function initParticles(w: number, h: number, count = 22): Particle[] {
  return Array.from({ length: count }, () => {
    const gold = Math.random() > 0.4
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      fx: 0.008 + Math.random() * 0.012,
      fy: 0.008 + Math.random() * 0.012,
      px: Math.random() * Math.PI * 2,
      py: Math.random() * Math.PI * 2,
      size: 1.5 + Math.random() * 2.5,
      baseAlpha: 0.35 + Math.random() * 0.55,
      r: gold ? 201 : 235,
      g: gold ? 168 : 226,
      b: gold ? 76 : 190,
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

  // Ambient bloom — breathes with t
  const bloomR = minDim * (0.28 + Math.sin(t * 0.018) * 0.06)
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR)
  bloom.addColorStop(0, 'rgba(201,168,76,0.10)')
  bloom.addColorStop(0.5, 'rgba(201,168,76,0.04)')
  bloom.addColorStop(1, 'rgba(201,168,76,0)')
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, w, h)

  const maxLink = minDim * 0.3

  // Connection lines between nearby particles
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x
      const dy = particles[i].y - particles[j].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < maxLink) {
        const a = (1 - dist / maxLink) * 0.28
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
    // Organic drift: sinusoidal overlay on linear velocity
    p.x += p.vx + Math.sin(t * p.fx + p.px) * 0.55
    p.y += p.vy + Math.cos(t * p.fy + p.py) * 0.55

    // Soft wall bounce
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.8 }
    if (p.x > w) { p.x = w; p.vx = -Math.abs(p.vx) * 0.8 }
    if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.8 }
    if (p.y > h) { p.y = h; p.vy = -Math.abs(p.vy) * 0.8 }

    const pulse = 0.7 + Math.sin(t * 0.028 + p.px) * 0.3
    const alpha = p.baseAlpha * pulse

    // Glow halo
    const glowR = p.size * (3.5 + Math.sin(t * 0.022 + p.py) * 1.2)
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR)
    glow.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${(alpha * 0.9).toFixed(3)})`)
    glow.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`)
    ctx.beginPath()
    ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()

    // Core dot
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${Math.min(1, alpha * 1.6).toFixed(3)})`
    ctx.fill()
  }
}

interface CVLoaderProps {
  variant?: 'inline' | 'overlay' | 'button'
  size?: number
  label?: string
}

export function CVLoader({ variant = 'inline', size = 48, label }: CVLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const s = size * dpr
    canvas.width = s
    canvas.height = s
    ctx.scale(dpr, dpr)
    particlesRef.current = initParticles(size, size)

    function tick() {
      tRef.current += 1
      drawFrame(ctx!, size, size, tRef.current, particlesRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [size])

  if (variant === 'overlay') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm">
        <canvas ref={canvasRef} style={{ width: 80, height: 80 }} />
        {label && (
          <p className="mt-4 text-sm tracking-widest text-[#c9a84c]/80 uppercase">{label}</p>
        )}
      </div>
    )
  }

  if (variant === 'button') {
    return <canvas ref={canvasRef} style={{ width: 20, height: 20, display: 'inline-block' }} />
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
      {label && (
        <p className="text-xs tracking-widest text-[#c9a84c]/70 uppercase">{label}</p>
      )}
    </div>
  )
}

// ── Full-screen diagnostic loader ──────────────────────────────────────────

interface DiagnosticLoaderProps {
  /** Optional message override — cycles automatically if omitted */
  message?: string
}

export function DiagnosticLoader({ message }: DiagnosticLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const particlesRef = useRef<Particle[]>([])

  const [msgIdx, setMsgIdx] = useState(0)
  const [fade, setFade] = useState(true)

  // Cycle messages
  useEffect(() => {
    if (message) return
    const timer = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setMsgIdx((i) => (i + 1) % MESSAGES.length)
        setFade(true)
      }, 350)
    }, 2800)
    return () => clearInterval(timer)
  }, [message])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = 340
    const H = 180
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    particlesRef.current = initParticles(W, H, 28)

    function tick() {
      tRef.current += 1
      drawFrame(ctx!, W, H, tRef.current, particlesRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const displayMsg = message ?? MESSAGES[msgIdx]

  return (
    <div className="flex flex-col items-center gap-5 select-none">
      <canvas
        ref={canvasRef}
        style={{ width: 340, height: 180 }}
        className="rounded-2xl"
      />
      <p
        className="text-[13px] text-[#c9a84c]/75 tracking-[0.18em] uppercase text-center transition-opacity duration-300"
        style={{ opacity: fade ? 1 : 0 }}
      >
        {displayMsg}
      </p>
    </div>
  )
}
