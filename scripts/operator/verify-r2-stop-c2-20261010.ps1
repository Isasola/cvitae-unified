[CmdletBinding()]
param()

# STOP C2 LOCAL verification only. No SQL, migration, build, test suite,
# network, push or deploy is executed by this harness.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$stopC2Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$stopC2ExpectedRoot = 'C:\Users\isaso\cvitae-b2c-r2-20261008'
$stopC2ExpectedHead = '5add212ce2d4f9a39f784b10ddd50bc03f1ba87f'
$stopC2Results = [System.Collections.Generic.List[object]]::new()

function Invoke-StopC2Section {
  param([string]$Name, [string]$Command, [string[]]$CommandArgs)
  Write-Output "SECTION=$Name"
  & $Command @CommandArgs
  $stopC2Exit = $LASTEXITCODE
  [void]$stopC2Results.Add([pscustomobject]@{ section = $Name; exit_code = $stopC2Exit })
  Write-Output "SECTION_EXIT=$stopC2Exit"
}

try {
  if ($stopC2Root.TrimEnd('\') -ne $stopC2ExpectedRoot) { throw 'STOP: wrong R2 worktree.' }
  Set-Location -LiteralPath $stopC2Root
  $stopC2Branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC2Branch -ne 'work/b2c-r2-20261008') { throw 'STOP: branch mismatch.' }
  $stopC2Head = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC2Head -ne $stopC2ExpectedHead) { throw 'STOP: HEAD differs from reviewed STOP C1 commit.' }
  $stopC2Node = (& node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC2Node -ne 'v24.21.0') { throw 'STOP: Node v24.21.0 required; no auto-install.' }
  $stopC2Pnpm = (& pnpm.cmd --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC2Pnpm -ne '11.8.0') { throw 'STOP: pnpm 11.8.0 required; no auto-install.' }

  Write-Output "CHECKPOINT=$stopC2Head NODE=$stopC2Node PNPM=$stopC2Pnpm"
  Write-Output 'MODE=LOCAL_STATIC_AND_FIXTURE; PostgreSQL metadata and SQL artifacts are not executed.'
  Invoke-StopC2Section -Name 'DIFF_WHITESPACE' -Command 'git' -CommandArgs @('-c', 'core.safecrlf=false', 'diff', '--check')
  Invoke-StopC2Section -Name 'STOP_C2_ARTIFACT_CONTRACTS' -Command 'node' -CommandArgs @('scripts/verify-r2-stop-c1-artifacts.mjs')
  Invoke-StopC2Section -Name 'STOP_C2_CHANGED_PATHS' -Command 'git' -CommandArgs @('status', '--short')
  Write-Output 'RESULTS_BEGIN'
  $stopC2Results | ConvertTo-Json -Depth 4
  Write-Output 'RESULTS_END'
  if (@($stopC2Results | Where-Object { $_.exit_code -ne 0 }).Count -gt 0) {
    Write-Output 'STOP=LOCAL_STOP_C2_VALIDATION_FAILED'
    exit 1
  }
  Write-Output 'EXPECTED_RESULT=3/3 sections exit 0; R2_STOP_C2_LOCAL_ARTIFACTS PASS; existing_mirrors_before=0; compensable_new_inserts=5.'
  Write-Output 'STOP=RETURN_COMPLETE_OUTPUT_AND_DO_NOT_RUN_SUPABASE_WRITE'
  exit 0
} catch {
  Write-Output 'STOP=OPERATOR_RUNTIME_OR_CHECKPOINT_MISMATCH'
  Write-Output $_.Exception.Message
  $stopC2Results | ConvertTo-Json -Depth 4
  exit 2
}
