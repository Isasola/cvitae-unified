// netlify/functions/log-user-event.ts
// Authenticated endpoint: logs a user activity event to user_events.
// Also updates lifecycle_state on user_master_profiles for milestone events.

import { Handler } from "@netlify/functions"
import { Resend } from "resend"
import { notifyFounderMilestone } from "./lib/founding-mailer"
import { authenticatedUser } from "./lib/b2c-security"
import { makeSupabaseAdmin } from "./_supabase"
import { matchingProfileSignature } from "../../shared/matching-profile-signature"

// Allowlist of event types the frontend is permitted to log.
// Only add new types here when there's a corresponding frontend trigger.
const ALLOWED_EVENTS = new Set([
  "cv_generated",
  "ats_completed",
  "cv_rewritten",
  "workspace_created",
  "learning_viewed",
  "profile_completed",
  "first_search",
  "opportunity_saved",
  "application_submitted",
  "matching_coverage_gap",
  "founding_beta_offered",
  "founding_beta_accepted",
  "founding_beta_dismissed",
])

// Events that advance lifecycle_state to 'activated'
const ACTIVATION_EVENTS = new Set([
  "cv_generated",
  "ats_completed",
  "cv_rewritten",
  "workspace_created",
])

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  // Authenticate the request
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }
  }
  let body: Record<string, any> = {}
  try { body = JSON.parse(event.body || "{}") } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido" }) }
  }

  const { event_type, event_data, session_id } = body

  if (!event_type || typeof event_type !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "event_type requerido" }) }
  }
  if (!ALLOWED_EVENTS.has(event_type)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Tipo de evento no permitido: ${event_type}` }) }
  }

  // Use the shared Node 20-safe client to identify the authenticated user.
  const { user, error: authError } = await authenticatedUser(event)
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Token inválido o expirado" }) }
  }

  // Use service role for writes (user_events has no anon/authenticated access)
  const supabaseAdmin = makeSupabaseAdmin()

  const now = new Date().toISOString()
  const safeEventData = event_data && typeof event_data === "object" ? event_data : {}
  const safeSessionId = session_id ? String(session_id).slice(0, 64) : null

  // Coverage alerts are not ordinary product telemetry. Validate the exact
  // persisted snapshot first and return without inserting one event per
  // dashboard refresh.
  if (event_type === "matching_coverage_gap") {
    const snapshotId = String(safeEventData.snapshot_id || "").trim()
    if (!snapshotId) return { statusCode: 200, body: JSON.stringify({ ok: true, alerted: false, reason: "snapshot_required" }) }
    const [{ data: snapshot }, { data: profile }] = await Promise.all([
      supabaseAdmin.from("matching_diagnostic_snapshots")
        .select("id, run_status, run_at, profile_signature, coverage_state, match_count, potential_scoreable_count, visible_potential_count, eligibility_unknown_count, source_allowed_count")
        .eq("id", snapshotId).eq("user_id", user.id).maybeSingle(),
      supabaseAdmin.from("user_master_profiles")
        .select("professional_title, summary, cv_text, profile_data").eq("user_id", user.id).maybeSingle(),
    ])
    const profileVersionMatches = Boolean(snapshot?.profile_signature && profile && snapshot.profile_signature === matchingProfileSignature(profile))
    const meaningfulGap = snapshot?.run_status === "SUCCESS"
      && profileVersionMatches
      && ["ELIGIBILITY_UNKNOWN", "DATA_COVERAGE_GAP", "LOW_RETRIEVAL_COVERAGE"].includes(snapshot.coverage_state)
      && Number(snapshot.match_count || 0) === 0
    if (!meaningfulGap) return { statusCode: 200, body: JSON.stringify({ ok: true, alerted: false, reason: "snapshot_not_current_gap" }) }
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(user.id)
      const userEmail = authUser?.user?.email || ""
      if (!userEmail) return { statusCode: 200, body: JSON.stringify({ ok: true, alerted: false, reason: "founder_recipient_unavailable" }) }
      const resend = new Resend(process.env.RESEND_API_KEY)
      const location = String(profile?.profile_data?.location || "").trim().slice(0, 120)
      const professionalTitle = String(profile?.professional_title || "").trim().slice(0, 160)
      const recommendedAction = snapshot.coverage_state === "LOW_RETRIEVAL_COVERAGE"
        ? "inspect bounded retrieval coverage; do not infer total supply"
        : snapshot.coverage_state === "ELIGIBILITY_UNKNOWN" || snapshot.coverage_state === "DATA_COVERAGE_GAP"
          ? "improve eligibility extraction/enrichment before adding indiscriminate supply"
          : "inspect professional coverage and candidate data"
      const result = await notifyFounderMilestone({
        event: "matching_coverage_gap",
        userId: user.id,
        userEmail,
        timestamp: snapshot.run_at,
        dedupeKey: `${snapshot.profile_signature}:${snapshot.coverage_state}`,
        details: {
          location_summary: location || "UNKNOWN",
          professional_title: professionalTitle || "UNKNOWN",
          coverage_state: snapshot.coverage_state,
          confirmed_matches: Number(snapshot.match_count || 0),
          potential_matches: Number(snapshot.visible_potential_count || 0),
          potential_candidates: Number(snapshot.potential_scoreable_count || 0),
          eligibility_unknown: Number(snapshot.eligibility_unknown_count || 0),
          source_allowed: Number(snapshot.source_allowed_count || 0),
          recommended_action: recommendedAction,
          admin_link: "https://cvitae.lat/admin",
          run_at: snapshot.run_at,
        },
        supabaseAdmin,
        resend,
      })
      return { statusCode: 200, body: JSON.stringify({ ok: true, alerted: !result.already_sent }) }
    } catch (err: any) {
      console.error("[log-user-event] matching coverage founder alert failed", err?.message)
      return { statusCode: 200, body: JSON.stringify({ ok: true, alerted: false, reason: "notification_failed" }) }
    }
  }

  // Insert the event
  const { error: insertError } = await supabaseAdmin
    .from("user_events")
    .insert({
      user_id: user.id,
      event_type,
      event_data: safeEventData,
      occurred_at: now,
      session_id: safeSessionId,
    })
  if (insertError) {
    console.error("[log-user-event] insert error", insertError.message)
    return { statusCode: 500, body: JSON.stringify({ error: "Error al registrar el evento" }) }
  }

  // Update lifecycle_state if this is an activation event
  if (ACTIVATION_EVENTS.has(event_type)) {
    const { data: profile } = await supabaseAdmin
      .from("user_master_profiles")
      .select("lifecycle_state, ttfv_seconds, first_value_event, created_at, is_test, full_name")
      .eq("user_id", user.id)
      .single()

    if (profile && profile.lifecycle_state === "signed_up") {
      const createdAt = new Date(profile.created_at).getTime()
      const ttfvMs = new Date(now).getTime() - createdAt
      const ttfvSeconds = Math.round(ttfvMs / 1000)

      await supabaseAdmin
        .from("user_master_profiles")
        .update({
          lifecycle_state: "activated",
          ttfv_seconds: ttfvSeconds,
          first_value_event: event_type,
          updated_at: now,
        })
        .eq("user_id", user.id)

      // Founder first-value alert — only for real (non-test) users, only on first activation
      if (!profile.is_test) {
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(user.id)
          const userEmail = authUser?.user?.email || ""
          if (userEmail) {
            const resend = new Resend(process.env.RESEND_API_KEY)
            await notifyFounderMilestone({
              event: "first_value",
              userId: user.id,
              userEmail,
              userName: profile.full_name || undefined,
              timestamp: now,
              details: { event_type, ttfv_seconds: ttfvSeconds },
              supabaseAdmin,
              resend,
            })
          }
        } catch (err: any) {
          console.error("[log-user-event] first_value founder alert failed", err?.message)
        }
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
