import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { supabase } from '@/lib/supabase'
import { isProfileComplete } from '@/lib/profile'
import { motion } from 'framer-motion'

export default function AuthCallback() {
  const [, setLocation] = useLocation()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Procesando inicio de sesión...')

  useEffect(() => {
    let isMounted = true
    let redirected = false

    const redirectAfterAuth = async (token: string) => {
      if (redirected) return
      redirected = true
      try {
        const res = await fetch('/.netlify/functions/b2c-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'status' }),
        })
        const payload = await res.json().catch(() => ({}))
        const destination = isProfileComplete(payload.profile) ? '/mi-carrera' : '/mi-carrera/perfil'
        if (isMounted) setTimeout(() => setLocation(destination), 700)
      } catch {
        if (isMounted) setTimeout(() => setLocation('/mi-carrera/perfil'), 700)
      }
    }

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
            await redirectAfterAuth(data.session.access_token)
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
        redirectAfterAuth(session.access_token)
      }
    })

    processCallback()

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [setLocation])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-sm">
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-white">{message}</h2>
            <p className="text-muted mt-2 text-sm">No cierres esta pestaña</p>
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
            <button onClick={() => setLocation('/')} className="mt-6 px-8 py-3 bg-gold text-black font-bold rounded-2xl hover:bg-[#e8c97a] transition-all">
              Volver al inicio
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
