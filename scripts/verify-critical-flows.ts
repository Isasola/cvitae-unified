import { jsPDF } from 'jspdf'
import { readFileSync } from 'node:fs'
import { handler as extractPdfText } from '../netlify/functions/extract-pdf-text'
import { handler as analyzeCandidate } from '../netlify/functions/analyze-cv-candidate'
import { handler as compareCandidates } from '../netlify/functions/compare-candidates'
import { handler as analyzeRecruitersBatch } from '../netlify/functions/analyze-recruiters-batch'
import { handler as analyzeVacancyApplicants } from '../netlify/functions/analyze-vacancy-applicants'
import { extractCvText } from '../netlify/functions/submit-lead'
import { handler as recommendCourses } from '../netlify/functions/gemini-courses'
import { handler as generateCvVivo } from '../netlify/functions/generate-cv-vivo'
import { handler as deleteB2cAccount } from '../netlify/functions/delete-b2c-account'
import { handler as cvWorkspace } from '../netlify/functions/cv-workspace'
import { handler as cvAtsWorkspace, normalizeAtsResult } from '../netlify/functions/cv-ats-workspace'
import { handler as cvRewriteWorkspace, normalizeRewriteResult } from '../netlify/functions/cv-rewrite-workspace'
import { handler as applicationWorkspace, normalizeApplicationResult } from '../netlify/functions/application-workspace'
import { handler as b2cProfile, publicProfile } from '../netlify/functions/b2c-profile'
import { isServiceRoleRequest } from '../supabase/functions/_shared/service-auth'

process.env.CVITAE_TEST_RATE_LIMIT_MODE = 'bypass-unit-tests'

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

const pdfBatch = await Promise.all(Array.from({ length: 3 }, async (_, index) => {
  const candidatePdf = new jsPDF({ unit: 'mm', format: 'a4' })
  candidatePdf.text(candidatePdf.splitTextToSize(`${cvText}\nCandidata de lote ${index + 1}`, 170), 20, 20)
  return invoke(extractPdfText, {
    pdfBase64: Buffer.from(candidatePdf.output('arraybuffer')).toString('base64'),
    fileName: `cv-lote-${index + 1}.pdf`,
  })
}))
assert(pdfBatch.every(response => response?.statusCode === 200), 'La extracción concurrente de varios PDFs debe completarse')

const applicationText = await extractCvText(pdfBase64)
assert(applicationText.includes('Ingeniera de software'), 'La postulación perdió el texto del CV')

const invalidPdf = await invoke(extractPdfText, { pdfBase64: 'aW52YWxpZA==', fileName: 'invalido.pdf' })
assert(invalidPdf?.statusCode === 400, 'Un archivo inválido debe responder 400')

const unsupportedDoc = await invoke(extractPdfText, { pdfBase64: 'Y3ZpdGFl', fileName: 'cv.doc' })
assert(unsupportedDoc?.statusCode === 400, 'El frontend y el backend deben rechazar .doc de forma coherente')

const oversizedFile = await invoke(extractPdfText, { pdfBase64: 'A'.repeat(5_600_001), fileName: 'grande.pdf' })
assert(oversizedFile?.statusCode === 413, 'Un archivo mayor al límite debe responder 413')

const recruiterWithoutToken = await invoke(analyzeCandidate, {
  cvText,
  mode: 'analyze',
})
assert(recruiterWithoutToken?.statusCode === 401, 'El análisis empresarial debe exigir token')

const recruiterWithoutOperation = await invoke(analyzeCandidate, {
  cvText,
  mode: 'analyze',
  recruiterToken: 'token-de-prueba',
})
assert(recruiterWithoutOperation?.statusCode === 400, 'El análisis empresarial debe exigir operation_id antes de acceder a datos o IA')

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

const b2cAnalysisWithoutSession = await invoke(analyzeCandidate, {
  cvText,
  mode: 'extract',
})
assert(b2cAnalysisWithoutSession?.statusCode === 401, 'La extracción inteligente B2C debe exigir una sesión válida')

const generationWithoutSession = await invoke(generateCvVivo, { vacancy: null })
assert(generationWithoutSession?.statusCode === 401, 'La generación de CV debe exigir una sesión válida')

const deletionWithoutSession = await invoke(deleteB2cAccount, { confirmation: 'ELIMINAR' })
assert(deletionWithoutSession?.statusCode === 401, 'La eliminación de cuenta debe exigir una sesión válida')

const profileWithoutSession = await invoke(b2cProfile, { action: 'status' })
assert(profileWithoutSession?.statusCode === 401, 'El perfil y el CV persistente deben exigir una sesión válida')
const legacyCvProfile = publicProfile({ profile_data: { cv_file_name: 'cv-anterior.pdf' }, cv_storage_path: null })
assert(legacyCvProfile.cv_reupload_required === true, 'Un CV legado sin archivo debe pedir una nueva carga')
assert(legacyCvProfile.has_cv === false, 'Un nombre legado no debe simular un archivo descargable')
const storedCvProfile = publicProfile({ cv_file_name: 'cv.pdf', cv_storage_path: 'profiles/user/cv.pdf', profile_data: {} })
assert(storedCvProfile.has_cv === true && storedCvProfile.cv_reupload_required === false, 'Un archivo privado persistido debe habilitar descarga')
assert(!('cv_storage_path' in storedCvProfile), 'La ruta privada del CV no debe exponerse al navegador')
const submitLeadSource = readFileSync(new URL('../netlify/functions/submit-lead.ts', import.meta.url), 'utf8')
assert(submitLeadSource.includes('if (!existingProfile?.user_id)'), 'Una postulación pública no debe sobrescribir perfiles vinculados')
assert(submitLeadSource.includes('.is("user_id", null)'), 'La actualización del perfil huérfano debe conservar la condición de propiedad')

const workspaceWithoutSession = await invoke(cvWorkspace, { action: 'overview' })
assert(workspaceWithoutSession?.statusCode === 401, 'El historial y las evidencias del CV deben exigir una sesión válida')

const atsWorkspaceWithoutSession = await invoke(cvAtsWorkspace, { action: 'overview' })
assert(atsWorkspaceWithoutSession?.statusCode === 401, 'El diagnóstico ATS guardado debe exigir una sesión válida')

const normalizedAts = normalizeAtsResult({
  categoryScores: [
    { key: 'parsing_structure', score: 99, reason: 'Estructura visible' },
    { key: 'evidence_impact', score: -4, reason: 'Sin evidencia cuantificada' },
  ],
  questions: [{ question: '¿Podés describir un resultado concreto y real de esta experiencia?', whyAsked: 'El CV describe tareas sin resultados.', category: 'unknown', priority: 9 }],
})
assert(normalizedAts.categoryScores.length === 5, 'La rúbrica ATS debe conservar exactamente cinco dimensiones')
assert(normalizedAts.categoryScores.reduce((sum, item) => sum + item.score, 0) === 20, 'Los puntajes ATS deben limitarse y recomponerse de forma determinista')
assert(normalizedAts.questions[0]?.category === 'other' && normalizedAts.questions[0]?.priority === 3, 'Las preguntas ATS deben normalizar categorías y prioridades no confiables')

const rewriteWithoutSession = await invoke(cvRewriteWorkspace, { action: 'overview' })
assert(rewriteWithoutSession?.statusCode === 401, 'Las propuestas de reescritura deben exigir una sesión válida')

const normalizedRewrite = normalizeRewriteResult({
  title: 'Propuesta segura',
  blocks: [
    { section: 'header', kind: 'name', text: 'María González', evidenceIds: ['identity-1'], sourceExcerpt: 'María González', reason: 'Mantener identidad confirmada' },
    { section: 'summary', kind: 'paragraph', text: 'Ingeniera de software con experiencia en React.', evidenceIds: ['summary-1'], sourceExcerpt: 'Ingeniera de software', reason: 'Mejorar claridad' },
    { section: 'skills', kind: 'bullet', text: 'React', evidenceIds: ['skill-1'], sourceExcerpt: 'React', reason: 'Ordenar habilidad' },
    { section: 'experience', kind: 'bullet', text: 'Redujo tiempos en 40%.', evidenceIds: ['achievement-1'], sourceExcerpt: 'redujo los tiempos de carga en cuarenta por ciento', reason: 'Aclarar logro' },
    { section: 'experience', kind: 'bullet', text: 'Aumentó resultados en 55%.', evidenceIds: ['achievement-1'], reason: 'Métrica inventada' },
    { section: 'skills', kind: 'bullet', text: 'Kubernetes', evidenceIds: ['unknown-evidence'], reason: 'Habilidad no respaldada' },
  ],
}, [
  { id: 'identity-1', category: 'identity', value: 'María González' },
  { id: 'summary-1', category: 'summary', value: 'Ingeniera de software con experiencia en React.' },
  { id: 'skill-1', category: 'skill', value: 'React' },
  { id: 'achievement-1', category: 'achievement', value: 'Redujo tiempos en 40%.' },
], cvText)
assert(normalizedRewrite.safetyChecks.passed === true, 'La propuesta respaldada debe superar los controles')
assert(normalizedRewrite.markdown.includes('40%'), 'Una cifra confirmada debe conservarse')
assert(!normalizedRewrite.markdown.includes('55%') && !normalizedRewrite.markdown.includes('Kubernetes'), 'Los hechos o cifras sin evidencia deben eliminarse en servidor')
assert(normalizedRewrite.changes.every((change: any) => change.evidence.length > 0), 'Cada bloque reescrito debe conservar sus referencias de evidencia')

const applicationWithoutSession = await invoke(applicationWorkspace, { action: 'overview', opportunitySlug: 'vacante-prueba' })
assert(applicationWithoutSession?.statusCode === 401, 'El expediente de postulación debe exigir una sesión válida')

const opportunityText = 'Ingeniera de software\nEmpresa Ejemplo\nExperiencia con React. Kubernetes deseable.'
const normalizedApplication = normalizeApplicationResult({
  requirements: [
    { text: 'Experiencia con React.', importance: 'essential', status: 'supported', evidenceIds: ['skill-1'] },
    { text: 'Kubernetes deseable.', importance: 'preferred', status: 'not_evidenced', evidenceIds: [] },
    { text: 'Cinco años obligatorios.', importance: 'essential', status: 'supported', evidenceIds: ['skill-1'] },
  ],
  cvBlocks: [
    { section: 'header', kind: 'name', text: 'María González', evidenceIds: ['identity-1'], sourceExcerpt: 'María González' },
    { section: 'summary', kind: 'paragraph', text: 'Ingeniera de software con experiencia en React.', evidenceIds: ['summary-1'], sourceExcerpt: 'Ingeniera de software' },
    { section: 'skills', kind: 'bullet', text: 'React', evidenceIds: ['skill-1'], sourceExcerpt: 'React' },
    { section: 'experience', kind: 'bullet', text: 'Mejoró resultados en 55%.', evidenceIds: ['achievement-1'] },
    { section: 'skills', kind: 'bullet', text: 'Kubernetes', evidenceIds: ['unknown-evidence'] },
  ],
  coverBlocks: [
    { text: 'Soy ingeniera de software con experiencia en React.', evidenceIds: ['summary-1'] },
    { text: 'Trabajé con React en proyectos de software.', evidenceIds: ['skill-1'] },
  ],
}, [
  { id: 'identity-1', category: 'identity', value: 'María González' },
  { id: 'summary-1', category: 'summary', value: 'Ingeniera de software con experiencia en React.' },
  { id: 'skill-1', category: 'skill', value: 'React' },
  { id: 'achievement-1', category: 'achievement', value: 'Mejoró resultados en 40%.' },
], cvText, opportunityText)
assert(normalizedApplication.requirements.length === 2, 'Solo deben conservarse requisitos copiados de la oportunidad')
assert(normalizedApplication.fitSummary.coverage_score === 67, 'La cobertura debe calcularse en servidor y no aceptar un score del modelo')
assert(!normalizedApplication.tailoredCvMarkdown.includes('55%') && !normalizedApplication.tailoredCvMarkdown.includes('Kubernetes'), 'El CV de postulación debe eliminar cifras y habilidades no respaldadas')
assert(normalizedApplication.checklist.some((item: any) => item.kind === 'gap'), 'Una brecha esencial debe producir una acción honesta en el checklist')
assert(!normalizedApplication.coverMessage.includes('Trabajé con React') && normalizedApplication.coverMessage.includes('React'), 'El mensaje debe renderizar evidencia confirmada y descartar prosa libre del modelo')

const rejectedOrigin = await extractPdfText({
  httpMethod: 'POST',
  headers: { origin: 'https://sitio-malicioso.example' },
  body: JSON.stringify({ pdfBase64, fileName: 'cv-prueba.pdf' }),
} as any, {} as any)
assert(rejectedOrigin?.statusCode === 403, 'Los endpoints B2C deben rechazar orígenes no autorizados')

const batchWithoutToken = await invoke(analyzeRecruitersBatch, {
  cvTexts: [{ text: cvText, fileName: 'cv-prueba.pdf' }],
  jobTitle: 'Ingeniera de software',
})
assert(batchWithoutToken?.statusCode === 401, 'El análisis masivo debe exigir token de empresa')

const vacancyBatchWithoutOperation = await invoke(analyzeVacancyApplicants, {
  token: 'token-de-prueba',
  vacancy_id: 'vacante-de-prueba',
})
assert(vacancyBatchWithoutOperation?.statusCode === 400, 'El lote de una vacante debe exigir operation_id antes de acceder a datos o IA')

const ledgerMigration = readFileSync(new URL('../supabase/migrations/202608130001_recruiter_credit_ledger.sql', import.meta.url), 'utf8')
assert(ledgerMigration.includes('UNIQUE (recruiter_token_id, operation_id)'), 'El ledger debe impedir operaciones duplicadas')
assert(ledgerMigration.includes('CHECK (balance_after = balance_before + amount)'), 'El ledger debe proteger la invariante de saldo')
assert(ledgerMigration.includes('FOR UPDATE'), 'Las reservas y devoluciones deben bloquear la fila de saldo durante concurrencia')
assert(ledgerMigration.includes('complete_recruiter_credit_operation'), 'La finalización debe guardar análisis y operación en una transacción')
assert(ledgerMigration.includes('settle_recruiter_credit_batch_operation'), 'Los lotes deben liquidar consumos y devoluciones en una transacción')

const alertsMigration = readFileSync(new URL('../supabase/migrations/202608130002_high_match_email_alerts.sql', import.meta.url), 'utf8')
assert(alertsMigration.includes('UNIQUE (user_id, opportunity_id)'), 'Las alertas deben impedir emails duplicados por usuario y oportunidad')
assert(alertsMigration.includes('match_alerts_enabled'), 'El consentimiento de alertas debe ser independiente del plan Pro')
assert(alertsMigration.includes('claim_match_alert_delivery'), 'La cola debe reclamar cada entrega de forma atómica')

const b2cSecurityMigration = readFileSync(new URL('../supabase/migrations/202608130004_b2c_security.sql', import.meta.url), 'utf8')
assert(b2cSecurityMigration.includes('create table if not exists public.api_rate_limits'), 'Los límites B2C deben persistir fuera de la memoria serverless')
assert(b2cSecurityMigration.includes('security definer'), 'El consumo del rate limit debe ejecutarse en una función protegida')
assert(b2cSecurityMigration.includes('revoke all on function public.consume_api_rate_limit'), 'El RPC de límites no debe estar expuesto al navegador')
assert(b2cSecurityMigration.includes('delete_b2c_user_data'), 'La eliminación de datos B2C debe ejecutarse de forma transaccional')
assert(!/grant update\s*\([^)]*is_subscribed/is.test(b2cSecurityMigration), 'El navegador no debe poder elevar su propio plan')

const cvGeneration = readFileSync(new URL('../netlify/functions/generate-cv-vivo.ts', import.meta.url), 'utf8')
assert(cvGeneration.includes('authenticatedUser(event)'), 'La generación de CV debe validar la sesión en servidor')
assert(!cvGeneration.includes('const { profile, vacancy }'), 'La generación de CV no debe confiar en un perfil enviado por el navegador')
assert(cvGeneration.includes(".eq('user_id', user.id)"), 'El servidor debe cargar el perfil desde el usuario autenticado')
assert(cvGeneration.includes('confirmedEvidence(supabase, user.id)'), 'La generación debe usar únicamente evidencia confirmada')
assert(!cvGeneration.includes('métricas reales o estimadas'), 'El prompt no debe pedir métricas inventadas o estimadas')
assert(cvGeneration.includes("p_generation_kind: isBaseCV ? 'base' : 'adapted'"), 'Cada generación debe crear una versión tipada')

const cvVersionsMigration = readFileSync(new URL('../supabase/migrations/202608130005_cv_versions_and_evidence.sql', import.meta.url), 'utf8')
assert(cvVersionsMigration.includes('create table if not exists public.cv_evidence_items'), 'Las evidencias del CV deben persistirse con estado de revisión')
assert(cvVersionsMigration.includes('create or replace function public.create_cv_version'), 'Las versiones deben crearse mediante una operación atómica')
assert(cvVersionsMigration.includes('pg_advisory_xact_lock'), 'La numeración de versiones debe resistir escrituras concurrentes')
assert(cvVersionsMigration.includes("status in ('pending', 'confirmed', 'rejected')"), 'Cada evidencia debe poder confirmarse o rechazarse')
assert(cvVersionsMigration.includes('evidence_snapshot'), 'Cada versión debe conservar las evidencias utilizadas')
assert(cvVersionsMigration.includes('prevent_cv_version_update'), 'Una versión creada no debe poder sobrescribirse')

const cvWorkspaceSource = readFileSync(new URL('../netlify/functions/cv-workspace.ts', import.meta.url), 'utf8')
assert(cvWorkspaceSource.includes("action === 'review_evidence'"), 'El usuario debe poder revisar evidencia individual')
assert(cvWorkspaceSource.includes("action === 'restore_version'"), 'Restaurar debe crear una versión nueva')
assert(cvWorkspaceSource.includes("action === 'save_manual_version'"), 'Las ediciones manuales deben conservarse como otra versión')

const atsMigration = readFileSync(new URL('../supabase/migrations/202608130006_cv_ats_diagnostics.sql', import.meta.url), 'utf8')
assert(atsMigration.includes('create table if not exists public.cv_ats_assessments'), 'Los diagnósticos ATS deben persistir su rúbrica y resultados')
assert(atsMigration.includes('create table if not exists public.cv_ats_questions'), 'Las preguntas ATS deben persistirse por usuario y diagnóstico')
assert(atsMigration.includes('unique (user_id, content_hash, rubric_version)'), 'El mismo CV no debe generar diagnósticos duplicados')
assert(atsMigration.includes('review_cv_ats_question'), 'Responder una pregunta debe ser una operación transaccional')
assert(atsMigration.includes("'Respuesta a diagnóstico ATS', 'pending'"), 'Una respuesta ATS debe entrar como evidencia pendiente, nunca confirmada automáticamente')
assert(atsMigration.includes('never raw uploaded CV text'), 'La persistencia ATS debe documentar que no guarda el texto crudo')

const atsWorkspaceSource = readFileSync(new URL('../netlify/functions/cv-ats-workspace.ts', import.meta.url), 'utf8')
assert(atsWorkspaceSource.includes('No afirmes que simulás un ATS específico'), 'El diagnóstico no debe presentarse como simulación de un ATS universal')
assert(atsWorkspaceSource.includes('No inventes empleos, logros, métricas'), 'El prompt ATS debe prohibir explícitamente inventar evidencia')
assert(atsWorkspaceSource.includes("scope: 'b2c-ats-diagnostic'"), 'El diagnóstico ATS debe tener límite persistente propio')

const rewriteMigration = readFileSync(new URL('../supabase/migrations/202608130007_cv_rewrite_proposals.sql', import.meta.url), 'utf8')
assert(rewriteMigration.includes('create table if not exists public.cv_rewrite_proposals'), 'Las propuestas deben persistirse separadas del CV vigente')
assert(rewriteMigration.includes('protect_cv_rewrite_proposal_content'), 'El contenido de una propuesta creada debe ser inmutable')
assert(rewriteMigration.includes('accept_cv_rewrite_proposal'), 'Aceptar una propuesta debe ser una operación transaccional')
assert(rewriteMigration.includes("'rewritten'"), 'La aceptación debe crear una versión identificada como reescritura')
assert(rewriteMigration.includes('source_version.id'), 'La nueva versión debe conservar la versión de origen como padre')

const rewriteWorkspaceSource = readFileSync(new URL('../netlify/functions/cv-rewrite-workspace.ts', import.meta.url), 'utf8')
assert(rewriteWorkspaceSource.includes('Cada bloque del CV debe tener uno o más evidenceIds'), 'El prompt debe exigir referencias por bloque')
assert(rewriteWorkspaceSource.includes('numeric_claims_backed'), 'El servidor debe registrar el control de cifras')
assert(rewriteWorkspaceSource.includes("scope: 'b2c-cv-rewrite'"), 'La reescritura debe tener un límite persistente propio')

const applicationMigration = readFileSync(new URL('../supabase/migrations/202608130008_application_workspaces.sql', import.meta.url), 'utf8')
assert(applicationMigration.includes('create table if not exists public.application_workspaces'), 'Los expedientes de postulación deben persistir de forma privada')
assert(applicationMigration.includes('protect_application_workspace_content'), 'Los documentos preparados deben ser inmutables')
assert(applicationMigration.includes('accept_application_workspace'), 'Aceptar documentos debe crear la versión adaptada transaccionalmente')
assert(applicationMigration.includes('submitted_self_reported_at'), 'El estado enviado debe quedar identificado como declaración del usuario')
assert(applicationMigration.includes('opportunity is no longer available or changed'), 'La aceptación debe volver a validar la vigencia y contenido de la oportunidad')
assert(applicationMigration.includes('opportunity.updated_at ='), 'La aceptación debe rechazar una oportunidad modificada después de preparar documentos')

const applicationWorkspaceSource = readFileSync(new URL('../netlify/functions/application-workspace.ts', import.meta.url), 'utf8')
assert(applicationWorkspaceSource.includes('Cada afirmación del CV y del mensaje debe citar evidenceIds'), 'El prompt de postulación debe exigir referencias por afirmación')
assert(applicationWorkspaceSource.includes('requirements_copied_from_opportunity'), 'El servidor debe registrar el control de requisitos textuales')
assert(applicationWorkspaceSource.includes('cover_message_rendered_by_server'), 'El mensaje debe construirse de forma determinista con evidencia seleccionada')
assert(applicationWorkspaceSource.includes("scope: 'b2c-application-prep'"), 'La preparación debe tener un límite persistente propio')

const protectedCorsFiles = [
  '../netlify/functions/analyze-cv-public.ts',
  '../netlify/functions/analyze-cv-candidate.ts',
  '../netlify/functions/extract-pdf-text.ts',
  '../netlify/functions/gemini-courses.ts',
  '../netlify/functions/generate-cv-vivo.ts',
  '../netlify/functions/cv-ats-workspace.ts',
  '../netlify/functions/cv-rewrite-workspace.ts',
  '../netlify/functions/application-workspace.ts',
  '../supabase/functions/match-batch/index.ts',
]
for (const relativePath of protectedCorsFiles) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  assert(!source.includes("'Access-Control-Allow-Origin': '*'"), `${relativePath} no debe aceptar cualquier origen`)
}

const recruiterValidation = readFileSync(new URL('../netlify/functions/validate-recruiter-token.ts', import.meta.url), 'utf8')
assert(recruiterValidation.includes('statusCode: 410'), 'La ruta legacy de guardado debe permanecer deshabilitada')
assert(recruiterValidation.includes('cv_reupload_required'), 'El panel B2B debe distinguir CVs históricos sin archivo original')
const recruiterUi = readFileSync(new URL('../src/pages/Recruiters.tsx', import.meta.url), 'utf8')
assert(recruiterUi.includes('Pedile al candidato que vuelva a subirlo'), 'El panel B2B debe explicar cómo recuperar un CV histórico')

const encodeJwtPart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
const serviceJwt = `${encodeJwtPart({ alg: 'HS256' })}.${encodeJwtPart({ role: 'service_role' })}.signature`
const anonJwt = `${encodeJwtPart({ alg: 'HS256' })}.${encodeJwtPart({ role: 'anon' })}.signature`
assert(isServiceRoleRequest(new Request('http://local.test', { headers: { Authorization: `Bearer ${serviceJwt}` } }), 'rotated-runtime-key'), 'El mantenimiento debe aceptar un JWT service_role ya validado por el gateway')
assert(!isServiceRoleRequest(new Request('http://local.test', { headers: { Authorization: `Bearer ${anonJwt}` } }), 'rotated-runtime-key'), 'El mantenimiento debe rechazar el rol anon')
assert(!isServiceRoleRequest(new Request('http://local.test'), 'rotated-runtime-key'), 'El mantenimiento debe rechazar solicitudes sin token')
const supabaseConfig = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')
assert(supabaseConfig.includes('[functions.embed-profile]\nverify_jwt = true'), 'embed-profile debe exigir verificación JWT en el gateway')
assert(supabaseConfig.includes('[functions.embed-opportunities]\nverify_jwt = true'), 'embed-opportunities debe exigir verificación JWT en el gateway')
const contentPolicyMigration = readFileSync(new URL('../supabase/migrations/202609090004_reset_content_hub_read_policies.sql', import.meta.url), 'utf8')
assert(contentPolicyMigration.includes('using (is_active = true)'), 'El contenido publicado debe conservar lectura pública')
const contentMetadataMigration = readFileSync(new URL('../supabase/migrations/202609090005_content_hub_metadata.sql', import.meta.url), 'utf8')
assert(contentMetadataMigration.includes('add column if not exists updated_at'), 'El blog debe alinear updated_at antes del prerender')

console.log('Critical flow checks passed: multi-PDF, persistent limits, B2C/B2B auth, ATS diagnostics/questions, evidence-grounded rewrites and application prep, profile ownership, protected CORS, ledger/batch invariants, alert idempotency and Gemini auth.')
