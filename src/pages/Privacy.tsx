import { motion } from 'framer-motion'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <div className="pt-32 pb-20 px-4 max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="prose prose-invert max-w-none">
          <h1 className="text-3xl font-bold text-white mb-8">Política de Privacidad</h1>
          <p className="text-[#888888]">Última actualización: Mayo 2026</p>
          
          <h2 className="text-xl font-bold text-white mt-8 mb-4">1. Información que recolectamos</h2>
          <p className="text-[#888888]">
            Para brindarte nuestros servicios de optimización de carrera, recolectamos información personal que incluyes en tu CV, como nombre, contacto, experiencia laboral y educación.
          </p>

          <h2 className="text-xl font-bold text-white mt-8 mb-4">2. Uso de Inteligencia Artificial</h2>
          <p className="text-[#888888]">
            Utilizamos modelos de IA para analizar tu perfil y compararlo con vacantes laborales. Tus datos se procesan de forma segura y no se utilizan para entrenar modelos públicos sin tu consentimiento explícito.
          </p>

          <h2 className="text-xl font-bold text-white mt-8 mb-4">3. Compartir Información</h2>
          <p className="text-[#888888]">
            No vendemos tus datos a terceros. Solo compartimos información con plataformas de empleo cuando decides postularte a través de nuestros enlaces o servicios integrados.
          </p>

          <h2 className="text-xl font-bold text-white mt-8 mb-4">4. Tus Derechos</h2>
          <p className="text-[#888888]">
            Puedes solicitar el acceso, rectificación o eliminación de tus datos en cualquier momento enviando un correo a cvitaeparaguay@gmail.com.
          </p>
        </motion.div>
      </div>
      <Footer />
    </div>
  )
}
