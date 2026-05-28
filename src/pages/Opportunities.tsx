import { useState, useEffect } from 'react'
import { Link } from 'wouter'
import { motion } from 'framer-motion'
import { MapPin, Calendar, ArrowRight, Search } from 'lucide-react'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { GlassCard, Badge } from '@/components/cvitae/UI-Elements'
import { supabase } from '@/lib/supabase'

interface Opportunity {
  id: string
  titulo: string
  slug: string
  cuerpo: string
  categoria: string
  tipo: string
  ubicacion: string
  fecha_vencimiento: string
  is_active: boolean
}

export default function Opportunities() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'todas' | 'beca' | 'foro'>('todas')

  useEffect(() => {
    supabase
      .from('content_hub')
      .select('*')
      .eq('is_active', true)
      .in('tipo', ['beca', 'foro'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { setOpportunities(data || []); setLoading(false) })
  }, [])

  const filtered = filter === 'todas' ? opportunities : opportunities.filter(o => o.tipo === filter)

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <div className="pt-32 pb-20 px-4 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Oportunidades</h1>
          <p className="text-[#888888]">Becas, foros y eventos seleccionados para tu crecimiento profesional</p>
        </motion.div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {[{ id: 'todas', label: 'Todas' }, { id: 'beca', label: 'Becas' }, { id: 'foro', label: 'Foros' }].map((tab) => (
            <button key={tab.id} onClick={() => setFilter(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filter === tab.id ? 'bg-[#c9a84c] text-[#0a0a0a]' : 'bg-white/5 text-[#888888] hover:bg-white/10'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-[#888888] py-12">No hay oportunidades en esta categoría todavía.</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((opp) => (
              <Link key={opp.id} href={`/oportunidades/${opp.slug}`}>
                <GlassCard className="h-full cursor-pointer group">
                  <Badge variant={opp.tipo === 'beca' ? 'gold' : 'muted'} className="mb-3">{opp.tipo === 'beca' ? 'Beca' : 'Foro'}</Badge>
                  <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-[#c9a84c] transition-colors">{opp.titulo}</h3>
                  <div className="space-y-2 text-xs text-[#888888]">
                    <span className="flex items-center gap-1"><MapPin size={12} /> {opp.ubicacion}</span>
                    <span className="flex items-center gap-1"><Calendar size={12} /> Vence: {new Date(opp.fecha_vencimiento).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-sm text-[#c9a84c] group-hover:underline">
                    Ver detalle <ArrowRight size={14} />
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
