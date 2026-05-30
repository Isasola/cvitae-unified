import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'

export default function AuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [mensaje, setMensaje] = useState('Procesando tu acceso...')
  const [intentos, setIntentos] = useState(0)

  const irA = (path: string) => {
    window.location.href = path
  }

  const reintentar = () => {
    setStatus('loading')
    setMensaje('Reintentando...')
    setIntentos(0)
    verificar()
  }

  const verificar = async () => {
    // Esperar que Supabase procese el hash/token
    await new Promise(r => setTimeout(r, 500))

    for (let i = 0; i < 5; i++) {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setStatus('success')
        setMensaje('¡Bienvenido a CVitae!')
        setTimeout(() => irA('/mi-carrera'), 1000)
        return
      }
      await new Promise(r => setTimeout(r, 1000))
      setIntentos(i + 1)
    }

    // Último recurso: refreshSession
    const { data: refreshData } = await supabase.auth.refreshSession()
    if (refreshData.session) {
      setStatus('success')
      setMensaje('¡Sesión verificada!')
      setTimeout(() => irA('/mi-carrera'), 1000)
      return
    }

    setStatus('error')
    setMensaje('No pudimos verificar tu acceso.')
  }

  useEffect(() => {
    let cancelado = false

    // Suscribirse primero — captura SIGNED_IN, EMAIL_CONFIRMED, PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelado) return
      if (session && ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY'].includes(event)) {
        setStatus('success')
        setMensaje('¡Bienvenido a CVitae!')
        setTimeout(() => irA('/mi-carrera'), 1000)
      }
    })

    verificar()

    return () => {
      cancelado = true
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
            {intentos > 2 && (
              <p className="text-[#555555] text-xs mt-3">Verificando... intento {intentos}/5</p>
            )}
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
            <p className="text-[#888888] text-sm mb-6">
              El enlace puede haber expirado. Pedí uno nuevo desde el inicio.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={reintentar}
                className="px-8 py-3 bg-white/10 border border-white/20 text-white font-bold rounded-2xl hover:bg-white/20 transition-all"
              >
                Reintentar
              </button>
              <button
                onClick={() => irA('/')}
                className="px-8 py-3 bg-[#c9a84c] text-[#0a0a0a] font-bold rounded-2xl hover:bg-[#e8c97a] transition-all"
              >
                Pedir nuevo enlace
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
