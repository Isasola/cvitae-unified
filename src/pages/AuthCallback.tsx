import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const [, setLocation] = useLocation()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error || !data.session) {
          setStatus('error')
          setTimeout(() => setLocation('/'), 2000)
          return
        }
        setStatus('success')
        setTimeout(() => setLocation('/mi-carrera'), 800)
      } catch {
        setStatus('error')
        setTimeout(() => setLocation('/'), 2000)
      }
    }
    handleCallback()
  }, [setLocation])

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center">
        {status === 'loading' && (
          <>
            <div className="w-10 h-10 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium">Iniciando sesión...</p>
            <p className="text-[#888888] text-sm mt-1">Preparando tu espacio</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <p className="text-white font-medium">¡Bienvenido!</p>
            <p className="text-[#888888] text-sm mt-1">Redirigiendo...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-white font-medium">Algo salió mal</p>
            <p className="text-[#888888] text-sm mt-1">Volviendo al inicio...</p>
          </>
        )}
      </div>
    </div>
  )
}
