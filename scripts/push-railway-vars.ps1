# Push variables from .env.railway to Railway (gitignored file with secrets).
# Prereq: npx @railway/cli login  (once), then railway link to lexzim-production service.
# Usage: powershell -File scripts/push-railway-vars.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $root ".env.railway"

if (-not (Test-Path $envFile)) {
  Write-Error ".env.railway not found. Copy from docs/RAILWAY.md variable list."
}

$lines = Get-Content $envFile | Where-Object {
  $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*=' -and $_ -notmatch '^\s*#'
}

if (-not $lines.Count) {
  Write-Error "No variables found in .env.railway"
}

Write-Host "Setting $($lines.Count) Railway variables from .env.railway ..."

foreach ($line in $lines) {
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { continue }
  $name = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  Write-Host "  $name"
  npx --yes @railway/cli variables set "${name}=$value"
}

Write-Host "Done. Redeploy the service in Railway if variables changed."
npx --yes @railway/cli redeploy -y
