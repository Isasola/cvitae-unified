import { useState, useEffect } from 'react'
import { Link, useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { ArrowLeft, Calendar } from 'lucide-react'
import { GlassCard, Badge } from '@/components/cvitae/UI-Elements'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { supabase } from '@/lib/supabase'

interface BlogPost {
  id: string
  titulo: string
  slug: string
  cuerpo: string
  categoria: string
  fecha_vencimiento: string
  tipo: string
  imagen_url?: string
}

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [, setLocation] = useLocation()

  useEffect(() => {
    supabase
      .from('content_hub')
      .select('id, titulo, slug, cuerpo, categoria, fecha_vencimiento, tipo, imagen_url')
      .eq('tipo', 'blog')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPosts(data || []); setLoading(false) })
  }, [])

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
          <h1 className="text-4xl font-bold text-white mb-8">Blog</h1>
        </motion.div>

        {loading ? (
          <div className="text-center py-12"><div className="w-8 h-8 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : posts.length === 0 ? (
          <p className="text-[#888888] text-center py-12">No hay artículos publicados.</p>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <GlassCard key={post.id} className="cursor-pointer group overflow-hidden" onClick={() => setLocation(`/blog/${post.slug}`)}>
                {post.imagen_url && (
                  <div className="aspect-video w-full mb-4 rounded-xl overflow-hidden border border-white/5">
                    <img src={post.imagen_url} alt={post.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="gold">{post.categoria}</Badge>
                  <span className="text-xs text-[#888888] flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(post.fecha_vencimiento).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2 group-hover:text-[#c9a84c] transition-colors">{post.titulo}</h2>
                <p className="text-[#888888] text-sm line-clamp-2">
                  {post.cuerpo?.replace(/[#*`>]/g, '').substring(0, 150)}...
                </p>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
