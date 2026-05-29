import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'
import { auth } from '@/lib/supabase'
import { Settings } from 'lucide-react'

export default function Configuracion() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    auth.getUser().then(setUser)
  }, [])

  return (
    <DashboardLayout>
      <GlassCard className="max-w-lg">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Settings size={20} className="text-[#c9a84c]" />
          Configuración de cuenta
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#555555] uppercase tracking-widest mb-2 block">Email</label>
            <input
              type="text"
              value={user?.email || ''}
              readOnly
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
            />
          </div>
          <div>
            <label className="text-xs text-[#555555] uppercase tracking-widest mb-2 block">Plan</label>
            <input
              type="text"
              value="Free"
              readOnly
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-[#888888]"
            />
          </div>
          <p className="text-xs text-[#555555] italic">Los datos de cuenta se sincronizan con tu acceso por magic link.</p>
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
