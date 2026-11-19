export type AdRouteClass = 'ADS_FUTURE_ALLOWED' | 'ADS_NOT_APPROPRIATE' | 'ADS_UNDECIDED'

/**
 * Route-level guardrails for a future, consented ad implementation.
 * This is a policy map only: it does not load ads or enable monetization.
 */
export const AD_ROUTE_POLICY = [
  { pattern: '/', classification: 'ADS_FUTURE_ALLOWED', reason: 'public discovery' },
  { pattern: '/empleos', classification: 'ADS_FUTURE_ALLOWED', reason: 'public discovery' },
  { pattern: '/oportunidades', classification: 'ADS_FUTURE_ALLOWED', reason: 'public discovery' },
  { pattern: '/empleos/:slug', classification: 'ADS_FUTURE_ALLOWED', reason: 'public detail; only after core content' },
  { pattern: '/oportunidades/:slug', classification: 'ADS_FUTURE_ALLOWED', reason: 'public detail; only after core content' },
  { pattern: '/vacante/:slug', classification: 'ADS_FUTURE_ALLOWED', reason: 'public detail; only after core content' },
  { pattern: '/blog/*', classification: 'ADS_FUTURE_ALLOWED', reason: 'public informational content' },
  { pattern: '/mi-carrera/*', classification: 'ADS_NOT_APPROPRIATE', reason: 'private career workflow' },
  { pattern: '/auth/*', classification: 'ADS_NOT_APPROPRIATE', reason: 'authentication flow' },
  { pattern: '/perfil/*', classification: 'ADS_NOT_APPROPRIATE', reason: 'private profile workflow' },
  { pattern: '/empresas/*', classification: 'ADS_UNDECIDED', reason: 'recruiter/B2B policy not decided here' },
  { pattern: '/admin/*', classification: 'ADS_NOT_APPROPRIATE', reason: 'operator/admin workflow' },
] as const
