// netlify/functions/founding-beta-action.ts
// Authenticated endpoint for Founding Beta program interactions.
// Supports: accept, get_status, mark_offered, increment_dismissed
//
// "Ahora no" (dismiss) is frontend-only — no API call needed.
// This function handles explicit accept, status polling, and offer tracking.

import { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { sendFoundingEmail, notifyFounderMilestone, notifyFounder } from "./lib/founding-mailer"

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }
  }
  const token = authHeader.replace("Bearer ", "").trim()

  let body: Record<string, any> = {}
  try { body = JSON.parse(event.body || "{}") } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido" }) }
  }

  const { action } = body

  if (!["accept", "get_status", "mark_offered", "increment_dismissed"].includes(action)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Acción inválida: ${action}` }) }
  }

  // Authenticate
  const supabaseUrl = process.env.SUPABASE_URL!
  const supabaseAnonKey = process.env.SUPABASE_KEY!
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Token inválido o expirado" }) }
  }

  const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // ── get_status ────────────────────────────────────────────────────────────
  if (action === "get_status") {
    const { data: profileCheck } = await supabaseAdmin
      .from("user_master_profiles")
      .select("is_test")
      .eq("user_id", user.id)
      .maybeSingle()

    if (profileCheck?.is_test === true) {
      return { statusCode: 200, body: JSON.stringify({ enrollment: null, program_full: false, slots_remaining: 50, ineligible: true, reason: "test_account" }) }
    }

    // Rollout gate — fail closed: any DB error = ineligible until verified
    const { data: gateCheck, error: gateError } = await supabaseAdmin
      .from("user_master_profiles")
      .select("founding_offer_enabled")
      .eq("user_id", user.id)
      .maybeSingle()
    if (gateError) {
      console.error("[founding-beta-action] gate_check error", gateError.message)
      return { statusCode: 200, body: JSON.stringify({ enrollment: null, program_full: false, slots_remaining: 50, ineligible: true, reason: "gate_error" }) }
    }
    if (gateCheck?.founding_offer_enabled === false) {
      return { statusCode: 200, body: JSON.stringify({ enrollment: null, program_full: false, slots_remaining: 50, ineligible: true, reason: "rollout_pending" }) }
    }

    const { data, error } = await supabaseAdmin
      .from("founding_beta_enrollments")
      .select("status, offered_at, accepted_at, activated_at, benefit_end, dismissed_count")
      .eq("user_id", user.id)
      .eq("program", "founding_50")
      .maybeSingle()
    if (error) {
      console.error("[founding-beta-action] get_status error", error.message)
      return { statusCode: 500, body: JSON.stringify({ error: "Error al obtener estado" }) }
    }

    // Also check program capacity
    const { count: activeCount } = await supabaseAdmin
      .from("founding_beta_enrollments")
      .select("id", { count: "exact", head: true })
      .in("status", ["accepted", "active"])
      .eq("program", "founding_50")

    // Fire-and-forget: notify founder on first visit of each real user (idempotent via email_log).
    // This guarantees Isaias gets an alert even if the user never triggers mark_offered.
    if (!data) {
      const signupAlertKey = `founder_signup:${user.id}:v1`
      const { data: existingAlert } = await supabaseAdmin
        .from("email_log")
        .select("id")
        .eq("idempotency_key", signupAlertKey)
        .maybeSingle()

      if (!existingAlert) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(user.id)
        const userEmail = authUser?.user?.email || ""
        const { data: profileMeta } = await supabaseAdmin
          .from("user_master_profiles")
          .select("full_name, created_at")
          .eq("user_id", user.id)
          .maybeSingle()

        if (userEmail) {
          const resend = new Resend(process.env.RESEND_API_KEY)
          notifyFounder({
            userEmail,
            userName: profileMeta?.full_name || undefined,
            signupAt: profileMeta?.created_at || undefined,
            source: "dashboard_first_visit",
            resend,
          }).catch((e: any) => console.error("[founding-beta-action] signup notify failed", e?.message))

          supabaseAdmin.from("email_log").insert({
            user_id: user.id,
            template: "founder_signup_notification",
            recipient_email: "contacto@cvitae.lat",
            subject: `[CVitae] Nuevo usuario: ${userEmail}`,
            status: "sent",
            resend_id: null,
            idempotency_key: signupAlertKey,
            metadata: { source: "get_status_first_visit" },
          }).then(({ error: logErr }: any) => {
            if (logErr) console.error("[founding-beta-action] signup notify log error", logErr.message)
          })
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        enrollment: data || null,
        program_full: (activeCount || 0) >= 50,
        slots_remaining: Math.max(0, 50 - (activeCount || 0)),
      })
    }
  }

  // ── mark_offered ──────────────────────────────────────────────────────────
  // Called when the modal is shown to the user.
  // Uses the DB RPC function (SECURITY DEFINER) to safely upsert.
  if (action === "mark_offered") {
    const { data: profile } = await supabaseAdmin
      .from("user_master_profiles")
      .select("email, is_test, full_name")
      .eq("user_id", user.id)
      .maybeSingle()

    if (profile?.is_test === true) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: "test_account" }) }
    }

    // Rollout gate — fail closed: any DB error = skip offer, do not send email
    const { data: gateCheck, error: gateError } = await supabaseAdmin
      .from("user_master_profiles")
      .select("founding_offer_enabled")
      .eq("user_id", user.id)
      .maybeSingle()
    if (gateError) {
      console.error("[founding-beta-action] gate_check error (mark_offered)", gateError.message)
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: "gate_error" }) }
    }
    if (gateCheck?.founding_offer_enabled === false) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: "rollout_pending" }) }
    }

    const email = profile?.email || user.email || ""

    // Check if this is the first time the offer is shown (no existing enrollment)
    const { data: existingEnrollment } = await supabaseAdmin
      .from("founding_beta_enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("program", "founding_50")
      .maybeSingle()

    const isFirstOffer = !existingEnrollment

    const { error } = await supabaseAdmin.rpc("mark_founding_beta_offered", {
      p_user_id: user.id,
      p_email: email,
      p_offer_version: "v1",
    })
    if (error) {
      console.error("[founding-beta-action] mark_offered error", error.message)
      return { statusCode: 500, body: JSON.stringify({ error: "Error al registrar oferta" }) }
    }

    if (isFirstOffer) {
      const resend = new Resend(process.env.RESEND_API_KEY)

      // Founder offer alert — idempotent; failure logged but does not block modal
      try {
        await notifyFounderMilestone({
          event: "founding_offered",
          userId: user.id,
          userEmail: user.email || email,
          userName: profile?.full_name || undefined,
          timestamp: new Date().toISOString(),
          supabaseAdmin,
          resend,
        })
      } catch (err: any) {
        console.error("[founding-beta-action] founder offer alert failed", err?.message)
      }

      // founding_offer_v1 to user — idempotent; failure logged but does not block modal
      const emailResult = await sendFoundingEmail({
        template: "founding_offer_v1",
        userId: user.id,
        supabaseAdmin,
        resend,
      })
      if (!emailResult.ok && !emailResult.already_sent) {
        console.error("[founding-beta-action] offer email failed", emailResult.error)
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  // ── increment_dismissed ───────────────────────────────────────────────────
  // Called when user clicks "Ahora no" — increments dismissed_count only.
  // Does NOT change status (status stays 'offered' so modal shows again next login).
  if (action === "increment_dismissed") {
    const { data: current } = await supabaseAdmin
      .from("founding_beta_enrollments")
      .select("dismissed_count")
      .eq("user_id", user.id)
      .eq("program", "founding_50")
      .maybeSingle()

    if (current) {
      const { error } = await supabaseAdmin
        .from("founding_beta_enrollments")
        .update({
          dismissed_count: (current.dismissed_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("program", "founding_50")
      if (error) console.error("[founding-beta-action] increment_dismissed error", error.message)
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  }

  // ── accept ────────────────────────────────────────────────────────────────
  // User explicitly accepts the Founding Beta offer.
  // Calls the SECURITY DEFINER RPC which enforces the 50-user limit.
  if (action === "accept") {
    const { data: profile } = await supabaseAdmin
      .from("user_master_profiles")
      .select("email, is_test, full_name")
      .eq("user_id", user.id)
      .single()

    if ((profile as any)?.is_test === true) {
      return { statusCode: 403, body: JSON.stringify({ error: "Cuentas de prueba no pueden participar en Founding Beta" }) }
    }

    // Rollout gate — fail closed: any DB error = block acceptance
    const { data: gateCheck, error: gateError } = await supabaseAdmin
      .from("user_master_profiles")
      .select("founding_offer_enabled")
      .eq("user_id", user.id)
      .maybeSingle()
    if (gateError) {
      console.error("[founding-beta-action] gate_check error (accept)", gateError.message)
      return { statusCode: 503, body: JSON.stringify({ error: "Error al verificar elegibilidad. Intentá nuevamente." }) }
    }
    if ((gateCheck as any)?.founding_offer_enabled === false) {
      return { statusCode: 403, body: JSON.stringify({ error: "Tu acceso al Founding Beta estará disponible pronto." }) }
    }

    const email = profile?.email || user.email || ""

    const { data, error } = await supabaseAdmin.rpc("accept_founding_beta", {
      p_user_id: user.id,
      p_email: email,
      p_offer_version: "v1",
    })

    if (error) {
      if (error.message?.includes("founding_50_full")) {
        return { statusCode: 409, body: JSON.stringify({ error: "El programa ya está completo. Muchas gracias por tu interés.", program_full: true }) }
      }
      console.error("[founding-beta-action] accept error", error.message)
      return { statusCode: 500, body: JSON.stringify({ error: "Error al procesar la aceptación" }) }
    }

    // Product state is authoritative. Email failures are logged but do NOT rollback Pro.
    const resend = new Resend(process.env.RESEND_API_KEY)
    const enrollmentData = data?.[0] as any

    // founding_welcome_v1 — idempotent
    const welcomeResult = await sendFoundingEmail({
      template: "founding_welcome_v1",
      userId: user.id,
      supabaseAdmin,
      resend,
    })
    if (!welcomeResult.ok && !welcomeResult.already_sent) {
      console.error("[founding-beta-action] welcome email failed", welcomeResult.error)
    }

    // Founder acceptance alert — idempotent
    try {
      await notifyFounderMilestone({
        event: "founding_accepted",
        userId: user.id,
        userEmail: email,
        userName: (profile as any)?.full_name || undefined,
        timestamp: enrollmentData?.accepted_at || new Date().toISOString(),
        details: {
          benefit_start: enrollmentData?.benefit_start,
          benefit_end: enrollmentData?.benefit_end,
          accepted_at: enrollmentData?.accepted_at,
        },
        supabaseAdmin,
        resend,
      })
    } catch (err: any) {
      console.error("[founding-beta-action] founder accept alert failed", err?.message)
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, enrollment: enrollmentData || null }) }
  }

  return { statusCode: 400, body: JSON.stringify({ error: "Acción no procesada" }) }
}
