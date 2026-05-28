import { Link } from 'wouter'

export function Footer() {
  return (
    <footer className="bg-[#0a0a0a] border-t border-white/5 py-12">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', color: '#c9a84c' }}>
              <span style={{ fontWeight: 900 }}>CV</span>
              <span style={{ fontStyle: 'italic', fontWeight: 400 }}>itae</span>
            </span>
            <p className="text-sm text-[#888888] mt-2">Tu carrera, potenciada por IA</p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-4">Plataforma</h4>
            <div className="space-y-2">
              <Link href="/mi-carrera" className="block text-sm text-[#888888] hover:text-white transition-colors">Mi Carrera</Link>
              <Link href="/oportunidades" className="block text-sm text-[#888888] hover:text-white transition-colors">Oportunidades</Link>
              <Link href="/blog" className="block text-sm text-[#888888] hover:text-white transition-colors">Blog</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-4">Empresa</h4>
            <div className="space-y-2">
              <Link href="/about" className="block text-sm text-[#888888] hover:text-white transition-colors">Acerca de</Link>
              <a href="mailto:cvitaeparaguay@gmail.com" className="block text-sm text-[#888888] hover:text-white transition-colors">Contacto</a>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-4">Legal</h4>
            <div className="space-y-2">
              <Link href="/privacy" className="block text-sm text-[#888888] hover:text-white transition-colors">Privacidad</Link>
              <a href="#" className="block text-sm text-[#888888] hover:text-white transition-colors">Términos</a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/5 pt-8 text-center">
          <p className="text-sm text-[#666666]">
            © {new Date().getFullYear()} CVitae Paraguay. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
