// src/components/admin/AdminCeoHoy.tsx
// CEO "Hoy" tab — KPIs, program status, and action queue.
// Displays data from metrics, externalMetrics, and founding_beta_stats.

import { Sparkles, Users, Star, AlertCircle, Mail, CheckCircle, Clock } from 'lucide-react'

interface AdminCeoHoyProps {
  metrics: {
    usuarios: number
    suscriptores: number
    oportunidades: number
    usuariosHoy: number
    usuariosAyer: number
    queues: {
      opportunityReview: number
      feedbackOpen: number
      recruiterReview: number
    }
  }
  externalMetrics: any
  foundingStats: {
    program: string
    limit: number
    total_enrolled: number
    total_active: number
    slots_remaining: number
    enrollments: any[]
  } | null
  foundingStatsLoading: boolean
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#111] p-5">
      <p className="text-xs text-white/40 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
    </div>
  )
}

function QueueItem({ label, count, tone }: { label: string; count: number; tone: 'red' | 'amber' | 'green' }) {
  const colors = { red: 'text-red-400', amber: 'text-amber-400', green: 'text-emerald-400' }
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/70">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${count === 0 ? 'text-white/30' : colors[tone]}`}>{count}</span>
    </div>
  )
}

export function AdminCeoHoy({ metrics, externalMetrics, foundingStats, foundingStatsLoading }: AdminCeoHoyProps) {
  const emailsSent7d = externalMetrics?.alerts?.counts
    ? Object.values(externalMetrics.alerts.counts as Record<string, number>).reduce((a, b) => a + b, 0)
    : null

  const activeFounders = foundingStats?.total_active ?? 0
  const slotsUsed = foundingStats ? foundingStats.limit - foundingStats.slots_remaining : 0

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-white/30 mb-4">Hoy en CVitae</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Usuarios reales" value={metrics.usuarios} sub={`+${metrics.usuariosHoy} hoy`} />
          <KpiCard label="Pro activos" value={metrics.suscriptores} color="text-[#c9a84c]" />
          <KpiCard label="Oportunidades" value={metrics.oportunidades} />
          <KpiCard label="Founding 50" value={foundingStatsLoading ? '—' : `${activeFounders}/50`}
            sub={foundingStatsLoading ? '' : `${foundingStats?.slots_remaining ?? 50} cupos libres`}
            color="text-[#c9a84c]" />
        </div>
      </div>

      {/* Action queue */}
      <div className="rounded-xl border border-white/8 bg-[#111] p-5">
        <h2 className="text-xs uppercase tracking-widest text-white/30 mb-3">Cola de acciones</h2>
        <QueueItem label="Oportunidades pendientes de revisión" count={metrics.queues.opportunityReview} tone="amber" />
        <QueueItem label="Reportes de producto abiertos" count={metrics.queues.feedbackOpen} tone="amber" />
        <QueueItem label="Empresas B2B pendientes de revisión" count={metrics.queues.recruiterReview} tone="amber" />
        {emailsSent7d !== null && (
          <QueueItem label="Emails enviados (7 días)" count={emailsSent7d} tone="green" />
        )}
      </div>

      {/* Founding 50 program status */}
      {!foundingStatsLoading && foundingStats && (
        <div className="rounded-xl border border-white/8 bg-[#111] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-[#c9a84c]" />
            <h2 className="text-xs uppercase tracking-widest text-white/30">Founding 50</h2>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{foundingStats.total_enrolled}</p>
              <p className="text-xs text-white/40 mt-0.5">Enrolled</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#c9a84c]">{foundingStats.total_active}</p>
              <p className="text-xs text-white/40 mt-0.5">Activos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{foundingStats.slots_remaining}</p>
              <p className="text-xs text-white/40 mt-0.5">Cupos libres</p>
            </div>
          </div>
          {foundingStats.enrollments.length > 0 && (
            <div>
              <p className="text-xs text-white/30 mb-2">Últimos enrolled</p>
              {foundingStats.enrollments.slice(0, 5).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-sm text-white/70 truncate max-w-[200px]">{e.email}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    e.status === 'active' ? 'bg-[#c9a84c]/20 text-[#c9a84c]' :
                    e.status === 'offered' ? 'bg-sky-500/20 text-sky-400' :
                    'bg-white/10 text-white/50'
                  }`}>{e.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
