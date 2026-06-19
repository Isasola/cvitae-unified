import { Helmet } from 'react-helmet-async'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { GlassCard } from '@/components/cvitae/UI-Elements'
import { Bell } from 'lucide-react'

export default function Alertas() {
  return (
    <DashboardLayout>
      <Helmet>
        <title>Alertas de Empleo | CVitae</title>
        <meta name="description" content="Recibí alertas automáticas cuando aparezca una vacante con alta compatibilidad con tu perfil." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <GlassCard className="text-center py-16 px-8">
        <Bell className="w-12 h-12 text-gold mx-auto mb-4 opacity-50" />
        <h2 className="text-2xl font-bold text-white mb-2">Alertas Proactivas</h2>
        <p className="text-muted max-w-sm mx-auto">
          Próximamente — te avisaremos por email cuando aparezca una vacante con más del 85% de compatibilidad con tu perfil.
        </p>
      </GlassCard>
    </DashboardLayout>
  )
}
