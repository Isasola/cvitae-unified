import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'wouter'
import { ArrowLeft } from 'lucide-react'
import { SiteShell } from '@/components/cv/SiteShell'
import { GrowthLine, Eyebrow } from '@/components/cv/visuals'
import { supabase } from '@/lib/supabase'

interface BlogPost {
  id: string
  titulo: string
  slug: string
  cuerpo: string
  categoria: string
  created_at: string
  fecha_vencimiento?: string
  tipo: string
  imagen_url?: string
}

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('content_hub')
      .select('id, titulo, slug, cuerpo, categoria, created_at, fecha_vencimiento, tipo, imagen_url')
      .eq('tipo', 'blog')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError('No pudimos cargar los artículos. Intentá nuevamente en unos minutos.')
        else setPosts(data || [])
        setLoading(false)
      })
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
        <meta name="description" content="Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay y Latinoamérica." />
        <link rel="canonical" href="https://cvitae.lat/blog" />
        <meta property="og:title" content="Blog | Consejos de Carrera — CVitae" />
        <meta property="og:description" content="Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay y Latinoamérica." />
        <meta property="og:url" content="https://cvitae.lat/blog" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org', '@type': 'Blog',
          name: 'Blog CVitae',
          url: 'https://cvitae.lat/blog',
          description: 'Ideas, guías y datos sobre carrera, IA y mercado laboral en Paraguay y Latinoamérica.',
          publisher: { '@type': 'Organization', name: 'CVitae', url: 'https://cvitae.lat', logo: { '@type': 'ImageObject', url: 'https://cvitae.lat/favicon.svg' } },
        })}</script>
      </Helmet>
      <SiteShell>
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-cream transition-colors">
              <ArrowLeft className="h-4 w-4" /> Inicio
            </Link>
          </div>
          <div className="relative pb-10">
            <Eyebrow>Blog</Eyebrow>
            <h1 className="font-display text-4xl sm:text-5xl mt-3 text-cream leading-tight">
              Ideas para <em>crecer</em> con intención.
            </h1>
            <p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed">
              Guías prácticas, análisis del mercado y conversaciones sobre carrera, IA y trabajo en Paraguay y Latinoamérica.
            </p>
            <GrowthLine className="absolute -bottom-2 left-0 right-0 h-10 opacity-40" />
          </div>

          {loading ? (
            <div className="mt-16 flex justify-center">
              <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="mt-16 border border-amber-300/20 bg-amber-300/[0.04] p-6 text-center text-sm text-amber-100" role="alert">{error}</div>
          ) : posts.length === 0 ? (
            <p className="mt-16 text-center text-muted-foreground">No hay artículos publicados todavía.</p>
          ) : (
            <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {posts.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/blog/${p.slug}`}
                  className="group glass-panel overflow-hidden hover:border-gold/40 transition-all duration-300 cursor-pointer rounded-2xl"
                >
                  <div
                    className="aspect-[16/9] relative overflow-hidden"
                    style={{ background: p.imagen_url ? undefined : gradients[i % gradients.length] }}
                  >
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt={p.titulo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="font-display italic text-gold text-3xl opacity-30">CVitae</span>
                      </div>
                    )}
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-[10px] uppercase tracking-wider border border-gold/30 text-gold px-2.5 py-0.5 rounded-full">
                        {p.categoria}
                      </span>
                      <span>{new Date(p.created_at).toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <h2 className="font-display text-xl text-cream mt-3 mb-2 leading-snug group-hover:text-gold transition-colors line-clamp-2">{p.titulo}</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {p.cuerpo?.replace(/[#*`_>~\[\]]/g, '').replace(/!\[.*?\]/g, '').substring(0, 160)}…
                    </p>
                    <div className="mt-4 flex items-center gap-1 text-xs text-gold/70 group-hover:text-gold transition-colors font-medium">
                      Leer artículo <span className="ml-1">→</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </SiteShell>
    </>
  )
}
