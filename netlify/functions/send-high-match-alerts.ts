import type { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"
import { buildDictionary } from "../../supabase/functions/_shared/matching"
import { isHighMatchAlertDecision, rankOpportunitiesV2, V2_PRESET_FULL } from "../../supabase/functions/_shared/matching-v2"
import { EDGE_SOURCE_IDENTITIES } from "../../supabase/functions/_shared/generated-source-registry"
import { canonicalCandidateProfile } from "../../shared/candidate-profile"
import { matchingProfileSignature } from "../../shared/matching-profile-signature"
import { cacheCandidateAlertEligible, collectAlertCandidateSnapshot, normalizeSourcePolicyRow, opportunityCacheIsCurrent, sourcePolicySignature } from "../../shared/matching-retrieval"

const RESEND_KEY = process.env.RESEND_API_KEY
const SITE_URL = process.env.SITE_URL || "https://cvitae.lat"
// Scheduled functions have a hard 30s window. Keep a conservative cap and let
// the next two-hour run resume from the idempotent delivery ledger.
const MAX_EMAILS_PER_RUN = 20

function canonicalSource(raw: unknown): string {
  const source = String(raw || '').trim().toLowerCase()
  const profile = EDGE_SOURCE_IDENTITIES.find((item) => item.canonical_source === source || item.emitted_aliases.includes(source))
  return profile?.canonical_source || source
}

const aliases: Record<string, string[]> = {
  JavaScript: ["javascript", "js"], TypeScript: ["typescript", "ts"], React: ["react", "reactjs"],
  "Node.js": ["node", "nodejs"], Python: ["python", "django", "flask", "fastapi"],
  Java: ["java", "spring"], SQL: ["sql", "postgresql", "mysql"], Excel: ["excel"],
  "Power BI": ["power bi", "powerbi"], AWS: ["aws", "amazon web services"],
  Docker: ["docker"], Git: ["git", "github", "gitlab"], Figma: ["figma"],
  "UX/UI": ["ux", "ui", "experiencia de usuario"], SEO: ["seo"],
  Ventas: ["ventas", "sales", "comercial"], Finanzas: ["finanzas", "finance"],
  "Recursos Humanos": ["recursos humanos", "rrhh", "human resources"],
  "Gestión de proyectos": ["gestion de proyectos", "project management", "scrum", "agile"],
  Inglés: ["ingles", "english"],
}

function normalize(value: unknown): string {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim()
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean)
  if (typeof value === "string") return value.split(/[,;|]/).map(v => v.trim()).filter(Boolean)
  return []
}

function sameSkill(a: string, b: string): boolean {
  const left = normalize(a); const right = normalize(b)
  return !!left && !!right && (left === right || (left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))))
}

function opportunitySkills(opp: any): string[] {
  const text = normalize(`${opp.title} ${opp.rubro} ${opp.type} ${opp.description} ${strings(opp.tags).join(" ")}`)
  const detected = Object.entries(aliases).filter(([, terms]) => terms.some(term => text.includes(normalize(term)))).map(([name]) => name)
  return [...new Set([...detected, ...strings(opp.tags).filter(tag => normalize(tag).split(" ").length <= 4)])].slice(0, 16)
}

function score(profile: any, opp: any): { value: number; matched: string[] } {
  const profileData = profile.profile_data || {}
  const own = strings(profileData.habilidades)
  const needed = opportunitySkills(opp)
  const matched = needed.filter(skill => own.some(item => sameSkill(item, skill)))
  const skillScore = needed.length ? Math.round(Math.min(1, (matched.length / needed.length) * .75 + (matched.length / Math.min(Math.max(own.length, 1), 10)) * .25) * 100) : 30
  const profileTitle = normalize(profile.professional_title)
  const titleWords = profileTitle.split(" ").filter(word => word.length >= 3)
  const oppTitle = normalize(`${opp.title} ${opp.rubro} ${opp.type}`)
  const titleHits = titleWords.filter(word => oppTitle.includes(word)).length
  const titleScore = titleWords.length ? (titleHits ? Math.min(100, 45 + Math.round(titleHits / titleWords.length * 55)) : 25) : 45
  const location = normalize(profileData.location)
  const oppLocation = normalize(opp.location)
  const locationScore = /(remoto|remote|hibrido|hybrid)/.test(oppLocation) ? 95 : (!location || !oppLocation ? 65 : (location.includes(oppLocation) || oppLocation.includes(location) ? 100 : 55))
  const value = Math.max(20, Math.min(99, Math.round(skillScore * .55 + titleScore * .30 + locationScore * .15)))
  return { value, matched }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!))
}

function emailHtml(profile: any, opp: any, matched: string[]): string {
  const firstName = String(profile.full_name || "Hola").split(" ")[0]
  const kind = normalize(opp.opportunity_kind) === "empleo" ? "empleos" : "oportunidades"
  const url = `${SITE_URL}/${kind}/${encodeURIComponent(opp.slug || opp.id)}`
  return `<!doctype html><html lang="es"><body style="margin:0;background:#0a0a0a;color:#f5f4f0;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center"><table width="100%" style="max-width:560px;background:#111110;border:1px solid #292929"><tr><td style="padding:30px"><p style="margin:0 0 24px;color:#c9a84c;font-size:22px;font-weight:800">CVitae</p><p style="color:#999;font-size:12px;letter-spacing:.12em;text-transform:uppercase">Match muy alto</p><h1 style="font-size:25px;line-height:1.25">${escapeHtml(firstName)}, encontramos una oportunidad que encaja mucho con tu perfil.</h1><h2 style="margin:28px 0 6px;font-size:20px">${escapeHtml(opp.title)}</h2><p style="margin:0 0 18px;color:#aaa">${escapeHtml(opp.organization)} · ${escapeHtml(opp.location)}</p>${matched.length ? `<p style="color:#aaa;line-height:1.6">Coincidencias: ${matched.map(escapeHtml).join(", ")}</p>` : ""}<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 20px;border-radius:999px;background:#c9a84c;color:#0a0a0a;text-decoration:none;font-weight:700">Ver oportunidad</a><p style="margin-top:30px;color:#777;font-size:12px;line-height:1.5">Recibís este correo porque activaste las alertas en CVitae. Podés desactivarlas desde Mi carrera → Alertas.</p></td></tr></table></td></tr></table></body></html>`
}

const handler: Handler = async () => {
  if (!RESEND_KEY) return { statusCode: 503, body: JSON.stringify({ error: "RESEND_API_KEY no configurada" }) }
  const supabase = makeSupabaseAdmin()
  const alertCacheCutoff = new Date()
  const alertCacheFreshnessStart = new Date(alertCacheCutoff.getTime() - 36 * 60 * 60 * 1000)
  const since = alertCacheFreshnessStart.toISOString()
  const [{ data: profiles, error: profilesError }, { data: skillRows, error: skillsError }, { data: allSourcePolicies, error: sourcePolicyError }, { data: permissionRows, error: permissionError }] = await Promise.all([
    supabase.from("user_master_profiles").select("id,user_id,email,full_name,professional_title,summary,cv_text,profile_data,match_alerts_enabled,match_alert_threshold,is_test").eq("match_alerts_enabled", true).not("email", "is", null).not("user_id", "is", null).or("is_test.is.null,is_test.eq.false").limit(250),
    supabase.from("skill_dictionary").select("canonical_name,variants"),
    supabase.from("opportunity_sources").select("source,is_enabled,matching_enabled"),
    supabase.from("opportunity_source_consumer_permissions").select("canonical_source,consumer,permission_state").eq("consumer", "matching"),
  ])
  if (profilesError || skillsError || sourcePolicyError || permissionError) return { statusCode: 500, body: JSON.stringify({ error: profilesError?.message || skillsError?.message || sourcePolicyError?.message || permissionError?.message }) }
  const alertOpportunities: any[] = []
  let alertCursor: { updated_at: string; id: string } | null = null
  try {
    for (;;) {
      let query = supabase.from("opportunity_alert_universe").select("id,source,slug,title,organization,location,rubro,type,description,tags,opportunity_kind,opportunity_type,remote,remote_scope,eligible_countries,eligible_regions,citizenship_requirement,residency_requirement,deadline,created_at,updated_at,is_active,verification_status,match_eligible,alerts_eligible,archived_at,deleted_at,content_fingerprint")
        .gte("updated_at", since).lte("updated_at", alertCacheCutoff.toISOString()).order("updated_at", { ascending: true }).order("id", { ascending: true }).limit(500)
      if (alertCursor) query = query.or(`updated_at.gt.${alertCursor.updated_at},and(updated_at.eq.${alertCursor.updated_at},id.gt.${alertCursor.id})`)
      const page = await query
      if (page.error) throw new Error(page.error.message)
      const rows = page.data || []
      alertOpportunities.push(...rows)
      if (rows.length < 500) break
      const last = rows[rows.length - 1]
      const next = { updated_at: String(last.updated_at), id: String(last.id) }
      if (alertCursor && (next.updated_at < alertCursor.updated_at || (next.updated_at === alertCursor.updated_at && next.id <= alertCursor.id))) throw new Error("ALERT_UNIVERSE_CURSOR_DID_NOT_ADVANCE")
      alertCursor = next
    }
  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error?.message || "ALERT_UNIVERSE_PAGE_FAILED" }) }
  }
  const sourceRows = (allSourcePolicies || []).map(normalizeSourcePolicyRow)
  const sourceSignature = await sourcePolicySignature(sourceRows, canonicalSource, permissionRows || [])
  const recentDecisionOpportunities = alertOpportunities.map((opp: any) => ({ ...opp, source_match_state: 'ALLOWED' }))
  const userIds = (profiles || []).map((profile: any) => String(profile.user_id))
  const cacheRows: any[] = []
  try {
    for (let offset = 0; offset < userIds.length; offset += 50) {
      const userChunk = userIds.slice(offset, offset + 50)
      const rows = await collectAlertCandidateSnapshot(async (cursor, limit) => {
        let query = supabase.from('matching_retrieval_candidates')
          .select('user_id,opportunity_id,profile_signature,opportunity_content_fingerprint,candidate_class,semantic_similarity,evaluation_lane,evaluated_at')
          .in('user_id', userChunk).eq('candidate_class', 'MATCH')
          .gte('evaluated_at', alertCacheFreshnessStart.toISOString()).lte('evaluated_at', alertCacheCutoff.toISOString())
          .order('evaluated_at', { ascending: true }).order('user_id', { ascending: true }).order('opportunity_id', { ascending: true }).limit(limit)
        if (cursor) query = query.or(`evaluated_at.gt.${cursor.evaluated_at},and(evaluated_at.eq.${cursor.evaluated_at},user_id.gt.${cursor.user_id}),and(evaluated_at.eq.${cursor.evaluated_at},user_id.eq.${cursor.user_id},opportunity_id.gt.${cursor.opportunity_id})`)
        const result = await query
        if (result.error) throw new Error(result.error.message)
        return result.data || []
      }, 500)
      cacheRows.push(...rows)
    }
  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error?.message || 'ALERT_CACHE_PAGE_FAILED' }) }
  }
  const stateResult = userIds.length ? await supabase.from('matching_retrieval_states').select('user_id,profile_signature,source_policy_signature').in('user_id', userIds) : { data: [], error: null }
  if (stateResult.error) return { statusCode: 500, body: JSON.stringify({ error: stateResult.error.message }) }
  const states = new Map((stateResult.data || []).map((state: any) => [String(state.user_id), state]))
  const profilesByUser = new Map((profiles || []).map((profile: any) => [String(profile.user_id), profile]))
  const validCacheRows = cacheRows.filter((candidate: any) => {
    const profile: any = profilesByUser.get(String(candidate.user_id))
    const state: any = states.get(String(candidate.user_id))
    return profile && state
      && candidate.profile_signature === matchingProfileSignature(profile)
      && state.profile_signature === candidate.profile_signature
      && state.source_policy_signature === sourceSignature
  })
  const cachedIds = [...new Set(validCacheRows.map((candidate: any) => String(candidate.opportunity_id)))]
  const hydratedRows: any[] = []
  for (let offset = 0; offset < cachedIds.length; offset += 500) {
    const result = await supabase.from('opportunity_alert_universe')
      .select("id,source,slug,title,organization,location,rubro,type,description,tags,opportunity_kind,opportunity_type,remote,remote_scope,eligible_countries,eligible_regions,citizenship_requirement,residency_requirement,deadline,created_at,updated_at,is_active,verification_status,match_eligible,alerts_eligible,archived_at,deleted_at,content_fingerprint")
      .in('id', cachedIds.slice(offset, offset + 500))
    if (result.error) return { statusCode: 500, body: JSON.stringify({ error: result.error.message }) }
    hydratedRows.push(...(result.data || []))
  }
  const hydratedById = new Map(hydratedRows.map((row: any) => [String(row.id), row]))
  const cachedByUser = new Map<string, any[]>()
  for (const candidate of validCacheRows) {
    const opp = hydratedById.get(String(candidate.opportunity_id))
    if (!opp || !opportunityCacheIsCurrent(candidate, opp) || !cacheCandidateAlertEligible(candidate, opp, since)) continue
    const rows = cachedByUser.get(String(candidate.user_id)) || []
    rows.push({ ...opp, source_match_state: 'ALLOWED', _cached_similarity: candidate.semantic_similarity })
    cachedByUser.set(String(candidate.user_id), rows)
  }
  const dictionary = buildDictionary((skillRows || []).map((row: any) => [
    String(row.canonical_name || '').trim(),
    Array.isArray(row.variants) ? row.variants.map(String) : [],
  ]).filter(([canonical]: [string, string[]]) => canonical))

  let sent = 0; let failed = 0; let claimed = 0; let eligible = 0
  for (const profile of profiles || []) {
    if (sent + failed >= MAX_EMAILS_PER_RUN) break
    const threshold = Number(profile.match_alert_threshold || 85)
    const cache = cachedByUser.get(String(profile.user_id)) || []
    const byId = new Map<string, any>()
    for (const opp of [...recentDecisionOpportunities, ...cache]) if (!byId.has(String(opp.id))) byId.set(String(opp.id), opp)
    const decisionOpportunities = [...byId.values()]
    const similarities = new Map<string, number>(cache.flatMap((opp: any) => Number.isFinite(Number(opp._cached_similarity)) ? [[String(opp.id), Number(opp._cached_similarity)] as [string, number]] : []))
    const { rankedV2 } = rankOpportunitiesV2(canonicalCandidateProfile(profile), decisionOpportunities, dictionary, V2_PRESET_FULL, similarities)
    for (const { opp, decision } of rankedV2) {
      if (sent + failed >= MAX_EMAILS_PER_RUN) break
      if (!isHighMatchAlertDecision(decision)) continue
      const match = { value: decision.score ?? 0, matched: decision.matched_skills }
      if (match.value < threshold) continue
      eligible++
      const { data: rows, error: claimError } = await supabase.rpc("claim_match_alert_delivery", {
        p_user_id: profile.user_id, p_profile_id: profile.id, p_opportunity_id: opp.id,
        p_recipient_email: profile.email, p_match_score: match.value, p_matched_skills: match.matched,
      })
      if (claimError || !rows?.[0]) continue
      claimed++
      const delivery = rows[0]
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `high-match/${profile.user_id}/${opp.id}`.slice(0, 256) },
        body: JSON.stringify({ from: "CVitae <contacto@cvitae.lat>", to: [profile.email], subject: `Match muy alto: ${opp.title}`, html: emailHtml(profile, opp, match.matched) }),
      })
      const responseBody = await response.text()
      if (response.ok) {
        let messageId: string | null = null
        try { messageId = JSON.parse(responseBody).id || null } catch { /* provider response is still auditable */ }
        await supabase.from("match_alert_deliveries").update({ status: "sent", provider_message_id: messageId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", delivery.id).eq("status", "processing")
        sent++
      } else {
        await supabase.from("match_alert_deliveries").update({ status: "failed", last_error: `${response.status}: ${responseBody}`.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", delivery.id).eq("status", "processing")
        failed++
      }
    }
  }
  return { statusCode: 200, body: JSON.stringify({ profiles: profiles?.length || 0, opportunities: alertOpportunities.length, eligible, claimed, sent, failed, limit: MAX_EMAILS_PER_RUN }) }
}

export const config = { schedule: "0 */2 * * *" }
export { handler }
