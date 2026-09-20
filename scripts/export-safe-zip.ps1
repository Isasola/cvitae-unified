param(
  [string]$Destination = (Join-Path (Get-Location) "cvitae-safe-export.zip")
)

$root = (Get-Location).Path
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("cvitae-safe-export-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $staging -Force | Out-Null
try {
  Get-ChildItem -LiteralPath $root -Force -Recurse | Where-Object {
    if ($_.PSIsContainer) { return $false }
    $relative = $_.FullName.Substring($root.Length).TrimStart('\').Replace('\', '/')
    $relative -notmatch '(^|/)(\.git|node_modules|dist|\.netlify|tmp|playwright-report|test-results|artifacts|fixtures|\.aider[^/]*|\.claude|\.superpowers|\.cvitae-release-hotfix|supabase/\.temp)(/|$)' -and
    $_.Name -ne '.env' -and $_.Name -notlike '.env.*' -and $_.Name -notlike '.aider*' -and
    $_.Name -notlike '*.zip' -and $_.Name -notlike '*-dryrun.txt'
  } | ForEach-Object {
    $relative = $_.FullName.Substring($root.Length).TrimStart('\')
    $target = Join-Path $staging $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $target -Force
  }
  if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force }
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $Destination -Force
  Write-Output "Safe export created: $Destination"
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force
}
