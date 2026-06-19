import { Link } from 'wouter'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <GlassCard className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">404</h1>
        <p className="text-muted mb-6">Página no encontrada.</p>
        <Link href="/">
          <GoldButton>Volver al inicio</GoldButton>
        </Link>
      </GlassCard>
    </div>
  )
}
