# One command: audit every request, then serve the API (8000) and the dashboard (3000).
# Usage: .\start.ps1            (add -SkipAudit to reuse backend\results.json)
param([switch]$SkipAudit)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
py -m pip install --quiet -r backend\requirements.txt
if (-not $SkipAudit) { Push-Location backend; py run_audit.py; Pop-Location }
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
if (-not (Test-Path node_modules)) { npm install }
if (-not (Test-Path .next\BUILD_ID)) { npm run build }
$api = Start-Process py -ArgumentList '-m', 'uvicorn', 'api:app', '--port', '8000' -WorkingDirectory backend -PassThru
Write-Host "API on http://localhost:8000 (pid $($api.Id)); dashboard on http://localhost:3000"
npm run start
