declare global {
  interface Window {
    gtag?: (...args: any[]) => void
  }
}

function track(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, params)
  }
}

export const analytics = {
  cvAnalyzed: (mode: string) => track('cv_analyzed', { mode }),
  b2bLeadSent: (company: string) => track('b2b_lead_sent', { company }),
  batchStarted: (count: number) => track('batch_started', { cv_count: count }),
  opportunityViewed: (opportunityId: string, source: string) => track('opportunity_viewed', { opportunity_id: opportunityId, source }),
  applyClicked: (opportunityId: string, source: string) => track('apply_clicked', { opportunity_id: opportunityId, source }),
}
