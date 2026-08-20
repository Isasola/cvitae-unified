import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const admin = read('src/pages/Admin.tsx')
const growth = read('src/components/admin/AdminGrowthCenter.tsx')
const analytics = read('netlify/functions/admin-analytics.ts')
const dashboard = read('src/hub/Dashboard.tsx')
const seo = read('src/components/admin/AdminSeoControlCenter.tsx')

assert(!admin.includes('loadAnalytics()'), 'Admin must not make the removed duplicate analytics call')
assert(growth.includes("fetchData(launchMode ? 'launch' : 'standard', parsed, false)"), 'Analytics mount must explicitly disable AI')
assert(analytics.includes('if (!includeAi)'), 'admin-analytics must default to deterministic metrics')
assert(analytics.includes('body.includeAi === true'), 'Gemini requires an explicit request')
assert(dashboard.includes('const nextCourses = includeAi &&'), 'Dashboard course AI must be opt-in')
assert(dashboard.includes('loadMatches(true, true)'), 'Dashboard must expose an explicit user action for course AI')
assert(seo.includes("action: 'generate_suggestions'"), 'SEO AI remains behind a user action')

const functionDir = join(root, 'netlify/functions')
const modelFiles = readdirSync(functionDir).filter(name => name.endsWith('.ts')).filter(name => {
  const source = readFileSync(join(functionDir, name), 'utf8')
  return source.includes('InvokeModelCommand') || source.includes('generativelanguage.googleapis.com')
})
for (const name of modelFiles) {
  const source = readFileSync(join(functionDir, name), 'utf8')
  assert(source.includes('observeAiCall'), `${name} must emit metadata-only AI telemetry`)
}
const seoSuggestions = read('netlify/functions/lib/seo-suggestions.ts')
assert(seoSuggestions.includes('observeAiCall'), 'SEO Bedrock call must emit telemetry')

console.log(`PASS verify-ai-cost-safety: ${modelFiles.length + 1} generative modules observable; Admin/Analytics/Dashboard/SEO lazy`)
