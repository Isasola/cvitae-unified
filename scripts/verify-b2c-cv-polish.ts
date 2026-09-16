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

console.log('OK: B2C CV polish wiring verified')
