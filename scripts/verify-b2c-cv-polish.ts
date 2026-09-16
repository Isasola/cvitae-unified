import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const landing = source('src/pages/LandingPage.tsx')
const callback = source('src/pages/AuthCallback.tsx')
const profileBuilder = source('src/hub/ProfileBuilder.tsx')
const dashboard = source('src/hub/Dashboard.tsx')
const profileApi = source('netlify/functions/b2c-profile.ts')
const workspace = source('netlify/functions/cv-workspace.ts')
const cvVivo = source('src/hub/CVVivo.tsx')
const profileLib = source('src/lib/profile.ts')
const extractEndpoint = source('netlify/functions/extract-pdf-text.ts')

// ─── B2C-1: persist and hydrate ───────────────────────────────────────────────
assert(!landing.includes('pending_cv'), 'Landing no debe volver a guardar un CV pre-auth en sessionStorage')
assert(profileBuilder.includes("action: 'save_import_draft'"), 'La extracción debe persistirse antes de depender del estado React')
assert(profileBuilder.includes('draft.experience') && profileBuilder.includes('draft.languages'), 'Reload debe hidratar experiencia e idiomas del draft')
assert(profileApi.includes("if (action === 'save_import_draft')"), 'b2c-profile debe aceptar el draft durable')
assert(profileApi.includes("onboarding_status: 'needs_review'"), 'La extracción no confirmada debe quedar explícitamente en revisión')
assert(profileApi.includes("onboarding_status: 'completed'"), 'Guardar el perfil debe marcar onboarding terminado')
assert(workspace.includes("drafts, 'uploaded_cv'"), 'Reemplazar CV debe desactivar evidencia uploaded_cv anterior')

// ─── B2C-2: polish CV workspace ───────────────────────────────────────────────
assert(cvVivo.includes('readinessScore'), 'Mi CV debe mostrar readiness determinista')
assert(!cvVivo.includes("from 'html2canvas'"), 'Mi CV no debe exportar un PDF rasterizado')
assert(cvVivo.includes("pdf.splitTextToSize"), 'El PDF debe mantener una capa de texto real')
assert(cvVivo.includes('Descargar original'), 'Mi CV debe exponer claramente el CV original')

// ─── GAP 1: returning user — AuthCallback no redirige ciegamente ──────────────
assert(callback.includes("action: 'status'"), 'AuthCallback debe consultar el perfil antes de redirigir')
assert(callback.includes('isProfileComplete'), 'AuthCallback debe usar isProfileComplete para decidir destino')
assert(callback.includes("'/mi-carrera'") && callback.includes("'/mi-carrera/perfil'"),
  'AuthCallback debe poder redirigir a /mi-carrera (completado) o /mi-carrera/perfil (incompleto)')
// Garantiza que el listener delega al helper en lugar de redirigir directamente
assert(callback.includes('redirectAfterAuth(session.access_token)'),
  'El listener de onAuthStateChange debe delegar a redirectAfterAuth, no redirigir directamente')

// ─── GAP 2: backward compatibility ───────────────────────────────────────────
assert(profileLib.includes('isProfileComplete'), 'src/lib/profile.ts debe exportar isProfileComplete')
assert(profileLib.includes("status === 'completed'"), 'isProfileComplete debe reconocer onboarding_status completado')
assert(profileLib.includes("status == null"), 'isProfileComplete debe manejar perfiles legacy sin onboarding_status')
assert(profileLib.includes('full_name') && profileLib.includes('professional_title'),
  'isProfileComplete debe verificar datos reales de identidad para perfiles legacy')
assert(dashboard.includes('isProfileComplete'), 'Dashboard debe usar isProfileComplete, no la comprobación cruda')
assert(!dashboard.includes("onboarding_status === 'completed'"),
  'Dashboard no debe hacer el chequeo crudo de onboarding_status; la lógica vive en isProfileComplete')

// ─── GAP 3: mobile CV upload robustness ──────────────────────────────────────

// Test 1+2+3: CV.pdf / CV.PDF / MIME vacío — usa lowerName, no file.type
assert(!profileBuilder.includes("file.type === 'application/pdf'"),
  'Parser no debe depender del MIME type (falla en algunos móviles)')
assert(profileBuilder.includes("lowerName.endsWith('.pdf')"),
  'CV.pdf y CV.PDF deben clasificarse como PDF vía lowerName normalizado')

// Test 4: CV.DOCX funciona independientemente del case
assert(profileBuilder.includes("lowerName.endsWith('.docx')"),
  'CV.DOCX debe clasificarse como DOCX vía lowerName normalizado')

// Test 5+8: upload_cv ocurre ANTES que extract-pdf-text
const uploadPos = profileBuilder.indexOf("action: 'upload_cv'")
const extractPos = profileBuilder.indexOf('extract-pdf-text')
assert(uploadPos !== -1 && extractPos !== -1 && uploadPos < extractPos,
  'upload_cv debe ocurrir antes de extract-pdf-text para que el CV quede guardado ante cualquier fallo')

// Test 6: error del extractor conserva código y mensaje útil
assert(profileBuilder.includes('payload.code') && profileBuilder.includes('payload.error'),
  'El error del extractor debe conservar payload.code y payload.error del backend')
assert(extractEndpoint.includes('"PDF_NO_TEXT"') && extractEndpoint.includes('"PDF_PROTECTED_OR_DAMAGED"'),
  'El endpoint de extracción debe emitir códigos estables para que el frontend diferencie el tipo de error')

// Test 7: no se llama analyze-cv-candidate cuando no hay texto suficiente
const noTextPos = profileBuilder.indexOf('text.trim().length < 50')
const analyzeCallPos = profileBuilder.indexOf('analyze-cv-candidate')
assert(noTextPos !== -1 && analyzeCallPos !== -1 && noTextPos < analyzeCallPos,
  'El guard de texto insuficiente debe aparecer antes de llamar a analyze-cv-candidate')
// El path de escaneado retorna antes de llegar a analyze
assert(profileBuilder.includes("'PDF_NO_TEXT'") && profileBuilder.includes('return'),
  'Cuando el PDF está escaneado el flujo debe retornar sin llamar a analyze-cv-candidate')

// Test 9: flujo exitoso tiene todos los pasos en orden correcto
const saveCvTextPos = profileBuilder.indexOf("action: 'save_cv_text'")
const analyzePos2 = profileBuilder.indexOf('analyze-cv-candidate')
const evidencePos = profileBuilder.indexOf('import_extraction')
const draftPos = profileBuilder.indexOf("action: 'save_import_draft'")
assert(uploadPos < saveCvTextPos && saveCvTextPos < analyzePos2 && analyzePos2 < evidencePos && evidencePos < draftPos,
  'Flujo exitoso: upload_cv → save_cv_text → analyze-cv-candidate → import_extraction → save_import_draft')
assert(profileApi.includes("if (action === 'save_cv_text')"),
  'b2c-profile debe aceptar la nueva acción save_cv_text')

// ─── GAP 4: extraction error handling and save_cv_text gate ──────────────────

// Test 10: save_cv_text response is checked (not fire-and-forget)
assert(profileBuilder.includes('saveTextRes.ok'),
  'save_cv_text debe verificar la respuesta (.ok) — no puede ser fire-and-forget')

// Test 11: flow stops if save_cv_text fails — must appear before analyze-cv-candidate
const saveTextCheckPos = profileBuilder.indexOf('saveTextRes.ok')
const analyzePos3 = profileBuilder.indexOf('analyze-cv-candidate')
assert(saveTextCheckPos !== -1 && analyzePos3 !== -1 && saveTextCheckPos < analyzePos3,
  'El guard de saveTextRes.ok debe aparecer antes de llamar a analyze-cv-candidate')

// Test 12: PDF_PROTECTED_OR_DAMAGED has its own distinct message, not the AI/autocomplete message
const protectedIdx = profileBuilder.indexOf("'PDF_PROTECTED_OR_DAMAGED'")
const aiFailIdx = profileBuilder.indexOf("'AI_ANALYZE_FAILED'")
assert(protectedIdx !== -1 && aiFailIdx !== -1 && protectedIdx !== aiFailIdx,
  'PDF_PROTECTED_OR_DAMAGED debe tener tratamiento distinto de AI_ANALYZE_FAILED')
assert(!profileBuilder.slice(protectedIdx, protectedIdx + 300).includes('AI_ANALYZE_FAILED'),
  'El bloque de PDF_PROTECTED_OR_DAMAGED no debe mezclar el mensaje de AI_ANALYZE_FAILED')

// Test 13: EXTRACTION_BUSY is handled as early return, not via AI/autocomplete catch
assert(profileBuilder.includes("'EXTRACTION_BUSY'"),
  'EXTRACTION_BUSY debe ser manejado explícitamente (no caer en el catch de AI)')
const busyIdx = profileBuilder.indexOf("'EXTRACTION_BUSY'")
assert(profileBuilder.slice(busyIdx, busyIdx + 350).includes('return'),
  'El bloque de EXTRACTION_BUSY debe terminar con return antes de llegar a analyze-cv-candidate')

// Test 14: PDF_NO_TEXT returns before analyze-cv-candidate (existing, reinforced)
const noTextIdx2 = profileBuilder.indexOf("'PDF_NO_TEXT'")
assert(noTextIdx2 !== -1 && noTextIdx2 < analyzePos3,
  'PDF_NO_TEXT debe retornar antes de llamar a analyze-cv-candidate')

console.log('OK: B2C CV polish wiring verified')
