import { readConsent } from './consent'

declare global {
  interface Window {
    gtag?: (...args: any[]) => void
  }
}

function track(eventName: string, params?: Record<string, any>) {
  // Advanced Consent Mode may initialize gtag before a choice is made. Product
  // events stay opt-in so no opportunity, company, CV or user metadata is sent
  // before explicit analytics consent.
  if (typeof window !== 'undefined' && readConsent()?.analytics === true && typeof window.gtag === 'function') {
    window.gtag('event', eventName, params)
  }
}

export type OpportunityAnalyticsContext = {
  opportunity_id?: string
  opportunity_slug?: string
  source?: string
  opportunity_kind?: string
  route_family?: string
  auth_state?: string
  surface?: string
}

export const analytics = {
  cvAnalyzed: (mode: string) => track('cv_analyzed', { mode }),
  b2bLeadSent: (company: string) => track('b2b_lead_sent', { company }),
  batchStarted: (count: number) => track('batch_started', { cv_count: count }),
  opportunityViewed: (opportunityId: string, source: string, context: OpportunityAnalyticsContext = {}) => track('opportunity_viewed', { ...context, opportunity_id: opportunityId, source }),
  prepareClicked: (context: OpportunityAnalyticsContext) => track('prepare_clicked', context),
  workspaceOpened: (context: OpportunityAnalyticsContext) => track('application_workspace_opened', context),
  profileReady: (context: OpportunityAnalyticsContext) => track('profile_ready', context),
  authStarted: (context: OpportunityAnalyticsContext) => track('auth_started', context),
  authCompleted: (context: OpportunityAnalyticsContext) => track('auth_completed', context),
  preparationCompleted: (context: OpportunityAnalyticsContext) => track('preparation_completed', context),
  applyClicked: (opportunityId: string, source: string, context: OpportunityAnalyticsContext = {}) => track('apply_clicked', { ...context, opportunity_id: opportunityId, source }),
}
