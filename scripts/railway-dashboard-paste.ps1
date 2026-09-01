# Railway dashboard paste helper (no secrets in git).
# Source of truth: .env.railway (gitignored) in repo root.
# Usage: powershell -File scripts/railway-dashboard-paste.ps1
#
# Railway → service → Variables → Raw Editor → paste output → Update Variables → Redeploy.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $root ".env.railway"

if (-not (Test-Path $envFile)) {
  Write-Error ".env.railway not found at $envFile"
}

$lines = Get-Content $envFile | Where-Object {
  $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*=' -and $_ -notmatch '^\s*#'
}

Write-Host ""
Write-Host "=== Copy everything below into Railway Raw Editor ===" -ForegroundColor Cyan
Write-Host ""
foreach ($line in $lines) {
  Write-Host $line
}
Write-Host ""
Write-Host "=== End ===" -ForegroundColor Cyan
Write-Host "Then click Update Variables and Redeploy." -ForegroundColor Yellow
