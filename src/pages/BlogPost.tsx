import { useState, useEffect } from 'react'
import { Link, useParams, useLocation } from 'wouter'
import { motion } from 'framer-motion'
import { ArrowLeft, Calendar } from 'lucide-react'
import { GlassCard, Badge } from '@/components/cvitae/UI-Elements'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { supabase } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'

interface BlogPost {
  id: string
  titulo: string
  slug: string
  cuerpo: string
  categoria: string
  fecha_vencimiento: string
  imagen_url?: string
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [, setLocation] = useLocation()

  useEffect(() => {
    if (slug) {
      supabase
        .from('content_hub')
        .select('id, titulo, slug, cuerpo, categoria, fecha_vencimiento, imagen_url')
        .eq('slug', slug)
        .eq('tipo', 'blog')
        .eq('is_active', true)
        .single()
        .then(({ data }) => { setPost(data); setLoading(false) })
    }
  }, [slug])

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" /></div>
  if (!post) return <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">Post no encontrado.</div>

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto">
        <div className="mb-8 flex items-center gap-4">
          <Link href="/blog" className="text-[#c9a84c] flex items-center gap-2 hover:underline text-sm">
            <ArrowLeft size={16} /> Volver al blog
          </Link>
          <Link href="/" className="text-[#888888] hover:text-white text-sm">Inicio</Link>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="gold">{post.categoria}</Badge>
              <span className="text-xs text-[#888888] flex items-center gap-1">
                <Calendar size={12} />
                {new Date(post.fecha_vencimiento).toLocaleDateString()}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-6">{post.titulo}</h1>
            {post.imagen_url && (
              <div className="aspect-video w-full mb-8 rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
                <img src={post.imagen_url} alt={post.titulo} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="prose prose-invert max-w-none text-[#888888]">
              <ReactMarkdown>{post.cuerpo}</ReactMarkdown>
            </div>
          </GlassCard>
        </motion.div>
      </div>
      <Footer />
    </div>
  )
}
