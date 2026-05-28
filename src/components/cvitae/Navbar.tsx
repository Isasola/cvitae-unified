import { useState, useEffect } from 'react'
import { Link, useLocation } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronRight } from 'lucide-react'
import { Logo } from './Logo'
import { GoldButton } from './UI-Elements'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/', label: 'Inicio' },
  { href: '/oportunidades', label: 'Oportunidades' },
  { href: '/blog', label: 'Blog' },
]

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [location] = useLocation()

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          isScrolled
            ? 'py-3 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5'
            : 'py-5 bg-transparent'
        )}
      >
        <nav className="container mx-auto px-4 flex items-center justify-between">
          <Logo size="md" showTagline={false} />

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'text-sm font-medium transition-colors duration-200',
                  location === link.href
                    ? 'text-[#c9a84c]'
                    : 'text-[#888888] hover:text-white'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link href="/mi-carrera" className="text-sm text-[#888888] hover:text-white transition-colors">
              Iniciar sesión
            </Link>
            <GoldButton href="/mi-carrera" size="sm">
              Empezá gratis
              <ChevronRight className="w-4 h-4" />
            </GoldButton>
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-white"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </nav>
      </motion.header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-[#0a0a0a]/98 backdrop-blur-xl md:hidden pt-20"
          >
            <div className="container mx-auto px-4 py-8 flex flex-col gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    'text-2xl font-medium py-2 transition-colors',
                    location === link.href ? 'text-[#c9a84c]' : 'text-white'
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-6 border-t border-white/10 flex flex-col gap-4">
                <Link
                  href="/mi-carrera"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-[#888888]"
                >
                  Iniciar sesión
                </Link>
                <GoldButton href="/mi-carrera" onClick={() => setIsMobileMenuOpen(false)}>
                  Empezá gratis
                  <ChevronRight className="w-4 h-4" />
                </GoldButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
