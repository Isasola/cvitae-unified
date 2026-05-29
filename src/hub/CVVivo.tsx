import { motion } from 'framer-motion'
import { Sparkles, ArrowLeft, Rocket, ShieldCheck, Zap } from 'lucide-react'
import { Link } from 'wouter'
import { GlassCard, GoldButton, Badge } from '@/components/cvitae/UI-Elements'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'

export default function CVVivo() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="mb-8">
          <Link href="/mi-carrera" className="text-[#c9a84c] flex items-center gap-2 hover:underline text-sm">
            <ArrowLeft size={16} /> Volver al Dashboard
          </Link>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="inline-block p-4 rounded-2xl bg-[#c9a84c]/10 mb-8">
            <Rocket className="text-[#c9a84c] w-12 h-12 animate-bounce" />
          </div>
          
          <Badge variant="gold" className="mb-4">Próximamente</Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">CV Vivo: El fin del CV estático</h1>
          <p className="text-[#888888] text-lg max-w-2xl mx-auto mb-12">
            Estamos construyendo un generador de CV inteligente que no solo se ve increíble, 
            sino que está optimizado matemáticamente para superar cualquier sistema ATS.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              { icon: Zap, title: 'Optimización ATS', desc: 'Ajuste automático de keywords según la vacante.' },
              { icon: ShieldCheck, title: 'Diseño Premium', desc: 'Estética Vercel-style que destaca ante reclutadores.' },
              { icon: Sparkles, title: 'IA Generativa', desc: 'Redacción profesional de logros y experiencias.' }
            ].map((feature, i) => (
              <GlassCard key={i} className="text-left">
                <feature.icon className="text-[#c9a84c] mb-4" size={24} />
                <h3 className="text-white font-bold mb-2">{feature.title}</h3>
                <p className="text-[#888888] text-sm leading-relaxed">{feature.desc}</p>
              </GlassCard>
            ))}
          </div>

          <div className="p-8 rounded-3xl bg-gradient-to-b from-[#c9a84c]/20 to-transparent border border-[#c9a84c]/20">
            <h3 className="text-xl font-bold text-white mb-4">¿Querés ser de los primeros?</h3>
            <p className="text-[#888888] mb-8">Te avisaremos en cuanto el generador esté disponible para usuarios Pro.</p>
            <GoldButton href="/mi-carrera" variant="solid">Notificarme al lanzar</GoldButton>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  )
}
