import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'
import { auth, supabase } from '@/lib/supabase'
import { AlertTriangle, Loader2, Settings, Star, Trash2 } from 'lucide-react'

export default function Configuracion() {
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState<'Free' | 'Pro' | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

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

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'ELIMINAR' || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Tu sesión expiró. Volvé a ingresar.')
      const response = await fetch('/.netlify/functions/delete-b2c-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      })
      const result = await response.json()
      if (!response.ok || !result.deleted) throw new Error(result.error || 'No pudimos eliminar la cuenta.')
      await supabase.auth.signOut({ scope: 'local' })
      window.location.href = '/?cuenta=eliminada'
    } catch (error: any) {
      setDeleteError(error?.message || 'No pudimos eliminar la cuenta.')
      setDeleting(false)
    }
  }

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
                  <Star size={13} className="fill-gold text-gold" /> Solicitar beta ampliada
                </a>
              )}
            </div>
            {plan === 'Free' && (
              <p className="mt-2 text-xs text-muted/60">
                El acceso ampliado de la beta se habilita por cupos para cuidar disponibilidad y calidad.
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

          <div className="border-t border-white/10 pt-6">
            <div className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-500/[0.05] p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-red-200">Eliminar cuenta y perfil</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/50">
                    Elimina tu acceso, perfil y CV generados. Las postulaciones ya enviadas a empresas pertenecen a esos procesos de selección; podés solicitar su eliminación por separado.
                  </p>
                </div>
                <label className="block text-xs text-white/55">
                  Escribí <strong className="text-white">ELIMINAR</strong> para confirmar
                  <input
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                    autoComplete="off"
                    className="mt-2 w-full rounded-xl border border-red-400/20 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-red-300/50"
                  />
                </label>
                {deleteError && <p className="text-xs text-red-300">{deleteError}</p>}
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmation !== 'ELIMINAR' || deleting}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-red-400/30 px-4 text-xs font-medium text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </DashboardLayout>
  )
}
