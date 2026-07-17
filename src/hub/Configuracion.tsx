import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'
import { auth, supabase } from '@/lib/supabase'
import { Settings, Star } from 'lucide-react'

export default function Configuracion() {
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState<'Free' | 'Pro' | null>(null)

  useEffect(() => {
    auth.getUser().then((u) => {
      if (!u) return
      setEmail(u.email || '')
      supabase
        .from('user_master_profiles')
        .select('is_subscribed')
        .eq('user_id', u.id)
        .single()
        .then(({ data }) => setPlan(data?.is_subscribed ? 'Pro' : 'Free'))
    })
  }, [])

  return (
    <DashboardLayout>
      <Helmet>
        <title>Configuración | CVitae</title>
        <meta name="description" content="Gestioná tu cuenta, plan y preferencias en CVitae." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <GlassCard className="max-w-lg">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Settings size={20} className="text-gold" />
          Configuración de cuenta
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted/70 uppercase tracking-widest mb-2 block">Email</label>
            <input
              type="text"
              value={email}
              readOnly
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
            />
          </div>
          <div>
            <label className="text-xs text-muted/70 uppercase tracking-widest mb-2 block">Plan</label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={plan ?? '…'}
                readOnly
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-muted"
              />
              {plan === 'Free' && (
                <a
                  href="#registro"
                  onClick={(e) => { e.preventDefault(); window.location.href = '/' }}
                  className="flex items-center gap-1.5 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5 text-xs font-medium text-gold transition hover:bg-gold/20"
                >
                  <Star size={13} className="fill-gold text-gold" /> Subir a Pro
                </a>
              )}
            </div>
            {plan === 'Free' && (
              <p className="mt-2 text-xs text-muted/60">
                Con Pro tenés matches ilimitados, CV Vivo ilimitado y alertas diarias por USD 9/mes.
              </p>
            )}
          </div>
          <p className="text-xs text-muted/70 italic">Los datos de cuenta se sincronizan con tu acceso por magic link.</p>
          <GoldButton
            variant="outline"
            onClick={async () => { await auth.signOut(); window.location.href = '/' }}
          >
            Cerrar sesión
          </GoldButton>
        </div>
      </GlassCard>
    </DashboardLayout>
  )
}
