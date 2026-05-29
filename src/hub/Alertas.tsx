import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { GlassCard } from '@/components/cvitae/UI-Elements'
import { Bell } from 'lucide-react'

export default function Alertas() {
  return (
    <DashboardLayout>
      <GlassCard className="text-center py-16 px-8">
        <Bell className="w-12 h-12 text-[#c9a84c] mx-auto mb-4 opacity-50" />
        <h2 className="text-2xl font-bold text-white mb-2">Alertas Proactivas</h2>
        <p className="text-[#888888] max-w-sm mx-auto">
          Próximamente — te avisaremos por email cuando aparezca una vacante con más del 85% de compatibilidad con tu perfil.
        </p>
      </GlassCard>
    </DashboardLayout>
  )
}
