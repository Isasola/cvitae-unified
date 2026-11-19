import { motion } from 'framer-motion'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'
import { ArrowLeft, Cookie, Search, BarChart, Settings } from 'lucide-react'
import { Link } from 'wouter'

export default function Cookies() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-gold flex items-center gap-2 hover:underline text-sm">
            <ArrowLeft size={16} /> Volver al inicio
          </Link>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold text-white mb-8">Política de Cookies de CVitae</h1>
          
          <GlassCard className="mb-8">
            <div className="prose prose-invert max-w-none text-white/65 space-y-6">
              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <Cookie className="text-gold" size={24} />
                  <h2 className="text-xl font-bold m-0">¿Qué son las cookies?</h2>
                </div>
                <p>
                  Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitás CVitae. 
                  Nos ayudan a que el sitio funcione correctamente, a recordar tus preferencias y a entender cómo usás nuestra plataforma.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <Settings className="text-gold" size={24} />
                  <h2 className="text-xl font-bold m-0">Cookies Esenciales</h2>
                </div>
                <p>
                  Son necesarias para el funcionamiento básico del sitio. Incluyen cookies de sesión para mantenerte conectado 
                  y cookies de seguridad para proteger tu cuenta y tus datos de CV. Sin estas cookies, el servicio no puede funcionar.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <BarChart className="text-gold" size={24} />
                  <h2 className="text-xl font-bold m-0">Google Analytics</h2>
                </div>
                <p>
                  Si lo aceptás, utilizamos Google Analytics para entender cómo las personas interactúan con CVitae.
                  Analytics permanece desactivado hasta recibir esa autorización y podés retirarla desde “Preferencias de cookies”.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <Search className="text-gold" size={24} />
                  <h2 className="text-xl font-bold m-0">Google AdSense</h2>
                </div>
                <p>
                  Podemos utilizar Google AdSense únicamente en páginas públicas de contenido. La publicidad permanece desactivada hasta que la aceptes y no se muestra dentro de tu perfil, CV, matching, aprendizaje, diagnósticos o postulaciones.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <h2 className="text-xl font-bold m-0">Cómo gestionar tus cookies</h2>
                </div>
                <p>
                  Podés aceptar, rechazar o personalizar Analytics y publicidad desde el aviso inicial y volver a abrir “Preferencias de cookies” en el pie de página. Las cookies esenciales no se desactivan porque sostienen la sesión y las funciones solicitadas por vos.
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
