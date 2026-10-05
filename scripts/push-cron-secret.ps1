# Push only CRON_SECRET from .env.railway to Railway, then print test curls.
# Prereq: npx @railway/cli login && railway link (lexzim-production)
# Usage: powershell -File scripts/push-cron-secret.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $root ".env.railway"
$handoff = Join-Path $root "ops-calendar-cron-handoff.md"

if (-not (Test-Path $envFile)) {
  Write-Error ".env.railway not found."
}

$line = Get-Content $envFile | Where-Object { $_ -match '^\s*CRON_SECRET=' } | Select-Object -First 1
if (-not $line) {
  Write-Error "CRON_SECRET missing from .env.railway. Re-run generation or add it manually."
}

$idx = $line.IndexOf("=")
$secret = $line.Substring($idx + 1).Trim().Trim('"')
if ($secret.Length -lt 16) {
  Write-Error "CRON_SECRET looks too short."
}

$appUrl = "https://lexzim-production.up.railway.app"
$urlLine = Get-Content $envFile | Where-Object { $_ -match '^\s*NEXT_PUBLIC_APP_URL=' } | Select-Object -First 1
if ($urlLine) {
  $uIdx = $urlLine.IndexOf("=")
  $appUrl = $urlLine.Substring($uIdx + 1).Trim().Trim('"').TrimEnd('/')
}

Write-Host "Setting CRON_SECRET on Railway..."
npx --yes @railway/cli variables set "CRON_SECRET=$secret"
Write-Host "Redeploying..."
npx --yes @railway/cli redeploy -y

Write-Host ""
Write-Host "=== After deploy finishes, test with: ===" -ForegroundColor Cyan
Write-Host "curl -X GET `"$appUrl/api/cron/calendar-event-emails?forceSlot=day_of`" -H `"Authorization: Bearer $secret`""
Write-Host ""
Write-Host "Schedule one daily HTTP job to:" -ForegroundColor Cyan
Write-Host "  $appUrl/api/cron/calendar-event-emails"
Write-Host "  Header: Authorization: Bearer <CRON_SECRET>"
Write-Host "  06:00 UTC (08:00 Harare, day of the event only)"
Write-Host ""
if (Test-Path $handoff) {
  Write-Host "Full copy-paste handoff: $handoff" -ForegroundColor Yellow
}
