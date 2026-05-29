import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'
import { FileText, Sparkles, ArrowRight } from 'lucide-react'

export default function JobMatcher() {
  const [, setLocation] = useLocation()

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto text-center">
        <GlassCard className="py-16 px-8 border-dashed border-2 border-white/10">
          <div className="w-20 h-20 bg-[#c9a84c]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="text-[#c9a84c] w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Análisis de CV con IA</h2>
          <p className="text-[#888888] max-w-md mx-auto mb-8">
            Subí tu CV y nuestra IA extraerá automáticamente tus habilidades,
            experiencia y formación para encontrar las mejores oportunidades.
          </p>
          <GoldButton onClick={() => setLocation('/mi-carrera/perfil')}>
            <FileText size={18} /> Ir a completar mi perfil
            <ArrowRight size={18} />
          </GoldButton>
          <p className="text-[#555555] text-xs mt-4">
            Ahí podrás subir tu CV y autocompletar todo el formulario.
          </p>
        </GlassCard>
      </div>
    </DashboardLayout>
  )
}
