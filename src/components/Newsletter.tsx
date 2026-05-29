import { useState } from 'react'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'

export function Newsletter() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    try {
      const response = await fetch('/.netlify/functions/subscribe-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'website' }),
      })
      if (response.ok) setStatus('success')
      else setStatus('error')
    } catch { setStatus('error') }
  }

  return (
    <GlassCard className="max-w-md mx-auto text-center">
      <h3 className="text-xl font-bold text-white mb-4">Recibir Alertas de Empleos</h3>
      {status === 'success' ? (
        <p className="text-green-400">✓ ¡Suscripción exitosa!</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            required
            className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#c9a84c]/50"
          />
          <GoldButton type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Enviando...' : 'Suscribirme'}
          </GoldButton>
        </form>
      )}
    </GlassCard>
  )
}
