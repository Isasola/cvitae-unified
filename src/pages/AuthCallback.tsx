import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'

export default function AuthCallback() {
  const [, setLocation] = useLocation()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Procesando inicio de sesión...')

  useEffect(() => {
    let isMounted = true

    const processCallback = async () => {
      try {
        let { data, error } = await supabase.auth.getSession()

        if (error || !data.session) {
          await new Promise(resolve => setTimeout(resolve, 1200))
          const refreshResult = await supabase.auth.refreshSession()
          data = refreshResult.data
          error = refreshResult.error
        }

        if (isMounted) {
          if (data.session) {
            setStatus('success')
            setMessage('¡Sesión iniciada correctamente!')
            setTimeout(() => setLocation('/mi-carrera'), 900)
          } else {
            setStatus('error')
            setMessage('No se pudo procesar el enlace. Inténtalo nuevamente.')
            setTimeout(() => setLocation('/'), 2500)
          }
        }
      } catch (err) {
        console.error('AuthCallback Error:', err)
        if (isMounted) {
          setStatus('error')
          setMessage('Error inesperado. Volvé a intentar.')
          setTimeout(() => setLocation('/'), 2500)
        }
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && isMounted) {
        setStatus('success')
        setMessage('¡Bienvenido!')
        setTimeout(() => setLocation('/mi-carrera'), 700)
      }
    })

    processCallback()

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [setLocation])

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-sm">
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-white">{message}</h2>
            <p className="text-[#888888] mt-2 text-sm">No cierres esta pestaña</p>
          </>
        )}
        {status === 'success' && (
          <div>
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-white mb-2">{message}</h2>
          </div>
        )}
        {status === 'error' && (
          <div>
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-white mb-3">{message}</h2>
            <button onClick={() => setLocation('/')} className="mt-6 px-8 py-3 bg-[#c9a84c] text-black font-bold rounded-2xl hover:bg-[#e8c97a] transition-all">
              Volver al inicio
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
