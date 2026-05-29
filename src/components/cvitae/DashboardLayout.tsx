import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, User, Briefcase, FileText, Bell, BookOpen, Settings,
  Menu, X, LogOut, ChevronRight, ArrowLeft,
} from 'lucide-react'
import { Logo } from './Logo'
import { cn } from '@/lib/utils'

const sidebarLinks = [
  { href: '/mi-carrera', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/mi-carrera/perfil', label: 'Mi Perfil', icon: User },
  { href: '/mi-carrera/oportunidades', label: 'Oportunidades', icon: Briefcase },
  { href: '/mi-carrera/cv', label: 'Mi CV', icon: FileText },
  { href: '/mi-carrera/alertas', label: 'Alertas', icon: Bell },
  { href: '/blog', label: 'Blog', icon: BookOpen },
]

const bottomLinks = [
  { href: '/mi-carrera/configuracion', label: 'Configuración', icon: Settings },
]

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [location] = useLocation()

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4">
        <Logo size="sm" showTagline={false} />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-white hover:bg-white/5 rounded-lg transition-colors"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      <aside
        className={cn(
          'fixed top-0 left-0 bottom-0 w-64 z-40',
          'bg-white/[0.02] backdrop-blur-xl border-r border-white/5',
          'flex flex-col',
          'transform transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-20 flex items-center justify-center border-b border-white/5">
          <Logo size="md" showTagline={false} />
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {sidebarLinks.map((link) => {
            const isActive = location === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
                  isActive
                    ? 'bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20'
                    : 'text-[#888888] hover:text-white hover:bg-white/5'
                )}
              >
                <link.icon className={cn('w-5 h-5', isActive && 'text-[#c9a84c]')} />
                <span className="font-medium">{link.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-[#c9a84c]"
                  />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-white/5 space-y-1">
          {bottomLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#888888] hover:text-white hover:bg-white/5 transition-all duration-200"
            >
              <link.icon className="w-5 h-5" />
              <span className="font-medium">{link.label}</span>
            </Link>
          ))}

          <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#c9a84c] to-[#e8c97a] flex items-center justify-center text-sm font-bold text-[#0a0a0a]">
                CV
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">Usuario</p>
                <p className="text-xs text-[#888888] truncate">Plan Free</p>
              </div>
              <button className="p-1.5 text-[#888888] hover:text-red-400 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="hidden lg:flex h-20 items-center justify-between px-8 border-b border-white/5 bg-[#0a0a0a]/50 backdrop-blur-xl sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <a href="/" className="text-sm text-[#888888] hover:text-white transition-colors flex items-center gap-1">
              <ArrowLeft size={16} />
              Volver al inicio
            </a>
            <h1 className="text-lg font-semibold text-white">
              {sidebarLinks.find((l) => l.href === location)?.label || 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/mi-carrera/alertas"
              className="relative p-2 text-[#888888] hover:text-white transition-colors"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#c9a84c]" />
            </Link>
            <Link
              href="/mi-carrera/perfil"
              className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#c9a84c] to-[#e8c97a] flex items-center justify-center text-xs font-bold text-[#0a0a0a]">
                CV
              </div>
              <span className="text-sm text-white">Usuario</span>
              <ChevronRight className="w-4 h-4 text-[#888888]" />
            </Link>
          </div>
        </div>

        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
