// src/components/admin/UserDetailDrawer.tsx
// Slide-out Customer 360 drawer. Opens when admin clicks a user row.
// Data is fetched by the parent (Admin.tsx) via the user_detail action.

import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface UserDetailDrawerProps {
  profileId: string | null
  data: UserDetailData | null
  loading: boolean
  onClose: () => void
  onEnableFoundingOffer?: (userId: string) => Promise<void>
  onDetailRefresh?: (profileId: string) => void
  onFoundingApprove?: (userId: string) => Promise<void>
  onFoundingReject?: (userId: string) => Promise<void>
}

interface UserDetailData {
  profile: any
  auth_email: string | null
  founding_beta: any | null
  events: Array<{ id: number; event_type: string; occurred_at: string; event_data: any }>
  emails_sent: Array<{ id: number; template: string; status: string; sent_at: string; resend_id: string | null; metadata?: Record<string, any> }>
  acquisition: any | null
  profile_health?: {
    skills_count: number
    has_location: boolean
    has_cv: boolean
    cv_uploaded_at: string | null
    has_cv_text: boolean
    has_embedding: boolean
    completeness_score: number
    completeness_max: number
  }
  matching?: {
    match_count: number
    top_score: number | null
    last_match_at: string | null
  }
  warnings?: string[]
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-white/50">{label}</span>
      <span className="text-right text-xs text-white/70">{value}</span>
    </div>
  )
}

export function UserDetailDrawer({
  profileId, data, loading, onClose,
  onEnableFoundingOffer, onDetailRefresh,
  onFoundingApprove, onFoundingReject,
}: UserDetailDrawerProps) {
  const isOpen = !!profileId
  const [confirmingEnable, setConfirmingEnable] = useState(false)
  const [enablingOffer, setEnablingOffer] = useState(false)
  const [approvingFounding, setApprovingFounding] = useState(false)
  const [rejectingFounding, setRejectingFounding] = useState(false)
  const [confirmingReject, setConfirmingReject] = useState(false)
  const [foundingActionMsg, setFoundingActionMsg] = useState('')

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />
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
                {/* Warnings */}
                {data.warnings && data.warnings.length > 0 && (
                  <div className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-widest text-amber-400/60 mb-2">Advertencias</p>
                    {data.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-amber-300/80">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-400/60" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}

                {/* Profile */}
                <Section title="Perfil">
                  <div className="space-y-1.5 text-sm">
                    <Row label="Nombre" value={data.profile.full_name || '—'} />
                    <Row label="Email" value={
                      <span className="font-mono text-xs">
                        {data.profile.email || data.auth_email || <span className="text-zinc-500 italic">sin email</span>}
                      </span>
                    } />
                    <Row label="Lifecycle" value={
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        data.profile.lifecycle_state === 'activated' ? 'bg-emerald-500/20 text-emerald-400' :
                        data.profile.lifecycle_state === 'engaged' ? 'bg-[#c9a84c]/20 text-[#c9a84c]' :
                        data.profile.lifecycle_state === 'churned' ? 'bg-red-500/20 text-red-400' :
                        'bg-white/10 text-white/50'
                      }`}>{data.profile.lifecycle_state || 'signed_up'}</span>
                    } />
                    {data.profile.ttfv_seconds && (
                      <Row label="TTFV" value={`${Math.round(data.profile.ttfv_seconds / 60)} min`} />
                    )}
                    <Row label="Registro" value={new Date(data.profile.created_at).toLocaleDateString('es-PY')} />
                    <Row label="Plan" value={
                      <span className={data.profile.is_subscribed ? 'text-[#c9a84c] text-xs' : 'text-white/40 text-xs'}>
                        {data.profile.is_subscribed ? '● PRO' : '○ FREE'}
                      </span>
                    } />
                    {!data.profile.is_test && (
                      <div className="flex justify-between items-start">
                        <span className="text-white/50">Founding gate</span>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            data.profile.founding_offer_enabled === false
                              ? 'bg-zinc-700/50 text-zinc-400'
                              : 'bg-[#c9a84c]/10 text-[#c9a84c]/70'
                          }`}>
                            {data.profile.founding_offer_enabled === false ? 'DEFERRED' : 'ENABLED'}
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
                                <button onClick={() => setConfirmingEnable(false)} className="text-[10px] text-zinc-500 hover:text-white transition">Cancelar</button>
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

                {/* Profile health */}
                {data.profile_health && (
                  <Section title="Estado del perfil">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                      <Row label="Completitud" value={`${data.profile_health.completeness_score}/${data.profile_health.completeness_max}`} />
                      <Row label="CV subido" value={data.profile_health.has_cv ? `Sí${data.profile_health.cv_uploaded_at ? ` · ${new Date(data.profile_health.cv_uploaded_at).toLocaleDateString('es-PY')}` : ''}` : 'No'} />
                      <Row label="Texto CV" value={data.profile_health.has_cv_text ? 'Sí' : 'No'} />
                      <Row label="Ubicación" value={data.profile_health.has_location ? 'Sí' : <span className="text-amber-400/80">Sin ubicación</span>} />
                      <Row label="Skills" value={data.profile_health.skills_count > 0 ? `${data.profile_health.skills_count} skills` : <span className="text-amber-400/80">Sin skills</span>} />
                      <Row label="Embedding" value={data.profile_health.has_embedding ? 'Sí' : <span className="text-amber-400/80">Pendiente</span>} />
                    </div>
                  </Section>
                )}

                {/* Founding Beta — with Approve/Reject controls */}
                {!data.profile.is_test && (
                  <Section title="Founding Beta">
                    <div className="rounded-lg border border-[#c9a84c]/20 bg-[#c9a84c]/5 p-3 space-y-1.5">
                      <Row label="Estado" value={
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          data.founding_beta?.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                          data.founding_beta?.status === 'accepted' ? 'bg-amber-500/20 text-amber-400' :
                          data.founding_beta?.status === 'declined' ? 'bg-red-500/20 text-red-400' :
                          'bg-white/10 text-white/40'
                        }`}>
                          {data.founding_beta?.status === 'accepted' ? 'PENDIENTE APROBACIÓN' :
                           data.founding_beta?.status?.toUpperCase() || 'SIN ENROLLMENT'}
                        </span>
                      } />
                      {data.founding_beta?.offered_at && <Row label="Oferta mostrada" value={new Date(data.founding_beta.offered_at).toLocaleString('es-PY')} />}
                      {data.founding_beta?.accepted_at && <Row label="Solicitado" value={new Date(data.founding_beta.accepted_at).toLocaleString('es-PY')} />}
                      {data.founding_beta?.status === 'active' && data.founding_beta?.benefit_end && (
                        <Row label="Beneficio hasta" value={new Date(data.founding_beta.benefit_end).toLocaleDateString('es-PY')} />
                      )}
                      <Row label="Pro activo" value={data.profile.is_subscribed ? 'Sí' : 'No'} />
                      {data.founding_beta?.dismissed_count > 0 && <Row label='"Ahora no"' value={`${data.founding_beta.dismissed_count}×`} />}

                      {/* Approve / Reject controls — only when status='accepted' */}
                      {data.founding_beta?.status === 'accepted' && (
                        <div className="pt-3 mt-1 border-t border-white/[0.06]">
                          {foundingActionMsg ? (
                            <p className="text-xs text-center text-emerald-400/80">{foundingActionMsg}</p>
                          ) : confirmingReject ? (
                            <div className="flex gap-2 items-center justify-center">
                              <span className="text-[10px] text-zinc-400">¿Confirmar rechazo?</span>
                              <button
                                disabled={rejectingFounding}
                                onClick={async () => {
                                  if (!onFoundingReject) return
                                  setRejectingFounding(true)
                                  try {
                                    await onFoundingReject(data.profile.user_id)
                                    setFoundingActionMsg('Solicitud rechazada.')
                                    setConfirmingReject(false)
                                    if (profileId) onDetailRefresh?.(profileId)
                                  } catch (e: any) {
                                    setFoundingActionMsg('Error: ' + (e?.message || 'desconocido'))
                                  } finally { setRejectingFounding(false) }
                                }}
                                className="text-[10px] px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-40 transition"
                              >
                                {rejectingFounding ? '...' : 'Confirmar rechazo'}
                              </button>
                              <button onClick={() => setConfirmingReject(false)} className="text-[10px] text-zinc-500 hover:text-white transition">Cancelar</button>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-center">
                              <button
                                disabled={approvingFounding}
                                onClick={async () => {
                                  if (!onFoundingApprove) return
                                  setApprovingFounding(true)
                                  try {
                                    await onFoundingApprove(data.profile.user_id)
                                    setFoundingActionMsg('¡Aprobado! Email de bienvenida enviado.')
                                    if (profileId) onDetailRefresh?.(profileId)
                                  } catch (e: any) {
                                    setFoundingActionMsg('Error: ' + (e?.message || 'desconocido'))
                                  } finally { setApprovingFounding(false) }
                                }}
                                className="text-xs px-4 py-1.5 rounded bg-[#c9a84c]/20 border border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/30 disabled:opacity-40 transition font-medium"
                              >
                                {approvingFounding ? '...' : 'Aprobar'}
                              </button>
                              {onFoundingReject && (
                                <button
                                  onClick={() => setConfirmingReject(true)}
                                  className="text-xs px-4 py-1.5 rounded bg-white/5 border border-white/10 text-white/50 hover:text-red-400/80 hover:border-red-500/30 transition"
                                >
                                  Rechazar
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Section>
                )}

                {/* Matching health */}
                {data.matching && (
                  <Section title="Matching">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                      <Row label="Matches en DB" value={data.matching.match_count} />
                      {data.matching.top_score !== null && <Row label="Top score" value={`${Math.round(data.matching.top_score)}/100`} />}
                      {data.matching.last_match_at && <Row label="Último run" value={new Date(data.matching.last_match_at).toLocaleDateString('es-PY')} />}
                      <Row label="Matches visibles" value={
                        data.profile.is_subscribed
                          ? `${data.matching.match_count} (PRO — todos)`
                          : `${Math.min(data.matching.match_count, 3)} / ${data.matching.match_count} (FREE — máx 3)`
                      } />
                    </div>
                  </Section>
                )}

                {/* Acquisition */}
                {data.acquisition && (
                  <Section title="Origen">
                    <div className="space-y-1.5 text-sm">
                      {data.acquisition.source && <Row label="Fuente" value={data.acquisition.source} />}
                      {data.acquisition.medium && <Row label="Medio" value={data.acquisition.medium} />}
                      {data.acquisition.landing_page && (
                        <div className="flex justify-between">
                          <span className="text-white/50 text-sm">Landing</span>
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
                        <div key={e.id} className="rounded border border-white/[0.06] p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-white/60 font-mono">{e.template}</span>
                            <span className={e.status === 'sent' ? 'text-emerald-400/70' : 'text-red-400/70'}>{e.status}</span>
                          </div>
                          <div className="mt-1 flex justify-between gap-3 text-[10px] text-white/30">
                            <span>{new Date(e.sent_at).toLocaleString('es-PY')}</span>
                            <span className="truncate font-mono">{e.resend_id || 'sin resend_id'}</span>
                          </div>
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
