import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const [, setLocation] = useLocation()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [mensaje, setMensaje] = useState('Iniciando sesión...')

  useEffect(() => {
    let cancelado = false

    const procesar = async () => {
      try {
        // Forzar el procesamiento del hash de la URL (magic link)
        const { data, error } = await supabase.auth.getSession()

        if (error || !data.session) {
          // Si no hay sesión, esperar un momento y reintentar
          // A veces Supabase tarda en procesar el hash
          await new Promise(r => setTimeout(r, 1500))
          const { data: data2, error: error2 } = await supabase.auth.getSession()
          if (error2 || !data2.session) {
            if (!cancelado) {
              setStatus('error')
              setMensaje('No se pudo iniciar sesión. Volvé a intentar.')
              setTimeout(() => setLocation('/'), 3000)
            }
            return
          }
        }

        if (!cancelado) {
          setStatus('success')
          setMensaje('¡Bienvenido! Redirigiendo...')
          setTimeout(() => setLocation('/mi-carrera'), 800)
        }
      } catch {
        if (!cancelado) {
          setStatus('error')
          setMensaje('Error inesperado. Volvé a intentar.')
          setTimeout(() => setLocation('/'), 3000)
        }
      }
    }

    // También escuchar cambios de autenticación por si entra por otra vía
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && !cancelado) {
        setStatus('success')
        setMensaje('¡Sesión iniciada!')
        setTimeout(() => setLocation('/mi-carrera'), 600)
      }
    })

    procesar()

    return () => {
      cancelado = true
      subscription?.unsubscribe()
    }
  }, [setLocation])

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        {status === 'loading' && (
          <>
            <div className="w-10 h-10 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium">{mensaje}</p>
            <p className="text-[#888888] text-sm mt-1">Preparando tu espacio</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <p className="text-white font-medium">{mensaje}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-white font-medium">{mensaje}</p>
            <button
              onClick={() => setLocation('/')}
              className="mt-4 px-6 py-2 bg-[#c9a84c] text-[#0a0a0a] font-bold rounded-xl hover:bg-[#e8c97a] transition-colors"
            >
              Volver al inicio
            </button>
          </>
        )}
      </div>
    </div>
  )
}
