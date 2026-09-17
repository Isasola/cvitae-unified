// src/hooks/useFoundingBeta.ts
// Manages Founding Beta offer state for the current authenticated user.
// Calls /.netlify/functions/founding-beta-action for all operations.
// accept() now submits a request → status='accepted' (pending admin review).
// Admin approves → status='active' + is_subscribed=true.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface FoundingBetaEnrollment {
  status: 'eligible' | 'offered' | 'accepted' | 'active' | 'completed' | 'declined'
  offered_at: string | null
  accepted_at: string | null
  benefit_end: string | null
  dismissed_count: number
}

interface FoundingBetaState {
  loading: boolean
  enrollment: FoundingBetaEnrollment | null
  programFull: boolean
  slotsRemaining: number
  showModal: boolean
  accept: () => Promise<void>
  decline: () => Promise<void>
  dismiss: () => void  // "Ahora no" — no API call, just hides modal for this session
  triggerModal: () => void  // Re-show modal from a CTA (e.g., paywall block)
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

async function callFoundingAction(token: string, action: string, extra?: Record<string, unknown>) {
  const res = await fetch('/.netlify/functions/founding-beta-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...extra }),
  })
  const data = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor' }))
  if (!res.ok) {
    throw new Error(data?.error || `Founding Beta no disponible (${res.status})`)
  }
  return data
}

export function useFoundingBeta(userId: string | null): FoundingBetaState {
  const [loading, setLoading] = useState(true)
  const [enrollment, setEnrollment] = useState<FoundingBetaEnrollment | null>(null)
  const [programFull, setProgramFull] = useState(false)
  const [slotsRemaining, setSlotsRemaining] = useState(50)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('founding_beta_modal_seen') === '1')

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    const load = async () => {
      try {
        const token = await getToken()
        if (!token) { setLoading(false); return }

        const data = await callFoundingAction(token, 'get_status')
        if (data.ineligible) {
          setDismissed(true)
          return
        }

        const currentEnrollment: FoundingBetaEnrollment | null = data.enrollment || null
        const isFull = data.program_full || false
        const slots = data.slots_remaining ?? 50

        setEnrollment(currentEnrollment)
        setProgramFull(isFull)
        setSlotsRemaining(slots)

        // Wire mark_offered: call when modal would be shown.
        const wouldShowModal = currentEnrollment === null
          ? !isFull
          : (currentEnrollment.status === 'eligible' || currentEnrollment.status === 'offered')

        if (wouldShowModal) {
          callFoundingAction(token, 'mark_offered').catch(() => {})
        }
      } catch {
        // Non-critical — modal won't show but dashboard continues
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  // Show modal when: not dismissed, enrollment is null/eligible/offered.
  // Do NOT show when status='accepted' (pending review), 'active', 'completed', or 'declined'.
  const showModal = !loading && !dismissed && (
    enrollment === null
      ? !programFull
      : enrollment.status === 'eligible' || enrollment.status === 'offered'
  )

  const accept = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    const data = await callFoundingAction(token, 'accept')
    if (data.ok) {
      const newStatus = data.status === 'pending_review' ? 'accepted' : (data.status || 'accepted')
      setEnrollment(prev => ({ ...prev, status: newStatus, accepted_at: new Date().toISOString() } as FoundingBetaEnrollment))
      setDismissed(true)
    }
  }, [])

  const decline = useCallback(async () => {
    // Explicit permanent opt-out — persisted in DB for cross-device suppression
    setDismissed(true)
    localStorage.setItem('founding_beta_declined', '1')
    const token = await getToken()
    if (token) {
      callFoundingAction(token, 'decline').catch(() => {})
    }
  }, [])

  const dismiss = useCallback(() => {
    sessionStorage.setItem('founding_beta_modal_seen', '1')
    setDismissed(true)
    getToken().then(token => {
      if (token) callFoundingAction(token, 'increment_dismissed').catch(() => {})
    })
  }, [])

  const triggerModal = useCallback(() => {
    sessionStorage.removeItem('founding_beta_modal_seen')
    setDismissed(false)
  }, [])

  return { loading, enrollment, programFull, slotsRemaining, showModal, accept, decline, dismiss, triggerModal }
}
