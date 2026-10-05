import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildDictionary, normalize, toStrings } from '../_shared/matching.ts';
import { isPotentialDiscoveryDecision, isVisibleMatchDecision, rankOpportunitiesV2, V2_PRESET_FULL } from '../_shared/matching-v2.ts';
import { parsePgVector } from '../_shared/vector.ts';
import { EDGE_SOURCE_IDENTITIES } from '../_shared/generated-source-registry.ts';
import { classifyMatchingCoverage } from '../../../src/lib/matching-coverage.ts';
import { matchingProfileSignature } from '../../../shared/matching-profile-signature.ts';
import { canonicalCandidateProfile } from '../../../shared/candidate-profile.ts';
import { buildCanonicalSourcePolicyIndex, classifyBackgroundCoverage, mergeRetrievalSimilarities, normalizeSourcePolicyRow, opportunityCacheIsCurrent, retrievalCacheIsCurrent, sourceMatchingAllowed, sourcePolicyFor, sourcePolicySignature, unionRetrievalLanes } from '../../../shared/matching-retrieval.ts';
const DEFAULT_SITE_URL = 'https://cvitae.lat';
const canonicalSource = (raw: unknown) => {
  const source = String(raw || '').trim().toLowerCase()
  const profile = EDGE_SOURCE_IDENTITIES.find((item) => item.canonical_source === source || item.emitted_aliases.includes(source))
  return profile?.canonical_source || source
}
const LOCAL_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:8888',
  'http://localhost:8888',
  'http://127.0.0.1:3000',
  'http://localhost:3000'
]);
function configuredOrigins() {
  const origins = new Set(LOCAL_ORIGINS);
  origins.add(DEFAULT_SITE_URL);
  for (const value of [
    Deno.env.get('SITE_URL'),
    Deno.env.get('URL')
  ]){
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch  {}
  }
  return origins;
}
function requestCors(req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = origin && configuredOrigins().has(origin) ? origin : DEFAULT_SITE_URL;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  };
}
function originAllowed(req) {
  const origin = req.headers.get('Origin') || '';
  return !origin || configuredOrigins().has(origin);
}
async function hashedRateLimitSubject(scope, subject) {
  const salt = Deno.env.get('CVITAE_RATE_LIMIT_SALT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!salt) throw new Error('Rate limit salt is not configured');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${scope}:${subject}`));
  return [
    ...new Uint8Array(digest)
  ].map((byte)=>byte.toString(16).padStart(2, '0')).join('');
}
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
async function getSkillDictionary() {
  const { data } = await supabase.from('skill_dictionary').select('canonical_name, variants');
  const extra = [];
  for (const row of data ?? []){
    const canonical = String(row.canonical_name ?? '').trim();
    if (!canonical) continue;
    const variants = Array.isArray(row.variants) ? row.variants.map(String) : [];
    extra.push([
      canonical,
      variants
    ]);
  }
  return buildDictionary(extra);
}
async function persistMatchingDiagnostics(snapshot) {
  try {
    const { data, error } = await supabase.from('matching_diagnostic_snapshots').insert(snapshot).select('id').single()
    if (error) console.error('matching diagnostics unavailable:', error.message)
    return data?.id ?? null
  } catch (error) {
    console.error('matching diagnostics unavailable:', error?.message ?? error)
    return null
  }
}
function reasonCounts(decisions) {
  const counts = {}
  for (const { decision } of decisions) {
    for (const reason of [...decision.hard_denials, ...decision.unknown_reasons, ...decision.negative_reasons]) {
      counts[reason] = (counts[reason] ?? 0) + 1
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 12))
}
Deno.serve(async (req)=>{
  const cors = requestCors(req);
  if (!originAllowed(req)) {
    return new Response(JSON.stringify({
      error: 'Origen no permitido'
    }), {
      status: 403,
      headers: cors
    });
  }
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: cors
  });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: cors
    });
  }
  let activeUserId = null;
  let activeRequestMode = 'default';
  try {
    const requestBody = await req.json().catch(()=>({}));
    const requestMode = requestBody?.mode === 'alerts' ? 'alerts' : 'default';
    activeRequestMode = requestMode;
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Sesión inválida o expirada'
      }), {
        status: 401,
        headers: cors
      });
    }
    const scope = 'b2c-opportunity-matching';
    const { data: rateRows, error: rateError } = await supabase.rpc('consume_api_rate_limit', {
      p_scope: scope,
      p_subject_hash: await hashedRateLimitSubject(scope, user.id),
      p_limit: 30,
      p_window_seconds: 60 * 60
    });
    if (rateError) {
      console.error('match-batch rate limit unavailable:', rateError.message);
      return new Response(JSON.stringify({
        error: 'El servicio está temporalmente ocupado.'
      }), {
        status: 503,
        headers: cors
      });
    }
    const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;
    if (!rate?.allowed) {
      return new Response(JSON.stringify({
        error: 'Alcanzaste el límite temporal de actualizaciones.'
      }), {
        status: 429,
        headers: {
          ...cors,
          'Retry-After': String(rate?.retry_after_seconds || 60),
          'X-RateLimit-Remaining': '0'
        }
      });
    }
    const { data: profile, error: profileError } = await supabase.from('user_master_profiles').select('professional_title,summary,cv_text,profile_data,is_subscribed,match_alerts_enabled,embedding,updated_at').eq('user_id', user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return new Response(JSON.stringify({
        matches: [],
        profileSkills: [],
        missingSkills: [],
        is_subscribed: false,
        match_alerts_enabled: false,
        reason: 'profile_missing'
      }), {
        headers: cors
      });
    }
    const candidate = canonicalCandidateProfile(profile);
    const profileSignature = matchingProfileSignature(profile);
    const [{ data: allSourcePolicies, error: allSourcePoliciesError }, { data: sourcePermissions, error: sourcePermissionError }] = await Promise.all([
      supabase.rpc('get_source_distribution_policy'),
      supabase.from('opportunity_source_consumer_permissions').select('canonical_source,consumer,permission_state').eq('consumer', 'matching'),
    ]);
    if (allSourcePoliciesError) throw allSourcePoliciesError;
    if (sourcePermissionError) throw sourcePermissionError;
    const sourcePolicyRows = (allSourcePolicies ?? []).map(normalizeSourcePolicyRow);
    const sourcePolicyIndex = buildCanonicalSourcePolicyIndex(sourcePolicyRows, EDGE_SOURCE_IDENTITIES, canonicalSource);
    const currentSourcePolicySignature = await sourcePolicySignature(sourcePolicyRows, canonicalSource, sourcePermissions ?? []);
    const { data: retrievalState } = await supabase.from('matching_retrieval_states').select('*').eq('user_id', user.id).maybeSingle();
    const backgroundCoverageStatus = classifyBackgroundCoverage(retrievalState, profileSignature, currentSourcePolicySignature);
    let backgroundCandidateRows = [];
    if (retrievalState && retrievalCacheIsCurrent({ profile_signature: retrievalState.profile_signature }, retrievalState, profileSignature, currentSourcePolicySignature)) {
      const { data, error } = await supabase.from('matching_retrieval_candidates').select('opportunity_id,candidate_class,profile_signature,opportunity_content_fingerprint,score_snapshot,semantic_similarity,reason_codes,retrieval_lanes,evaluation_lane,evaluated_at')
        .eq('user_id', user.id).eq('profile_signature', profileSignature).order('candidate_class', { ascending: true }).order('score_snapshot', { ascending: false, nullsFirst: false }).order('evaluated_at', { ascending: false }).limit(300);
      if (error) console.error('background retrieval cache unavailable:', error.message);
      else backgroundCandidateRows = data ?? [];
    }
    const profileSkills = toStrings(candidate.profile_data.habilidades);
    const profileSeniority = candidate.profile_data.seniority;
    const profileLocation = candidate.profile_data.location;
    const careerRoute = candidate.profile_data.career_route;
    const profileTitle = String(profile.professional_title ?? '');
    const dictionary = await getSkillDictionary();
    const opportunityFields = 'id, slug, title, organization, location, rubro, tags, description, application_url, type, opportunity_type, opportunity_kind, remote, remote_scope, eligible_countries, eligible_regions, citizenship_requirement, residency_requirement, source, deadline, created_at, updated_at, content_fingerprint, is_active, verification_status, match_eligible, alerts_eligible, archived_at, deleted_at, universe_final_matching_state, universe_alerts_state';
    const consumerUniverse = requestMode === 'alerts' ? 'opportunity_alert_universe' : 'opportunity_final_matching_universe';
    let opportunitiesQuery = supabase.from(consumerUniverse).select(opportunityFields).order('created_at', {
      ascending: false
    }).limit(300);
    const { data: recentOpportunities, error: opportunitiesError } = await opportunitiesQuery;
    if (opportunitiesError) throw opportunitiesError;
    const profileInput = {
      professional_title: candidate.professional_title,
      summary: candidate.summary,
      cv_text: candidate.cv_text,
      profile_data: {
        habilidades: profileSkills,
        seniority: profileSeniority,
        location: profileLocation,
        career_route: careerRoute,
        modality: candidate.profile_data.modality,
        education: candidate.profile_data.education,
        experience: candidate.profile_data.experience,
        languages: candidate.profile_data.languages,
        candidate_truth: candidate.profile_data.candidate_truth,
        candidate_eligibility: candidate.profile_data.candidate_eligibility,
      }
    };
    const profileText = [
      profileTitle,
      profileSeniority,
      profileSkills.join(', '),
      careerRoute,
      profileLocation
    ].filter(Boolean).join(' | ');
    // Use cached embedding from DB — never call gte-small at match time (CPU limit)
    // embed-profile Edge Function generates and caches it; match-batch triggers it in background for new users
    const embedding = parsePgVector(profile.embedding);
    if (!embedding) {
      // Fire embed-profile in background — user gets keyword results now, semantic on next call
      // @ts-ignore EdgeRuntime is Supabase Edge Runtime global
      EdgeRuntime.waitUntil(
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/embed-profile`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: user.id }),
        }).catch(() => {})
      );
    }
    const similarities = new Map();
    let semanticRetrievalCount = 0;
    let opportunities = recentOpportunities ?? [];
    const semanticHydratedOpportunities = [];
    if (embedding) {
      const { data: vectorMatches, error: vectorError } = await supabase.rpc('match_opportunities', {
        query_embedding: embedding,
        match_threshold: 0.10,
        match_count: 120
      });
      if (vectorError) {
        console.error('vector matching unavailable:', vectorError.message);
      } else {
        semanticRetrievalCount = (vectorMatches ?? []).length
        for (const item of vectorMatches ?? []){
          similarities.set(String(item.id), Number(item.similarity ?? 0));
        }
        // The primary query caps the newest catalog rows at 300. Hydrate vector
        // hits outside that window so older relevant opportunities can rank.
        const loadedIds = new Set(opportunities.map((item)=>String(item.id)));
        const missingSemanticIds = (vectorMatches ?? []).map((item)=>String(item.id)).filter((id)=>id && !loadedIds.has(id));
        if (missingSemanticIds.length) {
          const semanticQuery = supabase.from(consumerUniverse).select(opportunityFields).in('id', missingSemanticIds);
          const { data: semanticOpportunities, error: semanticError } = await semanticQuery;
          if (semanticError) {
            console.error('semantic opportunity hydration unavailable:', semanticError.message);
          } else if (semanticOpportunities?.length) {
            semanticHydratedOpportunities.push(...semanticOpportunities);
          }
        }
      }
    }
    let backgroundHydratedOpportunities = [];
    const backgroundSemanticSimilarities = new Map();
    const backgroundIds = backgroundCandidateRows.map((row) => String(row.opportunity_id)).filter(Boolean);
    if (backgroundIds.length) {
      let backgroundQuery = supabase.from(requestMode === 'alerts' ? 'opportunity_alert_universe' : 'opportunity_final_matching_universe').select(opportunityFields).in('id', backgroundIds);
      if (requestMode === 'alerts') backgroundQuery = backgroundQuery.eq('universe_alerts_state', 'READY');
      const { data: currentRows, error: backgroundError } = await backgroundQuery;
      if (backgroundError) console.error('background opportunity hydration unavailable:', backgroundError.message);
      else {
        const currentById = new Map((currentRows ?? []).map((row) => [String(row.id), row]));
        backgroundHydratedOpportunities = backgroundCandidateRows.flatMap((cached) => {
          const current = currentById.get(String(cached.opportunity_id));
          if (!current || !opportunityCacheIsCurrent(cached, current)) return [];
          if (cached.semantic_similarity != null) backgroundSemanticSimilarities.set(String(current.id), Number(cached.semantic_similarity));
          return [{ ...current, _retrieval_lane: cached.candidate_class === 'MATCH' ? 'BACKGROUND_MATCH' : 'BACKGROUND_POTENTIAL' }];
        });
      }
    }
    const mergedSimilarities = mergeRetrievalSimilarities(backgroundSemanticSimilarities, similarities);
    similarities.clear();
    for (const [id, similarity] of mergedSimilarities) similarities.set(id, similarity);
    opportunities = unionRetrievalLanes([
      { lane: 'RECENT', rows: recentOpportunities ?? [] },
      { lane: 'SEMANTIC', rows: semanticHydratedOpportunities },
      { lane: 'BACKGROUND_MATCH', rows: backgroundHydratedOpportunities.filter((row) => row._retrieval_lane === 'BACKGROUND_MATCH') },
      { lane: 'BACKGROUND_POTENTIAL', rows: backgroundHydratedOpportunities.filter((row) => row._retrieval_lane === 'BACKGROUND_POTENTIAL') },
    ]).map(({ opportunity, lanes }) => ({ ...opportunity, _retrieval_lanes: [...lanes] }));
    // Default Matching requests enforce Matching source routing here. Alerts
    // have already been admitted by opportunity_alert_universe and must not
    // inherit Matching permission/switch state.
    const prePolicyCount = opportunities.length
    opportunities = opportunities
      .filter((item) => requestMode === 'alerts' || sourceMatchingAllowed(sourcePolicyFor(sourcePolicyIndex, item.source)))
      .map((item) => ({ ...item, source_match_state: 'ALLOWED' }))
    activeUserId = user.id;
    const sourceAllowedCount = opportunities.length
    const { eligible: eligibleOpportunities, rankedV2, rankedPotentialV2, potentialTotal, decisions } = rankOpportunitiesV2(profileInput, opportunities ?? [], dictionary, V2_PRESET_FULL, similarities);
    const decisionCounts = decisions.reduce((counts, item) => {
      const { decision } = item
      if (decision.outcome === 'MATCH') counts.match += 1
      if (decision.outcome === 'ABSTAIN') counts.abstain += 1
      if (decision.outcome === 'DENY') counts.deny += 1
      if (decision.eligibility === 'ELIGIBLE') counts.eligibilityEligible += 1
      if (decision.eligibility === 'UNKNOWN') counts.eligibilityUnknown += 1
      if (decision.eligibility === 'INELIGIBLE') counts.eligibilityIneligible += 1
      if (decision.professional_evidence === 'SUFFICIENT') counts.professionalEvidenceReady += 1
      if (decision.professional_evidence === 'SUFFICIENT' && decision.applicable !== 'UNKNOWN' && decision.applicable !== 'CONFLICT') counts.professionalFitKnown += 1
      return counts
    }, { match: 0, abstain: 0, deny: 0, eligibilityEligible: 0, eligibilityUnknown: 0, eligibilityIneligible: 0, professionalEvidenceReady: 0, professionalFitKnown: 0 })
    const potentialCount = potentialTotal
    const visiblePotentialCount = rankedPotentialV2.length
    const runAt = new Date().toISOString()
    const coverageState = classifyMatchingCoverage({
      runStatus: 'SUCCESS',
      uniquePolicyCandidates: prePolicyCount,
      sourceAllowed: sourceAllowedCount,
      professionalEvidenceReady: decisionCounts.professionalEvidenceReady,
      professionalFitKnown: decisionCounts.professionalFitKnown,
      eligibilityEligible: decisionCounts.eligibilityEligible,
      eligibilityUnknown: decisionCounts.eligibilityUnknown,
      eligibilityIneligible: decisionCounts.eligibilityIneligible,
      match: decisionCounts.match,
      potential: visiblePotentialCount,
    })
    // Keep the API fail-closed even if the ranker later returns non-visible
    // decisions for diagnostic purposes.
    const toClientMatch = ({ opp: item, breakdown, decision }, potential = false) => ({
        id: item.id,
        slug: item.slug ?? item.id,
        titulo: item.title ?? '',
        categoria: item.rubro ?? item.opportunity_type ?? item.type ?? 'Oportunidad',
        ubicacion: item.location ?? '',
        organization: item.organization ?? '',
        opportunityKind: item.opportunity_kind ?? item.opportunity_type ?? null,
        application_url: item.application_url ?? '',
        skillsScore: breakdown.skillsScore,
        titleScore: breakdown.titleScore,
        seniorityScore: breakdown.seniorityScore,
        locationScore: breakdown.locationScore,
        semanticScore: breakdown.semanticScore,
        finalScore: breakdown.finalScore,
        vacancySkills: breakdown.vacancySkills,
        matchedSkills: breakdown.matchedSkills,
        missingSkills: breakdown.missingSkills,
        confidence: decision.confidence,
        professionalCompatibility: decision.applicable,
        eligibilitySignal: decision.eligibility,
        matchDecision: decision,
        downstreamTrusted: !potential && decision.outcome === 'MATCH' && decision.confidence === 'HIGH' && decision.eligibility === 'ELIGIBLE',
        presentationState: potential ? 'POTENTIAL' : 'CONFIRMED',
        eligibilityPending: potential,
        source: item.source ?? ''
      })
    const ranked = rankedV2.filter(({ decision }) => isVisibleMatchDecision(decision)).map((item)=>toClientMatch(item));
    const potentialMatches = rankedPotentialV2
      .filter(({ decision }) => isPotentialDiscoveryDecision(decision))
      .map((item)=>toClientMatch(item, true));
    const missingFrequency = new Map();
    ranked.filter((match)=>match.downstreamTrusted).slice(0, 10).forEach((match, index)=>{
      match.missingSkills.forEach((skill)=>{
        const key = normalize(skill);
        const current = missingFrequency.get(key) ?? {
          skill,
          count: 0,
          score: 0
        };
        current.count += 1;
        current.score += Math.max(1, 10 - index);
        missingFrequency.set(key, current);
      });
    });
    const missingSkills = [
      ...missingFrequency.values()
    ].sort((a, b)=>b.count - a.count || b.score - a.score).slice(0, 6).map(({ skill })=>skill);
    const diagnostics = {
      run_status: 'SUCCESS', run_at: runAt,
      primary_retrieval: recentOpportunities?.length ?? 0,
      primary_retrieval_scope: 'BOUNDED_RETRIEVAL_WINDOW',
      semantic_retrieval: semanticRetrievalCount,
      semantic_retrieval_scope: 'BOUNDED_RETRIEVAL_WINDOW',
      unique_policy_candidates: prePolicyCount,
      source_allowed: sourceAllowedCount,
      professional_evidence_ready: decisionCounts.professionalEvidenceReady,
      professional_fit_known: decisionCounts.professionalFitKnown,
      eligibility_eligible: decisionCounts.eligibilityEligible,
      eligibility_unknown: decisionCounts.eligibilityUnknown,
      eligibility_ineligible: decisionCounts.eligibilityIneligible,
      match: decisionCounts.match,
      potential_scoreable_count: potentialCount,
      visible_potential_count: visiblePotentialCount,
      potential_scope: 'SAFE_SCOREABLE_TOTAL',
      visible_potential_scope: 'TOP_N_VISIBLE',
      abstain: decisionCounts.abstain,
      deny: decisionCounts.deny,
      visible_confirmed: ranked.length,
      coverage_state: coverageState,
      top_reason_codes: reasonCounts(decisions),
      background_retrieval: backgroundHydratedOpportunities.length,
      background_scan_status: backgroundCoverageStatus,
      background_examined: backgroundCoverageStatus === 'PARTIAL' ? (retrievalState?.scan_examined_count ?? 0) : (retrievalState?.examined_count ?? 0),
      background_target: backgroundCoverageStatus === 'PARTIAL' ? (retrievalState?.scan_target_count ?? 0) : (retrievalState?.target_count ?? 0),
      background_candidate_count: retrievalState?.candidate_count ?? 0,
      background_completed_at: retrievalState?.completed_at ?? null,
      total_inventory_count: retrievalState?.scan_kind === 'FULL' && retrievalState?.scan_status !== 'COMPLETE' ? null : (retrievalState?.inventory_funnel?.TOTAL_INVENTORY ?? null),
      inventory_funnel: retrievalState?.scan_kind === 'FULL' && retrievalState?.scan_status !== 'COMPLETE' ? {} : (retrievalState?.inventory_funnel ?? {}),
      inventory_funnel_at: retrievalState?.inventory_funnel_at ?? null,
    }
    const diagnosticSnapshotId = await persistMatchingDiagnostics({
      user_id: user.id, run_at: runAt, run_status: 'SUCCESS', request_mode: requestMode,
      profile_updated_at: profile.updated_at ?? null,
      profile_signature: matchingProfileSignature(profile),
      background_retrieval_count: diagnostics.background_retrieval,
      background_scan_status: diagnostics.background_scan_status,
      background_examined_count: diagnostics.background_examined,
      background_target_count: diagnostics.background_target,
      background_candidate_count: diagnostics.background_candidate_count,
      background_completed_at: diagnostics.background_completed_at,
      total_inventory_count: diagnostics.total_inventory_count,
      inventory_funnel: diagnostics.inventory_funnel,
      inventory_funnel_at: diagnostics.inventory_funnel_at,
      primary_retrieval_count: diagnostics.primary_retrieval,
      semantic_retrieval_count: diagnostics.semantic_retrieval,
      unique_policy_candidates_count: diagnostics.unique_policy_candidates,
      source_allowed_count: diagnostics.source_allowed,
      professional_evidence_ready_count: diagnostics.professional_evidence_ready,
      professional_fit_known_count: diagnostics.professional_fit_known,
      eligibility_eligible_count: diagnostics.eligibility_eligible,
      eligibility_unknown_count: diagnostics.eligibility_unknown,
      eligibility_ineligible_count: diagnostics.eligibility_ineligible,
      match_count: diagnostics.match, potential_scoreable_count: diagnostics.potential_scoreable_count,
      visible_potential_count: diagnostics.visible_potential_count,
      abstain_count: diagnostics.abstain, deny_count: diagnostics.deny,
      visible_confirmed_count: diagnostics.visible_confirmed,
      coverage_state: diagnostics.coverage_state,
      top_reason_codes: diagnostics.top_reason_codes,
      embedding_readiness: embedding ? 'READY' : 'QUEUED',
    })
    return new Response(JSON.stringify({
      matches: ranked,
      potentialMatches,
      profileSkills,
      missingSkills,
      is_subscribed: profile.is_subscribed ?? false,
      match_alerts_enabled: profile.match_alerts_enabled ?? false,
      meta: {
        activeOpportunities: eligibleOpportunities.length,
        vectorCandidates: similarities.size,
        generatedAt: runAt,
        diagnosticSnapshotId,
        diagnostics,
      }
    }), {
      headers: cors
    });
  } catch (error) {
    console.error('match-batch error:', error);
    if (activeUserId) {
      await persistMatchingDiagnostics({
        user_id: activeUserId,
        run_at: new Date().toISOString(),
        run_status: 'ERROR',
        request_mode: activeRequestMode,
        coverage_state: 'ERROR',
        top_reason_codes: { MATCHING_RUN_ERROR: 1 },
      })
    }
    return new Response(JSON.stringify({
      error: 'No pudimos calcular tus matches en este momento.'
    }), {
      status: 500,
      headers: cors
    });
  }
});
