import { motion } from 'framer-motion'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'
import { ArrowLeft, Cookie, Search, BarChart, Settings } from 'lucide-react'
import { Link } from 'wouter'

export default function Cookies() {
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
          <h1 className="text-4xl font-bold text-white mb-8">Política de Cookies de CVitae</h1>
          
          <GlassCard className="mb-8">
            <div className="prose prose-invert max-w-none text-[#888888] space-y-6">
              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <Cookie className="text-[#c9a84c]" size={24} />
                  <h2 className="text-xl font-bold m-0">¿Qué son las cookies?</h2>
                </div>
                <p>
                  Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitás CVitae. 
                  Nos ayudan a que el sitio funcione correctamente, a recordar tus preferencias y a entender cómo usás nuestra plataforma.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <Settings className="text-[#c9a84c]" size={24} />
                  <h2 className="text-xl font-bold m-0">Cookies Esenciales</h2>
                </div>
                <p>
                  Son necesarias para el funcionamiento básico del sitio. Incluyen cookies de sesión para mantenerte conectado 
                  y cookies de seguridad para proteger tu cuenta y tus datos de CV. Sin estas cookies, el servicio no puede funcionar.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <BarChart className="text-[#c9a84c]" size={24} />
                  <h2 className="text-xl font-bold m-0">Google Analytics</h2>
                </div>
                <p>
                  Utilizamos Google Analytics para recopilar información anónima sobre cómo los usuarios interactúan con CVitae. 
                  Esto nos permite mejorar la experiencia de búsqueda de empleo y la precisión de nuestra IA basándonos en datos reales de navegación.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <Search className="text-[#c9a84c]" size={24} />
                  <h2 className="text-xl font-bold m-0">Google AdSense</h2>
                </div>
                <p>
                  Podemos utilizar Google AdSense para mostrar anuncios relevantes. Estas cookies ayudan a personalizar la publicidad 
                  que ves para que sea de tu interés, evitando mostrarte el mismo anuncio repetidamente.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 text-white mb-4">
                  <h2 className="text-xl font-bold m-0">Cómo gestionar tus cookies</h2>
                </div>
                <p>
                  Podés configurar tu navegador para rechazar todas las cookies o para que te avise cuando se envía una. 
                  Tené en cuenta que si desactivás las cookies esenciales, algunas funciones de CVitae (como el login o la subida de CV) podrían no estar disponibles.
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
