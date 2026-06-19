// Analiza todos los postulantes de una vacante en paralelo y genera ranking + resumen ejecutivo
// ⚠️ Puede tardar 20-60s según volumen — mover a Lambda si hay >15 postulantes
import { Handler } from "@netlify/functions"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { makeSupabaseAdmin } from "./_supabase"

const MODEL_ID = "global.anthropic.claude-sonnet-4-6"
const bedrock = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

function extractJSON(text: string): any {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (block) return JSON.parse(block[1].trim())
  const obj = text.match(/\{[\s\S]*\}/)
  if (obj) return JSON.parse(obj[0])
  return JSON.parse(text.trim())
}

async function callBedrock(system: string, user: string, maxTokens: number): Promise<string> {
  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  })
  const res = await bedrock.send(cmd)
  const parsed = JSON.parse(new TextDecoder().decode(res.body))
  return parsed.content[0]?.text ?? ""
}

const SYSTEM = "Sos un director de RRHH latinoamericano experto. Respondés ÚNICAMENTE con JSON válido y bien formateado, sin texto adicional ni markdown."

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  try {
    const { token, vacancy_id } = JSON.parse(event.body || "{}")

    if (!token?.trim() || !vacancy_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "token y vacancy_id requeridos" }) }
    }

    const supabase = makeSupabaseAdmin()

    // Validate token and ownership of vacancy
    const { data: tokenData, error: tokenErr } = await supabase
      .from("recruiter_tokens")
      .select("id, token_balance")
      .eq("access_token", token.trim())
      .eq("is_active", true)
      .single()

    if (tokenErr || !tokenData) {
      return { statusCode: 403, body: JSON.stringify({ error: "Token inválido" }) }
    }

    const { data: vacancy, error: vacErr } = await supabase
      .from("recruiter_vacancies")
      .select("id, title, description, requirements, company")
      .eq("id", vacancy_id)
      .eq("recruiter_token_id", tokenData.id)
      .single()

    if (vacErr || !vacancy) {
      return { statusCode: 403, body: JSON.stringify({ error: "Vacante no encontrada o sin acceso" }) }
    }

    // Fetch applicants that have cv_text and haven't been analyzed yet
    const { data: applicants, error: appErr } = await supabase
      .from("vacancy_applications")
      .select("id, name, email, cv_text, cover_letter")
      .eq("vacancy_id", vacancy_id)
      .not("cv_text", "is", null)
      .order("applied_at", { ascending: true })
      .limit(30)

    if (appErr || !applicants || applicants.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ results: [], summary: null, message: "Sin postulantes con CV para analizar" }) }
    }

    const jobContext = `PUESTO: ${vacancy.title}\nEMPRESA: ${vacancy.company}\nDESCRIPCIÓN:\n${vacancy.description}\nREQUISITOS:\n${vacancy.requirements}`

    // Analyze all applicants in parallel
    const analysisPromises = applicants.map(async (a) => {
      try {
        const text = await callBedrock(
          SYSTEM,
          `Sos un reclutador experto evaluando un CV para el siguiente puesto.\n\n${jobContext}\n\nCV DEL CANDIDATO (${a.name}):\n${(a.cv_text || "").substring(0, 4000)}${a.cover_letter ? `\n\nCARTA DE INTERÉS:\n${a.cover_letter}` : ""}\n\nEvaluá este CV en función del puesto. Respondé ÚNICAMENTE con JSON válido:\n{\n  "atsScore": <0-100, calidad general del CV>,\n  "fitScore": <0-100, adecuación específica al puesto>,\n  "recommendation": <"Llamar" si fitScore>=75, "Considerar" si fitScore>=50, "No llamar" si fitScore<50>,\n  "summary": "3-4 líneas sobre el candidato y su adecuación al puesto",\n  "strengths": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],\n  "keyMatches": ["skill que tiene Y el puesto requiere", "..."],\n  "keyGaps": ["skill que el puesto requiere Y no tiene", "..."]\n}`,
          1200
        )
        const result = extractJSON(text)
        return { applicantId: a.id, name: a.name, email: a.email, result, ok: true }
      } catch (e: any) {
        console.error(`Analysis failed for ${a.name}:`, e.message)
        return { applicantId: a.id, name: a.name, email: a.email, result: null, ok: false }
      }
    })

    const analysisResults = await Promise.all(analysisPromises)
    const successful = analysisResults.filter(r => r.ok && r.result)

    // Persist results to DB
    await Promise.all(
      successful.map(({ applicantId, result }) =>
        supabase
          .from("vacancy_applications")
          .update({
            ats_score: result.atsScore ?? null,
            fit_score: result.fitScore ?? null,
            recommendation: result.recommendation ?? null,
            ai_summary: result.summary ?? null,
            strengths: result.strengths ?? [],
            key_matches: result.keyMatches ?? [],
            key_gaps: result.keyGaps ?? [],
            analyzed_at: new Date().toISOString(),
          })
          .eq("id", applicantId)
      )
    )

    // Build executive summary over all results
    let summary = null
    if (successful.length >= 2) {
      const ranked = successful
        .filter(r => r.result?.fitScore !== undefined)
        .sort((a, b) => (b.result.fitScore ?? 0) - (a.result.fitScore ?? 0))

      const candidatesText = ranked
        .map((r, i) =>
          `${i + 1}. ${r.name} | Fit: ${r.result.fitScore}/100 | ATS: ${r.result.atsScore}/100 | Decisión: ${r.result.recommendation}\n   Matches: ${(r.result.keyMatches || []).join(", ") || "—"}\n   Gaps: ${(r.result.keyGaps || []).join(", ") || "—"}`
        )
        .join("\n\n")

      try {
        const summaryText = await callBedrock(
          SYSTEM,
          `Sos el director de RRHH que acaba de revisar ${ranked.length} candidatos para: "${vacancy.title}" en ${vacancy.company}.\n\n${jobContext}\n\nRESULTADOS (ordenados por fit):\n${candidatesText}\n\nRespondé ÚNICAMENTE con JSON:\n{\n  "executiveSummary": "Diagnóstico general del pool en 3-4 oraciones. ¿Es un pool fuerte o débil? ¿Hay candidatos claros o el fit es mediocre en general?",\n  "topPick": "Nombre del candidato #1 y por qué es la elección clara (2 oraciones)",\n  "callList": ["nombre 1", "nombre 2", "nombre 3"],\n  "redFlag": "Si hay algo preocupante del pool o de algún candidato que el cliente debe saber, mencionalo. Si no hay, dejá null.",\n  "nextStep": "Recomendación concreta de qué hacer ahora: entrevistar a X y Y esta semana, pedir referencia de Z, etc."\n}`,
          1200
        )
        summary = extractJSON(summaryText)
      } catch (e: any) {
        console.error("Summary generation failed:", e.message)
      }
    }

    // Return ranked results
    const ranked = successful
      .map(r => ({
        applicantId: r.applicantId,
        name: r.name,
        email: r.email,
        atsScore: r.result.atsScore,
        fitScore: r.result.fitScore,
        recommendation: r.result.recommendation,
        summary: r.result.summary,
        strengths: r.result.strengths || [],
        keyMatches: r.result.keyMatches || [],
        keyGaps: r.result.keyGaps || [],
      }))
      .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))

    return {
      statusCode: 200,
      body: JSON.stringify({
        results: ranked,
        summary,
        analyzed: successful.length,
        failed: analysisResults.filter(r => !r.ok).length,
      }),
    }
  } catch (err: any) {
    console.error("analyze-vacancy-applicants error:", err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
