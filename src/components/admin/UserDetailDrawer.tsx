// src/components/admin/UserDetailDrawer.tsx
// Slide-out Customer 360 drawer. Opens when admin clicks a user row.
// Data is fetched by the parent (Admin.tsx) via the user_detail action.

import { useState } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface UserDetailDrawerProps {
  profileId: string | null  // null = drawer closed
  data: UserDetailData | null
  loading: boolean
  onClose: () => void
  onEnableFoundingOffer?: (userId: string) => Promise<void>
  onDetailRefresh?: (profileId: string) => void
}

interface UserDetailData {
  profile: any
  auth_email: string | null
  founding_beta: any | null
  events: Array<{ id: number; event_type: string; occurred_at: string; event_data: any }>
  emails_sent: Array<{ id: number; template: string; status: string; sent_at: string; resend_id: string | null }>
  acquisition: any | null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">{title}</p>
      {children}
    </div>
  )
}

export function UserDetailDrawer({ profileId, data, loading, onClose, onEnableFoundingOffer, onDetailRefresh }: UserDetailDrawerProps) {
  const isOpen = !!profileId
  const [confirmingEnable, setConfirmingEnable] = useState(false)
  const [enablingOffer, setEnablingOffer] = useState(false)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#0d0d0d] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-semibold text-white">Detalle de usuario</h2>
              <button onClick={onClose} className="rounded-full p-1.5 text-white/40 hover:text-white/80 transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#c9a84c] border-t-transparent" />
              </div>
            )}

            {!loading && data && (
              <div>
                {/* Profile */}
                <Section title="Perfil">
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/50">Nombre</span>
                      <span className="text-white/80">{data.profile.full_name || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Email</span>
                      <span className="text-white/80 font-mono text-xs">
                        {data.profile.email
                          ? data.profile.email
                          : data.auth_email
                            ? <>{data.auth_email} <span className="text-white/30 text-[10px]">(cuenta)</span></>
                            : <span className="text-zinc-500 italic">sin email en perfil</span>
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Lifecycle</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        data.profile.lifecycle_state === 'activated' ? 'bg-emerald-500/20 text-emerald-400' :
                        data.profile.lifecycle_state === 'engaged' ? 'bg-[#c9a84c]/20 text-[#c9a84c]' :
                        data.profile.lifecycle_state === 'churned' ? 'bg-red-500/20 text-red-400' :
                        'bg-white/10 text-white/50'
                      }`}>{data.profile.lifecycle_state || 'signed_up'}</span>
                    </div>
                    {data.profile.ttfv_seconds && (
                      <div className="flex justify-between">
                        <span className="text-white/50">TTFV</span>
                        <span className="text-white/80">{Math.round(data.profile.ttfv_seconds / 60)} min</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-white/50">Registro</span>
                      <span className="text-white/80 text-xs">{new Date(data.profile.created_at).toLocaleDateString('es-PY')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Plan</span>
                      <span className={data.profile.is_subscribed ? 'text-[#c9a84c] text-xs' : 'text-white/40 text-xs'}>
                        {data.profile.is_subscribed ? '● PRO' : '○ FREE'}
                      </span>
                    </div>
                    {!data.profile.is_test && (
                      <div className="flex justify-between items-start">
                        <span className="text-white/50">Founding</span>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            data.profile.founding_offer_enabled === false
                              ? 'bg-zinc-700/50 text-zinc-400'
                              : 'bg-[#c9a84c]/10 text-[#c9a84c]/70'
                          }`}>
                            {data.profile.founding_offer_enabled === false
                              ? 'ELIGIBLE · DEFERRED'
                              : 'ELIGIBLE / ENABLED'}
                          </span>
                          {data.profile.founding_offer_enabled === false && onEnableFoundingOffer && (
                            confirmingEnable ? (
                              <div className="flex gap-1.5 items-center">
                                <span className="text-[10px] text-zinc-400">¿Confirmar para {data.profile.full_name || 'este usuario'}?</span>
                                <button
                                  disabled={enablingOffer}
                                  onClick={async () => {
                                    setEnablingOffer(true)
                                    try {
                                      await onEnableFoundingOffer(data.profile.user_id)
                                      setConfirmingEnable(false)
                                      if (profileId) onDetailRefresh?.(profileId)
                                    } finally { setEnablingOffer(false) }
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded bg-[#c9a84c]/20 text-[#c9a84c] hover:bg-[#c9a84c]/30 disabled:opacity-40 transition"
                                >
                                  {enablingOffer ? '...' : 'Confirmar'}
                                </button>
                                <button
                                  onClick={() => setConfirmingEnable(false)}
                                  className="text-[10px] text-zinc-500 hover:text-white transition"
                                >Cancelar</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmingEnable(true)}
                                className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:border-[#c9a84c]/50 hover:text-[#c9a84c]/80 transition"
                              >
                                Habilitar Founding →
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Section>

                {/* Founding Beta */}
                {data.founding_beta && (
                  <Section title="Founding Beta">
                    <div className="rounded-lg border border-[#c9a84c]/20 bg-[#c9a84c]/5 p-3 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/50">Estado</span>
                        <span className="text-[#c9a84c]">{data.founding_beta.status}</span>
                      </div>
                      {data.founding_beta.accepted_at && (
                        <div className="flex justify-between">
                          <span className="text-white/50">Aceptó</span>
                          <span className="text-white/70 text-xs">{new Date(data.founding_beta.accepted_at).toLocaleDateString('es-PY')}</span>
                        </div>
                      )}
                      {data.founding_beta.benefit_end && (
                        <div className="flex justify-between">
                          <span className="text-white/50">Pro hasta</span>
                          <span className="text-white/70 text-xs">{new Date(data.founding_beta.benefit_end).toLocaleDateString('es-PY')}</span>
                        </div>
                      )}
                      {data.founding_beta.dismissed_count > 0 && (
                        <div className="flex justify-between">
                          <span className="text-white/50">"Ahora no"</span>
                          <span className="text-white/50 text-xs">{data.founding_beta.dismissed_count}×</span>
                        </div>
                      )}
                    </div>
                  </Section>
                )}

                {/* Acquisition */}
                {data.acquisition && (
                  <Section title="Origen">
                    <div className="space-y-1.5 text-sm">
                      {data.acquisition.source && (
                        <div className="flex justify-between">
                          <span className="text-white/50">Fuente</span>
                          <span className="text-white/80">{data.acquisition.source}</span>
                        </div>
                      )}
                      {data.acquisition.medium && (
                        <div className="flex justify-between">
                          <span className="text-white/50">Medio</span>
                          <span className="text-white/80">{data.acquisition.medium}</span>
                        </div>
                      )}
                      {data.acquisition.landing_page && (
                        <div className="flex justify-between">
                          <span className="text-white/50">Landing</span>
                          <span className="text-white/80 text-xs truncate max-w-[200px]">{data.acquisition.landing_page}</span>
                        </div>
                      )}
                    </div>
                  </Section>
                )}

                {/* Events */}
                {data.events.length > 0 && (
                  <Section title={`Eventos (${data.events.length})`}>
                    <div className="space-y-1.5">
                      {data.events.slice(0, 10).map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs">
                          <span className="text-white/60 font-mono">{e.event_type}</span>
                          <span className="text-white/30">{new Date(e.occurred_at).toLocaleDateString('es-PY')}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Emails */}
                {data.emails_sent.length > 0 && (
                  <Section title={`Emails enviados (${data.emails_sent.length})`}>
                    <div className="space-y-1.5">
                      {data.emails_sent.map(e => (
                        <div key={e.id} className="flex items-center justify-between text-xs">
                          <span className="text-white/60 font-mono">{e.template}</span>
                          <span className={e.status === 'sent' ? 'text-emerald-400/70' : 'text-red-400/70'}>{e.status}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {data.events.length === 0 && data.emails_sent.length === 0 && !data.founding_beta && !data.acquisition && (
                  <p className="text-sm text-white/30 text-center py-8">Sin actividad registrada</p>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
