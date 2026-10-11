[CmdletBinding()]
param()

# STOP C3 LOCAL validation only. This harness runs no SQL, migration, build,
# network request, push or deploy.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$stopC3Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$stopC3ExpectedRoot = 'C:\Users\isaso\cvitae-b2c-r2-20261008'
$stopC3ExpectedHead = 'd6a5442da0f021ac8644b4833238ed8aceea23ca'
$stopC3Results = [System.Collections.Generic.List[object]]::new()

function Invoke-StopC3Section {
  param([string]$Name, [string]$Command, [string[]]$CommandArgs)
  Write-Output "SECTION=$Name"
  & $Command @CommandArgs
  $stopC3Exit = $LASTEXITCODE
  [void]$stopC3Results.Add([pscustomobject]@{ section = $Name; exit_code = $stopC3Exit })
  Write-Output "SECTION_EXIT=$stopC3Exit"
}

try {
  if ($stopC3Root.TrimEnd('\') -ne $stopC3ExpectedRoot) { throw 'STOP: wrong R2 worktree.' }
  Set-Location -LiteralPath $stopC3Root
  $stopC3Branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC3Branch -ne 'work/b2c-r2-20261008') { throw 'STOP: branch mismatch.' }
  $stopC3Head = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC3Head -ne $stopC3ExpectedHead) { throw 'STOP: HEAD differs from d6a5442d.' }
  $stopC3Node = (& node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC3Node -ne 'v24.21.0') { throw 'STOP: Node v24.21.0 required; no auto-install.' }
  $stopC3Pnpm = (& pnpm.cmd --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC3Pnpm -ne '11.8.0') { throw 'STOP: pnpm 11.8.0 required; no auto-install.' }

  Write-Output "CHECKPOINT=$stopC3Head NODE=$stopC3Node PNPM=$stopC3Pnpm"
  Write-Output 'MODE=LOCAL_STATIC_AND_FIXTURE; SQL artifacts are inspected but not executed.'
  Invoke-StopC3Section -Name 'DIFF_WHITESPACE' -Command 'git' -CommandArgs @('-c', 'core.safecrlf=false', 'diff', '--check')
  Invoke-StopC3Section -Name 'STOP_C3_LIFECYCLE_COUNTRY_CONTRACTS' -Command 'node' -CommandArgs @('scripts/verify-r2-stop-c3-lifecycle-country.mjs')
  Invoke-StopC3Section -Name 'STOP_C3_CHANGED_PATHS' -Command 'git' -CommandArgs @('status', '--short')
  Write-Output 'RESULTS_BEGIN'
  $stopC3Results | ConvertTo-Json -Depth 4
  Write-Output 'RESULTS_END'
  if (@($stopC3Results | Where-Object { $_.exit_code -ne 0 }).Count -gt 0) {
    Write-Output 'STOP=LOCAL_STOP_C3_VALIDATION_FAILED'
    exit 1
  }
  Write-Output 'EXPECTED_RESULT=3/3 sections exit 0; R2_STOP_C3_LIFECYCLE_COUNTRY_LOCAL PASS; existing_mirrors=5; inferred_country_after=0.'
  Write-Output 'STOP=RETURN_COMPLETE_OUTPUT_AND_DO_NOT_RUN_SUPABASE_WRITE'
  exit 0
} catch {
  Write-Output 'STOP=OPERATOR_RUNTIME_OR_CHECKPOINT_MISMATCH'
  Write-Output $_.Exception.Message
  $stopC3Results | ConvertTo-Json -Depth 4
  exit 2
}
