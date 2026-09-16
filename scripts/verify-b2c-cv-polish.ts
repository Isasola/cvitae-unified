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

assert(!landing.includes('pending_cv'), 'Landing no debe volver a guardar un CV pre-auth en sessionStorage')
assert(callback.includes("setLocation('/mi-carrera/perfil')"), 'El magic link debe continuar al onboarding B2C')
assert(profileBuilder.includes("action: 'save_import_draft'"), 'La extracción debe persistirse antes de depender del estado React')
assert(profileBuilder.includes('draft.experience') && profileBuilder.includes('draft.languages'), 'Reload debe hidratar experiencia e idiomas del draft')
assert(profileApi.includes("if (action === 'save_import_draft')"), 'b2c-profile debe aceptar el draft durable')
assert(profileApi.includes("onboarding_status: 'needs_review'"), 'La extracción no confirmada debe quedar explícitamente en revisión')
assert(profileApi.includes("onboarding_status: 'completed'"), 'Guardar el perfil debe marcar onboarding terminado')
assert(dashboard.includes("onboarding_status === 'completed'"), 'Dashboard no debe confundir una fila vacía con perfil terminado')
assert(workspace.includes("drafts, 'uploaded_cv'"), 'Reemplazar CV debe desactivar evidencia uploaded_cv anterior')
assert(cvVivo.includes('readinessScore'), 'Mi CV debe mostrar readiness determinista')
assert(!cvVivo.includes("from 'html2canvas'"), 'Mi CV no debe exportar un PDF rasterizado')
assert(cvVivo.includes("pdf.splitTextToSize"), 'El PDF debe mantener una capa de texto real')
assert(cvVivo.includes('Descargar original'), 'Mi CV debe exponer claramente el CV original')

console.log('OK: B2C CV polish wiring verified')
