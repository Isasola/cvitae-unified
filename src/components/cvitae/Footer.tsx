import { Link } from 'wouter'
import { Logo } from './Logo'
import { Linkedin, Instagram, Mail, MapPin, Facebook, MessageCircle } from 'lucide-react'

export function Footer() {
  const currentYear = new Date().getFullYear()

  const sections = [
    {
      title: 'Producto',
      links: [
        { label: 'Mi Carrera', href: '/mi-carrera' },
        { label: 'Oportunidades', href: '/oportunidades' },
        { label: 'Analizador CV', href: '/#cv-analyzer' },
        { label: 'Blog', href: '/blog' },
      ],
    },
    {
      title: 'Empresa',
      links: [
        { label: 'Sobre nosotros', href: '/about' },
        { label: 'Contacto', href: 'mailto:cvitaeparaguay@gmail.com' },
        { label: 'Prensa', onClick: () => alert('Próximamente') },
        { label: 'Carreras', onClick: () => alert('Próximamente') },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacidad', href: '/privacy' },
        { label: 'Términos', href: '/terminos' },
        { label: 'Cookies', href: '/cookies' },
      ],
    },
  ]

  return (
    <footer className="bg-[#0a0a0a] border-t border-white/5 pt-20 pb-10 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-16">
          <div className="col-span-2">
            <Logo size="sm" className="mb-6" />
            <p className="text-[#888888] text-sm leading-relaxed max-w-xs mb-6">
              Empoderando el talento paraguayo con inteligencia artificial.
              Encontrá tu próximo paso profesional con CVitae.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://www.linkedin.com/company/cvitae-py/" target="_blank" rel="noopener noreferrer" className="text-[#888888] hover:text-white transition-colors"><Linkedin size={20} /></a>
              <a href="https://www.facebook.com/profile.php?id=61580756714500" target="_blank" rel="noopener noreferrer" className="text-[#888888] hover:text-white transition-colors"><Facebook size={20} /></a>
              <a href="https://www.instagram.com/cpdparaguay/" target="_blank" rel="noopener noreferrer" className="text-[#888888] hover:text-white transition-colors"><Instagram size={20} /></a>
              <a href="https://wa.me/595992954169" target="_blank" rel="noopener noreferrer" className="text-[#888888] hover:text-white transition-colors"><MessageCircle size={20} /></a>
            </div>
          </div>
          {sections.map((section) => (
            <div key={section.title}>
              <h4 className="text-white font-semibold mb-6">{section.title}</h4>
              <ul className="space-y-4">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.href ? (
                      <Link href={link.href} className="text-[#888888] hover:text-white transition-colors text-sm">
                        {link.label}
                      </Link>
                    ) : (
                      <button onClick={link.onClick} className="text-[#888888] hover:text-white transition-colors text-sm text-left">
                        {link.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 pt-8 flex flex-col md:row items-center justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center gap-4 text-xs text-[#888888]">
            <p>© {currentYear} CVitae Intelligence Hub. Todos los derechos reservados.</p>
            <span className="hidden md:block">•</span>
            <p className="flex items-center gap-1"><MapPin size={12} /> Asunción, Paraguay</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-[#888888] uppercase tracking-widest font-medium">Sistemas Operativos</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
