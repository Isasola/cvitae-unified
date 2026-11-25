import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
  if (!ADMIN_PASSWORD) return { statusCode: 500, body: JSON.stringify({ error: "Server misconfigured" }) }

  try {
    const {
      password, email, company_name, token_balance, plan_type,
      ruc, contact_name, contact_phone, plan, plan_expires_at, beta_discount, notes,
      send_welcome_email = true,
    } = JSON.parse(event.body || "{}")

    if (password !== ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }
    }

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Email is required" }) }
    }
    const companyName = String(company_name || '').trim()
    if (companyName.length < 2 || companyName.length > 240) {
      return { statusCode: 400, body: JSON.stringify({ error: "Nombre de empresa requerido (2–240 caracteres)" }) }
    }

    const token = `REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${new Date().getFullYear()}`

    const supabase = makeSupabaseAdmin()

    const record: Record<string, any> = {
      email,
      company_name: companyName,
      token_balance: token_balance ?? 10,
      access_token: token,
      plan_type: plan_type || "starter",
      is_active: true,
      verification_status: "verified",
    }
    if (ruc) record.ruc = String(ruc).trim()
    if (contact_name) record.contact_name = String(contact_name).trim()
    if (contact_phone) record.contact_phone = String(contact_phone).trim()
    if (plan) record.plan = String(plan).trim()
    if (plan_expires_at) record.plan_expires_at = plan_expires_at
    if (beta_discount) record.beta_discount = String(beta_discount).trim()
    if (notes) record.notes = String(notes).trim()

    const { error } = await supabase.from("recruiter_tokens").insert([record])

    if (error) {
      console.error("Supabase insert error:", error)
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    }

    // Welcome email
    if (send_welcome_email) {
      const RESEND_KEY = process.env.RESEND_API_KEY
      if (RESEND_KEY) {
        const planLabel = plan || plan_type || "trial"
        const creditsLabel = token_balance ?? 10
        const contactLabel = contact_name ? ` para ${contact_name}` : ""
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "CVitae <contacto@cvitae.lat>",
              to: [email],
              bcc: ["contacto@cvitae.lat"],
              subject: `Tu acceso a CVitae está listo — ${companyName}`,
              html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <img src="https://cvitae.lat/logo.png" alt="CVitae" style="height:32px;margin-bottom:28px" />
  <h2 style="margin:0 0 8px;font-size:22px;font-weight:700">Bienvenido/a${contactLabel} a CVitae</h2>
  <p style="margin:0 0 20px;color:#555;font-size:15px">Tu cuenta para <strong>${companyName}</strong> está activa. Desde ahora podés publicar vacantes, recibir CVs y analizarlos con IA.</p>

  <div style="background:#f5f1e8;border-radius:12px;padding:20px 24px;margin:24px 0">
    <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#888">Tu código de acceso</p>
    <p style="margin:0;font-size:24px;font-family:monospace;font-weight:700;color:#c9a84c;letter-spacing:.08em">${token}</p>
    <p style="margin:8px 0 0;font-size:12px;color:#999">Plan: ${planLabel.toUpperCase()} · ${creditsLabel} créditos iniciales</p>
  </div>

  <a href="https://cvitae.lat/empresas" style="display:inline-block;background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:12px 28px;border-radius:100px;font-weight:600;font-size:14px;margin:4px 0 24px">
    Ingresar al panel →
  </a>

  <ol style="padding-left:20px;color:#444;font-size:14px;line-height:1.9;margin:0 0 24px">
    <li>Andá a <a href="https://cvitae.lat/empresas" style="color:#c9a84c">cvitae.lat/empresas</a></li>
    <li>Ingresá tu código de acceso: <strong style="font-family:monospace">${token}</strong></li>
    <li>Creá tu primera vacante y compartí el link con candidatos</li>
    <li>Analizá los CVs recibidos con un clic — 1 crédito por análisis</li>
  </ol>

  <p style="font-size:12px;color:#aaa;border-top:1px solid #eee;padding-top:16px;margin:0">¿Dudas o necesitás más créditos? Respondé este correo o escribinos a <a href="mailto:contacto@cvitae.lat" style="color:#c9a84c">contacto@cvitae.lat</a>.</p>
</div>`,
            }),
          })
        } catch (emailErr) {
          console.error("generate-token: welcome email error (non-fatal):", emailErr)
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ token }) }

  } catch (error: any) {
    console.error("generate-token error:", error)
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "Internal server error" }) }
  }
}

export { handler }
