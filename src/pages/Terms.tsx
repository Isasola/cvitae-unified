import { motion } from 'framer-motion'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'
import { ArrowLeft, ShieldCheck, Scale, FileText, Lock } from 'lucide-react'
import { Link } from 'wouter'

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-[#c9a84c] flex items-center gap-2 hover:underline text-sm">
            <ArrowLeft size={16} /> Volver al inicio
          </Link>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold text-white mb-8">Términos de Uso de CVitae</h1>
          
          <GlassCard className="mb-8">
            <div className="prose prose-invert max-w-none text-[#888888] space-y-6">
              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <ShieldCheck className="text-[#c9a84c]" size={24} />
                  <h2 className="text-xl font-bold m-0">1. Aceptación de los Términos</h2>
                </div>
                <p>
                  Al acceder y utilizar CVitae, una plataforma paraguaya de optimización de CV impulsada por Inteligencia Artificial, 
                  aceptás cumplir con estos términos y condiciones. Si no estás de acuerdo con alguna parte, te pedimos que no utilices nuestros servicios.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <FileText className="text-[#c9a84c]" size={24} />
                  <h2 className="text-xl font-bold m-0">2. Uso de Currículums y Datos</h2>
                </div>
                <p>
                  CVitae procesa tus documentos (PDF, DOCX) utilizando algoritmos de IA para extraer habilidades y mejorar tu perfil profesional. 
                  Al subir tu CV, otorgás a CVitae el derecho de procesar esta información con el único fin de brindarte recomendaciones laborales y mejoras de carrera. 
                  No vendemos tus datos personales a terceros.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <Lock className="text-[#c9a84c]" size={24} />
                  <h2 className="text-xl font-bold m-0">3. Privacidad y Seguridad</h2>
                </div>
                <p>
                  Tu privacidad es nuestra prioridad. Implementamos medidas de seguridad para proteger tu información personal y profesional. 
                  El uso de "Magic Links" asegura que solo vos tengas acceso a tu dashboard mediante tu correo electrónico verificado.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <Scale className="text-[#c9a84c]" size={24} />
                  <h2 className="text-xl font-bold m-0">4. Propiedad Intelectual</h2>
                </div>
                <p>
                  Toda la tecnología de matching, el diseño de la plataforma y el contenido generado por nuestra IA son propiedad de CVitae Intelligence Hub. 
                  Tu CV sigue siendo de tu propiedad, pero las optimizaciones sugeridas por la plataforma son para tu uso personal no comercial.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <h2 className="text-xl font-bold m-0">5. Suscripciones y Pagos</h2>
                </div>
                <p>
                  CVitae ofrece un modelo gratuito y planes "Pro". Las suscripciones pagas permiten acceso ilimitado a matches, alertas proactivas y análisis avanzado. 
                  Los pagos se procesan de forma segura y pueden cancelarse en cualquier momento desde tu perfil.
                </p>
              </section>
            </div>
            
            <div className="mt-12 pt-8 border-t border-white/5 flex justify-center">
              <GoldButton href="/">Entendido, volver al inicio</GoldButton>
            </div>
          </GlassCard>
        </motion.div>
      </div>
      <Footer />
    </div>
  )
}
