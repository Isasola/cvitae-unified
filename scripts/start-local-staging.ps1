$ErrorActionPreference = 'Stop'

function Import-SupabaseEnvironment {
  $statusLines = & npx.cmd supabase status -o env 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo obtener la configuración del Supabase local.'
  }

  $values = @{}
  foreach ($line in $statusLines) {
    if ($line -match '^([A-Z0-9_]+)="?(.*?)"?$') {
      $values[$matches[1]] = $matches[2].TrimEnd('"')
    }
  }

  foreach ($required in @('API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY')) {
    if (-not $values.ContainsKey($required)) {
      throw "Supabase local no devolvió $required."
    }
  }

  $env:VITE_SUPABASE_URL = $values.API_URL
  $env:VITE_SUPABASE_ANON_KEY = $values.ANON_KEY
  $env:SUPABASE_URL = $values.API_URL
  $env:SUPABASE_ANON_KEY = $values.ANON_KEY
  $env:SUPABASE_SERVICE_ROLE_KEY = $values.SERVICE_ROLE_KEY
  $env:CVITAE_LOCAL_STAGING = '1'
  $env:SITE_URL = 'http://127.0.0.1:8888'
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Desktop no está disponible. Abrilo y esperá hasta que indique que el motor está activo.'
}

& npx.cmd supabase start
if ($LASTEXITCODE -ne 0) {
  throw 'No se pudo iniciar Supabase local. Revisá el error de migraciones mostrado arriba.'
}

Import-SupabaseEnvironment

Write-Host ''
Write-Host 'CVitae staging local' -ForegroundColor Yellow
Write-Host 'Aplicación:       http://127.0.0.1:8888'
Write-Host 'Supabase Studio:  http://127.0.0.1:54323'
Write-Host 'Correos locales:  http://127.0.0.1:54324'
Write-Host 'Los correos quedan capturados localmente y no se envían a usuarios reales.'
Write-Host ''

& netlify.cmd dev --port 8888
exit $LASTEXITCODE
