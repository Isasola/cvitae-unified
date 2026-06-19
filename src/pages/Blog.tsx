import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation } from 'wouter'
import { SiteShell } from '@/components/cv/SiteShell'
import { GrowthLine, Eyebrow } from '@/components/cv/visuals'
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

  // Gradient palette for posts without images
  const gradients = [
    'linear-gradient(135deg, oklch(0.22 0.04 75), oklch(0.16 0.012 60))',
    'linear-gradient(135deg, oklch(0.20 0.05 80), oklch(0.16 0.012 60))',
    'linear-gradient(135deg, oklch(0.24 0.06 70), oklch(0.16 0.012 60))',
  ]

  return (
    <>
      <Helmet>
        <title>Blog | Consejos de Carrera y Mercado Laboral — CVitae</title>
        <meta name="description" content="Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay." />
      </Helmet>
      <SiteShell>
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="relative">
            <Eyebrow>Blog</Eyebrow>
            <h1 className="font-display text-4xl sm:text-5xl mt-2 text-cream">
              Ideas para <em>crecer</em> con intención.
            </h1>
            <p className="text-muted-foreground mt-3 max-w-xl">
              Guías prácticas, análisis del mercado y conversaciones sobre carrera, IA y trabajo en Paraguay.
            </p>
            <GrowthLine className="absolute -bottom-6 left-0 right-0 h-10 opacity-40" />
          </div>

          {loading ? (
            <div className="mt-12 flex justify-center">
              <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <p className="mt-12 text-center text-muted-foreground">No hay artículos publicados todavía.</p>
          ) : (
            <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => setLocation(`/blog/${p.slug}`)}
                  className="group glass-panel overflow-hidden hover:border-gold/40 transition-colors cursor-pointer"
                >
                  <div
                    className="aspect-[16/10] relative"
                    style={{ background: p.imagen_url ? undefined : gradients[i % gradients.length] }}
                  >
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt={p.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="font-display italic text-gold text-2xl opacity-40">CVitae</span>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-[10px] uppercase tracking-wider border border-gold/30 text-gold px-2 py-0.5 rounded-full">
                        {p.categoria}
                      </span>
                      <span>{new Date(p.fecha_vencimiento).toLocaleDateString()}</span>
                    </div>
                    <h2 className="font-display text-xl text-cream mt-3 group-hover:text-gold transition-colors">{p.titulo}</h2>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-3">
                      {p.cuerpo?.replace(/[#*`>]/g, '').substring(0, 150)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SiteShell>
    </>
  )
}
