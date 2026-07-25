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

$dataDir = if ($env:HARBOR_DATA_DIR) {
  $env:HARBOR_DATA_DIR
} elseif ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "SupabaseHarbor"
} else {
  throw "LOCALAPPDATA is unavailable."
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$acl = Get-Acl -LiteralPath $dataDir
$acl.SetAccessRuleProtection($true, $false)
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  $identity,
  "FullControl",
  "ContainerInherit,ObjectInherit",
  "None",
  "Allow"
)
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $dataDir -AclObject $acl

npx tsx .\scripts\init-database.ts

Write-Host ""
Write-Host "Supabase Harbor is ready." -ForegroundColor Green
Write-Host "Daily start: .\harbor.ps1"

