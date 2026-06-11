import { Handler } from "@netlify/functions"
import Anthropic from "@anthropic-ai/sdk"

function extractJSON(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlock) return JSON.parse(codeBlock[1].trim())
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return JSON.parse(jsonMatch[0])
  return JSON.parse(text.trim())
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }
  try {
    const { cvText, mode, jobTitle, jobDescription } = JSON.parse(event.body || "{}")
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")
    if (!cvText?.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: "CV text is required" }) }
    }

    const client = new Anthropic({ apiKey })
    const model = mode === 'batch_analyze' ? "claude-3-5-sonnet-20241022" : "claude-3-5-haiku-20241022"

    let prompt = ""

    if (mode === 'extract') {
      prompt = `Extraé la información del siguiente CV. Respondé ÚNICAMENTE con JSON válido, sin texto extra ni markdown.
{
  "full_name": "nombre completo o null",
  "email": "email o null",
  "professional_title": "título profesional",
  "skills": ["skill1", "skill2"],
  "location": "ciudad, país o null",
  "seniority": "junior|semi-senior|senior",
  "education": [{ "institution": "...", "degree": "...", "year": 2020 }],
  "experience": [{ "company": "...", "position": "...", "years": 2, "achievements": ["..."] }],
  "languages": [{ "language": "...", "level": "básico|intermedio|avanzado|nativo" }]
}
CV:
${cvText}`

    } else if (mode === 'batch_analyze') {
      prompt = `Sos un reclutador experto evaluando un CV para el siguiente puesto.

PUESTO: ${jobTitle || 'No especificado'}
DESCRIPCIÓN:
${jobDescription || 'No especificada'}

CV DEL CANDIDATO:
${cvText}

Evaluá este CV en función del puesto. Respondé ÚNICAMENTE con JSON válido:
{
  "candidateName": "nombre detectado o null",
  "atsScore": <0-100, calidad general del CV>,
  "fitScore": <0-100, adecuación específica al puesto>,
  "recommendation": <"Llamar" si fitScore>=75, "Considerar" si fitScore>=50, "No llamar" si fitScore<50>,
  "summary": "3-4 líneas sobre el candidato y su adecuación al puesto",
  "strengths": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],
  "criticalImprovements": ["debilidad 1", "debilidad 2", "debilidad 3"],
  "keyMatches": ["skill que tiene Y el puesto requiere", ...máx 5],
  "keyGaps": ["skill que el puesto requiere Y NO tiene", ...máx 5]
}`

    } else {
      prompt = `Analizá este CV como reclutador experto. Respondé ÚNICAMENTE con JSON válido:
{
  "atsScore": <0-100>,
  "recommendation": <"Llamar"|"Considerar"|"No llamar">,
  "summary": "máximo 4 líneas resumiendo el perfil",
  "strengths": ["fortaleza 1", "fortaleza 2", "fortaleza 3"],
  "criticalImprovements": ["mejora 1", "mejora 2", "mejora 3"]
}
CV:
${cvText}`
    }

    const message = await client.messages.create({
      model,
      max_tokens: mode === 'batch_analyze' ? 1500 : 1000,
      system: "Sos un reclutador experto latinoamericano. Respondés ÚNICAMENTE con JSON válido y bien formateado, sin texto adicional, sin markdown.",
      messages: [{ role: "user", content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const result = extractJSON(responseText)
    return { statusCode: 200, body: JSON.stringify(result) }

  } catch (error: any) {
    console.error("analyze-cv-candidate error:", error.message)
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}

export { handler }
