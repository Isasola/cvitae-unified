/**
 * test-bedrock-multimodal.mjs
 *
 * Integration test: verifies Bedrock extract_file mode BEFORE any push.
 * Never prints personal data from CV fixtures (name, email, skills, rawText, etc.).
 *
 * Usage:
 *   node scripts/test-bedrock-multimodal.mjs
 *
 * Requires local .env.local with CVITAE_AWS_ACCESS_KEY_ID, CVITAE_AWS_SECRET_ACCESS_KEY,
 * CVITAE_AWS_REGION (or defaults to us-east-1).
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { BedrockRuntimeClient, InvokeModelCommand, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

// ── Load env ─────────────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#') && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
  }
}

const MODEL_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0'
const region = process.env.CVITAE_AWS_REGION || 'us-east-1'
const accessKeyId = process.env.CVITAE_AWS_ACCESS_KEY_ID
const secretAccessKey = process.env.CVITAE_AWS_SECRET_ACCESS_KEY

if (!accessKeyId || !secretAccessKey) {
  console.error('ERROR: CVITAE_AWS_ACCESS_KEY_ID / CVITAE_AWS_SECRET_ACCESS_KEY not set in .env.local')
  process.exit(1)
}

const client = new BedrockRuntimeClient({ region, credentials: { accessKeyId, secretAccessKey } })

const SYSTEM = "Sos un analista experto de CVs latinoamericano. Respondés ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown."
const PROMPT = `Analizá el documento o imagen de CV adjunto.

Respondé ÚNICAMENTE con este JSON:
{
  "rawText": "transcripción completa del texto visible",
  "extracted": {
    "full_name": "nombre o null",
    "email": "email o null",
    "professional_title": "título o null",
    "skills": [],
    "location": "ciudad, país o null",
    "seniority": "junior|semi-senior|senior",
    "education": [],
    "experience": [],
    "languages": []
  }
}
REGLAS: solo info visible. Campos ausentes = null o []. NUNCA inventar.`

function extractJSON(text) {
  const cb = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (cb) return JSON.parse(cb[1].trim())
  const m = text.match(/\{[\s\S]*\}/)
  if (m) return JSON.parse(m[0])
  return JSON.parse(text.trim())
}

// Count non-null/non-empty fields — without printing their values
function countNonEmptyFields(extracted) {
  if (!extracted || typeof extracted !== 'object') return 0
  return Object.values(extracted).filter(v =>
    v !== null && v !== undefined && v !== '' &&
    !(Array.isArray(v) && v.length === 0)
  ).length
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Synthetic JPEG (minimal CV image)
// ─────────────────────────────────────────────────────────────────────────────
async function testImageBlock() {
  console.log('\n[1] Testing JPEG image block (InvokeModelCommand)...')

  const fixturesDir = resolve(process.cwd(), '.local-fixtures')
  let jpegBase64

  const jpgFixtures = ['cv-test.jpg', 'test-cv.jpg', 'cv.jpg']
  const found = existsSync(fixturesDir) && jpgFixtures.find(f => existsSync(resolve(fixturesDir, f)))
  if (found) {
    jpegBase64 = readFileSync(resolve(fixturesDir, found)).toString('base64')
    console.log('  Using fixture: [jpg file present]')
  } else {
    jpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABAMC/8QAFRABAQAAAAAAAAAAAAAAAAAAAAn/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AiQAB/9k='
    console.log('  Using synthetic minimal JPEG (API connectivity test)')
  }

  const resp = await client.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
        { type: 'text', text: PROMPT }
      ]}]
    }),
  }))

  const responseText = JSON.parse(new TextDecoder().decode(resp.body))?.content[0]?.text ?? ''
  const parsed = extractJSON(responseText)
  if (!parsed || typeof parsed !== 'object') throw new Error('Response is not a JSON object')
  if (!('rawText' in parsed) && !('full_name' in parsed)) throw new Error('Response missing rawText or extracted')

  const rawLen = String(parsed.rawText || '').length
  const nonEmptyCount = countNonEmptyFields(parsed.extracted || parsed)
  console.log(`  [PASS] image extraction — rawText: ${rawLen} chars, non-empty fields: ${nonEmptyCount}/9`)
  return parsed
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: PDF document (ConverseCommand DocumentBlock)
// ─────────────────────────────────────────────────────────────────────────────
async function testDocumentBlock() {
  console.log('\n[2] Testing PDF document block (ConverseCommand)...')

  const fixturesDir = resolve(process.cwd(), '.local-fixtures')
  let pdfBytes

  if (existsSync(fixturesDir)) {
    const { readdirSync } = await import('node:fs')
    const files = readdirSync(fixturesDir).filter(f => f.toLowerCase().endsWith('.pdf'))
    if (files.length > 0) {
      pdfBytes = readFileSync(resolve(fixturesDir, files[0]))
      console.log(`  Using fixture: [pdf ${(pdfBytes.length / 1024).toFixed(0)} KB]`)
    }
  }

  if (!pdfBytes) {
    const pdfContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (Test CV Document) Tj ET\nendstream\nendobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000274 00000 n \n0000000370 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n441\n%%EOF'
    pdfBytes = Buffer.from(pdfContent)
    console.log('  Using synthetic minimal PDF')
  }

  const resp = await client.send(new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [
      { document: { format: 'pdf', name: 'cv', source: { bytes: pdfBytes } } },
      { text: PROMPT }
    ]}],
    system: [{ text: SYSTEM }],
    inferenceConfig: { maxTokens: 2500 }
  }))

  const responseText = (resp.output?.message?.content?.[0])?.text ?? ''
  const parsed = extractJSON(responseText)
  if (!parsed || typeof parsed !== 'object') throw new Error('Response is not a JSON object')

  const rawLen = String(parsed.rawText || '').length
  const nonEmptyCount = countNonEmptyFields(parsed.extracted || parsed)
  console.log(`  [PASS] document extraction — rawText: ${rawLen} chars, non-empty fields: ${nonEmptyCount}/9`)
  return parsed
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Scanned PDF from .local-fixtures (if available)
// ─────────────────────────────────────────────────────────────────────────────
async function testScannedPDF() {
  const fixturesDir = resolve(process.cwd(), '.local-fixtures')
  if (!existsSync(fixturesDir)) {
    console.log('\n[3] SKIP: .local-fixtures/ not found')
    return
  }
  const { readdirSync } = await import('node:fs')
  const files = readdirSync(fixturesDir).filter(f => f.toLowerCase().endsWith('.pdf'))
  if (files.length === 0) {
    console.log('\n[3] SKIP: No PDFs in .local-fixtures/')
    return
  }

  const pdfBytes = readFileSync(resolve(fixturesDir, files[0]))
  console.log(`\n[3] Testing scanned PDF: [${(pdfBytes.length / 1024).toFixed(0)} KB fixture]`)

  const resp = await client.send(new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: 'user', content: [
      { document: { format: 'pdf', name: 'cv', source: { bytes: pdfBytes } } },
      { text: PROMPT }
    ]}],
    system: [{ text: SYSTEM }],
    inferenceConfig: { maxTokens: 2500 }
  }))

  const responseText = (resp.output?.message?.content?.[0])?.text ?? ''
  const parsed = extractJSON(responseText)

  const rawLen = String(parsed.rawText || '').length
  const nonEmptyCount = countNonEmptyFields(parsed.extracted || parsed)

  if (rawLen < 20) {
    console.log(`  WARN: rawText is very short (${rawLen} chars) — PDF may be unreadable or model hit limits`)
  } else {
    console.log(`  [PASS] scanned PDF extraction — rawText: ${rawLen} chars, non-empty fields: ${nonEmptyCount}/9`)
  }
  return parsed
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Bedrock Multimodal Integration Test ===')
  console.log(`Model: ${MODEL_ID}`)
  console.log(`Region: ${region}`)
  console.log('Credentials: configured')

  let pass = 0, fail = 0

  for (const [name, fn] of [
    ['Image block', testImageBlock],
    ['Document block', testDocumentBlock],
    ['Scanned PDF fixture', testScannedPDF],
  ]) {
    try {
      await fn()
      pass++
    } catch (err) {
      console.error(`\n  FAIL [${name}]: ${err.message}`)
      fail++
    }
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
  if (fail > 0) process.exit(1)
}

main()
