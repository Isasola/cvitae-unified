import type { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const RESEND_KEY = process.env.RESEND_API_KEY
const SITE_URL = process.env.SITE_URL || "https://cvitae.lat"
// Scheduled functions have a hard 30s window. Keep a conservative cap and let
// the next two-hour run resume from the idempotent delivery ledger.
const MAX_EMAILS_PER_RUN = 20

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
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
  const [{ data: profiles, error: profilesError }, { data: opportunities, error: opportunitiesError }] = await Promise.all([
    supabase.from("user_master_profiles").select("id,user_id,email,full_name,professional_title,profile_data,match_alerts_enabled,match_alert_threshold").eq("match_alerts_enabled", true).not("email", "is", null).limit(250),
    supabase.from("opportunities").select("id,slug,title,organization,location,rubro,type,description,tags,opportunity_kind,created_at").eq("is_active", true).eq("verification_status", "verified").eq("alerts_eligible", true).is("deleted_at", null).is("archived_at", null).gte("created_at", since).order("created_at", { ascending: false }).limit(150),
  ])
  if (profilesError || opportunitiesError) return { statusCode: 500, body: JSON.stringify({ error: profilesError?.message || opportunitiesError?.message }) }

  let sent = 0; let failed = 0; let claimed = 0; let eligible = 0
  for (const profile of profiles || []) {
    if (sent + failed >= MAX_EMAILS_PER_RUN) break
    const threshold = Number(profile.match_alert_threshold || 85)
    for (const opp of opportunities || []) {
      if (sent + failed >= MAX_EMAILS_PER_RUN) break
      const match = score(profile, opp)
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
  return { statusCode: 200, body: JSON.stringify({ profiles: profiles?.length || 0, opportunities: opportunities?.length || 0, eligible, claimed, sent, failed, limit: MAX_EMAILS_PER_RUN }) }
}

export const config = { schedule: "0 */2 * * *" }
export { handler }
