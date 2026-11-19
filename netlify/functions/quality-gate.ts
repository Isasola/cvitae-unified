import { Handler } from "@netlify/functions"

interface QualityResult {
  approved: boolean
  score: number
  reasons: string[]
  gates: {
    hasDescription: boolean
    descriptionLength: number
    hasLocation: boolean
    hasOrganization: boolean
    hasSkills: boolean
  }
}

/**
 * Evalúa la calidad de una oportunidad según criterios definidos
 * Retorna si debe aprobarse automáticamente o ir a revisión manual
 */
function evaluateQuality(opportunity: any): QualityResult {
  const gates = {
    hasDescription: false,
    descriptionLength: 0,
    hasLocation: false,
    hasOrganization: false,
    hasSkills: false,
  }

  const reasons: string[] = []
  let score = 0

  // Gate 1: Descripción existente y >300 palabras
  const description = opportunity.description || opportunity.cuerpo || ''
  const wordCount = description.trim().split(/\s+/).length
  gates.descriptionLength = wordCount
  gates.hasDescription = wordCount > 50 // Mínimo 50 palabras

  if (wordCount >= 300) {
    score += 40
  } else if (wordCount >= 150) {
    score += 20
    reasons.push(`Descripción corta (${wordCount} palabras, ideal: 300+)`)
  } else if (wordCount >= 50) {
    score += 10
    reasons.push(`Descripción muy corta (${wordCount} palabras, ideal: 300+)`)
  } else {
    reasons.push(`Descripción insuficiente (${wordCount} palabras, mínimo: 50)`)
  }

  // Gate 2: Ubicación clara
  const location = opportunity.ubicacion || opportunity.location || ''
  gates.hasLocation = location.length > 5 && !location.toLowerCase().includes('remot')

  if (gates.hasLocation) {
    score += 20
  } else if (location.length > 0) {
    score += 10
    reasons.push('Ubicación no clara o remoto sin especificar país')
  } else {
    reasons.push('Sin ubicación especificada')
  }

  // Gate 3: Organización/Empresa identificada
  const organization = opportunity.organization || opportunity.empresa || opportunity.company || ''
  gates.hasOrganization = organization.length > 2 &&
    !organization.toLowerCase().includes('confidencial') &&
    !organization.toLowerCase().includes('empresa')

  if (gates.hasOrganization) {
    score += 20
  } else {
    reasons.push('Empresa no identificada claramente')
  }

  // Gate 4: Skills o requisitos listados
  const hasSkillsArray = Array.isArray(opportunity.skills) && opportunity.skills.length > 0
  const hasRequirements = (opportunity.requirements || '').length > 50
  gates.hasSkills = hasSkillsArray || hasRequirements

  if (gates.hasSkills) {
    score += 20
  } else {
    reasons.push('Sin skills o requisitos especificados')
  }

  // Aprobar automáticamente si score >= 70 (mayoría de gates cumplidos)
  const approved = score >= 70

  return {
    approved,
    score,
    reasons,
    gates,
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { opportunity } = body

    if (!opportunity) {
      return { statusCode: 400, body: JSON.stringify({ error: "opportunity requerido" }) }
    }

    const result = evaluateQuality(opportunity)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    }
  } catch (err: any) {
    console.error("quality-gate error:", err.message)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

export { handler }
