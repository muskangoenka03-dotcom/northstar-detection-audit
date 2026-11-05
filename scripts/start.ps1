# One command: audit every request, then serve the API (8000) and the dashboard (3000).
# Usage: .\scripts\start.ps1            (add -SkipAudit to reuse code\results.json)
param([switch]$SkipAudit)
$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo
py -m pip install --quiet -r code\requirements.txt
if (-not $SkipAudit) { py code\run_audit.py }
Push-Location code\dashboard
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
if (-not (Test-Path node_modules)) { npm install }
if (-not (Test-Path .next\BUILD_ID)) { npm run build }
$api = Start-Process py -ArgumentList '-m', 'uvicorn', 'api:app', '--port', '8000' -WorkingDirectory "$repo\code" -PassThru
Write-Host "API on http://localhost:8000 (pid $($api.Id)); dashboard on http://localhost:3000"
npm run start
Pop-Location
