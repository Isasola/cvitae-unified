import React from 'react';
import { GlassCard } from '@/components/cvitae/UI-Elements';
import { Navbar } from '@/components/cvitae/Navbar';
import { Footer } from '@/components/cvitae/Footer';

const Privacy: React.FC = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="container mx-auto px-4 py-32 max-w-4xl">
      <GlassCard className="p-8">
        <h1 className="text-3xl font-bold mb-6 text-white">Política de Privacidad</h1>
        <div className="space-y-6 text-sm leading-relaxed text-white/65">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">Qué información tratamos</h2>
            <p>Tratamos los datos que proporcionás al crear tu cuenta y perfil, analizar o generar un CV, configurar alertas y postularte: correo, datos profesionales, preferencias, documentos y actividad necesaria para prestar cada función.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">Análisis con inteligencia artificial</h2>
            <p>Para analizar, adaptar o recomendar contenido podemos enviar la información estrictamente necesaria a proveedores tecnológicos que procesan datos para CVitae, actualmente infraestructura de Supabase, AWS y, en funciones concretas, Google Gemini. No vendemos tus datos personales.</p>
            <p>El analizador público procesa el texto del archivo para entregar el resultado y CVitae no lo incorpora a un perfil salvo que decidas crear una cuenta, completar tu perfil o realizar una postulación.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">Perfiles, CV y postulaciones</h2>
            <p>Tu perfil y los CV generados son privados y se vinculan a tu usuario autenticado. Si te postulás a una vacante, los datos y el CV de esa postulación se comparten con la empresa responsable del proceso y se conservan separadamente del perfil B2C.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">Seguridad y conservación</h2>
            <p>Aplicamos controles de acceso por usuario, almacenamiento privado, límites contra abuso y registros técnicos mínimos. Conservamos el perfil mientras la cuenta esté activa. Los registros de postulaciones pueden conservarse durante el proceso de selección o cuando exista una obligación aplicable.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">Cookies y medición</h2>
            <p>Usamos cookies técnicas necesarias y, cuando corresponda, herramientas de medición como Google Analytics para entender el uso del producto. Podés administrar cookies desde el navegador y desde los controles disponibles en el sitio.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">Tus decisiones</h2>
            <p>Podés rectificar tu perfil desde Mi Carrera y eliminar tu cuenta, perfil y CV generados desde Configuración. Para consultar, corregir o solicitar la eliminación de una postulación enviada a una empresa, escribinos a <a className="text-[#c9a84c] hover:underline" href="mailto:cvitaeparaguay@gmail.com">cvitaeparaguay@gmail.com</a>.</p>
          </section>
          <p className="border-t border-white/5 pt-4">Última actualización: 13 de agosto de 2026.</p>
        </div>
      </GlassCard>
    </div>
    <Footer />
  </div>
);

export default Privacy;
