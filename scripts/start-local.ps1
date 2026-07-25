$ErrorActionPreference = "Stop"

$port = if ($env:HARBOR_PORT) { [int]$env:HARBOR_PORT } else { 47832 }
if ($port -lt 1024 -or $port -gt 65535) {
  throw "HARBOR_PORT must be between 1024 and 65535."
}

$occupied = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($occupied) {
  throw "Port $port is already in use. Set HARBOR_PORT to another local port."
}

$origin = "http://127.0.0.1:$port"
$repoRoot = Split-Path $PSScriptRoot -Parent
$nextCli = Join-Path $repoRoot "node_modules\next\dist\bin\next"
$server = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList @($nextCli, "start", "--hostname", "127.0.0.1", "--port", "$port") `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -PassThru

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri "$origin/api/healthz" -TimeoutSec 1
      if ($health.data.ready) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $ready) {
    throw "Harbor did not become ready at $origin."
  }

  Write-Host "Supabase Harbor is running at $origin" -ForegroundColor Green
  Write-Host "Press Ctrl+C to stop. Logs are stored under LOCALAPPDATA\SupabaseHarbor\logs."
  Start-Process $origin
  Wait-Process -Id $server.Id
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id
  }
}
