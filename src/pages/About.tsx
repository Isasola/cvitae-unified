import { motion } from 'framer-motion'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { GlassCard } from '@/components/cvitae/UI-Elements'
import { Brain, Target, Users, Sparkles } from 'lucide-react'

export default function About() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Nuestra Misión</h1>
          <p className="text-xl text-[#888888] leading-relaxed">
            En CVitae, creemos que el talento no debe ser invisible. Nuestra misión es conectar a los profesionales paraguayos con las mejores oportunidades locales e internacionales utilizando inteligencia artificial de vanguardia.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 mb-16">
          <GlassCard>
            <Brain className="w-10 h-10 text-[#c9a84c] mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">IA con Propósito</h3>
            <p className="text-[#888888] text-sm">
              No solo usamos tecnología; la aplicamos para resolver el problema real de la empleabilidad en Paraguay.
            </p>
          </GlassCard>
          <GlassCard>
            <Target className="w-10 h-10 text-[#c9a84c] mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Enfoque en Resultados</h3>
            <p className="text-[#888888] text-sm">
              Nuestra plataforma está diseñada para que consigas tu próximo gran paso profesional, no solo para que mires vacantes.
            </p>
          </GlassCard>
        </div>

        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="prose prose-invert max-w-none">
          <h2 className="text-2xl font-bold text-white mb-4">¿Por qué CVitae?</h2>
          <p className="text-[#888888]">
            El mercado laboral actual es complejo. Los filtros automáticos (ATS) descartan miles de CVs excelentes simplemente por formato. Al mismo tiempo, las oportunidades están dispersas en cientos de portales.
          </p>
          <p className="text-[#888888]">
            CVitae centraliza, analiza y optimiza. Somos tu agente de carrera personal que trabaja 24/7 para que vos solo tengas que preocuparte por brillar en la entrevista.
          </p>
        </motion.div>
      </div>
      <Footer />
    </div>
  )
}
