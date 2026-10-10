import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')
const presentation = read('src/components/cvitae/OpportunityPresentation.tsx')
const analytics = read('src/lib/analytics.ts')
const workspace = read('src/hub/ApplicationWorkspace.tsx')
const jobDetail = read('src/pages/JobDetail.tsx')
const opportunityDetail = read('src/pages/OpportunityDetail.tsx')
const intent = read('src/lib/application-intent.ts')
const authCallback = read('src/pages/AuthCallback.tsx')
const recruiters = read('src/pages/Recruiters.tsx')

const required = (source: string, marker: string, label: string) => {
  if (!source.includes(marker)) throw new Error(`${label}: missing ${marker}`)
}

for (const [raw, label] of [['full_time', 'Tiempo completo'], ['part_time', 'Medio tiempo'], ['contract', 'Contrato'], ['temporary', 'Temporal'], ['internship', 'Pasantía'], ['volunteer', 'Voluntariado'], ['consultancy', 'Consultoría'], ['other', 'Otro']] as const) {
  required(presentation, `${raw}: '${label}'`, `employment formatter ${raw}`)
}
required(presentation, "label === 'Fecha límite' || label === 'Inicio'", 'start/deadline date formatter')
required(presentation, 'formatOpportunityDate', 'timezone-safe date helper')
required(presentation, 'Date.UTC', 'date-only calendar preservation')
required(presentation, "timeZone: 'UTC'", 'date-only UTC formatting')
required(presentation, 'analytics.prepareClicked', 'CTA prepare event')
required(presentation, 'encodeURIComponent(slug)', 'exact CTA slug')
if ((jobDetail.match(/<OpportunityApplicationCta slug=\{job\.slug\} \{\.\.\.context\}\/>/g) || []).length !== 2) throw new Error('JobDetail desktop/mobile CTA context is incomplete')
if ((opportunityDetail.match(/<OpportunityApplicationCta slug=\{item\.slug\} \{\.\.\.context\}\/>/g) || []).length !== 2) throw new Error('OpportunityDetail desktop/mobile CTA context is incomplete')
required(jobDetail, "opportunityKind:job.opportunity_kind||job.opportunity_type", 'JobDetail CTA opportunity kind')
required(opportunityDetail, "opportunityKind:item.opportunity_kind||item.opportunity_type", 'OpportunityDetail CTA opportunity kind')

for (const event of ['opportunity_viewed', 'prepare_clicked', 'application_workspace_opened', 'profile_ready', 'preparation_completed', 'apply_clicked']) required(analytics, event, `analytics event ${event}`)
for (const event of ['b2b_session_started','b2b_vacancy_created','b2b_applicants_viewed','b2b_batch_completed','b2b_recruiter_action','b2b_credit_intent']) required(analytics,event,`B2B funnel event ${event}`)
required(analytics, "readConsent()?.analytics === true", 'analytics consent gate')
required(workspace, 'prepared_version_id', 'factual preparation state')
required(workspace, 'analytics.workspaceOpened', 'workspace opened event')
required(workspace, 'analytics.preparationCompleted', 'preparation completed event')
required(workspace, 'const preparedWorkspaceId = payload.workspaceId || selectedWorkspace?.id || payload.accepted?.workspace_id', 'exact preparation workspace identity')
required(workspace, 'item.id === preparedWorkspaceId && item.prepared_version_id', 'preparation completion factual transition')
required(workspace, 'trackedWorkspaceOpen', 'workspace event dedupe')
required(workspace, "surface: 'application_workspace'", 'workspace apply surface')
required(workspace, 'analytics.profileReady(opportunityAnalyticsContext(selectedWorkspace))', 'profile opportunity context')
required(workspace, 'const trackedProfileReady = useRef(new Set<string>())', 'profile per-workspace dedupe')
required(workspace, 'trackedProfileReady.current.has(selectedWorkspace.id)', 'profile workspace identity')
required(workspace, 'trackedProfileReady.current.add(selectedWorkspace.id)', 'profile workspace marking')
required(workspace, "route_family: 'application_auth'", 'application auth context')
required(workspace, 'analytics.authStarted', 'auth started event')
required(intent, '/mi-carrera/postular/', 'application return intent')
required(authCallback, 'consumeApplicationReturnTo', 'auth return intent consumption')
required(authCallback, 'analytics.authCompleted', 'auth completed event')
required(authCallback, "if (returnTo)", 'auth only for application intent')
required(jobDetail, "surface:'public_detail'", 'JobDetail direct apply surface')
required(opportunityDetail, "surface:'public_detail'", 'OpportunityDetail direct apply surface')
for (const marker of ['analytics.b2bLeadSent','analytics.b2bSessionStarted','analytics.b2bVacancyCreated','analytics.b2bApplicantsViewed','analytics.b2bBatchCompleted','analytics.b2bRecruiterAction','analytics.b2bCreditIntent']) required(recruiters,marker,`B2B instrumentation ${marker}`)
if (/b2bLeadSent:\s*\(company|b2b_[a-z_]+[^\n]*\{[^\n]*company/.test(analytics)) throw new Error('B2B analytics must not send company names')
required(analytics, 'revenue: 0', 'credit request is intent, never fabricated revenue')

for (const file of ['src/components/cvitae/OpportunityPresentation.tsx', 'src/hub/ApplicationWorkspace.tsx']) {
  if (/window\.gtag/.test(read(file))) throw new Error(`${file}: direct gtag call bypasses shared analytics`)
}
if (/(email|phone|cv_text|cover_letter|requirements)\s*:/.test(analytics)) throw new Error('analytics wrapper contains a prohibited PII/content parameter')

console.log('verify_conversion_analytics_item56: PASS')
