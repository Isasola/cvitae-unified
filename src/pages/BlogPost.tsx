import { useState, useEffect } from 'react'
import { Link, useParams, useLocation } from 'wouter'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'
import { ArrowLeft, Calendar, Tag } from 'lucide-react'
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

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [, setLocation] = useLocation()

  useEffect(() => {
    if (slug) {
      supabase
        .from('content_hub')
        .select('id, titulo, slug, cuerpo, categoria, created_at, fecha_vencimiento, imagen_url')
        .eq('slug', slug)
        .eq('tipo', 'blog')
        .eq('is_active', true)
        .single()
        .then(({ data }) => { setPost(data); setLoading(false) })
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

      <div className="pt-28 pb-24 px-4">
        {/* Back nav */}
        <div className="max-w-3xl mx-auto mb-10">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={14} /> Volver al blog
          </Link>
        </div>

        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl mx-auto"
        >
          {/* Header */}
          <header className="mb-10">
            <div className="flex items-center gap-3 mb-5 text-xs text-white/40">
              <span className="inline-flex items-center gap-1.5 border border-gold/30 text-gold px-2.5 py-1 rounded-full text-[11px] uppercase tracking-wider">
                <Tag size={10} />{post.categoria}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={12} />
                {new Date(post.created_at).toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl leading-[1.1] tracking-tight text-white mb-6">
              {post.titulo}
            </h1>

            {/* Decorative separator */}
            <div className="h-px bg-gradient-to-r from-gold/30 via-gold/10 to-transparent mb-8" />
          </header>

          {/* Cover image */}
          {post.imagen_url && (
            <div className="aspect-video w-full mb-10 rounded-2xl overflow-hidden border border-white/5">
              <img src={post.imagen_url} alt={post.titulo} className="w-full h-full object-cover" />
            </div>
          )}

          {/* Body */}
          <div className="
            prose max-w-none
            prose-headings:font-display prose-headings:text-white prose-headings:font-bold prose-headings:tracking-tight
            prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-white/70 prose-p:leading-[1.8] prose-p:text-[15px] prose-p:mb-5
            prose-li:text-white/70 prose-li:text-[15px] prose-li:leading-relaxed
            prose-ul:my-4 prose-ul:pl-6 prose-ol:my-4 prose-ol:pl-6
            prose-strong:text-white prose-strong:font-semibold
            prose-em:text-white/80
            prose-blockquote:border-l-gold/50 prose-blockquote:border-l-2 prose-blockquote:pl-5 prose-blockquote:py-1 prose-blockquote:text-white/55 prose-blockquote:italic prose-blockquote:not-italic
            prose-code:text-gold/80 prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
            prose-pre:bg-white/[0.04] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl prose-pre:p-5
            prose-a:text-gold prose-a:no-underline hover:prose-a:underline
            prose-hr:border-white/10 prose-hr:my-8
          ">
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{post.cuerpo}</ReactMarkdown>
          </div>

          {/* Footer CTA */}
          <div className="mt-14 pt-8 border-t border-white/8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/30 mb-1">¿Te resultó útil?</p>
              <p className="text-sm text-white/50">Compartilo con alguien que lo necesite.</p>
            </div>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm text-white/60 transition hover:border-white/30 hover:text-white"
            >
              <ArrowLeft size={14} /> Ver más artículos
            </Link>
          </div>
        </motion.article>
        <div className="mx-auto max-w-3xl"><AdSlot placement="blog-end" /></div>
      </div>

      <Footer />
    </div>
  )
}
