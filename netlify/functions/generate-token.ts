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
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;background:#0a0a0a;color:#e8e8e0;padding:40px 28px 32px">

  <!-- Logo -->
  <div style="margin-bottom:32px">
    <span style="font-size:22px;font-weight:700;color:#c9a84c;letter-spacing:-.02em">CVitae</span>
    <span style="font-size:12px;color:#555;margin-left:8px;letter-spacing:.1em;text-transform:uppercase">Empresas</span>
  </div>

  <!-- Headline -->
  <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#fff;line-height:1.2">Bienvenido/a${contactLabel} 👋</h1>
  <p style="margin:0 0 28px;color:#888;font-size:15px;line-height:1.6">Tu panel para <strong style="color:#e8e8e0">${companyName}</strong> está activo con <strong style="color:#c9a84c">${creditsLabel} créditos</strong> para empezar.</p>

  <!-- Token box -->
  <div style="background:#111;border:1px solid #c9a84c33;border-radius:12px;padding:20px 24px;margin-bottom:28px">
    <p style="margin:0 0 6px;font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:#666">Tu código de acceso</p>
    <p style="margin:0 0 8px;font-size:26px;font-family:'Courier New',monospace;font-weight:700;color:#c9a84c;letter-spacing:.08em">${token}</p>
    <p style="margin:0;font-size:12px;color:#555">Plan: <span style="color:#888;text-transform:uppercase">${planLabel}</span> · Guardalo en un lugar seguro</p>
  </div>

  <!-- CTA -->
  <a href="https://cvitae.lat/empresas" style="display:inline-block;background:#c9a84c;color:#0a0a0a;text-decoration:none;padding:13px 32px;border-radius:100px;font-weight:700;font-size:14px;letter-spacing:.01em;margin-bottom:36px">
    Ingresar al panel →
  </a>

  <!-- Quick start -->
  <div style="border-top:1px solid #1f1f1f;padding-top:28px;margin-bottom:28px">
    <p style="margin:0 0 16px;font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#555">Inicio rápido</p>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:8px 12px 8px 0;vertical-align:top;width:28px;font-size:18px">1️⃣</td>
        <td style="padding:8px 0;vertical-align:top;font-size:14px;color:#ccc;line-height:1.5">
          Ingresá con tu código en <a href="https://cvitae.lat/empresas" style="color:#c9a84c">cvitae.lat/empresas</a>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 12px 8px 0;vertical-align:top;font-size:18px">2️⃣</td>
        <td style="padding:8px 0;vertical-align:top;font-size:14px;color:#ccc;line-height:1.5">
          Creá tu primer <strong style="color:#e8e8e0">llamado / vacante</strong> — CVitae genera un link para candidatos con SEO automático
        </td>
      </tr>
      <tr>
        <td style="padding:8px 12px 8px 0;vertical-align:top;font-size:18px">3️⃣</td>
        <td style="padding:8px 0;vertical-align:top;font-size:14px;color:#ccc;line-height:1.5">
          Recibís postulaciones y también podés <strong style="color:#e8e8e0">subir CVs manualmente</strong> de candidatos referidos o de tu base anterior
        </td>
      </tr>
      <tr>
        <td style="padding:8px 12px 8px 0;vertical-align:top;font-size:18px">4️⃣</td>
        <td style="padding:8px 0;vertical-align:top;font-size:14px;color:#ccc;line-height:1.5">
          Analizá con IA — 1 crédito por CV, obtenés score ATS, fortalezas, brechas y ranking comparativo
        </td>
      </tr>
    </table>
  </div>

  <!-- Features -->
  <div style="border-top:1px solid #1f1f1f;padding-top:28px;margin-bottom:28px">
    <p style="margin:0 0 16px;font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#555">Lo que tenés disponible</p>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1a1a1a;vertical-align:top">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#e8e8e0">📋 Vacantes con SEO</p>
          <p style="margin:0;font-size:13px;color:#666;line-height:1.5">Publicá llamados en segundos. Cada vacante tiene URL propia que Google indexa — candidatos llegan sin pagar publicidad.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1a1a1a;vertical-align:top">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#e8e8e0">⚡ Análisis masivo de CVs</p>
          <p style="margin:0;font-size:13px;color:#666;line-height:1.5">Subí hasta 30 CVs de golpe. La IA los rankea, puntúa y te da el orden sugerido de entrevistas — en minutos.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1a1a1a;vertical-align:top">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#e8e8e0">🏦 Banco de candidatos</p>
          <p style="margin:0;font-size:13px;color:#666;line-height:1.5">Todos los CVs analizados quedan guardados. Buscá por habilidad o puesto en procesos anteriores — tu historial siempre disponible.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1a1a1a;vertical-align:top">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#e8e8e0">📁 Legajos digitales</p>
          <p style="margin:0;font-size:13px;color:#666;line-height:1.5">Guardá documentos de cada empleado (contrato, cédula, IPS), agregá alertas de vencimiento y llevá el historial en un solo lugar. El almacenamiento es parte de tu plan.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;vertical-align:top">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#e8e8e0">🔔 Alertas de compliance</p>
          <p style="margin:0;font-size:13px;color:#666;line-height:1.5">Recordatorios de IPS, MTESS y vencimientos de documentos — para no perder plazos legales ni pagar multas evitables.</p>
        </td>
      </tr>
    </table>
  </div>

  <!-- Credits model -->
  <div style="background:#111;border:1px solid #1f1f1f;border-radius:10px;padding:18px 20px;margin-bottom:28px">
    <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#555">Cómo funcionan los créditos</p>
    <p style="margin:0;font-size:13px;color:#888;line-height:1.6">
      Cada análisis de CV consume <strong style="color:#c9a84c">1 crédito</strong>. Los créditos no vencen — se acumulan mes a mes. El almacenamiento de legajos y documentos está incluido sin costo extra. Cuando necesites más créditos, respondé este correo o pedílos desde el panel.
    </p>
  </div>

  <!-- Tips -->
  <div style="border-top:1px solid #1f1f1f;padding-top:24px;margin-bottom:28px">
    <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#555">3 tips para aprovechar al máximo</p>
    <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.5">💡 <strong style="color:#ccc">Cargá la descripción del puesto</strong> antes de analizar — el score mejora mucho cuando la IA tiene el contexto exacto.</p>
    <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.5">💡 <strong style="color:#ccc">Usá el análisis masivo</strong> para tu base de candidatos anterior — subí los CVs que tenés archivados y compará contra el nuevo puesto.</p>
    <p style="margin:0;font-size:13px;color:#888;line-height:1.5">💡 <strong style="color:#ccc">Cuando contratés</strong>, marcá al candidato como "Contratado" y creá su legajo digital desde el mismo panel — sin exportar ni copiar datos.</p>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #1a1a1a;padding-top:20px">
    <p style="margin:0;font-size:12px;color:#444;line-height:1.6">
      ¿Dudas, sugerencias o necesitás más créditos? Respondé este correo directamente o escribinos a <a href="mailto:contacto@cvitae.lat" style="color:#c9a84c">contacto@cvitae.lat</a>.
    </p>
    <p style="margin:8px 0 0;font-size:11px;color:#333">CVitae · <a href="https://cvitae.lat" style="color:#444">cvitae.lat</a></p>
  </div>

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
