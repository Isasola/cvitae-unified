// netlify/functions/founding-beta-action.ts
// Authenticated endpoint for Founding Beta program interactions.
// Supports: accept, get_status, mark_offered, increment_dismissed
//
// "Ahora no" (dismiss) is frontend-only — no API call needed.
// This function handles explicit accept, status polling, and offer tracking.

import { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { sendFoundingEmail, notifyFounder } from "./lib/founding-mailer"

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
    // Check if test account — test accounts are not eligible
    const { data: profileCheck } = await supabaseAdmin
      .from("user_master_profiles")
      .select("is_test")
      .eq("user_id", user.id)
      .maybeSingle()

    if (profileCheck?.is_test === true) {
      return { statusCode: 200, body: JSON.stringify({ enrollment: null, program_full: false, slots_remaining: 50, ineligible: true, reason: "test_account" }) }
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

    // Test accounts are not eligible for Founding Beta
    if (profile?.is_test === true) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: "test_account" }) }
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

      // Founder notification — awaited; failure logged but does not block user
      try {
        await notifyFounder({
          userEmail: user.email || email,
          userName: profile?.full_name || undefined,
          signupAt: user.created_at,
          source: "founding_beta_offer",
          resend,
        })
      } catch (err: any) {
        console.error("[founding-beta-action] notify error", err?.message)
      }

      // Founding offer email — awaited; failure logged but does not block the modal
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
      .select("email, is_test")
      .eq("user_id", user.id)
      .single()

    // Test accounts cannot accept Founding Beta
    if ((profile as any)?.is_test === true) {
      return { statusCode: 403, body: JSON.stringify({ error: "Cuentas de prueba no pueden participar en Founding Beta" }) }
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

    return { statusCode: 200, body: JSON.stringify({ ok: true, enrollment: data?.[0] || null }) }
  }

  return { statusCode: 400, body: JSON.stringify({ error: "Acción no procesada" }) }
}
