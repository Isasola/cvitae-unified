import { useState, useEffect } from 'react'
import { Link, useParams, useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { ArrowLeft, Building2, MapPin, Calendar, Briefcase, ExternalLink } from 'lucide-react'
import { GlassCard, Badge, GoldButton } from '@/components/cvitae/UI-Elements'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { supabase } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'

interface Opportunity {
  id: string
  titulo: string
  slug: string
  cuerpo: string
  categoria: string
  ubicacion: string
  fecha_vencimiento: string
  tipo: string
  metadata?: { application_url?: string; organization?: string }
}

const WA_NUMBER = '595992954169'

export default function OpportunityDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null)
  const [loading, setLoading] = useState(true)
  const [, setLocation] = useLocation()

  useEffect(() => {
    if (slug) {
      supabase
        .from('content_hub')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()
        .then(({ data }) => { setOpportunity(data); setLoading(false) })
    }
  }, [slug])

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" /></div>
  if (!opportunity) return <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">Oportunidad no encontrada.</div>

  const appUrl = opportunity.metadata?.application_url

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/oportunidades" className="text-[#c9a84c] flex items-center gap-2 hover:underline text-sm">
            <ArrowLeft size={16} /> Volver a oportunidades
          </Link>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant={opportunity.tipo === 'beca' ? 'gold' : 'muted'}>{opportunity.tipo === 'beca' ? 'Beca' : 'Foro'}</Badge>
              <span className="text-xs text-[#888888] flex items-center gap-1">
                <Calendar size={12} />
                Vence: {new Date(opportunity.fecha_vencimiento).toLocaleDateString()}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-6">{opportunity.titulo}</h1>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="flex items-center gap-2 text-sm text-[#888888]">
                <MapPin size={16} className="text-[#c9a84c]" /> {opportunity.ubicacion}
              </div>
              <div className="flex items-center gap-2 text-sm text-[#888888]">
                <Briefcase size={16} className="text-[#c9a84c]" /> {opportunity.categoria}
              </div>
            </div>

            <div className="prose prose-invert max-w-none text-[#888888] mb-8">
              <ReactMarkdown>{opportunity.cuerpo}</ReactMarkdown>
            </div>

            <div className="flex gap-4">
              {appUrl && (
                <GoldButton onClick={() => window.open(appUrl, '_blank', 'noopener,noreferrer')}>
                  Postularse a esta oportunidad <ExternalLink size={16} />
                </GoldButton>
              )}
              <GoldButton
                variant="outline"
                onClick={() => window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(\`Hola! Quiero mejorar mi CV para la oportunidad: \${opportunity.titulo}\`)}`, '_blank')}
              >
                Mejorar mi CV para esta oportunidad
              </GoldButton>
            </div>
          </GlassCard>
        </motion.div>
      </div>
      <Footer />
    </div>
  )
}
