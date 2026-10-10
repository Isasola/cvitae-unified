[CmdletBinding()]
param()

# STOP B grouped LOCAL verification. No SQL, deploy, push or external traffic.
# Operator invokes; the coding agent must NOT run this script.
# No credentials, environment dump, dependency install, SQL, deploy or network.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$r2Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$r2ExpectedRoot = 'C:\Users\isaso\cvitae-b2c-r2-20261008'
if ($r2Root.TrimEnd('\') -ne $r2ExpectedRoot) { throw 'STOP: wrong R2 worktree.' }
Set-Location -LiteralPath $r2Root
$r2Results = [System.Collections.Generic.List[object]]::new()

function Invoke-R2Section {
  param([string]$Name, [string]$Command, [string[]]$CommandArgs)
  Write-Output "SECTION=$Name"
  & $Command @CommandArgs
  $r2Exit = $LASTEXITCODE
  [void]$r2Results.Add([pscustomobject]@{ section = $Name; exit_code = $r2Exit })
  Write-Output "SECTION_EXIT=$r2Exit"
  return # Native output is preserved; do not mask the recorded exit code.
}

try {
  $r2Branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $r2Branch -ne 'work/b2c-r2-20261008') { throw 'STOP: branch mismatch.' }
  $r2Head = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $r2Head -ne 'c633f5d8ec238829c98e69d9dcba00d401ffee70') { throw 'STOP: baseline changed; review probe phase before execution.' }
  $r2Node = (& node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $r2Node -ne 'v24.21.0') { throw 'STOP: Node 24.21.0 required; no auto-install.' }
  $r2Pnpm = (& pnpm.cmd --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $r2Pnpm -ne '11.8.0') { throw 'STOP: pnpm 11.8.0 required; no auto-install.' }
  if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) { throw 'STOP: local Vite compiler unavailable; no install performed.' }

  Write-Output "BASELINE=$r2Head NODE=$r2Node PNPM=$r2Pnpm"
  Write-Output 'PHASE=LOCAL_IMPLEMENTATION_GATE; simulated handler boundaries + local static/browser/build regression; no real SQL/PROD evidence.'
  Invoke-R2Section -Name 'DIFF_WHITESPACE' -Command 'git' -CommandArgs @('-c', 'core.safecrlf=false', 'diff', '--check')
  Invoke-R2Section -Name 'HANDLER_CONTRACT_PROBES' -Command 'node' -CommandArgs @('scripts/verify-r2-b2b-baseline.mjs')
  Write-Output 'TYPE_VALIDATION=VITE_TYPESCRIPT_TRANSPILE_AND_MODULE_RESOLUTION; no repository tsconfig exists, so this is not a whole-program tsc typecheck.'
  Invoke-R2Section -Name 'VITE_TYPESCRIPT_COMPILE' -Command 'pnpm.cmd' -CommandArgs @('exec', 'vite', 'build', '--configLoader', 'runner')
  Invoke-R2Section -Name 'B2B_BRIDGE_STATIC' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify-create-vacancy.ts')
  Invoke-R2Section -Name 'B2B_PROGRESSIVE_PRIVATE_REVIEW' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify-progressive-vacancy-review.ts')
  Invoke-R2Section -Name 'SOURCE_POLICY_REGRESSION' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify_effective_source_policy.ts')
  Invoke-R2Section -Name 'UNIVERSE_REDUCER_REGRESSION' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify_opportunity_universe.ts')
  Invoke-R2Section -Name 'UNIVERSE_PERMISSION_PREFLIGHT_REGRESSION' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify_opportunity_universe_permission_preflight.ts')
  Invoke-R2Section -Name 'B2C_RESIDUAL_TARGETED' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify_b2c_secondary_contracts.ts')
  Invoke-R2Section -Name 'B2C_AUTH_CV_INGESTION_PROTECTED' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify-b2c-cv-universal.ts')
  Invoke-R2Section -Name 'B2C_LEARNING_PROTECTED' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify-learning-plan.ts')
  Invoke-R2Section -Name 'CONSENTED_FUNNEL_ANALYTICS' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify_conversion_analytics_item56.ts')
  Invoke-R2Section -Name 'PUBLIC_SITEMAP_UNIVERSE' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify_sitemap_universe_item30.ts')

  $env:SEO_INVENTORY_FIXTURE = (Resolve-Path -LiteralPath 'scripts/fixtures/seo-inventory.json').Path
  $env:PRERENDER_PUBLIC_FIXTURE = (Resolve-Path -LiteralPath 'scripts/fixtures/prerender-public-fixture.json').Path
  $env:PUBLIC_CONTENT_FIXTURE = $env:PRERENDER_PUBLIC_FIXTURE
  # The build contract writes its generated inventory snapshots. Preserve the
  # exact pre-run tracked bytes so fixture evidence cannot contaminate the diff.
  $r2GeneratedPaths = @('generated/public-seo-inventory.json', 'generated/source-distribution-policy-snapshot.json')
  $r2GeneratedBefore = @{}
  foreach ($r2GeneratedPath in $r2GeneratedPaths) {
    $r2GeneratedBefore[$r2GeneratedPath] = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $r2GeneratedPath).Path)
  }
  try {
    Invoke-R2Section -Name 'OFFLINE_FIXTURE_BUILD' -Command 'pnpm.cmd' -CommandArgs @('build')
  } finally {
    foreach ($r2GeneratedPath in $r2GeneratedPaths) {
      [IO.File]::WriteAllBytes((Resolve-Path -LiteralPath $r2GeneratedPath).Path, $r2GeneratedBefore[$r2GeneratedPath])
    }
  }
  Invoke-R2Section -Name 'PRERENDER_ROUTING_REGRESSION' -Command 'pnpm.cmd' -CommandArgs @('exec', 'tsx', 'scripts/verify_prerender_universe_item31.ts')
  Invoke-R2Section -Name 'B2B_BROWSER_STATES' -Command 'pnpm.cmd' -CommandArgs @('exec', 'playwright', 'test', 'tests/visual/punto15-states.spec.ts', '--project=chromium-desktop')
  Write-Output 'RESULTS_BEGIN'
  $r2Results | ConvertTo-Json -Depth 4
  Write-Output 'RESULTS_END'
  Write-Output 'STOP: return the complete output. Do not apply SQL, commit, push or deploy on this result.'
  if (@($r2Results | Where-Object { $_.exit_code -ne 0 }).Count -gt 0) { exit 1 }
  Write-Output 'LOCAL PASS does not establish PostgreSQL transactionality, RLS, reconciliation, real provider, pilot-company or PROD validation.'
  exit 0
} catch {
  Write-Output 'STOP=OPERATOR_RUNTIME_OR_HARNESS_INCOMPATIBILITY'
  Write-Output $_.Exception.Message
  $r2Results | ConvertTo-Json -Depth 4
  exit 2
}
