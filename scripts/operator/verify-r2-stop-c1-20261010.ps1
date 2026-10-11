[CmdletBinding()]
param()

# STOP C1 LOCAL artifact verification only.
# No SQL, migration, build, test suite, network, push or deploy is executed.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$stopC1Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$stopC1ExpectedRoot = 'C:\Users\isaso\cvitae-b2c-r2-20261008'
$stopC1ExpectedHead = '853c9d019f918bdd1e5fc8a7f07995be7dab144d'
$stopC1Results = [System.Collections.Generic.List[object]]::new()

function Invoke-StopC1Section {
  param([string]$Name, [string]$Command, [string[]]$CommandArgs)
  Write-Output "SECTION=$Name"
  & $Command @CommandArgs
  $stopC1Exit = $LASTEXITCODE
  [void]$stopC1Results.Add([pscustomobject]@{ section = $Name; exit_code = $stopC1Exit })
  Write-Output "SECTION_EXIT=$stopC1Exit"
}

try {
  if ($stopC1Root.TrimEnd('\') -ne $stopC1ExpectedRoot) { throw 'STOP: wrong R2 worktree.' }
  Set-Location -LiteralPath $stopC1Root
  $stopC1Branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC1Branch -ne 'work/b2c-r2-20261008') { throw 'STOP: branch mismatch.' }
  $stopC1Head = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC1Head -ne $stopC1ExpectedHead) { throw 'STOP: HEAD differs from closed STOP B checkpoint.' }
  $stopC1TagHead = (& git rev-list -n 1 checkpoint/r2-stopb-20261010).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC1TagHead -ne $stopC1ExpectedHead) { throw 'STOP: STOP B tag does not identify expected checkpoint.' }
  $stopC1Node = (& node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC1Node -ne 'v24.21.0') { throw 'STOP: Node v24.21.0 required; no auto-install.' }
  $stopC1Pnpm = (& pnpm.cmd --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $stopC1Pnpm -ne '11.8.0') { throw 'STOP: pnpm 11.8.0 required; no auto-install.' }

  Write-Output "CHECKPOINT=$stopC1Head TAG=checkpoint/r2-stopb-20261010 NODE=$stopC1Node PNPM=$stopC1Pnpm"
  Write-Output 'MODE=LOCAL_READ_ONLY_VALIDATION; SQL files are inspected as text and are not executed.'
  Invoke-StopC1Section -Name 'DIFF_WHITESPACE' -Command 'git' -CommandArgs @('-c', 'core.safecrlf=false', 'diff', '--check')
  Invoke-StopC1Section -Name 'STOP_C1_ARTIFACT_CONTRACTS' -Command 'node' -CommandArgs @('scripts/verify-r2-stop-c1-artifacts.mjs')
  # status --short includes the three newly prepared artifacts that an ordinary
  # git diff --name-status would omit until they are tracked.
  Invoke-StopC1Section -Name 'STOP_C1_CHANGED_PATHS' -Command 'git' -CommandArgs @('status', '--short')
  Write-Output 'RESULTS_BEGIN'
  $stopC1Results | ConvertTo-Json -Depth 4
  Write-Output 'RESULTS_END'
  if (@($stopC1Results | Where-Object { $_.exit_code -ne 0 }).Count -gt 0) {
    Write-Output 'STOP=LOCAL_ARTIFACT_VALIDATION_FAILED'
    exit 1
  }
  Write-Output 'EXPECTED_RESULT=3/3 sections exit 0; verifier reports 8 total, 5 reconcilable, 3 OWNER_MISSING, publication_authorized=false.'
  Write-Output 'STOP=RETURN_COMPLETE_OUTPUT_BEFORE_ANY_SUPABASE_WRITE'
  exit 0
} catch {
  Write-Output 'STOP=OPERATOR_RUNTIME_OR_CHECKPOINT_MISMATCH'
  Write-Output $_.Exception.Message
  $stopC1Results | ConvertTo-Json -Depth 4
  exit 2
}
