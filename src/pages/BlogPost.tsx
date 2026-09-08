import { useState, useEffect } from 'react'
import { Link, useParams } from 'wouter'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'
import { ArrowLeft, Calendar, Clock, Tag } from 'lucide-react'
import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'
import { supabase } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import { AdSlot } from '@/components/cv/AdSlot'

interface BlogPost {
  id: string
  titulo: string
  slug: string
  cuerpo: string
  categoria: string
  created_at: string
  fecha_vencimiento?: string
  imagen_url?: string
}

const BlogCTA = () => (
  <div className="my-10 border border-gold/30 bg-white/[0.02] p-6 not-prose">
    <p className="text-sm font-semibold text-white">¿Buscás trabajo o una beca en Paraguay?</p>
    <p className="mt-1 text-sm text-white/55">Analizá tu CV gratis con IA y descubrí las oportunidades que coinciden con tu perfil.</p>
    <a
      href="https://cvitae.lat/mi-carrera"
      className="mt-4 inline-block border border-gold bg-gold px-5 py-2 text-xs font-semibold text-black transition hover:bg-gold/90"
    >
      Empezar gratis →
    </a>
  </div>
)

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [related, setRelated] = useState<BlogPost[]>([])

  useEffect(() => {
    if (slug) {
      supabase
        .from('content_hub')
        .select('id, titulo, slug, cuerpo, categoria, created_at, fecha_vencimiento, imagen_url')
        .eq('slug', slug)
        .eq('tipo', 'blog')
        .eq('is_active', true)
        .single()
        .then(({ data }) => {
          setPost(data)
          setLoading(false)
          if (data) {
            supabase
              .from('content_hub')
              .select('id, titulo, slug, categoria, created_at, imagen_url')
              .eq('tipo', 'blog')
              .eq('is_active', true)
              .eq('categoria', data.categoria)
              .neq('id', data.id)
              .limit(3)
              .then(({ data: rel }) => setRelated(rel || []))
          }
        })
    }
  }, [slug])

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!post) return (
    <div className="min-h-screen bg-background text-white flex flex-col items-center justify-center gap-4">
      <p className="text-white/60">Artículo no encontrado.</p>
      <Link href="/blog" className="text-gold hover:underline text-sm">← Volver al blog</Link>
    </div>
  )

  const canonical = `https://cvitae.lat/blog/${post.slug}`
  const ogImage = post.imagen_url || 'https://cvitae.lat/og-image.jpg'
  const datePublished = post.created_at?.split('T')[0] || ''
  const excerpt = (post.cuerpo || '').replace(/[#*`_>~[\]]/g, '').substring(0, 160)
  const articleLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: post.titulo,
    description: excerpt,
    url: canonical,
    datePublished,
    image: ogImage,
    author: { '@type': 'Organization', name: 'CVitae', url: 'https://cvitae.lat' },
    publisher: { '@type': 'Organization', name: 'CVitae', url: 'https://cvitae.lat', logo: { '@type': 'ImageObject', url: 'https://cvitae.lat/favicon.svg' } },
  })

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{post.titulo} | CVitae</title>
        <meta name="description" content={excerpt} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={`${post.titulo} | CVitae`} />
        <meta property="og:description" content={excerpt} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content={ogImage} />
        <script type="application/ld+json">{articleLd}</script>
      </Helmet>
      <Navbar />

      <div className="pt-28 pb-24 px-4 sm:px-6">
        {/* Back nav */}
        <div className="max-w-[820px] mx-auto mb-10">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={14} /> Volver al blog
          </Link>
        </div>

        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[820px] mx-auto"
        >
          {/* Header */}
          <header className="mb-12">
            <div className="flex flex-wrap items-center gap-3 mb-6 text-xs text-white/40">
              <span className="inline-flex items-center gap-1.5 border border-gold/30 text-gold px-3 py-1 text-[11px] uppercase tracking-wider">
                <Tag size={10} />{post.categoria}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={12} />
                {new Date(post.created_at).toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={12} />
                {Math.max(1, Math.ceil((post.cuerpo || '').trim().split(/\s+/).length / 200))} min de lectura
              </span>
            </div>

            <h1 className="font-display text-4xl sm:text-[3rem] leading-[1.1] tracking-tight text-white mb-7">
              {post.titulo}
            </h1>

            {/* Decorative separator */}
            <div className="h-px bg-gradient-to-r from-gold/40 via-gold/15 to-transparent" />
          </header>

          {/* Cover image */}
          {post.imagen_url && (
            <div className="aspect-video w-full mb-12 overflow-hidden border border-white/8">
              <img src={post.imagen_url} alt={post.titulo} className="w-full h-full object-cover" />
            </div>
          )}

          {/* Body */}
          {(() => {
            let h2Count = 0
            return (
              <div className="
                prose max-w-none
                prose-headings:font-display prose-headings:text-white prose-headings:font-bold prose-headings:tracking-tight
                prose-h2:text-[1.5rem] prose-h2:mt-14 prose-h2:mb-5 prose-h2:pb-3 prose-h2:border-b prose-h2:border-gold/15
                prose-h3:text-[1.2rem] prose-h3:mt-10 prose-h3:mb-4 prose-h3:text-white/90
                prose-p:text-white/75 prose-p:leading-[1.9] prose-p:text-base prose-p:mb-6
                prose-li:text-white/75 prose-li:text-base prose-li:leading-[1.8] prose-li:mb-1
                prose-ul:my-6 prose-ul:pl-6 prose-ol:my-6 prose-ol:pl-6
                prose-strong:text-white prose-strong:font-semibold
                prose-em:text-white/80
                prose-blockquote:border-l-[3px] prose-blockquote:border-l-gold/60 prose-blockquote:pl-6 prose-blockquote:py-2 prose-blockquote:my-8 prose-blockquote:text-white/60 prose-blockquote:bg-white/[0.02]
                prose-code:text-gold/80 prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.875em] prose-code:font-mono
                prose-pre:bg-white/[0.04] prose-pre:border prose-pre:border-white/10 prose-pre:p-5 prose-pre:overflow-x-auto
                prose-a:text-gold prose-a:no-underline hover:prose-a:underline
                prose-hr:border-white/8 prose-hr:my-12
                prose-img:my-8 prose-img:w-full prose-img:border prose-img:border-white/8
              ">
                <ReactMarkdown
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    h2: ({ children, ...props }) => {
                      h2Count++
                      return (
                        <>
                          <h2 {...props}>{children}</h2>
                          {h2Count === 2 && <BlogCTA />}
                        </>
                      )
                    }
                  }}
                >{post.cuerpo}</ReactMarkdown>
              </div>
            )
          })()}

          {/* Footer CTA */}
          <div className="mt-16 pt-10 border-t border-white/8">
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/25 mb-1.5">Siguiente paso</p>
                <p className="text-sm text-white/50">Aplicá lo aprendido a tu perfil o explorá oportunidades verificadas.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link href="/mi-carrera" className="inline-flex items-center justify-center bg-gold px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-gold-soft">Revisar mi perfil</Link>
                <Link href="/oportunidades" className="inline-flex items-center justify-center border border-white/10 px-5 py-2.5 text-sm text-white/60 transition hover:border-gold/40 hover:text-white">Explorar oportunidades</Link>
                <Link href="/blog" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-white/45 transition hover:text-white"><ArrowLeft size={14} /> Más artículos</Link>
              </div>
            </div>
          </div>
        </motion.article>
        <div className="mx-auto max-w-[820px] mt-14"><AdSlot placement="blog-end" /></div>

        {related.length > 0 && (
          <section className="max-w-[820px] mx-auto mt-16 border-t border-white/[0.07] pt-12 px-4 sm:px-0">
            <p className="mb-6 text-[11px] uppercase tracking-[0.18em] text-white/30" style={{ fontFamily: 'monospace' }}>
              Artículos relacionados
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map(r => (
                <Link key={r.id} href={`/blog/${r.slug}`} className="group border border-white/[0.07] p-4 hover:border-gold/30 transition-colors block">
                  {r.imagen_url && (
                    <img src={r.imagen_url} alt={r.titulo} className="mb-3 h-28 w-full object-cover" />
                  )}
                  <p className="text-sm text-white/80 group-hover:text-white transition-colors leading-snug">{r.titulo}</p>
                  <p className="mt-2 text-[11px] text-white/30" style={{ fontFamily: 'monospace' }}>{r.categoria}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <Footer />
    </div>
  )
}
