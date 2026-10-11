$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ((node --version).Trim() -ne 'v24.21.0') { throw "NODE_VERSION_MISMATCH expected=v24.21.0 actual=$(node --version)" }
if ((pnpm.cmd --version).Trim() -ne '11.8.0') { throw "PNPM_VERSION_MISMATCH expected=11.8.0 actual=$(pnpm.cmd --version)" }

$results = [System.Collections.Generic.List[object]]::new()
function Invoke-C4Section {
  param([string]$Name, [string]$Command, [string[]]$CommandArgs)
  Write-Output "SECTION_BEGIN=$Name"
  & $Command @CommandArgs
  $exitCode = $LASTEXITCODE
  $results.Add([pscustomobject]@{ section = $Name; exit_code = $exitCode })
  Write-Output "SECTION_END=$Name EXIT=$exitCode"
  if ($exitCode -ne 0) { throw "SECTION_FAILED=$Name EXIT=$exitCode" }
}

Write-Output 'EVIDENCE_BOUNDARY=LOCAL_FIXTURES_AND_SIMULATED_HTTP; NOT_POSTGRESQL_RUNTIME; NOT_PROD_VALIDATED'
Invoke-C4Section -Name 'DIFF_WHITESPACE' -Command 'git' -CommandArgs @('-c','core.safecrlf=false','diff','--check')
Invoke-C4Section -Name 'C4_CONTRACT_AND_ACCOUNTING' -Command 'pnpm.cmd' -CommandArgs @('exec','tsx','scripts/verify-r2-c4.ts')
Invoke-C4Section -Name 'B2B_SHARED_HANDLER_REGRESSION' -Command 'node' -CommandArgs @('scripts/verify-r2-b2b-baseline.mjs')
Invoke-C4Section -Name 'UNIVERSE_REDUCER' -Command 'pnpm.cmd' -CommandArgs @('exec','tsx','scripts/verify_opportunity_universe.ts')
Invoke-C4Section -Name 'UNIVERSE_PERMISSION_ORACLE' -Command 'pnpm.cmd' -CommandArgs @('exec','tsx','scripts/verify_opportunity_universe_permission_preflight.ts')
Invoke-C4Section -Name 'SOURCE_POLICY' -Command 'pnpm.cmd' -CommandArgs @('exec','tsx','scripts/verify_effective_source_policy.ts')
Invoke-C4Section -Name 'MATCHING_RETRIEVAL' -Command 'pnpm.cmd' -CommandArgs @('exec','tsx','scripts/verify_matching_retrieval_expansion.ts')
Invoke-C4Section -Name 'MATCHING_DECISION' -Command 'pnpm.cmd' -CommandArgs @('exec','tsx','scripts/verify_matching_v21_decision_contract.ts')
Invoke-C4Section -Name 'MATCHING_CONSUMERS' -Command 'pnpm.cmd' -CommandArgs @('exec','tsx','scripts/verify_matching_b2c_consumers.ts')

$env:VITE_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:VITE_SUPABASE_ANON_KEY = 'local-c4-browser-fixture-key'
Write-Output 'TYPE_VALIDATION=VITE_TYPESCRIPT_TRANSPILE_AND_MODULE_RESOLUTION; repository has no whole-program tsconfig gate.'
Invoke-C4Section -Name 'VITE_COMPILE' -Command 'pnpm.cmd' -CommandArgs @('exec','vite','build','--configLoader','runner')

$env:SEO_INVENTORY_FIXTURE = (Resolve-Path -LiteralPath 'scripts/fixtures/seo-inventory.json').Path
$env:PRERENDER_PUBLIC_FIXTURE = (Resolve-Path -LiteralPath 'scripts/fixtures/prerender-public-fixture.json').Path
$env:PUBLIC_CONTENT_FIXTURE = $env:PRERENDER_PUBLIC_FIXTURE
$generatedPaths = @('generated/public-seo-inventory.json','generated/source-distribution-policy-snapshot.json')
$generatedBefore = @{}
foreach ($path in $generatedPaths) { $generatedBefore[$path] = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $path).Path) }
try {
  Invoke-C4Section -Name 'OFFLINE_FULL_FIXTURE_BUILD' -Command 'pnpm.cmd' -CommandArgs @('build')
} finally {
  foreach ($path in $generatedPaths) { [IO.File]::WriteAllBytes((Resolve-Path -LiteralPath $path).Path,$generatedBefore[$path]) }
}

Invoke-C4Section -Name 'B2B_C4_BROWSER_SIMULATED_BOUNDARY' -Command 'pnpm.cmd' -CommandArgs @('exec','playwright','test','tests/visual/recruiter-c4.spec.ts','--project=chromium-desktop','--retries=0')
Write-Output 'RESULTS_BEGIN'
$results | ConvertTo-Json -Depth 3
Write-Output 'RESULTS_END'
Write-Output 'STOP=Return complete output. Do not apply either migration or deploy from local PASS alone.'
