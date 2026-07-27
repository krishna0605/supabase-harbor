$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
  throw "Supabase Harbor 0.1.0 supports Windows 10/11."
}

$nodeVersion = node --version
if (-not $nodeVersion.StartsWith("v24.")) {
  throw "Node.js 24.x LTS is required. Found $nodeVersion."
}

git --version | Out-Null
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run db:migrate
npx tsx .\scripts\init-database.ts

Write-Host ""
Write-Host "Supabase Harbor is ready." -ForegroundColor Green
Write-Host "Daily start: .\harbor.ps1"
