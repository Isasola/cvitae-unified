import { useEffect, useRef } from 'react'

interface CVLoaderProps {
  variant?: 'inline' | 'overlay' | 'button'
  size?: number
  label?: string
}

function drawFrame(ctx: CanvasRenderingContext2D, size: number, t: number) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  const gold = '#c9a84c'
  const goldFaint = 'rgba(201,168,76,0.15)'

  ctx.clearRect(0, 0, size, size)

  // Outer ring (faint)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = goldFaint
  ctx.lineWidth = size * 0.03
  ctx.stroke()

  // Animated arc
  const start = -Math.PI / 2 + t * 0.04
  const sweep = Math.PI * 1.4 + Math.sin(t * 0.02) * 0.4
  ctx.beginPath()
  ctx.arc(cx, cy, r, start, start + sweep)
  ctx.strokeStyle = gold
  ctx.lineWidth = size * 0.035
  ctx.lineCap = 'round'
  ctx.stroke()

  // Traveling dot on arc
  const dotAngle = start + sweep
  const dotX = cx + Math.cos(dotAngle) * r
  const dotY = cy + Math.sin(dotAngle) * r
  ctx.beginPath()
  ctx.arc(dotX, dotY, size * 0.028, 0, Math.PI * 2)
  ctx.fillStyle = '#e6cf8a'
  ctx.fill()

  // CV text
  const fontSize = size * 0.26
  ctx.font = `900 ${fontSize}px "Playfair Display", serif`
  ctx.fillStyle = gold
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Subtle pulse on opacity
  ctx.globalAlpha = 0.75 + Math.sin(t * 0.05) * 0.25
  ctx.fillText('CV', cx, cy - fontSize * 0.1)
  ctx.globalAlpha = 1
}

export function CVLoader({ variant = 'inline', size = 48, label }: CVLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)

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

    function tick() {
      tRef.current += 1
      drawFrame(ctx!, size, tRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [size])

  if (variant === 'overlay') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm">
        <canvas ref={canvasRef} style={{ width: 80, height: 80 }} />
        {label && <p className="mt-4 text-sm tracking-widest text-[#c9a84c]/80 uppercase">{label}</p>}
      </div>
    )
  }

  if (variant === 'button') {
    return <canvas ref={canvasRef} style={{ width: 20, height: 20, display: 'inline-block' }} />
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
      {label && <p className="text-xs tracking-widest text-[#c9a84c]/70 uppercase">{label}</p>}
    </div>
  )
}
