import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { state, reset, opportunity } from './b2c-application-boundary'

// Execute the real normalizer and handler. Only Supabase/auth transport and
// Bedrock are local boundaries; no remote provider, database or network calls.
const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild')
const output = resolve('.cvitae-state/application-claim-grounding')
mkdirSync(output, { recursive: true })
const report: any = {
  status: 'RUNNING', runtime: process.version,
  regression: 'A nonnumeric CV claim survived with a known but unrelated confirmed evidence ID.',
  policy: 'Copy complete evidence values, with whitespace formatting only. Distinct facts need distinct blocks; multiple IDs must corroborate the same literal value.',
  cases: [], openLocalLimits: [],
  limits: [
    'LOCAL fixture evidence, not Bedrock, PostgreSQL/RLS/atomicity or PROD validation.',
    'CV free paraphrases remain rejected; REQUIREMENT equivalent phrasing is assessed by the existing semantic provider, locally substituted with declared responses.',
    'confirmedEvidence retains its existing upstream 2000-character contract; this guard does not claim to recover upstream omitted content.',
    'Historical documents remain immutable history; current prepare regenerates with versioned contract and legacy accept is blocked until re-prepared.',
  ],
}
function record(name: string) { report.cases.push({ name, status: 'PASS' }); console.log(`PASS ${name}`) }
const boundaryPath = pathToFileURL(resolve('scripts/b2c-application-boundary.ts')).href
await build({
  entryPoints: ['netlify/functions/application-workspace.ts'], outfile: resolve(output, 'handler.mjs'),
  bundle: true, platform: 'node', format: 'esm', packages: 'external',
  plugins: [{ name: 'local-external-boundaries', setup(builder: any) {
    builder.onResolve({ filter: /\/\_supabase$|^\.\/_supabase$|^\.\.\/_supabase$/ }, () => ({ path: 'supabase', namespace: 'boundary' }))
    builder.onResolve({ filter: /^@aws-sdk\/client-bedrock-runtime$/ }, () => ({ path: 'bedrock', namespace: 'boundary' }))
    builder.onResolve({ filter: /^file:\/\/\/.+b2c-application-boundary\.ts$/ }, () => ({ path: boundaryPath, external: true }))
    builder.onLoad({ filter: /.*/, namespace: 'boundary' }, (args: any) => ({ loader: 'ts', contents: args.path === 'supabase'
      ? `import {database,anonymous} from ${JSON.stringify(boundaryPath)};export const makeSupabaseAdmin=()=>database;export const makeSupabaseAnon=()=>anonymous;`
      : `export class InvokeModelCommand{constructor(input){this.input=input}};export class BedrockRuntimeClient{async send(command){globalThis.__groundingCalls++;const prompt=JSON.parse(command.input.body).messages[0].content;const semantic=prompt.startsWith("REQUIREMENT_SEMANTIC_ASSESSMENT");if(semantic){globalThis.__semanticCalls++;globalThis.__semanticPrompt=prompt}else{globalThis.__groundingPrompt=prompt};return{body:new TextEncoder().encode(JSON.stringify({content:[{text:JSON.stringify(semantic?globalThis.__semanticResponse(prompt):globalThis.__groundingResult)}]}))}}}` }))
  } }],
})
const { handler, normalizeApplicationResult, requirementInputs } = await import(pathToFileURL(resolve(output, 'handler.mjs')).href)
const facts = [
  { id: 'identity-a', category: 'identity', value: 'Candidata Local A' },
  { id: 'title-a', category: 'title', value: 'Analista de datos' },
  { id: 'summary-a', category: 'summary', value: 'Análisis de datos' },
]
const fixture = {
  requirements: [
    { text: 'Análisis de datos', importance: 'essential', status: 'supported', evidenceIds: ['summary-a'] },
    { text: 'Inglés avanzado', importance: 'essential', status: 'not_evidenced', evidenceIds: [] },
  ],
  cvBlocks: [
    { section: 'header', kind: 'name', text: 'Candidata Local A', evidenceIds: ['identity-a'] },
    { section: 'header', kind: 'headline', text: 'Analista de datos', evidenceIds: ['title-a'] },
    { section: 'summary', kind: 'paragraph', text: 'Análisis de datos', evidenceIds: ['summary-a'] },
  ],
  coverBlocks: [{ text: 'Soy CEO inventado', evidenceIds: ['identity-a'] }, { text: 'Tengo inglés avanzado', evidenceIds: ['summary-a'] }],
}
const source = '# Candidata Local A\nExperiencia en Empresa Inventada; inglés avanzado; 99 años.'
// Named fixture oracle for the model boundary; not a keyword classifier in production.
function decisionsFor(inputs: any[]) {
  return inputs.map((item) => {
    const supporting = item.candidates.filter((fact: any) =>
      (item.text === 'Análisis de datos' && fact.value === 'Análisis de datos')
      || (item.text === 'Experience managing projects' && fact.value === 'Led implementation of X across three teams, coordinating milestones and delivery.'))
    return { requirementId: item.id, requirementText: item.text, status: supporting.length ? 'supported' : 'not_evidenced',
      evidenceIds: supporting.map((f: any) => f.id), evidenceQuotes: supporting.map((f: any) => ({ evidenceId: f.id, value: f.value })),
      rationale: supporting.length ? 'The cited confirmed activity demonstrates the requested competency.' : 'The confirmed facts do not establish the requested competency.' }
  })
}
function assessment(input: any, evidence = facts, jobText = opportunity.description) {
  const inputs = requirementInputs(input, evidence, jobText)
  return { contract: 'confirmed-semantic-v1', inputHash: createHash('sha256').update(JSON.stringify(inputs)).digest('hex'), decisions: decisionsFor(inputs) }
}
const normalize = (input: any, evidence: any[] = facts, proof: any = assessment(input, evidence)) => normalizeApplicationResult(input, evidence, source, opportunity.description, proof)
function omitted(name: string, text: string, ids: string[], evidence = facts) {
  const input = structuredClone(fixture)
  input.cvBlocks.push({ section: 'other', kind: 'bullet', text, evidenceIds: ids })
  const result = normalize(input, evidence)
  assert.equal(result.cvBlocks.length, fixture.cvBlocks.length)
  assert.equal(result.cvBlocks.some((block: any) => block.section === 'other'), false)
  record(name)
}

try {
  const valid = normalize(fixture)
  assert.deepEqual(valid.cvBlocks.map((block: any) => block.text), facts.map(item => item.value))
  assert.equal(valid.safetyChecks.candidate_claims_literal_evidence_backed, true)
  assert.doesNotMatch(valid.coverMessage, /CEO inventado|Tengo inglés avanzado/)
  record('complete literal confirmed facts survive; server cover excludes model prose')

  omitted('known unrelated ID cannot authorize nonnumeric language claim', 'Inglés avanzado', ['summary-a'])
  omitted('known ID cannot authorize employer', 'Trabajé en Empresa Inventada', ['summary-a'])
  omitted('known ID cannot authorize job title or qualification', 'Directora experta de datos', ['title-a'])
  omitted('known ID cannot authorize language level', 'Inglés: C2', ['summary-a'])
  omitted('source CV does not authorize candidate facts', 'Experiencia en Empresa Inventada', ['summary-a'])
  omitted('unknown evidence ID rejected', 'Análisis de datos', ['unknown'])
  omitted('known plus unknown evidence ID rejected', 'Análisis de datos', ['summary-a', 'unknown'])
  omitted('missing evidence ID rejected', 'Análisis de datos', [])
  omitted('unrelated additional known ID cannot masquerade as corroboration', 'Análisis de datos', ['summary-a', 'title-a'])

  const quantified = { id: 'achievement', category: 'achievement', value: 'Reduje errores un 12% en 2024 durante 2 años.' }
  for (const [name, text] of [
    ['numeric token overlap cannot authorize a different quantity', 'Reduje errores un 2% en 2024 durante 12 años.'],
    ['numeric substring cannot authorize quantity', 'Reduje errores un 1% en 2024 durante 2 años.'],
    ['date cannot change', 'Reduje errores un 12% en 2025 durante 2 años.'],
    ['qualifier cannot be added with unchanged numeric tokens', 'Reduje extraordinariamente errores un 12% en 2024 durante 2 años.'],
  ]) omitted(name, text, ['achievement'], [...facts, quantified])

  const negated = { id: 'language', category: 'language', value: 'No tengo inglés avanzado.' }
  omitted('substring cannot remove explicit negation', 'inglés avanzado', ['language'], [...facts, negated])
  const negativeInput = structuredClone(fixture)
  negativeInput.cvBlocks.push({ section: 'other', kind: 'bullet', text: negated.value, evidenceIds: ['language'] })
  assert.equal(normalize(negativeInput, [...facts, negated]).cvBlocks.at(-1).text, negated.value)
  record('complete negative evidence preserves negation')

  const employment = { id: 'employment', category: 'experience', value: 'Analista — Empresa Real — 2020–2024' }
  omitted('employer cannot change inside backed experience', 'Analista — Otra Empresa — 2020–2024', ['employment'], [...facts, employment])
  omitted('complete experience cannot be shortened to title', 'Analista', ['employment'], [...facts, employment])
  const factualLiterals = [quantified, employment, { id: 'level', category: 'language', value: 'Inglés: intermedio (B1)' }, { id: 'education', category: 'education', value: 'Licenciatura — Universidad Real — 2023' }]
  const literalInput = structuredClone(fixture)
  for (const item of factualLiterals) literalInput.cvBlocks.push({ section: 'other', kind: 'bullet', text: item.value, evidenceIds: [item.id] })
  assert.deepEqual(normalize(literalInput, [...facts, ...factualLiterals]).cvBlocks.slice(3).map((block: any) => block.text), factualLiterals.map(item => item.value))
  record('complete numeric, employer, date, level and education literals survive unchanged')
  const duplicate = { id: 'summary-copy', category: 'summary', value: 'Análisis de datos' }
  const corroborated = structuredClone(fixture)
  corroborated.cvBlocks[2].evidenceIds.push(duplicate.id)
  assert.deepEqual(normalize(corroborated, [...facts, duplicate]).cvBlocks[2].evidenceIds, ['summary-a', 'summary-copy'])
  record('multiple IDs safely corroborate one complete literal value')

  for (const [name, nameBlock, evidence] of [
    ['wrong name cannot cite known identity', { text: 'Otra Persona', evidenceIds: ['identity-a'] }, facts],
    ['name cannot cite identity plus unrelated facts', { text: 'Candidata Local A', evidenceIds: ['identity-a', 'title-a'] }, facts],
    ['name cannot be a literal nonidentity fact', { text: 'Analista de datos', evidenceIds: ['title-a'] }, facts],
    ['name requires header section', { section: 'other' }, facts],
    ['nonidentity corroboration cannot authorize a name', { evidenceIds: ['identity-a', 'name-skill'] }, [...facts, { id: 'name-skill', category: 'skill', value: 'Candidata Local A' }]],
  ] as const) {
    const input = structuredClone(fixture)
    Object.assign(input.cvBlocks[0], nameBlock)
    assert.throws(() => normalize(input, [...evidence]), /La preparación no produjo un CV suficientemente respaldado/)
    record(name)
  }

  const spaced = structuredClone(fixture)
  spaced.cvBlocks[2].text = '  Análisis\n de\t datos  '
  assert.equal(normalize(spaced).cvBlocks[2].text, 'Análisis de datos')
  record('whitespace formatting preserves complete literal fact')
  omitted('case changes do not count as literal support', 'ANÁLISIS DE DATOS', ['summary-a'])
  omitted('accent removal does not count as literal support', 'Analisis de datos', ['summary-a'])
  omitted('valid free paraphrase is conservatively rejected', 'Analizo datos', ['summary-a'])
  const longFact = { id: 'long', category: 'summary', value: `${'x'.repeat(1200)} no tengo inglés avanzado` }
  omitted('overlong complete fact cannot be truncated', longFact.value, ['long'], [...facts, longFact])
  omitted('overlong evidence prefix cannot become the whole fact', 'x'.repeat(1200), ['long'], [...facts, longFact])
  const tagged = { id: 'tagged', category: 'language', value: '<no tengo> inglés avanzado' }
  omitted('sanitizer cannot remove factual content from confirmed value', 'inglés avanzado', ['tagged'], [...facts, tagged])
  omitted('model controls cannot be silently removed to match evidence', 'Análisis\u0000 de datos', ['summary-a'])

  const insufficient = structuredClone(fixture)
  insufficient.cvBlocks[2].text = 'Inglés avanzado'
  assert.throws(() => normalize(insufficient), /La preparación no produjo un CV suficientemente respaldado/)
  record('rejecting unsupported third block fails insufficient document closed')

  const unsupportedRequirement = structuredClone(fixture)
  unsupportedRequirement.requirements[1].status = 'supported'
  unsupportedRequirement.requirements[1].evidenceIds = ['summary-a']
  const classification = normalize(unsupportedRequirement)
  assert.equal(classification.requirements[0].status, 'supported')
  assert.equal(classification.requirements[1].status, 'not_evidenced')
  assert.deepEqual(classification.requirements[1].evidenceIds, [])
  assert.equal(classification.fitSummary.coverage_score, 50)
  record('A related confirmed facts supported; B known unrelated evidence cannot authorize supported or partial coverage')
  for (const [name, ids] of [['unknown', ['unknown']], ['missing', []], ['foreign context', ['foreign-user-id']]] as const) {
    const invalid = structuredClone(fixture)
    invalid.requirements[0].evidenceIds = [...ids]
    const result = normalize(invalid)
    assert.equal(result.requirements[0].status, 'not_evidenced')
    assert.equal(result.requirements.length, 2)
    assert.equal(result.fitSummary.coverage_score, 0)
    record(`C/D ${name} evidence cannot authorize support or remove a gap`)
  }
  const noAssessment = normalize(fixture, facts, null)
  assert.equal(noAssessment.requirements[0].status, 'not_evidenced')
  record('missing independent semantic assessment cannot inherit draft support')
  const badQuote = assessment(fixture)
  badQuote.decisions[0].evidenceQuotes[0].value = 'Fabricated analysis qualification'
  assert.equal(normalize(fixture, facts, badQuote).requirements[0].status, 'not_evidenced')
  const duplicateAssessment = assessment(fixture); duplicateAssessment.decisions.push(duplicateAssessment.decisions[0])
  assert.equal(normalize(fixture, facts, duplicateAssessment).requirements[0].status, 'not_evidenced')
  const staleInput = assessment(fixture); staleInput.inputHash = 'wrong-input'
  assert.equal(normalize(fixture, facts, staleInput).requirements[0].status, 'not_evidenced')
  record('fabricated quotation, ambiguous assessment and wrong input binding fail closed')
  const project = { id: 'project-a', category: 'experience', value: 'Led implementation of X across three teams, coordinating milestones and delivery.' }
  const paraphrase = structuredClone(fixture)
  paraphrase.requirements[0].text = 'Experience managing projects'
  paraphrase.requirements[0].evidenceIds = [project.id]
  const projectJob = 'Experience managing projects. Inglés avanzado.'
  const paraphraseFacts = [...facts, project]
  const equivalent = normalizeApplicationResult(paraphrase, paraphraseFacts, source, projectJob, assessment(paraphrase, paraphraseFacts, projectJob))
  assert.equal(equivalent.requirements[0].status, 'supported')
  assert.notEqual(paraphrase.requirements[0].text, project.value)
  record('E semantic equivalent wording supported without requirement/evidence string equality')

  const composite = structuredClone(fixture)
  composite.requirements[0].text = 'Análisis de datos e inglés avanzado'
  const compositeText = 'Análisis de datos e inglés avanzado. Inglés avanzado.'
  const compositeProof = assessment(composite, facts, compositeText)
  Object.assign(compositeProof.decisions[0], { status: 'partial', evidenceIds: ['summary-a'],
    evidenceQuotes: [{ evidenceId: 'summary-a', value: 'Análisis de datos' }], rationale: 'Data analysis is established but the language level is not.' })
  const partial = normalizeApplicationResult(composite, facts, source, compositeText, compositeProof)
  assert.equal(partial.requirements[0].status, 'partial')
  assert.equal(partial.fitSummary.coverage_score, 25)
  assert.equal(partial.fitSummary.missing_essential, 2)
  assert.notEqual(partial.fitSummary.label, 'Respaldo sólido')
  assert.equal(partial.checklist.filter((c: any) => c.kind === 'gap').length, 2)
  record('partial essential is incomplete, half-weight only, never a solid full match')

  process.env.CVITAE_RATE_LIMIT_SALT = 'local-fixture-only'
  process.env.SITE_URL = 'http://127.0.0.1:5173'
  const globals = globalThis as any
  globals.__groundingCalls = 0; globals.__semanticCalls = 0
  globals.__semanticResponse = (prompt: string) => {
    const inputs = JSON.parse(prompt.split('ENTRADAS CONFIRMADAS (máximo 24 requisitos y 8 hechos citados por requisito):\n')[1])
    assert.equal(inputs.some((item: any) => 'status' in item), false, 'Draft classifications never reach semantic authority')
    assert.equal(inputs.some((item: any) => item.candidates.some((f: any) => f.id === 'foreign-user-id')), false)
    return { decisions: decisionsFor(inputs) }
  }
  globals.__groundingResult = insufficient
  async function prepare() {
    return handler({ httpMethod: 'POST', headers: { origin: process.env.SITE_URL, authorization: 'Bearer token-a' }, body: JSON.stringify({ action: 'prepare', opportunitySlug: opportunity.slug, sourceVersionId: 'source-a' }) })
  }
  reset()
  const versionsBefore = structuredClone(state.tables.generated_cvs)
  assert.equal((await prepare()).statusCode, 422)
  assert.equal(state.tables.application_workspaces.length, 0)
  assert.deepEqual(state.tables.generated_cvs, versionsBefore)
  assert.equal(state.calls.some((call: any) => call.table === 'application_workspaces' && call.mode === 'insert'), false)
  assert.equal(globals.__groundingCalls, 1)
  assert.equal(globals.__semanticCalls, 0, 'Invalid CV blocks semantic provider')
  assert.match(globals.__groundingPrompt, /value COMPLETO/)
  record('real handler returns 422 without workspace/version persistence for unsupported document')

  globals.__groundingResult = fixture
  assert.equal((await prepare()).statusCode, 200)
  assert.equal(state.tables.application_workspaces.length, 1)
  assert.equal(state.tables.application_workspaces[0].safety_checks.candidate_claims_literal_evidence_backed, true)
  record('real handler retry persists valid literal document through existing boundary')

  const current = structuredClone(state.tables.application_workspaces[0])
  assert.equal(current.safety_checks.candidate_claims_grounding_contract, 'complete-literal-v1')
  const snapshot = current.opportunity_snapshot
  const legacyFingerprint = createHash('sha256').update(JSON.stringify({
    ...snapshot, description: opportunity.description, tags: opportunity.tags,
    application_url: opportunity.application_url, updated_at: opportunity.updated_at,
  })).digest('hex')
  const legacy = { ...structuredClone(current), id: 'legacy-workspace', opportunity_fingerprint: legacyFingerprint,
    tailored_cv_markdown: '# Candidata Local A\n\nInglés avanzado',
    requirement_analysis: current.requirement_analysis.map((r: any) => ({ ...r, status: 'supported', evidenceIds: ['summary-a'] })),
    safety_checks: { passed: true, valid_evidence_references: true, numeric_candidate_claims_backed: true, candidate_claims_literal_evidence_backed: true, candidate_claims_grounding_contract: 'complete-literal-v1' } }
  state.tables.application_workspaces = [legacy]
  const legacyBefore = structuredClone(legacy)
  globals.__groundingCalls = 0
  assert.equal((await prepare()).statusCode, 200)
  assert.equal(globals.__groundingCalls, 2)
  assert.equal(state.tables.application_workspaces.length, 2)
  assert.deepEqual(state.tables.application_workspaces[0], legacyBefore)
  const regenerated = state.tables.application_workspaces[1]
  assert.notEqual(regenerated.opportunity_fingerprint, legacyFingerprint)
  assert.equal(regenerated.evidence_hash, legacy.evidence_hash)
  assert.equal(regenerated.source_content_hash, legacy.source_content_hash)
  assert.equal(regenerated.requirement_analysis[1].status, 'not_evidenced')
  const reloadLegacy = await handler({httpMethod:'POST',headers:{origin:process.env.SITE_URL,authorization:'Bearer token-a'},body:JSON.stringify({action:'overview',opportunitySlug:opportunity.slug})})
  const visibleLegacy = JSON.parse(reloadLegacy.body).workspaces.find((w: any) => w.id === legacy.id)
  assert.equal(visibleLegacy.requirement_analysis.every((r: any) => r.status === 'not_evidenced'), true)
  assert.equal(visibleLegacy.fit_summary.coverage_score, 0)
  assert.deepEqual(state.tables.application_workspaces[0], legacyBefore)
  record('F stale SUPPORTED cache cannot bypass semantic contract; overview suppresses unsafe authority without rewriting history')
  async function accept(id: string, token = 'token-a') {
    return handler({ httpMethod: 'POST', headers: { origin: process.env.SITE_URL, authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'accept', workspaceId: id, attested: true }) })
  }
  const versionsBeforeLegacyAccept = structuredClone(state.tables.generated_cvs)
  const legacyAccept = await accept(legacy.id)
  assert.equal(legacyAccept.statusCode, 409)
  assert.equal(JSON.parse(legacyAccept.body).evidence_validation_required, true)
  assert.deepEqual(state.tables.generated_cvs, versionsBeforeLegacyAccept)
  assert.equal(state.calls.some((entry: any) => entry.rpc === 'accept_application_workspace'), false)
  assert.equal((await accept(legacy.id, 'token-b')).statusCode, 404)
  record('legacy accept blocked before RPC/version mutation; foreign workspace remains 404')
  const accepted = await accept(regenerated.id)
  assert.equal(accepted.statusCode, 200)
  const versionCount = state.tables.generated_cvs.length
  assert.equal((await accept(regenerated.id)).statusCode, 200)
  assert.equal(state.tables.generated_cvs.length, versionCount)
  record('current validated workspace accepts and repeated accept preserves version identity')
  function jsonbOrder(value: any): any {
    if (Array.isArray(value)) return value.map(jsonbOrder)
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().reverse().map((key) => [key, jsonbOrder(value[key])]))
    return value
  }
  const reordered = jsonbOrder(regenerated)
  state.tables.application_workspaces[1] = reordered
  assert.equal((await prepare()).statusCode, 200)
  assert.equal((await accept(reordered.id)).statusCode, 200)
  record('JSONB reordered keys preserve current semantic seal on prepare/accept/reload')
  state.tables.application_workspaces[1] = regenerated
  const trueRequirements = structuredClone(regenerated.requirement_analysis)
  regenerated.requirement_analysis[1].status = 'supported'
  regenerated.requirement_analysis[1].evidenceIds = ['summary-a']
  assert.equal((await prepare()).statusCode, 409)
  assert.equal((await accept(regenerated.id)).statusCode, 409)
  const staleReload = await handler({httpMethod:'POST',headers:{origin:process.env.SITE_URL,authorization:'Bearer token-a'},body:JSON.stringify({action:'overview',opportunitySlug:opportunity.slug})})
  assert.equal(JSON.parse(staleReload.body).workspaces.find((w: any) => w.id === regenerated.id).fit_summary.coverage_score, 0)
  regenerated.requirement_analysis = trueRequirements
  record('F stale unrelated supported with copied current flags cannot bypass persisted decision digest')
  const literalCv = regenerated.tailored_cv_markdown
  regenerated.tailored_cv_markdown += '\n\nInglés avanzado'
  assert.equal((await accept(regenerated.id)).statusCode, 409)
  regenerated.tailored_cv_markdown = literalCv
  record('G unsupported application claim cannot reuse a current semantic/CV seal')
  const foreignContext = { ...structuredClone(regenerated), id:'context-copied', user_id:'user-b' }
  state.tables.application_workspaces.push(foreignContext)
  assert.equal((await accept(foreignContext.id, 'token-b')).statusCode, 409)
  record('D copied semantic state cannot authorize another candidate/context')
  regenerated.safety_checks = { passed: true }
  assert.equal((await prepare()).statusCode, 409)
  assert.equal((await accept(regenerated.id)).statusCode, 409)
  assert.equal(state.tables.generated_cvs.length, versionCount)
  record('current fingerprint without current validation flags fails closed on cache and acceptance')

  reset()
  state.tables.cv_evidence_items.find((item: any) => item.id === 'summary-a').confirmed_value = '<no tengo> Análisis de datos'
  assert.equal((await prepare()).statusCode, 422)
  assert.match(globals.__groundingPrompt, /<no tengo> Análisis de datos/)
  assert.equal(state.tables.application_workspaces.length, 0)
  record('real handler preserves original confirmed value rather than stripping factual content')

  reset(); globals.__groundingCalls = 0
  state.tables.cv_evidence_items[0].status = 'pending'
  assert.equal((await prepare()).statusCode, 409)
  assert.equal(globals.__groundingCalls, 0)
  assert.equal(state.tables.application_workspaces.length, 0)
  record('pending confirmed-evidence boundary blocks before provider')
  reset(); state.tables.cv_evidence_items.forEach((item: any) => { item.status = 'rejected' })
  assert.equal((await prepare()).statusCode, 409)
  assert.equal(globals.__groundingCalls, 0)
  assert.equal(state.tables.application_workspaces.length, 0)
  record('missing confirmed-evidence boundary blocks before provider')
  reset(); globals.__groundingResult = fixture; globals.__groundingCalls = 0; globals.__semanticCalls = 0
  const correctResponse = globals.__semanticResponse
  globals.__semanticResponse = () => ({ decisions: [] })
  assert.equal((await prepare()).statusCode, 422)
  assert.equal(state.tables.application_workspaces.length, 0)
  globals.__semanticResponse = correctResponse
  assert.equal((await prepare()).statusCode, 200)
  record('empty semantic provider response is a recoverable validation failure, not cached negative truth')
  reset(); globals.__semanticResponse = () => { throw new Error('fixture semantic failure') }
  assert.equal((await prepare()).statusCode, 500)
  assert.equal(state.tables.application_workspaces.length, 0)
  globals.__semanticResponse = correctResponse
  assert.equal((await prepare()).statusCode, 200)
  record('semantic provider failure persists no workspace; retry recomputes before persistence')

  const freshId = state.tables.application_workspaces[0].id
  state.tables.cv_evidence_items.find((f: any) => f.id === 'summary-a').status = 'rejected'
  assert.equal((await accept(freshId)).statusCode, 409)
  const rejectedReload = await handler({httpMethod:'POST',headers:{origin:process.env.SITE_URL,authorization:'Bearer token-a'},body:JSON.stringify({action:'overview',opportunitySlug:opportunity.slug})})
  assert.equal(JSON.parse(rejectedReload.body).workspaces[0].fit_summary.supported, 0)
  record('rejected current evidence invalidates cached support on overview and accept before RPC')

  reset(); globals.__groundingResult = structuredClone(fixture)
  globals.__groundingResult.requirements[0].text = 'Experience managing projects'
  globals.__groundingResult.requirements[0].evidenceIds = ['project-a']
  state.tables.opportunity_catalog_universe[0].requirements = [{ text: 'Experience managing projects' }]
  state.tables.cv_evidence_items.push({ id: 'project-a', user_id: 'user-a', category: 'experience',
    claim: project.value, confirmed_value: project.value, status: 'confirmed', active: true, source_kind: 'user' })
  assert.equal((await prepare()).statusCode, 200)
  assert.equal(state.tables.application_workspaces[0].requirement_analysis[0].text, 'Experience managing projects')
  assert.equal(state.tables.application_workspaces[0].requirement_analysis[0].status, 'supported')
  assert.match(globals.__semanticPrompt, /Led implementation of X across three teams/)
  assert.equal((await accept(state.tables.application_workspaces[0].id)).statusCode, 200)
  record('E structured-only job requirement and equivalent wording survive real prepare -> semantic call -> state -> accept')

  reset(); globals.__groundingResult = structuredClone(fixture)
  globals.__groundingResult.requirements[0].evidenceIds = ['evidence-of-other-user']
  state.tables.cv_evidence_items.push({ id: 'evidence-of-other-user', user_id: 'user-b', category: 'summary',
    claim: 'Análisis de datos', confirmed_value: 'Análisis de datos', status: 'confirmed', active: true })
  assert.equal((await prepare()).statusCode, 200)
  assert.equal(state.tables.application_workspaces[0].requirement_analysis[0].status, 'not_evidenced')
  assert.equal(state.tables.application_workspaces[0].fit_summary.supported, 0)
  record('D real user-scoped confirmed query excludes another candidate fact even when its ID is known')

  report.status = 'PASS_CV_LITERAL_AND_REQUIREMENT_SEMANTIC_GROUNDING'
  report.semanticCases = { related: 'PASS', unrelatedKnown: 'PASS', missing: 'PASS', crossContext: 'PASS', equivalentWording: 'PASS', staleCache: 'PASS', cvSeparation: 'PASS', reload: 'PASS' }
} catch (error: any) {
  report.status = 'FAIL'; report.failure = error.stack; throw error
} finally {
  writeFileSync(resolve(output, 'evidence.json'), JSON.stringify(report, null, 2))
}
console.log(`verify_application_claim_grounding: ${report.status}; ${report.cases.length} cases; ${output}`)
