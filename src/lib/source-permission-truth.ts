import registry from '../generated/source-intelligence-registry.json'

export const SOURCE_PERMISSION_DIMENSIONS = [
  'collect', 'detail_fetch', 'catalog', 'matching', 'alerts', 'seo_index',
  'google_jobs', 'third_party_distribution', 'application_routing', 'attribution_requirement',
] as const
export const SOURCE_PERMISSION_REVIEWED_AT = '2026-09-29'
export type SourcePermissionDimension = typeof SOURCE_PERMISSION_DIMENSIONS[number]
export type SourcePermissionState = 'ALLOWED' | 'DENIED' | 'UNKNOWN' | 'NOT_APPLICABLE'
export type SourcePermissionConsumer = 'catalog' | 'matching' | 'alerts' | 'seo'
export function sourcePermissionEvidenceClass(decision: SourcePermissionDecision) {
  return decision.state !== 'UNKNOWN' && decision.evidence_type.startsWith('OFFICIAL_')
    && Boolean(decision.provenance && decision.evidence_url_or_repo_reference)
    ? 'EXPLICIT_EVIDENCE_BACKED' : 'DEFAULT/INHERITED/UNSUPPORTED'
}
export type SourcePermissionDecision = {
  state: SourcePermissionState; reason: string; evidence_type: string
  provenance: string; evidence_url_or_repo_reference: string; verified_at: string
  notes: string
}
export type SourcePermissionConsumerDecision = Omit<SourcePermissionDecision, 'state'> & { state: Exclude<SourcePermissionState, 'NOT_APPLICABLE'> }
type SourcePermissionRow = {
  canonical_source: string; emitted_aliases: string[]
  dimensions: Record<SourcePermissionDimension, SourcePermissionDecision>
}

const reviewedAt = SOURCE_PERMISSION_REVIEWED_AT
const unknown = (source: string, dimension: SourcePermissionDimension): SourcePermissionDecision => ({
  state: 'UNKNOWN', reason: 'SOURCE_PERMISSION_NOT_EVIDENCED', evidence_type: 'REPOSITORY_REVIEW',
  provenance: 'docs/source-permission-matrix.md; no affirmative permission evidence identified',
  evidence_url_or_repo_reference: 'docs/source-permission-matrix.md', verified_at: reviewedAt,
  notes: `No evidence for ${dimension} on ${source}; UNKNOWN is not DENIED and is not permission.`,
})
const evidence = (
  state: SourcePermissionState, reason: string, evidence_type: string, reference: string,
  notes: string, verifiedAt = reviewedAt,
): SourcePermissionDecision => ({ state, reason, evidence_type, provenance: reference,
  evidence_url_or_repo_reference: reference, verified_at: verifiedAt, notes })

// Only checked-in contracts and official publisher/API terms are affirmative.
// Registry booleans, scraper presence and existing rows are intentionally not inputs.
const explicit: Record<string, Partial<Record<SourcePermissionDimension, SourcePermissionDecision>>> = {
  himalayas: {
    collect: evidence('ALLOWED', 'PUBLIC_API_PRODUCT_USE', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'Free public API requires no key/authentication and expressly supports job search products, dashboards, AI agents, and automation.', '2026-10-01'),
    detail_fetch: evidence('ALLOWED', 'PUBLIC_API_PRODUCT_USE', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'The official API provides job detail fields, including full descriptions and application links; use the API payload and preserve source identity.', '2026-10-01'),
    catalog: evidence('ALLOWED', 'FIRST_PARTY_PRODUCT_USE', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'Official documentation allows listings to power job-search products and dashboards; Himalayas must remain the original source with linkback.', '2026-10-01'),
    matching: evidence('ALLOWED', 'JOB_SEARCH_PRODUCT_USE', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'Official documentation expressly permits job-search products, dashboards, AI agents, and automation; third-party republication remains separately prohibited.', '2026-10-01'),
    alerts: evidence('ALLOWED', 'JOB_SEARCH_PRODUCT_USE', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'Alerts are first-party job-search product use; preserve visible Himalayas attribution and the original listing link.', '2026-10-01'),
    seo_index: evidence('ALLOWED', 'FIRST_PARTY_ORGANIC_INDEXING_WITH_ATTRIBUTION', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'A first-party CVitae public job-search page may be indexed with visible Himalayas attribution and linkback. JobPosting, Google Jobs and third-party distribution remain denied.', '2026-10-03'),
    google_jobs: evidence('DENIED', 'THIRD_PARTY_JOB_AGGREGATOR_PROHIBITED', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'Official documentation prohibits submitting Himalayas listings to third-party sites, explicitly including Google Jobs.', '2026-10-01'),
    third_party_distribution: evidence('DENIED', 'THIRD_PARTY_JOB_AGGREGATOR_PROHIBITED', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'Official documentation prohibits submission to third-party sites including Jooble, Neuvoo, Google Jobs, and LinkedIn Jobs.', '2026-10-01'),
    application_routing: evidence('ALLOWED', 'PRESERVE_ORIGINAL_HIMALAYAS_LINK', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'Keep and expose the original Himalayas listing/application link as the source destination.', '2026-10-01'),
    attribution_requirement: evidence('ALLOWED', 'ATTRIBUTION_AND_LINKBACK_REQUIRED', 'OFFICIAL_API_DOCUMENTATION', 'https://himalayas.app/api', 'Visible Himalayas attribution and linkback to the original listing are mandatory conditions.', '2026-10-01'),
  },
  computrabajo: {
    collect: evidence('DENIED', 'AUTOMATED_ACCESS_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://py.computrabajo.com/avisolegal/', 'The official Paraguay notice prohibits access or reading through robots/automated programs and expressly prohibits Robot/Crawler copying.', '2026-10-01'),
    detail_fetch: evidence('DENIED', 'AUTOMATED_ACCESS_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://py.computrabajo.com/avisolegal/', 'The official Paraguay notice prohibits software/scripts and automated reading/copying of site content.', '2026-10-01'),
    catalog: evidence('DENIED', 'CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED', 'OFFICIAL_LEGAL_NOTICE', 'https://py.computrabajo.com/avisolegal/', 'Reproduction and distribution of site content requires authorization; automated copying is expressly prohibited.', '2026-10-01'),
    matching: evidence('UNKNOWN', 'MATCHING_PERMISSION_NOT_EXPLICITLY_ADDRESSED', 'OFFICIAL_LEGAL_NOTICE_REVIEW', 'https://py.computrabajo.com/avisolegal/', 'The reviewed terms do not establish permission for internal or candidate-facing matching; no authorization is inferred.', '2026-10-01'),
    alerts: evidence('DENIED', 'CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED', 'OFFICIAL_LEGAL_NOTICE', 'https://py.computrabajo.com/avisolegal/', 'Alerts reproduce/distribute site content; the official notice requires authorization and prohibits automated copying.', '2026-10-01'),
    seo_index: evidence('DENIED', 'CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED', 'OFFICIAL_LEGAL_NOTICE', 'https://py.computrabajo.com/avisolegal/', 'Indexing copied listing content would reproduce/distribute content without the authorization required by the official notice.', '2026-10-01'),
    google_jobs: evidence('DENIED', 'THIRD_PARTY_DISTRIBUTION_NOT_AUTHORIZED', 'OFFICIAL_LEGAL_NOTICE', 'https://py.computrabajo.com/avisolegal/', 'Third-party listing distribution requires authorization; no Google Jobs authorization is evidenced.', '2026-10-01'),
    third_party_distribution: evidence('DENIED', 'CONTENT_REPRODUCTION_DISTRIBUTION_RESTRICTED', 'OFFICIAL_LEGAL_NOTICE', 'https://py.computrabajo.com/avisolegal/', 'The official notice requires authorization for reproduction/distribution of content.', '2026-10-01'),
    application_routing: evidence('UNKNOWN', 'APPLICATION_ROUTING_NOT_EVIDENCED', 'OFFICIAL_LEGAL_NOTICE_REVIEW', 'https://py.computrabajo.com/avisolegal/', 'The reviewed notice does not establish a CVitae application-routing permission or condition.', '2026-10-01'),
    attribution_requirement: evidence('UNKNOWN', 'ATTRIBUTION_REQUIREMENT_NOT_EVIDENCED', 'OFFICIAL_LEGAL_NOTICE_REVIEW', 'https://py.computrabajo.com/avisolegal/', 'No attribution or linkback requirement was established by the reviewed notice; permission is not inferred.', '2026-10-01'),
  },
  remotive: {
    collect: evidence('ALLOWED', 'PUBLIC_API_USE_DOCUMENTED', 'OFFICIAL_API_TERMS', 'https://remotive.com/remote-jobs/api', 'Public API use is permitted subject to attribution, linkback, and the terms.'),
    detail_fetch: evidence('NOT_APPLICABLE', 'API_RECORD_HAS_NO_SEPARATE_DETAIL_FETCH', 'OFFICIAL_API_CONTRACT', 'https://remotive.com/remote-jobs/api', 'The consumed API record is the detail payload; no separate detail fetch is used.'),
    catalog: evidence('ALLOWED', 'ATTRIBUTION_AND_LINKBACK_REQUIRED', 'OFFICIAL_API_TERMS', 'https://remotive.com/remote-jobs/api', 'Permitted only with source attribution and linkback; not gated for signups.'),
    matching: evidence('ALLOWED', 'ATTRIBUTION_AND_LINKBACK_REQUIRED', 'OFFICIAL_API_TERMS', 'https://remotive.com/remote-jobs/api', 'Permitted only with source attribution and linkback.'),
    alerts: evidence('ALLOWED', 'ATTRIBUTION_AND_LINKBACK_REQUIRED', 'OFFICIAL_API_TERMS', 'https://remotive.com/remote-jobs/api', 'Permitted only with source attribution and linkback.'),
    google_jobs: evidence('DENIED', 'THIRD_PARTY_JOB_PLATFORM_RESTRICTED', 'OFFICIAL_API_TERMS', 'https://remotive.com/remote-jobs/api', 'Terms prohibit submission to third-party job platforms including Google Jobs.'),
    third_party_distribution: evidence('DENIED', 'THIRD_PARTY_JOB_PLATFORM_RESTRICTED', 'OFFICIAL_API_TERMS', 'https://remotive.com/remote-jobs/api', 'Terms prohibit redistribution to third-party job platforms.'),
    application_routing: evidence('ALLOWED', 'SOURCE_APPLICATION_LINK_REQUIRED', 'OFFICIAL_API_TERMS', 'https://remotive.com/remote-jobs/api', 'Route to the source application URL; preserve the source link.'),
    attribution_requirement: evidence('ALLOWED', 'ATTRIBUTION_REQUIRED', 'OFFICIAL_API_TERMS', 'https://remotive.com/remote-jobs/api', 'Attribution and linkback are mandatory conditions.'),
  },
  weworkremotely: {
    collect: evidence('DENIED', 'JOB_SEARCH_SERVICE_USE_PROHIBITED', 'OFFICIAL_API_TERMS', 'https://weworkremotely.com/api-terms-and-guidelines', 'Terms expressly prohibit using API or any WWR data to build a job advertising or job search service; no separate official RSS grant for CVitae use was evidenced.'),
    detail_fetch: evidence('DENIED', 'DETAIL_HTML_NOT_COVERED_BY_RSS_PERMISSION', 'OFFICIAL_API_TERMS', 'https://weworkremotely.com/api-terms-and-guidelines', 'Feed permission does not authorize detail-page scraping/storage; obtain written permission before use.'),
    catalog: evidence('DENIED', 'JOB_SEARCH_SERVICE_USE_PROHIBITED', 'OFFICIAL_API_TERMS', 'https://weworkremotely.com/api-terms-and-guidelines', 'Terms prohibit using API or WWR data to build a job advertising or job search service.'),
    matching: evidence('DENIED', 'JOB_SEARCH_SERVICE_USE_PROHIBITED', 'OFFICIAL_API_TERMS', 'https://weworkremotely.com/api-terms-and-guidelines', 'Candidate-facing opportunity matching is part of a job search service; exact CVitae use requires publisher confirmation.'),
    alerts: evidence('DENIED', 'JOB_SEARCH_SERVICE_USE_PROHIBITED', 'OFFICIAL_API_TERMS', 'https://weworkremotely.com/api-terms-and-guidelines', 'Job alert distribution from WWR data would serve the prohibited job search service.'),
    seo_index: evidence('DENIED', 'JOB_SEARCH_DESTINATION_REPLICATION_PROHIBITED', 'OFFICIAL_API_TERMS', 'https://weworkremotely.com/api-terms-and-guidelines', 'Terms prohibit using the data for a destination/search service for WWR job content.'),
    application_routing: evidence('ALLOWED', 'APPLICATION_MUST_ROUTE_TO_WWR', 'OFFICIAL_API_TERMS', 'https://weworkremotely.com/api-terms-and-guidelines', 'Terms require application to route through weworkremotely.com; this is a routing condition, not reuse permission.'),
    attribution_requirement: evidence('ALLOWED', 'APPLICATION_ROUTING_CONDITION', 'OFFICIAL_API_TERMS', 'https://weworkremotely.com/api-terms-and-guidelines', 'Terms specify the source interface must not be bypassed for applications; no broader distribution permission inferred.'),
  },
  jobicy: {
    collect: evidence('ALLOWED', 'PUBLIC_API_PRODUCT_USE_DOCUMENTED', 'OFFICIAL_API_DOCUMENTATION', 'https://jobicy.com/jobs-rss-feed', 'Official API documentation (updated 2026-09-16) permits normal API integrations in own products without individual approval; polling must not exceed once per hour.'),
    detail_fetch: evidence('NOT_APPLICABLE', 'API_RECORD_HAS_NO_SEPARATE_DETAIL_FETCH', 'OFFICIAL_API_CONTRACT', 'https://jobicy.com/jobs-rss-feed', 'Current local acquisition uses API records; official guidance says preserve canonical Jobicy URL and attribution.'),
    catalog: evidence('ALLOWED', 'OWN_PRODUCT_LISTING_USE_DOCUMENTED', 'OFFICIAL_API_DOCUMENTATION', 'https://jobicy.com/jobs-rss-feed', 'Documentation expressly covers job boards and user-facing products; preserve Jobicy as original source and canonical URL.'),
    matching: evidence('ALLOWED', 'OWN_PRODUCT_LISTING_USE_DOCUMENTED', 'OFFICIAL_API_DOCUMENTATION', 'https://jobicy.com/jobs-rss-feed', 'Career tools and AI assistants are named normal integrations; preserve attribution and source URL.'),
    alerts: evidence('ALLOWED', 'OWN_PRODUCT_LISTING_USE_DOCUMENTED', 'OFFICIAL_API_DOCUMENTATION', 'https://jobicy.com/jobs-rss-feed', 'Newsletters are expressly named; alert emails must preserve source attribution and canonical listing URL.'),
    application_routing: evidence('ALLOWED', 'CANONICAL_SOURCE_URL_REQUIRED', 'OFFICIAL_API_DOCUMENTATION', 'https://jobicy.com/jobs-rss-feed', 'Preserve and route through the canonical Jobicy job URL; direct ATS URLs require the documented access mode.'),
    attribution_requirement: evidence('ALLOWED', 'SOURCE_ATTRIBUTION_REQUIRED', 'OFFICIAL_API_DOCUMENTATION', 'https://jobicy.com/jobs-rss-feed', 'Listings must not be presented as original CVitae postings; retain attribution and canonical Jobicy URL.'),
  },
  arbeitnow: {
    collect: evidence('ALLOWED', 'API_USE_WITH_LINKBACK', 'OFFICIAL_TERMS', 'https://www.arbeitnow.com/terms', 'Official terms permit API data use with required linkback; this is limited to the documented API.'),
    attribution_requirement: evidence('ALLOWED', 'LINKBACK_REQUIRED', 'OFFICIAL_TERMS', 'https://www.arbeitnow.com/terms', 'Linkback is a required condition for API use.'),
  },
  impactpool: {
    collect: evidence('UNKNOWN', 'ACQUISITION_METHOD_PERMISSION_UNRESOLVED', 'OFFICIAL_TERMS_AND_REPOSITORY_SOURCE_PROFILE', 'https://www.impactpool.org/signup/terms; docs/source-permission-matrix.md#Impactpool', 'Terms prohibit unauthorized scraping/extraction, but repository describes API/listing acquisition and does not establish whether the current method is covered by a license.'),
    detail_fetch: evidence('UNKNOWN', 'DETAIL_FETCH_PERMISSION_NOT_EVIDENCED', 'REPOSITORY_SOURCE_PROFILE', 'docs/source-permission-matrix.md#Impactpool', 'No affirmative detail-fetch method/license is documented.'),
    catalog: evidence('DENIED', 'REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED', 'OFFICIAL_TERMS', 'https://www.impactpool.org/signup/terms', 'Reproduction/distribution requires permission.'),
    matching: evidence('UNKNOWN', 'MATCHING_USE_NOT_EVIDENCED', 'OFFICIAL_TERMS', 'https://www.impactpool.org/signup/terms', 'Terms restrict scraping and public reproduction; they do not expressly resolve internal matching use for the observed acquisition method.'),
    alerts: evidence('DENIED', 'REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED', 'OFFICIAL_TERMS', 'https://www.impactpool.org/signup/terms', 'Use of extracted platform content for alerts is not licensed by repo evidence.'),
    seo_index: evidence('DENIED', 'REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED', 'OFFICIAL_TERMS', 'https://www.impactpool.org/signup/terms', 'Public redistribution/indexing is not licensed by repo evidence.'),
    google_jobs: evidence('DENIED', 'REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED', 'OFFICIAL_TERMS', 'https://www.impactpool.org/signup/terms', 'Third-party distribution is not licensed by repo evidence.'),
    third_party_distribution: evidence('DENIED', 'REPRODUCTION_WITHOUT_PERMISSION_PROHIBITED', 'OFFICIAL_TERMS', 'https://www.impactpool.org/signup/terms', 'Third-party distribution is not licensed by repo evidence.'),
  },
  fundacion_carolina: {
    collect: evidence('DENIED', 'EXTRACTION_WITHOUT_AUTHORIZATION_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://www.fundacioncarolina.es/aviso-legal/', 'Extraction/reuse is reserved absent legal basis or written authorization.'),
    detail_fetch: evidence('DENIED', 'EXTRACTION_WITHOUT_AUTHORIZATION_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://www.fundacioncarolina.es/aviso-legal/', 'No detail extraction permission is evidenced.'),
    catalog: evidence('DENIED', 'REPRODUCTION_WITHOUT_AUTHORIZATION_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://www.fundacioncarolina.es/aviso-legal/', 'Reproduction/distribution requires authorization.'),
    matching: evidence('DENIED', 'REPRODUCTION_WITHOUT_AUTHORIZATION_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://www.fundacioncarolina.es/aviso-legal/', 'Use of extracted content is not authorized by repository evidence.'),
    alerts: evidence('DENIED', 'REPRODUCTION_WITHOUT_AUTHORIZATION_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://www.fundacioncarolina.es/aviso-legal/', 'Use of extracted content is not authorized by repository evidence.'),
    seo_index: evidence('DENIED', 'REUSE_WITHOUT_AUTHORIZATION_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://www.fundacioncarolina.es/aviso-legal/', 'Public reuse/indexing is not authorized absent permission.'),
    google_jobs: evidence('DENIED', 'REUSE_WITHOUT_AUTHORIZATION_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://www.fundacioncarolina.es/aviso-legal/', 'Third-party distribution is not authorized absent permission.'),
    third_party_distribution: evidence('DENIED', 'REUSE_WITHOUT_AUTHORIZATION_PROHIBITED', 'OFFICIAL_LEGAL_NOTICE', 'https://www.fundacioncarolina.es/aviso-legal/', 'Third-party distribution is not authorized absent permission.'),
  },
}

const profiles = (registry as any).sources as Array<{ canonical_source: string; emitted_aliases: string[] }>
const permissionRegistry: SourcePermissionRow[] = profiles.map(profile => {
  const source = profile.canonical_source
  const dimensions = Object.fromEntries(SOURCE_PERMISSION_DIMENSIONS.map(dimension => [dimension, explicit[source]?.[dimension] || unknown(source, dimension)])) as Record<SourcePermissionDimension, SourcePermissionDecision>
  return { canonical_source: source, emitted_aliases: [...new Set([source, ...(profile.emitted_aliases || [])])].sort(), dimensions }
})
const byIdentity = new Map<string, string>()
for (const row of permissionRegistry) for (const alias of row.emitted_aliases) {
  const previous = byIdentity.get(alias)
  if (previous && previous !== row.canonical_source) throw new Error(`SOURCE_PERMISSION_CONFLICT:${alias}:${previous}:${row.canonical_source}`)
  byIdentity.set(alias, row.canonical_source)
}

export function canonicalPermissionSource(raw: string | null | undefined): string {
  const key = String(raw || '').trim().toLowerCase()
  return byIdentity.get(key) || key
}
export function canonicalSourcePermissionRegistry(): SourcePermissionRow[] { return permissionRegistry }
export function sourcePermissionTruth(raw: string | null | undefined, consumer: SourcePermissionConsumer): SourcePermissionConsumerDecision {
  const source = canonicalPermissionSource(raw)
  const dimension: SourcePermissionDimension = consumer === 'seo' ? 'seo_index' : consumer
  const decision = sourcePermissionDimensionTruth(source, dimension)
  return decision.state === 'NOT_APPLICABLE' ? { ...decision, state: 'UNKNOWN', reason: 'SOURCE_PERMISSION_NOT_APPLICABLE_TO_CONSUMER' } : decision as SourcePermissionConsumerDecision
}
export function sourcePermissionDimensionTruth(raw: string | null | undefined, dimension: SourcePermissionDimension): SourcePermissionDecision {
  const source = canonicalPermissionSource(raw)
  return permissionRegistry.find(row => row.canonical_source === source)?.dimensions[dimension] ?? unknown(source || 'unknown', dimension)
}
export function canonicalSourcePermissionRows() {
  return permissionRegistry.map(row => ({ ...row, permissions: Object.fromEntries((['catalog', 'matching', 'alerts', 'seo_index'] as const).map(consumer => [consumer === 'seo_index' ? 'seo' : consumer, row.dimensions[consumer]])) }))
}

export function sourcePermissionCoverage() {
  const resolved = (row: SourcePermissionRow) => SOURCE_PERMISSION_DIMENSIONS.filter(key => row.dimensions[key].state !== 'UNKNOWN').length
  const fully = permissionRegistry.filter(row => resolved(row) === SOURCE_PERMISSION_DIMENSIONS.length).length
  const partial = permissionRegistry.filter(row => resolved(row) > 0 && resolved(row) < SOURCE_PERMISSION_DIMENSIONS.length).length
  const permissionDimensions = Object.fromEntries(SOURCE_PERMISSION_DIMENSIONS.map(dimension => [dimension, Object.fromEntries((['ALLOWED','DENIED','UNKNOWN','NOT_APPLICABLE'] as SourcePermissionState[]).map(state => [state, permissionRegistry.filter(row => row.dimensions[dimension].state === state).length]))]))
  return { canonical_sources_total: permissionRegistry.length, fully_resolved_sources: fully, partially_resolved_sources: partial, unknown_sources: permissionRegistry.length - fully - partial,
    permission_dimensions: permissionDimensions,
    per_source: permissionRegistry.map(row => ({ canonical_source: row.canonical_source, unknown_dimensions: SOURCE_PERMISSION_DIMENSIONS.filter(dimension => row.dimensions[dimension].state === 'UNKNOWN') })) }
}
