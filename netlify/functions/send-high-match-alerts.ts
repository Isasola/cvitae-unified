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
  const profile = EDGE_SOURCE_IDENTITIES.find((item) => item.canonical_source === source || item.emitted_aliases.some(alias => alias === source))
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

const ALERT_FIELDS = "id,source,slug,title,organization,location,rubro,type,description,tags,opportunity_kind,opportunity_type,remote,remote_scope,eligible_countries,eligible_regions,citizenship_requirement,residency_requirement,deadline,created_at,updated_at,is_active,verification_status,match_eligible,alerts_eligible,archived_at,deleted_at,content_fingerprint"
const CACHE_FIELDS = "user_id,opportunity_id,profile_signature,opportunity_content_fingerprint,candidate_class,semantic_similarity,evaluation_lane,evaluated_at"
const PAGE_SIZE = 100
const MAX_PAGES = 5
const RUNTIME_MS = 20_000

type Dependencies = {
  database?: () => any; send?: typeof fetch; rank?: typeof rankOpportunitiesV2
  now?: () => number; resendKey?: string; pageSize?: number; maxPages?: number; maxEmails?: number
}
/** Production handler and local fixtures share the same bounded orchestration. */
export function createHighMatchAlertsHandler(deps: Dependencies = {}): Handler {
  return async () => {
    const resendKey = deps.resendKey ?? RESEND_KEY
    if (!resendKey) return { statusCode: 503, body: JSON.stringify({ error: "RESEND_API_KEY no configurada" }) }
    const db = (deps.database || makeSupabaseAdmin)()
    const now = deps.now || Date.now
    const deadline = now() + RUNTIME_MS
    const pageSize = Math.min(PAGE_SIZE, Math.max(1, deps.pageSize || PAGE_SIZE))
    const maxPages = Math.min(MAX_PAGES, Math.max(1, deps.maxPages || MAX_PAGES))
    const emailBudget = Math.min(MAX_EMAILS_PER_RUN, Math.max(1, deps.maxEmails || MAX_EMAILS_PER_RUN))
    const checked = async (query: any): Promise<any> => {
      const result = await (query.abortSignal ? query.abortSignal(AbortSignal.timeout(Math.max(1, deadline - now()))) : query)
      if (result.error) throw new Error(result.error.message)
      return result.data
    }
    let profile: any; let token: string; let progress: any
    let sent = 0; let failed = 0; let claimed = 0; let eligible = 0; let pages = 0; let opportunities = 0
    const save = (release = false) => checked(db.rpc('save_match_alert_scan', {
      p_profile_id: profile.id, p_lease_token: token, p_checkpoint: progress, p_release: release,
    }))
    try {
      const scan = await checked(db.rpc('claim_match_alert_scan'))
      if (!scan?.profile) return { statusCode: 200, body: JSON.stringify({ profiles: 0, continuation: scan }) }
      profile = scan.profile; token = scan.lease_token; progress = scan.checkpoint || {}
      const [skillRows, allSourcePolicies, permissionRows, stateRows] = await Promise.all([
        checked(db.from('skill_dictionary').select('canonical_name,variants')),
        checked(db.rpc('get_source_distribution_policy')),
        checked(db.from('opportunity_source_consumer_permissions').select('canonical_source,consumer,permission_state').eq('consumer', 'matching')),
        checked(db.from('matching_retrieval_states').select('user_id,profile_signature,source_policy_signature').eq('user_id', profile.user_id).limit(1)),
      ])
      const signature = matchingProfileSignature(profile)
      const sourceSignature = await sourcePolicySignature((allSourcePolicies || []).map(normalizeSourcePolicyRow), canonicalSource, permissionRows || [])
      // Invalidation metadata only: the canonical Alert view remains the eligibility authority.
      const policyStamp = JSON.stringify([sourceSignature, (allSourcePolicies || []).map((p: any) => [p.source, p.is_enabled, p.alerts_enabled])])
      const profileStamp = JSON.stringify([signature, profile.match_alert_threshold])
      const state = stateRows?.[0]
      const validCache = (c: any) => state?.source_policy_signature === sourceSignature && state?.profile_signature === signature && c.profile_signature === signature
      if (!progress.cutoff || progress.complete || progress.policyStamp !== policyStamp || progress.profileStamp !== profileStamp) {
        const cutoff = new Date(now()).toISOString()
        const unchanged = progress.policyStamp === policyStamp && progress.profileStamp === profileStamp
        const lower = unchanged && progress.complete ? progress.cutoff : new Date(Math.min(progress.complete ? now() : Date.parse(progress.lower || new Date(now()).toISOString()), now() - 36 * 3600_000)).toISOString()
        progress = { cutoff, lower, since: new Date(Math.min(Date.parse(lower), now() - 36 * 3600_000)).toISOString(),
          policyStamp, profileStamp, delta: unchanged && progress.complete === true, recentCursor: null, cacheCursor: null, recentDone: false, cacheDone: false, pending: [], complete: false }
        await save()
      }
      const dictionary = buildDictionary((skillRows || []).map((r: any) => [String(r.canonical_name || '').trim(), Array.isArray(r.variants) ? r.variants.map(String) : []]).filter(([name]: any) => name))
      const rank = deps.rank || rankOpportunitiesV2
      const ranked = (rows: any[], similarities = new Map<string, number>()) => rank(canonicalCandidateProfile(profile), rows.map(r => ({ ...r, source_match_state: 'ALLOWED' })), dictionary, V2_PRESET_FULL, similarities).rankedV2
      const hydrate = (ids: string[]) => ids.length ? checked(db.from("opportunity_alert_universe").select(ALERT_FIELDS).in('id', ids).limit(pageSize)) : Promise.resolve([])
      while (now() < deadline && sent + failed < emailBudget) {
        if (progress.pending.length) {
          // Re-read preferences and canonical rows before effects; no raw opportunities fallback.
          const prefs = await checked(db.from('user_master_profiles').select('match_alerts_enabled,email,match_alert_threshold').eq('id', profile.id).limit(1))
          if (!prefs?.[0]?.match_alerts_enabled) break
          profile.email = prefs[0].email
          const rows = await hydrate(progress.pending.map((p: any) => p.id))
          const byId = new Map<string, any>(rows.map((r: any) => [String(r.id), r]))
          while (progress.pending.length && now() < deadline && sent + failed < emailBudget) {
            const pending = progress.pending[0]; const opp = byId.get(pending.id)
            const decision = opp ? ranked([opp], pending.similarity == null ? new Map() : new Map([[pending.id, pending.similarity]]))[0]?.decision : null
            if (!opp || !isHighMatchAlertDecision(decision) || (decision?.score ?? 0) < Number(prefs[0].match_alert_threshold || 85)) {
              progress.pending.shift(); await save(); continue
            }
            const deliveries = await checked(db.rpc('claim_match_alert_delivery', {
              p_user_id: profile.user_id, p_profile_id: profile.id, p_opportunity_id: opp.id,
              p_recipient_email: profile.email, p_match_score: decision.score ?? 0, p_matched_skills: decision.matched_skills,
            }))
            if (!deliveries?.[0]) {
              const ledger = await checked(db.from('match_alert_deliveries').select('status,attempts').eq('user_id', profile.user_id).eq('opportunity_id', opp.id).limit(1))
              if (!ledger?.[0] || !(['sent', 'suppressed'].includes(ledger[0].status) || ledger[0].attempts >= 3)) break
              progress.pending.shift(); await save(); continue
            }
            const delivery = deliveries[0]; claimed++
            let response: Response
            try {
              response = await (deps.send || fetch)('https://api.resend.com/emails', {
                method: 'POST', signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - now()))),
                headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `high-match/${profile.user_id}/${opp.id}`.slice(0, 256) },
                body: JSON.stringify({ from: 'CVitae <contacto@cvitae.lat>', to: [profile.email], subject: `Match muy alto: ${opp.title}`, html: emailHtml(profile, opp, decision.matched_skills) }),
              })
            } catch (error: any) {
              await checked(db.from('match_alert_deliveries').update({ status: 'failed', last_error: String(error?.message).slice(0, 1000), updated_at: new Date(now()).toISOString() }).eq('id', delivery.id).eq('status', 'processing'))
              failed++; break
            }
            const body = await response.text()
            let messageId: string | null = null
            try { messageId = JSON.parse(body).id || null } catch { /* retain provider result */ }
            await checked(db.from('match_alert_deliveries').update(response.ok
              ? { status: 'sent', provider_message_id: messageId, sent_at: new Date(now()).toISOString(), updated_at: new Date(now()).toISOString() }
              : { status: 'failed', last_error: `${response.status}: ${body}`.slice(0, 1000), updated_at: new Date(now()).toISOString() }).eq('id', delivery.id).eq('status', 'processing'))
            if (!response.ok) { failed++; break }
            sent++; progress.pending.shift(); await save()
          }
          if (progress.pending.length) break // Pending retries/budget retain the page; never leap over it.
        }
        if (progress.recentDone && progress.cacheDone) { progress.complete = true; break }
        if (pages >= maxPages || now() >= deadline || sent + failed >= emailBudget) break
        let rows: any[] = []; let candidates: any[] = []
        // Stage progress separately. Failed reads/ranking must leave the preceding cursor intact.
        const nextProgress = { ...progress, pending: [] }
        if (!progress.recentDone) {
          let query = db.from("opportunity_alert_universe").select(ALERT_FIELDS).lte('updated_at', progress.cutoff)
            .order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(pageSize)
          query = progress.delta ? query.gt('updated_at', progress.lower) : query.gte('updated_at', progress.lower)
          const cursor = progress.recentCursor
          if (cursor) query = query.or(`updated_at.gt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.gt.${cursor.id})`)
          rows = await checked(query) || []
          if (rows.length > pageSize) throw new Error('ALERT_PAGE_OVERFLOW')
          const last = rows[rows.length - 1]
          if (last) {
            if (cursor && (last.updated_at < cursor.updated_at || (last.updated_at === cursor.updated_at && String(last.id) <= cursor.id))) throw new Error('ALERT_CURSOR_DID_NOT_ADVANCE')
            nextProgress.recentCursor = { updated_at: last.updated_at, id: String(last.id) }
          }
          nextProgress.recentDone = rows.length < pageSize
          if (rows.length) candidates = await checked(db.from('matching_retrieval_candidates').select(CACHE_FIELDS).eq('user_id', profile.user_id).in('opportunity_id', rows.map(r => String(r.id)))
            .eq('candidate_class', 'MATCH').gte('evaluated_at', progress.since).lte('evaluated_at', progress.cutoff).limit(pageSize)) || []
        } else {
          const page = await collectAlertCandidateSnapshot(async (cursor, limit) => {
            let query = db.from('matching_retrieval_candidates').select(CACHE_FIELDS).eq('user_id', profile.user_id).eq('candidate_class', 'MATCH')
              .lte('evaluated_at', progress.cutoff)
              .order('evaluated_at', { ascending: true }).order('user_id', { ascending: true }).order('opportunity_id', { ascending: true }).limit(limit)
            query = progress.delta ? query.gt('evaluated_at', progress.lower) : query.gte('evaluated_at', progress.lower)
            if (cursor) query = query.or(`evaluated_at.gt.${cursor.evaluated_at},and(evaluated_at.eq.${cursor.evaluated_at},opportunity_id.gt.${cursor.opportunity_id})`)
            return await checked(query) || []
          }, pageSize, progress.cacheCursor)
          candidates = page.rows.filter(validCache)
          nextProgress.cacheCursor = page.cursor; nextProgress.cacheDone = page.complete
          rows = await hydrate(candidates.map(c => String(c.opportunity_id)))
          const byId = new Map<string, any>(rows.map(r => [String(r.id), r]))
          rows = candidates.flatMap(c => {
            const opp = byId.get(String(c.opportunity_id))
            // Recent lane already used this exact cache score in this snapshot.
            return opp && opportunityCacheIsCurrent(c, opp) && cacheCandidateAlertEligible(c, opp, progress.since)
              && !(Date.parse(opp.updated_at) >= Date.parse(progress.lower) && Date.parse(opp.updated_at) <= Date.parse(progress.cutoff)) ? [opp] : []
          })
        }
        pages++; opportunities += rows.length
        const byId = new Map<string, any>(rows.map(r => [String(r.id), r]))
        const similarities = new Map<string, number>(candidates.filter(c => validCache(c) && opportunityCacheIsCurrent(c, byId.get(String(c.opportunity_id)) || {}) && cacheCandidateAlertEligible(c, byId.get(String(c.opportunity_id)) || {}, progress.since))
          .flatMap(c => Number.isFinite(Number(c.semantic_similarity)) ? [[String(c.opportunity_id), Number(c.semantic_similarity)] as [string, number]] : []))
        nextProgress.pending = ranked(rows, similarities).filter(({ decision }: any) => isHighMatchAlertDecision(decision) && (decision.score ?? 0) >= Number(profile.match_alert_threshold || 85))
          .map(({ opp }: any) => ({ id: String(opp.id), similarity: similarities.get(String(opp.id)) ?? null }))
        progress = nextProgress
        eligible += progress.pending.length
        await save() // Atomic cursor + unattempted effects, BEFORE sending.
      }
      await save(true)
      return { statusCode: 200, body: JSON.stringify({ profiles: 1, pages, opportunities, eligible, claimed, sent, failed, limit: emailBudget,
        continuation: { profile_id: profile.id, resumable: !progress.complete, complete: progress.complete, cutoff: progress.cutoff, recentCursor: progress.recentCursor, cacheCursor: progress.cacheCursor, pending: progress.pending.length } }) }
    } catch (error: any) {
      if (profile && progress) { try { await save(true) } catch { /* durable last checkpoint and lease expiry allow retry */ } }
      return { statusCode: 500, body: JSON.stringify({ error: error?.message || 'ALERT_SCAN_FAILED', resumable: true }) }
    }
  }
}
const boundedHandler = createHighMatchAlertsHandler()
// Reuse the release gate: automatic delivery must not precede the authorized canary.
const handler: Handler = (event, context, callback) => {
  if (process.env.CVITAE_PROD_RELEASE_VALIDATED !== 'true') {
    return Promise.resolve({ statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'PROD_RELEASE_NOT_VALIDATED' }) })
  }
  return boundedHandler(event, context, callback)
}

export const config = { schedule: "0 */2 * * *" }
export { handler }
