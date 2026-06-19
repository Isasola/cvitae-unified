import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { Linkedin, Facebook, Instagram, MessageCircle } from 'lucide-react'
import { Logo, GrowthLine } from './visuals'

const navLinks = [
  { href: '/oportunidades', label: 'Oportunidades' },
  { href: '/mi-carrera', label: 'Mi carrera' },
  { href: '/blog', label: 'Blog' },
  { href: '/empresas', label: 'Para empresas' },
]

const footerCols = [
  {
    title: 'Producto',
    items: [
      { label: 'Mi Carrera', href: '/mi-carrera' },
      { label: 'Oportunidades', href: '/oportunidades' },
      { label: 'Analizador CV', href: '/#registro' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Para empresas',
    items: [
      { label: 'Portal empresas', href: '/empresas' },
      { label: 'Análisis masivo', href: '/empresas/masivo' },
      { label: 'Publicar vacante', href: '/empresas' },
      { label: 'Contacto B2B', href: 'mailto:contacto@cvitae.lat' },
    ],
  },
  {
    title: 'Empresa',
    items: [
      { label: 'Sobre nosotros', href: '/about' },
      { label: 'Contacto', href: 'mailto:contacto@cvitae.lat' },
      { label: 'Privacidad', href: '/privacy' },
      { label: 'Términos', href: '/terminos' },
    ],
  },
]

const socials = [
  { Icon: Linkedin, label: 'LinkedIn', href: 'https://www.linkedin.com/company/cvitae-py/' },
  { Icon: Facebook, label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61580756714500' },
  { Icon: Instagram, label: 'Instagram', href: 'https://www.instagram.com/cpdparaguay/' },
  { Icon: MessageCircle, label: 'WhatsApp', href: 'https://wa.me/595992954169' },
]

function Navbar() {
  const [location] = useLocation()
  return (
    <header className="border-b border-border/60 backdrop-blur-md sticky top-0 z-30 bg-background/60">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <Logo className="text-2xl" />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`hover:text-cream transition-colors ${location === l.href ? 'text-cream' : ''}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/mi-carrera"
            className="text-xs px-3 py-1.5 rounded-md bg-gold text-ink hover:bg-gold-soft transition-colors font-medium"
          >
            Entrar
          </Link>
        </div>
      </div>
    </header>
  )
}

function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setStatus('loading')
    try {
      const res = await fetch('/.netlify/functions/subscribe-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setStatus(res.ok ? 'done' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return <p className="text-xs text-gold">¡Suscrito! Te avisamos con novedades.</p>
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="tu@email.com"
        className="flex-1 min-w-0 rounded-md bg-white/5 border border-border/40 px-3 py-1.5 text-xs text-cream placeholder:text-muted-foreground focus:outline-none focus:border-gold/40"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="rounded-md bg-gold text-ink px-3 py-1.5 text-xs font-medium hover:bg-gold-soft transition-colors disabled:opacity-50"
      >
        {status === 'loading' ? '…' : 'Suscribir'}
      </button>
    </form>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border/40 mt-24 bg-background relative overflow-hidden">
      {/* GrowthLine decorative separator */}
      <GrowthLine className="absolute top-0 left-0 w-full h-[50px] opacity-30" />

      <div className="max-w-6xl mx-auto px-6 pt-16 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
          {/* Brand column */}
          <div className="col-span-2">
            <Link href="/">
              <Logo className="text-2xl" />
            </Link>
            <p className="text-sm text-muted-foreground mt-4 max-w-xs leading-relaxed">
              Tu carrera, trazada con intención. Ecosistema de gestión de talento con IA para Paraguay y Latinoamérica.
            </p>
            <div className="flex items-center gap-3 mt-5">
              {socials.map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 grid place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-gold hover:border-gold/50 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>

            {/* Newsletter */}
            <p className="mt-6 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Newsletter</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">Novedades, vacantes y recursos para tu carrera.</p>
            <NewsletterForm />
          </div>

          {/* Navigation columns */}
          {footerCols.map((col) => (
            <div key={col.title}>
              <h4 className="font-display text-sm text-cream mb-4">{col.title}</h4>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                {col.items.map((item) => (
                  <li key={item.label}>
                    {item.href.startsWith('mailto:') || item.href.startsWith('http') ? (
                      <a href={item.href} className="hover:text-cream transition-colors">{item.label}</a>
                    ) : (
                      <Link href={item.href} className="hover:text-cream transition-colors">{item.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border/40 pt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© 2026 CVitae Intelligence Hub</span>
            <span>Asunción, Paraguay</span>
            <a href="mailto:contacto@cvitae.lat" className="hover:text-cream transition-colors">contacto@cvitae.lat</a>
            <a href="https://wa.me/595992954169" target="_blank" rel="noopener noreferrer" className="hover:text-cream transition-colors">WhatsApp</a>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span>Sistemas Operativos · Vivo y activo</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen text-cream flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
