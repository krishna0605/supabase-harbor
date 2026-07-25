$ErrorActionPreference = "Stop"

$port = if ($env:HARBOR_PORT) { [int]$env:HARBOR_PORT } else { 47832 }
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
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri "$origin/api/healthz" -TimeoutSec 1
      if ($health.data.ready) { break }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $health.data.ready) { throw "Health check failed." }

  $listeners = Get-NetTCPConnection -State Listen -LocalPort $port
  $unsafe = $listeners | Where-Object { $_.LocalAddress -notin @("127.0.0.1", "::1") }
  if ($unsafe) { throw "Harbor is listening on a non-loopback interface." }

  try {
    Invoke-WebRequest -Uri $origin -Headers @{ Host = "harbor.invalid" } -UseBasicParsing | Out-Null
    throw "Host header protection did not reject a hostile host."
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 421) { throw }
  }

  Write-Host "Loopback health, binding, and Host protection checks passed." -ForegroundColor Green
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id
  }
}
