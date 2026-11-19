import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { motion } from 'framer-motion'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { GlassCard } from '@/components/cvitae/UI-Elements'
import { Brain, Target, Users, Sparkles, ArrowLeft } from 'lucide-react'

export default function About() {
  const orgLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://cvitae.lat/#organization',
    name: 'CVitae',
    url: 'https://cvitae.lat',
    logo: { '@type': 'ImageObject', url: 'https://cvitae.lat/favicon.svg' },
    description: 'Agente de carrera con inteligencia artificial para Paraguay y Latinoamérica. Top 100 Moonshot Paraguay 2026.',
    foundingDate: '2024',
    areaServed: ['Paraguay', 'Argentina', 'Uruguay', 'Bolivia', 'Latinoamérica'],
    sameAs: ['https://www.linkedin.com/company/cvitae-py/', 'https://www.facebook.com/profile.php?id=61580756714500'],
  })

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Sobre CVitae | Ecosistema de Talento con IA para Paraguay</title>
        <meta name="description" content="Conocé la misión de CVitae: conectar talento paraguayo con las mejores oportunidades usando inteligencia artificial de vanguardia." />
        <link rel="canonical" href="https://cvitae.lat/sobre-cvitae" />
        <meta property="og:title" content="Sobre CVitae | IA para el Talento Paraguayo" />
        <meta property="og:description" content="Conocé la misión de CVitae: conectar talento paraguayo con las mejores oportunidades usando IA de vanguardia." />
        <meta property="og:url" content="https://cvitae.lat/sobre-cvitae" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{orgLd}</script>
      </Helmet>
      <Navbar />
      <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-cream transition-colors">
            <ArrowLeft className="h-4 w-4" /> Inicio
          </Link>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Nuestra Misión</h1>
          <p className="text-xl text-white/70 leading-relaxed">
            En CVitae, creemos que el talento no debe ser invisible. Nuestra misión es conectar a los profesionales paraguayos con las mejores oportunidades locales e internacionales utilizando inteligencia artificial de vanguardia.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 mb-16">
          <GlassCard>
            <Brain className="w-10 h-10 text-gold mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">IA con Propósito</h3>
            <p className="text-white/65 text-sm">
              No solo usamos tecnología; la aplicamos para resolver el problema real de la empleabilidad en Paraguay. Cada función —desde el diagnóstico ATS hasta las alertas de becas— está diseñada para dar ventaja concreta al postulante.
            </p>
          </GlassCard>
          <GlassCard>
            <Target className="w-10 h-10 text-gold mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Enfoque en Resultados</h3>
            <p className="text-white/65 text-sm">
              Nuestra plataforma está diseñada para que consigas tu próximo gran paso profesional, no solo para que mires vacantes. Cada herramienta apunta a aumentar tus chances reales de ser llamado.
            </p>
          </GlassCard>
          <GlassCard>
            <Sparkles className="w-10 h-10 text-gold mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Top 100 Moonshot Paraguay 2026</h3>
            <p className="text-white/65 text-sm">
              CVitae fue seleccionado entre los 100 proyectos más innovadores de Paraguay en el programa Moonshot Paraguay 2026, reconocimiento al impacto que la plataforma está generando en el ecosistema de talento y empleabilidad del país.
            </p>
          </GlassCard>
          <GlassCard>
            <Users className="w-10 h-10 text-gold mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Equipo local, impacto regional</h3>
            <p className="text-white/65 text-sm">
              Somos un equipo basado en Asunción, Paraguay. Construimos CVitae desde adentro del mercado laboral que queremos transformar: conocemos sus particularidades, sus fuentes de trabajo y sus retos reales.
            </p>
          </GlassCard>
        </div>

        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="prose prose-invert max-w-none space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">¿Por qué CVitae?</h2>
            <p className="text-white/65">
              El mercado laboral actual es complejo. Los filtros automáticos (ATS) descartan miles de CVs excelentes simplemente por formato o por falta de palabras clave. Al mismo tiempo, las oportunidades están dispersas en cientos de portales: empleos, becas internacionales, programas de fellowship, convocatorias de becas BECAL, y más.
            </p>
            <p className="text-white/65 mt-3">
              CVitae centraliza, analiza y optimiza. Somos tu agente de carrera personal que trabaja 24/7 para que vos solo tengas que preocuparte por brillar en la entrevista.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-4">Qué hace CVitae exactamente</h2>
            <ul className="space-y-3 text-white/65 list-none pl-0">
              <li><span className="text-gold font-semibold">Diagnóstico ATS gratuito:</span> Subís tu CV y obtenés un análisis detallado de qué pasa cuando un sistema automático lo lee. Identificamos problemas de formato, secciones faltantes y palabras clave ausentes antes de que te cuesten una entrevista.</li>
              <li><span className="text-gold font-semibold">Generador de CV con IA:</span> Creás un CV adaptado a cada vacante específica, usando tus datos y experiencia real como base. El sistema reformula y fortalece cada sección para que pase los filtros ATS y convenza a los reclutadores.</li>
              <li><span className="text-gold font-semibold">Catálogo de oportunidades:</span> Agregamos en tiempo real más de 1.500 oportunidades activas: empleos en Paraguay y el exterior, becas internacionales, fellowships, programas de capital semilla y más. No necesitás revisar decenas de portales por separado.</li>
              <li><span className="text-gold font-semibold">Alertas personalizadas:</span> Configurás tus preferencias de sector, ubicación y tipo de oportunidad, y recibís por correo las convocatorias relevantes en el momento en que se publican.</li>
              <li><span className="text-gold font-semibold">Matching inteligente:</span> El sistema analiza tu perfil y te muestra las oportunidades donde tenés mayor probabilidad de ser convocado, con una brecha de habilidades explicada.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-4">Nuestra base en Paraguay</h2>
            <p className="text-white/65">
              CVitae nació en Asunción en 2024 con una observación simple: Paraguay tiene talento pero carece de infraestructura para conectarlo de forma eficiente con el mercado. Los portales tradicionales no ofrecen análisis, no personalizan y no integran el ecosistema de becas y oportunidades internacionales.
            </p>
            <p className="text-white/65 mt-3">
              Hoy la plataforma cubre oportunidades para profesionales en Paraguay, Perú, Argentina, Uruguay, Bolivia y el mercado remoto latinoamericano. El objetivo es ser la capa de inteligencia entre el talento regional y las oportunidades —locales e internacionales— que ese talento merece.
            </p>
            <p className="text-white/65 mt-3">
              Para consultas, sugerencias o si representás una organización que quiere aparecer en CVitae, podés escribirnos a <a href="mailto:contacto@cvitae.lat" className="text-gold hover:underline">contacto@cvitae.lat</a>.
            </p>
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  )
}
