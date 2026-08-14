$ErrorActionPreference = 'Stop'

& npx.cmd supabase stop
if ($LASTEXITCODE -ne 0) {
  throw 'No se pudo detener Supabase local.'
}

Write-Host 'CVitae staging local detenido. Los volúmenes locales se conservaron.' -ForegroundColor Yellow
