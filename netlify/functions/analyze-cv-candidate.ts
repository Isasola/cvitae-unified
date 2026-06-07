import { Handler } from "@netlify/functions"
import Anthropic from "@anthropic-ai/sdk"

interface CandidateAnalysis {
  atsScore: number
  strengths: string[]
  criticalImprovements: string[]
}

function extractJSON(text: string): any {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) return JSON.parse(codeBlockMatch[1].trim())
  return JSON.parse(text.trim())
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { cvText, mode } = JSON.parse(event.body || "{}")
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

    const client = new Anthropic({ apiKey })
    if (!cvText || cvText.trim().length === 0) return { statusCode: 400, body: JSON.stringify({ error: "CV text is required" }) }

    let prompt = ""
    if (mode === 'extract') {
      prompt = `Extraé la información del siguiente CV y respondé ÚNICAMENTE con este JSON válido, sin texto extra, sin markdown:
{
  "full_name": "nombre completo",
  "email": "email detectado o vacío",
  "professional_title": "título profesional",
  "skills": ["skill1", "skill2"],
  "location": "ciudad, país",
  "seniority": "junior|semi-senior|senior",
  "education": [{ "institution": "...", "degree": "...", "year": 2020 }],
  "experience": [{ "company": "...", "position": "...", "years": 2, "achievements": ["..."] }],
  "languages": [{ "language": "...", "level": "básico|intermedio|avanzado|nativo" }]
}
CV:
${cvText}`
    } else {
      prompt = `Analizá este CV y devolvé un JSON con: atsScore (0-100), strengths (array strings), criticalImprovements (array strings). CV: ${cvText}`
    }

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const analysis = extractJSON(responseText)

    return { statusCode: 200, body: JSON.stringify(analysis) }
  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}

export { handler }
