import React from 'react';
import { GlassCard } from '@/components/cvitae/UI-Elements';
import { Navbar } from '@/components/cvitae/Navbar';
import { Footer } from '@/components/cvitae/Footer';

const Privacy: React.FC = () => (
  <div className="min-h-screen bg-[#0a0a0a]">
    <Navbar />
    <div className="container mx-auto px-4 py-32 max-w-4xl">
      <GlassCard className="p-8">
        <h1 className="text-3xl font-bold mb-6 text-white">Política de Privacidad</h1>
        <div className="text-[#888888] space-y-4">
          <p>En CVitae, respetamos tu privacidad. Recopilamos únicamente los datos que nos proporcionás voluntariamente al crear tu CV o perfil profesional.</p>
          <p>Tus datos personales se almacenan de forma segura en servidores de Supabase y no se comparten con terceros sin tu consentimiento explícito, salvo obligación legal.</p>
          <p>Utilizamos cookies técnicas y de análisis (Google Analytics) para mejorar la experiencia. Podés desactivarlas desde tu navegador.</p>
          <p>Para ejercer tus derechos de acceso, rectificación o cancelación, escribinos a cvitaeparaguay@gmail.com.</p>
          <p className="pt-4 border-t border-white/5">Al usar CVitae, aceptás esta política. Última actualización: mayo 2026.</p>
        </div>
      </GlassCard>
    </div>
    <Footer />
  </div>
);

export default Privacy;
