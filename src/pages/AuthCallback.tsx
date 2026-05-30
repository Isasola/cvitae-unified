import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'

export default function AuthCallback() {
  const [, setLocation] = useLocation()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [mensaje, setMensaje] = useState('Procesando tu acceso...')

  useEffect(() => {
    let cancelado = false
    let timer: any

    const redirigir = (path: string, ms = 900) => {
      timer = setTimeout(() => {
        if (!cancelado) window.location.href = path
      }, ms)
    }

    // CRÍTICO: suscribirse ANTES de llamar getSession
    // Esto captura el evento SIGNED_IN cuando Supabase procesa el hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelado) return
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        setStatus('success')
        setMensaje('¡Bienvenido a CVitae!')
        redirigir('/mi-carrera', 900)
      }
    })

    // Fallback: intentar getSession después de un tick
    const intentar = async () => {
      await new Promise(r => setTimeout(r, 200))
      if (cancelado) return

      const { data } = await supabase.auth.getSession()
      if (data.session && !cancelado) {
        setStatus('success')
        setMensaje('¡Bienvenido!')
        redirigir('/mi-carrera', 800)
        return
      }

      // Segundo intento después de 2 segundos
      await new Promise(r => setTimeout(r, 2000))
      if (cancelado) return

      const { data: data2 } = await supabase.auth.getSession()
      if (data2.session && !cancelado) {
        setStatus('success')
        setMensaje('¡Sesión iniciada!')
        redirigir('/mi-carrera', 800)
        return
      }

      // Último recurso
      const { data: data3 } = await supabase.auth.refreshSession()
      if (!data3.session && !cancelado) {
        setStatus('error')
        setMensaje('No pudimos verificar tu acceso. El enlace puede haber expirado.')
        redirigir('/', 3500)
      }
    }

    intentar()

    return () => {
      cancelado = true
      clearTimeout(timer)
      subscription?.unsubscribe()
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-sm"
      >
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-white mb-2">{mensaje}</h2>
            <p className="text-[#888888] text-sm">No cierres esta pestaña</p>
            <div className="mt-6 flex gap-1 justify-center">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-[#c9a84c]/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-white mb-2">{mensaje}</h2>
            <p className="text-[#888888] text-sm">Preparando tu dashboard...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-white mb-3">{mensaje}</h2>
            <p className="text-[#888888] text-sm mb-6">Intentá solicitar un nuevo enlace desde el inicio.</p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-8 py-3 bg-[#c9a84c] text-[#0a0a0a] font-bold rounded-2xl hover:bg-[#e8c97a] transition-all"
            >
              Volver al inicio
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}
