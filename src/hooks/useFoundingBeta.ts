// src/hooks/useFoundingBeta.ts
// Manages Founding Beta offer state for the current authenticated user.
// Calls /.netlify/functions/founding-beta-action for all operations.

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
  return res.json()
}

export function useFoundingBeta(userId: string | null): FoundingBetaState {
  const [loading, setLoading] = useState(true)
  const [enrollment, setEnrollment] = useState<FoundingBetaEnrollment | null>(null)
  const [programFull, setProgramFull] = useState(false)
  const [slotsRemaining, setSlotsRemaining] = useState(50)
  const [dismissed, setDismissed] = useState(false)  // session-only dismiss flag

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    // Check for permanent decline in localStorage
    if (localStorage.getItem('founding_beta_declined') === '1') {
      setLoading(false)
      setDismissed(true)
      return
    }

    const load = async () => {
      try {
        const token = await getToken()
        if (!token) { setLoading(false); return }

        const data = await callFoundingAction(token, 'get_status')
        if (data.ineligible) {
          // Test/internal account — founding beta not offered, suppress modal
          setDismissed(true)
          return
        }
        setEnrollment(data.enrollment || null)
        setProgramFull(data.program_full || false)
        setSlotsRemaining(data.slots_remaining ?? 50)
      } catch {
        // Non-critical — modal won't show but dashboard continues
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  // Determine if modal should be shown:
  // Show when: user is loaded, not dismissed this session, enrollment is null or status='eligible' or status='offered',
  // AND the program is not full (or enrollment exists).
  const showModal = !loading && !dismissed && (
    enrollment === null
      ? !programFull  // new user, show only if slots available
      : enrollment.status === 'eligible' || enrollment.status === 'offered'
  )

  const accept = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    const data = await callFoundingAction(token, 'accept')
    if (data.ok) {
      setEnrollment(data.enrollment || { ...enrollment, status: 'active' } as FoundingBetaEnrollment)
      setDismissed(true)  // close modal after accept
    }
    // If program_full, modal should show the "full" state — handle in component
  }, [enrollment])

  const decline = useCallback(async () => {
    // Explicit permanent opt-out
    // For V1: permanent decline stored in localStorage (service_role required for DB write)
    localStorage.setItem('founding_beta_declined', '1')
    setDismissed(true)
  }, [])

  const dismiss = useCallback(() => {
    // "Ahora no" — session-only, no API call
    // Also call increment_dismissed in background (fire-and-forget)
    setDismissed(true)
    getToken().then(token => {
      if (token) callFoundingAction(token, 'increment_dismissed').catch(() => {})
    })
  }, [])

  return { loading, enrollment, programFull, slotsRemaining, showModal, accept, decline, dismiss }
}
