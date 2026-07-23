import { jsPDF } from 'jspdf'
import { handler as extractPdfText } from '../netlify/functions/extract-pdf-text'
import { handler as analyzeCandidate } from '../netlify/functions/analyze-cv-candidate'
import { handler as compareCandidates } from '../netlify/functions/compare-candidates'
import { extractCvText } from '../netlify/functions/submit-lead'
import { handler as recommendCourses } from '../netlify/functions/gemini-courses'

async function invoke(handler: any, body: unknown) {
  return await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify(body),
  }, {} as any)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const cvText = [
  'María González',
  'Ingeniera de software con cinco años de experiencia en React, TypeScript, Node.js y PostgreSQL.',
  'Lideró tres proyectos y redujo los tiempos de carga en cuarenta por ciento.',
  'Licenciada en Ingeniería Informática. Inglés avanzado.',
].join('\n')

const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
pdf.text(pdf.splitTextToSize(cvText, 170), 20, 20)
const pdfBase64 = Buffer.from(pdf.output('arraybuffer')).toString('base64')

const extracted = await invoke(extractPdfText, { pdfBase64, fileName: 'cv-prueba.pdf' })
assert(extracted?.statusCode === 200, `Extractor PDF respondió ${extracted?.statusCode}: ${extracted?.body}`)
const extractedBody = JSON.parse(extracted.body)
assert(extractedBody.success === true, 'Extractor PDF no confirmó success')
assert(extractedBody.text.includes('Ingeniera de software'), 'Extractor PDF perdió el contenido esperado')

const applicationText = await extractCvText(pdfBase64)
assert(applicationText.includes('Ingeniera de software'), 'La postulación perdió el texto del CV')

const invalidPdf = await invoke(extractPdfText, { pdfBase64: 'aW52YWxpZA==', fileName: 'invalido.pdf' })
assert(invalidPdf?.statusCode === 400, 'Un archivo inválido debe responder 400')

const recruiterWithoutToken = await invoke(analyzeCandidate, {
  cvText,
  mode: 'analyze',
})
assert(recruiterWithoutToken?.statusCode === 401, 'El análisis empresarial debe exigir token')

const comparisonWithoutToken = await invoke(compareCandidates, {
  mode: 'batch_summary',
  candidates: [{ name: 'A' }, { name: 'B' }],
})
assert(comparisonWithoutToken?.statusCode === 403, 'La comparación empresarial debe rechazar token ausente')

const coursesWithoutSession = await invoke(recommendCourses, {
  profileSkills: ['React'],
  missingSkills: ['TypeScript'],
})
assert(coursesWithoutSession?.statusCode === 401, 'Los cursos con Gemini deben exigir una sesión válida')

console.log('Critical flow checks passed: PDF, invalid input, recruiter auth, comparison auth, Gemini auth.')
