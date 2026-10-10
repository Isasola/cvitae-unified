import producers from './controlled-opportunity-producers.json'

export const controlledProducer = (source: string) => (producers as Record<string, any>)[source] || null
export type ControlledConsumer = 'catalog' | 'matching' | 'alerts' | 'seo' | 'jobPosting' | 'googleJobs' | 'thirdParty'
export function controlledPermission(source: string, consumer: ControlledConsumer, policy: Record<string, any> | undefined) {
  if (!controlledProducer(source)) return null
  const dimension = consumer === 'seo' ? 'seo_index' : consumer === 'jobPosting' || consumer === 'googleJobs' ? 'google_jobs' : consumer === 'thirdParty' ? 'third_party_distribution' : consumer
  const column = consumer === 'catalog' ? 'web_catalog_allowed' : consumer === 'seo' ? 'search_engine_indexing_allowed'
    : consumer === 'jobPosting' || consumer === 'googleJobs' ? 'google_jobs_distribution_allowed'
      : consumer === 'thirdParty' ? 'third_party_job_distribution_allowed' : null
  // Snapshot projected by the canonical SQL policy; raw legacy switches never
  // grant permission. Explicit legacy DENIED remains a veto for its dimension.
  const supplied = policy?.consumer_permission_states?.[dimension]
  const state = column && policy?.[column] === false ? 'DENIED'
    : supplied === 'ALLOWED' || supplied === 'DENIED' ? supplied : 'UNKNOWN'
  const reason = state === 'ALLOWED' ? 'EXPLICIT_CONSUMER_PERMISSION'
    : column === 'web_catalog_allowed' && policy?.[column] === false ? 'WEB_CATALOG_DENIED'
      : `${dimension.toUpperCase()}_PERMISSION_${state}`
  return { state: state as 'ALLOWED' | 'DENIED' | 'UNKNOWN', reason }
}
